import { act, createMatch, nextTimer, tick, viewFor } from '../../wallshot-core.js';

// 隔墙狙击：带计时的回合制（躲藏 5 秒 → 瞄准 12 秒 → 揭晓），所以用到了房间的 timer / tick 钩子。
// 服务端权威：躲的人在哪只有服务端知道，命中由服务端判；狙击的人只在透过洞或窗口看得见时才拿到位置。
// 移动和瞄准是高频小包：过时的（刚换完边还在发）直接静默丢掉，不弹「非法操作」。
export default {
  id: 'wallshot',
  seats: 2,
  // WALLSHOT_TIME_SCALE 只给测试用：把 5 秒 / 12 秒的阶段缩短，房间测试不用真等。
  init: ({ seed } = {}) => createMatch(seed, { scale: Number(process.env.WALLSHOT_TIME_SCALE ?? 1) || 1 }),
  canAct: (state) => state.status === 'playing',
  apply(state, seat, action, now = Date.now()) {
    const next = structuredClone(state);
    if (!act(next, seat, action, now)) return { ok: false, silent: true };
    return { ok: true, state: next };
  },
  timer: (state, now = Date.now()) => nextTimer(state, now),
  tick(state, now = Date.now()) {
    const next = structuredClone(state);
    return tick(next, now) ? { ok: true, state: next } : null;
  },
  view: (state, seat, now = Date.now()) => viewFor(state, seat, now),
  result: (state) => ({ over: state.status === 'over', winner: state.winner })
};
