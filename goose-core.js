// 抓大鹅: the rules behind the 3D pile, kept free of three.js and physics so Node
// can test them. The view owns where things are; this module owns what may happen.
//
// An item lives in exactly one place: `pile` (in the bowl, tappable) or `tray`
// (one of the seven slots). A tray entry is 'flying' while it travels to its slot,
// 'resting' once it sits there, and 'matching' while its triple pops. Matches are
// only judged on landing, so a triple never vanishes before the player sees it arrive.
export const GOOSE = {
  TRAY: 7,
  ITEMS: 99,
  TYPES: 12,
  // 无尽模式: a minute on the clock, two more seconds per triple, and ten fresh
  // triples tipped into the bowl whenever it runs low.
  ENDLESS_TIME: 60,
  MATCH_BONUS: 2,
  REFILL_BELOW: 40,
  REFILL_TRIPLES: 10
};
export const GOOSE_MODES = ['classic', 'endless'];

function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}
function shuffle(state, list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random(state) * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// Whole triples only, dealt round-robin so every type appears and none dominates.
export function gooseDeck(state, count, types) {
  const triples = Math.floor(count / 3), deck = [];
  for (let i = 0; i < triples; i += 1) deck.push(i % types, i % types, i % types);
  return shuffle(state, deck);
}
function addToPile(state, typeList) {
  const added = typeList.map(type => ({ id: state.nextId++, type }));
  state.pile.push(...added);
  return added;
}

export function createGoose(mode = 'classic', seed = Date.now(), options = {}) {
  const items = Math.max(3, Math.floor((options.items ?? GOOSE.ITEMS) / 3) * 3);
  const state = {
    mode: GOOSE_MODES.includes(mode) ? mode : 'classic',
    rng: seed >>> 0 || 1,
    types: options.types ?? GOOSE.TYPES,
    phase: 'playing',
    pile: [],
    tray: [],
    nextId: 1,
    picked: 0,
    cleared: 0,
    elapsed: 0,
    timeLeft: GOOSE.ENDLESS_TIME
  };
  addToPile(state, gooseDeck(state, items, state.types));
  return state;
}

export const gooseCanPick = (state) => state.phase === 'playing' && state.tray.length < GOOSE.TRAY;

// Same types sit together, so a pair waiting for its third is easy to spot.
function slotFor(state, type) {
  let at = state.tray.length;
  for (let i = state.tray.length - 1; i >= 0; i -= 1) if (state.tray[i].type === type) { at = i + 1; break; }
  return at;
}

// Moves a pile item into the tray. Returns its slot, or -1 when the tray is full
// or the item is no longer in the bowl. In 无尽模式 the bowl may be topped up,
// in which case the new items are returned in `added` for the view to drop in.
export function pickGoose(state, id) {
  if (!gooseCanPick(state)) return { slot: -1, added: [] };
  const index = state.pile.findIndex(item => item.id === id);
  if (index < 0) return { slot: -1, added: [] };
  const [item] = state.pile.splice(index, 1), slot = slotFor(state, item.type);
  state.tray.splice(slot, 0, { id: item.id, type: item.type, status: 'flying' });
  state.picked += 1;
  let added = [];
  if (state.mode === 'endless' && state.pile.length < GOOSE.REFILL_BELOW) {
    const types = Array.from({ length: GOOSE.REFILL_TRIPLES }, () => Math.floor(random(state) * state.types));
    added = addToPile(state, shuffle(state, types.flatMap(type => [type, type, type])));
  }
  return { slot, added };
}

// The item has reached its slot. Returns the ids of a triple it completed (now
// 'matching'), or an empty list; the round may end here if the tray is jammed.
export function landGoose(state, id) {
  const item = state.tray.find(entry => entry.id === id);
  if (!item || item.status !== 'flying') return [];
  item.status = 'resting';
  const same = state.tray.filter(entry => entry.status === 'resting' && entry.type === item.type);
  if (same.length >= 3) {
    const triple = same.slice(0, 3);
    for (const entry of triple) entry.status = 'matching';
    return triple.map(entry => entry.id);
  }
  settle(state);
  return [];
}

// The triple's pop animation has finished: free its slots.
export function clearGoose(state, ids) {
  const gone = new Set(ids), before = state.tray.length;
  state.tray = state.tray.filter(entry => !(gone.has(entry.id) && entry.status === 'matching'));
  const removed = before - state.tray.length;
  state.cleared += removed;
  if (state.mode === 'endless' && state.phase === 'playing') state.timeLeft += (removed / 3) * GOOSE.MATCH_BONUS;
  settle(state);
}

function settle(state) {
  if (state.phase !== 'playing') return;
  if (state.mode === 'classic' && state.pile.length === 0 && state.tray.length === 0) state.phase = 'won';
  else if (state.tray.length >= GOOSE.TRAY && state.tray.every(entry => entry.status === 'resting')) state.phase = 'over';
}

export function tickGoose(state, dt) {
  if (state.phase !== 'playing') return;
  state.elapsed += dt;
  if (state.mode === 'endless') {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    if (state.timeLeft === 0) state.phase = 'over';
  }
}
