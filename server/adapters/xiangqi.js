import { createXiangqi, moveXiangqi } from '../../xiangqi-core.js';

// 象棋引擎挂在 state 对象上（WeakMap），所以这里原地推进，返回同一个对象。
// 视图只发 fen：客户端用 createXiangqi({ fen }) 重建棋盘并自己算可走的落点。
export default {
  id: 'xiangqi',
  seats: 2,
  init: () => createXiangqi(),
  canAct: (state, seat) => state.phase === 'playing' && state.turn === (seat === 0 ? 'r' : 'b'),
  apply: (state, seat, action) => {
    if (typeof action?.from !== 'string' || typeof action?.to !== 'string') return { ok: false, message: '走法格式不对。' };
    return moveXiangqi(state, action.from, action.to).ok ? { ok: true, state } : { ok: false, message: '这步棋不合法。' };
  },
  view: (state) => ({
    fen: state.fen, turn: state.turn, lastMove: state.lastMove, check: state.check,
    phase: state.phase, winner: state.winner, reason: state.reason, plies: state.history.length
  }),
  result: (state) => ({ over: state.phase === 'over', winner: state.winner === 'r' ? 0 : state.winner === 'b' ? 1 : null })
};
