// 倒水排序: the rules. No DOM, no timers — pour.js plays the events back.
//
// Tubes hold up to CAP layers of coloured liquid, listed bottom to top. Tapping one tube and
// then another pours the run of same-coloured liquid on top of the first into the second, as
// much of it as fits; the target must be empty or have the same colour on top. A tube that
// ends up full of one colour is sealed and shelved (score) and takes no more liquid.
// You win when everything is shelved.
//
// Levels are solved offline with the A* below (`generateLevel`), which proves they can be won
// and records `par`, the shortest solution found. `casualFailRate` plays a level with a
// short-sighted player to rate how hard it really is.

export const POUR = {
  CAP: 4,
  PER_TUBE: 10, // score per sealed tube
  STAR_BONUS: [100, 200, 300], // stage bonus for 1, 2, 3 stars
  UNDO: 3,
  ADD_TUBE: 1,
  SHUFFLE: 1
};
export const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan', 'brown', 'lime'];
// colors: how many of COLORS; empty: spare tubes at the start; fail: the band the level's
// `casualFailRate` must land in; minPar: the shortest solution allowed (the casual player is
// stuck every time from stage 9 on, so the step count keeps those stages climbing). The first two stages are a stroll; then more colours add
// difficulty a little at a time on two spare tubes, and from stage 7 on there is only one
// spare, which is a different game: each pour has to be planned.
export const LEVELS = [
  { colors: 3, empty: 2, fail: [0, 0] },
  { colors: 4, empty: 2, fail: [0, 0] },
  { colors: 5, empty: 2, fail: [0.05, 0.2] },
  { colors: 6, empty: 2, fail: [0.2, 0.4] },
  { colors: 7, empty: 2, fail: [0.35, 0.55], minPar: 22 },
  { colors: 8, empty: 2, fail: [0.55, 0.75], minPar: 25 },
  { colors: 5, empty: 1, fail: [0.55, 0.8], minPar: 15 },
  { colors: 6, empty: 1, fail: [0.75, 0.95], minPar: 18 },
  { colors: 7, empty: 1, fail: [0.9, 1], minPar: 21 },
  { colors: 8, empty: 1, fail: [0.95, 1], minPar: 24 },
  { colors: 9, empty: 1, fail: [1, 1], minPar: 27 },
  { colors: 10, empty: 1, fail: [1, 1], minPar: 30 }
];
export const STAGES = LEVELS.length;

