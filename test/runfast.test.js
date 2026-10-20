import test from 'node:test';
import assert from 'node:assert/strict';
import { SPADE3, aiMove, beats, canPass, classify, createRound, deck, legalMoves, pass, play } from '../runfast-core.js';

const c = (rank, suit = 0) => rank * 4 + suit;
function table(hands, current = 0) {
  return { seed: 1, round: 1, hands, current, table: null, passes: 0, played: [1, 1, 1], bombs: [0, 0, 0], last: [null, null, null], winner: null, scores: [0, 0, 0], delta: null, mustSpade3: false, log: [] };
}

test('the deck has 48 cards with one 2 and three aces, and each hand gets 16', () => {
  const ids = deck();
  assert.equal(ids.length, 48);
  assert.equal(ids.filter((id) => Math.floor(id / 4) === 15).length, 1);
  assert.equal(ids.filter((id) => Math.floor(id / 4) === 14).length, 3);
  const round = createRound({ seed: 5 });
  assert.deepEqual(round.hands.map((h) => h.length), [16, 16, 16]);
  assert.ok(round.hands[round.current].includes(SPADE3));
  assert.equal(round.mustSpade3, true);
});

test('hands are classified into the runfast shapes', () => {
  assert.equal(classify([c(5), c(5, 1)]).type, 'pair');
  assert.equal(classify([c(5), c(5, 1), c(6), c(6, 1)]).type, 'pairs');
  assert.equal(classify([c(3), c(4), c(5), c(6), c(7)]).type, 'straight');
  assert.equal(classify([c(11), c(12), c(13), c(14), c(15)]), null);           // 2 不能进顺子
  assert.equal(classify([c(9), c(9, 1), c(9, 2), c(3), c(4)]).type, 'triple');
  assert.equal(classify([c(9), c(9, 1), c(9, 2), c(3)]), null);                  // 平时三带一不行
  assert.equal(classify([c(9), c(9, 1), c(9, 2), c(3)], true).type, 'triple');   // 最后一手可以
  assert.equal(classify([c(7), c(7, 1), c(7, 2), c(8), c(8, 1), c(8, 2), c(3), c(4), c(5), c(6)]).type, 'plane');
  assert.equal(classify([c(4), c(4, 1), c(4, 2), c(4, 3)]).type, 'bomb');
  assert.ok(beats(classify([c(4), c(4, 1), c(4, 2), c(4, 3)]), classify([c(15)])));
  assert.ok(!beats(classify([c(3), c(4), c(5), c(6), c(7)]), classify([c(4), c(5), c(6), c(7), c(8)])));
});

test('you must beat when you can, the first lead carries the ♠3, and a single to a one-card player must be the top one', () => {
  const round = createRound({ seed: 9 });
  const p = round.current;
  const other = round.hands[p].find((id) => id !== SPADE3);
  assert.equal(play(round, p, [other]).ok, false);
  const s = table([[c(9), c(12), c(13, 1)], [c(10)], [c(3), c(4)]]);
  s.table = { player: 2, cards: [c(8)], shape: classify([c(8)]) };
  assert.equal(canPass(s, 0), false);
  assert.equal(pass(s, 0).ok, false);
  // 下家（1 号）报单：单张只能出 K
  assert.equal(play(s, 0, [c(9)]).reason, '下家报单了，单张只能出最大的');
  assert.ok(legalMoves(s, 0).every((m) => m.cards[0] === c(13, 1)));
  assert.equal(play(s, 0, [c(13, 1)]).ok, true);
  assert.equal(s.current, 1);
  assert.equal(pass(s, 1).ok, true);
});

test('going out scores the leftover cards, double for a player who never played, and bombs pay at once', () => {
  const s = table([[c(9)], [c(3), c(4)], [c(5), c(6), c(7)]]);
  s.played = [1, 1, 0];
  const done = play(s, 0, [c(9)]);
  assert.equal(done.finished, true);
  assert.deepEqual(s.delta, [2 + 6, -2, -6]);
  const b = table([[c(4), c(4, 1), c(4, 2), c(4, 3), c(10)], [c(3)], [c(5)]]);
  play(b, 0, [c(4), c(4, 1), c(4, 2), c(4, 3)]);
  assert.deepEqual(b.scores, [20, -10, -10]);
});

test('three computers always finish a round with legal moves', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const s = createRound({ seed });
    for (let n = 0; s.winner === null && n < 400; n += 1) {
      const move = aiMove(s);
      const result = move ? play(s, s.current, move.cards) : pass(s, s.current);
      assert.equal(result.ok, true, result.reason);
    }
    assert.notEqual(s.winner, null);
    assert.equal(s.delta.reduce((a, b) => a + b, 0), 0);
  }
});
