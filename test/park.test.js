import test from 'node:test';
import assert from 'node:assert/strict';
import { blocker, canExit, carCells, createLevel, exitable, findHint, LEVELS, outcome, PARK, pathCells, sendCar, settle, stageBonus, STAGES } from '../park-core.js';

// A hand-built level. Cars are [row, col, dir, len, color]; dir 0 up, 1 right, 2 down, 3 left.
function build(cars, queue, { cols = 5, rows = 5 } = {}) {
  return {
    stage: 1, seed: 1, cols, rows, queue: [...queue], slots: Array(PARK.SLOTS).fill(null), witness: [], total: queue.length, boarded: 0, moves: 0, score: 0,
    cars: cars.map(([r, c, dir, len, color], id) => ({ id, r, c, dir, len, color, cap: PARK.CAP[len], filled: 0, status: 'board' }))
  };
}
// Take the cars out in the order the generator promises works.
function playWitness(state) {
  for (const id of state.witness) {
    assert.equal(sendCar(state, id).ok, true, `car ${id} should be free to leave`);
    settle(state);
  }
  return outcome(state);
}

test('every stage is a valid, solvable level for any seed', () => {
  for (let stage = 1; stage <= STAGES; stage += 1) {
    for (const seed of [1, 2, 3, 99, 4242]) {
      const state = createLevel(stage, seed);
      const level = LEVELS[stage - 1];
      assert.equal(state.cols, level.cols);
      assert.ok(state.cars.length >= Math.ceil(level.cars * 0.6), `stage ${stage} seed ${seed}: only ${state.cars.length} cars`);
      // inside the grid, no two cars on one cell
      const seen = new Set();
      for (const car of state.cars) for (const [r, c] of carCells(car)) {
        assert.ok(r >= 0 && c >= 0 && r < state.rows && c < state.cols);
        assert.equal(seen.has(`${r},${c}`), false);
        seen.add(`${r},${c}`);
      }
      // the queue holds exactly the seats of each colour
      const seats = {}, waiting = {};
      for (const car of state.cars) seats[car.color] = (seats[car.color] ?? 0) + car.cap;
      for (const color of state.queue) waiting[color] = (waiting[color] ?? 0) + 1;
      assert.deepEqual(waiting, seats);
      assert.equal(state.total, state.queue.length);
      assert.equal(playWitness(state), 'won', `stage ${stage} seed ${seed}`);
      assert.equal(state.boarded, state.total);
    }
  }
});

test('the same seed deals the same level, another seed a different one', () => {
  const a = createLevel(4, 7), b = createLevel(4, 7), c = createLevel(4, 8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.cars, c.cars);
});

test('a car is blocked by anything between its nose and the edge, on either side of itself', () => {
  // The red car points right along row 2; a blue car sits two cells ahead.
  const state = build([[2, 0, 1, 2, 0], [2, 3, 0, 2, 1], [0, 0, 1, 2, 2]], [0]);
  assert.deepEqual(pathCells(state.cars[0], 5, 5), [[2, 2], [2, 3], [2, 4]]);
  assert.equal(blocker(state, state.cars[0]).id, 1);
  assert.equal(canExit(state, 0), false);
  // Behind the nose does not matter: the blue car points up, its tail below row 2 is irrelevant.
  assert.equal(canExit(state, 1), true);
  assert.equal(canExit(state, 2), true);
  assert.deepEqual(exitable(state), [1, 2]);
  // Once the blue car has gone the road is clear.
  sendCar(state, 1);
  assert.equal(canExit(state, 0), true);
});

test('sendCar refuses a blocked car, a car already gone and a full lot', () => {
  const state = build([[2, 0, 1, 2, 0], [2, 3, 0, 2, 1]], [0]);
  assert.deepEqual(sendCar(state, 0), { ok: false, reason: 'blocked', by: 1 });
  assert.equal(state.moves, 0);
  assert.deepEqual(sendCar(state, 1), { ok: true, slot: 0 });
  assert.deepEqual(sendCar(state, 1), { ok: false, reason: 'gone' });
  state.slots.fill(7);
  assert.deepEqual(sendCar(state, 0), { ok: false, reason: 'full' });
});

test('only the front of the queue boards, and a full car leaves its bay', () => {
  const state = build([[0, 0, 1, 2, 0], [2, 0, 1, 2, 1]], [1, 0, 0, 0, 0, 1, 1, 1]);
  sendCar(state, 0); // a red car
  assert.deepEqual(settle(state), []); // the front passenger is blue: nobody boards
  assert.equal(outcome(state), 'playing');
  sendCar(state, 1); // the blue car
  const events = settle(state);
  // blue boards first, then four reds fill the red car, then three blues finish the blue one
  assert.deepEqual(events.filter((e) => e.t === 'board').map((e) => e.color), [1, 0, 0, 0, 0, 1, 1, 1]);
  assert.deepEqual(events.filter((e) => e.t === 'depart').map((e) => e.id), [0, 1]);
  assert.deepEqual(state.slots, [null, null, null, null, null]);
  assert.equal(state.score, 8 * PARK.PER_PASSENGER);
  assert.equal(outcome(state), 'won');
});

test('two parked cars of one colour: the one that arrived first fills first', () => {
  const state = build([[0, 0, 1, 2, 0], [2, 0, 1, 2, 0]], [0, 0, 0, 0, 0, 0, 0, 0]);
  sendCar(state, 1);
  sendCar(state, 0);
  const events = settle(state);
  assert.deepEqual(events.filter((e) => e.t === 'depart').map((e) => e.id), [1, 0]);
});

test('lost: bays full with nobody to board, or nothing left that can drive out', () => {
  // Five colour-0 cars fill every bay while a colour-1 passenger waits at the front.
  const cars = Array.from({ length: 6 }, (_, i) => [i % 5, 0, 1, 2, i < 5 ? 0 : 1]);
  const full = build(cars, [1, 1, 1, 1]);
  for (let i = 0; i < 5; i += 1) sendCar(full, i);
  assert.equal(outcome(full), 'lost');
  // A free bay but the only car left is hemmed in by another one that cannot move either.
  const jam = build([[0, 0, 1, 2, 0], [0, 2, 3, 2, 1]], [0, 0, 0, 0, 1, 1, 1, 1]);
  assert.equal(outcome(jam), 'lost');
  assert.equal(outcome(build([[0, 0, 1, 2, 0]], [0, 0, 0, 0])), 'playing');
});

test('boarding scores five a head and clearing a stage pays by stage number', () => {
  const state = build([[0, 0, 1, 2, 0]], [0, 0, 0, 0]);
  sendCar(state, 0);
  settle(state);
  assert.equal(state.score, 4 * PARK.PER_PASSENGER);
  assert.equal(stageBonus({ stage: 3 }), 3 * PARK.STAGE_BONUS);
});

test('findHint names a car that can leave, and following hints wins every stage', () => {
  const state = build([[2, 0, 1, 2, 0], [2, 3, 0, 2, 1]], [1, 1, 1, 1, 0, 0, 0, 0]);
  assert.equal(findHint(state), 1); // blue is wanted first and the red one is behind it
  for (let stage = 1; stage <= STAGES; stage += 1) {
    const level = createLevel(stage, 31);
    for (let guard = 0; guard < 80 && outcome(level) === 'playing'; guard += 1) {
      const id = findHint(level);
      assert.notEqual(id, null, `stage ${stage}: no hint`);
      assert.equal(canExit(level, id), true);
      assert.equal(sendCar(level, id).ok, true);
      settle(level);
    }
    assert.equal(outcome(level), 'won', `stage ${stage}`);
  }
});
