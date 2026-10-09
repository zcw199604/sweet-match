// 2048: the rules. A tile is { id, r, c, v }; ids let the view slide the same tile across a move.
// Nothing here touches the DOM, so test/g2048.test.js drives it directly. Randomness is injected
// (`rng`) so tests can pin where tiles spawn.

export const G2048 = { size: 4, undos: 3, goal: 2048, four: 0.1 };
export const DIRS = ['left', 'right', 'up', 'down'];

export function createState(rng = Math.random) {
  const state = { tiles: [], score: 0, moves: 0, nextId: 1, won: false, over: false, undosLeft: G2048.undos, history: [] };
  spawn(state, rng);
  spawn(state, rng);
  return state;
}
// Rebuild a state from what was saved (or from a hand-made board in a test); anything odd is dropped.
export function restoreState(saved) {
  if (!saved || !Array.isArray(saved.tiles)) return null;
  const n = G2048.size;
  const seen = new Set();
  const tiles = [];
  for (const t of saved.tiles) {
    const ok = t && Number.isInteger(t.r) && Number.isInteger(t.c) && t.r >= 0 && t.r < n && t.c >= 0 && t.c < n
      && Number.isInteger(t.v) && t.v >= 2 && (t.v & (t.v - 1)) === 0 && !seen.has(t.r * n + t.c);
    if (!ok) return null;
    seen.add(t.r * n + t.c);
    tiles.push({ id: tiles.length + 1, r: t.r, c: t.c, v: t.v });
  }
  if (!tiles.length) return null;
  const state = {
    tiles, score: Math.max(0, Math.floor(Number(saved.score)) || 0), moves: Math.max(0, Math.floor(Number(saved.moves)) || 0),
    nextId: tiles.length + 1, won: Boolean(saved.won), over: false,
    undosLeft: saved.undosLeft === undefined ? G2048.undos : Math.min(G2048.undos, Math.max(0, Math.floor(Number(saved.undosLeft)) || 0)), history: []
  };
  state.over = !canMove(state);
  return state;
}
export const snapshot = (state) => ({
  tiles: state.tiles.map(({ r, c, v }) => ({ r, c, v })), score: state.score, moves: state.moves, won: state.won, undosLeft: state.undosLeft
});

const gridOf = (state) => {
  const grid = Array.from({ length: G2048.size }, () => Array(G2048.size).fill(null));
  for (const t of state.tiles) grid[t.r][t.c] = t;
  return grid;
};
export const emptyCells = (state) => {
  const grid = gridOf(state), out = [];
  for (let r = 0; r < G2048.size; r += 1) for (let c = 0; c < G2048.size; c += 1) if (!grid[r][c]) out.push({ r, c });
  return out;
};
function spawn(state, rng) {
  const free = emptyCells(state);
  if (!free.length) return null;
  const { r, c } = free[Math.min(free.length - 1, Math.floor(rng() * free.length))];
  const tile = { id: state.nextId, r, c, v: rng() < G2048.four ? 4 : 2 };
  state.nextId += 1;
  state.tiles.push(tile);
  return tile;
}
export function canMove(state) {
  if (emptyCells(state).length) return true;
  const grid = gridOf(state);
  for (let r = 0; r < G2048.size; r += 1) {
    for (let c = 0; c < G2048.size; c += 1) {
      if (c + 1 < G2048.size && grid[r][c].v === grid[r][c + 1].v) return true;
      if (r + 1 < G2048.size && grid[r][c].v === grid[r + 1][c].v) return true;
    }
  }
  return false;
}

// Slide everything toward `dir`. Returns { ok: false } when nothing would move, otherwise the events the
// view needs: `slides` (every tile that existed, where it was and where it ends up), `merges` (the new
// tile that replaces two parents), `spawned`, and the points `gained`.
export function move(state, dir, rng = Math.random) {
  if (state.over || !DIRS.includes(dir)) return { ok: false };
  const n = G2048.size;
  const grid = gridOf(state);
  const horizontal = dir === 'left' || dir === 'right';
  const forward = dir === 'left' || dir === 'up'; // toward index 0
  const slides = [], merges = [], next = [];
  let gained = 0, moved = false, nextId = state.nextId;
  for (let line = 0; line < n; line += 1) {
    const run = [];
    for (let k = 0; k < n; k += 1) {
      const i = forward ? k : n - 1 - k;
      const t = horizontal ? grid[line][i] : grid[i][line];
      if (t) run.push(t);
    }
    let slot = 0;
    for (let k = 0; k < run.length; k += 1) {
      const to = forward ? slot : n - 1 - slot;
      const t = run[k], u = run[k + 1];
      const dest = horizontal ? { r: line, c: to } : { r: to, c: line };
      if (u && u.v === t.v) {
        const merged = { id: nextId, v: t.v * 2 };
        nextId += 1;
        slides.push({ id: t.id, from: { r: t.r, c: t.c }, to: dest }, { id: u.id, from: { r: u.r, c: u.c }, to: dest });
        merges.push({ id: merged.id, v: merged.v, ...dest, parents: [t.id, u.id] });
        next.push({ ...merged, r: dest.r, c: dest.c });
        gained += merged.v;
        moved = true;
        k += 1;
      } else {
        slides.push({ id: t.id, from: { r: t.r, c: t.c }, to: dest });
        next.push({ id: t.id, r: dest.r, c: dest.c, v: t.v });
        if (t.r !== dest.r || t.c !== dest.c) moved = true;
      }
      slot += 1;
    }
  }
  if (!moved) return { ok: false };
  state.history.push(snapshot(state));
  if (state.history.length > G2048.undos + 1) state.history.shift();
  state.tiles = next;
  state.nextId = nextId;
  state.score += gained;
  state.moves += 1;
  const spawned = spawn(state, rng);
  const reached = merges.some((m) => m.v >= G2048.goal);
  const firstWin = reached && !state.won;
  if (reached) state.won = true;
  state.over = !canMove(state);
  return { ok: true, dir, slides, merges, spawned: spawned && { ...spawned }, gained, firstWin };
}

export function undo(state) {
  if (!state.history.length) return { ok: false, reason: 'empty' };
  if (state.undosLeft <= 0) return { ok: false, reason: 'none-left' };
  const before = state.history.pop();
  const left = state.undosLeft - 1;
  const fresh = restoreState({ ...before, undosLeft: left });
  Object.assign(state, fresh, { history: state.history, nextId: Math.max(state.nextId, fresh.nextId), undosLeft: left });
  return { ok: true };
}

export const maxTile = (state) => state.tiles.reduce((m, t) => Math.max(m, t.v), 0);
