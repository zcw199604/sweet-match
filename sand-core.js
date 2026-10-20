// 沙画消消（ARCADE 25）的规则：上面是一瓶分层的彩色沙画，下面三列排队的沙桶。
// 点某一列最前面的桶，它就上传送带（5 格）；传送带上的桶会吸走沙画最底下两行里同色的沙子，吸满容量就收走。
// 底下的沙子被吸走，上面的沙子会往下流、往两边滑，颜色分布随之变化。传送带上凑齐三个同色桶会合成一个大桶。
// 传送带占满、又没有一个桶吸得到沙子，就输；沙子吸光过关。
// 每关生成后用一个简单的策略模拟玩一遍，能过才发给玩家，所以一定有解。
import { levelSeed, randInt, rng, shuffle } from './kit-core.js';

export const COLS = 36;
export const ROWS = 44;
export const BELT = 5;
export const LANES = 3;
export const PER_TICK = 1;     // 每个桶每一拍最多吸几粒（一秒 30 拍）
export const STALL = 45;       // 传送带满了、连续这么多拍都没吸到沙子就判输
const SAND_COLORS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function levelShape(level) {
  const n = Math.max(1, level);
  return { colors: Math.min(8, 3 + Math.floor((n + 1) / 3)), bands: Math.min(9, 3 + Math.floor(n / 2)), fill: Math.min(0.92, 0.7 + n * 0.02), cap: [40, 70 + Math.min(60, n * 4)] };
}

