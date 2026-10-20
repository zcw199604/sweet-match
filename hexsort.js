// 六角排序（ARCADE 27）的画面：蜂窝棋盘上一叠叠彩色六角片，下面托盘里三叠待放。
// 规则在 hexsort-core.js；放下后核心一次算完所有挪动和消除，画面按事件一片片飞过去回放。
import { CLEAR, cellsOf, createLevel, emptyCells, outcome, place, topRun } from './hexsort-core.js';
import { CANDY, canvasGame, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const SQ3 = Math.sqrt(3);
const TH = 4.2; // 每一片的厚度
const TRAY_Y = 586;
const TRAY_X = [72, 180, 288];
const SAVE = store('pao-hexsort');

function hexPath(ctx, x, y, s) {
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = Math.PI / 6 + (i * Math.PI) / 3;
    const px = x + s * Math.cos(a), py = y + s * Math.sin(a) * 0.82;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function drawPiece(ctx, x, y, s, color, alpha = 1) {
  const [base, light, dark] = CANDY[color];
  ctx.save();
  ctx.globalAlpha = alpha;
  hexPath(ctx, x, y + TH * 0.8, s);
  ctx.fillStyle = dark;
  ctx.fill();
  hexPath(ctx, x, y, s);
  const g = ctx.createLinearGradient(0, y - s, 0, y + s);
  g.addColorStop(0, light); g.addColorStop(0.5, base); g.addColorStop(1, base);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ffffff70';
  ctx.stroke();
  ctx.restore();
}
function drawStack(ctx, x, y, s, stack, { lift = 0, label = true } = {}) {
  stack.forEach((color, i) => drawPiece(ctx, x, y - lift - i * TH, s, color));
  if (label && stack.length) {
    const run = topRun(stack);
    text(ctx, String(run), x, y - lift - (stack.length - 1) * TH + 1, { size: s * 0.62, color: '#ffffff', shadow: '#00000066' });
  }
}

export function mountHexsort(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '六角排序游戏画布', game: 'hexsort' });
  let state = null;
  let vis = null;   // 画面上的棋盘（比核心慢一步，按事件回放）
  let lay = { s: 26, cx: W / 2, cy: 300 };
  let pick = null;
  let drag = null;
  let busy = false;
  let flying = [];
  let pops = [];
  let shownCleared = 0;
  let progress = SAVE.get({ level: 1, best: 0 });

  const hud = () => onHud(`第 ${state.level} 关 · 消除 ${Math.min(shownCleared, state.shape.target)}/${state.shape.target}`);
  function begin(level, seed) {
    shell.closeCard();
    state = createLevel(level, seed);
    vis = Object.fromEntries(Object.keys(state.board).map((k) => [k, []]));
    const s = state.shape.radius === 2 ? 34 : 28;
    lay = { s, cx: W / 2, cy: 300 };
    pick = null; drag = null; busy = false; flying = []; pops = []; shownCleared = 0;
    hud();
    shell.poke(100);
  }
  const center = (key) => {
    const [q, r] = key.split(',').map(Number);
    return [lay.cx + lay.s * SQ3 * (q + r / 2), lay.cy + lay.s * 1.5 * r * 0.82];
  };
  function cellAt(p) {
    let best = null, dist = Infinity;
    for (const key of Object.keys(state.board)) {
      const [x, y] = center(key), d = Math.hypot(p.x - x, (p.y - y) / 0.82);
      if (d < dist) { dist = d; best = key; }
    }
    return dist < lay.s * 1.05 ? best : null;
  }
  const trayAt = (p) => TRAY_X.findIndex((x) => Math.abs(p.x - x) < 48 && p.y > TRAY_Y - 80 && p.y < TRAY_Y + 34);

  // ---- 回放 ----
  async function play(events) {
    busy = true;
    const mine = state;
    for (const ev of events) {
      if (!shell.alive || state !== mine) return;
      if (ev.type === 'move') {
        for (let i = 0; i < ev.count; i += 1) {
          const [fx, fy0] = center(ev.from), [tx, ty0] = center(ev.to);
          const fy = fy0 - (vis[ev.from].length - 1) * TH, ty = ty0 - vis[ev.to].length * TH;
          vis[ev.from].pop();
          const piece = { color: ev.color, t0: performance.now(), ms: 150, fx, fy, tx, ty };
          flying.push(piece);
          shell.poke(200);
          await shell.tween(55);
          setTimeout(() => { flying = flying.filter((f) => f !== piece); if (state === mine) vis[ev.to].push(ev.color); shell.poke(30); }, 150);
        }
        await shell.tween(170);
      } else {
        const [x, y] = center(ev.cell);
        const stack = vis[ev.cell];
        const n = Math.min(ev.count, stack.length);
        for (let i = 0; i < n; i += 1) {
          pops.push({ x, y: y - (stack.length - 1) * TH, color: ev.color, t0: performance.now() + i * 25 });
          stack.pop();
        }
        pops.push({ x, y: y - 30, label: `+${ev.count}`, t0: performance.now() });
        shownCleared += ev.count;
        hud();
        shell.poke(700);
        await shell.tween(260);
      }
    }
    if (state !== mine) return;
    // 和核心对齐（防止回放里有零星偏差）
    vis = Object.fromEntries(Object.entries(state.board).map(([k, v]) => [k, [...v]]));
    shownCleared = state.cleared;
    busy = false;
    hud();
    shell.poke();
    const end = outcome(state);
    if (end !== 'playing') setTimeout(() => { if (shell.alive && state === mine && !shell.cardOpen) finish(end); }, 350);
  }
  function drop(slot, key) {
    if (busy || shell.cardOpen) return false;
    const stack = state.tray[slot];
    const events = place(state, slot, key);
    if (!events) return false;
    vis[key] = [...stack];
    pick = null;
    shell.poke();
    play(events);
    return true;
  }

  shell.on('pointerdown', (event) => {
    event.preventDefault();
    if (shell.cardOpen) return;
    const p = shell.point(event);
    const slot = trayAt(p);
    if (slot >= 0 && state.tray[slot]) {
      pick = slot;
      drag = { slot, x: p.x, y: p.y, moved: false };
      try { shell.canvas.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
      return shell.poke();
    }
    const key = cellAt(p);
    if (key && pick !== null) drop(pick, key);
  });
  shell.on('pointermove', (event) => {
    if (!drag) return;
    const p = shell.point(event);
    if (Math.hypot(p.x - drag.x, p.y - drag.y) > 8) drag.moved = true;
    drag.px = p.x; drag.py = p.y;
    shell.poke();
  });
  shell.on('pointerup', (event) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (d.moved) { const key = cellAt(shell.point(event)); if (key) drop(d.slot, key); }
    shell.poke();
  });

  function finish(end) {
    if (end === 'won') {
      const level = state.level;
      progress = { level: level + 1, best: Math.max(progress.best, level) };
      SAVE.set(progress);
      const { note } = shell.card({ title: `第 ${level} 关完成`, lines: [`消掉 ${state.cleared} 片 · 放了 ${state.placed} 叠`, `最高通关 第 ${progress.best} 关`], buttons: [{ label: '下一关', action: () => begin(level + 1) }], tone: 'won' });
      postScore(onResult, 'hexsort', level, note);
    } else {
      const { level, seed } = state;
      shell.card({ title: '棋盘放满了', lines: [`消掉 ${state.cleared}/${state.shape.target} 片。`, '把同色的叠放在一起，别让杂色把格子占满。'], buttons: [{ label: '重试本关', action: () => begin(level, seed) }], tone: 'lost' });
    }
  }

  shell.render = (ctx, now) => {
    // 进度条
    text(ctx, `第 ${state.level} 关`, 16, 24, { size: 18, align: 'left' });
    const frac = Math.min(1, shownCleared / state.shape.target);
    roundRect(ctx, 110, 16, W - 126, 16, 8);
    ctx.fillStyle = '#ffffff1a'; ctx.fill();
    roundRect(ctx, 110, 16, Math.max(16, (W - 126) * frac), 16, 8);
    ctx.fillStyle = '#ffd543'; ctx.fill();
    text(ctx, `${Math.min(shownCleared, state.shape.target)} / ${state.shape.target}`, 110 + (W - 126) / 2, 25, { size: 10, color: '#2a1f00' });
    text(ctx, `同色攒到 ${CLEAR} 片就消掉`, W / 2, 50, { size: 11, color: '#b9bde6', weight: 600 });
    // 棋盘：从上往下画，后面的叠挡住前面的
    const keys = cellsOf(state.shape.radius).map(({ q, r }) => `${q},${r}`).sort((a, b) => center(a)[1] - center(b)[1]);
    const free = new Set(emptyCells(state));
    for (const key of keys) {
      const [x, y] = center(key);
      hexPath(ctx, x, y + 3, lay.s * 0.96);
      ctx.fillStyle = state.rocks.includes(key) ? '#4a4f6e' : '#ffffff14';
      ctx.fill();
      if (state.rocks.includes(key)) { text(ctx, '⛰', x, y, { size: lay.s * 0.8 }); continue; }
      if (pick !== null && free.has(key) && !busy) { hexPath(ctx, x, y + 3, lay.s * 0.96); ctx.strokeStyle = '#ffd54388'; ctx.lineWidth = 2; ctx.stroke(); }
    }
    for (const key of keys) {
      if (!vis[key]?.length) continue;
      const [x, y] = center(key);
      drawStack(ctx, x, y, lay.s * 0.9, vis[key]);
    }
    // 飞行中的片
    for (const f of flying) {
      const t = Math.min(1, (now - f.t0) / f.ms);
      const x = f.fx + (f.tx - f.fx) * t, y = f.fy + (f.ty - f.fy) * t - Math.sin(t * Math.PI) * 26;
      drawPiece(ctx, x, y, lay.s * 0.9, f.color);
    }
    // 消除特效
    pops = pops.filter((p) => now - p.t0 < 650);
    for (const p of pops) {
      const k = Math.max(0, (now - p.t0) / 650);
      if (p.label) text(ctx, p.label, p.x, p.y - k * 30, { size: 20, color: '#ffd543', shadow: '#0008' });
      else if (now >= p.t0) drawPiece(ctx, p.x, p.y - k * 40, lay.s * 0.9 * (1 + k * 0.4), p.color, 1 - k);
    }
    // 托盘
    roundRect(ctx, 14, TRAY_Y - 92, W - 28, 126, 18);
    ctx.fillStyle = '#ffffff10'; ctx.fill();
    state.tray.forEach((stack, i) => {
      if (!stack) return;
      if (drag && drag.slot === i && drag.moved) return;
      drawStack(ctx, TRAY_X[i], TRAY_Y, 24, stack, { lift: pick === i ? 12 : 0 });
      if (pick === i) { hexPath(ctx, TRAY_X[i], TRAY_Y + 8, 28); ctx.strokeStyle = '#ffd543'; ctx.lineWidth = 2.5; ctx.stroke(); }
    });
    if (drag && drag.moved) drawStack(ctx, drag.px, drag.py + 20, lay.s * 0.9, state.tray[drag.slot] ?? []);
    if (flying.length || pops.length) shell.poke(16);
  };

  begin(progress.level || 1);
  return {
    get state() { return state; },
    get busy() { return busy; },
    board: 'hexsort',
    restart() { begin(state.level, state.seed); },
    drop,
    goto(level, seed) { begin(level, seed); },
    locate(key) { const [x, y] = center(key); return shell.page(x, y); },
    locateTray(slot) { return shell.page(TRAY_X[slot], TRAY_Y - 10); },
    destroy() { shell.destroy(); }
  };
}
