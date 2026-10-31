// 泡泡龙（ARCADE 39）的规则：六边形网格、瞄准发射、同色三连消除、悬空泡泡掉落，每隔几发顶上去一排。
// 关卡按颜色数、行数和顶排速度变难；开局按「一组至少三个」发色，保证每个颜色都清得掉。
import { clamp, levelSeed, randInt, rng, shuffle } from './kit-core.js';

export const W = 360;
export const H = 640;
export const COLS = 11;
export const ROWS = 14;
export const R = 14;
export const D = R * 2;
export const TOP = 104;
export const ROW_H = 24;
export const MARGIN = 19;
export const SHOOT_Y = 566;
export const MAX_LEVEL = 24;

const DIRS = (par) => (par
  ? [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, 0], [1, 1]]
  : [[0, -1], [0, 1], [-1, -1], [-1, 0], [1, -1], [1, 0]]);

const key = (r, c) => `${r},${c}`;
export const parity = (state, r) => (r + state.offset) & 1;

export function cellCenter(state, r, c) {
  return { x: MARGIN + R + c * D + (parity(state, r) ? R : 0), y: TOP + R + r * ROW_H };
}

export function neighbors(r, c, par) {
  return DIRS(par)
    .map(([dr, dc]) => [r + dr, c + dc])
    .filter(([nr, nc]) => nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS);
}

export function createLevel(level, seed) {
  const n = clamp(Math.floor(level) || 1, 1, MAX_LEVEL);
  const rand = rng(seed ?? levelSeed('bubble', n));
  const state = {
    level: n,
    seed: seed ?? levelSeed('bubble', n),
    grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    offset: 0,
    colors: Math.min(7, 4 + Math.floor((n - 1) / 5)),
    rows: Math.min(10, 4 + Math.floor((n - 1) / 3)),
    dropEvery: Math.max(6, 10 - Math.floor((n - 1) / 5)),
    shots: 0,
    misses: 0,
    score: 0,
    status: 'playing',
    flying: null,
    shooter: { x: W / 2, y: SHOOT_Y, angle: 0, current: 0, next: 1 },
    popped: 0,
    dropped: 0
  };

  // 先按列定一个高低不齐的顶，所有泡泡都连着顶，不会一开局就掉。
  const filled = new Set();
  for (let c = 0; c < COLS; c += 1) {
    let depth = state.rows - randInt(rand, 3);
    if (c % 2 === 0 && state.rows > 5) depth = Math.max(3, depth - 1);
    for (let r = 0; r < depth; r += 1) filled.add(key(r, c));
  }

  // 再一组一组地发色：每组 3~5 个连在一起，所以同时被消掉的一定不少于三个。
  // 长不满三个的组整组退回，最后再并到旁边已有的颜色里。
  const cells = shuffle([...filled], rand);
  const colorAt = new Map();
  let next = 0;
  for (const cell of cells) {
    if (colorAt.has(cell)) continue;
    const [sr, sc] = cell.split(',').map(Number);
    const color = next % state.colors;
    next += 1;
    const target = 3 + randInt(rand, 3);
    const group = [[sr, sc]];
    const grown = new Set([cell]);
    let guard = 0;
    while (group.length < target && guard < 60) {
      guard += 1;
      const [r, c] = group[randInt(rand, group.length)];
      const options = neighbors(r, c, (r + state.offset) & 1)
        .filter(([nr, nc]) => filled.has(key(nr, nc)) && !colorAt.has(key(nr, nc)) && !grown.has(key(nr, nc)));
      if (!options.length) continue;
      const [nr, nc] = options[randInt(rand, options.length)];
      grown.add(key(nr, nc));
      group.push([nr, nc]);
    }
    if (group.length < 3) continue;
    for (const [r, c] of group) colorAt.set(key(r, c), color);
  }
  // 剩下的零散格子并到相邻颜色里；多跑几轮，直到没有能并的。
  for (let pass = 0; pass < 4; pass += 1) {
    let changed = false;
    for (const cell of cells) {
      if (colorAt.has(cell)) continue;
      const [r, c] = cell.split(',').map(Number);
      const pick = neighbors(r, c, (r + state.offset) & 1)
        .map(([nr, nc]) => colorAt.get(key(nr, nc)))
        .find((v) => v !== undefined);
      if (pick === undefined) continue;
      colorAt.set(cell, pick);
      changed = true;
    }
    if (!changed) break;
  }
  for (const cell of cells) if (!colorAt.has(cell)) colorAt.set(cell, 0);
  for (const cell of cells) {
    const [r, c] = cell.split(',').map(Number);
    state.grid[r][c] = colorAt.get(cell);
  }

  state.shooter.current = pickColor(state, rand);
  state.shooter.next = pickColor(state, rand);
  return state;
}

