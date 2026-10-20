// 羊了个羊（ARCADE 34）的规则：好几层互相压着的图案牌，只能拿没被上层压住的；拿起的牌进 7 格槽，
// 槽里凑齐 3 张同样的就消掉，槽塞满就输。底下两摞盲牌只露出最上面一张。
// 关卡按「见证顺序」发牌：先随机定一个合法的拿牌顺序，再按这个顺序每几组三张一起分配图案，所以一定有解。
import { levelSeed, randInt, rng, shuffle } from './kit-core.js';

export const SLOT = 7;
export const BOARD_COLS = 7;
export const BOARD_ROWS = 8;
export const KINDS = 16;
export const PROPS = { out: 1, undo: 1, shuffle: 1 };

// 第 n 关：图案种类、层数、每种几组、每次混几组（越大越难看出顺序）、盲牌摞数。
export function levelShape(level) {
  const n = Math.max(1, level);
  if (n === 1) return { kinds: 3, layers: 2, groups: 2, mix: 1, stacks: 0, stackSize: 0 };
  return {
    kinds: Math.min(KINDS, 5 + n),
    layers: Math.min(9, 3 + Math.floor(n / 2)),
    groups: Math.min(4, 2 + Math.floor(n / 4)),
    mix: Math.min(3, 1 + Math.floor(n / 3)),
    stacks: n >= 3 ? 2 : 0,
    stackSize: n >= 3 ? Math.min(12, 3 + n) : 0
  };
}

const overlaps = (a, b) => Math.abs(a.x - b.x) < 0.98 && Math.abs(a.y - b.y) < 0.98;
// 某张牌被哪些上层牌压着（只算还在桌上的）。
export function coveredBy(state, tile) {
  return state.tiles.filter((other) => other.where === 'board' && other.z > tile.z && overlaps(other, tile));
}
export const isFree = (state, id) => state.tiles[id]?.where === 'board' && coveredBy(state, state.tiles[id]).length === 0;

function layerPositions(rand, z, shape) {
  const ox = z % 2 ? 0.5 : 0, oy = z % 2 ? 0.5 : 0;
  const cols = BOARD_COLS - (ox ? 1 : 0), rows = BOARD_ROWS - (oy ? 1 : 0);
  const density = Math.max(0.28, 0.5 - z * 0.025);
  const out = [];
  for (let j = 0; j < rows; j += 1) {
    for (let i = 0; i < Math.ceil(cols / 2); i += 1) {
      if (rand() > density) continue;
      out.push({ x: ox + i, y: oy + j, z });
      const mirror = cols - 1 - i;
      if (mirror !== i) out.push({ x: ox + mirror, y: oy + j, z });
    }
  }
  return shape.layers > 2 ? out : out.filter((p) => p.y >= 2 && p.y <= 5 && p.x >= 1.5 && p.x <= 4.5);
}

export function createLevel(level, seed = levelSeed('sheep', level)) {
  const shape = levelShape(level);
  const rand = rng(seed);
  const want = shape.kinds * shape.groups * 3;
  const stackTotal = shape.stacks * shape.stackSize;
  let spots = [];
  for (let z = 0; spots.length < want - stackTotal && z < 40; z += 1) spots.push(...layerPositions(rand, z, shape));
  shuffle(spots, rand);
  spots.sort((a, b) => a.z - b.z);
  spots = spots.slice(0, Math.max(0, want - stackTotal));
  // 两摞盲牌：同一个位置一张压一张，往右下错开一点露出厚度。
  for (let s = 0; s < shape.stacks; s += 1) {
    for (let k = 0; k < shape.stackSize; k += 1) spots.push({ x: s ? 4.6 : 0.4, y: BOARD_ROWS + 0.35, z: k, dx: (s ? -1 : 1) * k * 0.06, blind: true, stack: s });
  }
  const tiles = spots.map((p, id) => ({ id, x: p.x + (p.dx ?? 0), y: p.y, z: p.z, stack: p.stack ?? -1, blind: Boolean(p.blind), type: -1, where: 'board' }));
  // 见证顺序：每次在还能拿的牌里随机挑一张。
  const state = { level, seed, tiles, slot: [], held: [], props: { ...PROPS }, last: null, moves: 0 };
  const order = [];
  while (order.length < tiles.length) {
    const free = tiles.filter((t) => t.where === 'board' && coveredBy(state, t).length === 0);
    const t = free[randInt(rand, free.length)];
    t.where = 'gone';
    order.push(t.id);
  }
  for (const t of tiles) t.where = 'board';
  const kinds = shuffle([...Array(KINDS).keys()], rand).slice(0, shape.kinds);
  const pool = shuffle(kinds.flatMap((k) => Array(shape.groups).fill(k)), rand); // 每个元素代表一组三张
  for (let g = 0; g < pool.length; g += shape.mix) {
    const window = pool.slice(g, g + shape.mix);
    const types = shuffle(window.flatMap((k) => [k, k, k]), rand);
    order.slice(g * 3, g * 3 + types.length).forEach((id, i) => { tiles[id].type = types[i]; });
  }
  state.witness = order;
  return state;
}

