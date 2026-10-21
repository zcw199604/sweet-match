// 围棋（ARCADE 33）的画面：9 路木纹棋盘。点交叉点落子；双方都「停一手」后进入数子，
// 电脑先猜好死子（打叉），点一块棋可以改它的死活，再点「确认数子」出结果。
// 电脑在后台分片思考（每片几十毫秒），思考时画面照常刷新。
import { BLACK, LEVELS, PASS, Search, WHITE, createGame, groupAt, guessDead, idx, isLegal, pass, play, rc, score, undo } from './weiqi-core.js';
import { button, canvasGame, inRect, orb, roundRect, store, text } from './kit.js';

const W = 360;
const H = 540;
const SIZE = 9;
const CELL = 36;
const OX = (W - CELL * (SIZE - 1)) / 2;
const OY = 52;
const MODES = [
  { id: 'black', label: '执黑', bot: WHITE },
  { id: 'white', label: '执白', bot: BLACK },
  { id: 'duo', label: '双人', bot: 0 }
];
const LEVEL_IDS = Object.keys(LEVELS);
const BTN = { left: { x: 28, y: 470, w: 140, h: 44 }, right: { x: 192, y: 470, w: 140, h: 44 } };
const SAVE = store('pao-weiqi');
const STONE = { [BLACK]: ['#4a4f63', '#8b90a8', '#111320'], [WHITE]: ['#f4f2ec', '#ffffff', '#b9b4a6'] };
const NAME = { [BLACK]: '黑', [WHITE]: '白' };

