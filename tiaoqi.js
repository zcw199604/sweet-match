// 中国跳棋（ARCADE 32）的画面：六角星棋盘、三种颜色的糖果棋子。点自己的棋子会标出能去的孔，
// 再点其中一个就走过去（连跳会一跳一跳地播出来）。可以对一个电脑、对两个电脑，或者两个人同屏轮流。
import { CELLS, createGame, destinations, inCorner, key, move, parse, undo, aiMove } from './tiaoqi-core.js';
import { CANDY, canvasGame, orb, store, text } from './kit.js';

const W = 360;
const H = 480;
const S = 15.6;
const CX = W / 2;
const CY = 222;
const SQ3 = Math.sqrt(3);
const MODES = [
  { id: 'ai1', label: '对一个电脑', players: 2, bots: [false, true] },
  { id: 'ai2', label: '对两个电脑', players: 3, bots: [false, true, true] },
  { id: 'duo', label: '同屏双人', players: 2, bots: [false, false] }
];
const TONE = [6, 7, 3]; // 粉、青、黄
const NAME = { ai1: ['你', '电脑'], ai2: ['你', '电脑 A', '电脑 B'], duo: ['粉方', '青方'] };
const SAVE = store('pao-tiaoqi');
const xy = (c) => [CX + S * SQ3 * (c[0] + c[2] / 2), CY + S * 1.5 * c[2]];

