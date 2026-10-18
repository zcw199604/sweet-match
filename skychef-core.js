// 空中大厨: the rules. A plane cabin seen from above: rows of four seats on either side of one aisle, and the
// galley behind the last row. Passengers press the call button with an order of one to three dishes and wait
// with a patience bar. The chef walks the aisle pushing a cart: in the galley she pours, brews and cooks
// (dispensers hand a dish over at once; cookers take a few seconds and the hot ones burn if left too long),
// loads the cart, then walks up to a row and hands over what the passenger asked for. Every tap is queued and
// carried out in order, so the skill is planning the walk. Nothing here touches the DOM, so
// test/skychef.test.js drives it directly; time only enters through `tick(state, seconds)`.
//
// A stage is a fixed list of orders (when they come and what they ask for), drawn from the stage's seed, so a
// retry is the same flight. The plane lands once every order has been served or has given up; the coins
// earned against the stage's three goals give the stars, and one star clears the stage.

export const SEATS_PER_ROW = 4; // two by the left window side, two by the right
export const SKY = { walk: 4, cart: 4, queue: 5, tip: 0.5, refill: 0.25, firstOrder: 1.5, maxDt: 0.25 };

export const DISHES = {
  juice: { name: '橙汁', price: 5 },
  coffee: { name: '咖啡', price: 8 },
  toast: { name: '三明治', price: 12 },
  cake: { name: '小蛋糕', price: 10 },
  noodle: { name: '汤面', price: 15 },
  meal: { name: '牛排饭', price: 20 }
};
// One station per dish. `cook` 0 is a dispenser; otherwise it has `slots` and, when `burn` > 0, a cooked dish
// left in it that many seconds turns to charcoal.
export const STATIONS = {
  juice: { name: '果汁机', cook: 0 },
  coffee: { name: '咖啡机', cook: 2.5, burn: 0, slots: 2 },
  toast: { name: '烤面包机', cook: 3.5, burn: 7, slots: 2 },
  cake: { name: '甜品柜', cook: 0 },
  noodle: { name: '汤锅', cook: 5, burn: 7, slots: 2 },
  meal: { name: '烤箱', cook: 6.5, burn: 7, slots: 2 }
};
export const STATION_ORDER = ['juice', 'coffee', 'toast', 'cake', 'noodle', 'meal'];

// Five routes of six stages; each route brings one more dish (the first brings two).
export const ROUTES = [
  { name: '上海 → 东京', adds: ['juice', 'coffee'] },
  { name: '东京 → 悉尼', adds: ['toast'] },
  { name: '悉尼 → 新加坡', adds: ['cake'] },
  { name: '新加坡 → 巴黎', adds: ['noodle'] },
  { name: '巴黎 → 纽约', adds: ['meal'] }
];
export const PER_ROUTE = 6;
export const STAGES = ROUTES.length * PER_ROUTE;
// Coins against the stage's base value (every dish's price, no tips) for one, two and three stars.
export const GOALS = [0.7, 1, 1.25];

export function stageConfig(stage) {
  const s = Math.max(1, Math.min(STAGES, Math.floor(stage)));
  const r = Math.floor((s - 1) / PER_ROUTE), k = (s - 1) % PER_ROUTE;
  const dishes = ROUTES.slice(0, r + 1).flatMap((route) => route.adds);
  return {
    stage: s,
    route: r,
    name: ROUTES[r].name,
    fresh: k === 0 ? ROUTES[r].adds : [],
    dishes,
    rows: [3, 4, 4, 5, 5][r],
    orders: 7 + r * 3 + k * 2,
    gap: 6.5 - r * 0.75 - k * 0.3,
    maxItems: r === 0 ? (k < 3 ? 1 : 2) : (r >= 3 && k >= 3 ? 3 : 2),
    patience: 24 - r * 1.5 - k * 0.5,
    perItem: 6,
    seed: s * 7919 + 13
  };
}

