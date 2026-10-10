import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, applyMove, chooseAiMove } from '../gomoku-core.js';

test('五子棋交替落子，不能占用已有棋子或越界', () => {
  const state = createState();
  const result = applyMove(state, { to: 112 });
  assert.equal(result.ok, true);
  assert.equal(result.state.turn, 2);
  assert.equal(state.board[112], null);
  assert.equal(applyMove(result.state, { to: 112 }).ok, false);
  assert.equal(applyMove(state, { to: -1 }).ok, false);
});
test('五子棋四个方向五连获胜且结束后不能落子', () => {
  for (const step of [1, 15, 16, 14]) {
    let state = createState();
    for (let i = 0; i < 4; i++) state.board[37 + i * step] = { side: 1 };
    const result = applyMove(state, { to: 37 + 4 * step });
    assert.equal(result.state.winner, 1);
    assert.equal(applyMove(result.state, { to: 0 }).ok, false);
  }
});
test('电脑完成五连，并挡住对方立即获胜的位置', () => {
  for (const side of [1, 2]) {
    const state = createState(); state.turn = 2;
    state.board[105] = { side: 3 - side };
    for (let i = 1; i <= 4; i++) state.board[105 + i] = { side };
    assert.equal(chooseAiMove(state).to, 110);
  }
});
