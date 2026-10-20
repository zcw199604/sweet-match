import test from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, aiMove, apex, createGame, destinations, hasWon, inCorner, key, move, undo } from '../tiaoqi-core.js';

test('the star has 121 holes, six corners of ten, and each player starts with ten pieces', () => {
  assert.equal(CELLS.length, 121);
  for (const corner of ['bottom', 'top', 'upperLeft', 'upperRight', 'lowerLeft', 'lowerRight']) assert.equal(CELLS.filter((c) => inCorner(c, corner)).length, 10);
  const game = createGame(3);
  for (let p = 0; p < 3; p += 1) assert.equal(Object.values(game.board).filter((v) => v === p).length, 10);
  assert.deepEqual(apex('top'), [4, 4, -8]);
});

test('a piece steps to a neighbour or hops over pieces, chaining hops but never mixing', () => {
  const game = createGame(2);
  game.board = { [key([0, 0, 0])]: 0, [key([1, -1, 0])]: 1, [key([3, -3, 0])]: 1 };
  const reach = destinations(game, key([0, 0, 0]));
  assert.ok(reach.has(key([0, 1, -1])));                               // 一步
  assert.deepEqual(reach.get(key([2, -2, 0])), [key([0, 0, 0]), key([2, -2, 0])]);    // 跳一次
  assert.deepEqual(reach.get(key([4, -4, 0])), [key([0, 0, 0]), key([2, -2, 0]), key([4, -4, 0])]); // 连跳
  assert.ok(!reach.has(key([3, -2, -1])));                              // 跳完不能再走一步
  assert.ok(move(game, key([0, 0, 0]), key([4, -4, 0])));
  assert.equal(game.current, 1);
  assert.equal(undo(game), true);
  assert.equal(game.board[key([0, 0, 0])], 0);
  assert.equal(move(game, key([1, -1, 0]), key([1, 0, -1])), null);   // 不是 1 号的回合
});

test('filling the opposite corner wins, and a full corner holding one of yours also counts', () => {
  const game = createGame(2);
  game.board = {};
  for (const c of CELLS) if (inCorner(c, 'top')) game.board[key(c)] = 0;
  assert.equal(hasWon(game, 0), true);
  const blocked = createGame(2);
  blocked.board = {};
  CELLS.filter((c) => inCorner(c, 'top')).forEach((c, i) => { blocked.board[key(c)] = i === 0 ? 0 : 1; });
  blocked.board[key([0, 0, 0])] = 0;
  assert.equal(hasWon(blocked, 0), true);
});

test('computers finish two- and three-player games', () => {
  for (const players of [2, 3]) {
    const game = createGame(players);
    for (let i = 0; game.winner === null && i < 2000; i += 1) {
      const mv = aiMove(game, game.current, () => 0.5);
      if (!mv) { game.current = (game.current + 1) % players; continue; }
      assert.ok(move(game, mv.from, mv.to));
    }
    assert.notEqual(game.winner, null);
  }
});
