// 沙画消消（ARCADE 25）的规则：上面是一瓶彩色沙画，下面三列排队的沙桶。
// 点某一列最前面的桶，它就上传送带（5 格）；传送带上的桶会吸走沙画最底下几行里同色的沙子，吸满容量就收走。
// 底下的沙子被吸走，上面的沙子会往下流、往两边滑，颜色分布随之变化。传送带上凑齐三个同色桶会合成一个大桶。
// 传送带占满、又没有一个桶吸得到沙子，就输；沙子吸光过关。
// 沙画按几种构图生成（波浪、沙丘、远山、海浪，再叠太阳、月牙、爱心、彩虹之类的图案）。
// 每关生成后用一个简单的策略模拟玩一遍，能过才发给玩家，所以一定有解。
import { levelSeed, randInt, rng, shuffle } from './kit-core.js';

export const COLS = 72;
export const ROWS = 88;
export const BELT = 5;
export const LANES = 3;
export const SUCK_ROWS = 4;    // 桶从最底下这么多行里吸沙
export const PER_TICK = 4;     // 每个桶每一拍最多吸几粒（一秒 30 拍）
export const STALL = 45;       // 传送带满了、连续这么多拍都没吸到沙子就判输
const FALL = 2;                // 每一拍沙子最多往下流几格
const SAND_COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function levelShape(level) {
  const n = Math.max(1, level);
  return { colors: Math.min(8, 3 + Math.floor((n + 1) / 3)), bands: Math.min(9, 3 + Math.floor(n / 2)), fill: Math.min(0.92, 0.7 + n * 0.02), cap: [160, 280 + Math.min(240, n * 16)], shapes: n < 3 ? 0 : n < 8 ? 1 : 2 };
}

// 色层之间的分界线：给每条线挑一种走势，返回 x → y
function boundary(rand, style, base) {
  const phase = rand() * 6;
  if (style === 'dune') { const amp = 2 + rand() * 4, f = 0.05 + rand() * 0.05; return (x) => base + amp * (Math.sin(x * f + phase) + 0.4 * Math.sin(x * f * 2 + phase * 1.7)); }
  if (style === 'ripple') { const amp = 1 + rand() * 1.2, f = 0.25 + rand() * 0.15; return (x) => base + Math.sin(x * f + phase) * amp + Math.sin(x * 0.07 + phase) * 1.5; }
  if (style === 'peaks') {
    const peaks = Array.from({ length: 2 + randInt(rand, 3) }, () => ({ c: rand() * COLS, w: 10 + rand() * 18, h: 6 + rand() * 10 }));
    return (x) => base + 4 - Math.max(0, ...peaks.map((p) => p.h * Math.max(0, 1 - Math.abs(x - p.c) / p.w)));
  }
  const amp = 2 + rand() * 5, f = 0.05 + rand() * 0.09;
  return (x) => base + Math.sin(x * f + phase) * amp;
}
const SCENES = {
  waves: () => 'wave',
  dunes: () => 'dune',
  mountains: (k) => (k < 0.45 ? 'peaks' : 'wave'),
  sea: (k) => (k > 0.5 ? 'ripple' : 'wave')
};

// 叠在色层上的图案：返回一个判断 (x, y) 在不在图案里、是哪种颜色的函数
function figure(rand, kind, cx, cy, size, colors) {
  const [a, b, c] = colors;
  if (kind === 'sun') return (x, y) => { const d = Math.hypot(x - cx, y - cy); return d <= size * 0.62 ? a : d <= size ? b : -1; };
  if (kind === 'moon') return (x, y) => (Math.hypot(x - cx, y - cy) <= size && Math.hypot(x - cx - size * 0.55, y - cy + size * 0.2) > size * 0.85 ? a : -1);
  if (kind === 'heart') {
    return (x, y) => {
      const u = (x - cx) / size, v = -(y - cy) / size;
      return (u * u + v * v - 1) ** 3 - u * u * v ** 3 <= 0 ? a : -1;
    };
  }
  // 彩虹：同心的半圆环，三种颜色
  return (x, y) => {
    if (y > cy) return -1;
    const d = Math.hypot(x - cx, y - cy), w = size / 4;
    return d > size || d < size - 3 * w ? -1 : d > size - w ? a : d > size - 2 * w ? b : c;
  };
}
const FIGURES = ['sun', 'moon', 'heart', 'rainbow'];

