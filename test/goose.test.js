import test from 'node:test';
import assert from 'node:assert/strict';
import { clearGoose, createGoose, GOOSE, gooseCanPick, landGoose, pickGoose, tickGoose } from '../goose-core.js';

// Pick the first pile item of `type` and let it land; returns the triple it completed.
const take = (state, type) => {
  const item = state.pile.find(entry => entry.type === type);
  const { slot } = pickGoose(state, item.id);
  assert.notEqual(slot, -1);
  return landGoose(state, item.id);
};
const types = (state) => state.tray.map(entry => entry.type);

test('a classic round deals 99 items as whole triples of every type', () => {
  const state = createGoose('classic', 7);
  assert.equal(state.pile.length, GOOSE.ITEMS);
  const counts = new Map();
  for (const item of state.pile) counts.set(item.type, (counts.get(item.type) || 0) + 1);
  assert.equal(counts.size, GOOSE.TYPES);
  for (const count of counts.values()) assert.equal(count % 3, 0);
  assert.equal(new Set(state.pile.map(item => item.id)).size, GOOSE.ITEMS);
  assert.deepEqual(createGoose('classic', 7), state);
  assert.notDeepEqual(createGoose('classic', 8).pile, state.pile);
});

test('item counts round down to whole triples', () => {
  assert.equal(createGoose('classic', 1, { items: 20 }).pile.length, 18);
  assert.equal(createGoose('classic', 1, { items: 1 }).pile.length, 3);
});

test('three of a kind match only once the third has landed, then free their slots', () => {
  const state = createGoose('classic', 3);
  take(state, 0); take(state, 0);
  const third = state.pile.find(entry => entry.type === 0);
  pickGoose(state, third.id);
  assert.deepEqual(state.tray.map(entry => entry.status), ['resting', 'resting', 'flying']);
  const triple = landGoose(state, third.id);
  assert.equal(triple.length, 3);
  assert.ok(state.tray.every(entry => entry.status === 'matching'));
  clearGoose(state, triple);
  assert.equal(state.tray.length, 0);
  assert.equal(state.cleared, 3);
});

test('a picked item joins the others of its type in the tray', () => {
  const state = createGoose('classic', 4);
  take(state, 1); take(state, 2); take(state, 1);
  assert.deepEqual(types(state), [1, 1, 2]);
});

test('the tray refuses an eighth item and a jammed tray ends the round', () => {
  const state = createGoose('classic', 5);
  for (const type of [0, 0, 1, 1, 2, 2]) take(state, type);
  assert.equal(state.phase, 'playing');
  take(state, 3);
  assert.equal(state.tray.length, GOOSE.TRAY);
  assert.equal(state.phase, 'over');
  assert.equal(gooseCanPick(state), false);
  assert.equal(pickGoose(state, state.pile[0].id).slot, -1);
});

test('a seventh item that completes a triple keeps the round alive', () => {
  const state = createGoose('classic', 6);
  for (const type of [0, 0, 1, 1, 2, 2]) take(state, type);
  const triple = take(state, 2);
  assert.equal(triple.length, 3);
  assert.equal(state.phase, 'playing');
  clearGoose(state, triple);
  assert.deepEqual(types(state), [0, 0, 1, 1]);
});

test('emptying the bowl and the tray wins a classic round', () => {
  const state = createGoose('classic', 9, { items: 9, types: 3 });
  for (const type of [0, 1, 2]) {
    take(state, type); take(state, type);
    clearGoose(state, take(state, type));
  }
  assert.equal(state.pile.length, 0);
  assert.equal(state.phase, 'won');
});

test('endless mode tops the bowl up, adds time per triple and ends on the clock', () => {
  const state = createGoose('endless', 11);
  let added = [];
  // Clear whole triples until a pick drops the bowl below the threshold.
  while (!added.length) {
    const type = state.pile[0].type;
    for (let i = 0; i < 3; i += 1) {
      const item = state.pile.find(entry => entry.type === type);
      const result = pickGoose(state, item.id);
      added = added.length ? added : result.added;
      const triple = landGoose(state, item.id);
      if (triple.length) clearGoose(state, triple);
    }
  }
  assert.equal(added.length, GOOSE.REFILL_TRIPLES * 3);
  assert.ok(state.pile.length >= GOOSE.REFILL_BELOW);
  assert.equal(state.timeLeft, GOOSE.ENDLESS_TIME + (state.cleared / 3) * GOOSE.MATCH_BONUS);
  tickGoose(state, 1000);
  assert.equal(state.phase, 'over');
  assert.equal(state.timeLeft, 0);
});

test('the classic clock only counts while the round is on', () => {
  const state = createGoose('classic', 2);
  tickGoose(state, 1.5);
  state.phase = 'won';
  tickGoose(state, 3);
  assert.equal(state.elapsed, 1.5);
});
