import { createAeroplane, rollAeroplane, moveAeroplane, previewAeroplane } from '../../aeroplane-core.js';
import { rngFrom, pick } from './util.js';

// 真人坐哪几支队：2 人坐对角（红、绿），其余的队由电脑代打（room 的 auto 钩子）。座位 i ↔ TEAMS[humans][i]。
const TEAMS = { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] };
const HUMANS = [2, 3, 4];
const seatOfTeam = (state, team) => TEAMS[state.humans].indexOf(team);   // 没有真人 → -1

export default {
  id: 'aeroplane',
  seats: 4,
  seatCount: ({ humans } = {}) => pick(humans, HUMANS, 2),
  init: ({ seed, humans } = {}) => ({ humans: pick(humans, HUMANS, 2), rng: seed | 0, game: createAeroplane() }),
  canAct: (state, seat) => state.game.phase !== 'won' && state.game.turn === TEAMS[state.humans][seat],
  apply: (state, seat, action) => {
    const next = structuredClone(state), g = next.game;
    if (action?.type === 'roll') {
      const box = { s: next.rng };
      if (!rollAeroplane(g, rngFrom(box))) return { ok: false, message: '现在不能掷骰子。' };
      next.rng = box.s;
    } else if (action?.type === 'move') {
      if (!moveAeroplane(g, action.plane)) return { ok: false, message: '这架飞机现在不能动。' };
    } else return { ok: false, message: '无法识别的操作' };
    return { ok: true, state: next };
  },
  // 电脑队：先掷骰，再挑得分最高的一步（到终点 > 撞回对手 > 起飞/前进），和本地人机同一套打法。
  auto: (state) => {
    const g0 = state.game;
    if (g0.phase === 'won' || seatOfTeam(state, g0.turn) >= 0) return null;
    const next = structuredClone(state), g = next.game;
    if (g.phase === 'roll') {
      const box = { s: next.rng };
      rollAeroplane(g, rngFrom(box));
      next.rng = box.s;
    } else {
      const score = (m) => (m.to === 57 ? 1000 : 0) + m.captured.length * 100 + (m.from < 0 ? 30 : m.to);
      const best = g.legal.map((plane) => previewAeroplane(g, plane)).sort((a, b) => score(b) - score(a))[0];
      if (!best || !moveAeroplane(g, best.plane)) return null;
    }
    return { ok: true, state: next };
  },
  // 没有隐藏信息：棋盘、骰子、可走的飞机都是公开的。team 是我这一座对应的队，teams 是每支队的座位（电脑队为 null）。
  view: (state, seat = 0) => {
    const g = state.game;
    return {
      planes: g.planes, turn: g.turn, phase: g.phase, dice: g.dice, legal: g.legal, sixes: g.sixes, winner: g.winner,
      moves: g.moves, lastMove: g.lastMove, message: g.message,
      team: TEAMS[state.humans][seat], teams: [0, 1, 2, 3].map((t) => { const s = seatOfTeam(state, t); return s < 0 ? null : s; })
    };
  },
  result: (state) => {
    const g = state.game;
    return { over: g.phase === 'won', winner: g.phase === 'won' ? (seatOfTeam(state, g.winner) >= 0 ? seatOfTeam(state, g.winner) : null) : null };
  }
};