function paint(rand, shape, level) {
  const grid = new Int8Array(COLS * ROWS).fill(-1);
  const palette = shuffle([...SAND_COLORS], rand).slice(0, shape.colors);
  const top = Math.floor(ROWS * (1 - shape.fill));
  const names = level <= 2 ? ['waves'] : Object.keys(SCENES);
  const scene = SCENES[names[randInt(rand, names.length)]];
  const bounds = [];
  for (let b = 1; b < shape.bands; b += 1) bounds.push(boundary(rand, scene(b / shape.bands), top + ((ROWS - top) * b) / shape.bands));
  const bandColor = Array.from({ length: shape.bands }, (_, b) => palette[(b + randInt(rand, 2)) % palette.length]);
  for (let b = 1; b < bandColor.length; b += 1) if (bandColor[b] === bandColor[b - 1]) bandColor[b] = palette[(palette.indexOf(bandColor[b]) + 1) % palette.length];
  for (let x = 0; x < COLS; x += 1) {
    // 每列的分界线按从上到下排好，免得山峰和下面的线交叉
    let floor = top;
    const ys = bounds.map((f) => (floor = Math.max(floor, f(x))));
    for (let y = top; y < ROWS; y += 1) {
      let band = 0;
      while (band < ys.length && y > ys[band]) band += 1;
      grid[y * COLS + x] = bandColor[band];
    }
  }
  const kinds = shuffle([...FIGURES], rand);
  for (let n = 0; n < shape.shapes; n += 1) {
    const kind = kinds[n], size = kind === 'rainbow' ? 14 + randInt(rand, 8) : 7 + randInt(rand, 5);
    const span = Math.max(1, ROWS - top - 2 * size - 8);
    const cx = size + 2 + randInt(rand, COLS - 2 * size - 4), cy = top + size + 4 + randInt(rand, span) + (kind === 'rainbow' ? size / 2 : 0);
    // 图案的颜色避开它所在那块色层的颜色，不然画上去看不出来
    const under = new Set([grid[Math.floor(cy) * COLS + Math.floor(cx)], grid[Math.floor(Math.min(ROWS - 1, cy + size)) * COLS + Math.floor(cx)], grid[Math.floor(Math.max(top, cy - size)) * COLS + Math.floor(cx)]]);
    const colors = shuffle([...palette], rand).sort((a, b) => under.has(a) - under.has(b));
    const inside = figure(rand, kind, cx, cy, size, colors);
    for (let y = Math.max(top, Math.floor(cy - size - 1)); y < Math.min(ROWS, cy + size + 2); y += 1) {
      for (let x = Math.max(0, Math.floor(cx - size - 1)); x < Math.min(COLS, cx + size + 2); x += 1) {
        const c = inside(x, y);
        if (c >= 0) grid[y * COLS + x] = c;
      }
    }
  }
  return grid;
}
function buckets(rand, grid, cap) {
  const counts = new Map();
  for (const c of grid) if (c >= 0) counts.set(c, (counts.get(c) ?? 0) + 1);
  const out = [];
  for (const [color, total] of counts) {
    let left = total;
    while (left > 0) {
      let size = cap[0] + randInt(rand, cap[1] - cap[0] + 1);
      if (left - size < cap[0] / 2) size = left;
      size = Math.min(size, left);
      out.push({ color, cap: size, got: 0 });
      left -= size;
    }
  }
  return out;
}

