// 合成大西瓜: the rules. Fruits are circles falling into a box; two of the same level that touch
// become one of the next level, and two watermelons vanish. Nothing here touches the DOM, so
// test/suika.test.js drives it directly. The physics is a fixed 1/120 s step, so the same drops
// always play out the same; randomness (which fruit comes next) is injected as `rng`.

export const WORLD = { left: 30, right: 330, top: 130, floor: 520, line: 168, dropY: 86 };
export const LEVELS = [
  { name: '樱桃', r: 13 }, { name: '草莓', r: 18 }, { name: '葡萄', r: 24 }, { name: '橘子', r: 30 },
  { name: '柿子', r: 37 }, { name: '苹果', r: 44 }, { name: '梨', r: 52 }, { name: '桃', r: 60 },
  { name: '菠萝', r: 69 }, { name: '蜜瓜', r: 78 }, { name: '西瓜', r: 88 }
];
export const TOP_LEVEL = LEVELS.length - 1;
// Points for making a fruit of that level (cherries are never made, only dropped); a pair of watermelons is worth BURST.
export const SCORES = [0, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
export const BURST = 100;
// Only the five smallest are ever handed out; weights favour the small ones.
export const DROP_WEIGHTS = [5, 5, 4, 3, 2];
export const SUIKA = {
  dt: 1 / 120, gravity: 1500, restitution: 0.12, bounceMin: 80, airDrag: 0.9995, wallFriction: 0.985,
  contactFriction: 0.25, contactDamp: 0.996, iterations: 4, mergeSlop: 0.8,
  cooldown: 0.5, // between one drop and the next
  grace: 1, // a fresh drop above the line is not a problem until it has been in the box this long
  dangerTime: 2, // something stays over the line this long and the game ends
  comboWindow: 0.9, comboCap: 5, maxFruits: 160,
  sleepSpeed: 30, sleepTime: 0.35 // slower than this (px/s) for this long and a fruit is at rest until something moves it
};

const sqr = (v) => v * v;
const mass = (f) => sqr(f.r);
const pick = (rng) => {
  const total = DROP_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < DROP_WEIGHTS.length; i += 1) { roll -= DROP_WEIGHTS[i]; if (roll < 0) return i; }
  return DROP_WEIGHTS.length - 1;
};
function makeFruit(state, level, x, y, extra = {}) {
  return { id: state.nextId++, level, r: LEVELS[level].r, x, y, vx: 0, vy: 0, age: 0, still: 0, ...extra };
}

export function createState(rng = Math.random) {
  return {
    fruits: [], score: 0, drops: 0, nextId: 1, top: 0, watermelons: 0, over: false,
    current: pick(rng), next: pick(rng), cooldown: 0, danger: 0, combo: 0, comboT: Infinity, acc: 0, time: 0, rng
  };
}
// Rebuild a state from what was saved (or from a hand-made pile in a test): { fruits: [{ x, y, level }], score, drops, ... }.
// Anything odd is dropped; the fruits start at rest and the physics sorts out any small overlap.
export function restoreState(saved, rng = Math.random) {
  if (!saved || !Array.isArray(saved.fruits) || saved.fruits.length > SUIKA.maxFruits) return null;
  const state = createState(rng);
  for (const item of saved.fruits) {
    if (!item || !Number.isInteger(item.level) || item.level < 0 || item.level > TOP_LEVEL || !Number.isFinite(item.x) || !Number.isFinite(item.y)) return null;
    const r = LEVELS[item.level].r;
    const x = Math.min(WORLD.right - r, Math.max(WORLD.left + r, item.x));
    const y = Math.min(WORLD.floor - r, item.y);
    state.fruits.push(makeFruit(state, item.level, x, y, { age: 10 }));
    state.top = Math.max(state.top, item.level);
  }
  state.score = Math.max(0, Math.floor(Number(saved.score)) || 0);
  state.drops = Math.max(0, Math.floor(Number(saved.drops)) || 0);
  state.watermelons = Math.max(0, Math.floor(Number(saved.watermelons)) || 0);
  state.top = Math.max(state.top, Math.min(TOP_LEVEL, Math.floor(Number(saved.top)) || 0));
  if (Number.isInteger(saved.current) && saved.current >= 0 && saved.current < DROP_WEIGHTS.length) state.current = saved.current;
  if (Number.isInteger(saved.next) && saved.next >= 0 && saved.next < DROP_WEIGHTS.length) state.next = saved.next;
  return state;
}
export const snapshot = (state) => ({
  fruits: state.fruits.map(({ x, y, level }) => ({ x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, level })),
  score: state.score, drops: state.drops, watermelons: state.watermelons, top: state.top, current: state.current, next: state.next
});

