// 数织（ARCADE 29）的规则：按行列两边的数字把格子涂黑，数字是这一行（列）里连续黑格的长度和顺序。
// 题目运行时生成：随机画一张有团块感的图，再用「逐行推理」解一遍，能完全解开（也就保证唯一解）才出题。
import { randInt, rng } from './kit-core.js';

export const LEVELS = {
  easy: { label: '简单', size: 5, density: 0.6 },
  normal: { label: '普通', size: 10, density: 0.52 },
  hard: { label: '困难', size: 15, density: 0.5 }
};
export const EMPTY = 0;
export const FILL = 1;
export const CROSS = 2;

export function cluesOf(line) {
  const out = [];
  let run = 0;
  for (const v of line) {
    if (v === FILL) run += 1;
    else if (run) { out.push(run); run = 0; }
  }
  if (run) out.push(run);
  return out;
}
export const rowOf = (grid, size, r) => grid.slice(r * size, r * size + size);
export const colOf = (grid, size, c) => Array.from({ length: size }, (_, r) => grid[r * size + c]);

// 一行的推理：known 里 1 黑、0 白、-1 未知，返回新的 known；矛盾时返回 null。
export function solveLine(known, clues) {
  const n = known.length, k = clues.length;
  const memo = new Map();
  const fits = (i, j) => {
    const id = i * 32 + j;
    if (memo.has(id)) return memo.get(id);
    let ok = false;
    if (j === k) ok = known.slice(i).every((v) => v !== 1);
    else if (i < n) {
      if (known[i] !== 1 && fits(i + 1, j)) ok = true;
      const c = clues[j];
      if (!ok && i + c <= n && known.slice(i, i + c).every((v) => v !== 0) && (i + c === n ? j + 1 === k : known[i + c] !== 1) && fits(Math.min(n, i + c + 1), j + 1)) ok = true;
    }
    memo.set(id, ok);
    return ok;
  };
  if (!fits(0, 0)) return null;
  const canFill = Array(n).fill(false), canEmpty = Array(n).fill(false);
  const seen = new Set();
  const walk = (i, j) => {
    const id = i * 32 + j;
    if (seen.has(id)) return;
    seen.add(id);
    if (j === k) { for (let x = i; x < n; x += 1) canEmpty[x] = true; return; }
    if (i >= n) return;
    if (known[i] !== 1 && fits(i + 1, j)) { canEmpty[i] = true; walk(i + 1, j); }
    const c = clues[j];
    if (i + c <= n && known.slice(i, i + c).every((v) => v !== 0) && (i + c === n ? j + 1 === k : known[i + c] !== 1) && fits(Math.min(n, i + c + 1), j + 1)) {
      for (let x = i; x < i + c; x += 1) canFill[x] = true;
      if (i + c < n) canEmpty[i + c] = true;
      walk(Math.min(n, i + c + 1), j + 1);
    }
  };
  walk(0, 0);
  return known.map((v, i) => (v !== -1 ? v : canFill[i] && !canEmpty[i] ? 1 : canEmpty[i] && !canFill[i] ? 0 : -1));
}
// 只用逐行推理能推出多少：返回 known 数组（-1 是推不出来的格子）。
export function lineSolve(size, rows, cols, start = null) {
  const known = start ? [...start] : Array(size * size).fill(-1);
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < size; r += 1) {
      const next = solveLine(rowOf(known, size, r), rows[r]);
      if (!next) return null;
      next.forEach((v, c) => { if (known[r * size + c] !== v) { known[r * size + c] = v; changed = true; } });
    }
    for (let c = 0; c < size; c += 1) {
      const next = solveLine(colOf(known, size, c), cols[c]);
      if (!next) return null;
      next.forEach((v, r) => { if (known[r * size + c] !== v) { known[r * size + c] = v; changed = true; } });
    }
  }
  return known;
}

// 有团块感的随机图：随机撒点后按邻居多数平滑一遍，再把太空的行列补一点。
function picture(rand, size, density) {
  let grid = Array.from({ length: size * size }, () => (rand() < density ? 1 : 0));
  const next = grid.map((v, i) => {
    const r = Math.floor(i / size), c = i % size;
    let on = 0, all = 0;
    for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
      const rr = r + dr, cc = c + dc;
      if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
      all += 1; on += grid[rr * size + cc];
    }
    const p = on / all;
    return p > 0.55 ? 1 : p < 0.4 ? 0 : v;
  });
  grid = next;
  return grid;
}
export function generate(level, seed = Date.now()) {
  const { size, density } = LEVELS[level];
  const rand = rng(seed);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const solution = picture(rand, size, density + (rand() - 0.5) * 0.08);
    const filled = solution.reduce((a, b) => a + b, 0);
    if (filled < size * size * 0.35) continue;
    const rows = Array.from({ length: size }, (_, r) => cluesOf(rowOf(solution, size, r)));
    const cols = Array.from({ length: size }, (_, c) => cluesOf(colOf(solution, size, c)));
    const known = lineSolve(size, rows, cols);
    if (known && known.every((v) => v !== -1)) return { level, seed, size, solution, rows, cols };
  }
  // 极少数情况下一直推不完：退回一张横竖条纹（一定能推）。
  const solution = Array.from({ length: size * size }, (_, i) => (Math.floor(i / size) % 2 || i % size === randInt(rand, size) ? 1 : 0));
  return { level, seed, size, solution, rows: Array.from({ length: size }, (_, r) => cluesOf(rowOf(solution, size, r))), cols: Array.from({ length: size }, (_, c) => cluesOf(colOf(solution, size, c))) };
}

export function createGame(level, seed) {
  const puzzle = generate(level, seed);
  return { ...puzzle, marks: Array(puzzle.size * puzzle.size).fill(EMPTY), elapsed: 0, hinted: false, done: false };
}
// 这一行（列）涂黑的格子已经和数字对上了吗。
export const lineDone = (marks, clues, line) => {
  const got = cluesOf(line.map((v) => (v === FILL ? FILL : EMPTY)));
  return got.length === clues.length && got.every((v, i) => v === clues[i]);
};
export function isSolved(game) {
  const { size, marks, rows, cols } = game;
  for (let r = 0; r < size; r += 1) if (!lineDone(marks, rows[r], rowOf(marks, size, r))) return false;
  for (let c = 0; c < size; c += 1) if (!lineDone(marks, cols[c], colOf(marks, size, c))) return false;
  return true;
}
export function setCell(game, index, value) {
  if (game.done || game.marks[index] === value) return false;
  game.marks[index] = value;
  if (isSolved(game)) {
    game.done = true;
    game.marks = game.marks.map((v) => (v === FILL ? FILL : CROSS));
  }
  return true;
}
// 提示：先改掉一个涂错的格子，否则涂上一个还没涂的黑格。
export function hintCell(game, rand = Math.random) {
  if (game.done) return null;
  const { marks, solution } = game;
  const wrong = marks.map((v, i) => (v === FILL && !solution[i]) || (v === CROSS && solution[i]) ? i : -1).filter((i) => i >= 0);
  const missing = marks.map((v, i) => (v !== FILL && solution[i] ? i : -1)).filter((i) => i >= 0);
  const pool = wrong.length ? wrong : missing;
  if (!pool.length) return null;
  const index = pool[Math.floor(rand() * pool.length)];
  game.hinted = true;
  setCell(game, index, solution[index] ? FILL : CROSS);
  return index;
}
