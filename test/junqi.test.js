import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, CAMPS, HEADQUARTERS, applyAction, legalMoves, battleOutcome, chooseAiAction } from '../junqi-core.js';

const piece = (kind, side = 'red', revealed = true) => ({ kind, side, revealed });
function position(entries, extra = {}) {
  const state = createState(() => 0.5);
  state.board.fill(null);
  for (const [cell, kind, side = 'red', revealed = true] of entries) state.board[cell] = piece(kind, side, revealed);
  return { ...state, players: ['red', 'blue'], ...extra };
}

test('翻棋军棋使用完整 50 子、十个空行营和各阵营 25 子', () => {
  const state = createState(() => 0.5);
  assert.equal(state.board.length, 60);
  assert.equal(state.board.filter(Boolean).length, 50);
  for (const camp of CAMPS) assert.equal(state.board[camp], null);
  for (const side of ['red', 'blue']) {
    assert.equal(state.board.filter(p => p?.side === side).length, 25);
    assert.equal(state.board.filter(p => p?.side === side && p.kind === 'engineer').length, 3);
  }
  assert.equal(state.board.some(p => p?.revealed), false);
});

test('第一次翻棋分配阵营、轮流操作，非法操作不消耗回合', () => {
  const state = createState(() => 0.5);
  const first = state.board.findIndex(Boolean);
  const result = applyAction(state, { type: 'flip', at: first });
  assert.equal(result.ok, true);
  assert.equal(result.state.players[0], state.board[first].side);
  assert.equal(result.state.turn, 1);
  assert.equal(state.board[first].revealed, false);
  const invalid = applyAction(result.state, { type: 'flip', at: first });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.state.turn, 1);
});

test('军衔、炸弹、工兵排雷与夺旗战斗遵循规则', () => {
  assert.equal(battleOutcome('commander', 'general'), 1);
  assert.equal(battleOutcome('engineer', 'commander'), -1);
  assert.equal(battleOutcome('captain', 'captain'), 0);
  assert.equal(battleOutcome('bomb', 'mine'), 0);
  assert.equal(battleOutcome('engineer', 'mine'), 1);
  assert.equal(battleOutcome('general', 'mine'), -1);
  assert.equal(battleOutcome('engineer', 'flag'), 1);
});

test('地雷、军旗与大本营里的棋子不能移动，行营内敌军不能攻击', () => {
  for (const kind of ['mine', 'flag']) assert.deepEqual(legalMoves(position([[7, kind]]), 7), []);
  assert.deepEqual(legalMoves(position([[HEADQUARTERS[0], 'commander']]), HEADQUARTERS[0]), []);
  assert.equal(legalMoves(position([[10, 'commander'], [11, 'engineer', 'blue']]), 10).includes(11), false);
  assert.equal(legalMoves(position([[10, 'commander']]), 10).includes(11), true);
});

test('普通铁路直行、工兵铁路转弯、未翻棋子和友军阻挡', () => {
  const commander = position([[5, 'commander'], [59, 'flag', 'blue']]);
  assert.equal(legalMoves(commander, 5).includes(9), true);
  assert.equal(legalMoves(commander, 5).includes(14), false);
  const engineer = position([[5, 'engineer'], [59, 'flag', 'blue']]);
  assert.equal(legalMoves(engineer, 5).includes(14), true);
  const blocked = position([[5, 'commander'], [7, 'captain', 'blue', false]]);
  assert.equal(legalMoves(blocked, 5).includes(7), false);
  assert.equal(legalMoves(blocked, 5).includes(9), false);
  assert.equal(legalMoves(position([[25, 'engineer']]), 25).includes(30), true);
  assert.equal(legalMoves(position([[26, 'commander']]), 26).includes(31), false);
});

test('炸弹炸司令双方移除并公开阵营军旗', () => {
  const state = position([[6, 'bomb'], [7, 'commander', 'blue'], [59, 'flag', 'blue', false], [55, 'engineer', 'blue']]);
  const result = applyAction(state, { type: 'move', from: 6, to: 7 });
  assert.equal(result.ok, true);
  assert.equal(result.state.board[6], null);
  assert.equal(result.state.board[7], null);
  assert.equal(result.state.board[59].revealed, true);
});

test('夺旗结束比赛、结束后禁止翻棋或移动', () => {
  const state = position([[6, 'engineer'], [7, 'flag', 'blue'], [55, 'engineer', 'blue']]);
  const result = applyAction(state, { type: 'move', from: 6, to: 7 });
  assert.equal(result.state.status, 'won');
  assert.equal(result.state.winner, 0);
  assert.equal(applyAction(result.state, { type: 'move', from: 7, to: 8 }).ok, false);
});

test('无暗棋且下家没有合法行动时判负；暗棋仍在时允许继续翻棋', () => {
  const result = applyAction(position([[6, 'engineer'], [7, 'captain', 'blue'], [59, 'mine', 'blue']]), { type: 'move', from: 6, to: 7 });
  assert.equal(result.state.status, 'playing');
  const win = applyAction(position([[6, 'commander'], [7, 'captain', 'blue'], [59, 'mine', 'blue']]), { type: 'move', from: 6, to: 7 });
  assert.equal(win.state.status, 'won');
  const hidden = applyAction(position([[6, 'commander'], [7, 'captain', 'blue'], [59, 'mine', 'blue', false]]), { type: 'move', from: 6, to: 7 });
  assert.equal(hidden.state.status, 'playing');
});

test('AI 选择可执行行动，结束后没有行动', () => {
  const state = createState(() => 0.5);
  const action = chooseAiAction(state, () => 0);
  assert.equal(action.type, 'flip');
  assert.equal(applyAction(state, action).ok, true);
  assert.equal(chooseAiAction({ ...state, status: 'won' }), null);
});

test('炸弹夺旗亦获胜，司令进攻失败也公开己方军旗', () => {
  const flag = applyAction(position([[6, 'bomb'], [7, 'flag', 'blue']]), { type: 'move', from: 6, to: 7 });
  assert.equal(flag.state.status, 'won');
  assert.equal(flag.state.board[7], null);
  const loss = applyAction(position([[6, 'commander'], [7, 'mine', 'blue'], [0, 'flag', 'red', false], [55, 'engineer', 'blue']]), { type: 'move', from: 6, to: 7 });
  assert.equal(loss.state.board[0].revealed, true);
  assert.equal(loss.state.board[7].kind, 'mine');
});

test('80 手无战斗无翻棋和棋，AI 不使用暗棋身份', () => {
  const draw = applyAction(position([[6, 'commander'], [54, 'engineer', 'blue']], { quiet: 79 }), { type: 'move', from: 6, to: 7 });
  assert.equal(draw.state.status, 'draw');
  const first = position([[6, 'engineer'], [59, 'flag', 'blue', false]]);
  const second = position([[6, 'engineer'], [59, 'commander', 'red', false]]);
  assert.deepEqual(chooseAiAction(first, () => 0.2), chooseAiAction(second, () => 0.2));
});
