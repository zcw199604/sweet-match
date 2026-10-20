import test from 'node:test';
import assert from 'node:assert/strict';
import { SLOT, coveredBy, createLevel, findHint, isFree, outcome, pickTile, useOut, useShuffle, useUndo } from '../sheep-core.js';

const tile = (id, x, y, z, type) => ({ id, x, y, z, type, stack: -1, blind: false, where: 'board' });
const hand = (tiles) => ({ level: 1, seed: 1, tiles, slot: [], held: [], props: { out: 1, undo: 1, shuffle: 1 }, last: null, moves: 0 });

test('every level deals whole sets of three and its witness order clears it without filling the slot', () => {
  for (const level of [1, 2, 3, 6, 10, 25]) {
    for (const seed of [1, 5, 77]) {
      const state = createLevel(level, seed);
      const counts = new Map();
      for (const t of state.tiles) counts.set(t.type, (counts.get(t.type) ?? 0) + 1);
      for (const [type, n] of counts) { assert.ok(type >= 0); assert.equal(n % 3, 0); }
      for (const id of state.witness) {
        assert.equal(pickTile(state, id).ok, true, `level ${level} seed ${seed}: tile ${id} was not free`);
        assert.ok(state.slot.length < SLOT);
      }
      assert.equal(outcome(state), 'won');
    }
  }
});

test('a covered tile cannot be picked until the one on top is gone', () => {
  const state = hand([tile(0, 0, 0, 0, 1), tile(1, 0.5, 0.5, 1, 2)]);
  assert.deepEqual(coveredBy(state, state.tiles[0]).map((t) => t.id), [1]);
  assert.equal(pickTile(state, 0).reason, 'covered');
  assert.equal(pickTile(state, 1).ok, true);
  assert.equal(isFree(state, 0), true);
});

test('three of a kind in the slot clear, same kinds sit together, and seven left over lose', () => {
  const state = hand([0, 1, 0, 2, 0].map((type, id) => tile(id, id * 2, 0, 0, type)));
  pickTile(state, 0); pickTile(state, 1); pickTile(state, 2);
  assert.deepEqual(state.slot, [0, 2, 1]);
  const done = pickTile(state, 4);
  assert.deepEqual(done.cleared, [0, 2, 4]);
  assert.deepEqual(state.slot, [1]);
  const full = hand(Array.from({ length: SLOT }, (_, id) => tile(id, id * 2, 0, 0, id)));
  for (let id = 0; id < SLOT; id += 1) pickTile(full, id);
  assert.equal(outcome(full), 'lost');
  // 移出救场：前三张挪出去，接着玩
  assert.equal(useOut(full), true);
  assert.equal(full.slot.length, SLOT - 3);
  assert.equal(outcome(full), 'playing');
  assert.equal(pickTile(full, full.held[0]).ok, true);
  assert.equal(useOut(full), false);
});

test('undo puts the last tile back but not after a clear, and shuffle keeps the same tiles', () => {
  const state = hand([0, 0, 0, 1, 1, 1].map((type, id) => tile(id, id * 2, 0, 0, type)));
  pickTile(state, 3);
  assert.equal(useUndo(state), true);
  assert.equal(state.tiles[3].where, 'board');
  assert.equal(useUndo(state), false);
  const before = state.tiles.map((t) => t.type).sort();
  assert.equal(useShuffle(state, () => 0.3), true);
  assert.deepEqual(state.tiles.map((t) => t.type).sort(), before);
  pickTile(state, 0);
  assert.equal(findHint(state) !== null, true);
});
