// 斗地主 rules and a deterministic, bounded AI. Card IDs follow the MIT upstream.
import { shuffledDeal, weightOf } from './third_party/doudizhu/cards.js';
export const rankOf = (id) => { const weight = weightOf(id); return weight === null ? null : weight + 2; };
export function card(rank, suit = 0) {
  if (rank === 2) rank = 15;
  if (rank === 16 || rank === 17) return rank + 36;
  if (!Number.isInteger(rank) || rank < 3 || rank > 15 || !Number.isInteger(suit) || suit < 0 || suit > 3) return null;
  return (rank === 14 ? 0 : rank === 15 ? 1 : rank - 1) * 4 + suit;
}
const RANK_LABELS = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' };
export const labelOf = (id) => RANK_LABELS[rankOf(id)] ?? String(rankOf(id));
export const suitOf = (id) => id >= 52 ? '★' : ['♠', '♣', '♥', '♦'][id % 4];
export const sortCards = (cards) => cards.slice().sort((a, b) => rankOf(a) - rankOf(b) || a - b);
const groupsOf = (cards) => {
  const groups = new Map();
  for (const id of sortCards(cards)) { const rank = rankOf(id); if (!groups.has(rank)) groups.set(rank, []); groups.get(rank).push(id); }
  return groups;
};
const consecutive = (ranks) => ranks.every((rank, i) => rank < 15 && (i === 0 || rank === ranks[i - 1] + 1));
export const TYPE_LABELS = { single: '单张', pair: '对子', triple: '三张', tripleOne: '三带一', triplePair: '三带二', straight: '顺子', pairStraight: '连对', airplane: '飞机', airplaneSingle: '飞机带单', airplanePair: '飞机带对', fourTwo: '四带二', fourPairs: '四带两对', bomb: '炸弹', rocket: '王炸' };
export function classify(cards) {
  if (!Array.isArray(cards) || !cards.length || cards.some((id) => rankOf(id) === null) || new Set(cards).size !== cards.length) return null;
  const groups = groupsOf(cards), ranks = [...groups.keys()], counts = ranks.map((rank) => groups.get(rank).length), n = cards.length;
  const shape = (type, rank, span = 1) => ({ type, rank, span, length: n, label: TYPE_LABELS[type] });
  if (n === 1) return shape('single', ranks[0]);
  if (n === 2 && ranks[0] === 16 && ranks[1] === 17) return shape('rocket', 17);
  if (ranks.length === 1) return shape(n === 2 ? 'pair' : n === 3 ? 'triple' : 'bomb', ranks[0]);
  const triple = ranks.find((r) => groups.get(r).length === 3);
  if (n === 4 && triple) return shape('tripleOne', triple);
  if (n === 5 && triple && counts.includes(2)) return shape('triplePair', triple);
  if (n >= 5 && counts.every((count) => count === 1) && consecutive(ranks)) return shape('straight', ranks.at(-1), n);
  if (n >= 6 && n % 2 === 0 && counts.every((count) => count === 2) && consecutive(ranks)) return shape('pairStraight', ranks.at(-1), n / 2);
  if (n >= 6 && n % 3 === 0 && counts.every((count) => count === 3) && consecutive(ranks)) return shape('airplane', ranks.at(-1), n / 3);
  // Wings may contain a pair as two singles, but cannot use a body rank.
  for (const wing of [1, 2]) {
    const span = n / (3 + wing);
    if (!Number.isInteger(span) || span < 2) continue;
    for (let start = 3; start + span - 1 <= 14; start += 1) {
      const body = Array.from({ length: span }, (_, k) => start + k);
      if (!body.every((rank) => groups.get(rank)?.length === 3)) continue;
      const wings = ranks.filter((rank) => !body.includes(rank));
      if (wing === 1 && wings.reduce((sum, rank) => sum + groups.get(rank).length, 0) === span && wings.every((rank) => groups.get(rank).length < 4)) return shape('airplaneSingle', body.at(-1), span);
      if (wing === 2 && wings.length === span && wings.every((rank) => groups.get(rank).length === 2)) return shape('airplanePair', body.at(-1), span);
    }
  }
  const four = ranks.find((rank) => groups.get(rank).length === 4);
  if (four && n === 6) return shape('fourTwo', four);
  if (four && n === 8 && ranks.length === 3 && ranks.filter((rank) => rank !== four).every((rank) => groups.get(rank).length === 2)) return shape('fourPairs', four);
  return null;
}
// A positive number means `next` can beat `previous`; false means it cannot.
export function comparePlays(next, previous) {
  if (!next) return false;
  if (!previous) return 1;
  if (previous.type === 'rocket') return false;
  if (next.type === 'rocket') return 1;
  if (next.type === 'bomb' && previous.type !== 'bomb') return 1;
  if (next.type !== previous.type || next.length !== previous.length || next.span !== previous.span) return false;
  return next.rank > previous.rank ? next.rank - previous.rank : false;
}
export function createGame({ rng = Math.random } = {}) {
  const deal = shuffledDeal(rng);
  return { phase: 'bidding', status: 'playing', players: deal.hands.map((cards, index) => ({ name: ['你', '泡泡', '噗噗'][index], cards: sortCards(cards), bid: null, last: null })), bottom: deal.bottom, current: 0, landlord: null, highBid: 0, highBidder: null, bidCount: 0, table: null, passes: 0, multiplier: 1, winner: null, turns: 0, message: '先叫分选地主，3 分直接成为地主。', rng };
}
const fail = (reason) => ({ ok: false, reason });
export function bid(state, player, score) {
  if (state.status !== 'playing' || state.phase !== 'bidding' || player !== state.current) return fail('还没轮到你叫分');
  if (!Number.isInteger(score) || score < 0 || score > 3 || (score > 0 && score <= state.highBid)) return fail('叫分必须比当前分数高');
  state.players[player].bid = score; state.players[player].last = { text: score ? `${score} 分` : '不叫', cards: [] };
  state.bidCount += 1;
  if (score > 0) { state.highBid = score; state.highBidder = player; }
  if (score === 3 || state.bidCount === 3) {
    if (state.highBidder === null) {
      const rng = state.rng; Object.assign(state, createGame({ rng })); state.message = '都不叫，重新发牌。轮到你叫分。';
      return { ok: true, redeal: true };
    }
    state.landlord = state.highBidder; state.current = state.landlord; state.phase = 'playing';
    state.players[state.landlord].cards = sortCards([...state.players[state.landlord].cards, ...state.bottom]);
    state.players.forEach((seat) => { seat.last = null; });
    state.message = `${state.players[state.landlord].name}成为地主，先出牌。`;
  } else { state.current = (player + 1) % 3; state.message = `${state.players[state.current].name}正在叫分。`; }
  return { ok: true };
}
export function playCards(state, player, cards) {
  if (state.status !== 'playing' || state.phase !== 'playing' || state.current !== player) return fail('还没轮到你出牌');
  if (!Array.isArray(cards) || !cards.length || new Set(cards).size !== cards.length || cards.some((id) => !state.players[player].cards.includes(id))) return fail('请先选择手牌');
  const shape = classify(cards);
  if (!shape) return fail('这组牌不能一起出');
  if (!comparePlays(shape, state.table?.shape)) return fail('需要同牌型更大牌，或炸弹、王炸');
  const selected = new Set(cards), sorted = sortCards(cards);
  state.players[player].cards = state.players[player].cards.filter((id) => !selected.has(id));
  state.players[player].last = { text: shape.label, cards: sorted };
  state.table = { player, cards: sorted, shape }; state.passes = 0; state.turns += 1;
  if (shape.type === 'bomb' || shape.type === 'rocket') state.multiplier *= 2;
  state.message = `${state.players[player].name}出了${shape.label}。`;
  if (!state.players[player].cards.length) {
    state.phase = 'finished'; state.status = 'finished'; state.winner = player;
    state.message = `${player === state.landlord ? '地主' : '农民'}获胜！`;
  } else state.current = (player + 1) % 3;
  return { ok: true, shape };
}
export function pass(state, player) {
  if (state.status !== 'playing' || state.phase !== 'playing' || player !== state.current) return fail('还没轮到你出牌');
  if (!state.table || state.table.player === player) return fail('你领出时不能不要');
  state.players[player].last = { text: '不要', cards: [] }; state.passes += 1; state.current = (player + 1) % 3;
  state.message = `${state.players[player].name}不要。`;
  if (state.passes === 2) {
    state.current = state.table.player; state.table = null; state.passes = 0;
    state.players.forEach((seat) => { seat.last = null; });
    state.message = `${state.players[state.current].name}重新领出。`;
  }
  return { ok: true };
}
// Enumerate rank groups and contiguous runs, never all subsets of a hand.
// For wings one low legal attachment is enough for a useful, guaranteed hint.
export function legalMoves(state, player = state.current) {
  if (state.phase !== 'playing' || state.status !== 'playing' || !state.players[player]) return [];
  const hand = state.players[player].cards, groups = groupsOf(hand), ranks = [...groups.keys()], target = state.table?.shape, moves = [], keys = new Set();
  const add = (cards) => {
    const shape = classify(cards);
    if (!shape || !comparePlays(shape, target)) return;
    const sorted = sortCards(cards), key = sorted.join(',');
    if (!keys.has(key)) { keys.add(key); moves.push({ cards: sorted, shape }); }
  };
  const attach = (body, count, paired) => {
    const excluded = new Set(body.map(rankOf)), needed = paired ? count * 2 : count;
    const choices = ranks.filter((rank) => !excluded.has(rank) && (!paired || groups.get(rank).length >= 2));
    const wings = [];
    for (const rank of choices) {
      wings.push(...groups.get(rank).slice(0, paired ? 2 : Math.min(3, needed - wings.length)));
      if (wings.length >= needed) break;
    }
    if (wings.length === needed) add([...body, ...wings]);
  };
  for (const rank of ranks) {
    const group = groups.get(rank);
    for (let n = 1; n <= Math.min(group.length, 4); n += 1) add(group.slice(0, n));
    if (group.length >= 3) { attach(group.slice(0, 3), 1, false); attach(group.slice(0, 3), 1, true); }
    if (group.length === 4) { attach(group, 2, false); attach(group, 2, true); }
  }
  if (groups.has(16) && groups.has(17)) add([groups.get(16)[0], groups.get(17)[0]]);
  for (const [width, min] of [[1, 5], [2, 3], [3, 2]]) {
    for (let first = 3; first <= 14; first += 1) {
      const body = [];
      for (let end = first; end <= 14 && groups.get(end)?.length >= width; end += 1) {
        body.push(...groups.get(end).slice(0, width));
        const span = end - first + 1;
        if (span >= min) {
          add(body);
          if (width === 3) { attach(body, span, false); attach(body, span, true); }
        }
      }
    }
  }
  return moves.sort((a, b) => {
    const bombA = a.shape.type === 'bomb' || a.shape.type === 'rocket', bombB = b.shape.type === 'bomb' || b.shape.type === 'rocket';
    return Number(bombA) - Number(bombB) || (target ? a.shape.rank - b.shape.rank : b.cards.length - a.cards.length || a.shape.rank - b.shape.rank);
  });
}
export function suggestedMove(state, player = state.current) {
  const moves = legalMoves(state, player), hand = state.players[player]?.cards ?? [];
  return moves.find((move) => move.cards.length === hand.length) ?? moves[0] ?? null;
}
export function aiStep(state) {
  const player = state.current;
  if (state.phase === 'bidding') {
    const hand = state.players[player].cards;
    const strength = hand.reduce((sum, id) => sum + Math.max(0, rankOf(id) - 12), 0) + [...groupsOf(hand).values()].filter((group) => group.length === 4).length * 5;
    const score = strength >= 14 ? 3 : strength >= 9 ? 2 : strength >= 5 ? 1 : 0;
    return bid(state, player, score > state.highBid ? score : 0);
  }
  if (state.phase !== 'playing') return fail('本局已结束');
  const teammate = state.table && state.landlord !== player && state.table.player !== state.landlord;
  const move = suggestedMove(state, player);
  if (teammate && move?.cards.length !== state.players[player].cards.length) return pass(state, player);
  return move ? playCards(state, player, move.cards) : pass(state, player);
}
