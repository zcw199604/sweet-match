import test from 'node:test';
import assert from 'node:assert/strict';
import { addFuel, burnFuel, buy, callAt, flightIn, FUEL, fuelAt, nextFuelIn, createStage, discard, DISHES, GOALS, kitFor, levelOf, nextCost, orderValue, outcome, planOrders, ROUTES, SKY, slotPhase, stageConfig, STAGES, STATIONS, tapSeat, tapStation, tick, UPGRADES } from '../skychef-core.js';
import { play } from './skychef-bot.js';

// Run the clock in small steps (tick swallows at most SKY.maxDt at a time) and collect the events.
function run(state, seconds, step = 0.05) {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += step) events.push(...tick(state, Math.min(step, seconds - t)));
  return events;
}
// A stage whose only order is far off (so it does not land), for hand-placed calls.
function quiet(stage = 1) {
  const state = createStage(stage);
  state.orders = [{ t: 9999, items: ['juice'] }];
  return state;
}
function seatCall(state, seat, items, patience = 20) {
  state.ids += 1;
  const call = { id: state.ids, seat, items: [...items], left: [...items], patience, max: patience };
  state.calls.push(call);
  return call;
}

test('thirty stages over five routes, each route adding a dish', () => {
  assert.equal(STAGES, 30);
  assert.deepEqual(stageConfig(1).dishes, ['juice', 'coffee']);
  assert.deepEqual(stageConfig(7).dishes, ['juice', 'coffee', 'toast']);
  assert.deepEqual(stageConfig(30).dishes, ['juice', 'coffee', 'toast', 'cake', 'noodle', 'meal']);
  assert.deepEqual(stageConfig(7).fresh, ['toast']);
  assert.deepEqual(stageConfig(8).fresh, []);
  assert.equal(stageConfig(99).stage, 30);
  assert.equal(ROUTES.length * 6, STAGES);
  for (let s = 1; s <= STAGES; s += 1) {
    const c = stageConfig(s);
    for (const dish of c.dishes) assert.ok(DISHES[dish] && STATIONS[dish], dish);
    assert.ok(c.gap > 1.5 && c.patience > 10, `stage ${s}`);
  }
});

test('a stage is the same flight every time: orders come from its seed, and goals from their value', () => {
  const a = createStage(12), b = createStage(12);
  assert.deepEqual(a.orders, b.orders);
  assert.equal(a.orders.length, stageConfig(12).orders);
  const base = a.orders.reduce((sum, o) => sum + orderValue(o.items), 0);
  assert.deepEqual(a.goals, GOALS.map((g) => Math.round(base * g)));
  // every order asks only for dishes on the menu, and no more than the stage allows
  for (let s = 1; s <= STAGES; s += 1) {
    const c = stageConfig(s);
    for (const order of planOrders(c)) {
      assert.ok(order.items.length >= 1 && order.items.length <= c.maxItems);
      assert.ok(order.items.every((d) => c.dishes.includes(d)));
    }
  }
  // times only go forward
  const times = a.orders.map((o) => o.t);
  assert.deepEqual(times, [...times].sort((x, y) => x - y));
});

test('a dispenser hands its dish to the cart once the chef is back in the galley', () => {
  const s = quiet();
  s.pos = 3;
  assert.equal(tapStation(s, 'juice').ok, true);
  run(s, 0.5);
  assert.deepEqual(s.cart, []); // still walking: 3 rows at 4 rows a second
  run(s, 0.3);
  assert.equal(s.pos, 0);
  assert.deepEqual(s.cart, ['juice']);
});

test('a cooker cooks, is collected with a second tap, and a hot dish left too long burns', () => {
  const s = quiet(13); // toast is on the menu
  tapStation(s, 'toast');
  run(s, 0.05);
  assert.equal(slotPhase('toast', s.cookers.toast[0]), 'cooking');
  tapStation(s, 'toast'); // second slot
  run(s, 0.05);
  assert.equal(slotPhase('toast', s.cookers.toast[1]), 'cooking');
  const events = run(s, STATIONS.toast.cook);
  assert.ok(events.some((e) => e.type === 'ready'));
  tapStation(s, 'toast');
  run(s, 0.05);
  assert.deepEqual(s.cart, ['toast']);
  assert.equal(s.cookers.toast.filter(Boolean).length, 1);
  const burnt = run(s, STATIONS.toast.burn);
  assert.ok(burnt.some((e) => e.type === 'burnt'));
  tapStation(s, 'toast'); // clears the charcoal, does not load it
  const trash = run(s, 0.05);
  assert.ok(trash.some((e) => e.type === 'trash'));
  assert.deepEqual(s.cart, ['toast']);
  assert.deepEqual(s.cookers.toast, [null, null]);
});

