// 拧螺丝（ARCADE 24）的规则：一层层半透明的板子用彩色螺丝钉在一起。
// 只有上面没被别的板子盖住的螺丝才拧得动；拧下来的螺丝自动进同色的螺丝盒（每盒 3 颗，同时摆出两盒），
// 没有同色盒就放进下面的暂存孔（5 个）。一块板子上的螺丝拧光它就掉下去。暂存孔塞满就输，螺丝全拧完过关。
// 关卡按「见证顺序」发色：先定一个合法的拧法，再按这个顺序每三颗一组分配颜色，螺丝盒也按这个顺序来，所以一定有解。
import { levelSeed, randInt, rng, shuffle } from './kit-core.js';

export const ACTIVE = 2;
export const HOLES = 5;
export const AREA = { w: 320, h: 340 };
export const COLORS = 8;
const SHAPES = [[150, 40], [110, 40], [40, 150], [40, 110], [96, 96], [120, 70], [70, 120], [180, 44]];

export function levelShape(level) {
  const n = Math.max(1, level);
  return {
    plates: Math.min(18, 3 + n),
    layers: Math.min(6, 2 + Math.floor(n / 3)),
    colors: Math.min(COLORS, 3 + Math.floor(n / 2)),
    mix: Math.min(3, 1 + Math.floor(n / 3))
  };
}
const inside = (plate, x, y) => x > plate.x + 4 && x < plate.x + plate.w - 4 && y > plate.y + 4 && y < plate.y + plate.h - 4;
// 盖住这颗螺丝的板子（更高层、还没掉、范围盖住螺丝位置）。
export function coverOf(state, screw) {
  const own = state.plates[screw.plate];
  return state.plates.filter((p) => !p.fallen && p.z > own.z && inside(p, screw.x, screw.y));
}
export const isFree = (state, id) => state.screws[id]?.where === 'board' && coverOf(state, state.screws[id]).length === 0;

function screwSpots(plate) {
  const m = 18;
  const { x, y, w, h } = plate;
  if (w >= h * 2) return [[x + m, y + h / 2], [x + w - m, y + h / 2], [x + w / 2, y + h / 2]];
  if (h >= w * 2) return [[x + w / 2, y + m], [x + w / 2, y + h - m], [x + w / 2, y + h / 2]];
  return [[x + m, y + m], [x + w - m, y + h - m], [x + w - m, y + m], [x + m, y + h - m]];
}
export function createLevel(level, seed = levelSeed('screw', level)) {
  const shape = levelShape(level);
  const rand = rng(seed);
  const plates = [], screws = [];
  for (let i = 0; i < shape.plates; i += 1) {
    const z = Math.floor((i * shape.layers) / shape.plates);
    const [w, h] = SHAPES[randInt(rand, SHAPES.length)];
    for (let tries = 0; tries < 30; tries += 1) {
      const plate = { id: plates.length, x: randInt(rand, AREA.w - w), y: randInt(rand, AREA.h - h), w, h, z, tint: randInt(rand, 6), fallen: false };
      const spots = screwSpots(plate);
      const want = Math.min(spots.length, 2 + randInt(rand, 2));
      const ok = spots.slice(0, want).filter(([sx, sy]) => screws.every((s) => Math.hypot(s.x - sx, s.y - sy) > 26));
      if (ok.length < Math.min(2, want)) continue;
      plates.push(plate);
      for (const [sx, sy] of ok) screws.push({ id: screws.length, plate: plate.id, x: sx, y: sy, color: -1, where: 'board' });
      break;
    }
  }
  // 螺丝数凑成 3 的倍数：从螺丝最多的板子上去掉几颗（每块至少留一颗）
  while (screws.length % 3) {
    const counts = plates.map((p) => screws.filter((s) => s.plate === p.id).length);
    const plate = counts.indexOf(Math.max(...counts));
    const drop = screws.findLastIndex((s) => s.plate === plate);
    screws.splice(drop, 1);
  }
  screws.forEach((s, i) => { s.id = i; });
  const state = { level, seed, plates, screws, queue: [], active: [], tray: [], holes: HOLES, extra: 1, moves: 0 };
  // 见证顺序：每次在拧得动的螺丝里随机挑一颗，板子拧光就掉
  const order = [];
  while (order.length < screws.length) {
    const free = screws.filter((s) => s.where === 'board' && coverOf(state, s).length === 0);
    const pick = free[randInt(rand, free.length)];
    pick.where = 'gone';
    order.push(pick.id);
    const plate = plates[pick.plate];
    if (screws.every((s) => s.plate !== plate.id || s.where !== 'board')) plate.fallen = true;
  }
  for (const s of screws) s.where = 'board';
  for (const p of plates) p.fallen = false;
  const triples = order.length / 3;
  const colors = shuffle([...Array(COLORS).keys()], rand).slice(0, shape.colors);
  const boxColors = Array.from({ length: triples }, (_, i) => colors[i % colors.length]);
  shuffle(boxColors, rand);
  for (let g = 0; g < triples; g += shape.mix) {
    const window = boxColors.slice(g, g + shape.mix);
    const kinds = shuffle(window.flatMap((c) => [c, c, c]), rand);
    order.slice(g * 3, g * 3 + kinds.length).forEach((id, i) => { screws[id].color = kinds[i]; });
  }
  state.queue = boxColors;
  state.witness = order;
  while (state.active.length < ACTIVE && state.queue.length) state.active.push({ color: state.queue.shift(), filled: [] });
  return state;
}

