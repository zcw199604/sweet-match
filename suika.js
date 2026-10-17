// 合成大西瓜: the view. One 2D canvas: the score plaques on top, the glass box in the middle, the fruit
// in hand hovering over it. suika-core.js runs the physics and the rules; this module draws glossy
// candy fruits, lets the player aim and drop, and plays the events back as juice and floating scores.
// The core state is always up to date; an effect only changes what is shown.
import { advance, canDrop, clampX, createState, drop, isMoving, LEVELS, restoreState, snapshot, SUIKA, TOP_LEVEL, WORLD } from './suika-core.js';

const LW = 360;
const LH = 560;
const STORE = { best: 'pao-suika-best', save: 'pao-suika-save' };
const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const calm = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const clamp01 = (t) => Math.max(0, Math.min(1, t));
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// base, light, dark. Neighbouring levels never share a hue family, so a pile reads at a glance.
const PAL = [
  ['#e0204c', '#ff8aa0', '#8f0f2b'], ['#ff5a5a', '#ffb0a8', '#b72424'], ['#9b6bff', '#d0b8ff', '#5a30b8'],
  ['#ffb02e', '#ffdc8c', '#c27a08'], ['#ff6b2c', '#ffa87c', '#b83c0a'], ['#9be34a', '#d6f69c', '#5a9a14'],
  ['#f0e65a', '#faf4a8', '#a89d1c'], ['#ffa9c0', '#ffd8e4', '#d05c80'], ['#ffd23d', '#fff0a2', '#bf8f00'],
  ['#a8ec9a', '#defad4', '#5aa84a'], ['#3fbf5a', '#92e6a4', '#1a7a34']
];
const LEAF = '#4fcf62';
const STEM = '#6b4a2b';

