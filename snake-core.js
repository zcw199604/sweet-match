// 贪吃蛇（ARCADE 37）的规则：网格上一直往前爬，吃到果子变长；撞墙、撞自己或撞障碍就少一条命。
// 一关的目标是长到指定长度，命用完就失败。第 21 关起边缘可以穿过去，难度靠速度和障碍变高。
import { clamp, levelSeed, randInt, rng } from './kit-core.js';

export const LIVES = 3;
export const START_LENGTH = 4;
export const MAX_LEVEL = 30;
export const MOVES = {
  up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1]
};

const key = (r, c, cols) => r * cols + c;

export function levelSpec(level) {
  const n = clamp(Math.floor(level) || 1, 1, MAX_LEVEL);
  const size = Math.min(20, 12 + Math.floor((n - 1) / 3));
  const wrap = n > 20;
  const walls = n <= 6 ? 0 : Math.min(26, 2 + Math.floor((n - 7) / 2) * 2);
  const tick = Math.max(82, 170 - n * 3);
  return { n, size, wrap, walls, tick };
}

function neighbors(r, c, size, wrap) {
  const out = [];
  for (const [dr, dc] of Object.values(MOVES)) {
    let nr = r + dr;
    let nc = c + dc;
    if (wrap) {
      nr = (nr + size) % size;
      nc = (nc + size) % size;
    } else if (nr < 0 || nc < 0 || nr >= size || nc >= size) continue;
    out.push([nr, nc]);
  }
  return out;
}

// 障碍不能把地图切碎，否则果子可能永远吃不到。
function connected(walls, size, wrap, start) {
  const seen = new Set([key(start[0], start[1], size)]);
  const queue = [start];
  while (queue.length) {
    const [r, c] = queue.pop();
    for (const [nr, nc] of neighbors(r, c, size, wrap)) {
      const k = key(nr, nc, size);
      if (seen.has(k) || walls.has(k)) continue;
      seen.add(k);
      queue.push([nr, nc]);
    }
  }
  return seen.size === size * size - walls.size;
}

function buildWalls(rand, spec, snake, cols) {
  const { size, wrap, walls: count } = spec;
  if (count === 0) return new Set();
  const forbidden = new Set(snake.map(([r, c]) => key(r, c, cols)));
  // 蛇头前方留三格，别一开局就贴在墙上
  const [hr, hc] = snake[0];
  for (let i = 1; i <= 3; i += 1) forbidden.add(key(hr, hc + i, cols));
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const walls = new Set();
    let guard = 0;
    while (walls.size < count && guard < count * 40) {
      guard += 1;
      const r = randInt(rand, size);
      const c = randInt(rand, size);
      const k = key(r, c, cols);
      if (forbidden.has(k) || walls.has(k)) continue;
      walls.add(k);
    }
    if (walls.size === count && connected(walls, size, wrap, [hr, hc])) return walls;
  }
  return new Set();
}

export function freeCells(state) {
  const body = new Set(state.snake.map(([r, c]) => key(r, c, state.cols)));
  const out = [];
  for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) {
    const k = key(r, c, state.cols);
    if (!body.has(k) && !state.walls.has(k)) out.push([r, c]);
  }
  return out;
}

function spawnFood(state, rand) {
  const cells = freeCells(state).filter(([r, c]) => !(r === state.food?.r && c === state.food?.c));
  if (!cells.length) return null;
  const [r, c] = cells[randInt(rand, cells.length)];
  return { r, c };
}

function resetSnake(state) {
  state.snake = state.spawn.map(([r, c]) => [r, c]);
  state.dir = [0, 1];
  state.next = [0, 1];
  state.eaten = 0;
  state.prev = null;
}

