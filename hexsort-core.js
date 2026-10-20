// 六角排序（ARCADE 27）的规则：下面托盘里发三叠六角片，选一叠放到蜂窝棋盘的空格上。
// 放下后，相邻几叠最上面是同一种颜色，就会把这一段颜色挪到一起；某一叠顶上同色攒够 10 片就整段消掉。
// 消掉的片数达到本关目标就过关；棋盘放满、托盘里的又放不下就输。
import { levelSeed, randInt, rng, shuffle } from './kit-core.js';

export const CLEAR = 10;
export const TRAY = 3;
export const COLORS = 8;
export const HEX_DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export function levelShape(level) {
  const n = Math.max(1, level);
  return {
    radius: n <= 2 ? 2 : 3,
    colors: Math.min(COLORS, 3 + Math.floor(n / 2)),
    target: 30 + n * 15,
    rocks: n <= 3 ? 0 : Math.min(6, Math.floor((n - 2) / 2)),
    maxHeight: Math.min(6, 3 + Math.floor(n / 4)),
    maxGroups: n <= 2 ? 2 : 3
  };
}
export const cellKey = (q, r) => `${q},${r}`;
export function cellsOf(radius) {
  const out = [];
  for (let q = -radius; q <= radius; q += 1) for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r += 1) out.push({ q, r });
  return out;
}
export const neighbors = (state, key) => {
  const [q, r] = key.split(',').map(Number);
  return HEX_DIRS.map(([dq, dr]) => cellKey(q + dq, r + dr)).filter((k) => k in state.board && !state.rocks.includes(k));
};
const top = (stack) => stack.at(-1);
export function topRun(stack) {
  let n = 0;
  for (let i = stack.length - 1; i >= 0 && stack[i] === top(stack); i -= 1) n += 1;
  return n;
}

function makeStack(state) {
  const { colors, maxHeight, maxGroups } = state.shape;
  const height = 2 + randInt(state.rand, maxHeight - 1);
  const groups = 1 + randInt(state.rand, Math.min(maxGroups, height));
  const palette = shuffle([...Array(colors).keys()], state.rand).slice(0, groups);
  const out = [];
  for (let g = 0; g < groups; g += 1) {
    const left = height - out.length, take = g === groups - 1 ? left : 1 + randInt(state.rand, left - (groups - g - 1));
    for (let i = 0; i < take; i += 1) out.push(palette[g]);
  }
  return out;
}
export function refill(state) {
  if (state.tray.some((s) => s)) return;
  state.tray = Array.from({ length: TRAY }, () => makeStack(state));
}
export function createLevel(level, seed = levelSeed('hexsort', level)) {
  const shape = levelShape(level);
  const rand = rng(seed);
  const board = {};
  for (const { q, r } of cellsOf(shape.radius)) board[cellKey(q, r)] = [];
  const keys = Object.keys(board).filter((k) => k !== '0,0');
  const rocks = shuffle(keys, rand).slice(0, shape.rocks);
  const state = { level, seed, shape, board, rocks, tray: [], cleared: 0, placed: 0, rand };
  refill(state);
  return state;
}
export const emptyCells = (state) => Object.keys(state.board).filter((k) => !state.rocks.includes(k) && !state.board[k].length);
export const outcome = (state) => (state.cleared >= state.shape.target ? 'won' : emptyCells(state).length === 0 ? 'lost' : 'playing');

// 合并：从刚放下的格子开始，相邻同色顶的几叠把顶上那段挪到顶段最长的那一叠上；
// 攒够 10 片整段消掉。返回事件列表，画面按顺序回放：move { from, to, color, count }、clear { cell, color, count }。
export function resolve(state, start) {
  const events = [];
  const queue = [start];
  let guard = 0;
  while (queue.length && guard < 400) {
    guard += 1;
    const key = queue.shift();
    const stack = state.board[key];
    if (!stack.length) continue;
    const color = top(stack);
    const group = [key, ...neighbors(state, key).filter((k) => state.board[k].length && top(state.board[k]) === color)];
    if (group.length > 1) {
      // 收的一方：顶段最长的；一样长时优先底下颜色更杂的（把整叠纯色的挪走更容易清空格子）
      group.sort((a, b) => topRun(state.board[b]) - topRun(state.board[a]) || state.board[b].length - state.board[a].length || (a === key ? -1 : b === key ? 1 : 0));
      const to = group[0];
      for (const from of group.slice(1)) {
        const n = topRun(state.board[from]);
        state.board[from].splice(-n);
        for (let i = 0; i < n; i += 1) state.board[to].push(color);
        events.push({ type: 'move', from, to, color, count: n });
        if (state.board[from].length) queue.push(from);
      }
      queue.push(to);
    }
    const run = topRun(stack);
    if (stack.length && run >= CLEAR) {
      stack.splice(-run);
      state.cleared += run;
      events.push({ type: 'clear', cell: key, color, count: run });
      if (stack.length) queue.push(key);
      for (const n of neighbors(state, key)) if (state.board[n].length) queue.push(n);
    }
  }
  return events;
}
// 把托盘里第 slot 叠放到格子 key 上。
export function place(state, slot, key) {
  if (outcome(state) !== 'playing') return null;
  const stack = state.tray[slot];
  if (!stack || !(key in state.board) || state.rocks.includes(key) || state.board[key].length) return null;
  state.board[key] = [...stack];
  state.tray[slot] = null;
  state.placed += 1;
  const events = resolve(state, key);
  refill(state);
  return events;
}
