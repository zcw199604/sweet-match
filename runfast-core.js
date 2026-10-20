// 跑得快（ARCADE 26）的规则：三人各 16 张（一副牌去掉大小王、三张 2 只留 ♠2、去掉 ♠A，共 48 张），谁先出完谁赢。
// 牌点 3 < 4 < … < K < A < 2。第一局拿 ♠3 的人先出，而且第一手要带上 ♠3；之后由上一局的赢家先出。
// 牌型：单张、对子、连对（两对起）、三带二（最后一手可以三带一或只出三张）、顺子（五张起，不含 2）、
// 飞机（两组以上连续三张，每组带两张；最后一手可以少带）、炸弹（四张同点，压一切非炸弹）。
// 有大必压：能压过上家就必须出，不能「不要」。报单：下家只剩一张时，你出单张必须出手里最大的那张。
// 结算：没出完的人按剩余张数扣分，一张没出过（被关）翻倍；每个炸弹另外从另两家各收 10 分。
import { rng as makeRng, shuffle } from './kit-core.js';

export const NAMES = ['你', '糖糖', '泡泡'];
export const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2' };
export const SUIT = ['♠', '♥', '♣', '♦'];
export const rankOf = (id) => Math.floor(id / 4);
export const suitOf = (id) => id % 4;
export const labelOf = (id) => RANK_LABEL[rankOf(id)] ?? String(rankOf(id));
export const SPADE3 = 3 * 4;
export const TYPE_LABEL = { single: '单张', pair: '对子', pairs: '连对', triple: '三带二', straight: '顺子', plane: '飞机', bomb: '炸弹' };
const sortIds = (ids) => ids.slice().sort((a, b) => rankOf(a) - rankOf(b) || a - b);

export function deck() {
  const ids = [];
  for (let rank = 3; rank <= 15; rank += 1) for (let suit = 0; suit < 4; suit += 1) {
    if (rank === 15 && suit !== 0) continue;   // 只留 ♠2
    if (rank === 14 && suit === 0) continue;   // 去掉 ♠A
    ids.push(rank * 4 + suit);
  }
  return ids;
}
const groupsOf = (ids) => {
  const g = new Map();
  for (const id of sortIds(ids)) { const r = rankOf(id); if (!g.has(r)) g.set(r, []); g.get(r).push(id); }
  return g;
};
const run = (ranks) => ranks.every((r, i) => r < 15 && (i === 0 || r === ranks[i - 1] + 1));

// 判断一组牌是什么牌型。last：这手出完就没牌了（三带、飞机可以少带）。
export function classify(ids, last = false) {
  if (!ids?.length || new Set(ids).size !== ids.length) return null;
  const g = groupsOf(ids), ranks = [...g.keys()], counts = ranks.map((r) => g.get(r).length), n = ids.length;
  const shape = (type, rank, span = 1) => ({ type, rank, span, length: n, label: TYPE_LABEL[type] });
  if (n === 1) return shape('single', ranks[0]);
  if (n === 2 && ranks.length === 1) return shape('pair', ranks[0]);
  if (n === 4 && ranks.length === 1) return shape('bomb', ranks[0]);
  if (n >= 4 && n % 2 === 0 && counts.every((c) => c === 2) && run(ranks)) return shape('pairs', ranks.at(-1), n / 2);
  if (n >= 5 && counts.every((c) => c === 1) && run(ranks)) return shape('straight', ranks.at(-1), n);
  // 三带二 / 飞机：找最长的一串连续三张（取最大的那一串）
  const triples = ranks.filter((r) => g.get(r).length >= 3);
  for (let span = Math.min(triples.length, Math.floor(n / 3)); span >= 1; span -= 1) {
    for (let k = triples.length - span; k >= 0; k -= 1) {
      const body = triples.slice(k, k + span);
      if (span > 1 && !run(body)) continue;
      const wings = n - span * 3;
      if (wings === span * 2 || (last && wings < span * 2)) return shape(span === 1 ? 'triple' : 'plane', body.at(-1), span);
    }
  }
  return null;
}
// 正数表示 next 压得过 prev。
export function beats(next, prev) {
  if (!next) return false;
  if (!prev) return true;
  if (next.type === 'bomb' && prev.type !== 'bomb') return true;
  if (next.type !== prev.type) return false;
  // 三带、飞机按主体比较；最后一手少带的也能压同主体长度的
  if (next.type === 'triple' || next.type === 'plane') return next.span === prev.span && next.rank > prev.rank;
  return next.length === prev.length && next.rank > prev.rank;
}

