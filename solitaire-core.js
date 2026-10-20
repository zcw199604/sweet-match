// 纸牌接龙（ARCADE 30，Klondike）的规则：七列牌桌、牌堆、翻牌区和四个收牌区。
// 牌桌上按「红黑交替、点数递减」接龙，空列只能放 K；收牌区按花色从 A 收到 K，全部收齐获胜。
// 抽一张 / 抽三张两种玩法，牌堆翻完可以无限次重来。
import { rng, shuffle } from './kit-core.js';

export const SUITS = ['♠', '♥', '♣', '♦'];
export const RANKS = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const isRed = (card) => card.suit === 1 || card.suit === 3;
export const label = (card) => `${RANKS[card.rank]}${SUITS[card.suit]}`;

export function deal(draw = 1, seed = Date.now()) {
  const deck = [];
  for (let suit = 0; suit < 4; suit += 1) for (let rank = 1; rank <= 13; rank += 1) deck.push({ suit, rank, up: false });
  shuffle(deck, rng(seed));
  const tableau = Array.from({ length: 7 }, () => []);
  for (let i = 0; i < 7; i += 1) for (let j = i; j < 7; j += 1) tableau[j].push(deck.pop());
  for (const col of tableau) col.at(-1).up = true;
  return { draw, seed, stock: deck, waste: [], foundations: [[], [], [], []], tableau, moves: 0, history: [], recycles: 0 };
}
const snap = (game) => JSON.stringify({ stock: game.stock, waste: game.waste, foundations: game.foundations, tableau: game.tableau, moves: game.moves, recycles: game.recycles });
function save(game) {
  game.history.push(snap(game));
  if (game.history.length > 300) game.history.shift();
}
export function undo(game) {
  const last = game.history.pop();
  if (!last) return false;
  Object.assign(game, JSON.parse(last));
  return true;
}
export const isWon = (game) => game.foundations.every((f) => f.length === 13);

// 翻牌：牌堆空了就把翻牌区整叠翻回去。
export function drawStock(game) {
  if (!game.stock.length && !game.waste.length) return false;
  save(game);
  if (!game.stock.length) {
    game.stock = game.waste.reverse().map((c) => ({ ...c, up: false }));
    game.waste = [];
    game.recycles += 1;
  } else {
    for (let i = 0; i < game.draw && game.stock.length; i += 1) game.waste.push({ ...game.stock.pop(), up: true });
  }
  game.moves += 1;
  return true;
}
export const canFound = (game, card, f) => {
  const pile = game.foundations[f];
  return pile.length ? pile.at(-1).suit === card.suit && pile.at(-1).rank === card.rank - 1 : card.rank === 1;
};
export const canStack = (game, card, col) => {
  const pile = game.tableau[col];
  if (!pile.length) return card.rank === 13;
  const top = pile.at(-1);
  return top.up && isRed(top) !== isRed(card) && top.rank === card.rank + 1;
};
// 起手：{ from: 'waste' | 'found' | 'tab', pile, index }。index 是牌桌一列里从第几张开始拿（拿这一张和它上面的全部）。
export function cardsAt(game, from) {
  if (from.from === 'waste') return game.waste.length ? [game.waste.at(-1)] : [];
  if (from.from === 'found') return game.foundations[from.pile].length ? [game.foundations[from.pile].at(-1)] : [];
  const col = game.tableau[from.pile];
  if (from.index < 0 || from.index >= col.length || !col[from.index].up) return [];
  const run = col.slice(from.index);
  for (let i = 1; i < run.length; i += 1) if (isRed(run[i]) === isRed(run[i - 1]) || run[i].rank !== run[i - 1].rank - 1) return [];
  return run;
}
// 能不能放：to = { to: 'found' | 'tab', pile }
export function canMove(game, from, to) {
  const cards = cardsAt(game, from);
  if (!cards.length) return false;
  if (to.to === 'found') return cards.length === 1 && from.from !== 'found' && canFound(game, cards[0], to.pile);
  if (from.from === 'tab' && from.pile === to.pile) return false;
  return canStack(game, cards[0], to.pile);
}
export function moveCards(game, from, to) {
  if (!canMove(game, from, to)) return false;
  save(game);
  let cards;
  if (from.from === 'waste') cards = [game.waste.pop()];
  else if (from.from === 'found') cards = [game.foundations[from.pile].pop()];
  else cards = game.tableau[from.pile].splice(from.index);
  (to.to === 'found' ? game.foundations[to.pile] : game.tableau[to.pile]).push(...cards);
  if (from.from === 'tab') { const col = game.tableau[from.pile]; if (col.length && !col.at(-1).up) col.at(-1).up = true; }
  game.moves += 1;
  return true;
}
// 点一下自动找去处：单张先试收牌区，再试牌桌（优先接在别的牌上，其次空列）。
export function bestTarget(game, from) {
  const cards = cardsAt(game, from);
  if (!cards.length) return null;
  if (cards.length === 1) for (let f = 0; f < 4; f += 1) if (canMove(game, from, { to: 'found', pile: f })) return { to: 'found', pile: f };
  const cols = [...Array(7).keys()].filter((c) => canMove(game, from, { to: 'tab', pile: c }));
  // 整列从 K 开始挪到另一个空列没有意义
  const useful = cols.filter((c) => !(from.from === 'tab' && from.index === 0 && !game.tableau[c].length));
  useful.sort((a, b) => (game.tableau[a].length ? 0 : 1) - (game.tableau[b].length ? 0 : 1));
  return useful.length ? { to: 'tab', pile: useful[0] } : null;
}
// 提示：能收牌的先收，其次能翻开暗牌的挪动，再其次翻牌区的牌，最后翻牌堆。
export function findHint(game) {
  for (let c = 0; c < 7; c += 1) {
    const col = game.tableau[c];
    if (col.length) { const from = { from: 'tab', pile: c, index: col.length - 1 }; const to = bestTarget(game, from); if (to?.to === 'found') return { from, to }; }
  }
  if (game.waste.length) { const from = { from: 'waste' }; const to = bestTarget(game, from); if (to?.to === 'found') return { from, to }; }
  for (let c = 0; c < 7; c += 1) {
    const col = game.tableau[c];
    const first = col.findIndex((card) => card.up);
    if (first < 0) continue;
    const from = { from: 'tab', pile: c, index: first };
    const to = bestTarget(game, from);
    if (to?.to === 'tab' && (first > 0 || game.tableau[to.pile].length)) return { from, to };
  }
  if (game.waste.length) { const from = { from: 'waste' }; const to = bestTarget(game, from); if (to) return { from, to }; }
  if (game.stock.length || game.waste.length) return { draw: true };
  return null;
}
// 牌堆、翻牌区都空了、牌桌全是明牌：剩下的可以一口气自动收完。
export const canAutoFinish = (game) => !game.stock.length && !game.waste.length && game.tableau.every((col) => col.every((c) => c.up)) && !isWon(game);
export function autoStep(game) {
  for (let c = 0; c < 7; c += 1) {
    const col = game.tableau[c];
    if (!col.length) continue;
    for (let f = 0; f < 4; f += 1) if (moveCards(game, { from: 'tab', pile: c, index: col.length - 1 }, { to: 'found', pile: f })) return true;
  }
  return false;
}
