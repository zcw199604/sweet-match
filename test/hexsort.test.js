import test from 'node:test';
import assert from 'node:assert/strict';
import { CLEAR, cellsOf, createLevel, emptyCells, levelShape, outcome, place, resolve, topRun } from '../hexsort-core.js';

const hand = (radius = 1) => {
  const board = {};
  for (const { q, r } of cellsOf(radius)) board[`${q},${r}`] = [];
  return { level: 1, seed: 1, shape: { ...levelShape(1), target: 999 }, board, rocks: [], tray: [], cleared: 0, placed: 0, rand: () => 0.5 };
};

test('a board of radius r has the right number of cells and levels deal three stacks', () => {
  assert.equal(cellsOf(2).length, 19);
  assert.equal(cellsOf(3).length, 37);
  const state = createLevel(5, 2);
  assert.equal(state.tray.filter(Boolean).length, 3);
  assert.equal(state.rocks.length, levelShape(5).rocks);
  assert.ok(state.tray.every((stack) => stack.length >= 2 && stack.every((c) => c >= 0 && c < levelShape(5).colors)));
});

test('matching tops gather onto the longest run, and ten of a colour clear', () => {
  const state = hand();
  state.board['1,0'] = [2, 0, 0, 0];
  state.board['-1,0'] = [0, 0, 0, 0, 0];
  state.board['0,0'] = [1, 0];
  const events = resolve(state, '0,0');
  // 中间那片 0 和右边的三片都挪到左边那叠（最长的同色顶）上
  assert.deepEqual(state.board['-1,0'], Array(9).fill(0));
  assert.deepEqual(state.board['0,0'], [1]);
  assert.deepEqual(state.board['1,0'], [2]);
  assert.ok(events.every((e) => e.type === 'move'));
  state.board['0,-1'] = [];
  state.tray = [[3, 0], null, null];
  const more = place(state, 0, '0,-1');
  assert.ok(more.some((e) => e.type === 'clear' && e.count === CLEAR));
  assert.equal(state.cleared, CLEAR);
  assert.equal(topRun([1, 0, 0]), 2);
});

test('placing needs an empty cell; a full board loses and reaching the target wins', () => {
  const state = createLevel(1, 9);
  assert.equal(place(state, 0, 'nope'), null);
  const key = emptyCells(state)[0];
  assert.ok(place(state, 0, key));
  assert.equal(place(state, 1, key), null);
  for (const k of Object.keys(state.board)) if (!state.board[k].length) state.board[k] = [k.length % 7, (k.length + 3) % 7];
  assert.equal(outcome(state), 'lost');
  state.cleared = state.shape.target;
  assert.equal(outcome(state), 'won');
});