test('coffee never burns, and a cooker with both slots busy says so', () => {
  const s = quiet();
  tapStation(s, 'coffee'); tapStation(s, 'coffee'); tapStation(s, 'coffee');
  const events = run(s, 0.05);
  assert.ok(events.some((e) => e.type === 'busy'));
  run(s, 60);
  assert.ok(s.cookers.coffee.every((slot) => slotPhase('coffee', slot) === 'ready'));
});

test('the cart holds four dishes; a full cart refuses more and the dish stays where it is', () => {
  const s = quiet();
  for (let i = 0; i < SKY.cart; i += 1) tapStation(s, 'juice');
  run(s, 0.05);
  assert.equal(s.cart.length, SKY.cart);
  tapStation(s, 'juice');
  assert.ok(run(s, 0.05).some((e) => e.type === 'full'));
  assert.equal(s.cart.length, SKY.cart);
  assert.equal(discard(s, 0), 'juice');
  assert.equal(s.cart.length, SKY.cart - 1);
  assert.equal(discard(s, 9), null);
});

test('serving walks to the row, hands over what matches, and a full order pays the price plus a tip', () => {
  const s = quiet();
  s.cart = ['juice', 'coffee', 'juice'];
  const call = seatCall(s, 9, ['coffee', 'juice'], 20); // row 2
  call.patience = 10; // half the patience left → a quarter of the price as tip
  assert.equal(tapSeat(s, 9).ok, true);
  run(s, 0.5);
  assert.ok(s.pos > 0 && s.pos < 3);
  const events = run(s, 0.5);
  const pay = events.find((e) => e.type === 'pay');
  assert.ok(pay);
  assert.equal(pay.value, 13);
  assert.equal(pay.tip, Math.round(13 * SKY.tip * (call.patience / 20)));
  assert.equal(s.coins, pay.value + pay.tip);
  assert.deepEqual(s.cart, ['juice']);
  assert.equal(callAt(s, 9), null);
  assert.equal(s.served, 1);
});

test('a part of an order is handed over and tops up the patience; nothing matching hands nothing', () => {
  const s = quiet();
  s.cart = ['juice'];
  const call = seatCall(s, 0, ['coffee', 'juice'], 20);
  call.patience = 8;
  tapSeat(s, 0);
  const events = run(s, 0.3);
  assert.ok(events.some((e) => e.type === 'hand'));
  assert.deepEqual(call.left, ['coffee']);
  assert.ok(call.patience > 8 + 20 * SKY.refill - 1);
  tapSeat(s, 0);
  assert.ok(run(s, 0.05).some((e) => e.type === 'nomatch'));
});

test('taps queue up to five actions and run in order; a tap on a seat with no order is refused', () => {
  const s = quiet();
  assert.equal(tapSeat(s, 0).ok, false);
  for (let i = 0; i < SKY.queue; i += 1) assert.equal(tapStation(s, 'juice').ok, true);
  assert.deepEqual(tapStation(s, 'juice'), { ok: false, reason: 'queue' });
  assert.equal(tapStation(s, 'meal').ok, false); // not on stage 1's menu
});

test('an order that runs out of patience leaves, and the queued walk to it is dropped', () => {
  const s = quiet();
  s.pos = 0;
  seatCall(s, 8, ['juice'], 0.5); // row 2 is 0.75 s away
  tapSeat(s, 8);
  const events = run(s, 1.2);
  assert.ok(events.some((e) => e.type === 'leave'));
  assert.equal(s.missed, 1);
  assert.equal(s.queue.length, 0);
  assert.ok(s.pos < 3); // turned back instead of walking all the way
});

