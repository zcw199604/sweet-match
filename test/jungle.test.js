import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, terrain, owner, legalMoves, applyMove, chooseAiMove } from '../jungle-core.js';

const at = (r, c) => r * 7 + c;
const piece = (side, rank) => ({ side, rank });
function position(entries, turn = 1) {
  const state = { ...createState(), board: Array(63).fill(null), turn };
  delete state.history;
  for (const [r, c, side, rank] of entries) state.board[at(r, c)] = piece(side, rank);
  return state;
}
const can = (state, from, to) => legalMoves(state, from).some(move => move.to === to);

test('jungle starts with sixteen animals in the standard mirrored layout', () => {
  const state = createState();
  assert.equal(state.board.length, 63);
  assert.equal(state.board.filter(Boolean).length, 16);
  assert.deepEqual(state.board[at(0, 0)], piece(2, 7));
  assert.deepEqual(state.board[at(2, 6)], piece(2, 8));
  assert.deepEqual(state.board[at(6, 6)], piece(1, 1));
  assert.deepEqual(state.board[at(8, 0)], piece(1, 6));
  assert.equal(state.turn, 1);
  assert.equal(state.status, 'playing');
  for (const side of [1, 2]) assert.deepEqual(state.board.filter(p => p?.side === side).map(p => p.rank).sort(), [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('terrain identifies both rivers, dens, and their owned traps', () => {
  assert.equal(Array.from({ length: 63 }, (_, p) => terrain(p)).filter(t => t === 'river').length, 12);
  assert.equal(terrain(at(4, 2)), 'river');
  assert.equal(terrain(at(4, 3)), 'land');
  assert.equal(terrain(at(0, 3)), 'den');
  assert.equal(owner(at(0, 3)), 2);
  assert.equal(terrain(at(7, 3)), 'trap');
  assert.equal(owner(at(7, 3)), 1);
  assert.equal(owner(at(4, 2)), null);
});

test('animals move orthogonally and only rats enter water', () => {
  const state = position([[3, 0, 1, 2], [6, 6, 2, 1]]);
  assert.equal(can(state, at(3, 0), at(3, 1)), false);
  assert.equal(can(state, at(3, 0), at(2, 0)), true);
  assert.equal(can(state, at(3, 0), at(2, 1)), false);
  state.board[at(3, 0)].rank = 1;
  assert.equal(can(state, at(3, 0), at(3, 1)), true);
});

test('board edges do not connect to another row', () => {
  const state = position([[4, 0, 1, 2], [4, 6, 1, 2], [2, 0, 2, 2]]);
  assert.equal(can(state, at(4, 0), at(3, 6)), false);
  assert.equal(can(state, at(4, 6), at(5, 0)), false);
});

test('rats fight each other in water but cannot capture across its bank', () => {
  const state = position([[3, 1, 1, 1], [3, 2, 2, 1], [3, 0, 2, 8], [2, 1, 2, 1]]);
  assert.equal(can(state, at(3, 1), at(3, 2)), true);
  assert.equal(can(state, at(3, 1), at(3, 0)), false);
  assert.equal(can(state, at(3, 1), at(2, 1)), false);
  state.turn = 2;
  assert.equal(can(state, at(2, 1), at(3, 1)), false);
});

test('a land rat eats an elephant, an elephant cannot eat a land rat', () => {
  const state = position([[6, 3, 1, 1], [6, 4, 2, 8]]);
  assert.equal(can(state, at(6, 3), at(6, 4)), true);
  state.turn = 2;
  assert.equal(can(state, at(6, 4), at(6, 3)), false);
});

test('equal or stronger animals capture and weaker animals cannot', () => {
  const state = position([[6, 3, 1, 4], [6, 4, 2, 4], [7, 3, 2, 5]]);
  assert.equal(can(state, at(6, 3), at(6, 4)), true);
  // The enemy is weakened in a red trap, even though its natural rank is higher.
  assert.equal(can(state, at(6, 3), at(7, 3)), true);
  state.board[at(6, 4)].rank = 5;
  assert.equal(can(state, at(6, 3), at(6, 4)), false);
});

test('lions and tigers jump rivers horizontally and vertically', () => {
  const state = position([[3, 0, 1, 7], [2, 4, 1, 6], [8, 6, 2, 1]]);
  assert.equal(can(state, at(3, 0), at(3, 3)), true);
  assert.equal(can(state, at(2, 4), at(6, 4)), true);
  assert.equal(can(state, at(3, 0), at(3, 1)), false);
  state.board[at(3, 3)] = piece(2, 8);
  assert.equal(can(state, at(3, 0), at(3, 3)), false);
});

test('either side rat blocks a jump anywhere along the river', () => {
  for (const side of [1, 2]) {
    const state = position([[2, 1, 1, 6], [4, 1, side, 1], [8, 6, 2, 2]]);
    assert.equal(can(state, at(2, 1), at(6, 1)), false);
  }
});

test('enemy traps weaken every rank including rat and elephant exceptions', () => {
  const state = position([[0, 2, 1, 8], [0, 1, 2, 1], [1, 2, 2, 2]], 2);
  assert.equal(can(state, at(0, 1), at(0, 2)), true);
  assert.equal(can(state, at(1, 2), at(0, 2)), true);
  state.turn = 1;
  assert.equal(can(state, at(0, 2), at(0, 1)), false);
  state.board[at(0, 2)].rank = 1;
  state.board[at(0, 1)].rank = 8;
  assert.equal(can(state, at(0, 2), at(0, 1)), false);
});

test('own traps preserve strength and an elephant captures a trapped rat', () => {
  const state = position([[7, 3, 1, 8], [7, 2, 2, 1]]);
  assert.equal(can(state, at(7, 3), at(7, 2)), false);
  state.board[at(7, 2)] = null;
  state.board[at(8, 2)] = piece(2, 1);
  assert.equal(can(state, at(7, 3), at(8, 2)), false);
  state.board[at(7, 3)] = null;
  state.board[at(8, 1)] = piece(1, 8);
  assert.equal(can(state, at(8, 1), at(8, 2)), true);
});

test('own den is forbidden, entering enemy den wins', () => {
  const state = position([[7, 3, 1, 2], [1, 3, 1, 1], [2, 6, 2, 8]]);
  assert.equal(can(state, at(7, 3), at(8, 3)), false);
  const result = applyMove(state, { from: at(1, 3), to: at(0, 3) });
  assert.equal(result.ok, true);
  assert.equal(result.state.status, 'won');
  assert.equal(result.state.winner, 1);
  assert.equal(chooseAiMove(result.state), null);
});

test('captures are reported, moves are immutable, losing the last animal ends play', () => {
  const state = position([[6, 3, 1, 5], [6, 4, 2, 2]]);
  const before = structuredClone(state);
  const move = legalMoves(state, at(6, 3)).find(m => m.to === at(6, 4));
  assert.deepEqual(move.captures, [at(6, 4)]);
  const { ok, state: next } = applyMove(state, move);
  assert.equal(ok, true);
  assert.deepEqual(state, before);
  assert.equal(next.board[at(6, 3)], null);
  assert.deepEqual(next.board[at(6, 4)], piece(1, 5));
  assert.equal(next.moves, 1);
  assert.equal(next.turn, 2);
  assert.equal(next.status, 'won');
  assert.equal(next.winner, 1);
});

test('a side without any legal move loses even while it has an animal', () => {
  const state = position([[0, 0, 2, 2], [0, 1, 1, 8], [1, 0, 1, 7], [6, 3, 1, 4]]);
  const result = applyMove(state, { from: at(6, 3), to: at(5, 3) });
  assert.equal(result.state.status, 'won');
  assert.equal(result.state.winner, 1);
});

test('invalid moves and wrong-side moves leave the state unchanged', () => {
  const state = createState();
  for (const move of [null, { to: at(5, 0) }, { from: -1, to: 0 }, { from: at(0, 0), to: at(1, 0) }, { from: at(6, 0), to: at(4, 0) }]) {
    const result = applyMove(state, move);
    assert.equal(result.ok, false);
    assert.equal(result.state, state);
  }
  assert.deepEqual(legalMoves(state, -1), []);
});

test('third occurrence of the same board and turn is a draw', () => {
  let state = position([[6, 0, 1, 2], [2, 6, 2, 2]]);
  const cycle = [[at(6, 0), at(7, 0)], [at(2, 6), at(1, 6)], [at(7, 0), at(6, 0)], [at(1, 6), at(2, 6)]];
  for (let i = 0; i < 8; i++) {
    const [from, to] = cycle[i % 4];
    const result = applyMove(state, { from, to });
    assert.equal(result.ok, true);
    state = result.state;
  }
  assert.equal(state.status, 'draw');
  assert.equal(state.winner, null);
  assert.deepEqual(legalMoves(state), []);
});

test('AI chooses a legal immediate den victory', () => {
  const state = position([[1, 3, 1, 2], [6, 6, 2, 8]]);
  const move = chooseAiMove(state);
  assert.deepEqual({ from: move.from, to: move.to }, { from: at(1, 3), to: at(0, 3) });
  assert.equal(applyMove(state, move).state.status, 'won');
  assert.ok(legalMoves(createState()).length > 0);
});

test('AI avoids moving directly into capture when safe moves are available', () => {
  const state = position([[6, 3, 1, 2], [4, 3, 2, 8]]);
  const move = chooseAiMove(state);
  assert.notEqual(move.to, at(5, 3));
  assert.equal(applyMove(state, move).ok, true);
});
