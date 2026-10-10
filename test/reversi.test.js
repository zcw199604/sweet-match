import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, legalMoves, applyMove, chooseAiMove } from '../reversi-core.js';

test('黑白棋开局有四个合法落点，夹击翻面，不合法落点无效', () => {
  const state = createState();
  assert.deepEqual(legalMoves(state).map(m => m.to).sort((a,b) => a-b), [19,26,37,44]);
  const result = applyMove(state, { to: 19 });
  assert.equal(result.ok, true);
  assert.equal(result.state.board[27].side, 1);
  assert.equal(result.state.turn, 2);
  assert.equal(state.board[27].side, 2);
  assert.equal(applyMove(state, { to: 0 }).ok, false);
});
test('无合法落点自动跳过，对双方均无落点的局面按子数结算', () => {
  const state = createState(); state.board.fill({ side: 1 });
  state.board[0] = null; state.board[1] = { side: 2 };
  const result = applyMove(state, { to: 0 });
  assert.equal(result.state.status, 'won'); assert.equal(result.state.winner, 1);
  assert.equal(chooseAiMove(result.state), null);
  const pass = createState(); pass.board.fill({ side: 1 });
  pass.board[0] = null; pass.board[1] = { side: 2 };
  pass.board[56] = null; pass.board[57] = { side: 2 };
  const after = applyMove(pass, { to: 0 }).state;
  assert.equal(after.status, 'playing'); assert.equal(after.turn, 1);
  assert.equal(after.passed, 2);
});
test('电脑优先拿角，八个方向同时翻面不会跨行', () => {
  const state = createState(); state.board.fill(null);
  for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    state.board[(3+dr)*8+3+dc] = { side: 2 };
    state.board[(3+dr*2)*8+3+dc*2] = { side: 1 };
  }
  assert.equal(legalMoves(state).find(m => m.to === 27).captures.length, 8);
  const corner = createState(); corner.board[1] = { side: 2 }; corner.board[2] = { side: 1 };
  assert.equal(chooseAiMove(corner).to, 0);
});
