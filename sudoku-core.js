// 数独: the rules. A grid is 81 numbers, row by row, 0 for an empty cell. Nothing here touches the DOM,
// so test/sudoku.test.js drives it directly; randomness is injected (`rng`) so puzzles are repeatable.
//
// Every puzzle has exactly one solution (the generator checks), so "wrong" simply means "not the
// solution's digit". That is what the mistake counter judges, and what lets a hint be a plain reveal.

export const MISTAKES = 3;
// `clues` is how few givens the generator tries to leave. 简单 and 普通 must be solvable with the two
// basic single-candidate rules alone (no guessing); 困难 is the opposite: it must need something more
// (pairs, pointing, or a trial), which is what separates it from a 普通 with fewer givens.
export const DIFFS = {
  easy: { label: '简单', clues: 40, singles: 'only' },
  normal: { label: '普通', clues: 32, singles: 'only' },
  hard: { label: '困难', clues: 24, singles: 'beyond' }
};
export const DIFF_IDS = Object.keys(DIFFS);

const ALL = 0x3fe; // bits 1..9
const bit = (d) => 1 << d;
const row = (i) => Math.floor(i / 9);
const col = (i) => i % 9;
const box = (i) => Math.floor(row(i) / 3) * 3 + Math.floor(col(i) / 3);
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const out = [];
  for (let j = 0; j < 81; j += 1) if (j !== i && (row(j) === row(i) || col(j) === col(i) || box(j) === box(i))) out.push(j);
  return out;
});
export { row, col, box };

const popcount = (m) => { let n = 0; while (m) { m &= m - 1; n += 1; } return n; };
const digitsOf = (mask) => { const out = []; for (let d = 1; d <= 9; d += 1) if (mask & bit(d)) out.push(d); return out; };

// ---- solving ----
// Backtracking on the cell with the fewest candidates. Counts solutions up to `limit`; with an rng the
// digits are tried in a random order and the first solution found is kept in `out`.
function search(grid, limit, rng, out) {
  const rows = Array(9).fill(0), cols = Array(9).fill(0), boxes = Array(9).fill(0);
  const cells = grid.slice();
  for (let i = 0; i < 81; i += 1) {
    if (!cells[i]) continue;
    const b = bit(cells[i]);
    if (rows[row(i)] & b || cols[col(i)] & b || boxes[box(i)] & b) return 0; // the givens already clash
    rows[row(i)] |= b; cols[col(i)] |= b; boxes[box(i)] |= b;
  }
  let found = 0;
  const go = () => {
    let at = -1, mask = 0, fewest = 10;
    for (let i = 0; i < 81; i += 1) {
      if (cells[i]) continue;
      const m = ALL & ~(rows[row(i)] | cols[col(i)] | boxes[box(i)]);
      const n = popcount(m);
      if (n < fewest) { fewest = n; at = i; mask = m; if (n <= 1) break; }
    }
    if (at < 0) { found += 1; if (out && found === 1) out.push(...cells); return found >= limit; }
    if (!mask) return false;
    const options = digitsOf(mask);
    if (rng) for (let k = options.length - 1; k > 0; k -= 1) { const j = Math.floor(rng() * (k + 1)); [options[k], options[j]] = [options[j], options[k]]; }
    for (const d of options) {
      const b = bit(d);
      cells[at] = d; rows[row(at)] |= b; cols[col(at)] |= b; boxes[box(at)] |= b;
      const stop = go();
      cells[at] = 0; rows[row(at)] &= ~b; cols[col(at)] &= ~b; boxes[box(at)] &= ~b;
      if (stop) return true;
    }
    return false;
  };
  go();
  return found;
}
export const countSolutions = (grid, limit = 2) => search(grid, limit, null, null);
export function solve(grid) {
  const out = [];
  return search(grid, 1, null, out) ? out : null;
}

