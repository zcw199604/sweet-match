import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classify, comparePlays, createGame, bid, playCards, pass, legalMoves, aiStep,
  card, rankOf, labelOf, suggestedMove
} from '../doudizhu-core.js';

const ids = (ranks) => { const used = new Map(); return ranks.map((rank) => { const suit = used.get(rank) ?? 0; used.set(rank, suit + 1); return card(rank, suit); }); };

test('classifies standard landlord patterns, including rocket and sequences', () => {
  assert.equal(classify(ids([3])).type, 'single');
  assert.equal(classify(ids([7, 7])).type, 'pair');
  assert.equal(classify(ids([9, 9, 9, 4])).type, 'tripleOne');
  assert.equal(classify(ids([3, 4, 5, 6, 7])).type, 'straight');
  assert.equal(classify(ids([4, 4, 5, 5, 6, 6])).type, 'pairStraight');
  assert.equal(classify([card(16), card(17)]).type, 'rocket');
  assert.equal(classify(ids([12, 12, 12, 13, 13, 13, 4, 5])).type, 'airplaneSingle');
  assert.equal(classify(ids([10, 10, 10, 10, 3, 4])).type, 'fourTwo');
  assert.equal(classify(ids([2, 2, 3, 4, 5]), null), null);
});

test('comparison respects same shape, bombs and rocket', () => {
  const single = (r) => classify(ids([r]));
  assert.equal(comparePlays(single(9), single(8)) > 0, true);
  assert.equal(comparePlays(single(9), classify(ids([8, 8]))), false);
  assert.equal(comparePlays(classify(ids([6, 6, 6, 6])), single(14)) > 0, true);
  assert.equal(comparePlays(classify([card(16), card(17)]), classify(ids([14, 14, 14, 14]))) > 0, true);
});

test('bidding resolves a landlord and adds the three bottom cards', () => {
  const state = createGame({ rng: () => 0.1 });
  assert.equal(state.phase, 'bidding');
  assert.equal(bid(state, 0, 2).ok, true);
  assert.equal(bid(state, 1, 0).ok, true);
  assert.equal(bid(state, 2, 0).ok, true);
  assert.equal(state.phase, 'playing');
  assert.equal(state.landlord, 0);
  assert.equal(state.players[0].cards.length, 20);
});

test('play, pass and legal move generation preserve turn and win state', () => {
  const state = createGame({ rng: () => 0.2 });
  bid(state, 0, 3); bid(state, 1, 0); bid(state, 2, 0);
  const hand = state.players[0].cards;
  const first = [hand[0]];
  assert.equal(playCards(state, 0, first).ok, true);
  assert.equal(state.current, 1);
  assert.equal(pass(state, 1).ok, true);
  assert.equal(state.current, 2);
  assert.ok(legalMoves(state, 2).length <= 512);
  assert.equal(playCards(state, 2, [999]).ok, false);
  state.players[0].cards = [];
  state.current = 0;
  state.table = null;
  assert.equal(playCards(state, 0, []).ok, false);
  assert.equal(state.status, 'playing');
});

test('AI step always makes a legal bounded move', () => {
  const state = createGame({ rng: () => 0.3 });
  bid(state, 0, 3); bid(state, 1, 0); bid(state, 2, 0);
  state.current = 1;
  const before = state.players[1].cards.length;
  const result = aiStep(state);
  assert.equal(result.ok, true);
  assert.ok(state.players[1].cards.length <= before);
  assert.ok(legalMoves(state, state.current).length <= 512);
  assert.equal(typeof rankOf(state.players[0].cards[0]), 'number');
  assert.equal(typeof labelOf(state.players[0].cards[0]), 'string');
});

