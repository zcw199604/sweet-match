// A greedy player for 空中大厨, used by the tests to check every stage can be cleared and to tune the numbers.
// It only taps when the chef has nothing left to do, at most once every `react` seconds, so it plays like a
// careful human rather than a perfect planner.
import { SKY, STATIONS, callAt, slotPhase, tapSeat, tapStation, tick } from '../skychef-core.js';

const count = (list) => list.reduce((map, dish) => map.set(dish, (map.get(dish) ?? 0) + 1), new Map());

export function decide(s) {
  if (s.queue.length) return null;
  const calls = [...s.calls].sort((a, b) => a.patience - b.patience);
  const cart = count(s.cart);
  const fits = (call) => { const have = new Map(cart); return call.left.every((d) => { const n = have.get(d) ?? 0; have.set(d, n - 1); return n > 0; }); };
  const some = (call) => call.left.some((d) => cart.get(d));
  const full = calls.find(fits);
  if (full) return { seat: full.seat };
  // What the waiting passengers still need beyond what is on the cart, most urgent first.
  const need = [];
  const spare = new Map(cart);
  for (const call of calls) for (const dish of call.left) {
    if (spare.get(dish)) spare.set(dish, spare.get(dish) - 1);
    else need.push(dish);
  }
  const room = s.cart.length < SKY.cart;
  const stationTap = () => {
    for (const [id, slots] of Object.entries(s.cookers)) if (slots.some((slot) => slotPhase(id, slot) === 'burnt')) return { station: id };
    if (room) for (const dish of need) if (s.cookers[dish]?.some((slot) => slotPhase(dish, slot) === 'ready')) return { station: dish };
    const coming = new Map();
    for (const [id, slots] of Object.entries(s.cookers)) for (const slot of slots) if (slot && slotPhase(id, slot) !== 'burnt') coming.set(id, (coming.get(id) ?? 0) + 1);
    for (const dish of need) {
      if (coming.get(dish)) { coming.set(dish, coming.get(dish) - 1); continue; }
      if (STATIONS[dish].cook === 0) { if (room) return { station: dish }; continue; }
      if (s.cookers[dish].includes(null)) return { station: dish };
    }
    return null;
  };
  if (s.pos === 0) {
    const tap = stationTap();
    if (tap) return tap;
    const part = calls.find(some);
    return part ? { seat: part.seat } : null;
  }
  const part = calls.find(some);
  if (part) return { seat: part.seat };
  return stationTap();
}

export function play(stateIn, { react = 0.45, step = 0.05 } = {}) {
  const s = stateIn;
  let wait = 0;
  for (let guard = 0; guard < 200_000 && !s.done; guard += 1) {
    wait -= step;
    if (wait <= 0) {
      const move = decide(s);
      if (move) {
        if (move.seat !== undefined && callAt(s, move.seat)) tapSeat(s, move.seat);
        else if (move.station) tapStation(s, move.station);
        wait = react;
      }
    }
    tick(s, step);
  }
  return s;
}
