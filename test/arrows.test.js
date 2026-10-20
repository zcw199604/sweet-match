import test from 'node:test';
import assert from 'node:assert/strict';
import { blocker, createLevel, findHint, headDir, LIVES, outcome, ray, stars, tapArrow } from '../arrows-core.js';

const hand = (arrows, rows = 4, cols = 4) => ({ level: 1, seed: 1, rows, cols, lives: LIVES, mistakes: 0, cleared: 0, arrows: arrows.map((cells, id) => ({ id, cells, color: 0, gone: false })) });

test('every generated level fills the grid without overlaps and can be cleared by following hints', () => {
  for (const level of [1, 2, 5, 9, 15, 30, 60]) {
    for (const seed of [1, 7, 99]) {
      const state = createLevel(level, seed);
      const seen = new Set();
      let cells = 0;
      for (const arrow of state.arrows) {
        assert.ok(arrow.cells.length >= 2);
        for (const [r, c] of arrow.cells) {
          assert.ok(r >= 0 && c >= 0 && r < state.rows && c < state.cols);
          assert.ok(!seen.has(`${r},${c}`), 'two arrows share a cell');
          seen.add(`${r},${c}`);
          cells += 1;
        }
        // 身子是相邻格子连成的
        for (let i = 1; i < arrow.cells.length; i += 1) {
          const [a, b] = [arrow.cells[i - 1], arrow.cells[i]];
          assert.equal(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]), 1);
        }
      }
      assert.ok(cells / (state.rows * state.cols) > 0.8, `level ${level} covers only ${cells}`);
      while (outcome(state) === 'playing') {
        const id = findHint(state);
        assert.notEqual(id, null, `level ${level} seed ${seed} got stuck`);
        assert.equal(tapArrow(state, id).ok, true);
      }
      assert.equal(outcome(state), 'won');
      assert.equal(stars(state), 3);
    }
  }
});

test('the same level and seed always deal the same arrows, and later levels are bigger', () => {
  assert.deepEqual(createLevel(4, 123).arrows, createLevel(4, 123).arrows);
  const small = createLevel(1), big = createLevel(30);
  assert.ok(big.rows * big.cols > small.rows * small.cols);
});

test('an arrow with something ahead of its head bounces back and costs a life; three bounces lose', () => {
  // 0 号朝右，它前面是 1 号（朝下，下面空着）
  const state = hand([[[0, 0], [0, 1]], [[0, 2], [1, 2]]]);
  assert.equal(headDir(state.arrows[0]), 1);
  assert.deepEqual(ray(state, state.arrows[0]), [[0, 2], [0, 3]]);
  assert.deepEqual(blocker(state, state.arrows[0]), { by: 1, steps: 0 });
  for (let i = 1; i <= LIVES; i += 1) {
    const hit = tapArrow(state, 0);
    assert.equal(hit.ok, false);
    assert.equal(hit.by, 1);
    assert.equal(state.lives, LIVES - i);
  }
  assert.equal(outcome(state), 'lost');
  assert.equal(tapArrow(state, 1).reason, 'idle');
});

test('clearing the blocker first frees the arrow behind it', () => {
  const state = hand([[[0, 0], [0, 1]], [[0, 2], [1, 2]]]);
  assert.equal(findHint(state), 1);
  assert.equal(tapArrow(state, 1).ok, true);
  assert.equal(blocker(state, state.arrows[0]), null);
  assert.equal(tapArrow(state, 0).ok, true);
  assert.equal(outcome(state), 'won');
  assert.equal(state.mistakes, 0);
});