export const count = (state) => state.grid.reduce((n, row) => n + row.filter((v) => v !== null).length, 0);
export const outcome = (state) => state.status;

export function colorsInGrid(state) {
  const set = new Set();
  for (const row of state.grid) for (const v of row) if (v !== null) set.add(v);
  return [...set];
}

function pickColor(state, rand, exclude = null) {
  const colors = colorsInGrid(state).filter((c) => c !== exclude);
  if (!colors.length) return randInt(rand, state.colors);
  return colors[randInt(rand, colors.length)];
}

function ensureShooter(state) {
  const colors = colorsInGrid(state);
  if (!colors.length) return;
  if (!colors.includes(state.shooter.current)) state.shooter.current = colors[0];
  if (!colors.includes(state.shooter.next)) state.shooter.next = colors[0];
}

export function swap(state) {
  if (state.flying || state.status !== 'playing') return false;
  [state.shooter.current, state.shooter.next] = [state.shooter.next, state.shooter.current];
  return true;
}

export function setAim(state, x, y) {
  const dx = x - state.shooter.x;
  const dy = Math.min(-12, y - state.shooter.y);
  state.shooter.angle = clamp(Math.atan2(dx, -dy), -1.32, 1.32);
  return state.shooter.angle;
}

export function shoot(state) {
  if (state.flying || state.status !== 'playing') return false;
  const { angle, current } = state.shooter;
  const speed = 980;
  state.flying = {
    x: state.shooter.x,
    y: state.shooter.y - R - 4,
    vx: Math.sin(angle) * speed,
    vy: -Math.cos(angle) * speed,
    color: current
  };
  state.shots += 1;
  state.shooter.current = state.shooter.next;
  state.shooter.next = pickColor(state, rng(state.seed + state.shots * 7717), state.shooter.current);
  return true;
}

function cluster(state, r, c, color) {
  const seen = new Set([key(r, c)]);
  const queue = [[r, c]];
  const out = [[r, c]];
  while (queue.length) {
    const [cr, cc] = queue.pop();
    for (const [nr, nc] of neighbors(cr, cc, parity(state, cr))) {
      const k = key(nr, nc);
      if (seen.has(k) || state.grid[nr][nc] !== color) continue;
      seen.add(k);
      out.push([nr, nc]);
      queue.push([nr, nc]);
    }
  }
  return out;
}

// 从顶排出发能走到的都还挂着，其余掉下去。
export function dropFloating(state) {
  const attached = new Set();
  const queue = [];
  for (let c = 0; c < COLS; c += 1) {
    if (state.grid[0][c] !== null) {
      attached.add(key(0, c));
      queue.push([0, c]);
    }
  }
  while (queue.length) {
    const [r, c] = queue.pop();
    for (const [nr, nc] of neighbors(r, c, parity(state, r))) {
      const k = key(nr, nc);
      if (attached.has(k) || state.grid[nr][nc] === null) continue;
      attached.add(k);
      queue.push([nr, nc]);
    }
  }
  const dropped = [];
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
    if (state.grid[r][c] !== null && !attached.has(key(r, c))) {
      dropped.push({ r, c, color: state.grid[r][c] });
      state.grid[r][c] = null;
    }
  }
  state.dropped += dropped.length;
  state.score += dropped.length * 20;
  return dropped;
}

// 刚放下一颗之后的结算：同色三颗以上消掉，再让悬空的掉下去。
export function settle(state, r, c) {
  const color = state.grid[r][c];
  let poppedCells = [];
  if (color !== null) {
    const group = cluster(state, r, c, color);
    if (group.length >= 3) {
      poppedCells = group;
      for (const [pr, pc] of group) state.grid[pr][pc] = null;
      state.popped += group.length;
      state.score += group.length * 10;
    }
  }
  const droppedCells = dropFloating(state);
  ensureShooter(state);
  if (count(state) === 0) state.status = 'won';
  return { popped: poppedCells.length, dropped: droppedCells.length, poppedCells, droppedCells };
}

