import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, D, MAX_LEVEL, R, ROWS, TOP, aimPath, cellCenter, colorsInGrid, count, createLevel, dropCeiling, dropFloating, neighbors, outcome, parity, setAim, settle, shoot, step, swap } from '../bubble-core.js';

const clearGrid = (state) => { for (const row of state.grid) row.fill(null); };

test('every level starts supported, clustered and with every color clearable', () => {
  for (const level of [1, 2, 5, 9, 13, 18, 24]) {
    const state = createLevel(level, 7);
    assert.ok(count(state) > 20, `level ${level} is too empty`);
    assert.ok(state.colors >= 4 && state.colors <= 7);
    // 所有泡泡都连着顶
    const attached = new Set();
    const queue = [];
    for (let c = 0; c < COLS; c += 1) if (state.grid[0][c] !== null) { attached.add(`0,${c}`); queue.push([0, c]); }
    while (queue.length) {
      const [r, c] = queue.pop();
      for (const [nr, nc] of neighbors(r, c, parity(state, r))) {
        if (state.grid[nr][nc] === null || attached.has(`${nr},${nc}`)) continue;
        attached.add(`${nr},${nc}`);
        queue.push([nr, nc]);
      }
    }
    assert.equal(attached.size, count(state), `level ${level} has floating bubbles`);
    // 每个同色连通块至少三颗，才消得掉
    const seen = new Set();
    for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
      const color = state.grid[r][c];
      if (color === null || seen.has(`${r},${c}`)) continue;
      const group = [[r, c]];
      seen.add(`${r},${c}`);
      for (let i = 0; i < group.length; i += 1) {
        const [gr, gc] = group[i];
        for (const [nr, nc] of neighbors(gr, gc, parity(state, gr))) {
          if (state.grid[nr][nc] !== color || seen.has(`${nr},${nc}`)) continue;
          seen.add(`${nr},${nc}`);
          group.push([nr, nc]);
        }
      }
      assert.ok(group.length >= 3, `level ${level} has a ${group.length}-bubble color at ${r},${c}`);
    }
    for (const [r, c] of [[0, 0], [1, 6], [ROWS - 1, COLS - 1]]) {
      const p = cellCenter(state, r, c);
      assert.ok(p.x - R >= 0 && p.x + R <= 360, `cell ${r},${c} sticks out`);
    }
  }
});

test('shooting sends a bubble up, it bounces off the wall and sticks to the ceiling', () => {
  const state = createLevel(1, 3);
  clearGrid(state);
  state.shooter.current = 2;
  state.shooter.angle = -0.6;
  assert.equal(shoot(state), true);
  assert.ok(state.flying);
  const startY = state.flying.y;
  step(state, 0.01);
  assert.ok(state.flying.y < startY);
  // 一直飞到吸附
  for (let i = 0; i < 400 && state.flying; i += 1) step(state, 0.01);
  assert.equal(state.flying, null);
  assert.equal(count(state), 1);
});

test('three of the same color pop, and anything hanging off them drops', () => {
  const state = createLevel(1, 1);
  clearGrid(state);
  state.colors = 4;
  state.shooter.current = 0;
  // 顶排两颗同色 + 下面挂一颗别的颜色
  state.grid[0][0] = 0;
  state.grid[0][1] = 0;
  state.grid[1][0] = 1;
  // 补上第三颗同色
  state.grid[0][2] = 0;
  state.score = 0;
  const result = settle(state, 0, 2);
  assert.equal(result.popped, 3);
  assert.equal(result.dropped, 1, 'the purple bubble under the popped pair should fall');
  assert.equal(count(state), 0);
  assert.equal(outcome(state), 'won');
});

test('two of the same color stay on the board', () => {
  const state = createLevel(1, 1);
  clearGrid(state);
  state.grid[0][0] = 0;
  state.grid[0][1] = 0;
  const result = settle(state, 0, 1);
  assert.equal(result.popped, 0);
  assert.equal(count(state), 2);
});

test('an unsupported cluster falls on its own', () => {
  const state = createLevel(1, 1);
  clearGrid(state);
  state.grid[3][3] = 2;
  state.grid[3][4] = 2;
  state.grid[3][5] = 2;
  const dropped = dropFloating(state);
  assert.equal(dropped.length, 3);
  assert.equal(count(state), 0);
});

test('dropping the ceiling shifts everything down and keeps bubbles in place', () => {
  const state = createLevel(2, 1);
  clearGrid(state);
  state.grid[0][0] = 3;
  const before = cellCenter(state, 0, 0);
  const result = dropCeiling(state);
  assert.equal(result.lost, false);
  assert.equal(state.offset, 1);
  assert.equal(state.grid[1][0], 3);
  const after = cellCenter(state, 1, 0);
  assert.ok(Math.abs(before.x - after.x) < 0.001, 'the bubble should not jump sideways');
  assert.equal(after.y - before.y, 24, 'the bubble should move down exactly one row');
  assert.ok(state.grid[0].every((v) => v !== null), 'the new top row is full');
});

test('a full bottom row means the next ceiling drop loses', () => {
  const state = createLevel(1, 1);
  state.grid[ROWS - 1][0] = 1;
  const result = dropCeiling(state);
  assert.equal(result.lost, true);
  assert.equal(outcome(state), 'lost');
});

test('aiming clamps to the sides and draws a path that stops at the ceiling', () => {
  const state = createLevel(1, 2);
  setAim(state, 10000, 0);
  assert.ok(state.shooter.angle <= 1.32);
  setAim(state, -10000, 0);
  assert.ok(state.shooter.angle >= -1.32);
  setAim(state, 180, 300);
  const path = aimPath(state);
  assert.ok(path.pts.length >= 2);
  const last = path.pts.at(-1);
  assert.ok(last[1] >= TOP);
});

test('swap exchanges the current and next bubble', () => {
  const state = createLevel(3, 4);
  const a = state.shooter.current;
  const b = state.shooter.next;
  assert.equal(swap(state), true);
  assert.equal(state.shooter.current, b);
  assert.equal(state.shooter.next, a);
});

test('every color on the board can be shot', () => {
  const state = createLevel(9, 5);
  const colors = colorsInGrid(state);
  assert.ok(colors.includes(state.shooter.current));
  assert.ok(colors.includes(state.shooter.next));
  for (let i = 0; i < 20 && state.status === 'playing'; i += 1) {
    shoot(state);
    // 把球强行落回顶部并结算，模拟连续射击
    if (state.flying) {
      state.flying.y = TOP + R;
      step(state, 0.001);
    }
    if (state.status === 'playing') {
      assert.ok(colorsInGrid(state).includes(state.shooter.current), 'shooter color vanished from the board');
    }
  }
});

test('max level is playable and the constants match a portrait screen', () => {
  const state = createLevel(MAX_LEVEL, 1);
  assert.equal(state.level, MAX_LEVEL);
  assert.ok(state.dropEvery >= 5);
  assert.ok(TOP + ROWS * 24 < 640);
  assert.equal(D, R * 2);
});
