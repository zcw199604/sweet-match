// 回合制棋类的适配器工厂：核心需要 createState()/applyMove(state, action)，
// 状态里 turn 是 1|2，status 是 'playing'|'won'|'draw'，winner 是 1|2|null（五子棋、黑白棋、跳棋、斗兽棋都是这个形状）。
export function boardGame(id, core, { view = (state) => state, illegal } = {}) {
  return {
    id,
    seats: 2,
    init: () => core.createState(),
    canAct: (state, seat) => state.status === 'playing' && state.turn - 1 === seat,
    apply: (state, seat, action) => {
      const result = core.applyMove(state, action);
      return result.ok ? { ok: true, state: result.state } : { ok: false, message: illegal || result.message };
    },
    view,
    result: (state) => ({ over: state.status !== 'playing', winner: state.winner ? state.winner - 1 : null })
  };
}
