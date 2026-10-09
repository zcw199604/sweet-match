// 挪车接客: the rules. No DOM, no timers — park.js plays the events back.
//
// A jam of cars on a grid, each pointing one way. A car can drive out when nothing stands
// between its nose and the edge of the board; it then parks in one of SLOTS bays. The
// passengers wait in a single queue, and only the one at the front may board: he steps into
// a parked car of his colour. A full car leaves, freeing its bay. You lose when the bays are
// full (or nothing can move) and the front of the queue has no car to board.
//
// Every level is solvable by construction: the cars are laid down one at a time, each with a
// clear road past the cars already there, so taking them out in the opposite order always
// works (`witness`). The queue is the witness order with its passengers shuffled inside
// windows of a few cars, which never needs more bays than the window holds.

export const PARK = {
  SLOTS: 5,
  CAP: { 2: 4, 3: 6 }, // passengers by car length
  STAGE_BONUS: 100,
  PER_PASSENGER: 5
};
export const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'];
// cars: how many to fit (the densest packing the road rule allows is a bit above this); colors: how many of COLORS; window: cars whose passengers get mixed.
export const LEVELS = [
  { cols: 5, rows: 6, cars: 7, colors: 3, window: 2 },
  { cols: 6, rows: 7, cars: 12, colors: 4, window: 3 },
  { cols: 7, rows: 8, cars: 17, colors: 5, window: 3 },
  { cols: 7, rows: 9, cars: 21, colors: 5, window: 4 },
  { cols: 8, rows: 9, cars: 24, colors: 6, window: 4 },
  { cols: 8, rows: 10, cars: 26, colors: 6, window: 4 },
  { cols: 9, rows: 10, cars: 28, colors: 7, window: 4 },
  { cols: 9, rows: 11, cars: 30, colors: 8, window: 4 }
];
export const STAGES = LEVELS.length;
// dir: 0 up, 1 right, 2 down, 3 left.
export const DR = [-1, 0, 1, 0];
export const DC = [0, 1, 0, -1];
export const isHorizontal = (dir) => dir === 1 || dir === 3;

function makeRng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
function shuffle(rng, list) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function carCells(car) {
  const cells = [];
  for (let i = 0; i < car.len; i += 1) cells.push(isHorizontal(car.dir) ? [car.r, car.c + i] : [car.r + i, car.c]);
  return cells;
}
// The cell its nose points at, and every cell from there to the edge of the board.
function frontCell(car) {
  const cells = carCells(car);
  return car.dir === 1 || car.dir === 2 ? cells[cells.length - 1] : cells[0];
}
export function pathCells(car, cols, rows) {
  const path = [];
  let [r, c] = frontCell(car);
  for (;;) {
    r += DR[car.dir];
    c += DC[car.dir];
    if (r < 0 || c < 0 || r >= rows || c >= cols) return path;
    path.push([r, c]);
  }
}

function layCars(rng, level) {
  const occupied = new Map(); // "r,c" -> car
  const cars = [];
  for (let attempt = 0; attempt < 6000 && cars.length < level.cars; attempt += 1) {
    const len = rng() < 0.28 ? 3 : 2;
    const dir = Math.floor(rng() * 4);
    const horizontal = isHorizontal(dir);
    const r = Math.floor(rng() * (level.rows - (horizontal ? 0 : len - 1)));
    const c = Math.floor(rng() * (level.cols - (horizontal ? len - 1 : 0)));
    const car = { id: cars.length, len, cap: PARK.CAP[len], r, c, dir, color: 0, filled: 0, status: 'board' };
    if (carCells(car).some(([cr, cc]) => occupied.has(`${cr},${cc}`))) continue;
    // Its road must be clear of the cars already laid; cars laid later may block it.
    if (pathCells(car, level.cols, level.rows).some(([pr, pc]) => occupied.has(`${pr},${pc}`))) continue;
    cars.push(car);
    for (const [cr, cc] of carCells(car)) occupied.set(`${cr},${cc}`, car);
  }
  return cars;
}

export function createLevel(stage = 1, seed = Date.now()) {
  const rng = makeRng(seed);
  const level = LEVELS[Math.min(Math.max(stage, 1), STAGES) - 1];
  const palette = COLORS.slice(0, level.colors);
  const cars = layCars(rng, level);
  // Deal colours so every colour shows up and none dominates.
  const deck = shuffle(rng, cars.map((_, index) => index % palette.length));
  cars.forEach((car, index) => { car.color = deck[index]; });
  const witness = cars.map((car) => car.id).reverse();
  const queue = [];
  for (let from = 0; from < witness.length; from += level.window) {
    const crowd = [];
    for (const id of witness.slice(from, from + level.window)) for (let i = 0; i < cars[id].cap; i += 1) crowd.push(cars[id].color);
    queue.push(...shuffle(rng, crowd));
  }
  return { stage: Math.min(Math.max(stage, 1), STAGES), seed, cols: level.cols, rows: level.rows, cars, queue, slots: Array(PARK.SLOTS).fill(null), witness, total: queue.length, boarded: 0, moves: 0, score: 0 };
}

