import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, BURST, canDrop, clampX, createState, drop, DROP_WEIGHTS, isMoving, LEVELS, restoreState, SCORES, snapshot, SUIKA, TOP_LEVEL, WORLD } from '../suika-core.js';

const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// A pile written as fruits sitting where they are put; the physics then settles them.
const pile = (fruits, extra = {}) => restoreState({ fruits, ...extra });
const run = (state, seconds) => {
  const events = [];
  for (let t = 0; t < seconds; t += 0.05) events.push(...advance(state, 0.05));
  return events;
};
const mid = (WORLD.left + WORLD.right) / 2;
const floorY = (level) => WORLD.floor - LEVELS[level].r;

test('a new game holds nothing, and the fruit in hand and the next one are small ones', () => {
  const state = createState(seeded(3));
  assert.equal(state.fruits.length, 0);
  assert.equal(state.score, 0);
  assert.ok(state.current < DROP_WEIGHTS.length && state.next < DROP_WEIGHTS.length);
});

test('a dropped fruit falls to the floor and stays inside the walls', () => {
  const state = createState(seeded(3));
  state.current = 2;
  assert.equal(drop(state, 5).ok, true); // far left of the wall: it is let go at the nearest legal spot
  assert.equal(state.fruits[0].x, WORLD.left + LEVELS[2].r);
  run(state, 3);
  const f = state.fruits[0];
  assert.ok(Math.abs(f.y - floorY(2)) < 0.5);
  assert.ok(f.x - f.r >= WORLD.left - 0.01 && f.x + f.r <= WORLD.right + 0.01);
  assert.equal(isMoving(state), false);
});

test('drops are spaced by a short cooldown, and the next fruit becomes the one in hand', () => {
  const state = createState(seeded(5));
  const queued = state.next;
  assert.equal(canDrop(state), true);
  assert.equal(drop(state, mid).ok, true);
  assert.equal(state.current, queued);
  assert.equal(canDrop(state), false);
  assert.equal(drop(state, mid).ok, false);
  run(state, SUIKA.cooldown + 0.1);
  assert.equal(canDrop(state), true);
  assert.equal(state.drops, 1);
});

test('the held fruit can never be let go inside a wall', () => {
  for (let level = 0; level <= TOP_LEVEL; level += 1) {
    const r = LEVELS[level].r;
    assert.equal(clampX(level, -999), WORLD.left + r);
    assert.equal(clampX(level, 999), WORLD.right - r);
    assert.equal(clampX(level, mid), mid);
  }
});

test('two fruits of the same level that touch become one of the next level and score for it', () => {
  const state = pile([{ x: mid - 18, y: floorY(1), level: 1 }, { x: mid + 18, y: floorY(1), level: 1 }]);
  const events = run(state, 1);
  assert.equal(state.fruits.length, 1);
  assert.equal(state.fruits[0].level, 2);
  assert.equal(state.score, SCORES[2]);
  const merge = events.find((e) => e.type === 'merge');
  assert.ok(merge && merge.level === 2 && merge.gained === SCORES[2] && merge.combo === 1);
  assert.equal(state.top, 2);
});

test('fruits of different levels just sit against each other', () => {
  const state = pile([{ x: mid - 30, y: floorY(1), level: 1 }, { x: mid + 30, y: floorY(2), level: 2 }]);
  run(state, 2);
  assert.equal(state.fruits.length, 2);
  assert.equal(state.score, 0);
});

test('merges that follow each other closely build a combo, which pays a little extra', () => {
  // Two separate pairs, one at each wall, both merge within the same moment.
  const state = pile([
    { x: WORLD.left + 40, y: floorY(1), level: 1 }, { x: WORLD.left + 76, y: floorY(1), level: 1 },
    { x: WORLD.right - 76, y: floorY(2), level: 2 }, { x: WORLD.right - 28, y: floorY(2), level: 2 }
  ]);
  const merges = run(state, 1).filter((e) => e.type === 'merge');
  assert.deepEqual(merges.map((e) => e.level), [2, 3]);
  assert.deepEqual(merges.map((e) => e.combo), [1, 2]);
  assert.equal(merges[1].gained, SCORES[3] + 2);
  assert.equal(state.score, SCORES[2] + SCORES[3] + 2);
});

test('a merge long after the last one starts a new combo', () => {
  const state = pile([{ x: mid - 18, y: floorY(1), level: 1 }, { x: mid + 18, y: floorY(1), level: 1 }]);
  run(state, 1);
  assert.equal(state.combo, 1);
  state.fruits.push({ ...state.fruits[0], id: 99, x: state.fruits[0].x + 48, vx: 0, vy: 0 }); // a second level-2 next to the new one
  run(state, SUIKA.comboWindow + 0.5);
  assert.equal(state.combo, 1);
});

