// 俄罗斯方块: the view. One 2D canvas: the score plaques on top, the well in the middle with hold on its left and the
// next pieces on its right, and a row of big buttons underneath for thumbs. tetris-core.js decides what every move
// does; this module draws glossy candy blocks, runs the key / button repeat (hold a direction and the piece keeps
// sliding), and plays the events back as flashes and call-outs. Each difficulty keeps its own unfinished game, so
// switching level never throws progress away.
import { fitView } from './fit-view.js';
import {
  cellsOf, COLS, createState, DIFFS, DIFF_IDS, ghostY, hardDrop, hold as swapHold, HIDDEN, move, previews, restoreState,
  rotate, ROWS, SHAPES, snapshot, tick
} from './tetris-core.js';

const LW = 360;
const LH = 600;
const STORE = { best: 'pao-tetris-best', save: 'pao-tetris-save' };
const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const calm = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// base, light, dark per piece: the same rainbow the 数独 chips use.
const PAL = {
  I: ['#2fcfd6', '#8ceef2', '#17878d'], O: ['#ffcf3d', '#ffe58a', '#b88c0a'], T: ['#9b6bff', '#c6aaff', '#6038c4'],
  S: ['#38c26b', '#86e3a8', '#1d8444'], Z: ['#f04b4b', '#ff8d8d', '#a82626'], J: ['#3d8bff', '#8dbbff', '#1f55b3'],
  L: ['#ff8f2e', '#ffbb7a', '#b3560a']
};
const CELL = 22;
const WELL = { x: 70, y: 58, w: COLS * CELL, h: (ROWS - HIDDEN) * CELL };
const HOLD_BOX = { x: 6, y: 58, w: 58, h: 64 };
const PAUSE_BTN = { x: 6, y: 196, w: 58, h: 36 };
const NEXT_X = 296;
const BTNS = [
  { id: 'left', icon: '◀' }, { id: 'right', icon: '▶' }, { id: 'ccw', icon: '⟲' },
  { id: 'cw', icon: '⟳' }, { id: 'down', icon: '▼' }, { id: 'hard', icon: '⤓' }
];
const BTN = { y: 510, w: 52, h: 54, gap: 8, x0: 4 };
const btnX = (k) => BTN.x0 + k * (BTN.w + BTN.gap);
const DAS = 150; // ms before a held direction starts to repeat
const ARR = 40; // ms between repeats
const CALLS = ['', '单消', '双消', '三消', '四消 TETRIS!'];

const cellXY = (col, row) => ({ x: WELL.x + col * CELL, y: WELL.y + (row - HIDDEN) * CELL });