export const onBoard = (state) => state.tiles.filter((t) => t.where === 'board').length;
export const outcome = (state) => {
  if (state.tiles.every((t) => t.where === 'gone')) return 'won';
  if (state.slot.length >= SLOT) return 'lost';
  return 'playing';
};
// 槽里同类挨在一起：新牌插到最后一张同类后面。
function insert(state, id) {
  const type = state.tiles[id].type;
  let at = state.slot.length;
  for (let i = state.slot.length - 1; i >= 0; i -= 1) if (state.tiles[state.slot[i]].type === type) { at = i + 1; break; }
  state.slot.splice(at, 0, id);
  state.tiles[id].where = 'slot';
  const same = state.slot.filter((other) => state.tiles[other].type === type);
  if (same.length < 3) return null;
  const cleared = same.slice(0, 3);
  state.slot = state.slot.filter((other) => !cleared.includes(other));
  for (const other of cleared) state.tiles[other].where = 'gone';
  return cleared;
}
// 拿一张牌（桌上没被压住的，或移出区里的）。
export function pickTile(state, id) {
  const tile = state.tiles[id];
  if (!tile || outcome(state) !== 'playing') return { ok: false };
  const from = tile.where;
  if (from === 'board' && !isFree(state, id)) return { ok: false, reason: 'covered' };
  if (from !== 'board' && from !== 'held') return { ok: false };
  if (from === 'held') state.held = state.held.filter((other) => other !== id);
  const cleared = insert(state, id);
  state.moves += 1;
  state.last = cleared ? null : { id, from };
  return { ok: true, cleared };
}
// 道具：移出——把槽里前三张挪到槽上方的一排，之后可以再点回来。
export function useOut(state) {
  // 槽满输掉之后也能用：挪走三张就接着玩。
  if (state.props.out <= 0 || !state.slot.length || state.held.length || outcome(state) === 'won') return false;
  state.props.out -= 1;
  state.held = state.slot.splice(0, 3);
  for (const id of state.held) state.tiles[id].where = 'held';
  state.last = null;
  return true;
}
// 撤回：上一张放回原处（凑成三张消掉的那一步不能撤）。
export function useUndo(state) {
  const last = state.last;
  if (state.props.undo <= 0 || !last || outcome(state) === 'won') return false;
  state.props.undo -= 1;
  state.slot = state.slot.filter((id) => id !== last.id);
  state.tiles[last.id].where = last.from;
  if (last.from === 'held') state.held.push(last.id);
  state.last = null;
  return true;
}
// 洗牌：桌上剩下的牌互换图案（位置不动）。
export function useShuffle(state, rand = Math.random) {
  if (state.props.shuffle <= 0 || outcome(state) !== 'playing') return false;
  const left = state.tiles.filter((t) => t.where === 'board');
  const types = shuffle(left.map((t) => t.type), rand);
  left.forEach((t, i) => { t.type = types[i]; });
  state.props.shuffle -= 1;
  state.last = null;
  return true;
}
// 提示：优先拿能和槽里凑成三张的，其次能凑成两张的。
export function findHint(state) {
  const free = state.tiles.filter((t) => t.where === 'held' || isFree(state, t.id));
  const count = (type) => state.slot.filter((id) => state.tiles[id].type === type).length;
  let best = null, score = -1;
  for (const t of free) {
    const s = count(t.type) * 10 + free.filter((o) => o.type === t.type).length - (t.blind ? 0.5 : 0);
    if (s > score) { score = s; best = t.id; }
  }
  return best;
}
