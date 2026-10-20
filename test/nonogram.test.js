import test from 'node:test';
import assert from 'node:assert/strict';
import { CROSS, FILL, LEVELS, cluesOf, createGame, generate, hintCell, isSolved, lineSolve, setCell, solveLine } from '../nonogram-core.js';

test('clues count the runs of filled cells in order', () => {
  assert.deepEqual(cluesOf([1, 1, 0, 1, 0, 0, 1, 1, 1]), [2, 1, 3]);
  assert.deepEqual(cluesOf([0, 0, 0]), []);
});

test('one line of reasoning finds the overlap and the forced gaps', () => {
  // 10 格里一段 8：中间 6 格一定是黑的
  assert.deepEqual(solveLine(Array(10).fill(-1), [8]), [-1, -1, 1, 1, 1, 1, 1, 1, -1, -1]);
  // 3 1 1 正好塞满 7 格
  assert.deepEqual(solveLine(Array(7).fill(-1), [3, 1, 1]), [1, 1, 1, 0, 1, 0, 1]);
  assert.equal(solveLine([1, 1, 1], [1]), null);
  assert.deepEqual(solveLine(Array(4).fill(-1), []), [0, 0, 0, 0]);
});

test('generated puzzles of every size are fully solvable line by line and match their own picture', () => {
  for (const level of Object.keys(LEVELS)) {
    for (const seed of [1, 2, 3, 10, 42]) {
      const puzzle = generate(level, seed);
      assert.equal(puzzle.size, LEVELS[level].size);
      const known = lineSolve(puzzle.size, puzzle.rows, puzzle.cols);
      assert.deepEqual(known, puzzle.solution);
    }
  }
  assert.deepEqual(generate('normal', 9).solution, generate('normal', 9).solution);
});

test('filling the picture solves the game, crosses do not matter, and a hint marks the game', () => {
  const game = createGame('easy', 5);
  game.solution.forEach((v, i) => { if (!v) setCell(game, i, CROSS); });
  assert.equal(isSolved(game), false);
  const cells = game.solution.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  for (const i of cells.slice(1)) setCell(game, i, FILL);
  assert.equal(game.done, false);
  assert.equal(game.hinted, false);
  hintCell(game, () => 0);
  assert.equal(game.hinted, true);
  assert.equal(game.done, true);
  assert.equal(setCell(game, 0, FILL), false);
});