export function createLevel(level, seed) {
  const spec = levelSpec(level);
  const rand = rng(seed ?? levelSeed('snake', spec.n));
  const mid = Math.floor(spec.size / 2);
  const headC = Math.max(3, Math.floor(spec.size / 2));
  const snake = [];
  for (let i = 0; i < START_LENGTH; i += 1) snake.push([mid, headC - i]);
  const state = {
    level: spec.n,
    seed: seed ?? levelSeed('snake', spec.n),
    rows: spec.size,
    cols: spec.size,
    wrap: spec.wrap,
    tick: spec.tick,
    walls: new Set(),
    spawn: snake.map(([r, c]) => [r, c]),
    snake,
    dir: [0, 1],
    next: [0, 1],
    food: null,
    eaten: 0,
    lives: LIVES,
    need: 10,
    status: 'playing',
    prev: null,
    lastStep: 0
  };
  state.walls = buildWalls(rand, spec, snake, spec.size);
  const free = freeCells(state).length;
  // 目标长度不能超过地图能容纳的量，否则永远吃不满
  const want = Math.min(12 + spec.n * 2, Math.floor(free * 0.6));
  state.need = Math.max(3, want - START_LENGTH);
  state.food = spawnFood(state, rand);
  return state;
}

export const lengthOf = (state) => state.snake.length;
export const outcome = (state) => state.status;

export function turn(state, dir) {
  const next = Array.isArray(dir) ? dir : MOVES[dir];
  if (!next) return false;
  // 不能 180° 掉头：正在往右走时按左无效
  if (next[0] === -state.dir[0] && next[1] === -state.dir[1]) return false;
  state.next = next;
  return true;
}

// 走一格。返回 { ate, died, won }，界面据此放动画和结算。
export function step(state, seed) {
  if (state.status !== 'playing') return { ate: false, died: false, won: false };
  state.dir = state.next;
  const [hr, hc] = state.snake[0];
  let nr = hr + state.dir[0];
  let nc = hc + state.dir[1];
  if (state.wrap) {
    nr = (nr + state.rows) % state.rows;
    nc = (nc + state.cols) % state.cols;
  }
  const eat = state.food && nr === state.food.r && nc === state.food.c;

  let died = false;
  if (!state.wrap && (nr < 0 || nc < 0 || nr >= state.rows || nc >= state.cols)) died = true;
  if (!died && state.walls.has(key(nr, nc, state.cols))) died = true;
  if (!died) {
    // 不吃果子时尾巴会挪走，所以最后一格可以进
    const body = eat ? state.snake : state.snake.slice(0, -1);
    if (body.some(([r, c]) => r === nr && c === nc)) died = true;
  }

  state.prev = state.snake.map(([r, c]) => [r, c]);
  if (died) {
    state.lives -= 1;
    state.status = state.lives > 0 ? 'playing' : 'lost';
    if (state.status === 'playing') {
      const spawn = state.spawn.map(([r, c]) => [r, c]);
      const rand = rng((seed ?? state.seed) + state.lives * 7919);
      resetSnake(state);
      state.spawn = spawn;
      state.food = spawnFood(state, rand);
    }
    return { ate: false, died: true, won: false };
  }

  state.snake.unshift([nr, nc]);
  if (eat) {
    state.eaten += 1;
    if (state.eaten >= state.need) {
      state.status = 'won';
      return { ate: true, died: false, won: true };
    }
    state.food = spawnFood(state, rng((seed ?? state.seed) + state.eaten * 104729));
  } else {
    state.snake.pop();
  }
  return { ate: eat, died: false, won: false };
}

// 测试和提示用：把果子摆到蛇头正前方，下一步就能吃到。
export function foodAhead(state) {
  const [hr, hc] = state.snake[0];
  let r = hr + state.dir[0];
  let c = hc + state.dir[1];
  if (state.wrap) {
    r = (r + state.rows) % state.rows;
    c = (c + state.cols) % state.cols;
  } else if (r < 0 || c < 0 || r >= state.rows || c >= state.cols) return null;
  if (state.walls.has(key(r, c, state.cols))) return null;
  if (state.snake.some(([sr, sc]) => sr === r && sc === c)) return null;
  state.food = { r, c };
  return state.food;
}