export const left = (state) => state.screws.filter((s) => s.where === 'board').length;
export const outcome = (state) => {
  if (state.screws.every((s) => s.where === 'gone')) return 'won';
  // 暂存孔满了，而且场上拧得动的螺丝没有一颗能直接进盒
  if (state.tray.length >= state.holes && !state.screws.some((s) => isFree(state, s.id) && state.active.some((b) => b && b.color === s.color && b.filled.length < 3))) return 'lost';
  return 'playing';
};
// 盒子装满就走，下一盒顶上来，暂存孔里同色的螺丝自动跳进新盒。events 记下这一串给画面回放。
function settle(state, events) {
  for (let changed = true; changed;) {
    changed = false;
    state.active.forEach((box, slot) => {
      if (box && box.filled.length === 3) {
        for (const id of box.filled) state.screws[id].where = 'gone';
        events.push({ type: 'box-done', slot, color: box.color });
        state.active[slot] = state.queue.length ? { color: state.queue.shift(), filled: [] } : null;
        if (state.active[slot]) events.push({ type: 'box-new', slot, color: state.active[slot].color });
        changed = true;
      }
    });
    for (const id of [...state.tray]) {
      const slot = state.active.findIndex((b) => b && b.color === state.screws[id].color && b.filled.length < 3);
      if (slot < 0) continue;
      state.tray = state.tray.filter((x) => x !== id);
      state.active[slot].filled.push(id);
      state.screws[id].where = 'box';
      events.push({ type: 'tray-to-box', id, slot, index: state.active[slot].filled.length - 1 });
      changed = true;
    }
  }
}
export function tapScrew(state, id) {
  const screw = state.screws[id];
  if (!screw || outcome(state) !== 'playing') return null;
  if (screw.where !== 'board' || !isFree(state, id)) return null;
  const events = [];
  const slot = state.active.findIndex((b) => b && b.color === screw.color && b.filled.length < 3);
  if (slot >= 0) {
    state.active[slot].filled.push(id);
    screw.where = 'box';
    events.push({ type: 'to-box', id, slot, index: state.active[slot].filled.length - 1 });
  } else {
    if (state.tray.length >= state.holes) return null;
    state.tray.push(id);
    screw.where = 'tray';
    events.push({ type: 'to-tray', id, index: state.tray.length - 1 });
  }
  const plate = state.plates[screw.plate];
  if (state.screws.every((s) => s.plate !== plate.id || s.where !== 'board')) { plate.fallen = true; events.push({ type: 'fall', plate: plate.id }); }
  state.moves += 1;
  settle(state, events);
  return events;
}
// 道具：多开一个暂存孔（每关一次）。
export function addHole(state) {
  if (state.extra <= 0 || outcome(state) === 'won') return false;
  state.extra -= 1;
  state.holes += 1;
  return true;
}
// 提示：优先能直接进盒的，其次能让板子掉下去的。
export function findHint(state) {
  const free = state.screws.filter((s) => isFree(state, s.id));
  const boxed = free.find((s) => state.active.some((b) => b && b.color === s.color && b.filled.length < 3));
  return (boxed ?? free[0])?.id ?? null;
}
