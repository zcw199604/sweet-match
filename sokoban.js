// 推箱子（ARCADE 31）的画面：糖果砖墙、木箱、粉色目标点和一个圆滚滚的小人。
// 方向键 / WASD、在画布上滑动、点下面的方向按钮都能走一步；点地板上的格子会自己走过去，点紧挨着的箱子就推它。
import { DIRS, createGame, isSolved, move, undo, walkPath } from './sokoban-core.js';
import { LEVELS } from './sokoban-levels.js';
import { CANDY, button, candy, canvasGame, inRect, orb, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 600;
const TOP = 52;
const AREA_H = 420;
const PAD = [
  { d: 3, label: '◀', rect: { x: 24, y: 500, w: 70, h: 56 } },
  { d: 0, label: '▲', rect: { x: 106, y: 500, w: 70, h: 56 } },
  { d: 2, label: '▼', rect: { x: 188, y: 500, w: 70, h: 56 } },
  { d: 1, label: '▶', rect: { x: 270, y: 500, w: 70, h: 56 } }
];
const KEYS = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
const SAVE = store('pao-sokoban');

export function mountSokoban(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '推箱子游戏画布', game: 'sokoban' });
  let progress = SAVE.get({ level: 0, best: 0 });
  let game = null;
  let lay = { cell: 40, x: 0, y: TOP };
  let face = 2;
  let walk = [];
  let walkTimer = 0;
  let anim = null; // { from, to, box: { from, to }, t0 }
  let swipe = null;

  const hud = () => onHud(`第 ${game.index + 1} 关 · 走 ${game.moves} · 推 ${game.pushes}`);
  function begin(index) {
    clearTimeout(walkTimer);
    walk = [];
    anim = null;
    shell.closeCard();
    game = createGame(LEVELS[index].map, index);
    const cell = Math.min(46, Math.floor((W - 24) / game.cols), Math.floor(AREA_H / game.rows));
    lay = { cell, x: Math.round((W - cell * game.cols) / 2), y: TOP + Math.round((AREA_H - cell * game.rows) / 2) };
    face = 2;
    hud();
    shell.poke();
  }
  const xy = (i) => [lay.x + (i % game.cols) * lay.cell, lay.y + Math.floor(i / game.cols) * lay.cell];

  function go(d) {
    if (shell.cardOpen || isSolved(game)) return false;
    const from = game.player;
    face = d;
    const result = move(game, d);
    if (!result) { shell.poke(); return false; }
    anim = { from, to: game.player, box: result.pushed ? { from: game.player, to: result.box } : null, t0: performance.now() };
    hud();
    shell.poke(140);
    if (isSolved(game)) { walk = []; setTimeout(() => { if (shell.alive && isSolved(game) && !shell.cardOpen) win(); }, 380); }
    return true;
  }
  function stepWalk() {
    if (!walk.length || !shell.alive) return;
    if (go(walk.shift())) walkTimer = setTimeout(stepWalk, 85);
    else walk = [];
  }
  function tapCell(i) {
    const pr = Math.floor(game.player / game.cols), pc = game.player % game.cols;
    const r = Math.floor(i / game.cols), c = i % game.cols;
    if (game.boxes.has(i) && Math.abs(pr - r) + Math.abs(pc - c) === 1) {
      walk = [];
      return go(DIRS.findIndex(([dr, dc]) => dr === r - pr && dc === c - pc));
    }
    const path = walkPath(game, i);
    if (!path?.length) return false;
    clearTimeout(walkTimer);
    walk = path;
    stepWalk();
    return true;
  }
  function back() {
    if (shell.cardOpen) return;
    clearTimeout(walkTimer);
    walk = [];
    anim = null;
    if (undo(game)) { hud(); shell.poke(); }
  }

  shell.on('pointerdown', (event) => {
    event.preventDefault();
    const p = shell.point(event);
    for (const b of PAD) if (inRect(p, b.rect)) { walk = []; return go(b.d); }
    swipe = { x: p.x, y: p.y, t: performance.now() };
    try { shell.canvas.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
  });
  shell.on('pointerup', (event) => {
    if (!swipe) return;
    const p = shell.point(event), dx = p.x - swipe.x, dy = p.y - swipe.y;
    const start = swipe;
    swipe = null;
    if (Math.hypot(dx, dy) > 22) { walk = []; return go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0)); }
    const c = Math.floor((start.x - lay.x) / lay.cell), r = Math.floor((start.y - lay.y) / lay.cell);
    if (r >= 0 && c >= 0 && r < game.rows && c < game.cols) tapCell(r * game.cols + c);
  });
  const onKey = (event) => {
    if (document.body.dataset.mode !== 'sokoban' || event.target?.closest?.('input, textarea, select')) return;
    if (event.code in KEYS) { event.preventDefault(); walk = []; go(KEYS[event.code]); }
    else if (event.code === 'KeyZ' || event.code === 'Backspace') { event.preventDefault(); back(); }
  };
  shell.on('keydown', onKey, document);

  function win() {
    const index = game.index, par = LEVELS[index].par;
    const star = game.pushes <= par ? 3 : game.pushes <= Math.ceil(par * 1.5) ? 2 : 1;
    const next = (index + 1) % LEVELS.length;
    progress = { level: next, best: Math.max(progress.best, index + 1) };
    SAVE.set(progress);
    const last = index + 1 === LEVELS.length;
    const { note } = shell.card({
      title: last ? '50 关全部通关！' : `第 ${index + 1} 关完成`,
      lines: [`${'★'.repeat(star)}${'☆'.repeat(3 - star)}　推了 ${game.pushes} 次（最少 ${par} 次）· 走了 ${game.moves} 步`],
      buttons: [{ label: last ? '从第 1 关再来' : '下一关', action: () => begin(next) }, { label: '再玩一次', ghost: true, action: () => begin(index) }],
      tone: 'won'
    });
    postScore(onResult, 'sokoban', index + 1, note);
  }

  // ---- drawing ----
  function drawCrate(ctx, x, y, s, on) {
    const tone = on ? CANDY[2] : CANDY[5];
    candy(ctx, x + s * 0.08, y + s * 0.06, s * 0.84, s * 0.84, s * 0.14, tone);
    ctx.strokeStyle = on ? '#ffffffaa' : '#7a3a08aa';
    ctx.lineWidth = Math.max(1.5, s * 0.06);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.22, y + s * 0.2); ctx.lineTo(x + s * 0.78, y + s * 0.76);
    ctx.moveTo(x + s * 0.78, y + s * 0.2); ctx.lineTo(x + s * 0.22, y + s * 0.76);
    ctx.stroke();
    if (on) text(ctx, '✓', x + s / 2, y + s * 0.47, { size: s * 0.42 });
  }
  function drawPlayer(ctx, x, y, s) {
    const cx = x + s / 2, cy = y + s / 2;
    orb(ctx, cx, cy, s * 0.36, CANDY[1]);
    const [dr, dc] = DIRS[face];
    ctx.fillStyle = '#fff';
    for (const side of [-1, 1]) {
      const ex = cx + dc * s * 0.12 + (dr ? side * s * 0.11 : 0), ey = cy + dr * s * 0.12 + (dc ? side * s * 0.11 : 0) - s * 0.04;
      ctx.beginPath(); ctx.arc(ex, ey, s * 0.075, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d2033';
      ctx.beginPath(); ctx.arc(ex + dc * s * 0.025, ey + dr * s * 0.025, s * 0.038, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
    }
  }
  shell.render = (ctx, now) => {
    const s = lay.cell;
    text(ctx, `第 ${game.index + 1} 关`, 16, 22, { size: 18, align: 'left' });
    text(ctx, `最少推 ${LEVELS[game.index].par} 次`, W - 16, 22, { size: 12, align: 'right', color: '#c9cdf0', weight: 700 });
    for (const i of game.floor) {
      const [x, y] = xy(i);
      ctx.fillStyle = (Math.floor(i / game.cols) + i) % 2 ? '#f2e6ff' : '#e9dcfb';
      ctx.fillRect(x, y, s, s);
      if (game.goals.has(i)) {
        ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.22, 0, Math.PI * 2); ctx.fillStyle = '#ff5d8055'; ctx.fill();
        ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.12, 0, Math.PI * 2); ctx.fillStyle = '#ff5d80'; ctx.fill();
      }
    }
    for (const i of game.walls) {
      const [x, y] = xy(i);
      roundRect(ctx, x + 1, y + 1, s - 2, s - 2, s * 0.18);
      ctx.fillStyle = '#5b4a9e';
      ctx.fill();
      roundRect(ctx, x + 3, y + 2, s - 6, s * 0.3, s * 0.12);
      ctx.fillStyle = '#7f6cc9';
      ctx.fill();
    }
    const t = anim ? Math.min(1, (now - anim.t0) / 110) : 1;
    for (const b of game.boxes) {
      if (anim?.box && b === anim.box.to && t < 1) continue;
      const [x, y] = xy(b);
      drawCrate(ctx, x, y, s, game.goals.has(b));
    }
    if (anim?.box && t < 1) {
      const [ax, ay] = xy(anim.box.from), [bx, by] = xy(anim.box.to);
      drawCrate(ctx, ax + (bx - ax) * t, ay + (by - ay) * t, s, false);
    }
    const [px, py] = anim && t < 1 ? (() => { const [ax, ay] = xy(anim.from), [bx, by] = xy(anim.to); return [ax + (bx - ax) * t, ay + (by - ay) * t]; })() : xy(game.player);
    drawPlayer(ctx, px, py, s);
    for (const b of PAD) button(ctx, b.rect, b.label, { color: '#ffffff1f' });
    text(ctx, '滑动、点格子或按方向键走', W / 2, 482, { size: 11, color: '#aeb5d8', weight: 600 });
    if (t < 1) shell.poke(16);
  };

  begin(Math.min(progress.level || 0, LEVELS.length - 1));
  return {
    get state() { return game; },
    board: 'sokoban',
    restart() { begin(game.index); },
    undo: back,
    go,
    tapCell,
    goto(index) { begin(index); },
    locate(i) { const [x, y] = xy(i); return shell.page(x + lay.cell / 2, y + lay.cell / 2); },
    destroy() { clearTimeout(walkTimer); shell.destroy(); }
  };
}