export function mountTiaoqi(wrap, { onHud = () => {}, onButtons = () => {} } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '中国跳棋游戏画布', game: 'tiaoqi' });
  const saved = SAVE.get({ mode: 'ai1', wins: 0, games: 0 });
  let mode = MODES.find((m) => m.id === saved.mode) ?? MODES[0];
  let state = null;
  let pick = null;
  let reach = new Map();
  let anim = null;
  let aiTimer = 0;
  let stats = { wins: saved.wins ?? 0, games: saved.games ?? 0 };

  const names = () => NAME[mode.id];
  const hud = () => onHud(state.winner !== null ? `${names()[state.winner]}赢了` : `轮到${names()[state.current]}`);
  const labels = () => onButtons({ mode: mode.label, undo: '悔棋' });
  function fresh() {
    clearTimeout(aiTimer);
    shell.closeCard();
    state = createGame(mode.players, { bots: mode.bots });
    pick = null; reach = new Map(); anim = null;
    labels();
    hud();
    shell.poke();
    schedule();
  }
  function schedule() {
    clearTimeout(aiTimer);
    if (state.winner !== null || !state.bots[state.current]) return;
    aiTimer = setTimeout(() => {
      if (!shell.alive || state.winner !== null || !state.bots[state.current]) return;
      const mv = aiMove(state);
      if (!mv) { state.current = (state.current + 1) % state.players; return after(); }
      go(mv.from, mv.to);
    }, anim ? 650 : 420);
  }
  function go(from, to) {
    const player = state.current;
    const path = move(state, from, to);
    if (!path) return false;
    anim = { path, player, t0: performance.now(), hop: path.length > 2 || Math.abs(parse(path[0])[0] - parse(path[1])[0]) + Math.abs(parse(path[0])[2] - parse(path[1])[2]) > 2 ? 150 : 120 };
    pick = null; reach = new Map();
    shell.poke(anim.hop * path.length + 50);
    after();
    return true;
  }
  function after() {
    hud();
    if (state.winner !== null) {
      const human = !state.bots[state.winner];
      if (mode.id !== 'duo') { stats.games += 1; if (state.winner === 0) stats.wins += 1; }
      SAVE.set({ mode: mode.id, ...stats });
      setTimeout(() => {
        if (!shell.alive) return;
        const lines = [`一共走了 ${state.moves} 步`];
        if (mode.id !== 'duo') lines.push(`对电脑战绩：${stats.wins} 胜 / ${stats.games} 局`);
        shell.card({ title: `${names()[state.winner]}赢了！`, lines, buttons: [{ label: '再来一局', action: fresh }], tone: human ? 'won' : 'lost' });
      }, anim ? anim.hop * anim.path.length + 300 : 300);
      return;
    }
    schedule();
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    if (shell.cardOpen || state.winner !== null || state.bots[state.current]) return;
    const p = shell.point(event);
    let best = null, d = S * 0.95;
    for (const c of CELLS) { const [x, y] = xy(c), dd = Math.hypot(p.x - x, p.y - y); if (dd < d) { d = dd; best = key(c); } }
    if (!best) return;
    if (state.board[best] === state.current) { pick = best; reach = destinations(state, best); return shell.poke(); }
    if (pick && reach.has(best)) return go(pick, best);
    pick = null; reach = new Map();
    shell.poke();
  });

  shell.render = (ctx, now) => {
    // 星形底板：两个大三角
    ctx.save();
    for (const flip of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        const a = -Math.PI / 2 * flip + (i * 2 * Math.PI) / 3;
        const r = S * 13.4;
        const x = CX + r * Math.cos(a), y = CY + r * Math.sin(a) * 1.0;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#ffffff10';
      ctx.fill();
    }
    ctx.restore();
    // 孔：角上按主人和目标染色
    for (const c of CELLS) {
      const [x, y] = xy(c);
      let tint = '#ffffff22';
      state.corners.forEach((corner, p) => { if (inCorner(c, corner)) tint = `${CANDY[TONE[p]][0]}55`; });
      ctx.beginPath(); ctx.arc(x, y, S * 0.36, 0, Math.PI * 2); ctx.fillStyle = tint; ctx.fill();
    }
    // 上一步的路线
    const moving = anim && now - anim.t0 < anim.hop * (anim.path.length - 1);
    if (state.last) {
      ctx.save();
      ctx.strokeStyle = `${CANDY[TONE[state.last.player]][0]}aa`; ctx.lineWidth = 2.5; ctx.setLineDash([5, 4]);
      ctx.beginPath();
      state.last.path.forEach((k, i) => { const [x, y] = xy(parse(k)); return i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.restore();
    }
    // 棋子
    const movingTo = moving ? anim.path.at(-1) : null;
    for (const [k, p] of Object.entries(state.board)) {
      if (k === movingTo) continue;
      const [x, y] = xy(parse(k));
      orb(ctx, x, y, S * 0.56, TONE[p], { glow: k === pick ? '#ffffff' : '' });
    }
    if (moving) {
      const t = (now - anim.t0) / anim.hop, i = Math.min(anim.path.length - 2, Math.floor(t)), f = t - i;
      const [ax, ay] = xy(parse(anim.path[i])), [bx, by] = xy(parse(anim.path[i + 1]));
      orb(ctx, ax + (bx - ax) * f, ay + (by - ay) * f - Math.sin(f * Math.PI) * 10, S * 0.6, TONE[anim.player]);
      shell.poke(16);
    }
    // 能去的地方
    for (const k of reach.keys()) { const [x, y] = xy(parse(k)); ctx.beginPath(); ctx.arc(x, y, S * 0.24, 0, Math.PI * 2); ctx.fillStyle = '#ffd543'; ctx.fill(); }
    // 底部：每个人的颜色和目标
    state.corners.forEach((_, p) => {
      const x = 30 + p * 110, y = H - 28;
      orb(ctx, x, y, 9, TONE[p]);
      text(ctx, names()[p], x + 16, y + 1, { size: 12, align: 'left', color: state.current === p && state.winner === null ? '#fff' : '#9aa0c8' });
      if (state.current === p && state.winner === null) { ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
    });
  };

  fresh();
  return {
    get state() { return state; },
    get modeId() { return mode.id; },
    restart: fresh,
    // 顶栏的玩法按钮：对一个电脑 → 对两个电脑 → 同屏双人，换了就重开
    mode() { mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]; SAVE.set({ mode: mode.id, ...stats }); fresh(); },
    undo() {
      if (state.winner !== null) return;
      clearTimeout(aiTimer);
      // 对电脑时一直退回到轮到你的时候
      do { if (!undo(state)) break; } while (state.bots[state.current]);
      pick = null; reach = new Map(); anim = null;
      hud(); shell.poke(); schedule();
    },
    go,
    locate(k) { const [x, y] = xy(parse(k)); return shell.page(x, y); },
    destroy() { clearTimeout(aiTimer); shell.destroy(); }
  };
}
