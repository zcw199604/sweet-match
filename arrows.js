// 箭头消除（ARCADE 23）的画面：点阵、彩色箭头线段，贪吃蛇式的滑出和撞车回弹。
// 规则都在 arrows-core.js；核心状态总是最新的，正在滑走的线段只在动画里画。
import { DIRS, LIVES, blocker, createLevel, findHint, headDir, occupancy, outcome, ray, remaining, stars, tapArrow } from './arrows-core.js';
import { CANDY, canvasGame, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const BOARD = { x: 12, y: 84, w: W - 24, h: H - 84 - 28 };
const SAVE = store('pao-arrows');

export function mountArrows(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '箭头消除游戏画布', game: 'arrows' });
  let state = null;
  let lay = { cell: 40, x: 0, y: 0 };
  const moving = new Map(); // id → { kind, t0, ms, steps, track }
  const flash = new Map();  // id → { kind, until }
  let shakeUntil = 0;
  let best = SAVE.get({ level: 1, best: 0 });

  const hud = () => onHud(`第 ${state.level} 关 · 剩 ${remaining(state)} 条 · 机会 ${state.lives}`);
  function begin(level, seed) {
    shell.closeCard();
    moving.clear();
    flash.clear();
    state = createLevel(level, seed);
    const cell = Math.min(52, Math.floor(BOARD.w / state.cols), Math.floor(BOARD.h / state.rows));
    lay = { cell, x: BOARD.x + (BOARD.w - cell * state.cols) / 2, y: BOARD.y + (BOARD.h - cell * state.rows) / 2 };
    hud();
    shell.poke();
  }

  // ---- geometry ----
  const center = ([r, c]) => [lay.x + (c + 0.5) * lay.cell, lay.y + (r + 0.5) * lay.cell];
  // 线段身子 + 头前方一路延伸到画面外的格子：滑动就是在这条轨道上往前挪。
  function track(arrow, extra) {
    const [dr, dc] = DIRS[headDir(arrow)];
    const out = arrow.cells.map((cell) => [...cell]);
    let [r, c] = arrow.cells.at(-1);
    for (let i = 0; i < extra; i += 1) { r += dr; c += dc; out.push([r, c]); }
    return out;
  }
  function pointAt(cells, p) {
    const i = Math.max(0, Math.min(cells.length - 1, Math.floor(p)));
    const j = Math.min(cells.length - 1, i + 1);
    const t = Math.max(0, Math.min(1, p - i));
    const [ax, ay] = center(cells[i]), [bx, by] = center(cells[j]);
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  }
  function drawArrow(ctx, arrow, offset, cells, { color = arrow.color, glow = '', alpha = 1 } = {}) {
    const len = arrow.cells.length;
    const pts = [pointAt(cells, offset)];
    for (let i = Math.floor(offset) + 1; i < offset + len - 1; i += 1) pts.push(center(cells[i]));
    pts.push(pointAt(cells, offset + len - 1));
    const [base, light, dark] = CANDY[color];
    const width = lay.cell * 0.3;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 16; }
    for (const [stroke, w, dy] of [[dark, width + 3, 1.5], [base, width, 0], [light, width * 0.32, -width * 0.18]]) {
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y + dy) : ctx.moveTo(x, y + dy)));
      ctx.strokeStyle = stroke;
      ctx.lineWidth = w;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // 箭头：头永远朝 headDir
    const [hx, hy] = pts.at(-1);
    const angle = Math.atan2(DIRS[headDir(arrow)][0], DIRS[headDir(arrow)][1]);
    const s = lay.cell * 0.36;
    ctx.translate(hx, hy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(s * 0.95, 0);
    ctx.lineTo(-s * 0.35, -s * 0.72);
    ctx.lineTo(-s * 0.1, 0);
    ctx.lineTo(-s * 0.35, s * 0.72);
    ctx.closePath();
    ctx.fillStyle = base;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = dark;
    ctx.stroke();
    ctx.restore();
  }

  // ---- input ----
  function tap(id) {
    if (shell.cardOpen || outcome(state) !== 'playing') return;
    const arrow = state.arrows[id];
    const result = tapArrow(state, id);
    const now = performance.now();
    if (result.ok) {
      const steps = result.steps + arrow.cells.length + 1;
      moving.set(id, { kind: 'exit', t0: now, ms: Math.min(900, 160 + steps * 45), steps, cells: track(arrow, steps + 1) });
    } else if (result.reason === 'blocked') {
      moving.set(id, { kind: 'bump', t0: now, ms: 260 + result.steps * 50, steps: result.steps + 0.32, cells: track(arrow, result.steps + 2) });
      flash.set(id, { kind: 'bad', until: now + 600 + result.steps * 50 });
      flash.set(result.by, { kind: 'bad', until: now + 700 + result.steps * 50 });
      shakeUntil = now + 260;
      if (navigator.vibrate) try { navigator.vibrate(40); } catch { /* not allowed */ }
    }
    hud();
    shell.poke(1000);
    const end = outcome(state);
    if (end !== 'playing') setTimeout(() => { if (shell.alive && outcome(state) === end) finish(end); }, end === 'won' ? 700 : 650);
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    const p = shell.point(event);
    const c = Math.floor((p.x - lay.x) / lay.cell), r = Math.floor((p.y - lay.y) / lay.cell);
    if (r < 0 || c < 0 || r >= state.rows || c >= state.cols) return;
    const grid = occupancy(state);
    let id = grid.get(r * 64 + c);
    // 点在空点上时，取离手指最近的一条（细线不好点中）
    if (id === undefined) {
      for (const [dr, dc] of DIRS) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= state.rows || nc >= state.cols) continue;
        const near = grid.get(nr * 64 + nc);
        if (near !== undefined) { id = near; break; }
      }
    }
    if (id !== undefined) tap(id);
  });

  function finish(end) {
    if (end === 'won') {
      const level = state.level, star = stars(state);
      best = { level: level + 1, best: Math.max(best.best, level) };
      SAVE.set(best);
      const { note } = shell.card({ title: `第 ${level} 关完成`, lines: [`${'★'.repeat(star)}${'☆'.repeat(3 - star)}　失误 ${state.mistakes} 次`, `最高通关 第 ${best.best} 关`], buttons: [{ label: '下一关', action: () => begin(level + 1) }], tone: 'won' });
      postScore(onResult, 'arrows', level, note);
    } else {
      const { level, seed } = state;
      shell.card({ title: '机会用完了', lines: ['撞车三次就失败。先找头前面一路通到边上的箭头。', '这一关的布局不变，再试一次。'], buttons: [{ label: '重试本关', action: () => begin(level, seed) }], tone: 'lost' });
    }
  }

  // ---- drawing ----
  shell.render = (ctx, now) => {
    let sx = 0;
    if (now < shakeUntil) sx = Math.sin(now / 18) * 3;
    ctx.save();
    ctx.translate(sx, 0);
    // 顶部：关卡、机会
    text(ctx, `第 ${state.level} 关`, 18, 30, { size: 20, align: 'left' });
    text(ctx, `还剩 ${remaining(state)} 条`, 18, 56, { size: 12, align: 'left', color: '#b9bde6', weight: 700 });
    for (let i = 0; i < LIVES; i += 1) text(ctx, i < state.lives ? '♥' : '♡', W - 24 - i * 24, 34, { size: 22, color: i < state.lives ? '#ff5d80' : '#ffffff55' });
    // 点阵
    const w = lay.cell * state.cols, h = lay.cell * state.rows;
    roundRect(ctx, lay.x - 8, lay.y - 8, w + 16, h + 16, 16);
    ctx.fillStyle = '#ffffff0d';
    ctx.fill();
    ctx.fillStyle = '#ffffff40';
    for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) {
      const [x, y] = center([r, c]);
      ctx.beginPath(); ctx.arc(x, y, Math.max(1.5, lay.cell * 0.05), 0, Math.PI * 2); ctx.fill();
    }
    // 静止的线段
    for (const arrow of state.arrows) {
      if (moving.has(arrow.id) || arrow.gone) continue;
      const mark = flash.get(arrow.id);
      let opts = {};
      if (mark && mark.until > now) opts = mark.kind === 'bad' ? { color: 0, glow: '#ff3b3b' } : { glow: Math.sin(now / 120) > 0 ? '#ffffff' : '#ffd543' };
      drawArrow(ctx, arrow, 0, arrow.cells, opts);
    }
    // 正在动的线段
    for (const [id, move] of moving) {
      const arrow = state.arrows[id];
      const t = Math.min(1, (now - move.t0) / move.ms);
      if (t >= 1) { moving.delete(id); continue; }
      let offset;
      if (move.kind === 'exit') offset = t * t * move.steps;
      else offset = (t < 0.55 ? t / 0.55 : 1 - (t - 0.55) / 0.45) * move.steps;
      const bad = move.kind === 'bump' && t > 0.4;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 70, W, H - 70);
      ctx.clip();
      drawArrow(ctx, arrow, offset, move.cells, bad ? { color: 0, glow: '#ff3b3b' } : {});
      ctx.restore();
    }
    ctx.restore();
    if (moving.size || [...flash.values()].some((m) => m.until > now)) shell.poke(16);
  };

  function hint() {
    if (shell.cardOpen || outcome(state) !== 'playing') return;
    const id = findHint(state);
    if (id === null) return;
    flash.set(id, { kind: 'hint', until: performance.now() + 1800 });
    shell.poke(1850);
  }

  begin(best.level || 1);
  // 全屏：上面的关卡 / 机会是信息栏，点阵连同线段是游戏区（留出半格让飞出去的线段多露一点）
  shell.regions = () => [
    { x: 0, y: 0, w: W, h: 70, role: 'top' },
    { x: lay.x - 20, y: lay.y - 20, w: lay.cell * state.cols + 40, h: lay.cell * state.rows + 40, role: 'main' }
  ];

  return {
    get state() { return state; },
    board: 'arrows',
    restart() { begin(state.level); },
    hint,
    // 测试用：直接跳到某一关；点某条线段在页面上的位置。
    goto(level, seed) { begin(level, seed); },
    tap,
    locate(id) { const [x, y] = center(state.arrows[id].cells[0]); return shell.page(x, y); },
    free() { const grid = occupancy(state); return state.arrows.filter((a) => !a.gone && !blocker(state, a, grid)).map((a) => a.id); },
    ray: (id) => ray(state, state.arrows[id]),
    destroy() { shell.destroy(); }
  };
}
