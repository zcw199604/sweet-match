import test from 'node:test';
import assert from 'node:assert/strict';
import { PICTURES, ROD, SPOOLS, addPeg, createLevel, findHint, isExposed, left, outcome, takeBall } from '../yarn-core.js';

const hand = (rows, spools, queue = []) => {
  const cols = rows[0].length;
  const balls = rows.join('').split('').map((ch) => (ch === '.' ? -1 : Number(ch)));
  return { level: 1, seed: 1, name: '测试', rows: rows.length, cols, balls, taken: balls.map(() => false), rod: [], rodSize: ROD, spools: spools.map((color) => ({ color, filled: 0 })), queue, extra: 1, moves: 0 };
};

test('only balls on the outside of the picture can be taken, and taking one opens the next ring', () => {
  const state = hand(['000', '010', '000'], [0, 1]);
  assert.equal(isExposed(state, 4), false);
  assert.equal(takeBall(state, 4), null);
  assert.ok(takeBall(state, 1));
  assert.equal(isExposed(state, 4), true);
});

test('balls go to a matching spool, wait on the rod otherwise, and a full spool makes way for the next', () => {
  const full = hand(['1112'], [1], [2]);
  assert.deepEqual(takeBall(full, 3).map((e) => e.type), ['to-rod']);
  takeBall(full, 0); takeBall(full, 1);
  const events = takeBall(full, 2);
  assert.deepEqual(events.map((e) => e.type), ['to-spool', 'spool-done', 'spool-new', 'rod-to-spool']);
  assert.deepEqual(full.rod, []);
  assert.equal(full.spools[0].color, 2);
  assert.equal(full.spools[0].filled, 1);
});

test('a full rod with nothing that fits loses, and one extra peg can be added', () => {
  const state = hand(['22222222'], [1]);
  for (let i = 0; i < ROD; i += 1) takeBall(state, i);
  assert.equal(outcome(state), 'lost');
  assert.equal(addPeg(state), true);
  assert.equal(outcome(state), 'playing');
  assert.equal(addPeg(state), false);
});

test('every picture balances to whole spools, and a greedy player clears the early levels', () => {
  for (let level = 1; level <= PICTURES.length; level += 1) {
    const state = createLevel(level, 3);
    const counts = new Map();
    state.balls.forEach((c) => { if (c >= 0) counts.set(c, (counts.get(c) ?? 0) + 1); });
    for (const n of counts.values()) assert.equal(n % 3, 0);
    assert.equal(state.queue.length + state.spools.filter(Boolean).length, left(state) / 3);
    assert.ok(state.spools.length <= SPOOLS);
    // 有能直接上线轴的就拿，否则拿第一个拿得到的
    for (let guard = 0; outcome(state) === 'playing' && guard < 400; guard += 1) takeBall(state, findHint(state));
    assert.equal(outcome(state), 'won', `level ${level}`);
  }
});