// mulberry32 on a number kept in the state, so a saved or copied state carries on the same.
function random(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// The orders of a stage: when each call comes (seconds into the flight) and the dishes asked for.
export function planOrders(config) {
  const rng = { rng: config.seed >>> 0 };
  const pool = [...config.dishes, ...config.fresh, ...config.fresh]; // a new dish shows up more on its first stage
  const orders = [];
  let t = SKY.firstOrder;
  for (let i = 0; i < config.orders; i += 1) {
    const roll = random(rng);
    const count = Math.min(config.maxItems, roll < 0.5 ? 1 : roll < 0.85 ? 2 : 3);
    const items = Array.from({ length: count }, () => pool[Math.floor(random(rng) * pool.length)]);
    items.sort((a, b) => STATION_ORDER.indexOf(a) - STATION_ORDER.indexOf(b));
    orders.push({ t: Math.round(t * 100) / 100, items });
    t += config.gap * (0.7 + 0.6 * random(rng));
  }
  return orders;
}

export const orderValue = (items) => items.reduce((sum, dish) => sum + DISHES[dish].price, 0);

export function createStage(stage) {
  const config = stageConfig(stage);
  const orders = planOrders(config);
  const base = orders.reduce((sum, order) => sum + orderValue(order.items), 0);
  return {
    stage: config.stage,
    config,
    orders,
    goals: GOALS.map((share) => Math.round(base * share)),
    rng: (config.seed ^ 0x9e3779b9) >>> 0,
    time: 0,
    next: 0, // index of the next order to come
    calls: [], // active orders: { seat, items, left (still owed), patience, max, id }
    cookers: Object.fromEntries(config.dishes.filter((d) => STATIONS[d].cook > 0).map((d) => [d, Array.from({ length: STATIONS[d].slots }, () => null)])),
    cart: [],
    queue: [], // { kind: 'station', id } | { kind: 'serve', seat }
    pos: 0, // where the chef is: 0 is the galley, row i (0 nearest the galley) is i + 1
    coins: 0,
    served: 0,
    missed: 0,
    ids: 0,
    done: false
  };
}

export const rowOf = (seat) => Math.floor(seat / SEATS_PER_ROW);
export const seatCount = (state) => state.config.rows * SEATS_PER_ROW;
export const callAt = (state, seat) => state.calls.find((call) => call.seat === seat) ?? null;
const placeOf = (action) => (action.kind === 'serve' ? rowOf(action.seat) + 1 : 0);

// What a cooker slot holds: null, or { dish, t } with t seconds since it went in.
export function slotPhase(dish, slot) {
  if (!slot) return 'empty';
  const { cook, burn } = STATIONS[dish];
  if (slot.t < cook) return 'cooking';
  if (burn > 0 && slot.t >= cook + burn) return 'burnt';
  return 'ready';
}

// A tap only queues an action; it is checked again when the chef gets there.
export function tapStation(state, id) {
  if (state.done || !state.config.dishes.includes(id)) return { ok: false, reason: 'none' };
  if (state.queue.length >= SKY.queue) return { ok: false, reason: 'queue' };
  state.queue.push({ kind: 'station', id });
  return { ok: true };
}
export function tapSeat(state, seat) {
  if (state.done || !callAt(state, seat)) return { ok: false, reason: 'none' };
  if (state.queue.length >= SKY.queue) return { ok: false, reason: 'queue' };
  state.queue.push({ kind: 'serve', seat });
  return { ok: true };
}
// The cart rides with the chef, so throwing a dish away needs no walk.
export function discard(state, index) {
  if (state.done || index < 0 || index >= state.cart.length) return null;
  return state.cart.splice(index, 1)[0];
}

function runStation(state, id, events) {
  const station = STATIONS[id];
  const full = state.cart.length >= SKY.cart;
  if (station.cook === 0) {
    if (full) { events.push({ type: 'full', station: id }); return; }
    state.cart.push(id);
    events.push({ type: 'load', station: id, dish: id });
    return;
  }
  const slots = state.cookers[id];
  const burnt = slots.findIndex((slot) => slotPhase(id, slot) === 'burnt');
  if (burnt >= 0) { slots[burnt] = null; events.push({ type: 'trash', station: id, slot: burnt }); return; }
  const ready = slots.findIndex((slot) => slotPhase(id, slot) === 'ready');
  if (ready >= 0) {
    if (full) { events.push({ type: 'full', station: id }); return; }
    slots[ready] = null;
    state.cart.push(id);
    events.push({ type: 'load', station: id, dish: id, slot: ready });
    return;
  }
  const free = slots.indexOf(null);
  if (free < 0) { events.push({ type: 'busy', station: id }); return; }
  slots[free] = { dish: id, t: 0 };
  events.push({ type: 'cook', station: id, slot: free });
}

function runServe(state, seat, events) {
  const call = callAt(state, seat);
  if (!call) return;
  let handed = 0;
  for (let i = call.left.length - 1; i >= 0; i -= 1) {
    const at = state.cart.indexOf(call.left[i]);
    if (at < 0) continue;
    state.cart.splice(at, 1);
    call.left.splice(i, 1);
    handed += 1;
  }
  if (!handed) { events.push({ type: 'nomatch', seat }); return; }
  if (call.left.length) {
    call.patience = Math.min(call.max, call.patience + call.max * SKY.refill);
    events.push({ type: 'hand', seat, count: handed });
    return;
  }
  const value = orderValue(call.items);
  const tip = Math.round(value * SKY.tip * (call.patience / call.max));
  state.coins += value + tip;
  state.served += 1;
  state.calls.splice(state.calls.indexOf(call), 1);
  events.push({ type: 'pay', seat, value, tip, coins: value + tip });
}

// Walk toward the first queued place; on arrival do the action and go on with the time left.
function walk(state, dt, events) {
  let time = dt;
  while (state.queue.length) {
    const action = state.queue[0];
    // An order that gave up (or was already served) is not worth the walk.
    if (action.kind === 'serve' && !callAt(state, action.seat)) { state.queue.shift(); continue; }
    const target = placeOf(action);
    const gap = Math.abs(target - state.pos);
    const step = SKY.walk * time;
    if (step < gap) { state.pos += Math.sign(target - state.pos) * step; return; }
    state.pos = target;
    time -= gap / SKY.walk;
    state.queue.shift();
    if (action.kind === 'station') runStation(state, action.id, events);
    else runServe(state, action.seat, events);
  }
}

function call(state, events) {
  while (state.next < state.orders.length && state.orders[state.next].t <= state.time) {
    const free = [];
    for (let seat = 0; seat < seatCount(state); seat += 1) if (!callAt(state, seat)) free.push(seat);
    if (!free.length) return; // everyone is already waiting; the next call comes as soon as a seat frees up
    const order = state.orders[state.next];
    const seat = free[Math.floor(random(state) * free.length)];
    const max = state.config.patience + state.config.perItem * (order.items.length - 1);
    state.ids += 1;
    state.calls.push({ id: state.ids, seat, items: [...order.items], left: [...order.items], patience: max, max });
    state.next += 1;
    events.push({ type: 'call', seat, items: [...order.items] });
  }
}

export function tick(state, seconds) {
  const events = [];
  if (state.done) return events;
  const dt = Math.max(0, Math.min(SKY.maxDt, seconds));
  state.time += dt;
  for (const [id, slots] of Object.entries(state.cookers)) {
    for (let i = 0; i < slots.length; i += 1) {
      if (!slots[i]) continue;
      const before = slotPhase(id, slots[i]);
      slots[i].t += dt;
      const after = slotPhase(id, slots[i]);
      if (after !== before) events.push({ type: after, station: id, slot: i });
    }
  }
  walk(state, dt, events);
  for (let i = state.calls.length - 1; i >= 0; i -= 1) {
    const waiting = state.calls[i];
    waiting.patience -= dt;
    if (waiting.patience > 0) continue;
    state.calls.splice(i, 1);
    state.missed += 1;
    events.push({ type: 'leave', seat: waiting.seat });
  }
  call(state, events);
  if (state.next >= state.orders.length && !state.calls.length) {
    state.done = true;
    state.queue = [];
    events.push({ type: 'land', ...outcome(state) });
  }
  return events;
}

export function starsFor(state, coins = state.coins) {
  return state.goals.filter((goal) => coins >= goal).length;
}
export function outcome(state) {
  const stars = starsFor(state);
  return { coins: state.coins, stars, passed: stars >= 1, served: state.served, missed: state.missed };
}