// Naked and hidden singles only: the "no guessing" techniques. True when they alone finish the grid.
export function solvableBySingles(grid) {
  const cells = grid.slice();
  const cand = (i) => {
    let m = ALL;
    for (const j of PEERS[i]) if (cells[j]) m &= ~bit(cells[j]);
    return m;
  };
  const units = [];
  for (let k = 0; k < 9; k += 1) {
    units.push(Array.from({ length: 9 }, (_, j) => k * 9 + j), Array.from({ length: 9 }, (_, j) => j * 9 + k));
    const r0 = Math.floor(k / 3) * 3, c0 = (k % 3) * 3;
    units.push(Array.from({ length: 9 }, (_, j) => (r0 + Math.floor(j / 3)) * 9 + c0 + (j % 3)));
  }
  for (;;) {
    let progress = false;
    for (let i = 0; i < 81; i += 1) {
      if (cells[i]) continue;
      const m = cand(i);
      if (popcount(m) === 1) { cells[i] = digitsOf(m)[0]; progress = true; }
    }
    for (const unit of units) {
      for (let d = 1; d <= 9; d += 1) {
        if (unit.some((i) => cells[i] === d)) continue;
        const spots = unit.filter((i) => !cells[i] && cand(i) & bit(d));
        if (spots.length === 1) { cells[spots[0]] = d; progress = true; }
      }
    }
    if (!cells.includes(0)) return true;
    if (!progress) return false;
  }
}