export function createRound({ seed = Date.now(), leader = null, scores = [0, 0, 0], round = 1 } = {}) {
  const ids = shuffle(deck(), makeRng(seed));
  const hands = [0, 1, 2].map((p) => sortIds(ids.slice(p * 16, p * 16 + 16)));
  const first = leader ?? hands.findIndex((h) => h.includes(SPADE3));
  return { seed, round, hands, current: first, table: null, passes: 0, played: [0, 0, 0], bombs: [0, 0, 0], last: [null, null, null], winner: null, scores: [...scores], delta: null, mustSpade3: leader === null, log: [] };
}
const fail = (reason) => ({ ok: false, reason });
const nextOf = (p) => (p + 1) % 3;

// 所有合法出法（每种牌型只给一个代表性的带牌），用于「有大必压」判断、提示和电脑。
export function legalMoves(state, player = state.current) {
  const hand = state.hands[player];
  const g = groupsOf(hand), ranks = [...g.keys()];
  const target = state.table && state.table.player !== player ? state.table.shape : null;
  const out = [], seen = new Set();
  const lastHand = (ids) => ids.length === hand.length;
  const add = (ids) => {
    const key = sortIds(ids).join(',');
    if (seen.has(key)) return;
    const shape = classify(ids, lastHand(ids));
    if (!shape || (target && !beats(shape, target))) return;
    if (state.mustSpade3 && !ids.includes(SPADE3)) return;
    seen.add(key);
    out.push({ cards: sortIds(ids), shape });
  };
  // 带牌：挑最小的、不是主体点数、不拆炸弹的单张
  const kickers = (exclude, count) => {
    const pool = sortIds(hand.filter((id) => !exclude.includes(rankOf(id))));
    const soft = pool.filter((id) => g.get(rankOf(id)).length < 4);
    const pick = (soft.length >= count ? soft : pool).slice(0, count);
    return pick.length === count ? pick : pool;
  };
  for (const r of ranks) {
    const cards = g.get(r);
    add([cards[0]]);
    if (cards.length >= 2) add(cards.slice(0, 2));
    if (cards.length >= 3) {
      const body = cards.slice(0, 3);
      add([...body, ...kickers([r], 2)]);
      if (hand.length <= 4) add(hand.slice());
    }
    if (cards.length === 4) add(cards);
  }
  for (let len = 5; len <= 12; len += 1) for (let start = 3; start + len - 1 <= 14; start += 1) {
    const rs = Array.from({ length: len }, (_, k) => start + k);
    if (rs.every((r) => g.has(r))) add(rs.map((r) => g.get(r)[0]));
  }
  for (let len = 2; len <= 8; len += 1) for (let start = 3; start + len - 1 <= 14; start += 1) {
    const rs = Array.from({ length: len }, (_, k) => start + k);
    if (rs.every((r) => g.get(r)?.length >= 2)) add(rs.flatMap((r) => g.get(r).slice(0, 2)));
    if (rs.every((r) => g.get(r)?.length >= 3)) {
      const body = rs.flatMap((r) => g.get(r).slice(0, 3));
      const rest = hand.filter((id) => !body.includes(id));
      add([...body, ...kickers(rs, len * 2).filter((id) => !body.includes(id)).slice(0, len * 2)]);
      if (rest.length < len * 2) add(hand.slice());
    }
  }
  // 报单：下家只剩一张，单张只能出最大的
  if (state.hands[nextOf(player)].length === 1) {
    const top = Math.max(...hand.map(rankOf));
    return out.filter((m) => m.shape.type !== 'single' || rankOf(m.cards[0]) === top);
  }
  return out;
}
export const canPass = (state, player = state.current) => Boolean(state.table && state.table.player !== player) && legalMoves(state, player).length === 0;