export function createState(grid, lanes, seed = 1) {
  return { grid, lanes, belt: Array(BELT).fill(null), beltSize: BELT, extra: 1, stall: 0, tick: 0, absorbed: 0, total: grid.filter((c) => c >= 0).length, rand: rng(seed ^ 0x5eed), sent: 0, still: false };
}
// 沙子往下流一格：正下方空就落，不然往空着的斜下方滑。返回有没有沙子动过。
function settle(grid, rand) {
  let moved = false;
  for (let y = ROWS - 2; y >= 0; y -= 1) {
    const dir = rand() < 0.5 ? 1 : -1, row = y * COLS;
    for (let k = 0; k < COLS; k += 1) {
      const x = dir > 0 ? k : COLS - 1 - k, i = row + x;
      if (grid[i] < 0) continue;
      const below = i + COLS;
      if (grid[below] < 0) { grid[below] = grid[i]; grid[i] = -1; moved = true; continue; }
      const left = x > 0 && grid[below - 1] < 0 && grid[i - 1] < 0;
      const right = x < COLS - 1 && grid[below + 1] < 0 && grid[i + 1] < 0;
      if (!left && !right) continue;
      const s = left && right ? (rand() < 0.5 ? -1 : 1) : left ? -1 : 1;
      grid[below + s] = grid[i]; grid[i] = -1; moved = true;
    }
  }
  return moved;
}
// 一拍：先让沙子往下流，再让传送带上的桶吸沙。返回这一拍吸了哪些沙（给画面画沙流）。
export function step(state) {
  const { grid } = state;
  let moved = false;
  // 上一轮一粒都没动、之后也没被吸走沙子，沙面就是静止的，不用再扫
  for (let pass = 0; pass < FALL && !state.still; pass += 1) {
    if (settle(grid, state.rand)) moved = true;
    else state.still = true;
  }
  const sucked = [];
  state.belt.forEach((bucket, slot) => {
    if (!bucket) return;
    let got = 0;
    for (let y = ROWS - 1; y >= ROWS - SUCK_ROWS && got < PER_TICK; y -= 1) {
      for (let x = 0; x < COLS && got < PER_TICK && bucket.got < bucket.cap; x += 1) {
        const i = y * COLS + ((x * 7 + state.tick) % COLS);
        if (grid[i] === bucket.color) { grid[i] = -1; got += 1; bucket.got += 1; sucked.push({ slot, x: i % COLS }); }
      }
    }
    if (got) state.still = false;
    state.absorbed += got;
  });
  const done = [];
  state.belt.forEach((bucket, slot) => { if (bucket && bucket.got >= bucket.cap) { done.push({ slot, color: bucket.color }); state.belt[slot] = null; } });
  state.tick += 1;
  const full = state.belt.slice(0, state.beltSize).every(Boolean);
  state.stall = full && !sucked.length && !done.length && !moved ? state.stall + 1 : 0;
  return { sucked, done, moved };
}
// 传送带上同色三个桶合成一个：容量和已吸的都加起来，放在最左边那个位置。
function merge(state) {
  const groups = new Map();
  state.belt.forEach((b, slot) => { if (b) (groups.get(b.color) ?? groups.set(b.color, []).get(b.color)).push(slot); });
  for (const slots of groups.values()) {
    if (slots.length < 3) continue;
    const [keep, ...rest] = slots.slice(0, 3);
    for (const s of rest) { state.belt[keep].cap += state.belt[s].cap; state.belt[keep].got += state.belt[s].got; state.belt[s] = null; }
    state.belt[keep].merged = (state.belt[keep].merged ?? 0) + 1;
    return keep;
  }
  return -1;
}
export function send(state, lane) {
  if (outcome(state) !== 'playing') return null;
  const bucket = state.lanes[lane]?.[0];
  const slot = state.belt.slice(0, state.beltSize).findIndex((b) => !b);
  if (!bucket || slot < 0) return null;
  state.lanes[lane].shift();
  state.belt[slot] = bucket;
  state.sent += 1;
  state.stall = 0;
  const merged = merge(state);
  return { slot, merged };
}
export function addSlot(state) {
  if (state.extra <= 0 || outcome(state) === 'won') return false;
  state.extra -= 1;
  state.beltSize += 1;
  state.belt.push(null);
  state.stall = 0;
  return true;
}
export const sandLeft = (state) => state.total - state.absorbed;
export const outcome = (state) => (sandLeft(state) <= 0 ? 'won' : state.stall >= STALL ? 'lost' : 'playing');