function makeRng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffleInPlace(rng, list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// The run of same-coloured liquid on top of a tube, or null for an empty one.
export function topRun(tube) {
  if (!tube.length) return null;
  const color = tube[tube.length - 1];
  let len = 1;
  while (len < tube.length && tube[tube.length - 1 - len] === color) len += 1;
  return { color, len };
}
const isSealable = (tube, cap) => tube.length === cap && tube.every((c) => c === tube[0]);

// ---- moves on bare tube lists (null = a sealed tube, which nothing touches) ----

// Every sensible move. Pouring a tube that is already all one colour into an empty tube
// changes nothing, and two empty tubes are interchangeable, so neither is listed.
export function movesOf(tubes, cap = POUR.CAP) {
  const moves = [];
  for (let from = 0; from < tubes.length; from += 1) {
    const source = tubes[from];
    if (!source || !source.length) continue;
    const run = topRun(source);
    let emptyTried = false;
    for (let to = 0; to < tubes.length; to += 1) {
      const target = tubes[to];
      if (to === from || !target || target.length >= cap) continue;
      if (!target.length) {
        if (emptyTried || source.length === run.len) continue;
        emptyTried = true;
        moves.push({ from, to, count: run.len });
      } else if (target[target.length - 1] === run.color) {
        moves.push({ from, to, count: Math.min(run.len, cap - target.length) });
      }
    }
  }
  return moves;
}
// A copy of the tubes after one move; a tube it fills with one colour is sealed (null).
function applyMove(tubes, move, cap) {
  const next = tubes.map((t) => (t ? t.slice() : null));
  const color = next[move.from][next[move.from].length - 1];
  for (let i = 0; i < move.count; i += 1) {
    next[move.from].pop();
    next[move.to].push(color);
  }
  const sealed = isSealable(next[move.to], cap);
  if (sealed) next[move.to] = null;
  return { tubes: next, sealed };
}
const isCleared = (tubes) => tubes.every((t) => !t || t.length === 0);
const keyOf = (tubes) => tubes.filter((t) => t && t.length).map((t) => t.map((c) => String.fromCharCode(65 + c)).join('')).sort().join('|');
// Colour boundaries inside tubes. One pour removes at most one, so it never overestimates.
function boundaries(tubes) {
  let n = 0;
  for (const t of tubes) {
    if (!t) continue;
    for (let i = 1; i < t.length; i += 1) if (t[i] !== t[i - 1]) n += 1;
  }
  return n;
}

class MinHeap {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  push(item) {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.less(a[p], a[i])) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  less(x, y) { return x.f < y.f || (x.f === y.f && x.h < y.h); }
}

// A* over the tubes. weight 1 finds the shortest solution; a bigger weight finds some solution
// much sooner, a bit longer. Returns { ok, moves: [{from, to, count}], nodes, exact } or
// { ok: false, capped } when it gave up (capped) or the position cannot be won.
export function solve(tubes, { cap = POUR.CAP, maxNodes = 200000, weight = 1 } = {}) {
  const start = tubes.map((t) => (t ? t.slice() : null));
  if (isCleared(start)) return { ok: true, moves: [], nodes: 0, exact: true };
  const heap = new MinHeap();
  const best = new Map();
  const h0 = boundaries(start);
  heap.push({ f: weight * h0, h: h0, g: 0, tubes: start, parent: null, move: null });
  best.set(keyOf(start), 0);
  let nodes = 0;
  while (heap.size) {
    const node = heap.pop();
    if (best.get(keyOf(node.tubes)) < node.g) continue;
    if (isCleared(node.tubes)) {
      const moves = [];
      for (let n = node; n.parent; n = n.parent) moves.push(n.move);
      return { ok: true, moves: moves.reverse(), nodes, exact: weight === 1 };
    }
    nodes += 1;
    if (nodes > maxNodes) return { ok: false, capped: true, nodes };
    for (const move of movesOf(node.tubes, cap)) {
      const { tubes: next } = applyMove(node.tubes, move, cap);
      const key = keyOf(next);
      const g = node.g + 1;
      if (best.has(key) && best.get(key) <= g) continue;
      best.set(key, g);
      const h = boundaries(next);
      heap.push({ f: g + weight * h, h, g, tubes: next, parent: node, move: { from: move.from, to: move.to, count: move.count } });
    }
  }
  return { ok: false, capped: false, nodes };
}

// ---- levels ----

// A level definition: { stage, seed, tubes, par, exact, fail }. The tubes are the opening
// position; `par` is the solver's step count (exact when the search ran to the end, otherwise
// a close upper bound); `fail` is its casualFailRate. The same (stage, seed) always gives the
// same level. It deals again until the solver says the deal can be won and the casual player's
// failure rate falls in the stage's band — with one spare tube only 1–4% of random deals can be
// won, but unwinnable deals are refuted in a millisecond, so even stage 12 takes a second or two.
// That is why the game ships the finished levels (pour-levels.js) instead of making them live.
export function generateLevel(stage, seed, { attempts = 30000 } = {}) {
  const { colors, empty, fail: band, minPar = colors } = LEVELS[stage - 1];
  const rng = makeRng(seed * 7919 + stage);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const cells = [];
    for (let c = 0; c < colors; c += 1) for (let i = 0; i < POUR.CAP; i += 1) cells.push(c);
    shuffleInPlace(rng, cells);
    const tubes = [];
    for (let t = 0; t < colors; t += 1) tubes.push(cells.slice(t * POUR.CAP, (t + 1) * POUR.CAP));
    for (let t = 0; t < empty; t += 1) tubes.push([]);
    if (tubes.some((t) => isSealable(t, POUR.CAP))) continue;
    let result = solve(tubes, { maxNodes: 40000 });
    if (!result.ok && result.capped) result = solve(tubes, { maxNodes: 150000, weight: 3 });
    if (!result.ok || result.moves.length < minPar) continue;
    const par = result.moves.length;
    const fail = casualFailRate({ tubes, par }, { runs: 20, seed: 1 });
    if (fail < band[0] || fail > band[1]) continue;
    return { stage, seed, tubes, par, exact: result.exact, fail };
  }
  throw new Error(`no level for stage ${stage} seed ${seed}`);
}