export function dropCeiling(state) {
  // 最下面一排还有泡泡，再顶一排就把它挤出画面，算输
  if (state.grid[ROWS - 1].some((v) => v !== null)) {
    state.status = 'lost';
    return { lost: true, added: 0 };
  }
  const rand = rng(state.seed + state.shots * 131 + 17);
  const colors = colorsInGrid(state);
  const row = [];
  for (let c = 0; c < COLS; c += 1) row.push(colors.length ? colors[randInt(rand, colors.length)] : randInt(rand, state.colors));
  state.grid.pop();
  state.grid.unshift(row);
  state.offset ^= 1;
  return { lost: false, added: COLS };
}

function nearestCell(state, x, y) {
  let best = null;
  let bestD = Infinity;
  for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
    if (state.grid[r][c] !== null) continue;
    const supported = r === 0 || neighbors(r, c, parity(state, r)).some(([nr, nc]) => state.grid[nr][nc] !== null);
    if (!supported) continue;
    const p = cellCenter(state, r, c);
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) { bestD = d; best = [r, c]; }
  }
  return best;
}

// 球飞出去以后每帧调用。撞到泡泡或顶就吸附、结算；返回这一球发生了什么。
export function step(state, dt) {
  const ball = state.flying;
  if (!ball || state.status !== 'playing') return null;
  const dist = Math.hypot(ball.vx, ball.vy) * dt;
  const steps = Math.max(1, Math.ceil(dist / 5));
  for (let s = 0; s < steps; s += 1) {
    const sub = dt / steps;
    ball.x += ball.vx * sub;
    ball.y += ball.vy * sub;
    const left = MARGIN + R;
    const right = W - MARGIN - R;
    if (ball.x < left) { ball.x = left; ball.vx = Math.abs(ball.vx); }
    if (ball.x > right) { ball.x = right; ball.vx = -Math.abs(ball.vx); }

    if (ball.y - R <= TOP) {
      ball.y = TOP + R;
      const c = clamp(Math.round((ball.x - MARGIN - R - (parity(state, 0) ? R : 0)) / D), 0, COLS - 1);
      const target = nearestCell(state, ball.x, ball.y);
      const cell = target ?? [0, c];
      return attach(state, cell, ball);
    }
    for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
      if (state.grid[r][c] === null) continue;
      const p = cellCenter(state, r, c);
      if ((p.x - ball.x) ** 2 + (p.y - ball.y) ** 2 < (D * 0.9) ** 2) {
        const target = nearestCell(state, ball.x, ball.y);
        if (!target) return null;
        return attach(state, target, ball);
      }
    }
  }
  return null;
}

function attach(state, cell, ball) {
  const [r, c] = cell;
  if (r < 0 || r >= ROWS) {
    state.flying = null;
    state.status = 'lost';
    return { lost: true };
  }
  state.grid[r][c] = ball.color;
  state.flying = null;
  const result = settle(state, r, c);
  // 只有「打空了」的发数才会把墙压下来：消掉泡泡不计数，鼓励瞄准
  const wasted = result.popped === 0 && result.dropped === 0;
  if (wasted) state.misses += 1;
  let dropRow = false;
  if (state.status === 'playing' && wasted && state.misses % state.dropEvery === 0) {
    const dropped = dropCeiling(state);
    dropRow = true;
    if (dropped.lost) return { ...result, dropRow, lost: true };
  }
  return { ...result, dropRow, at: [r, c], color: ball.color, lost: false };
}

// 瞄准线：从炮口出发，来回弹到撞上泡泡或顶为止，返回折线的点。
export function aimPath(state, maxLength = 900) {
  const { angle } = state.shooter;
  let x = state.shooter.x;
  let y = state.shooter.y - R - 4;
  let vx = Math.sin(angle);
  let vy = -Math.cos(angle);
  const pts = [[x, y]];
  const left = MARGIN + R;
  const right = W - MARGIN - R;
  for (let travelled = 0; travelled < maxLength; travelled += 6) {
    x += vx * 6;
    y += vy * 6;
    if (x < left || x > right) {
      x = clamp(x, left, right);
      vx = -vx;
      pts.push([x, y]);
    }
    if (y - R <= TOP) {
      pts.push([x, TOP + R]);
      return { pts, hit: 'top' };
    }
    for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
      if (state.grid[r][c] === null) continue;
      const p = cellCenter(state, r, c);
      if ((p.x - x) ** 2 + (p.y - y) ** 2 < (D * 0.85) ** 2) {
        pts.push([x, y]);
        return { pts, hit: [r, c] };
      }
    }
  }
  return { pts, hit: null };
}
