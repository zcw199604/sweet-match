// 新一批街机（ARCADE 23 起）共用的画布外壳：高清画布、按需刷新的动画循环、
// 逻辑坐标换算、结算卡片、提示条、本机存档，以及糖果质感的画笔。
// 每个游戏只管自己的规则（*-core.js）和画面；app.js 用同一套舞台把它们框起来。

export const calm = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
export const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const mix = (a, b, t) => a + (b - a) * t;

// 本机存档：隐私模式下读写都会抛错，一律当作没有存档。
export function store(key) {
  return {
    get(fallback = null) {
      try { const raw = localStorage.getItem(key); return raw === null ? fallback : JSON.parse(raw); } catch { return fallback; }
    },
    set(value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } },
    clear() { try { localStorage.removeItem(key); } catch { /* private mode */ } }
  };
}

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// 糖果色：base / light / dark。各游戏按下标取色，色盲辅助靠各自画的符号。
export const CANDY = [
  ['#f04b4b', '#ff9a9a', '#a82626'], ['#3d8bff', '#9cc4ff', '#1f55b3'], ['#38c26b', '#93e8b3', '#1d8444'], ['#ffcf3d', '#ffe9a0', '#b88c0a'],
  ['#9b6bff', '#cdb4ff', '#6038c4'], ['#ff8f2e', '#ffc08a', '#b3560a'], ['#ff77c0', '#ffb8de', '#b83d86'], ['#2fcfd6', '#98f0f3', '#17878d'],
  ['#a9e03a', '#d6f59a', '#6c9210'], ['#8a5a3c', '#c79a78', '#55331d'], ['#e8e8f0', '#ffffff', '#9a9ab0'], ['#3a3f5c', '#6b7194', '#1d2033']
];

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
  else ctx.rect(x, y, w, h);
}
// 街机的糖果方块：上高光、下阴影、浅色描边。
export function candy(ctx, x, y, w, h, r, color, { alpha = 1, glow = '', stroke = true } = {}) {
  const [base, light, dark] = Array.isArray(color) ? color : CANDY[color];
  ctx.save();
  ctx.globalAlpha = alpha;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
  roundRect(ctx, x, y + h * 0.06, w, h, r);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.shadowBlur = 0;
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, light);
  g.addColorStop(0.35, base);
  g.addColorStop(1, base);
  roundRect(ctx, x, y, w, h * 0.94, r);
  ctx.fillStyle = g;
  ctx.fill();
  if (stroke) { ctx.lineWidth = Math.max(1, w * 0.04); ctx.strokeStyle = glow || '#ffffffa0'; ctx.stroke(); }
  roundRect(ctx, x + w * 0.14, y + h * 0.08, w * 0.72, h * 0.18, h * 0.09);
  ctx.fillStyle = '#ffffff66';
  ctx.fill();
  ctx.restore();
}
// 有光泽的小球（毛线球、螺丝帽、跳棋子都用它打底）。
export function orb(ctx, x, y, r, color, { alpha = 1, glow = '' } = {}) {
  const [base, light, dark] = Array.isArray(color) ? color : CANDY[color];
  ctx.save();
  ctx.globalAlpha = alpha;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(0.45, base);
  g.addColorStop(1, dark);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}