// How a short-sighted player rates a pour: landing on a tube that is all one colour is best,
// leaving the source tidy is good, putting liquid into an empty tube is a last resort, and
// undoing the move just made is never worth it.
function casualScore(tubes, move, last) {
  const target = tubes[move.to];
  const source = tubes[move.from];
  let score = 0;
  if (target.length && target.every((c) => c === target[0])) score += 3;
  else if (target.length) score += 1;
  else score -= 1;
  const left = source.slice(0, source.length - move.count);
  if (!left.length || left.every((c) => c === left[0])) score += 1;
  if (last && last.from === move.to && last.to === move.from) score -= 10;
  return score;
}

// Play a level with a player who only looks one move ahead (best `casualScore`, ties at
// random). The share of runs that get stuck or wander past a move budget is the difficulty
// score: 0 means luck wins, 1 means you have to plan.
export function casualFailRate(def, { runs = 40, seed = 1 } = {}) {
  const rng = makeRng(seed);
  const budget = def.par * 4 + 30;
  let failed = 0;
  for (let run = 0; run < runs; run += 1) {
    let tubes = def.tubes.map((t) => t.slice());
    let last = null;
    let won = false;
    for (let step = 0; step < budget; step += 1) {
      if (isCleared(tubes)) { won = true; break; }
      const moves = movesOf(tubes, POUR.CAP);
      if (!moves.length) break;
      const scored = moves.map((m) => ({ m, s: casualScore(tubes, m, last) + rng() * 0.5 }));
      const { m } = scored.reduce((a, b) => (b.s > a.s ? b : a));
      tubes = applyMove(tubes, m, POUR.CAP).tubes;
      last = m;
    }
    if (!won && !isCleared(tubes)) failed += 1;
  }
  return failed / runs;
}

// ---- a game in progress ----

export function createState(def) {
  return {
    stage: def.stage, seed: def.seed, cap: POUR.CAP, par: def.par,
    tubes: def.tubes.map((t) => t.slice()),
    sealed: def.tubes.map(() => false),
    collected: [], // colours shelved so far, in order
    moves: 0, shuffles: 0,
    history: [],
    left: { undo: POUR.UNDO, add: POUR.ADD_TUBE, shuffle: POUR.SHUFFLE }
  };
}
export const createLevel = (stage, seed) => createState(generateLevel(stage, seed));

const solverTubes = (state) => state.tubes.map((t, i) => (state.sealed[i] ? null : t));
export const legalMoves = (state) => movesOf(solverTubes(state), state.cap);
export const propsUsed = (state) =>
  POUR.UNDO - state.left.undo + (POUR.ADD_TUBE - state.left.add) + (POUR.SHUFFLE - state.left.shuffle);

function snapshot(state) {
  state.history.push({ tubes: state.tubes.map((t) => t.slice()), sealed: state.sealed.slice(), collected: state.collected.slice(), moves: state.moves });
}

// Pour tube `from` into tube `to`. Mutates the state; the events say what happened for the view.
export function pour(state, from, to) {
  const { tubes, sealed } = state;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || !tubes[from] || !tubes[to]) return { ok: false, reason: 'bad-tube' };
  if (sealed[from] || sealed[to]) return { ok: false, reason: 'sealed' };
  const source = tubes[from];
  const target = tubes[to];
  if (!source.length) return { ok: false, reason: 'empty' };
  const run = topRun(source);
  if (target.length >= state.cap) return { ok: false, reason: 'full' };
  if (target.length && target[target.length - 1] !== run.color) return { ok: false, reason: 'color' };
  snapshot(state);
  const count = Math.min(run.len, state.cap - target.length);
  for (let i = 0; i < count; i += 1) {
    source.pop();
    target.push(run.color);
  }
  state.moves += 1;
  const events = [{ type: 'pour', from, to, count, color: run.color }];
  if (isSealable(target, state.cap)) {
    sealed[to] = true;
    target.length = 0;
    state.collected.push(run.color);
    events.push({ type: 'seal', tube: to, color: run.color });
  }
  return { ok: true, count, color: run.color, events };
}

