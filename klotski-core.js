// 华容道（ARCADE 36）的规则：4×5 棋盘上滑动棋块，把 2×2 的曹操挪到下方正中。
// 棋块只能整个平移，目标格必须空着；一步是「一次拖动」，跟最少步数 par 的统计方式一致。
import { LEVELS } from './klotski-levels.js';

export { LEVELS };
export const ROWS = 5;
export const COLS = 4;
export const GOAL = { r: 3, c: 1 };
export const LABELS = ['曹操', '将', '将', '卒'];

const key = (r, c) => r * COLS + c;

export function createLevel(level) {
  const n = Math.max(1, Math.min(LEVELS.length, Math.floor(level) || 1));
  const data = LEVELS[n - 1];
  return {
    level: n,
    name: data.name,
    par: data.par,
    blocks: data.blocks.map((b, id) => ({ id, ...b })),
    moves: 0,
    history: []
  };
}

// 棋盘上已被占的格子；skipId 用来把正在试走的那一块排除掉。
export function occupancy(state, skipId = -1) {
  const set = new Set();
  for (const b of state.blocks) {
    if (b.id === skipId) continue;
    for (let y = 0; y < b.h; y += 1) for (let x = 0; x < b.w; x += 1) set.add(key(b.r + y, b.c + x));
  }
  return set;
}

export function fits(state, block, r, c) {
  if (r < 0 || c < 0 || r + block.h > ROWS || c + block.w > COLS) return false;
  const taken = occupancy(state, block.id);
  for (let y = 0; y < block.h; y += 1) for (let x = 0; x < block.w; x += 1) {
    if (taken.has(key(r + y, c + x))) return false;
  }
  return true;
}

export const canMove = (state, id, dr, dc) => {
  const b = state.blocks[id];
  return fits(state, b, b.r + dr, b.c + dc);
};

// 走一格；一次拖动里可以连续调很多次。
export function move(state, id, dr, dc) {
  if (!canMove(state, id, dr, dc)) return false;
  const b = state.blocks[id];
  b.r += dr;
  b.c += dc;
  return true;
}

export function startDrag(state, id) {
  const b = state.blocks[id];
  return { id, r: b.r, c: b.c, moves: state.moves };
}

// 松手：位置变了才算一步，并把这一步前的位置压进历史，供撤销。
export function commit(state, drag) {
  const b = state.blocks[drag.id];
  if (b.r === drag.r && b.c === drag.c) return false;
  state.history.push({ id: drag.id, r: drag.r, c: drag.c, moves: drag.moves });
  state.moves += 1;
  return true;
}

export function undo(state) {
  const last = state.history.pop();
  if (!last) return false;
  const b = state.blocks[last.id];
  b.r = last.r;
  b.c = last.c;
  state.moves = last.moves;
  return true;
}

export const solved = (state) => state.blocks[0].r === GOAL.r && state.blocks[0].c === GOAL.c;

// 三步之内按 par 评分：正好 par 或更少三星，多三成以内两星，其余一星。
export function stars(state) {
  if (state.moves <= state.par) return 3;
  if (state.moves <= Math.ceil(state.par * 1.35)) return 2;
  return 1;
}
