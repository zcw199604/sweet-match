// 麻将连连看（ARCADE 28）的规则：点两张一样的麻将牌，能用不超过三段直线（最多拐两个弯）、
// 只经过空位（可以绕到牌阵外面一圈）把它们连起来，就一起消掉。限时内消光过关。
// 后面的关卡消掉之后牌会往一个方向挤过去（重力），没有能连的就自动洗牌。
import { levelSeed, rng, shuffle } from './kit-core.js';

// 34 种牌：0–8 万，9–17 筒，18–26 条，27–30 东南西北，31–33 中发白。
export const KINDS = 34;
export const GRAVITY = ['none', 'none', 'none', 'down', 'left', 'up', 'right'];

export function levelShape(level) {
  const n = Math.max(1, level);
  const cols = Math.min(8, 5 + Math.floor((n + 1) / 3));
  const rows = Math.min(10, 6 + Math.floor(n / 2));
  const pairs = Math.floor((cols * rows) / 2);
  const kinds = Math.min(KINDS, 8 + n * 2, pairs);
  const gravity = n <= 3 ? 'none' : GRAVITY[3 + ((n - 4) % 4)];
  const time = Math.round(pairs * Math.max(3.2, 6 - n * 0.15) + 20);
  return { cols, rows, kinds, gravity, time, pairs };
}

export function createLevel(level, seed = levelSeed('mahjong', level)) {
  const shape = levelShape(level);
  const rand = rng(seed);
  const kinds = shuffle([...Array(KINDS).keys()], rand).slice(0, shape.kinds);
  const tiles = [];
  for (let i = 0; i < shape.pairs; i += 1) tiles.push(kinds[i % kinds.length], kinds[i % kinds.length]);
  shuffle(tiles, rand);
  const grid = Array.from({ length: shape.rows }, (_, r) => Array.from({ length: shape.cols }, (_, c) => tiles[r * shape.cols + c] ?? -1));
  const state = { level, seed, rows: shape.rows, cols: shape.cols, gravity: shape.gravity, grid, time: shape.time, left: shape.time, pairs: shape.pairs, cleared: 0, hints: 3, shuffles: 3, combo: 0, lastAt: -99, score: 0 };
  // 开局没有能连的就先洗一次
  if (!findPair(state)) reshuffle(state, rand);
  return state;
}

const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]];
// 找一条最多拐两个弯的路：返回经过的拐点（含起终点，坐标里 -1 和 rows/cols 是牌阵外的那一圈）。
export function findPath(state, a, b) {
  const { rows, cols, grid } = state;
  if (a.r === b.r && a.c === b.c) return null;
  const open = (r, c) => r < 0 || c < 0 || r >= rows || c >= cols || grid[r][c] < 0 || (r === b.r && c === b.c);
  const inside = (r, c) => r >= -1 && c >= -1 && r <= rows && c <= cols;
  // BFS：每一步沿一个方向一直走到底，转弯数就是层数
  const best = new Map();
  let frontier = [{ r: a.r, c: a.c, d: -1, turns: -1, path: [[a.r, a.c]] }];
  while (frontier.length) {
    const next = [];
    for (const node of frontier) {
      for (let d = 0; d < 4; d += 1) {
        if (d === node.d) continue;
        const turns = node.turns + 1;
        if (turns > 2) continue;
        let r = node.r + DIRS[d][0], c = node.c + DIRS[d][1];
        while (inside(r, c) && open(r, c)) {
          const path = [...node.path, [r, c]];
          if (r === b.r && c === b.c) return path;
          const id = `${r},${c},${d}`;
          if (!best.has(id) || best.get(id) > turns) {
            best.set(id, turns);
            next.push({ r, c, d, turns, path });
          }
          r += DIRS[d][0]; c += DIRS[d][1];
        }
      }
    }
    frontier = next;
  }
  return null;
}
export function findPair(state) {
  const spots = new Map();
  state.grid.forEach((row, r) => row.forEach((kind, c) => { if (kind >= 0) (spots.get(kind) ?? spots.set(kind, []).get(kind)).push({ r, c }); }));
  for (const list of spots.values()) {
    for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
      if (findPath(state, list[i], list[j])) return [list[i], list[j]];
    }
  }
  return null;
}
export function reshuffle(state, rand = Math.random) {
  const cells = [];
  state.grid.forEach((row, r) => row.forEach((kind, c) => { if (kind >= 0) cells.push({ r, c, kind }); }));
  for (let tries = 0; tries < 30; tries += 1) {
    const kinds = shuffle(cells.map((x) => x.kind), rand);
    cells.forEach((x, i) => { state.grid[x.r][x.c] = kinds[i]; });
    if (!cells.length || findPair(state)) return true;
  }
  return false;
}
// 消掉之后按本关的重力把牌挤过去。
function settle(state) {
  const { rows, cols, grid, gravity } = state;
  if (gravity === 'none') return;
  const vertical = gravity === 'down' || gravity === 'up';
  const lines = vertical ? cols : rows;
  for (let k = 0; k < lines; k += 1) {
    const cells = vertical ? Array.from({ length: rows }, (_, r) => [r, k]) : Array.from({ length: cols }, (_, c) => [k, c]);
    if (gravity === 'down' || gravity === 'right') cells.reverse();
    const kinds = cells.map(([r, c]) => grid[r][c]).filter((v) => v >= 0);
    cells.forEach(([r, c], i) => { grid[r][c] = kinds[i] ?? -1; });
  }
}
export const remaining = (state) => state.grid.flat().filter((v) => v >= 0).length;
export const outcome = (state) => (remaining(state) === 0 ? 'won' : state.left <= 0 ? 'lost' : 'playing');

// 连两张牌。now 是秒，用来算连击：3 秒内接着消算连击，加分越来越多。
export function link(state, a, b, now = 0) {
  if (outcome(state) !== 'playing') return { ok: false };
  const ka = state.grid[a.r]?.[a.c], kb = state.grid[b.r]?.[b.c];
  if (ka === undefined || kb === undefined || ka < 0 || ka !== kb) return { ok: false, reason: 'differ' };
  const path = findPath(state, a, b);
  if (!path) return { ok: false, reason: 'blocked' };
  state.grid[a.r][a.c] = -1;
  state.grid[b.r][b.c] = -1;
  state.cleared += 1;
  state.combo = now - state.lastAt <= 3 ? state.combo + 1 : 1;
  state.lastAt = now;
  state.score += 10 + (state.combo - 1) * 5;
  settle(state);
  let shuffled = false;
  if (remaining(state) && !findPair(state)) shuffled = reshuffle(state);
  return { ok: true, path, kind: ka, shuffled };
}
export function tick(state, seconds) {
  if (outcome(state) !== 'playing') return;
  state.left = Math.max(0, state.left - seconds);
}
export function useHint(state) {
  if (state.hints <= 0 || outcome(state) !== 'playing') return null;
  const pair = findPair(state);
  if (pair) state.hints -= 1;
  return pair;
}
export function useShuffle(state, rand = Math.random) {
  if (state.shuffles <= 0 || outcome(state) !== 'playing') return false;
  state.shuffles -= 1;
  reshuffle(state, rand);
  return true;
}
// 过关奖励：剩下的每秒 2 分。
export const timeBonus = (state) => Math.floor(state.left) * 2;