export const freeSlot = (state) => state.slots.indexOf(null);
const standing = (state) => state.cars.filter((car) => car.status === 'board');

// The first car in the way of `car`, or null if the road is clear.
export function blocker(state, car) {
  const cells = new Map();
  for (const other of standing(state)) if (other !== car) for (const [r, c] of carCells(other)) cells.set(`${r},${c}`, other);
  for (const [r, c] of pathCells(car, state.cols, state.rows)) if (cells.has(`${r},${c}`)) return cells.get(`${r},${c}`);
  return null;
}
export const canExit = (state, id) => state.cars[id]?.status === 'board' && !blocker(state, state.cars[id]);
export const exitable = (state) => standing(state).filter((car) => !blocker(state, car)).map((car) => car.id);

// Drive a car out of the jam and into the first free bay.
export function sendCar(state, id) {
  const car = state.cars[id];
  if (!car || car.status !== 'board') return { ok: false, reason: 'gone' };
  const slot = freeSlot(state);
  if (slot < 0) return { ok: false, reason: 'full' };
  const block = blocker(state, car);
  if (block) return { ok: false, reason: 'blocked', by: block.id };
  car.status = 'slot';
  car.slot = slot;
  state.slots[slot] = id;
  state.moves += 1;
  car.arrived = state.moves; // breaks the tie between two parked cars of one colour
  return { ok: true, slot };
}

// The parked car the front passenger would step into: the one that has waited longest.
function boardingCar(state) {
  const color = state.queue[0];
  if (color === undefined) return null;
  const options = state.slots.map((id) => state.cars[id]).filter((car) => car && car.color === color && car.filled < car.cap);
  return options.sort((a, b) => a.arrived - b.arrived)[0] ?? null;
}
// Let passengers board and full cars leave until nothing more happens; returns what happened, in order.
export function settle(state) {
  const events = [];
  for (;;) {
    const car = boardingCar(state);
    if (car) {
      state.queue.shift();
      car.filled += 1;
      state.boarded += 1;
      state.score += PARK.PER_PASSENGER;
      events.push({ t: 'board', id: car.id, slot: car.slot, color: car.color });
      if (car.filled === car.cap) {
        car.status = 'gone';
        state.slots[car.slot] = null;
        events.push({ t: 'depart', id: car.id, slot: car.slot });
      }
      continue;
    }
    return events;
  }
}
export function outcome(state) {
  if (state.queue.length === 0) return 'won';
  if (boardingCar(state)) return 'playing';
  if (freeSlot(state) < 0) return 'lost';
  return exitable(state).length ? 'playing' : 'lost';
}
export const stageBonus = (state) => PARK.STAGE_BONUS * state.stage;

export function cloneLevel(state) {
  return { ...state, cars: state.cars.map((car) => ({ ...car })), queue: [...state.queue], slots: [...state.slots], witness: [...state.witness] };
}

// A move that keeps the level winnable, found by depth-first search with a node budget;
// null when the budget runs out first. Cars that serve the front of the queue come first.
export function findHint(state, budget = 6000) {
  let nodes = 0;
  const failed = new Set();
  const key = (s) => `${s.cars.map((car) => (car.status === 'board' ? 0 : 1)).join('')}|${s.queue.length}|${s.slots.map((id) => (id === null ? '-' : `${s.cars[id].color}${s.cars[id].filled}`)).sort().join(',')}`;
  const apply = (s, id) => {
    const result = sendCar(s, id);
    if (result.ok) settle(s);
    return result.ok;
  };
  const search = (s) => {
    if (s.queue.length === 0) return [];
    if (++nodes > budget) return null;
    const k = key(s);
    if (failed.has(k)) return false;
    const front = s.queue[0];
    const next = s.queue.slice(0, 6);
    const rank = (id) => (s.cars[id].color === front ? 0 : next.includes(s.cars[id].color) ? 1 : 2);
    for (const id of exitable(s).sort((a, b) => rank(a) - rank(b))) {
      const branch = cloneLevel(s);
      if (!apply(branch, id)) continue;
      const rest = search(branch);
      if (rest === null) return null;
      if (rest) return [id, ...rest];
    }
    failed.add(k);
    return false;
  };
  const line = search(cloneLevel(state));
  return line?.length ? line[0] : null;
}
