import test from 'node:test';
import assert from 'node:assert/strict';
import { BELT, COLS, ROWS, STALL, addSlot, autoplay, createLevel, createState, outcome, sandLeft, send, step } from '../sand-core.js';

const at = (x, y) => y * COLS + x;
function tiny(cells, lanes) {
  const grid = new Int8Array(COLS * ROWS).fill(-1);
  for (const [x, y, c] of cells) grid[at(x, y)] = c;
  return createState(grid, lanes, 7);
}

test('sand falls straight down, and slides sideways off a pile', () => {
  const state = tiny([[5, 0, 1], [10, ROWS - 2, 2], [10, ROWS - 3, 2]], [[], [], []]);
  for (let i = 0; i < ROWS + 4; i += 1) step(state);
  assert.equal(state.grid[at(5, ROWS - 1)], 1);
  // 两粒叠着的沙子：上面那粒滑到旁边
  assert.equal(state.grid[at(10, ROWS - 1)], 2);
  assert.equal(state.grid[at(9, ROWS - 1)] === 2 || state.grid[at(11, ROWS - 1)] === 2, true);
});

test('a bucket on the belt sucks its own colour from the bottom and leaves when full', () => {
  const state = tiny([[1, ROWS - 1, 3], [2, ROWS - 1, 3], [3, ROWS - 1, 4]], [[{ color: 3, cap: 2, got: 0 }], [{ color: 4, cap: 1, got: 0 }], []]);
  assert.deepEqual(send(state, 0), { slot: 0, merged: -1 });
  let done = [];
  for (let i = 0; i < 5; i += 1) done = done.concat(step(state).done);
  assert.deepEqual(done, [{ slot: 0, color: 3 }]);
  assert.equal(state.grid[at(3, ROWS - 1)], 4);
  assert.equal(sandLeft(state), 1);
  send(state, 1);
  for (let i = 0; i < 3; i += 1) step(state);
  assert.equal(outcome(state), 'won');
});

test('three buckets of a colour merge, a jammed belt loses after a while, and one extra slot can be added', () => {
  const lanes = [[{ color: 1, cap: 5, got: 0 }, { color: 1, cap: 5, got: 0 }, { color: 1, cap: 5, got: 0 }], [], []];
  const state = tiny([[0, ROWS - 10, 2]], lanes);
  send(state, 0); send(state, 0);
  assert.equal(send(state, 0).merged, 0);
  assert.equal(state.belt[0].cap, 15);
  assert.equal(state.belt.filter(Boolean).length, 1);
  const jam = tiny([[0, ROWS - 1, 2]], [Array.from({ length: BELT }, (_, i) => ({ color: 4 + i, cap: 9, got: 0 })), [], []]);
  for (let i = 0; i < BELT; i += 1) send(jam, 0);
  assert.equal(send(jam, 0), null);
  for (let i = 0; i < STALL + 2; i += 1) step(jam);
  assert.equal(outcome(jam), 'lost');
  assert.equal(addSlot(jam), true);
  assert.equal(outcome(jam), 'playing');
  assert.equal(addSlot(jam), false);
});

test('every generated level has exactly enough bucket room for its sand and the bot can clear it', () => {
  for (const level of [1, 3, 8]) {
    const state = createLevel(level, 11);
    const room = new Map();
    for (const b of state.lanes.flat()) room.set(b.color, (room.get(b.color) ?? 0) + b.cap);
    const sand = new Map();
    for (const c of state.grid) if (c >= 0) sand.set(c, (sand.get(c) ?? 0) + 1);
    assert.deepEqual([...room].sort(), [...sand].sort());
    assert.equal(autoplay(state), 'won');
  }
});