// Where the held fruit may be let go: it has to stay inside the walls.
export const clampX = (level, x) => Math.min(WORLD.right - LEVELS[level].r, Math.max(WORLD.left + LEVELS[level].r, x));
export const canDrop = (state) => !state.over && state.cooldown <= 0;

export function drop(state, x) {
  if (!canDrop(state)) return { ok: false };
  const fruit = makeFruit(state, state.current, clampX(state.current, x), WORLD.dropY);
  state.fruits.push(fruit);
  state.drops += 1;
  state.top = Math.max(state.top, fruit.level);
  state.current = state.next;
  state.next = pick(state.rng);
  state.cooldown = SUIKA.cooldown;
  return { ok: true, fruit };
}

function walls(f) {
  const { restitution, bounceMin, wallFriction } = SUIKA;
  if (f.x - f.r < WORLD.left) { f.x = WORLD.left + f.r; if (f.vx < 0) f.vx = f.vx < -bounceMin ? -f.vx * restitution : 0; f.vy *= wallFriction; }
  else if (f.x + f.r > WORLD.right) { f.x = WORLD.right - f.r; if (f.vx > 0) f.vx = f.vx > bounceMin ? -f.vx * restitution : 0; f.vy *= wallFriction; }
  if (f.y + f.r > WORLD.floor) { f.y = WORLD.floor - f.r; if (f.vy > 0) f.vy = f.vy > bounceMin ? -f.vy * restitution : 0; f.vx *= wallFriction; }
}
// Push two overlapping circles apart (the lighter one moves more) and take the closing speed out of them.
function collide(a, b) {
  const rr = a.r + b.r;
  const dx = b.x - a.x, dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return;
  const d = Math.sqrt(d2);
  const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : -1;
  const overlap = rr - d;
  const ma = mass(a), mb = mass(b), total = ma + mb;
  a.x -= nx * overlap * mb / total; a.y -= ny * overlap * mb / total;
  b.x += nx * overlap * ma / total; b.y += ny * overlap * ma / total;
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return;
  const inv = 1 / ma + 1 / mb;
  const e = vn < -SUIKA.bounceMin ? SUIKA.restitution : 0;
  const j = -(1 + e) * vn / inv;
  a.vx -= j * nx / ma; a.vy -= j * ny / ma;
  b.vx += j * nx / mb; b.vy += j * ny / mb;
  // Friction along the contact, capped by how hard they pressed together.
  const tx = -ny, ty = nx;
  const vt = rvx * tx + rvy * ty;
  const jt = Math.max(-SUIKA.contactFriction * j, Math.min(SUIKA.contactFriction * j, -vt / inv));
  a.vx -= jt * tx / ma; a.vy -= jt * ty / ma;
  b.vx += jt * tx / mb; b.vy += jt * ty / mb;
  a.vx *= SUIKA.contactDamp; a.vy *= SUIKA.contactDamp; b.vx *= SUIKA.contactDamp; b.vy *= SUIKA.contactDamp;
}

