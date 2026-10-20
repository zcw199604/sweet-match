// 毛线三消（ARCADE 35）的画面：一幅毛线球拼成的像素画，上面三个线轴、中间一根挂球的暂存杆。
// 规则在 yarn-core.js；画面另存一份「看到的样子」，按事件回放毛线球飞上线轴、线轴绕满收走。
import { SPOOLS, addPeg, createLevel, findHint, isExposed, left, outcome, takeBall } from './yarn-core.js';
import { CANDY, button, calm, canvasGame, inRect, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const SPOOL_X = [66, 180, 294];
const SPOOL_Y = 66;
const ROD_Y = 150;
const PIC_Y = 196;
const ADD_BTN = { x: 106, y: 588, w: 148, h: 40 };
const SAVE = store('pao-yarn');

function yarnBall(ctx, x, y, r, color, { dim = false, glow = '' } = {}) {
  const [base, light, dark] = CANDY[color];
  ctx.save();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, light); g.addColorStop(0.55, base); g.addColorStop(1, dark);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
  ctx.shadowBlur = 0;
  // 毛线的纹路
  ctx.strokeStyle = `${light}cc`;
  ctx.lineWidth = Math.max(1, r * 0.1);
  for (const k of [-0.45, 0, 0.45]) {
    ctx.beginPath();
    ctx.ellipse(x + k * r * 0.4, y, r * 0.95, r * 0.36, 0.9 + k, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
  }
  if (dim) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#10142c80'; ctx.fill(); }
  ctx.restore();
}
function spool(ctx, x, y, color, n, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  // 木头两端
  roundRect(ctx, x - 40, y - 40, 80, 12, 5); ctx.fillStyle = '#c98b52'; ctx.fill();
  roundRect(ctx, x - 40, y + 28, 80, 12, 5); ctx.fill();
  roundRect(ctx, x - 14, y - 30, 28, 60, 4); ctx.fillStyle = '#e6b07a'; ctx.fill();
  // 还没绕的线轴：在轴心上画一圈淡淡的目标色，一眼看出要什么颜色
  roundRect(ctx, x - 18, y - 22, 36, 44, 8); ctx.fillStyle = `${CANDY[color][0]}66`; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = CANDY[color][0]; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
  // 绕上去的毛线：越满越粗
  if (n > 0) {
    const [base, light, dark] = CANDY[color];
    const half = 14 + n * 7;
    roundRect(ctx, x - half, y - 28, half * 2, 56, 10);
    const g = ctx.createLinearGradient(x - half, 0, x + half, 0);
    g.addColorStop(0, dark); g.addColorStop(0.45, light); g.addColorStop(1, base);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 1.2;
    for (let k = -24; k <= 24; k += 6) { ctx.beginPath(); ctx.moveTo(x - half + 2, y + k); ctx.lineTo(x + half - 2, y + k + 3); ctx.stroke(); }
  }
  // 还差几个：三颗小点
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath(); ctx.arc(x - 14 + i * 14, y + 52, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = i < n ? CANDY[color][0] : '#ffffff30'; ctx.fill();
  }
  ctx.restore();
}

export function mountYarn(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '毛线三消游戏画布', game: 'yarn' });
  let state = null;
  let vis = null;
  let lay = { cell: 36, x: 18 };
  let queue = [];
  let playing = false;
  let flights = [];
  let departs = [];
  let hint = null;
  let progress = SAVE.get({ level: 1, best: 0 });

  const hud = () => onHud(`第 ${state.level} 关 · ${state.name} · 还剩 ${left(state)} 个`);
  function begin(level, seed) {
    shell.closeCard();
    state = createLevel(level, seed);
    vis = { spools: state.spools.map((s) => s && { color: s.color, n: 0, t0: 0 }), rod: [], taken: state.taken.slice() };
    const cell = Math.min(38, Math.floor((W - 24) / state.cols), Math.floor((ADD_BTN.y - 16 - PIC_Y) / state.rows));
    lay = { cell, x: Math.round((W - cell * state.cols) / 2) };
    queue = []; playing = false; flights = []; departs = []; hint = null;
    hud();
    shell.poke(100);
  }
  const cellXY = (i) => [lay.x + ((i % state.cols) + 0.5) * lay.cell, PIC_Y + (Math.floor(i / state.cols) + 0.5) * lay.cell];
  const pegXY = (index) => { const n = state.rodSize, step = Math.min(44, (W - 40) / n); return [W / 2 + (index - (n - 1) / 2) * step, ROD_Y + 14]; };

  // 排队的事件多了就加快回放，连点也不会越拖越久；减少动态效果时一律快放。
  const pace = (ms) => Math.round(ms * (calm() ? 0.25 : queue.length > 6 ? 0.35 : queue.length > 2 ? 0.6 : 1));
  const fly = (color, from, to, wait) => new Promise((resolve) => {
    const ms = pace(wait);
    const flight = { color, from, to, t0: performance.now(), ms };
    flights.push(flight);
    shell.poke(ms + 30);
    setTimeout(() => { flights = flights.filter((f) => f !== flight); resolve(); }, ms);
  });
  async function pump() {
    if (playing) return;
    playing = true;
    const mine = state;
    while (queue.length && state === mine && shell.alive) {
      const ev = queue.shift();
      if (ev.type === 'to-spool') {
        vis.taken[ev.cell] = true;
        await fly(ev.color, cellXY(ev.cell), [SPOOL_X[ev.slot], SPOOL_Y], 260);
        if (vis.spools[ev.slot]) vis.spools[ev.slot].n += 1;
      } else if (ev.type === 'to-rod') {
        vis.taken[ev.cell] = true;
        await fly(ev.color, cellXY(ev.cell), pegXY(vis.rod.length), 240);
        vis.rod.push(ev.color);
      } else if (ev.type === 'rod-to-spool') {
        const from = pegXY(ev.from);
        vis.rod.splice(ev.from, 1);
        await fly(ev.color, from, [SPOOL_X[ev.slot], SPOOL_Y], 220);
        if (vis.spools[ev.slot]) vis.spools[ev.slot].n += 1;
      } else if (ev.type === 'spool-done') {
        const s = vis.spools[ev.slot];
        vis.spools[ev.slot] = null;
        if (s) departs.push({ slot: ev.slot, color: s.color, t0: performance.now() });
        shell.poke(450);
        await shell.tween(pace(240));
      } else if (ev.type === 'spool-new') {
        vis.spools[ev.slot] = { color: ev.color, n: 0, t0: performance.now() };
        shell.poke(260);
        await shell.tween(pace(160));
      }
    }
    playing = false;
    if (state !== mine || !shell.alive) return;
    const end = outcome(state);
    if (end !== 'playing' && !shell.cardOpen) setTimeout(() => { if (shell.alive && state === mine && outcome(state) === end && !shell.cardOpen) finish(end); }, 300);
  }
  function take(i) {
    if (shell.cardOpen || outcome(state) !== 'playing') return false;
    const events = takeBall(state, i);
    if (!events) {
      if (state.balls[i] >= 0 && !state.taken[i] && !isExposed(state, i)) shell.toast('从外圈往里拆，这个还拿不到', 1000, 176);
      else if (state.rod.length >= state.rodSize) shell.toast('暂存杆挂满了', 900, 176);
      return false;
    }
    hint = null;
    queue.push(...events);
    hud();
    pump();
    return true;
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    if (shell.cardOpen) return;
    const p = shell.point(event);
    if (inRect(p, ADD_BTN)) return api.addPeg();
    const c = Math.floor((p.x - lay.x) / lay.cell), r = Math.floor((p.y - PIC_Y) / lay.cell);
    if (r >= 0 && c >= 0 && r < state.rows && c < state.cols) take(r * state.cols + c);
  });

  function finish(end) {
    if (end === 'won') {
      const level = state.level;
      progress = { level: level + 1, best: Math.max(progress.best, level) };
      SAVE.set(progress);
      const { note } = shell.card({ title: `「${state.name}」拆完了！`, lines: [`第 ${level} 关 · 拿了 ${state.moves} 个毛线球`, `最高通关 第 ${progress.best} 关`], buttons: [{ label: '下一关', action: () => begin(level + 1) }], tone: 'won' });
      postScore(onResult, 'yarn', level, note);
    } else {
      const { level, seed } = state;
      const buttons = [{ label: '重试本关', action: () => begin(level, seed) }];
      if (state.extra > 0) buttons.push({ label: '多一个挂钩继续', ghost: true, action: () => { shell.closeCard(); api.addPeg(); } });
      shell.card({ title: '暂存杆挂满了', lines: ['颜色对不上线轴的球都会挂到杆上。先拿和线轴同色的，别急着拆中间。'], buttons, tone: 'lost' });
    }
  }

  shell.render = (ctx, now) => {
    for (let k = 0; k < SPOOLS; k += 1) {
      const s = vis.spools[k];
      if (!s) continue;
      const t = Math.min(1, (now - s.t0) / 180);
      spool(ctx, SPOOL_X[k], SPOOL_Y - (1 - t) * 30, s.color, s.n, t);
    }
    departs = departs.filter((d) => now - d.t0 < 420);
    for (const d of departs) { const k = (now - d.t0) / 420; spool(ctx, SPOOL_X[d.slot], SPOOL_Y - k * 80, d.color, 3, 1 - k); }
    text(ctx, `还有 ${state.queue.length} 轴`, W - 14, 126, { size: 11, align: 'right', color: '#b9bde6', weight: 700 });
    text(ctx, `${state.name}`, 14, 126, { size: 11, align: 'left', color: '#b9bde6', weight: 700 });
    // 暂存杆
    roundRect(ctx, 16, ROD_Y - 4, W - 32, 8, 4); ctx.fillStyle = '#c98b52'; ctx.fill();
    for (let i = 0; i < state.rodSize; i += 1) {
      const [x, y] = pegXY(i);
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fillStyle = i >= 7 ? '#ffd54322' : '#00000033'; ctx.fill();
      if (vis.rod[i] !== undefined) yarnBall(ctx, x, y, 12, vis.rod[i]);
    }
    // 像素画
    roundRect(ctx, lay.x - 8, PIC_Y - 8, lay.cell * state.cols + 16, lay.cell * state.rows + 16, 16);
    ctx.fillStyle = '#fff4e620'; ctx.fill();
    const hintOn = hint && now < hint.until && Math.sin(now / 110) > -0.2;
    state.balls.forEach((color, i) => {
      if (color < 0) return;
      const [x, y] = cellXY(i);
      if (vis.taken[i]) { ctx.beginPath(); ctx.arc(x, y, lay.cell * 0.12, 0, Math.PI * 2); ctx.fillStyle = '#ffffff1c'; ctx.fill(); return; }
      yarnBall(ctx, x, y, lay.cell * 0.46, color, { dim: !isExposed(state, i) && !state.taken[i], glow: hintOn && hint.cell === i ? '#ffffff' : '' });
    });
    for (const f of flights) {
      const t = Math.min(1, (now - f.t0) / f.ms), e = 1 - (1 - t) ** 2;
      yarnBall(ctx, f.from[0] + (f.to[0] - f.from[0]) * e, f.from[1] + (f.to[1] - f.from[1]) * e - Math.sin(t * Math.PI) * 36, 13 + Math.sin(t * Math.PI) * 3, f.color);
    }
    button(ctx, ADD_BTN, '＋ 多一个挂钩', { off: state.extra <= 0, badge: state.extra });
    if (flights.length || departs.length || hintOn || vis.spools.some((s) => s && now - s.t0 < 180)) shell.poke(16);
  };

  const api = {
    get state() { return state; },
    get playing() { return playing; },
    board: 'yarn',
    restart() { begin(state.level, state.seed); },
    hint() {
      if (shell.cardOpen) return;
      const cell = findHint(state);
      if (cell === null) return;
      hint = { cell, until: performance.now() + 1800 };
      shell.poke(1850);
    },
    addPeg() {
      if (!addPeg(state)) return shell.toast('本关已经加过了', 1000, 176);
      shell.poke();
    },
    take,
    goto(level, seed) { begin(level, seed); },
    locate(i) { const [x, y] = cellXY(i); return shell.page(x, y); },
    destroy() { shell.destroy(); }
  };
  begin(progress.level || 1);
  return api;
}
