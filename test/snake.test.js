import test from 'node:test';
import assert from 'node:assert/strict';
import { LIVES, MAX_LEVEL, START_LENGTH, createLevel, foodAhead, freeCells, lengthOf, levelSpec, outcome, step, turn } from '../snake-core.js';

test('the level curve grows the board, then adds walls and finally wrap-around', () => {
  assert.equal(levelSpec(1).size, 12);
  assert.equal(levelSpec(1).walls, 0);
  assert.equal(levelSpec(1).wrap, false);
  assert.ok(levelSpec(10).walls > 0);
  assert.equal(levelSpec(21).wrap, true);
  assert.equal(levelSpec(MAX_LEVEL).size, 20);
  assert.ok(levelSpec(MAX_LEVEL).tick < levelSpec(1).tick);
  assert.equal(levelSpec(99).n, MAX_LEVEL);
});

test('every level starts with a clear run and a reachable board', () => {
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    for (const seed of [1, 7, 99]) {
      const state = createLevel(level, seed);
      const { rows, cols } = state;
      assert.equal(state.snake.length, START_LENGTH);
      const body = new Set(state.snake.map(([r, c]) => `${r},${c}`));
      assert.equal(body.size, START_LENGTH, 'snake overlaps itself at the start');
      for (const [r, c] of state.snake) assert.ok(r >= 0 && c >= 0 && r < rows && c < cols);
      for (const k of state.walls) {
        const r = Math.floor(k / cols), c = k % cols;
        assert.ok(!body.has(`${r},${c}`), 'wall on the snake');
      }
      assert.ok(state.food, 'no food');
      assert.ok(!body.has(`${state.food.r},${state.food.c}`), 'food inside the snake');
      assert.ok(!state.walls.has(state.food.r * cols + state.food.c), 'food inside a wall');
      assert.ok(state.need >= 3);
      // 障碍不能把地图切碎：从蛇头出发能走到所有空格
      const seen = new Set([state.snake[0][0] * cols + state.snake[0][1]]);
      const queue = [[state.snake[0][0], state.snake[0][1]]];
      while (queue.length) {
        const [r, c] = queue.pop();
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          let nr = r + dr, nc = c + dc;
          if (state.wrap) { nr = (nr + rows) % rows; nc = (nc + cols) % cols; }
          else if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
          const k = nr * cols + nc;
          if (seen.has(k) || state.walls.has(k)) continue;
          seen.add(k);
          queue.push([nr, nc]);
        }
      }
      assert.equal(seen.size, rows * cols - state.walls.size, `level ${level} is split by walls`);
    }
  }
});

test('the snake moves forward, grows on food and cannot turn back on itself', () => {
  const state = createLevel(1, 5);
  const [hr, hc] = state.snake[0];
  assert.equal(turn(state, 'left'), false);
  assert.equal(turn(state, 'up'), true);
  const result = step(state);
  assert.equal(result.died, false);
  assert.deepEqual(state.snake[0], [hr - 1, hc]);
  assert.equal(lengthOf(state), START_LENGTH);

  const fed = foodAhead(state);
  assert.ok(fed);
  const grew = step(state);
  assert.equal(grew.ate, true);
  assert.equal(lengthOf(state), START_LENGTH + 1);
  assert.equal(state.eaten, 1);
});

test('running into the edge costs a life and puts the snake back at the start', () => {
  const state = createLevel(3, 11);
  turn(state, 'up');
  for (let i = 0; i < 40 && state.lives === LIVES; i += 1) step(state);
  assert.equal(state.lives, LIVES - 1);
  assert.equal(state.snake.length, START_LENGTH);
  assert.equal(state.eaten, 0);
  assert.equal(state.status, 'playing');
  // 三次都撞掉就失败
  for (let round = 0; round < 2; round += 1) {
    turn(state, 'up');
    for (let i = 0; i < 40 && state.lives === LIVES - 1 - round; i += 1) step(state);
  }
  assert.equal(state.lives, 0);
  assert.equal(outcome(state), 'lost');
});

test('level 21 wraps around the edges instead of hitting them', () => {
  const state = createLevel(21, 3);
  state.snake = [[0, 0], [0, 1], [0, 2], [0, 3]];
  state.dir = [0, -1];
  state.next = [0, -1];
  state.walls = new Set();
  state.food = { r: 5, c: 5 };
  const before = state.lives;
  step(state);
  assert.deepEqual(state.snake[0], [0, state.cols - 1]);
  assert.equal(state.lives, before);
});

test('eating the last fruit wins the level', () => {
  const state = createLevel(2, 9);
  state.eaten = state.need - 1;
  assert.ok(foodAhead(state));
  const result = step(state);
  assert.equal(result.won, true);
  assert.equal(outcome(state), 'won');
});

test('a wall is fatal on a level that has them', () => {
  const state = createLevel(12, 21);
  assert.ok(state.walls.size > 0);
  const [wr, wc] = [...state.walls].map((k) => [Math.floor(k / state.cols), k % state.cols])[0];
  // 把蛇头摆到墙旁边，朝墙走一步
  state.snake = [[wr, wc - 1], [wr, wc - 2], [wr, wc - 3], [wr, wc - 4]].map(([r, c]) => [r, (c + state.cols) % state.cols]);
  state.dir = [0, 1];
  state.next = [0, 1];
  state.walls = new Set([wr * state.cols + wc]);
  const result = step(state);
  assert.equal(result.died, true);
  assert.equal(state.lives, LIVES - 1);
});

test('free cells never include the body or the walls', () => {
  const state = createLevel(15, 4);
  const free = new Set(freeCells(state).map(([r, c]) => `${r},${c}`));
  for (const [r, c] of state.snake) assert.ok(!free.has(`${r},${c}`));
  for (const k of state.walls) assert.ok(!free.has(`${Math.floor(k / state.cols)},${k % state.cols}`));
});