// 沙画：好几层波浪形的彩色沙，偶尔夹一个圆团（太阳 / 月亮）。
function paint(rand, shape) {
  const grid = new Int8Array(COLS * ROWS).fill(-1);
  const palette = shuffle([...SAND_COLORS], rand).slice(0, shape.colors);
  const top = Math.floor(ROWS * (1 - shape.fill));
  const bounds = [];
  for (let b = 1; b < shape.bands; b += 1) {
    const base = top + ((ROWS - top) * b) / shape.bands;
    const amp = 1 + rand() * 2.5, freq = 0.1 + rand() * 0.18, phase = rand() * 6;
    bounds.push((x) => base + Math.sin(x * freq + phase) * amp);
  }
  const bandColor = Array.from({ length: shape.bands }, (_, b) => palette[(b + randInt(rand, 2)) % palette.length]);
  for (let b = 1; b < bandColor.length; b += 1) if (bandColor[b] === bandColor[b - 1]) bandColor[b] = palette[(palette.indexOf(bandColor[b]) + 1) % palette.length];
  for (let y = top; y < ROWS; y += 1) for (let x = 0; x < COLS; x += 1) {
    let band = 0;
    while (band < bounds.length && y > bounds[band](x)) band += 1;
    grid[y * COLS + x] = bandColor[band];
  }
  if (shape.bands > 5) {
    const cx = 6 + randInt(rand, COLS - 12), cy = top + 4 + randInt(rand, Math.max(1, (ROWS - top) / 2)), r = 3 + randInt(rand, 3), c = palette[randInt(rand, palette.length)];
    for (let y = cy - r; y <= cy + r; y += 1) for (let x = cx - r; x <= cx + r; x += 1) if (y >= top && y < ROWS && x >= 0 && x < COLS && (x - cx) ** 2 + (y - cy) ** 2 <= r * r) grid[y * COLS + x] = c;
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
  return { grid, lanes, belt: Array(BELT).fill(null), beltSize: BELT, extra: 1, stall: 0, tick: 0, absorbed: 0, total: grid.filter((c) => c >= 0).length, rand: rng(seed ^ 0x5eed), sent: 0 };
}
// 一拍：先让沙子往下落，再让传送带上的桶吸沙。返回这一拍吸了多少粒（给画面画沙流）。
export function step(state) {
  const { grid, rand } = state;
  let moved = false;
  for (let y = ROWS - 2; y >= 0; y -= 1) {
    const dir = rand() < 0.5 ? 1 : -1;
    for (let k = 0; k < COLS; k += 1) {
      const x = dir > 0 ? k : COLS - 1 - k, i = y * COLS + x;
      if (grid[i] < 0) continue;
      const below = i + COLS;
      if (grid[below] < 0) { grid[below] = grid[i]; grid[i] = -1; moved = true; continue; }
      const side = rand() < 0.5 ? -1 : 1;
      for (const s of [side, -side]) {
        const nx = x + s;
        if (nx < 0 || nx >= COLS) continue;
        if (grid[below + s] < 0 && grid[i + s] < 0) { grid[below + s] = grid[i]; grid[i] = -1; moved = true; break; }
      }
    }
  }
  const sucked = [];
  state.belt.forEach((bucket, slot) => {
    if (!bucket) return;
    let got = 0;
    for (let y = ROWS - 1; y >= ROWS - 2 && got < PER_TICK; y -= 1) {
      for (let x = 0; x < COLS && got < PER_TICK && bucket.got < bucket.cap; x += 1) {
        const i = y * COLS + ((x * 7 + state.tick) % COLS);
        if (grid[i] === bucket.color) { grid[i] = -1; got += 1; bucket.got += 1; sucked.push({ slot, x: i % COLS }); }
      }
    }
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

// 模拟玩家：优先送颜色现在就在底下的桶，送不了就送底下最多的那种颜色排得最前的桶。
function botPlay(state, limit = 12000) {
  for (let t = 0; t < limit && outcome(state) === 'playing'; t += 1) {
    if (t % 3 === 0) {
      const free = state.belt.slice(0, state.beltSize).some((b) => !b);
      if (free) {
        const bottom = new Map();
        for (let i = (ROWS - 2) * COLS; i < ROWS * COLS; i += 1) if (state.grid[i] >= 0) bottom.set(state.grid[i], (bottom.get(state.grid[i]) ?? 0) + 1);
        const want = (lane) => { const b = state.lanes[lane][0]; return b ? (bottom.get(b.color) ?? 0) - state.belt.filter((x) => x && x.color === b.color).length * 40 : -Infinity; };
        const lanes = [0, 1, 2].filter((l) => state.lanes[l].length).sort((a, b) => want(b) - want(a));
        if (lanes.length && want(lanes[0]) > 0) send(state, lanes[0]);
      }
    }
    step(state);
  }
  return outcome(state);
}
export function createLevel(level, seed = levelSeed('sand', level)) {
  const shape = levelShape(level);
  const rand = rng(seed);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const grid = paint(rand, shape);
    const list = shuffle(buckets(rand, grid, shape.cap), rand);
    // 大致按颜色从下往上的顺序排，再搅乱一部分；越往后搅得越乱
    const depth = new Map();
    for (let i = grid.length - 1; i >= 0; i -= 1) if (grid[i] >= 0 && !depth.has(grid[i])) depth.set(grid[i], ROWS - Math.floor(i / COLS));
    const chaos = Math.min(0.85, 0.25 + level * 0.05);
    const key = new Map(list.map((b) => [b, depth.get(b.color) + (rand() - 0.5) * 40 * chaos]));
    list.sort((a, b) => key.get(a) - key.get(b));
    const lanes = [[], [], []];
    list.forEach((b, i) => lanes[i % LANES].push(b));
    const trial = createState(Int8Array.from(grid), lanes.map((l) => l.map((b) => ({ ...b }))), seed + attempt);
    if (botPlay(trial) === 'won') return { level, seed, ...createState(grid, lanes, seed + attempt) };
  }
  // 实在模拟不过：退回按颜色深度严格排好的顺序（最容易）
  const grid = paint(rand, shape);
  const depth = new Map();
  for (let i = grid.length - 1; i >= 0; i -= 1) if (grid[i] >= 0 && !depth.has(grid[i])) depth.set(grid[i], ROWS - Math.floor(i / COLS));
  const list = buckets(rand, grid, shape.cap).sort((a, b) => depth.get(a.color) - depth.get(b.color));
  const lanes = [[], [], []];
  list.forEach((b, i) => lanes[i % LANES].push(b));
  return { level, seed, ...createState(grid, lanes, seed) };
}
export { botPlay as autoplay };