// Everything that sits on the fruit besides the shaded body: seeds, stripes, stems, leaves. Drawn at (0, 0) for radius r.
function trim(ctx, level, r) {
  const stem = (len, lean = 0.3) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = STEM;
    ctx.lineWidth = Math.max(1.5, r * 0.09);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.92);
    ctx.quadraticCurveTo(r * lean * 0.3, -r - len * 0.5, r * lean, -r - len);
    ctx.stroke();
  };
  const leaf = (x, y, w, h, turn) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(turn);
    ctx.fillStyle = LEAF;
    ctx.beginPath();
    ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  const inside = (draw) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
    ctx.clip();
    draw();
    ctx.restore();
  };
  switch (level) {
    case 0: stem(r * 0.8, 0.45); leaf(r * 0.55, -r * 1.55, r * 0.34, r * 0.16, -0.5); break;
    case 1:
      inside(() => {
        ctx.fillStyle = '#ffe9a0';
        for (const [sx, sy] of [[-0.45, -0.1], [0.45, -0.1], [0, 0.05], [-0.28, 0.4], [0.28, 0.4], [0, 0.62], [-0.6, 0.3], [0.6, 0.3]]) {
          ctx.beginPath();
          ctx.ellipse(sx * r, sy * r, r * 0.07, r * 0.11, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      for (const a of [-0.9, -0.3, 0.3, 0.9]) leaf(Math.sin(a) * r * 0.45, -r * 0.95, r * 0.26, r * 0.11, a * 1.2);
      break;
    case 2:
      inside(() => {
        ctx.fillStyle = '#ffffff22';
        for (let row = 0; row < 4; row += 1) for (let col = 0; col <= row; col += 1) {
          ctx.beginPath();
          ctx.arc((col - row / 2) * r * 0.5, -r * 0.45 + row * r * 0.45, r * 0.22, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      stem(r * 0.5, 0.2); leaf(r * 0.3, -r * 1.2, r * 0.3, r * 0.14, -0.3);
      break;
    case 3:
      inside(() => {
        ctx.strokeStyle = '#ffffff30';
        ctx.lineWidth = Math.max(1, r * 0.04);
        for (let a = 0; a < 6; a += 1) { ctx.beginPath(); ctx.moveTo(0, -r * 0.78); ctx.quadraticCurveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.3, 0, r); ctx.stroke(); }
      });
      leaf(r * 0.3, -r * 1.02, r * 0.3, r * 0.13, -0.4);
      break;
    case 4:
      for (const a of [-1.15, -0.4, 0.4, 1.15]) leaf(Math.sin(a) * r * 0.36, -r * 0.9 + Math.abs(a) * r * 0.06, r * 0.3, r * 0.12, a * 0.9);
      break;
    case 5: stem(r * 0.45, 0.2); leaf(r * 0.42, -r * 1.2, r * 0.36, r * 0.15, -0.5); break;
    case 6:
      inside(() => {
        ctx.fillStyle = '#8a7a1c55';
        for (const [sx, sy] of [[-0.5, 0.1], [0.4, -0.05], [-0.1, 0.45], [0.5, 0.5], [-0.55, 0.55], [0.05, -0.3]]) { ctx.beginPath(); ctx.arc(sx * r, sy * r, r * 0.035, 0, Math.PI * 2); ctx.fill(); }
      });
      stem(r * 0.45, 0.25); leaf(r * 0.38, -r * 1.2, r * 0.3, r * 0.13, -0.5);
      break;
    case 7:
      inside(() => {
        ctx.strokeStyle = '#d05c8055';
        ctx.lineWidth = Math.max(1.5, r * 0.05);
        ctx.beginPath(); ctx.arc(r * 0.95, 0, r * 0.95, Math.PI * 0.62, Math.PI * 1.38); ctx.stroke();
      });
      leaf(r * 0.28, -r * 0.98, r * 0.3, r * 0.13, -0.4); leaf(-r * 0.12, -r * 0.98, r * 0.24, r * 0.11, 0.5);
      break;
    case 8:
      inside(() => {
        ctx.strokeStyle = '#bf8f0066';
        ctx.lineWidth = Math.max(1.2, r * 0.04);
        for (let k = -4; k <= 4; k += 1) {
          ctx.beginPath(); ctx.moveTo(k * r * 0.3 - r, -r); ctx.lineTo(k * r * 0.3 + r, r); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(k * r * 0.3 + r, -r); ctx.lineTo(k * r * 0.3 - r, r); ctx.stroke();
        }
      });
      ctx.fillStyle = '#3fc45a';
      for (const [dx, h, lean] of [[-0.38, 0.55, -0.3], [-0.14, 0.75, -0.1], [0.12, 0.7, 0.12], [0.36, 0.5, 0.32]]) {
        ctx.beginPath(); ctx.moveTo(dx * r - r * 0.12, -r * 0.92); ctx.quadraticCurveTo(dx * r + lean * r * 0.5, -r * (0.92 + h * 0.6), dx * r + lean * r, -r * (0.92 + h)); ctx.quadraticCurveTo(dx * r + r * 0.05, -r * 0.95, dx * r + r * 0.14, -r * 0.92); ctx.fill();
      }
      break;
    case 9:
      inside(() => {
        ctx.strokeStyle = '#ffffff3d';
        ctx.lineWidth = Math.max(1, r * 0.035);
        for (let k = -4; k <= 4; k += 1) {
          ctx.beginPath(); ctx.moveTo(k * r * 0.3, -r); ctx.quadraticCurveTo(k * r * 0.36, 0, k * r * 0.3, r); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(-r, k * r * 0.3); ctx.quadraticCurveTo(0, k * r * 0.36, r, k * r * 0.3); ctx.stroke();
        }
      });
      stem(r * 0.28, 0.15);
      break;
    default:
      inside(() => {
        ctx.strokeStyle = '#176a2e99';
        ctx.lineWidth = r * 0.12;
        for (const k of [-0.62, -0.31, 0, 0.31, 0.62]) { ctx.beginPath(); ctx.moveTo(k * r * 0.7, -r); ctx.quadraticCurveTo(k * r * 1.5, 0, k * r * 0.7, r); ctx.stroke(); }
      });
  }
}

// One glossy candy fruit centred on (x, y): a drop shadow under the body, the shaded body, its trim, a streak of light and a face.
function drawFruit(ctx, x, y, level, { scale = 1, alpha = 1, squash = 0 } = {}) {
  const [base, light, dark] = PAL[level];
  const r = LEVELS[level].r;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale * (1 + squash), scale * (1 - squash));
  ctx.beginPath();
  ctx.arc(0, r * 0.07, r, 0, Math.PI * 2);
  ctx.fillStyle = dark;
  ctx.fill();
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, light);
  g.addColorStop(0.35, base);
  g.addColorStop(1, dark);
  ctx.beginPath();
  ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  trim(ctx, level, r);
  ctx.lineWidth = Math.max(1.2, r * 0.05);
  ctx.strokeStyle = '#ffffff66';
  ctx.beginPath();
  ctx.arc(0, 0, r - 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffffff55';
  ctx.beginPath();
  ctx.ellipse(-r * 0.4, -r * 0.5, r * 0.2, r * 0.12, -0.7, 0, Math.PI * 2);
  ctx.fill();
  // face
  const eye = Math.max(1.5, r * 0.085);
  ctx.fillStyle = '#2a1636';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * r * 0.28, r * 0.04, eye, eye * 1.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.28 + eye * 0.3, r * 0.04 - eye * 0.4, eye * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#2a1636';
  ctx.lineWidth = Math.max(1.1, r * 0.05);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, r * 0.2, r * 0.13, 0.2, Math.PI - 0.2);
  ctx.stroke();
  if (r >= 24) {
    ctx.fillStyle = '#ff5d8040';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * r * 0.5, r * 0.26, r * 0.12, r * 0.07, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

export function mountSuika(wrap, { onHud = () => {}, onResult = null } = {}) {
  let alive = true;
  let core = null;
  let best = Number(readJson(STORE.best)) || 0;
  let raf = 0;
  let last = 0;
  let aimX = (WORLD.left + WORLD.right) / 2;
  let pressed = null; // pointer id while a finger / button is down on the canvas
  let reported = false;
  let wonShown = false;
  let overAt = 0;
  let toast = null;
  const pops = new Map(); // fruit id -> when it was made, so a new fruit can bounce
  const bits = []; // juice droplets and rings
  const floaters = []; // "+10" text rising from a merge
  let lastHud = '';

  const canvas = el('canvas', 'game-canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = LW * dpr;
  canvas.height = LH * dpr;
  canvas.setAttribute('aria-label', '合成大西瓜游戏画布');
  const overlay = el('div', 'suika-overlay');
  overlay.hidden = true;
  wrap.replaceChildren(canvas, overlay);
  const ctx = canvas.getContext('2d');

  const poke = () => { if (!raf && alive) { last = 0; raf = requestAnimationFrame(frame); } };
  const say = (text) => { toast = { text, until: performance.now() + 1600 }; poke(); };
  const hud = () => {
    const text = `${core.score} 分 · 最高 ${Math.max(best, core.score)}`;
    if (text !== lastHud) { lastHud = text; onHud(text); }
  };
  const persist = () => {
    if (!core) return;
    if (core.over) writeJson(STORE.save, null);
    else writeJson(STORE.save, snapshot(core));
  };
  const bump = () => { if (core.score > best) { best = core.score; writeJson(STORE.best, best); } };

  function begin(state = createState()) {
    core = state;
    pops.clear();
    bits.length = 0;
    floaters.length = 0;
    toast = null;
    reported = false;
    overAt = 0;
    wonShown = state.watermelons > 0;
    overlay.hidden = true;
    lastHud = '';
    persist();
    hud();
    poke();
  }
  // A run that ends (or is abandoned with points on the board) is submitted once.
  function submit(note) {
    if (reported || core.score < 1) return;
    reported = true;
    onResult?.('suika', core.score).then((text) => { if (text && note?.isConnected) note.textContent = text; });
  }
  function restart() {
    submit(null);
    begin();
  }
  function release(x = aimX) {
    if (!alive || !overlay.hidden || !canDrop(core)) return false;
    const result = drop(core, x);
    if (!result.ok) return false;
    persist();
    poke();
    return true;
  }

  // ---- end cards ----
  function card(title, lines, buttons, cls = '') {
    overlay.replaceChildren();
    overlay.className = `suika-overlay ${cls}`;
    const box = el('div', 'suika-card');
    box.append(el('strong', '', title));
    for (const line of lines) box.append(el('p', '', line));
    const note = el('p', 'suika-note');
    box.append(note);
    for (const { label, action, ghost } of buttons) {
      const button = el('button', `suika-again${ghost ? ' ghost' : ''}`, label);
      button.addEventListener('click', action);
      box.append(button);
    }
    overlay.append(box);
    overlay.hidden = false;
    return note;
  }
  function won() {
    wonShown = true;
    card('合出大西瓜！', [`当前 ${core.score} 分 · 已落 ${core.drops} 个`, '再合出一个，两个西瓜会一起消失，腾出一大片地方。'], [
      { label: '继续挑战', action: () => { overlay.hidden = true; poke(); } },
      { label: '结算并重开', action: restart, ghost: true }
    ], 'won');
  }
  function finish() {
    bump();
    persist();
    const record = core.score >= best && core.score > 0;
    const note = card('装满啦！', [
      `最大的是${LEVELS[core.top].name} · 落了 ${core.drops} 个`,
      `本局 ${core.score} 分${record ? ' · 新的本机最高！' : ` · 本机最高 ${best}`}`
    ], [{ label: '再来一局', action: restart }], core.watermelons ? 'won' : '');
    submit(note);
    hud();
  }

  // ---- juice ----
  function splash(x, y, level, count, power) {
    if (calm()) return;
    const [, light, dark] = PAL[level];
    const now = performance.now();
    bits.push({ kind: 'ring', x, y, r0: LEVELS[level].r * 0.8, t0: now, life: 380, color: light });
    for (let i = 0; i < count; i += 1) {
      const a = Math.random() * Math.PI * 2, s = power * (0.4 + Math.random() * 0.8);
      bits.push({ kind: 'drop', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, t0: now, life: 520 + Math.random() * 300, size: 2 + Math.random() * 3, color: Math.random() < 0.5 ? light : dark });
    }
  }
  function float(x, y, text, color) {
    floaters.push({ x, y, text, color, t0: performance.now() });
  }
  function handle(events) {
    const now = performance.now();
    for (const e of events) {
      if (e.type === 'merge') {
        pops.set(e.id, now);
        splash(e.x, e.y, e.level, 6 + e.level, 90 + e.level * 18);
        float(e.x, e.y - LEVELS[e.level].r, `+${e.gained}`, '#ffe27a');
        if (e.combo >= 2) float(e.x, e.y - LEVELS[e.level].r - 18, `连击 ×${e.combo}`, '#ff8fd0');
      } else if (e.type === 'burst') {
        splash(e.x, e.y, TOP_LEVEL, 40, 300);
        float(e.x, e.y, `+${e.gained}`, '#ffe27a');
        say('两个大西瓜一起消失了！');
      } else if (e.type === 'over') {
        overAt = now;
      }
    }
    if (events.length) { bump(); hud(); persist(); }
  }

  // ---- input ----
  const toLogical = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * LW / rect.width, y: (event.clientY - rect.top) * LH / rect.height };
  };
  const aimAt = (x) => { aimX = clampX(core.current, x); poke(); };
  function onDown(event) {
    if (!alive || !overlay.hidden) return;
    event.preventDefault();
    pressed = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);
    aimAt(toLogical(event).x);
  }
  function onMove(event) {
    if (!alive || !overlay.hidden) return;
    if (event.pointerType === 'mouse' || pressed === event.pointerId) aimAt(toLogical(event).x);
  }
  function onUp(event) {
    if (pressed !== event.pointerId) return;
    pressed = null;
    if (event.type === 'pointerup') release(aimX);
  }
  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    const k = event.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') aimAt(aimX - 12);
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') aimAt(aimX + 12);
    else if (k === ' ' || k === 'Enter' || k === 'ArrowDown' || k === 's' || k === 'S') release();
    else return;
    event.preventDefault();
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);
  const onHide = () => { if (document.visibilityState === 'hidden') persist(); };
  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', persist);

  // ---- drawing ----
  function panel(x, y, w, h, label, value, accent) {
    roundRect(ctx, x, y, w, h, 14);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#ffffff2e');
    g.addColorStop(1, '#ffffff12');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff33';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#c9cffc';
    ctx.font = '700 11px system-ui, sans-serif';
    if (value === null) { ctx.fillText(label, x + 30, y + h / 2); return; }
    ctx.fillText(label, x + w / 2, y + 12);
    ctx.fillStyle = accent;
    ctx.font = '800 20px system-ui, sans-serif';
    ctx.fillText(String(value), x + w / 2, y + 30);
  }
  function drawBox() {
    const { left, right, top, floor, line } = WORLD;
    const g = ctx.createLinearGradient(0, top, 0, floor);
    g.addColorStop(0, '#ffffff10');
    g.addColorStop(1, '#8fe3ee22');
    ctx.fillStyle = g;
    ctx.fillRect(left, top, right - left, floor - top);
    // the danger line, which wakes up while something is over it
    const hot = core.danger > 0;
    ctx.save();
    ctx.setLineDash([8, 7]);
    ctx.lineWidth = hot ? 3 : 2;
    ctx.strokeStyle = hot ? `rgba(255,95,95,${0.6 + 0.4 * Math.sin(performance.now() / 90)})` : '#ff6f6155';
    ctx.beginPath();
    ctx.moveTo(left, line);
    ctx.lineTo(right, line);
    ctx.stroke();
    ctx.restore();
    if (hot) {
      ctx.fillStyle = '#ff8a8a';
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`快满了！${Math.max(0, SUIKA.dangerTime - core.danger).toFixed(1)}`, (left + right) / 2, line - 10);
    }
  }
  function drawGlass() {
    const { left, right, top, floor } = WORLD;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = '#58d4de88';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = '#7fe0ea';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(left - 4, top - 14);
    ctx.lineTo(left - 4, floor + 4);
    ctx.lineTo(right + 4, floor + 4);
    ctx.lineTo(right + 4, top - 14);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(left - 5.5, top - 12);
    ctx.lineTo(left - 5.5, floor + 2.5);
    ctx.stroke();
    ctx.restore();
  }
  function drawFruits(now) {
    for (const f of core.fruits) {
      const born = pops.get(f.id);
      let squash = 0;
      if (born !== undefined) {
        const t = clamp01((now - born) / (calm() ? 20 : 260));
        if (t >= 1) pops.delete(f.id);
        else squash = 0.18 * Math.sin(t * Math.PI) * (1 - t);
      }
      drawFruit(ctx, f.x, f.y, f.level, { squash });
    }
  }
  function drawHeld() {
    if (core.over) return;
    const level = core.current;
    const x = clampX(level, aimX);
    const ready = canDrop(core);
    if (ready) {
      ctx.save();
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = '#ffffff40';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, WORLD.dropY + LEVELS[level].r);
      ctx.lineTo(x, WORLD.floor);
      ctx.stroke();
      ctx.restore();
    }
    drawFruit(ctx, x, WORLD.dropY, level, { alpha: ready ? 1 : 0.35 });
  }
  function drawBits(now) {
    for (let i = bits.length - 1; i >= 0; i -= 1) {
      const b = bits[i];
      const age = now - b.t0;
      if (age >= b.life) { bits.splice(i, 1); continue; }
      const t = age / b.life;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      if (b.kind === 'ring') {
        ctx.strokeStyle = b.color;
        ctx.lineWidth = 4 * (1 - t) + 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r0 + t * 26, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const s = age / 1000;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x + b.vx * s, b.y + b.vy * s + 500 * s * s, b.size * (1 - t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i];
      const t = (now - f.t0) / 900;
      if (t >= 1) { floaters.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      ctx.font = '800 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#2a1636cc';
      ctx.strokeText(f.text, f.x, f.y - t * 34);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - t * 34);
      ctx.restore();
    }
  }
  function frame(now) {
    raf = 0;
    if (!alive) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (overlay.hidden && !core.over) {
      const events = advance(core, dt);
      if (events.length) handle(events);
      if (!wonShown && core.watermelons > 0) won();
    }
    if (core.over && overlay.hidden && overAt && now - overAt > 700) finish();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    panel(12, 6, 108, 40, '分数', core.score, '#ffd543');
    panel(128, 6, 108, 40, '最高', Math.max(best, core.score), '#58d4de');
    panel(244, 6, 104, 40, '下一个', null, '');
    drawFruit(ctx, 314, 26, core.next, { scale: Math.min(1, 14 / LEVELS[core.next].r) });
    drawBox();
    drawFruits(now);
    drawGlass();
    drawHeld();
    drawBits(now);
    ctx.fillStyle = '#8f96c9';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('按住拖动瞄准，松手落下 · ←→ 和空格也能玩', LW / 2, 548);
    if (toast && toast.until > now) {
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const width = ctx.measureText(toast.text).width + 28;
      roundRect(ctx, (LW - width) / 2, 300, width, 28, 14);
      ctx.fillStyle = '#000c';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(toast.text, LW / 2, 315);
    }
    const busy = isMoving(core) || core.danger > 0 || bits.length || floaters.length || pops.size || (toast && toast.until > now) || (core.over && overlay.hidden);
    if (busy && alive) raf = requestAnimationFrame(frame);
  }

  // Pick up the unfinished game from last time, if there is one.
  const saved = restoreState(readJson(STORE.save));
  begin(saved ?? createState());
  const saveTimer = setInterval(() => { if (alive && !core.over) persist(); }, 3000);
  return {
    get state() { return core; },
    restart,
    drop: release,
    // Run the physics ahead by `seconds` without waiting for frames (tests, and trying a position).
    advance(seconds) {
      for (let t = 0; t < seconds; t += 0.05) handle(advance(core, Math.min(0.05, seconds - t)));
      if (!wonShown && core.watermelons > 0) won();
      poke();
    },
    // A hand-built pile for tests: fruits are { x, y, level }.
    load(fruits, extra = {}) {
      const state = restoreState({ fruits, ...extra });
      if (state) begin(state);
      return Boolean(state);
    },
    destroy() {
      persist();
      alive = false;
      clearInterval(saveTimer);
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', onHide);
      wrap.replaceChildren();
    }
  };
}