test('passengers call on schedule into free seats, and the plane lands once every order is done', () => {
  const s = createStage(1);
  const first = s.orders[0];
  assert.equal(s.calls.length, 0);
  run(s, first.t + 0.05);
  assert.equal(s.calls.length, 1);
  assert.deepEqual(s.calls[0].items, first.items);
  // nobody serves anybody: every order times out and the flight lands with nothing
  const events = run(s, 400, 0.25);
  const land = events.find((e) => e.type === 'land');
  assert.ok(land);
  assert.equal(s.done, true);
  assert.deepEqual(outcome(s), { coins: 0, stars: 0, passed: false, served: 0, missed: s.orders.length });
  assert.equal(tapStation(s, 'juice').ok, false);
});

test('a careful player clears every stage, and the last route is hard for a slow one', () => {
  for (let stage = 1; stage <= STAGES; stage += 1) {
    const s = play(createStage(stage), { react: 0.45 });
    assert.ok(s.done, `stage ${stage} landed`);
    assert.ok(outcome(s).passed, `stage ${stage}: ${s.coins} of ${s.goals[0]}`);
  }
  const early = play(createStage(1), { react: 1 });
  assert.equal(outcome(early).stars, 3);
  const late = play(createStage(30), { react: 1 });
  assert.ok(outcome(late).stars <= 1, `slow player got ${outcome(late).stars} stars on stage 30`);
});

test('upgrades are bought in order, cost coins, stop at the top level, and wait for their dish', () => {
  assert.equal(new Set(UPGRADES.map((u) => u.id)).size, UPGRADES.length);
  for (const u of UPGRADES) assert.equal(u.costs.length, u.says.length, u.id);
  const menu = stageConfig(1).dishes;
  assert.deepEqual(buy({}, 10_000, 'taste-meal', menu), { ok: false, reason: 'locked' });
  assert.deepEqual(buy({}, 10, 'cart', menu), { ok: false, reason: 'coins' });
  const first = buy({}, 2000, 'cart', menu);
  assert.deepEqual(first, { ok: true, owned: { cart: 1 }, wallet: 2000 - UPGRADES[0].costs[0], cost: UPGRADES[0].costs[0] });
  const second = buy(first.owned, first.wallet, 'cart', menu);
  assert.equal(second.ok, true);
  assert.equal(levelOf(second.owned, 'cart'), 2);
  assert.equal(nextCost(second.owned, 'cart'), null);
  assert.deepEqual(buy(second.owned, 99_999, 'cart', menu), { ok: false, reason: 'max' });
  assert.deepEqual(first.owned, { cart: 1 }); // nothing passed in is changed
  assert.equal(levelOf({ cart: 7 }, 'cart'), 2);
  assert.equal(levelOf({ cart: 'x' }, 'cart'), 0);
});

test('the kit carries the upgrades into a flight: cart, walk, patience, cookers and prices', () => {
  const base = kitFor({});
  assert.equal(base.cart, SKY.cart);
  assert.equal(base.walk, SKY.walk);
  assert.deepEqual(base.stations.toast, { cook: STATIONS.toast.cook, burn: STATIONS.toast.burn, slots: 2 });
  const kit = kitFor({ cart: 2, shoes: 1, seats: 2, 'fast-toast': 2, 'fast-coffee': 1, 'taste-juice': 2 });
  assert.equal(kit.cart, SKY.cart + 2);
  assert.ok(Math.abs(kit.walk - SKY.walk * 1.15) < 1e-9);
  assert.ok(Math.abs(kit.patience - 1.3) < 1e-9);
  assert.deepEqual(kit.stations.toast, { cook: STATIONS.toast.cook * 0.75, burn: STATIONS.toast.burn + 3, slots: 3 });
  assert.deepEqual(kit.stations.coffee, { cook: STATIONS.coffee.cook * 0.75, burn: 0, slots: 2 }); // coffee never burns
  assert.equal(kit.prices.juice, Math.round(DISHES.juice.price * 1.4));

  const s = createStage(13, { 'fast-toast': 2, 'taste-juice': 2, seats: 2 });
  s.orders = [{ t: 9999, items: ['juice'] }];
  assert.equal(s.cookers.toast.length, 3);
  for (let i = 0; i < 3; i += 1) tapStation(s, 'toast');
  run(s, 0.05);
  assert.ok(s.cookers.toast.every((slot) => slot && slotPhase('toast', slot) === 'cooking'));
  run(s, STATIONS.toast.cook * 0.75);
  assert.ok(s.cookers.toast.every((slot) => slotPhase('toast', slot) === 'ready'));
  // the dear juice pays its upgraded price; the goals stay on the base prices
  s.cart = ['juice'];
  s.calls.push({ id: 1, seat: 0, items: ['juice'], left: ['juice'], patience: 20, max: 20 });
  tapSeat(s, 0);
  const pay = run(s, 0.3).find((e) => e.type === 'pay');
  assert.equal(pay.value, kitFor({ 'taste-juice': 2 }).prices.juice);
  assert.deepEqual(s.goals, createStage(13).goals);
});