export function mountWeiqi(wrap, { onHud = () => {}, onButtons = () => {} } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '围棋游戏画布', game: 'weiqi' });
  const saved = SAVE.get({ mode: 'black', level: 'normal', wins: 0, games: 0 });
  let mode = MODES.find((m) => m.id === saved.mode) ?? MODES[0];
  let level = LEVEL_IDS.includes(saved.level) ? saved.level : 'normal';
  let stats = { wins: saved.wins ?? 0, games: saved.games ?? 0 };
  let state = null;
  let thinking = null; // { search, timer, target }
  let scoring = null;  // { dead: Set }
  let note = '';

  const persist = () => SAVE.set({ mode: mode.id, level, ...stats });
  const xy = (i) => { const [r, c] = rc(state, i); return [OX + c * CELL, OY + r * CELL]; };
  const hud = () => onHud(scoring ? '数子中：点一块棋可以改死活' : thinking ? '电脑思考中……' : `第 ${state.moves + 1} 手 · ${NAME[state.toPlay]}下`);
  const labels = () => onButtons({ mode: mode.label, level: mode.bot ? LEVELS[level].label : null });
  function fresh() {
    stop();
    shell.closeCard();
    state = createGame(SIZE);
    scoring = null;
    note = mode.bot === BLACK ? '电脑执黑先下' : '黑先';
    labels(); hud();
    shell.poke();
    maybeThink();
  }
  function stop() { if (thinking) clearTimeout(thinking.timer); thinking = null; }
  function maybeThink() {
    if (!mode.bot || state.over || state.toPlay !== mode.bot || scoring) return;
    const search = new Search(state);
    thinking = { search, target: LEVELS[level].playouts, timer: 0 };
    hud();
    const slice = () => {
      if (!shell.alive || !thinking || thinking.search !== search) return;
      const t0 = performance.now();
      while (performance.now() - t0 < 24 && search.playouts < thinking.target) search.run(20);
      shell.poke();
      if (search.playouts < thinking.target) { thinking.timer = setTimeout(slice, 0); return; }
      const { move } = search.best();
      thinking = null;
      if (move === PASS) { pass(state); note = '电脑停了一手'; } else { play(state, move); note = ''; }
      after();
    };
    thinking.timer = setTimeout(slice, 60);
  }
  function after() {
    hud();
    shell.poke();
    if (state.over) return beginScoring();
    maybeThink();
  }
  function beginScoring() {
    stop();
    scoring = { dead: guessDead(state, 500) };
    note = '双方都停了一手，数子';
    hud();
    shell.poke();
  }
  function finish() {
    const result = score(state, scoring.dead);
    const w = result.winner;
    if (mode.bot) { stats.games += 1; if (w !== mode.bot) stats.wins += 1; persist(); }
    const lines = [`黑 ${result.black} 子 · 白 ${result.white} 子（含贴 ${state.komi}）`];
    if (mode.bot) lines.push(`对电脑战绩：${stats.wins} 胜 / ${stats.games} 局`);
    const human = !mode.bot || w !== mode.bot;
    shell.card({ title: `${NAME[w]}胜 ${result.margin} 子`, lines, buttons: [{ label: '再来一局', action: fresh }], tone: human ? 'won' : 'lost' });
  }

  function tapPoint(i) {
    if (shell.cardOpen) return false;
    if (scoring) {
      if (state.board[i] !== BLACK && state.board[i] !== WHITE) return false;
      const { stones } = groupAt(state.board, state.N, i);
      const deadNow = scoring.dead.has(i);
      for (const s of stones) deadNow ? scoring.dead.delete(s) : scoring.dead.add(s);
      shell.poke();
      return true;
    }
    if (thinking || (mode.bot && state.toPlay === mode.bot)) return false;
    if (!isLegal(state, i)) { shell.toast(state.board[i] ? '这里已经有子了' : '这里不能下（自杀或打劫）', 1100, 420); return false; }
    play(state, i);
    note = '';
    after();
    return true;
  }
  function tapButton(key) {
    if (shell.cardOpen) return;
    if (scoring) {
      if (key === 'left') return finish();
      // 继续下：退回最后一次停一手之前
      undo(state);
      scoring = null;
      note = '接着下';
      hud(); shell.poke(); maybeThink();
      return;
    }
    if (key === 'left') {
      if (thinking || (mode.bot && state.toPlay === mode.bot)) return;
      pass(state);
      note = `${NAME[3 - state.toPlay]}停了一手`;
      return after();
    }
    // 悔棋：对电脑时退两手回到自己
    stop();
    if (!undo(state)) return;
    if (mode.bot && state.toPlay === mode.bot) undo(state);
    note = '悔了一步';
    hud(); shell.poke(); maybeThink();
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    const p = shell.point(event);
    for (const key of Object.keys(BTN)) if (inRect(p, BTN[key])) return tapButton(key);
    const c = Math.round((p.x - OX) / CELL), r = Math.round((p.y - OY) / CELL);
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return;
    if (Math.hypot(p.x - (OX + c * CELL), p.y - (OY + r * CELL)) > CELL * 0.5) return;
    tapPoint(idx(state, r, c));
  });

  shell.render = (ctx) => {
    // 木纹棋盘
    roundRect(ctx, OX - 24, OY - 24, CELL * (SIZE - 1) + 48, CELL * (SIZE - 1) + 48, 12);
    const g = ctx.createLinearGradient(0, OY - 24, 0, OY + CELL * SIZE);
    g.addColorStop(0, '#f2c98a'); g.addColorStop(1, '#d9a35e');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#7a5226'; ctx.lineWidth = 1.2;
    for (let k = 0; k < SIZE; k += 1) {
      ctx.beginPath(); ctx.moveTo(OX, OY + k * CELL); ctx.lineTo(OX + CELL * (SIZE - 1), OY + k * CELL); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(OX + k * CELL, OY); ctx.lineTo(OX + k * CELL, OY + CELL * (SIZE - 1)); ctx.stroke();
    }
    for (const [r, c] of [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]]) { ctx.beginPath(); ctx.arc(OX + c * CELL, OY + r * CELL, 3.5, 0, Math.PI * 2); ctx.fillStyle = '#7a5226'; ctx.fill(); }
    // 数子时的地盘
    const owner = scoring ? score(state, scoring.dead).owner : null;
    for (let r = 0; r < SIZE; r += 1) for (let c = 0; c < SIZE; c += 1) {
      const i = idx(state, r, c), [x, y] = xy(i), v = state.board[i];
      if (v === BLACK || v === WHITE) {
        const dead = scoring?.dead.has(i);
        orb(ctx, x, y, CELL * 0.46, STONE[v], { alpha: dead ? 0.45 : 1 });
        if (dead) { ctx.strokeStyle = '#ff5d80'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x - 8, y - 8); ctx.lineTo(x + 8, y + 8); ctx.moveTo(x + 8, y - 8); ctx.lineTo(x - 8, y + 8); ctx.stroke(); }
        if (i === state.last && !scoring) { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.strokeStyle = v === BLACK ? '#fff' : '#ff5d80'; ctx.lineWidth = 2; ctx.stroke(); }
      }
      if (owner && (owner[i] === BLACK || owner[i] === WHITE) && (v === 0 || scoring.dead.has(i))) {
        ctx.fillStyle = owner[i] === BLACK ? '#1d2033' : '#ffffff';
        ctx.fillRect(x - 5, y - 5, 10, 10);
      }
    }
    // 状态
    const by = OY + CELL * (SIZE - 1) + 46;
    text(ctx, `提子  黑 ${state.captures[BLACK]} · 白 ${state.captures[WHITE]}`, 20, by, { size: 12, align: 'left', color: '#c9cdf0', weight: 700 });
    text(ctx, `贴 ${state.komi}`, W - 20, by, { size: 12, align: 'right', color: '#c9cdf0', weight: 700 });
    if (thinking) {
      const k = thinking.search.playouts / thinking.target;
      roundRect(ctx, 20, by + 18, W - 40, 8, 4); ctx.fillStyle = '#ffffff1a'; ctx.fill();
      roundRect(ctx, 20, by + 18, Math.max(8, (W - 40) * k), 8, 4); ctx.fillStyle = '#8e7bff'; ctx.fill();
      text(ctx, '电脑思考中……', W / 2, by + 44, { size: 13, color: '#e7e9ff' });
    } else text(ctx, scoring ? '打叉的是死子，点一块棋改它的死活' : note || `轮到${NAME[state.toPlay]}`, W / 2, by + 32, { size: 13, color: '#e7e9ff' });
    if (scoring) {
      const r = score(state, scoring.dead);
      text(ctx, `黑 ${r.black} · 白 ${r.white}`, W / 2, by + 54, { size: 12, color: '#ffd543' });
      button(ctx, BTN.left, '确认数子', { color: '#ff5d80' });
      button(ctx, BTN.right, '继续下');
    } else {
      const mine = !thinking && !(mode.bot && state.toPlay === mode.bot);
      button(ctx, BTN.left, '停一手', { off: !mine });
      button(ctx, BTN.right, '悔棋', { off: !state.history.length });
    }
  };

  fresh();
  // 全屏：棋盘是游戏区，下面的提子 / 提示 / 按钮是信息栏
  shell.regions = () => [
    { x: OX - 26, y: OY - 26, w: CELL * (SIZE - 1) + 52, h: CELL * (SIZE - 1) + 52, role: 'main' },
    { x: 0, y: OY + CELL * (SIZE - 1) + 30, w: W, h: H - (OY + CELL * (SIZE - 1) + 30), role: 'bottom' }
  ];

  return {
    get state() { return state; },
    get thinking() { return Boolean(thinking); },
    get scoring() { return scoring; },
    get modeId() { return mode.id; },
    restart: fresh,
    mode() { mode = MODES[(MODES.indexOf(mode) + 1) % MODES.length]; persist(); fresh(); },
    level() { level = LEVEL_IDS[(LEVEL_IDS.indexOf(level) + 1) % LEVEL_IDS.length]; persist(); labels(); },
    tapPoint,
    tapButton,
    locate(r, c) { const [x, y] = xy(idx(state, r, c)); return shell.page(x, y); },
    destroy() { stop(); shell.destroy(); }
  };
}
