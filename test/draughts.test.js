import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, legalMoves, applyMove, chooseAiMove } from '../draughts-core.js';

test('starts with 20 pieces per side and white to move', () => {
  const state = createState();
  assert.equal(state.board.filter(p => p?.side === 1).length, 20);
  assert.equal(state.board.filter(p => p?.side === 2).length, 20);
  assert.equal(state.turn, 1);
  assert.equal(state.status, 'playing');
});

test('mandatory capture suppresses quiet moves', () => {
  const state = createState();
  state.board.fill(null);
  state.board[61] = { side: 1, king: false };
  state.board[52] = { side: 2, king: false };
  const moves = legalMoves(state);
  assert.deepEqual(moves.map(m => [m.from, m.to]), [[61, 43]]);
  assert.deepEqual(moves[0].captures, [52]);
});

test('multi-capture returns complete paths and removes captures once', () => {
  const state = createState();
  state.board.fill(null);
  state.board[61] = { side: 1, king: false };
  state.board[52] = { side: 2, king: false };
  state.board[34] = { side: 2, king: false };
  const move = legalMoves(state, 61).find(m => m.path.length === 2);
  assert.ok(move);
  assert.deepEqual(move.path, [43, 25]);
  assert.deepEqual(move.captures, [52, 34]);
  const result = applyMove(state, move);
  assert.equal(result.ok, true);
  assert.equal(result.state.board[25].side, 1);
  assert.equal(result.state.board[52], null);
  assert.equal(result.state.board[34], null);
  assert.equal(state.board[61].side, 1, 'input state is immutable');
});

test('promotion happens after the turn and promoted piece is a king', () => {
  const state = createState();
  state.board.fill(null);
  state.board[12] = { side: 1, king: false };
  const result = applyMove(state, legalMoves(state, 12)[0]);
  assert.equal(result.state.board[1].king, true);
});

test('king may fly diagonally and capture with a landing choice', () => {
  const state = createState();
  state.board.fill(null);
  state.board[45] = { side: 1, king: true };
  state.board[56] = { side: 2, king: false };
  const moves = legalMoves(state, 45);
  assert.ok(moves.some(m => m.to === 67 && m.captures[0] === 56));
  assert.ok(moves.some(m => m.to === 78 && m.captures[0] === 56));
});

test('side with no legal move loses and AI returns a legal move', () => {
  const state = createState();
  state.board.fill(null);
  state.board[81] = { side: 1, king: false };
  state.board[90] = { side: 2, king: false };
  assert.ok(legalMoves(state).some(m => JSON.stringify(m) === JSON.stringify(chooseAiMove(state))));
  const result = applyMove(state, { from: 81, to: 70, path: [70], captures: [] });
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'won');
  assert.equal(result.state.winner, 1);
  assert.equal(chooseAiMove(result.state), null);
});

function position(pieces, turn = 1) {
  const state = createState();
  state.board.fill(null);
  state.turn = turn;
  state.repetition = {};
  for (const [at, side, king = false] of pieces) state.board[at] = { side, king };
  return state;
}

test('capture priority applies across all pieces, even when querying one piece', () => {
  const state = position([[61, 1], [65, 1], [52, 2], [34, 2], [56, 2]]);
  assert.ok(legalMoves(state).every(move => move.captures.length === 2));
  assert.deepEqual(legalMoves(state, 65), []);
});

test('men capture backwards but cannot make a quiet backwards move', () => {
  const state = position([[43, 1], [54, 2]]);
  assert.deepEqual(legalMoves(state)[0].path, [65]);
  state.board[54] = null;
  assert.ok(legalMoves(state).every(move => row(move.to) < row(move.from)));
});

function row(at) { return Math.floor(at / 10); }

test('passing the crown row during capture does not promote a man', () => {
  const state = position([[21, 1], [12, 2], [14, 2], [89, 2]]);
  const move = legalMoves(state).find(candidate => candidate.path.join(',') === '3,25');
  assert.ok(move);
  assert.equal(applyMove(state, move).state.board[25].king, false);
});

test('captured pieces block a flying king until its complete turn ends', () => {
  const state = position([[45, 1, true], [34, 2], [56, 2]]);
  assert.ok(legalMoves(state).every(move => move.captures.length === 1));
});

test('rejects a shortened capture path without changing the board', () => {
  const state = position([[61, 1], [52, 2], [34, 2]]);
  const before = JSON.stringify(state);
  assert.equal(applyMove(state, { from: 61, to: 43, path: [43], captures: [52] }).ok, false);
  assert.equal(JSON.stringify(state), before);
});

test('three occurrences of the same position and side to move produce a draw', () => {
  let state = position([[90, 1, true], [3, 2, true]]);
  for (let cycle = 0; cycle < 2; cycle++) {
    for (const [from, to] of [[90, 81], [3, 14], [81, 90], [14, 3]]) {
      const move = legalMoves(state, from).find(candidate => candidate.to === to);
      assert.ok(move);
      state = applyMove(state, move).state;
    }
  }
  assert.equal(state.status, 'draw');
  assert.equal(state.winner, null);
});

test('50 consecutive half-turns without a man move or capture produce a draw', () => {
  const state = position([[90, 1, true], [3, 2, true]]);
  state.quietKingPlies = 49;
  const result = applyMove(state, legalMoves(state, 90).find(move => move.to === 81));
  assert.equal(result.state.status, 'draw');
  const man = position([[90, 1], [3, 2, true]]);
  man.quietKingPlies = 49;
  assert.equal(applyMove(man, legalMoves(man)[0]).state.quietKingPlies, 0);
});