test('all supported wing patterns validate and illegal sequences do not', () => {
  assert.equal(classify(ids([8, 8, 8])).type, 'triple');
  assert.equal(classify(ids([8, 8, 8, 4, 4])).type, 'triplePair');
  assert.equal(classify(ids([3, 3, 3, 4, 4, 4])).type, 'airplane');
  assert.equal(classify(ids([3, 3, 3, 4, 4, 4, 8, 8, 9, 9])).type, 'airplanePair');
  assert.equal(classify(ids([3, 3, 3, 4, 4, 4, 8, 8])).type, 'airplaneSingle');
  assert.equal(classify(ids([6, 6, 6, 6, 9, 9, 10, 10])).type, 'fourPairs');
  for (const ranks of [[11, 12, 13, 14, 15], [3, 4, 5, 6], [3, 3, 4, 4], [3, 3, 3, 5, 5, 5], [3, 3, 3, 4, 4, 4, 4, 4]]) {
    assert.equal(classify(ids(ranks)), null, ranks.join(','));
  }
  assert.equal(classify([card(7), card(7)]), null);
});

test('illegal actions leave state untouched and two passes restore the leader', () => {
  const state = createGame({ rng: () => 0.2 });
  const original = state.players.map((seat) => seat.cards.slice());
  assert.equal(bid(state, 1, 3).ok, false);
  assert.equal(bid(state, 0, -1).ok, false);
  bid(state, 0, 1);
  assert.equal(bid(state, 1, 1).ok, false);
  bid(state, 1, 0); bid(state, 2, 0);
  assert.deepEqual(state.players[1].cards, original[1]);
  assert.equal(pass(state, 0).ok, false);
  const first = [state.players[0].cards[0]];
  assert.equal(playCards(state, 0, [first[0], first[0]]).ok, false);
  playCards(state, 0, first);
  assert.equal(playCards(state, 0, [state.players[0].cards[0]]).ok, false);
  assert.equal(pass(state, 1).ok, true);
  assert.equal(pass(state, 2).ok, true);
  assert.equal(state.current, 0);
  assert.equal(state.table, null);
});

test('all pass redeals a complete distinct deck and a three bid settles immediately', () => {
  const state = createGame({ rng: () => 0.4 });
  bid(state, 0, 0); bid(state, 1, 0); bid(state, 2, 0);
  assert.equal(state.phase, 'bidding');
  assert.equal(state.current, 0);
  assert.equal(new Set([...state.players.flatMap((seat) => seat.cards), ...state.bottom]).size, 54);
  bid(state, 0, 3);
  assert.equal(state.phase, 'playing');
  assert.equal(state.landlord, 0);
  assert.equal(state.players[0].cards.length, 20);
});

test('a farmer going out wins the team, bombs double, and finished games reject actions', () => {
  const state = createGame({ rng: () => 0.4 }); bid(state, 0, 3);
  state.current = 1; state.players[1].cards = ids([5, 5, 5, 5]);
  assert.equal(playCards(state, 1, state.players[1].cards.slice()).ok, true);
  assert.equal(state.winner, 1);
  assert.equal(state.phase, 'finished');
  assert.equal(state.multiplier, 2);
  assert.equal(pass(state, 2).ok, false);
  assert.equal(playCards(state, 2, [state.players[2].cards[0]]).ok, false);
});

test('seeded complete games terminate and every hint is an owned legal play', () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    let value = seed;
    const rng = () => { value = value * 16807 % 2147483647; return value / 2147483647; };
    const state = createGame({ rng }); bid(state, 0, 3);
    let steps = 0;
    while (state.phase !== 'finished' && steps < 200) {
      const move = suggestedMove(state);
      if (move) {
        assert.ok(move.cards.every((id) => state.players[state.current].cards.includes(id)));
        assert.ok(comparePlays(classify(move.cards), state.table?.shape));
      }
      assert.equal(aiStep(state).ok, true, `seed ${seed} step ${steps}`);
      assert.ok(legalMoves(state).length <= 512);
      steps += 1;
    }
    assert.equal(state.phase, 'finished', `seed ${seed} exceeded move limit`);
  }
});

test('airplane hints can use three same-rank singles when four wings are needed', () => {
  const state = createGame({ rng: () => 0.4 }); bid(state, 0, 3);
  state.players[0].cards = ids([4, 4, 4, 5, 5, 5, 6, 6, 6, 7, 7, 7, 10, 10, 10, 11]);
  state.table = { player: 2, shape: classify(ids([3, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 12, 12, 13, 13])) };
  const move = suggestedMove(state, 0);
  assert.ok(move);
  assert.equal(move.shape.type, 'airplaneSingle');
  assert.equal(move.cards.length, 16);
});
