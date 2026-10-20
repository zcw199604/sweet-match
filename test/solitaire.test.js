import test from 'node:test';
import assert from 'node:assert/strict';
import { autoStep, bestTarget, canAutoFinish, canMove, cardsAt, deal, drawStock, findHint, isWon, moveCards, undo } from '../solitaire-core.js';

const c = (rank, suit, up = true) => ({ rank, suit, up });
const empty = (draw = 1) => ({ draw, seed: 1, stock: [], waste: [], foundations: [[], [], [], []], tableau: Array.from({ length: 7 }, () => []), moves: 0, history: [], recycles: 0 });

test('a deal lays out 28 cards in seven columns with only the last card face up', () => {
  const game = deal(1, 42);
  assert.deepEqual(game.tableau.map((col) => col.length), [1, 2, 3, 4, 5, 6, 7]);
  assert.ok(game.tableau.every((col) => col.at(-1).up && col.slice(0, -1).every((card) => !card.up)));
  assert.equal(game.stock.length, 24);
  const all = [...game.stock, ...game.tableau.flat()].map((card) => card.suit * 13 + card.rank);
  assert.equal(new Set(all).size, 52);
  assert.deepEqual(deal(1, 42).tableau, game.tableau);
});

test('drawing turns one or three cards, and an empty stock takes the waste back', () => {
  const one = deal(1, 3);
  drawStock(one);
  assert.equal(one.waste.length, 1);
  const three = deal(3, 3);
  for (let i = 0; i < 8; i += 1) drawStock(three);
  assert.equal(three.stock.length, 0);
  assert.equal(three.waste.length, 24);
  drawStock(three);
  assert.equal(three.stock.length, 24);
  assert.equal(three.recycles, 1);
  assert.equal(undo(three), true);
  assert.equal(three.waste.length, 24);
});

test('tableau runs alternate colours going down, empty columns take kings, foundations build up by suit', () => {
  const game = empty();
  game.tableau[0] = [c(5, 0, false), c(9, 0)];     // 黑 9
  game.tableau[1] = [c(8, 1), c(7, 0)];            // 红 8、黑 7
  game.tableau[2] = [c(13, 3)];
  game.waste = [c(1, 2)];
  assert.equal(canMove(game, { from: 'tab', pile: 1, index: 0 }, { to: 'tab', pile: 0 }), true);
  assert.equal(canMove(game, { from: 'tab', pile: 2, index: 0 }, { to: 'tab', pile: 3 }), true);
  assert.equal(canMove(game, { from: 'tab', pile: 2, index: 0 }, { to: 'tab', pile: 0 }), false);
  assert.deepEqual(bestTarget(game, { from: 'waste' }), { to: 'found', pile: 0 });
  moveCards(game, { from: 'tab', pile: 1, index: 0 }, { to: 'tab', pile: 0 });
  assert.equal(game.tableau[0].length, 4);
  // 拿走上面的牌后露出的暗牌自动翻开
  moveCards(game, { from: 'tab', pile: 0, index: 1 }, { to: 'tab', pile: 4 });
  assert.equal(game.tableau[0][0].up, false);
  assert.equal(cardsAt(game, { from: 'tab', pile: 0, index: 0 }).length, 0);
  assert.equal(canMove(game, { from: 'tab', pile: 0, index: 1 }, { to: 'tab', pile: 4 }), false);
});

test('a finished table auto-collects into the foundations and wins', () => {
  const game = empty();
  for (let suit = 0; suit < 4; suit += 1) game.foundations[suit] = Array.from({ length: 12 }, (_, i) => c(i + 1, suit));
  game.tableau[0] = [c(13, 0)]; game.tableau[1] = [c(13, 1)]; game.tableau[2] = [c(13, 2)]; game.tableau[3] = [c(13, 3)];
  assert.equal(canAutoFinish(game), true);
  while (autoStep(game));
  assert.equal(isWon(game), true);
  assert.equal(findHint(game), null);
});
