import { aiStep, bid, createGame, pass, playCards } from '../../doudizhu-core.js';
import { rngFrom, pick } from './util.js';

const HUMANS = [2, 3];

// 斗地主：2 人开房时第三家由电脑代打（room 的 auto 钩子），3 人则全是真人。座位 i 就是牌桌上的玩家 i，玩家 0 先叫分。
// 核心里的玩家名是「你/泡泡/噗噗」，联机里换成中性的名字；重新发牌（没人叫分）会重建名字，所以每次推进后再改一遍。
function setNames(game, humans) {
  game.players.forEach((player, i) => { player.name = i < humans ? `玩家 ${i + 1}` : '电脑'; });
  return game;
}

export default {
  id: 'doudizhu',
  seats: 3,
  teamGame: true,   // 农民是两个人一队，有人中途离开没法判谁赢 → 本局作废
  seatCount: ({ humans } = {}) => pick(humans, HUMANS, 2),
  init: ({ seed, humans } = {}) => {
    const count = pick(humans, HUMANS, 2);
    return { humans: count, game: setNames(createGame({ rng: rngFrom({ s: seed }) }), count) };
  },
  canAct: (state, seat) => state.game.status === 'playing' && state.game.current === seat,
  // 核心先校验再改状态，失败时原样不动，所以可以直接在原对象上推进。
  apply: (state, seat, action) => {
    const g = state.game;
    let result;
    if (action?.type === 'bid') result = bid(g, seat, action.score);
    else if (action?.type === 'play') result = Array.isArray(action.cards) && action.cards.every(Number.isInteger) ? playCards(g, seat, action.cards) : { ok: false, reason: '请先选择手牌' };
    else if (action?.type === 'pass') result = pass(g, seat);
    else return { ok: false, message: '无法识别的操作' };
    if (!result.ok) return { ok: false, message: result.reason };
    if (result.redeal) { setNames(g, state.humans); g.message = '都没人叫分，重新发牌。'; }
    return { ok: true, state };
  },
  // 轮到电脑座位时由房间调用：走一步，轮回真人就返回 null。
  auto: (state) => {
    const g = state.game;
    if (g.status !== 'playing' || g.current < state.humans) return null;
    const result = aiStep(g);
    if (!result.ok) return null;
    if (result.redeal) { setNames(g, state.humans); g.message = '都没人叫分，重新发牌。'; }
    return { ok: true, state };
  },
  // 视角旋转：players[0] 永远是「我」，后面依次是下家、上家，客户端可以照本地版那样画。
  // 别人的手牌只给张数（对局结束后才亮出）；叫分阶段底牌是暗的；服务端的随机数发生器当然不发。
  view: ({ game: g, humans }, seat = 0) => {
    const rel = (p) => (p === null || p === undefined ? p : (p - seat + 3) % 3);
    const finished = g.phase === 'finished';
    const me = `玩家 ${seat + 1}`;
    return {
      phase: g.phase, status: g.status, highBid: g.highBid, bidCount: g.bidCount, passes: g.passes, multiplier: g.multiplier, turns: g.turns,
      current: rel(g.current), landlord: rel(g.landlord), highBidder: rel(g.highBidder), winner: rel(g.winner),
      bottom: g.phase === 'bidding' ? g.bottom.map(() => null) : g.bottom,
      table: g.table && { player: rel(g.table.player), cards: g.table.cards, shape: g.table.shape },
      players: [0, 1, 2].map((k) => {
        const p = g.players[(seat + k) % 3];
        return { name: k === 0 ? '你' : p.name, bot: (seat + k) % 3 >= humans, bid: p.bid, last: p.last, count: p.cards.length, cards: k === 0 || finished ? p.cards : [] };
      }),
      message: g.message.replaceAll(me, '你')
    };
  },
  result: ({ game: g }) => ({ over: g.status === 'finished', winner: g.winner })
};