export function play(state, player, ids) {
  if (state.winner !== null) return fail('这一局已经结束');
  if (player !== state.current) return fail('还没轮到你');
  const hand = state.hands[player];
  if (!ids?.length || ids.some((id) => !hand.includes(id))) return fail('先选好要出的牌');
  const shape = classify(ids, ids.length === hand.length);
  if (!shape) return fail('这几张牌凑不成牌型');
  if (state.mustSpade3 && !ids.includes(SPADE3)) return fail('第一手要带上 ♠3');
  const target = state.table && state.table.player !== player ? state.table.shape : null;
  if (target && !beats(shape, target)) return fail(`要出比上家更大的${target.label}，或者炸弹`);
  if (shape.type === 'single' && state.hands[nextOf(player)].length === 1 && rankOf(ids[0]) !== Math.max(...hand.map(rankOf))) return fail('下家报单了，单张只能出最大的');
  state.hands[player] = hand.filter((id) => !ids.includes(id));
  state.table = { player, cards: sortIds(ids), shape };
  state.passes = 0;
  state.played[player] += 1;
  state.mustSpade3 = false;
  state.last[player] = { text: shape.label, cards: sortIds(ids) };
  state.log.push({ player, cards: sortIds(ids), label: shape.label });
  if (shape.type === 'bomb') {
    state.bombs[player] += 1;
    state.scores = state.scores.map((s, p) => (p === player ? s + 20 : s - 10));
  }
  if (!state.hands[player].length) return finish(state, player, shape);
  state.current = nextOf(player);
  state.last[state.current] = null;
  return { ok: true, shape };
}
export function pass(state, player) {
  if (state.winner !== null || player !== state.current) return fail('还没轮到你');
  if (!state.table || state.table.player === player) return fail('该你先出，不能不要');
  if (legalMoves(state, player).length) return fail('有大必压：你有能压过的牌');
  state.last[player] = { text: '不要', cards: [] };
  state.passes += 1;
  state.current = nextOf(player);
  if (state.passes >= 2) {
    state.table = null;
    state.passes = 0;
    state.last = [null, null, null];
  } else state.last[state.current] = null;
  return { ok: true };
}
function finish(state, winner, shape) {
  state.winner = winner;
  const delta = [0, 0, 0];
  for (let p = 0; p < 3; p += 1) {
    if (p === winner) continue;
    const left = state.hands[p].length;
    const lose = state.played[p] === 0 ? left * 2 : left;   // 被关：一张没出过翻倍
    delta[p] -= lose;
    delta[winner] += lose;
  }
  state.delta = delta;
  state.scores = state.scores.map((s, p) => s + delta[p]);
  return { ok: true, shape, finished: true };
}

// 电脑：领出时先出最小的、能一次多出几张的组合；跟牌时用最小的能压过的，非必要不炸。
export function aiMove(state, player = state.current) {
  const moves = legalMoves(state, player);
  if (!moves.length) return null;
  const hand = state.hands[player];
  const finishing = moves.find((m) => m.cards.length === hand.length);
  if (finishing) return finishing;
  const g = groupsOf(hand);
  const cost = (m) => {
    let c = m.shape.rank * 2 - m.cards.length * 3;
    if (m.shape.type === 'bomb') c += 60;
    // 拆对子、拆三张要扣分
    for (const id of m.cards) if (m.shape.type === 'single' && g.get(rankOf(id)).length > 1) c += 8;
    if (m.cards.some((id) => rankOf(id) === 15)) c += 10;
    return c;
  };
  const leading = !state.table || state.table.player === player;
  if (leading) return moves.slice().sort((a, b) => cost(a) - cost(b))[0];
  const nonBomb = moves.filter((m) => m.shape.type !== 'bomb');
  const pool = nonBomb.length ? nonBomb : moves;
  return pool.slice().sort((a, b) => a.shape.rank - b.shape.rank || cost(a) - cost(b))[0];
}
// 提示：给玩家的建议就是电脑的选择。
export const hintMove = (state, player = 0) => aiMove(state, player);
