// 箭头消除（ARCADE 23）的规则：点阵上铺满会拐弯的箭头线段，点一条它就像贪吃蛇一样沿箭头方向前进，
// 头前方一路到边界都没有别的线段就整条滑出去消掉；被挡住就退回原位并扣一次机会。
// 头前方的「射线」上有谁，就依赖谁先走：依赖图无环就一定有解，生成关卡时每放一条都检查一次。
import { levelSeed, randInt, rng, shuffle } from './kit-core.js';

export const LIVES = 3;
export const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // 上 右 下 左

// 第 n 关的尺寸和线段长度：从 5×6 慢慢长到 10×14，之后只变得更长更绕。
export function levelShape(level) {
  const n = Math.max(1, level);
  const cols = Math.min(10, 5 + Math.floor((n - 1) / 3));
  const rows = Math.min(14, 6 + Math.floor((n - 1) / 2.5));
  const maxLen = Math.min(9, 3 + Math.floor(n / 4));
  const turns = Math.min(0.55, 0.2 + n * 0.02); // 每走一步拐弯的机会
  return { rows, cols, maxLen, turns };
}

const key = (r, c) => r * 64 + c;
export function headDir(arrow) {
  const [a, b] = [arrow.cells.at(-2), arrow.cells.at(-1)];
  return DIRS.findIndex(([dr, dc]) => dr === b[0] - a[0] && dc === b[1] - a[1]);
}
// 头前方到边界的格子（不含头本身）。
export function ray(state, arrow) {
  const [dr, dc] = DIRS[headDir(arrow)];
  const out = [];
  let [r, c] = arrow.cells.at(-1);
  for (;;) {
    r += dr; c += dc;
    if (r < 0 || c < 0 || r >= state.rows || c >= state.cols) return out;
    out.push([r, c]);
  }
}
export function occupancy(state) {
  const grid = new Map();
  for (const arrow of state.arrows) if (!arrow.gone) for (const [r, c] of arrow.cells) grid.set(key(r, c), arrow.id);
  return grid;
}
// 沿射线第一个挡路的线段：{ by, steps }，steps 是头能往前走几格。没挡住返回 null。
export function blocker(state, arrow, grid = occupancy(state)) {
  const cells = ray(state, arrow);
  for (let i = 0; i < cells.length; i += 1) {
    const id = grid.get(key(...cells[i]));
    if (id !== undefined && id !== arrow.id) return { by: id, steps: i };
  }
  return null;
}
function hasCycle(arrows, rows, cols) {
  const state = { rows, cols, arrows };
  const grid = occupancy(state);
  const deps = new Map(arrows.map((a) => [a.id, new Set(ray(state, a).map(([r, c]) => grid.get(key(r, c))).filter((id) => id !== undefined && id !== a.id))]));
  const mark = new Map();
  const visit = (id) => {
    if (mark.get(id) === 1) return true;
    if (mark.get(id) === 2) return false;
    mark.set(id, 1);
    for (const next of deps.get(id)) if (visit(next)) return true;
    mark.set(id, 2);
    return false;
  };
  return arrows.some((a) => visit(a.id));
}

// 从一个空格出发随机走出一条线段；头不能回头撞上自己的身子。
function grow(rand, start, len, used, rows, cols, turns) {
  const cells = [start];
  const seen = new Set([key(...start)]);
  let dir = randInt(rand, 4);
  for (let step = 1; step < len; step += 1) {
    const [r, c] = cells.at(-1);
    const options = [dir, (dir + 1) % 4, (dir + 3) % 4];
    if (rand() < turns) options.push(options.shift());
    let moved = false;
    for (const d of options) {
      const nr = r + DIRS[d][0], nc = c + DIRS[d][1];
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || used.has(key(nr, nc)) || seen.has(key(nr, nc))) continue;
      cells.push([nr, nc]); seen.add(key(nr, nc)); dir = d; moved = true;
      break;
    }
    if (!moved) break;
  }
  if (cells.length < 2) return null;
  const arrow = { cells };
  const [dr, dc] = DIRS[headDir(arrow)];
  let [r, c] = cells.at(-1);
  for (;;) {
    r += dr; c += dc;
    if (r < 0 || c < 0 || r >= rows || c >= cols) break;
    if (seen.has(key(r, c))) return null;
  }
  return cells;
}

export function createLevel(level, seed = levelSeed('arrows', level)) {
  const shape = levelShape(level);
  const { rows, cols, maxLen, turns } = shape;
  const rand = rng(seed);
  const arrows = [];
  const used = new Set();
  const order = [];
  for (let r = 0; r < rows; r += 1) for (let c = 0; c < cols; c += 1) order.push([r, c]);
  // 两轮：先放长的，再用短的把缝补上。
  for (const pass of [maxLen, 3, 2]) {
    shuffle(order, rand);
    for (const start of order) {
      if (used.has(key(...start))) continue;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const len = pass <= 3 ? pass : 2 + randInt(rand, pass - 1);
        const cells = grow(rand, start, len, used, rows, cols, turns);
        if (!cells) continue;
        const arrow = { id: arrows.length, cells, color: randInt(rand, 8), gone: false };
        arrows.push(arrow);
        if (hasCycle(arrows, rows, cols)) { arrows.pop(); continue; }
        for (const cell of cells) used.add(key(...cell));
        break;
      }
    }
  }
  return { level, seed, rows, cols, arrows, lives: LIVES, mistakes: 0, cleared: 0 };
}

export const remaining = (state) => state.arrows.filter((a) => !a.gone).length;
export const outcome = (state) => (remaining(state) === 0 ? 'won' : state.lives <= 0 ? 'lost' : 'playing');

// 点一条线段。返回 { ok, steps, by }：ok 为真表示它滑出去了。
export function tapArrow(state, id) {
  const arrow = state.arrows[id];
  if (!arrow || arrow.gone || outcome(state) !== 'playing') return { ok: false, reason: 'idle' };
  const hit = blocker(state, arrow);
  if (hit) {
    state.lives -= 1;
    state.mistakes += 1;
    return { ok: false, reason: 'blocked', by: hit.by, steps: hit.steps };
  }
  arrow.gone = true;
  state.cleared += 1;
  return { ok: true, steps: ray(state, arrow).length };
}
export function findHint(state) {
  const grid = occupancy(state);
  return state.arrows.find((a) => !a.gone && !blocker(state, a, grid))?.id ?? null;
}
// 星级只看失误：零失误三星，一次两星。
export const stars = (state) => (state.mistakes === 0 ? 3 : state.mistakes === 1 ? 2 : 1);
export const arrowAt = (state, r, c) => occupancy(state).get(key(r, c)) ?? null;
