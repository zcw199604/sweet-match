import test from 'node:test';
import assert from 'node:assert/strict';
import { createLevel, findPair, findPath, levelShape, link, outcome, remaining, reshuffle, tick, useHint, useShuffle } from '../mahjong-core.js';

// 手摆一桌：-1 是空位
const hand = (grid, gravity = 'none') => ({ level: 1, seed: 1, rows: grid.length, cols: grid[0].length, gravity, grid: grid.map((row) => [...row]), time: 100, left: 100, pairs: 0, cleared: 0, hints: 3, shuffles: 3, combo: 0, lastAt: -99, score: 0 });

test('two tiles connect with at most two turns, through empty cells or around the outside', () => {
  const state = hand([
    [1, 2, 3],
    [4, 5, 4],
    [6, 7, 8]
  ]);
  // 中间那张被围住，左右两个 4 只能绕外圈：上去、横过、下来要拐三次弯以上 → 连不上
  assert.equal(findPath(state, { r: 1, c: 0 }, { r: 1, c: 2 }), null);
  state.grid[0][0] = -1; state.grid[0][1] = -1; state.grid[0][2] = -1;
  // 上面一排空了：上、右、下，两个弯
  const path = findPath(state, { r: 1, c: 0 }, { r: 1, c: 2 });
  assert.deepEqual(path.at(0), [1, 0]);
  assert.deepEqual(path.at(-1), [1, 2]);
  assert.ok(path.length <= 4);
  // 外圈：第一行两头，直接从牌阵上面绕
  const edge = hand([[9, 1, 9], [2, 3, 4]]);
  assert.ok(findPath(edge, { r: 0, c: 0 }, { r: 0, c: 2 }));
});

test('linking removes both tiles, scores combos within three seconds, and different tiles do nothing', () => {
  const state = hand([[1, 1, 2, 2]]);
  assert.equal(link(state, { r: 0, c: 0 }, { r: 0, c: 2 }).reason, 'differ');
  assert.equal(link(state, { r: 0, c: 0 }, { r: 0, c: 1 }, 10).ok, true);
  assert.equal(link(state, { r: 0, c: 2 }, { r: 0, c: 3 }, 11).ok, true);
  assert.equal(state.combo, 2);
  assert.equal(state.score, 10 + 15);
  assert.equal(outcome(state), 'won');
});

test('gravity squeezes the tiles toward one side after a pair goes', () => {
  // 消掉之后还剩能连的对子，不会触发自动洗牌
  const state = hand([[5, 1], [6, 1], [5, 6]], 'down');
  link(state, { r: 0, c: 1 }, { r: 1, c: 1 });
  assert.deepEqual(state.grid.map((row) => row[1]), [-1, -1, 6]);
  const left = hand([[3, 3, 4, 4]], 'left');
  const result = link(left, { r: 0, c: 0 }, { r: 0, c: 1 });
  assert.deepEqual(left.grid[0], [4, 4, -1, -1]);
  // 挪了位置的牌都报出来，画面靠它做滑动
  assert.deepEqual(result.moves, [{ from: [0, 2], to: [0, 0] }, { from: [0, 3], to: [0, 1] }]);
  const still = hand([[3, 3, 4, 4]]);
  assert.deepEqual(link(still, { r: 0, c: 0 }, { r: 0, c: 1 }).moves, []);
  assert.deepEqual(still.grid[0], [-1, -1, 4, 4]);
});

test('classic levels never move; move mode turns down, left, up, right from level 1', () => {
  for (const level of [1, 4, 5, 9, 30]) assert.equal(levelShape(level).gravity, 'none');
  assert.deepEqual([1, 2, 3, 4, 5].map((level) => levelShape(level, 'move').gravity), ['down', 'left', 'up', 'right', 'down']);
  const state = createLevel(6, 7, 'move');
  assert.equal(state.mode, 'move');
  assert.equal(state.gravity, 'left');
  assert.equal(createLevel(6, 7).gravity, 'none');
});

test('every level starts with a move, runs out of time, and props are limited', () => {
  for (const level of [1, 3, 4, 9, 20]) {
    const state = createLevel(level, 7);
    assert.ok(findPair(state));
    assert.equal(remaining(state), levelShape(level).pairs * 2);
  }
  const state = createLevel(2, 3);
  for (let i = 0; i < 3; i += 1) { assert.ok(useHint(state)); assert.equal(useShuffle(state), true); }
  assert.equal(useHint(state), null);
  assert.equal(useShuffle(state), false);
  assert.equal(reshuffle(state), true);
  tick(state, 9999);
  assert.equal(outcome(state), 'lost');
  assert.equal(link(state, findPair(state)?.[0] ?? { r: 0, c: 0 }, { r: 0, c: 1 }).ok, false);
});