function tick(state, events) {
  const { dt, gravity, airDrag } = SUIKA;
  const fruits = state.fruits;
  state.time += dt;
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.comboT += dt;
  for (const f of fruits) {
    f.px = f.x; f.py = f.y;
    f.vy += gravity * dt;
    f.x += f.vx * dt; f.y += f.vy * dt;
    f.vx *= airDrag; f.vy *= airDrag;
    f.age += dt;
  }
  for (let pass = 0; pass < SUIKA.iterations; pass += 1) {
    for (let i = 0; i < fruits.length; i += 1) for (let j = i + 1; j < fruits.length; j += 1) collide(fruits[i], fruits[j]);
    for (const f of fruits) walls(f);
  }
  // A pile that has stopped should stay stopped: judge each fruit by how far it really got this step (gravity alone
  // keeps adding a little speed that the contacts take straight back out).
  const calm = SUIKA.sleepSpeed * dt;
  for (const f of fruits) {
    if (Math.hypot(f.x - f.px, f.y - f.py) < calm) f.still += dt; else f.still = 0;
    if (f.still >= SUIKA.sleepTime) { f.vx = 0; f.vy = 0; }
  }
  // Touching fruits of one level merge. Each fruit takes part in one merge per step; a chain carries on over the next steps.
  const used = new Set();
  const born = [];
  for (let i = 0; i < fruits.length; i += 1) {
    const a = fruits[i];
    if (used.has(a.id)) continue;
    for (let j = i + 1; j < fruits.length; j += 1) {
      const b = fruits[j];
      if (used.has(b.id) || a.level !== b.level) continue;
      const dx = b.x - a.x, dy = b.y - a.y, reach = a.r + b.r + SUIKA.mergeSlop;
      if (dx * dx + dy * dy > reach * reach) continue;
      used.add(a.id); used.add(b.id);
      const x = (a.x * mass(a) + b.x * mass(b)) / (mass(a) + mass(b)), y = (a.y * mass(a) + b.y * mass(b)) / (mass(a) + mass(b));
      state.combo = state.comboT <= SUIKA.comboWindow ? state.combo + 1 : 1;
      state.comboT = 0;
      if (a.level === TOP_LEVEL) {
        state.score += BURST;
        events.push({ type: 'burst', x, y, level: a.level, from: [a.id, b.id], gained: BURST, combo: state.combo });
      } else {
        const level = a.level + 1;
        const bonus = 2 * Math.min(state.combo - 1, SUIKA.comboCap);
        const gained = SCORES[level] + bonus;
        state.score += gained;
        const fruit = makeFruit(state, level, x, y, {
          vx: (a.vx * mass(a) + b.vx * mass(b)) / (mass(a) + mass(b)), vy: (a.vy * mass(a) + b.vy * mass(b)) / (mass(a) + mass(b)), age: Math.max(a.age, b.age)
        });
        born.push(fruit);
        state.top = Math.max(state.top, level);
        if (level === TOP_LEVEL) state.watermelons += 1;
        events.push({ type: 'merge', id: fruit.id, x, y, level, from: [a.id, b.id], gained, combo: state.combo });
      }
      break;
    }
  }
  if (used.size) state.fruits = fruits.filter((f) => !used.has(f.id)).concat(born);
  // The box is full once a fruit that has had time to settle keeps poking over the line.
  const over = state.fruits.some((f) => f.age >= SUIKA.grace && f.y - f.r < WORLD.line);
  state.danger = over ? state.danger + dt : 0;
  if (state.danger >= SUIKA.dangerTime) { state.over = true; events.push({ type: 'over' }); }
}

// Run the physics for `seconds` of game time (the view calls this once a frame). Returns what happened.
export function advance(state, seconds) {
  const events = [];
  if (state.over) return events;
  state.acc += Math.min(seconds, 0.1);
  while (state.acc >= SUIKA.dt && !state.over) {
    state.acc -= SUIKA.dt;
    tick(state, events);
  }
  return events;
}
// True while anything is still moving, so the view can go idle when the pile has settled.
export const isMoving = (state) => state.cooldown > 0 || state.fruits.some((f) => f.still < SUIKA.sleepTime);