export function text(ctx, value, x, y, { size = 14, weight = 800, color = '#fff', align = 'center', base = 'middle', font = 'Manrope, system-ui, sans-serif', shadow = '' } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  if (shadow) { ctx.fillStyle = shadow; ctx.fillText(value, x, y + Math.max(1, size * 0.08)); }
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  ctx.restore();
}
// 画在画布里的按钮：返回同一个矩形，方便视图记下来做点击判定。
export function button(ctx, rect, label, { on = false, off = false, color = '#ffffff1c', badge = '' } = {}) {
  ctx.save();
  ctx.globalAlpha = off ? 0.4 : 1;
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, Math.min(12, rect.h / 2));
  ctx.fillStyle = on ? '#8e7bff' : color;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = on ? '#c5baff' : '#ffffff33';
  ctx.stroke();
  text(ctx, label, rect.x + rect.w / 2, rect.y + rect.h / 2 + 1, { size: Math.min(14, rect.h * 0.42) });
  if (badge !== '') {
    ctx.beginPath();
    ctx.arc(rect.x + rect.w - 4, rect.y + 4, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#ff5d80';
    ctx.fill();
    text(ctx, String(badge), rect.x + rect.w - 4, rect.y + 4.5, { size: 10 });
  }
  ctx.restore();
  return rect;
}
export const inRect = (p, r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

// 画布外壳。render(ctx, now) 由游戏提供；动画、提示条或 keep() 在跑时循环继续，否则停下省电。
export function canvasGame(wrap, { width = 360, height = 640, label = '游戏画布', game = '' } = {}) {
  let alive = true;
  let raf = 0;
  let until = 0;
  let toast = null;
  let inFrame = false; // render 里调 poke 只延长 until，由这一帧结尾统一决定要不要下一帧
  const anims = [];
  const offs = [];
  const shell = { W: width, H: height, render: () => {} };
  const canvas = el('canvas', 'game-canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.setAttribute('aria-label', label);
  canvas.tabIndex = 0;
  const overlay = el('div', 'kit-overlay');
  overlay.hidden = true;
  wrap.classList.add('kit-wrap');
  if (game) wrap.dataset.kit = game;
  wrap.style.setProperty('--ar', String(width / height));
  wrap.style.aspectRatio = `${width} / ${height}`;
  wrap.replaceChildren(canvas, overlay);
  const ctx = canvas.getContext('2d');

  function frame(now) {
    raf = 0;
    if (!alive) return;
    for (let i = anims.length - 1; i >= 0; i -= 1) {
      if (now - anims[i].t0 >= anims[i].ms) { const [done] = anims.splice(i, 1); done.resolve(); }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    inFrame = true;
    try {
      shell.render(ctx, now);
      for (const anim of anims) anim.draw(ctx, Math.min(1, (now - anim.t0) / anim.ms));
    } finally { inFrame = false; }
    if (toast && toast.until > now) {
      ctx.font = '800 14px Manrope, system-ui, sans-serif';
      const w = Math.min(width - 20, ctx.measureText(toast.text).width + 28);
      roundRect(ctx, (width - w) / 2, toast.y - 14, w, 28, 14);
      ctx.fillStyle = '#000000cc';
      ctx.fill();
      text(ctx, toast.text, width / 2, toast.y + 1, { size: 14 });
    }
    if (anims.length || now < until || (toast && toast.until > now)) raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf && alive && !inFrame) raf = requestAnimationFrame(frame); };
  Object.assign(shell, {
    canvas, ctx, overlay,
    get alive() { return alive; },
    get busy() { return anims.length > 0; },
    get cardOpen() { return !overlay.hidden; },
    // 画一帧；ms 大于 0 时让循环至少再跑这么久（倒计时、闪烁之类）。
    poke(ms = 0) { until = Math.max(until, performance.now() + ms); wake(); },
    keep(ms) { this.poke(ms); },
    tween(ms, draw = () => {}) {
      const time = calm() ? ms * 0.25 : ms;
      return new Promise((resolve) => { anims.push({ t0: performance.now(), ms: time, draw, resolve }); wake(); });
    },
    toast(message, ms = 1400, y = height * 0.5) { toast = { text: message, until: performance.now() + ms, y }; this.poke(ms + 50); },
    point(event) {
      const rect = canvas.getBoundingClientRect();
      return { x: (event.clientX - rect.left) * width / rect.width, y: (event.clientY - rect.top) * height / rect.height };
    },
    // 逻辑坐标 → 页面坐标，给测试点击用。
    page(x, y) {
      const rect = canvas.getBoundingClientRect();
      return { x: rect.left + x * rect.width / width, y: rect.top + y * rect.height / height };
    },
    on(type, handler, target = canvas) {
      target.addEventListener(type, handler, { passive: false });
      offs.push(() => target.removeEventListener(type, handler));
    },
    card({ title, lines = [], buttons = [], tone = '' }) {
      overlay.replaceChildren();
      overlay.className = `kit-overlay ${tone}`;
      const box = el('div', 'kit-card');
      box.append(el('strong', '', title));
      for (const line of lines) box.append(el('p', '', line));
      const note = el('p', 'kit-note');
      box.append(note);
      const row = el('div', 'kit-buttons');
      for (const item of buttons) {
        const b = el('button', item.ghost ? 'kit-again ghost' : 'kit-again', item.label);
        b.type = 'button';
        b.addEventListener('click', () => { if (alive) item.action(); });
        row.append(b);
      }
      box.append(row);
      overlay.append(box);
      overlay.hidden = false;
      return { box, note };
    },
    closeCard() { overlay.hidden = true; overlay.replaceChildren(); },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      anims.splice(0).forEach((anim) => anim.resolve());
      offs.splice(0).forEach((off) => off());
      wrap.replaceChildren();
    }
  });
  return shell;
}

// 结算时把分数交给榜单，回来的文字（名次 / 连不上）写进卡片。
export function postScore(onResult, board, value, note) {
  if (!onResult || !(value > 0)) return;
  note.textContent = '正在提交成绩……';
  Promise.resolve(onResult(board, Math.round(value))).then((msg) => { if (note.isConnected) note.textContent = msg || ''; }, () => { if (note.isConnected) note.textContent = ''; });
}
