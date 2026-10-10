import { createState, applyAction } from '../../junqi-core.js';
import { rngFrom } from './util.js';

// 军棋翻棋版：座位 0 先手，首枚被翻开的棋子决定两人的阵营。
// 暗棋的身份（kind）和阵营（side）是隐藏信息，view 里一律抹掉，只剩「没翻开」；翻开后才对双方公开。
// 客户端的 legalMoves 只看明棋，所以抹掉之后它算出的落点和服务端完全一致。
const clean = (action) => {
  if (action?.type === 'flip') return { type: 'flip', at: action.at };
  if (action?.type === 'move') return { type: 'move', from: action.from, to: action.to };
  return null;   // 多余的字段会被核心原样存进 state.last 再发给对手，所以只留需要的
};

export default {
  id: 'junqi',
  seats: 2,
  init: ({ seed } = {}) => createState(rngFrom({ s: seed })),
  canAct: (state, seat) => state.status === 'playing' && state.turn === seat,
  apply: (state, seat, action) => {
    const result = applyAction(state, clean(action));
    return result.ok ? { ok: true, state: result.state } : { ok: false, message: result.message };
  },
  view: (state) => ({ ...state, board: state.board.map((piece) => (piece && !piece.revealed ? { revealed: false } : piece)) }),
  result: (state) => ({ over: state.status !== 'playing', winner: state.status === 'won' ? state.winner : null })
};