// 模拟玩家：优先送颜色现在就在底下的桶；底下的颜色都不在队头时，拿传送带当垫脚，把排在第二个的对色桶挖出来。
// 什么都做不了、沙子也不动了，就算这关卡住（不用等到传送带塞满）。
function botPlay(state, limit = 12000) {
  let idle = 0;
  for (let t = 0; t < limit && outcome(state) === 'playing'; t += 1) {
    if (t % 3 === 0) {
      const free = state.belt.slice(0, state.beltSize).filter((b) => !b).length;
      if (free) {
        const bottom = new Map();
        for (let i = (ROWS - SUCK_ROWS) * COLS; i < ROWS * COLS; i += 1) if (state.grid[i] >= 0) bottom.set(state.grid[i], (bottom.get(state.grid[i]) ?? 0) + 1);
        const want = (b) => (b ? (bottom.get(b.color) ?? 0) - state.belt.filter((x) => x && x.color === b.color).length * 160 : -Infinity);
        const lanes = [0, 1, 2].filter((l) => state.lanes[l].length).sort((a, b) => want(state.lanes[b][0]) - want(state.lanes[a][0]));
        if (lanes.length && want(state.lanes[lanes[0]][0]) > 0) send(state, lanes[0]);
        else if (free >= 2 && idle > 6) {
          const dig = lanes.find((l) => want(state.lanes[l][1]) > 0);
          if (dig !== undefined) send(state, dig);
        }
      }
    }
    const { sucked, moved } = step(state);
    idle = sucked.length || moved ? 0 : idle + 1;
    if (idle > 60) return 'stuck';
  }
  return outcome(state);
}
export function createLevel(level, seed = levelSeed('sand', level)) {
  const shape = levelShape(level);
  const rand = rng(seed);
  const depthOf = (grid) => {
    const depth = new Map();
    for (let i = grid.length - 1; i >= 0; i -= 1) if (grid[i] >= 0 && !depth.has(grid[i])) depth.set(grid[i], ROWS - Math.floor(i / COLS));
    return depth;
  };
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const grid = paint(rand, shape, level);
    const list = shuffle(buckets(rand, grid, shape.cap), rand);
    // 大致按颜色从下往上的顺序排，再搅乱一部分；越往后搅得越乱
    const depth = depthOf(grid);
    const chaos = Math.min(0.85, 0.25 + level * 0.05);
    const key = new Map(list.map((b) => [b, depth.get(b.color) + (rand() - 0.5) * 80 * chaos]));
    list.sort((a, b) => key.get(a) - key.get(b));
    const lanes = [[], [], []];
    list.forEach((b, i) => lanes[i % LANES].push(b));
    const trial = createState(Int8Array.from(grid), lanes.map((l) => l.map((b) => ({ ...b }))), seed + attempt);
    if (botPlay(trial) === 'won') return { level, seed, ...createState(grid, lanes, seed + attempt) };
  }
  // 实在模拟不过：退回按颜色深度严格排好的顺序（最容易）
  const grid = paint(rand, shape, level);
  const depth = depthOf(grid);
  const list = buckets(rand, grid, shape.cap).sort((a, b) => depth.get(a.color) - depth.get(b.color));
  const lanes = [[], [], []];
  list.forEach((b, i) => lanes[i % LANES].push(b));
  return { level, seed, ...createState(grid, lanes, seed) };
}
export { botPlay as autoplay };
