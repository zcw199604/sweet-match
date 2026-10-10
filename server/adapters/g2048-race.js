import { createState, move, maxTile } from '../../g2048-core.js';
import { rngFrom, pick } from './util.js';

const TARGETS = [128, 256, 512, 1024, 2048];

// 2048 双人竞速：两人各玩自己的盘，同一个种子（开局一样、之后每一步新方块的数值序列一样），
// 先合出目标数字的人赢；某人无路可走就停手，双方都走不动则比分数。
export default {
  id: 'g2048',
  seats: 2,
  init: ({ seed, target } = {}) => {
    const players = [0, 1].map(() => {
      const box = { s: seed };
      return { game: createState(rngFrom(box)), rng: box.s };
    });
    return { target: pick(target, TARGETS, 1024), players, status: 'playing', winner: null, reason: null };
  },
  canAct: (state, seat) => state.status === 'playing' && !state.players[seat].game.over,
  cantAct: () => '你的盘面已经无路可走，等对手结束。',
  apply: (state, seat, action) => {
    if (action?.type !== 'move') return { ok: false, message: '竞速模式只能滑动。' };
    const next = structuredClone(state);
    const player = next.players[seat], box = { s: player.rng };
    if (!move(player.game, action.dir, rngFrom(box)).ok) return { ok: false, message: '这个方向滑不动。' };
    player.rng = box.s;
    if (maxTile(player.game) >= next.target) Object.assign(next, { status: 'over', winner: seat, reason: 'target' });
    else if (next.players.every((p) => p.game.over)) {
      const [a, b] = next.players.map((p) => p.game.score);
      Object.assign(next, { status: 'over', winner: a === b ? null : a > b ? 0 : 1, reason: 'stuck' });
    }
    return { ok: true, state: next };
  },
  // 2048 没有隐藏信息，双方的盘面都发（客户端可以画对手的小棋盘）；撤销历史和随机状态不发。
  view: (state) => ({
    target: state.target, status: state.status, winner: state.winner, reason: state.reason,
    players: state.players.map(({ game }) => ({ tiles: game.tiles, nextId: game.nextId, score: game.score, moves: game.moves, over: game.over, max: maxTile(game) }))
  }),
  result: (state) => ({ over: state.status === 'over', winner: state.winner })
};
