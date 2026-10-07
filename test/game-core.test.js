import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, tickGame, matchAt, settleRising, cellCenter, ROWS, COLS } from '../game-core.js';
const blank = (rows = ROWS, cols = COLS) => Array.from({ length: rows }, () => Array(cols).fill(null));

test('all three modes have playable, reproducible initial states', () => {
  for (const mode of ['pop2', 'pop3', 'surge']) {
    const a = createGame(mode, 42), b = createGame(mode, 42);
    assert.ok(a && a.phase === 'playing'); assert.deepEqual(a, b);
    assert.ok(a.board.flat().some(Boolean)); assert.equal(a.players.length, 2);
  }
});
test('hex matching follows staggered neighbours and ignores stone obstacles', () => {
  const board = blank(); board[1][3] = board[2][3] = board[2][4] = 'pink'; board[1][4] = 'stone';
  assert.equal(matchAt(board, 1, 3).length, 3); assert.deepEqual(matchAt(board, 1, 4), []);
});
test('a physical shot removes three matches and drops unsupported bubbles', () => {
  const state = createGame('pop2', 4); state.board = blank();
  state.board[0][7] = state.board[1][7] = 'pink'; state.board[2][8] = 'cyan';
  state.players[0].current = 'pink';
  // Hit the side of the pink root instead of the cyan below it.
  const target = cellCenter(1, 7);
  act(state, 0, { type: 'aim', x: target.x - 44, y: target.y }); act(state, 0, { type: 'fire' });
  for (let i = 0; i < 90; i++) tickGame(state, 1 / 60);
  assert.ok(state.score >= 400); assert.ok(state.cleared >= 4);
});
test('projectiles bounce off side walls before attaching', () => {
  const state = createGame('pop3', 5);
  act(state, 0, { type: 'aim', x: 5, y: 560 }); act(state, 0, { type: 'fire' });
  for (let i = 0; i < 36; i++) tickGame(state, 1 / 60);
  assert.ok(state.projectiles[0]?.vx > 0); assert.ok(state.projectiles[0]?.x >= 21);
});
test('bubble pressure reaching the planet ends the round', () => {
  const state = createGame('pop2', 9); state.board = blank();
  state.board[ROWS - 1][2] = 'yellow'; state.riseIn = 0.001; tickGame(state, 0.02);
  assert.equal(state.phase, 'lost');
});
test('rising puzzle grabs a color stack and returns it to form a match', () => {
  const state = createGame('surge', 1); state.board = blank(12, 10);
  state.board[11][0] = 'pink'; state.board[11][1] = state.board[10][1] = 'pink';
  act(state, 0, { type: 'column', col: 0 });
  assert.equal(act(state, 0, { type: 'grab' }), true); assert.deepEqual(state.players[0].held, ['pink']);
  act(state, 0, { type: 'column', col: 1 }); tickGame(state, 0.05); tickGame(state, 0.05); tickGame(state, 0.05); act(state, 0, { type: 'fire' });
  assert.equal(state.board.flat().filter(Boolean).length, 0); assert.ok(state.score >= 300);
});
test('rising matches cascade after gravity and reward the second chain', () => {
  const state = createGame('surge', 1); state.board = blank(12, 10);
  state.board[11][0] = state.board[11][1] = state.board[10][1] = 'pink';
  state.board[10][0] = state.board[9][1] = state.board[11][2] = 'cyan';
  settleRising(state, [[11, 0]]);
  assert.equal(state.board.flat().filter(Boolean).length, 0); assert.equal(state.combo, 2); assert.equal(state.score, 900);
});
test('rising blocks overflowing the board end the round', () => {
  const state = createGame('surge', 1); state.board[0][0] = 'cyan'; state.riseIn = 0.001;
  tickGame(state, 0.02); assert.equal(state.phase, 'lost');
});
test('paused or ended games reject actions and do not advance', () => {
  const state = createGame('pop2', 1); state.phase = 'paused'; const before = structuredClone(state);
  assert.equal(act(state, 0, { type: 'fire' }), false); tickGame(state, 0.1); assert.deepEqual(state, before);
});
test('players have independent ammo, with invalid input ignored', () => {
  const state = createGame('pop3', 77);
  assert.equal(act(state, 99, { type: 'fire' }), false);
  assert.equal(act(state, 0, { type: 'aim', x: NaN, y: 0 }), false);
  const selected = state.players[0].next; assert.equal(act(state, 0, { type: 'select', color: selected }), true); assert.equal(state.players[0].current, selected);
  act(state, 1, { type: 'fire' }); assert.equal(state.players[0].current, selected); assert.equal(state.projectiles[0].player, 1);
});