test('passengers wait longer in comfier seats, and upgrades lift a slow player on the last stage', () => {
  const plain = createStage(1), comfy = createStage(1, { seats: 2 });
  run(plain, plain.orders[0].t + 0.05);
  run(comfy, comfy.orders[0].t + 0.05);
  assert.ok(Math.abs(comfy.calls[0].max - plain.calls[0].max * 1.3) < 1e-9);
  const all = Object.fromEntries(UPGRADES.map((u) => [u.id, u.costs.length]));
  const before = outcome(play(createStage(28), { react: 1 }));
  const after = outcome(play(createStage(28, all), { react: 1 }));
  assert.ok(after.coins > before.coins * 1.5, `${before.coins} → ${after.coins}`);
  assert.ok(after.stars > before.stars);
});

test('pressure climbs over the stages, with calls that come in pairs, and each route opens gently', () => {
  for (let st = 2; st <= STAGES; st += 1) {
    const a = stageConfig(st - 1), b = stageConfig(st);
    if (b.fresh.length) continue; // a new route eases off for its first stage
    assert.ok(b.gap <= a.gap && b.patience <= a.patience && b.orders >= a.orders, `stage ${st}`);
  }
  const gaps = (st) => planOrders(stageConfig(st)).map((o, i, list) => (i ? o.t - list[i - 1].t : Infinity));
  assert.ok(gaps(30).some((g) => g < 0.5), 'late stages have calls right after one another');
  for (const st of [1, 7, 13, 19, 25]) {
    assert.equal(stageConfig(st).burst, 0, `stage ${st} opens a route`);
    assert.ok(gaps(st).every((g) => g > 1), `stage ${st}`);
  }
});

test('fuel: a flight burns ten, the tank refills a unit a minute even while closed, and never past full', () => {
  const t0 = 1_000_000;
  assert.deepEqual(fuelAt(null, t0), { fuel: FUEL.max, at: t0 }); // a new player starts full
  const first = burnFuel(fuelAt(null, t0), t0);
  assert.deepEqual(first, { ok: true, tank: { fuel: FUEL.max - FUEL.cost, at: t0 } });
  const minute = FUEL.every * 1000;
  assert.equal(fuelAt(first.tank, t0 + minute - 1).fuel, FUEL.max - FUEL.cost);
  assert.deepEqual(fuelAt(first.tank, t0 + minute * 2.5), { fuel: FUEL.max - FUEL.cost + 2, at: t0 + minute * 2 });
  assert.equal(nextFuelIn(fuelAt(first.tank, t0 + minute * 2.5), t0 + minute * 2.5), minute / 2);
  assert.deepEqual(fuelAt(first.tank, t0 + minute * 999), { fuel: FUEL.max, at: t0 + minute * 999 });
  // running dry
  const low = { fuel: 7, at: t0 };
  assert.deepEqual(burnFuel(low, t0), { ok: false, tank: low });
  assert.equal(flightIn(low, t0), 3 * minute);
  assert.equal(flightIn(low, t0 + minute * 3), 0);
  assert.equal(burnFuel(low, t0 + minute * 3).ok, true);
  // topping up stops at full; a broken or future-dated save is handled
  assert.deepEqual(addFuel(low, t0, 100), { fuel: FUEL.max, at: t0 });
  assert.deepEqual(addFuel(low, t0, FUEL.buy), { fuel: 17, at: t0 });
  assert.deepEqual(fuelAt({ fuel: 'x' }, t0), { fuel: FUEL.max, at: t0 });
  assert.deepEqual(fuelAt({ fuel: 3, at: t0 + 5000 }, t0), { fuel: 3, at: t0 });
});