// ---- generating ----
export function fullGrid(rng = Math.random) {
  const out = [];
  search(Array(81).fill(0), 1, rng, out);
  return out;
}
// Take digits out in random order, keeping each removal only if the puzzle still has one solution
// (and, for the easier levels, can still be finished by singles), until `clues` givens are left or
// nothing more can go. The count it reaches is whatever the grid allows, never fewer than the target.
export function generate(diff = 'normal', rng = Math.random) {
  const rule = DIFFS[diff] ?? DIFFS.normal;
  let made = null;
  // About half of the unique 24-clue puzzles still fall to singles, so 困难 draws again until one does not.
  for (let attempt = 0; attempt < 60; attempt += 1) {
    made = carve(rule, rng);
    if (rule.singles !== 'beyond' || !solvableBySingles(made.puzzle)) break;
  }
  return { diff, puzzle: made.puzzle.join(''), solution: made.solution.join('') };
}
function carve(rule, rng) {
  const solution = fullGrid(rng);
  const puzzle = solution.slice();
  const order = Array.from({ length: 81 }, (_, i) => i);
  for (let k = 80; k > 0; k -= 1) { const j = Math.floor(rng() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
  let left = 81;
  for (const i of order) {
    if (left <= rule.clues) break;
    const kept = puzzle[i];
    puzzle[i] = 0;
    const ok = countSolutions(puzzle, 2) === 1 && (rule.singles !== 'only' || solvableBySingles(puzzle));
    if (ok) left -= 1; else puzzle[i] = kept;
  }
  return { puzzle, solution };
}

// ---- a game in progress ----
const asGrid = (text) => [...text].map(Number);
export function createGame({ diff = 'normal', puzzle, solution }) {
  const cells = asGrid(puzzle);
  return {
    diff, puzzle, solution,
    cells, given: cells.map((d) => d !== 0), notes: Array(81).fill(0),
    mistakes: 0, hints: 0, status: 'playing', history: []
  };
}
const target = (state) => asGrid(state.solution);
export const isWrong = (state, i) => state.cells[i] !== 0 && state.cells[i] !== Number(state.solution[i]);
export const isLocked = (state, i) => state.given[i] || (state.cells[i] !== 0 && !isWrong(state, i));
const remember = (state) => state.history.push({ cells: state.cells.slice(), notes: state.notes.slice() });
const settle = (state) => {
  if (state.mistakes >= MISTAKES) state.status = 'lost';
  else if (target(state).every((d, i) => state.cells[i] === d)) state.status = 'won';
};
// A digit that is right takes its candidate off every cell that sees it.
function fill(state, i, d) {
  state.cells[i] = d;
  state.notes[i] = 0;
  for (const j of PEERS[i]) state.notes[j] &= ~bit(d);
}

export function place(state, i, d) {
  if (state.status !== 'playing') return { ok: false, reason: 'over' };
  if (isLocked(state, i)) return { ok: false, reason: 'locked' };
  if (state.cells[i] === d) return { ok: false, reason: 'same' };
  remember(state);
  if (d === Number(state.solution[i])) {
    fill(state, i, d);
    settle(state);
    return { ok: true, correct: true };
  }
  state.cells[i] = d;
  state.notes[i] = 0;
  state.mistakes += 1;
  settle(state);
  return { ok: true, correct: false };
}
export function toggleNote(state, i, d) {
  if (state.status !== 'playing' || state.cells[i] !== 0 || state.given[i]) return { ok: false };
  remember(state);
  state.notes[i] ^= bit(d);
  return { ok: true };
}
// Empties a wrong digit, or failing that wipes the cell's notes.
export function erase(state, i) {
  if (state.status !== 'playing' || isLocked(state, i)) return { ok: false };
  if (state.cells[i] === 0 && state.notes[i] === 0) return { ok: false };
  remember(state);
  state.cells[i] = 0;
  state.notes[i] = 0;
  return { ok: true };
}
export function hint(state, i) {
  if (state.status !== 'playing' || state.given[i] || (state.cells[i] !== 0 && !isWrong(state, i))) return { ok: false };
  remember(state);
  fill(state, i, Number(state.solution[i]));
  state.hints += 1;
  settle(state);
  return { ok: true };
}
// Takes the last entry back. A mistake already made stays counted.
export function undo(state) {
  if (state.status !== 'playing' || !state.history.length) return { ok: false };
  const before = state.history.pop();
  state.cells = before.cells;
  state.notes = before.notes;
  return { ok: true };
}
// How many of each digit are correctly on the board, 1..9.
export function placed(state) {
  const counts = Array(10).fill(0);
  state.cells.forEach((d, i) => { if (d && !isWrong(state, i)) counts[d] += 1; });
  return counts;
}
export const emptyCount = (state) => state.cells.filter((d, i) => d === 0 || isWrong(state, i)).length;
// The first empty (or wrong) cell, for the 提示 button when nothing is selected.
export const firstOpen = (state) => state.cells.findIndex((d, i) => d === 0 || isWrong(state, i));

// ---- saving ----
export const pack = (state) => ({
  diff: state.diff, puzzle: state.puzzle, solution: state.solution, cells: state.cells.join(''), notes: state.notes,
  mistakes: state.mistakes, hints: state.hints
});
// Anything that does not add up is refused: a stale or hand-edited save must not crash the board.
export function unpack(saved) {
  if (!saved || !DIFFS[saved.diff]) return null;
  const digits = (text) => typeof text === 'string' && /^[0-9]{81}$/.test(text);
  if (!digits(saved.puzzle) || !digits(saved.solution) || !digits(saved.cells) || !Array.isArray(saved.notes) || saved.notes.length !== 81) return null;
  const solved = asGrid(saved.solution), start = asGrid(saved.puzzle);
  if (solved.includes(0) || start.some((d, i) => d && d !== solved[i]) || countSolutions(start, 2) !== 1) return null;
  const state = createGame(saved);
  const cells = asGrid(saved.cells);
  if (cells.some((d, i) => state.given[i] ? d !== start[i] : false)) return null;
  state.cells = cells;
  state.notes = saved.notes.map((m) => (Number.isInteger(m) && m >= 0 && m <= ALL ? m : 0));
  state.mistakes = Math.min(MISTAKES - 1, Math.max(0, Math.floor(Number(saved.mistakes)) || 0));
  state.hints = Math.max(0, Math.floor(Number(saved.hints)) || 0);
  settle(state);
  return state.status === 'playing' ? state : null;
}
export const noteBit = bit;