test('two watermelons vanish together for a bonus', () => {
  const state = pile([{ x: mid, y: floorY(TOP_LEVEL), level: TOP_LEVEL }, { x: mid, y: floorY(TOP_LEVEL) - 2 * LEVELS[TOP_LEVEL].r, level: TOP_LEVEL }], { top: TOP_LEVEL });
  const events = run(state, 2);
  assert.equal(state.fruits.length, 0);
  assert.equal(state.score, BURST);
  assert.ok(events.some((e) => e.type === 'burst' && e.gained === BURST));
});

test('making a watermelon is counted', () => {
  const level = TOP_LEVEL - 1;
  const state = pile([{ x: mid - 30, y: floorY(level), level }, { x: mid + 30, y: floorY(level), level }]);
  run(state, 2);
  assert.equal(state.fruits.length, 1);
  assert.equal(state.fruits[0].level, TOP_LEVEL);
  assert.equal(state.watermelons, 1);
  assert.equal(state.top, TOP_LEVEL);
});

test('a pile of random drops settles inside the box and comes to rest', () => {
  const rng = seeded(11);
  const state = createState(rng);
  for (let i = 0; i < 30 && !state.over; i += 1) {
    drop(state, WORLD.left + rng() * (WORLD.right - WORLD.left));
    run(state, 1.5);
  }
  run(state, 12);
  assert.ok(state.fruits.length > 3);
  assert.ok(state.fruits.every((f) => f.x - f.r >= WORLD.left - 0.01 && f.x + f.r <= WORLD.right + 0.01 && f.y + f.r <= WORLD.floor + 0.01));
  if (!state.over) assert.equal(isMoving(state), false);
});

test('the same drops always play out the same way', () => {
  const play = () => {
    const rng = seeded(21);
    const state = createState(rng);
    for (let i = 0; i < 20 && !state.over; i += 1) { drop(state, WORLD.left + rng() * 300); run(state, 1); }
    return JSON.stringify(snapshot(state));
  };
  assert.equal(play(), play());
});

test('a fruit that stays over the line for two seconds ends the game, but a fresh drop above it does not', () => {
  const fresh = createState(seeded(1));
  drop(fresh, mid);
  run(fresh, 0.4); // still falling from above the line
  assert.equal(fresh.over, false);

  // A tower of unmergeable fruits (alternating levels) taller than the box.
  const fruits = [];
  for (let i = 0; i < 12; i += 1) fruits.push({ x: mid, y: WORLD.floor - 30 - i * 60, level: i % 2 ? 5 : 3 });
  const state = pile(fruits);
  const events = run(state, 2.5 + SUIKA.dangerTime);
  assert.equal(state.over, true);
  assert.equal(events.filter((e) => e.type === 'over').length, 1);
  assert.equal(drop(state, mid).ok, false);
  assert.deepEqual(advance(state, 1), []);
});

test('a pile that dips over the line for a moment is forgiven', () => {
  const state = pile([{ x: mid, y: WORLD.line + 10, level: 5 }]);
  state.fruits[0].y = WORLD.line + 10 - LEVELS[5].r + 5; // poking over the line right now
  state.fruits[0].age = 5;
  run(state, 0.3);
  assert.ok(state.danger > 0 || state.fruits[0].y + LEVELS[5].r >= WORLD.line);
  run(state, 3);
  assert.equal(state.over, false);
  assert.equal(state.danger, 0);
});

test('a saved game comes back as the same pile, with odd entries rejected', () => {
  const rng = seeded(8);
  const state = createState(rng);
  for (let i = 0; i < 10; i += 1) { drop(state, WORLD.left + rng() * 300); run(state, 1.5); }
  const saved = JSON.parse(JSON.stringify(snapshot(state)));
  const back = restoreState(saved);
  assert.equal(back.fruits.length, state.fruits.length);
  assert.equal(back.score, state.score);
  assert.equal(back.drops, state.drops);
  assert.equal(back.top, state.top);
  assert.equal(back.current, state.current);
  assert.equal(restoreState(null), null);
  assert.equal(restoreState({ fruits: [{ x: 100, y: 100, level: 99 }] }), null);
  assert.equal(restoreState({ fruits: [{ x: 'a', y: 100, level: 1 }] }), null);
  assert.equal(restoreState({ fruits: Array.from({ length: 500 }, () => ({ x: 100, y: 100, level: 1 })) }), null);
});

test('the level table is a proper ladder: bigger every step, and scores rise with the level', () => {
  for (let i = 1; i < LEVELS.length; i += 1) assert.ok(LEVELS[i].r > LEVELS[i - 1].r);
  for (let i = 2; i < SCORES.length; i += 1) assert.ok(SCORES[i] > SCORES[i - 1]);
  assert.equal(LEVELS.length, SCORES.length);
  // Even the biggest fruit fits through the box with room to spare.
  assert.ok(LEVELS[TOP_LEVEL].r * 2 < WORLD.right - WORLD.left);
});