// Take back the last pour (or shuffle). Costs one of the level's undos.
export function undo(state) {
  if (state.left.undo <= 0) return { ok: false, reason: 'none-left' };
  const snap = state.history.pop();
  if (!snap) return { ok: false, reason: 'nothing' };
  // Tubes added after the snapshot were empty then, so they come back empty.
  const extra = state.tubes.length - snap.tubes.length;
  state.tubes = snap.tubes.concat(Array.from({ length: extra }, () => []));
  state.sealed = snap.sealed.concat(Array(extra).fill(false));
  state.collected = snap.collected;
  state.moves = snap.moves;
  state.left.undo -= 1;
  return { ok: true, events: [{ type: 'undo' }] };
}

// One more empty tube.
export function addTube(state) {
  if (state.left.add <= 0) return { ok: false, reason: 'none-left' };
  state.tubes.push([]);
  state.sealed.push(false);
  state.left.add -= 1;
  return { ok: true, events: [{ type: 'addTube', tube: state.tubes.length - 1 }] };
}

// Re-deal the liquid in the tubes that are still open, keeping how full each one is. The new
// deal must still be winnable, so it is checked and re-rolled; if no deal works nothing is spent.
export function shuffle(state, { tries = 50 } = {}) {
  if (state.left.shuffle <= 0) return { ok: false, reason: 'none-left' };
  const open = state.tubes.map((t, i) => i).filter((i) => !state.sealed[i] && state.tubes[i].length);
  if (open.length < 2) return { ok: false, reason: 'nothing' };
  const sizes = open.map((i) => state.tubes[i].length);
  const cells = open.flatMap((i) => state.tubes[i]);
  const before = state.tubes.map((t) => t.join());
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const rng = makeRng(state.seed * 104729 + (state.shuffles + 1) * 1009 + attempt);
    const deal = shuffleInPlace(rng, cells.slice());
    const next = state.tubes.map((t) => t.slice());
    let at = 0;
    open.forEach((tube, k) => {
      next[tube] = deal.slice(at, at + sizes[k]);
      at += sizes[k];
    });
    if (next.every((t, i) => t.join() === before[i])) continue;
    if (next.some((t, i) => !state.sealed[i] && isSealable(t, state.cap))) continue;
    const probe = next.map((t, i) => (state.sealed[i] ? null : t));
    if (!solve(probe, { cap: state.cap, maxNodes: 20000, weight: 3 }).ok) continue;
    snapshot(state);
    state.tubes = next;
    state.shuffles += 1;
    state.left.shuffle -= 1;
    return { ok: true, events: [{ type: 'shuffle' }] };
  }
  return { ok: false, reason: 'no-deal' };
}

// 'won', 'playing', 'stuck' (no pour is possible but a prop could still help) or 'lost'.
export function outcome(state) {
  if (state.tubes.every((t, i) => state.sealed[i] || !t.length)) return 'won';
  if (legalMoves(state).length) return 'playing';
  const helps = state.left.add > 0 || state.left.shuffle > 0 || (state.left.undo > 0 && state.history.length > 0);
  return helps ? 'stuck' : 'lost';
}

// One pour that keeps the level winnable, or null when the solver cannot find one in time.
export function findHint(state, { maxNodes = 50000, weight = 2 } = {}) {
  const result = solve(solverTubes(state), { cap: state.cap, maxNodes, weight });
  return result.ok && result.moves.length ? result.moves[0] : null;
}

// 3 stars for par or better, 2 within 30% over, otherwise 1; each prop used costs a star (never below 1).
export function stars(state) {
  const base = state.moves <= state.par ? 3 : state.moves <= Math.ceil(state.par * 1.3) ? 2 : 1;
  return Math.max(1, base - propsUsed(state));
}
export function stageScore(state) {
  return state.collected.length * POUR.PER_TUBE + POUR.STAR_BONUS[stars(state) - 1];
}