// One glossy block with its top-left corner at (x, y): a lip underneath, a body that darkens toward the bottom, a lit edge and a streak.
function drawBlock(ctx, x, y, s, type, alpha = 1) {
  const [base, light, dark] = PAL[type];
  const r = Math.min(5, s * 0.26); // small blocks in the side boxes must not turn into dots
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(ctx, x + 0.5, y + 1.5, s - 1, s - 1, r);
  ctx.fillStyle = dark;
  ctx.fill();
  roundRect(ctx, x + 0.5, y + 0.5, s - 1, s - 2.5, r);
  const g = ctx.createLinearGradient(0, y, 0, y + s);
  g.addColorStop(0, light);
  g.addColorStop(0.22, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#ffffff59';
  ctx.stroke();
  roundRect(ctx, x + s * 0.16, y + s * 0.12, s * 0.68, s * 0.14, s * 0.07);
  ctx.fillStyle = '#ffffff44';
  ctx.fill();
  ctx.restore();
}

export function mountTetris(wrap, { diff = 'normal', onHud = () => {}, onResult = null } = {}) {
  let alive = true;
  let level = DIFFS[diff] ? diff : 'normal';
  let core = null;
  let raf = 0;
  let last = 0;
  let paused = false;
  let reported = false;
  let overAt = 0;
  let toast = null;
  let lastHud = '';
  let dirty = true; // redraw on the next frame even if nothing in `view` moved (resize, full screen, a test advancing time)
  let drawn = '';
  let flash = null; // { cells, t0 } the piece that just locked
  const sweeps = []; // { rows, t0 } cleared rows fading out
  const floaters = []; // call-outs rising over the well
  const down = new Map(); // source ("k:ArrowLeft", "p:3") -> action
  const das = {}; // action -> { t0, next }
  const best = readJson(STORE.best) ?? {};
  const saves = readJson(STORE.save) ?? {};

  const canvas = el('canvas', 'game-canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = LW * dpr;
  canvas.height = LH * dpr;
  canvas.setAttribute('aria-label', '俄罗斯方块游戏画布');
  const overlay = el('div', 'tetris-overlay');
  overlay.hidden = true;
  wrap.replaceChildren(canvas, overlay);
  let ctx = canvas.getContext('2d');
  // 全屏：上面的分数、下面的按键是信息栏，暂存 / 井 / 下一个这一排是游戏区（fit-view.js）
  const fit = fitView(canvas, { width: LW, height: LH, onChange: () => poke(), regions: () => [
    { x: 0, y: 0, w: LW, h: 50, role: 'top' },
    { x: 2, y: WELL.y - 4, w: LW - 4, h: WELL.h + 8, role: 'main' },
    { x: 0, y: BTN.y - 6, w: LW, h: LH - BTN.y + 6, role: 'bottom' }
  ] });

  const poke = () => { dirty = true; if (!raf && alive) { last = 0; raf = requestAnimationFrame(frame); } };
  const say = (text) => { toast = { text, until: performance.now() + 1500 }; poke(); };
  const hud = () => {
    const text = `${core.score} 分 · 第 ${core.level} 级`;
    if (text !== lastHud) { lastHud = text; onHud(text); }
  };
  const persist = () => {
    if (!core) return;
    saves[level] = core.over || (core.score === 0 && core.lines === 0 && core.pieces <= 1) ? null : snapshot(core);
    writeJson(STORE.save, saves);
  };
  const bump = () => {
    if (core.score > (Number(best[level]) || 0)) { best[level] = core.score; writeJson(STORE.best, best); }
  };

  function begin(state) {
    core = state;
    reported = false;
    overAt = 0;
    toast = null;
    flash = null;
    sweeps.length = 0;
    floaters.length = 0;
    down.clear();
    for (const key of Object.keys(das)) delete das[key];
    overlay.hidden = true;
    paused = false;
    lastHud = '';
    hud();
    poke();
  }
  // A run that ends (or is abandoned with points on the board) is submitted once.
  function submit(note) {
    if (reported || core.score < 1) return;
    reported = true;
    onResult?.(`tetris-${level}`, core.score).then((text) => { if (text && note?.isConnected) note.textContent = text; });
  }
  function open(next, resume = true) {
    level = DIFFS[next] ? next : 'normal';
    const saved = resume ? restoreState(saves[level]) : null;
    begin(saved ?? createState(level));
    if (saved) pause('继续上次的游戏');
  }
  function restart() {
    submit(null);
    begin(createState(level));
    persist();
  }

  // ---- cards ----
  function card(title, lines, buttons, cls = '') {
    overlay.replaceChildren();
    overlay.className = `tetris-overlay ${cls}`;
    const box = el('div', 'tetris-card');
    box.append(el('strong', '', title));
    for (const line of lines) box.append(el('p', '', line));
    const note = el('p', 'tetris-note');
    box.append(note);
    for (const { label, action, ghost } of buttons) {
      const button = el('button', `tetris-again${ghost ? ' ghost' : ''}`, label);
      button.addEventListener('click', action);
      box.append(button);
    }
    overlay.append(box);
    overlay.hidden = false;
    return note;
  }
  function pause(title = '已暂停') {
    if (core.over || paused) return;
    paused = true;
    down.clear();
    persist();
    card(title, [`${core.score} 分 · 第 ${core.level} 级 · 已消 ${core.lines} 行`], [
      { label: '继续', action: resume },
      { label: '重新开始', action: restart, ghost: true }
    ]);
    poke();
  }
  function resume() {
    if (!paused) return;
    paused = false;
    overlay.hidden = true;
    poke();
  }
  function finish() {
    bump();
    persist();
    const record = core.score >= (Number(best[level]) || 0) && core.score > 0;
    const note = card('游戏结束', [
      `${DIFFS[level].name} · 消了 ${core.lines} 行 · 到第 ${core.level} 级`,
      `本局 ${core.score} 分${record ? ' · 新的本机最高！' : ` · 本机最高 ${best[level] ?? 0}`}`
    ], [{ label: '再来一局', action: restart }], core.lines >= 40 ? 'won' : '');
    submit(note);
    hud();
  }

  // ---- what happened ----
  function callout(lines, color) {
    const now = performance.now();
    lines.forEach((text, i) => floaters.push({ text, color: i === 0 ? color : '#ffe27a', t0: now + i * 90, row: i }));
  }
  function handle(events) {
    const now = performance.now();
    for (const e of events) {
      if (e.type === 'lock') {
        flash = { cells: e.cells, t0: now };
        if (e.lines) sweeps.push({ rows: e.rows, t0: now });
        if (e.lines || e.tspin) {
          const head = `${e.tspin ? (e.tspin === 'mini' ? '迷你 T-SPIN' : 'T-SPIN') + (e.lines ? ' ' : '') : ''}${CALLS[e.lines]}`;
          const extra = [`+${e.gained}`];
          if (e.b2b) extra.push('背靠背 ×1.5');
          if (e.combo >= 1) extra.push(`连击 ×${e.combo}`);
          if (e.perfect) extra.push('全清！');
          callout([head, ...extra], e.lines === 4 || e.tspin === 'full' ? '#ff8fd0' : '#fff');
        }
      } else if (e.type === 'level') {
        say(`升到第 ${e.level} 级`);
      } else if (e.type === 'over') {
        overAt = now;
      }
    }
    if (events.length) { bump(); hud(); if (events.some((e) => e.type === 'lock')) persist(); poke(); }
  }

  // ---- input ----
  const playing = () => alive && !paused && !core.over && overlay.hidden;
  const isHeld = (action) => [...down.values()].includes(action);
  function act(action) {
    if (!playing()) return false;
    let ok = false;
    if (action === 'left') ok = move(core, -1);
    else if (action === 'right') ok = move(core, 1);
    else if (action === 'cw') ok = rotate(core, 1);
    else if (action === 'ccw') ok = rotate(core, -1);
    else if (action === 'hard') { handle(hardDrop(core)); ok = true; }
    else if (action === 'hold') { const events = swapHold(core); handle(events); ok = events.length > 0; }
    poke();
    return ok;
  }
  function press(source, action) {
    if (action === 'pause') { if (paused) resume(); else pause(); return; }
    if (!playing() || down.get(source) === action) return;
    const wasHeld = isHeld(action);
    down.set(source, action);
    if (action === 'down') { poke(); return; }
    act(action);
    if ((action === 'left' || action === 'right') && !wasHeld) { const now = performance.now(); das[action] = { t0: now, next: now + DAS }; }
  }
  function release(source) {
    const action = down.get(source);
    down.delete(source);
    if (action && !isHeld(action)) delete das[action];
  }
  const toLogical = (event) => fit.point(event.clientX, event.clientY);
  const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  function onDown(event) {
    if (!alive || !overlay.hidden) return;
    event.preventDefault();
    const p = toLogical(event);
    if (inside(p, PAUSE_BTN)) return press(`p:${event.pointerId}`, 'pause');
    if (inside(p, HOLD_BOX)) return act('hold');
    // a thumb that lands in the gap between two buttons, or a little above or below one, still counts
  const k = BTNS.findIndex((_, i) => inside(p, { x: btnX(i) - BTN.gap / 2, y: BTN.y - 8, w: BTN.w + BTN.gap, h: BTN.h + 20 }));
    if (k < 0) return;
    canvas.setPointerCapture?.(event.pointerId);
    press(`p:${event.pointerId}`, BTNS[k].id);
  }
  const onUp = (event) => release(`p:${event.pointerId}`);
  const KEYS = {
    ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ArrowDown: 'down', s: 'down', S: 'down',
    ArrowUp: 'cw', w: 'cw', W: 'cw', x: 'cw', X: 'cw', z: 'ccw', Z: 'ccw', ' ': 'hard', c: 'hold', C: 'hold', Shift: 'hold',
    p: 'pause', P: 'pause', Escape: 'pause'
  };
  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    const action = KEYS[event.key];
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return; // the game repeats keys itself, the same on every machine
    press(`k:${event.key}`, action);
  }
  // Shift changes the letter a held key reports, so let go of both spellings or a direction could stay stuck down.
  const onKeyUp = (event) => { for (const k of new Set([event.key, event.key.toLowerCase(), event.key.toUpperCase()])) release(`k:${k}`); };
  const onBlur = () => down.clear();
  const onHide = () => { if (document.visibilityState === 'hidden') { pause(); persist(); } };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  window.addEventListener('pagehide', persist);
  document.addEventListener('visibilitychange', onHide);

  // ---- drawing ----
  // Most of the picture never changes and the rest changes a few times a second, so a phone that repaints all of it at
  // 60–120 fps just runs hot. The well, the panels and the buttons are painted once into layers at the current pixel
  // scale, blocks are stamped from one sprite per colour, and a frame is only drawn when something on it changed.
  let unit = 0; // device pixels per logical pixel the layers were painted at
  const layers = new Map();
  function layer(key, w, h, paint) {
    let c = layers.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = Math.ceil(w * unit);
      c.height = Math.ceil(h * unit);
      const g = c.getContext('2d');
      g.scale(unit, unit);
      paint(g);
      layers.set(key, c);
    }
    return c;
  }
  const put = (c, x, y) => ctx.drawImage(c, x, y, c.width / unit, c.height / unit);
  // A block from its sprite (1px of room around it for the lip and the edge line).
  function stamp(type, x, y, s, alpha = 1) {
    const c = layer(`b${type}${s}`, s + 2, s + 2, (g) => drawBlock(g, 1, 1, s, type));
    if (alpha !== 1) ctx.globalAlpha = alpha;
    put(c, x - 1, y - 1);
    ctx.globalAlpha = 1;
  }
  // A piece in its spawn rotation, centred on (cx, cy), for the hold and next boxes.
  function drawMini(type, cx, cy, s, alpha = 1) {
    const cells = SHAPES[type][0];
    const xs = cells.map(([x]) => x), ys = cells.map(([, y]) => y);
    const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
    for (const [x, y] of cells) stamp(type, cx - (w * s) / 2 + (x - Math.min(...xs)) * s, cy - (h * s) / 2 + (y - Math.min(...ys)) * s, s, alpha);
  }
  function panel(g, x, y, w, h, label) {
    roundRect(g, x, y, w, h, 14);
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#ffffff2e');
    grad.addColorStop(1, '#ffffff12');
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#ffffff33';
    g.stroke();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#c9cffc';
    g.font = '700 11px system-ui, sans-serif';
    g.fillText(label, x + w / 2, y + 12);
  }
  function value(x, y, w, v, accent) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = accent;
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillText(String(v), x + w / 2, y + 31);
  }
  function drawWell(g) {
    const { x, y, w, h } = WELL;
    g.save();
    g.shadowColor = '#58d4de66';
    g.shadowBlur = 20;
    roundRect(g, x - 4, y - 4, w + 8, h + 8, 14);
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, '#1a1840');
    grad.addColorStop(1, '#0d0c24');
    g.fillStyle = grad;
    g.fill();
    g.restore();
    g.lineWidth = 2;
    g.strokeStyle = '#58d4de99';
    roundRect(g, x - 4, y - 4, w + 8, h + 8, 14);
    g.stroke();
    g.strokeStyle = '#ffffff0d';
    g.lineWidth = 1;
    g.beginPath();
    for (let c = 1; c < COLS; c += 1) { g.moveTo(x + c * CELL, y); g.lineTo(x + c * CELL, y + h); }
    for (let r = 1; r < ROWS - HIDDEN; r += 1) { g.moveTo(x, y + r * CELL); g.lineTo(x + w, y + r * CELL); }
    g.stroke();
  }
  // Everything that only changes with the difficulty (the next box is as tall as its preview count).
  const nextH = () => 22 + DIFFS[level].preview * 38;
  const backdrop = () => layer(`bg${level}`, LW, LH, (g) => {
    panel(g, 12, 6, 108, 40, '分数');
    panel(g, 128, 6, 108, 40, '最高');
    panel(g, 244, 6, 104, 40, '等级');
    drawWell(g);
    panel(g, HOLD_BOX.x, HOLD_BOX.y, HOLD_BOX.w, HOLD_BOX.h, '暂存');
    panel(g, 6, 130, 58, 56, '行数');
    panel(g, NEXT_X, 58, 58, nextH(), '下一个');
    g.fillStyle = '#8f96c9';
    g.font = '600 11px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillText('← → 移动 · ↑ 旋转 · ↓ 软降 · 空格 硬降 · C 暂存', LW / 2, 586);
  });
  function drawStack() {
    for (let r = HIDDEN; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        const type = core.board[r][c];
        if (type) { const p = cellXY(c, r); stamp(type, p.x, p.y, CELL); }
      }
    }
  }
  function drawPiece() {
    const piece = core.piece;
    if (!piece) return;
    if (DIFFS[level].ghost && !core.over) {
      const gy = ghostY(core);
      ctx.fillStyle = `${PAL[piece.type][0]}2e`;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `${PAL[piece.type][0]}99`;
      for (const [c, r] of cellsOf(piece.type, piece.rot, piece.x, gy)) {
        if (r < HIDDEN) continue;
        const p = cellXY(c, r);
        roundRect(ctx, p.x + 1.5, p.y + 1.5, CELL - 3, CELL - 3, 5);
        ctx.fill();
        ctx.stroke();
      }
    }
    for (const [c, r] of cellsOf(piece.type, piece.rot, piece.x, piece.y)) {
      if (r < HIDDEN) continue;
      const p = cellXY(c, r);
      stamp(piece.type, p.x, p.y, CELL);
    }
  }
  function drawFx(now) {
    if (flash) {
      const t = (now - flash.t0) / (calm() ? 30 : 160);
      if (t >= 1) flash = null;
      else for (const [c, r] of flash.cells) {
        if (r < HIDDEN) continue;
        const p = cellXY(c, r);
        roundRect(ctx, p.x + 0.5, p.y + 0.5, CELL - 1, CELL - 1, 5);
        ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - t)})`;
        ctx.fill();
      }
    }
    for (let i = sweeps.length - 1; i >= 0; i -= 1) {
      const t = (now - sweeps[i].t0) / (calm() ? 40 : 260);
      if (t >= 1) { sweeps.splice(i, 1); continue; }
      for (const { row, cells } of sweeps[i].rows) {
        if (row < HIDDEN) continue;
        const p = cellXY(0, row);
        ctx.fillStyle = `rgba(255,255,255,${0.85 * (1 - t)})`;
        roundRect(ctx, p.x, p.y + CELL * 0.5 * t, WELL.w, CELL * (1 - t), 4);
        ctx.fill();
        cells.forEach((type, c) => { if (type) drawBlock(ctx, WELL.x + c * CELL + CELL * 0.5 * t, p.y + CELL * 0.5 * t, CELL * (1 - t), type, 1 - t); });
      }
    }
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i];
      const t = (now - f.t0) / 1300;
      if (t >= 1) { floaters.splice(i, 1); continue; }
      if (t < 0) continue;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (1 - t) * 2.5);
      ctx.font = `800 ${f.row === 0 ? 20 : 14}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      const y = WELL.y + 150 + f.row * 24 - t * 30;
      ctx.strokeStyle = '#2a1636d9';
      ctx.strokeText(f.text, WELL.x + WELL.w / 2, y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, WELL.x + WELL.w / 2, y);
      ctx.restore();
    }
  }
  // A button with 1px of room around it; `on` is the pressed-down look.
  function paintButton(g, btn, on) {
    const x = 1, y = 1;
    roundRect(g, x, y + 3, BTN.w, BTN.h, 14);
    g.fillStyle = on ? '#143f99' : '#1e55c4';
    g.fill();
    roundRect(g, x, y + (on ? 2 : 0), BTN.w, BTN.h - 3, 14);
    const grad = g.createLinearGradient(0, y, 0, y + BTN.h);
    grad.addColorStop(0, on ? '#4c88ee' : '#6aa4ff');
    grad.addColorStop(1, on ? '#2d63d6' : '#3f7bff');
    g.fillStyle = grad;
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#ffffff55';
    g.stroke();
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '800 22px system-ui, sans-serif';
    g.fillText(btn.icon, x + BTN.w / 2, y + BTN.h / 2 - 2 + (on ? 2 : 0));
  }
  function drawButton(btn, k) {
    const on = isHeld(btn.id);
    put(layer(`k${k}${on}`, BTN.w + 2, BTN.h + 5, (g) => paintButton(g, btn, on)), btnX(k) - 1, BTN.y - 1);
  }
  function drawSide() {
    const rule = DIFFS[level];
    if (core.hold) drawMini(core.hold, HOLD_BOX.x + HOLD_BOX.w / 2, HOLD_BOX.y + 42, 11, core.holdUsed ? 0.4 : 1);
    value(6, 130, 58, core.lines, '#58d4de');
    // pause
    const pb = PAUSE_BTN;
    roundRect(ctx, pb.x, pb.y, pb.w, pb.h, 12);
    ctx.fillStyle = '#ffffff1a';
    ctx.fill();
    ctx.strokeStyle = '#ffffff40';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#d5daf0';
    ctx.font = '800 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(paused ? '▶ 继续' : '‖ 暂停', pb.x + pb.w / 2, pb.y + pb.h / 2);
    previews(core, rule.preview).forEach((type, i) => drawMini(type, NEXT_X + 29, 58 + 38 + i * 38 - 6, 11));
  }
  function draw(now) {
    ctx = fit.begin();
    if (fit.unit !== unit) { unit = fit.unit; layers.clear(); }
    put(backdrop(), 0, 0);
    value(12, 6, 108, core.score, '#ffd543');
    value(128, 6, 108, Math.max(Number(best[level]) || 0, core.score), '#58d4de');
    value(244, 6, 104, core.level, '#ff8fd0');
    drawStack();
    drawPiece();
    drawFx(now);
    drawSide();
    BTNS.forEach(drawButton);
    if (toast && toast.until > now) {
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const width = ctx.measureText(toast.text).width + 28;
      roundRect(ctx, WELL.x + (WELL.w - width) / 2, WELL.y + 60, width, 28, 14);
      ctx.fillStyle = '#000c';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(toast.text, WELL.x + WELL.w / 2, WELL.y + 74);
    }
    fit.end();
  }
  // What the last drawn frame showed: the board only changes when a piece locks, and then the piece count moves on.
  const view = (now) => {
    const p = core.piece;
    return [p ? `${p.type}${p.rot},${p.x},${p.y}` : '', core.pieces, core.lines, core.score, core.hold, core.holdUsed, paused, core.over,
      BTNS.map((b) => (isHeld(b.id) ? 1 : 0)).join(''), toast && toast.until > now ? toast.text : ''].join('|');
  };
  function frame(now) {
    raf = 0;
    if (!alive) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (playing()) {
      for (const action of ['left', 'right']) {
        const d = das[action];
        if (!d || now < d.next || !isHeld(action)) continue;
        // when both directions are down, the one pressed last wins
        const other = action === 'left' ? 'right' : 'left';
        if (das[other] && das[other].t0 > d.t0 && isHeld(other)) continue;
        for (let n = 0; n < 6 && now >= d.next; n += 1) { move(core, action === 'left' ? -1 : 1); d.next += ARR; }
      }
      core.soft = isHeld('down');
      const events = tick(core, dt);
      if (events.length) handle(events);
    }
    if (core.over && overlay.hidden && overAt && now - overAt > 600) finish();

    const shown = view(now);
    if (dirty || shown !== drawn || flash || sweeps.length || floaters.length) { dirty = false; drawn = shown; draw(now); }
    const busy = playing() || flash || sweeps.length || floaters.length || (toast && toast.until > now) || (core.over && overlay.hidden);
    if (busy && alive) raf = requestAnimationFrame(frame);
  }

  open(level);
  const saveTimer = setInterval(() => { if (alive && !core.over && playing()) persist(); }, 3000);
  return {
    get state() { return core; },
    get level() { return level; },
    get paused() { return paused; },
    restart,
    act,
    pause: () => pause(),
    resume,
    setLevel(next) { if (DIFF_IDS.includes(next) && next !== level) { persist(); open(next); } },
    // Run the game ahead by `seconds` without waiting for frames (tests).
    advance(seconds) {
      for (let t = 0; t < seconds - 1e-9; t += 0.05) handle(tick(core, Math.min(0.05, seconds - t)));
      poke();
    },
    // A hand-built game for tests: a snapshot from tetris-core.js.
    load(saved) {
      const state = restoreState(saved);
      if (state) { level = state.diff; begin(state); }
      return Boolean(state);
    },
    destroy() {
      persist();
      alive = false;
      fit.destroy();
      clearInterval(saveTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onHide);
      wrap.replaceChildren();
    }
  };
}
