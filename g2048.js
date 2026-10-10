// 2048: the view. One 2D canvas: the score plaques on top, the 4×4 well in the middle, the undo
// button underneath. g2048-core.js decides what a move does; this module draws glossy candy tiles
// and plays the events back: tiles slide, the two parents of a merge melt into one that pops, and a
// new tile grows in. The core state is always up to date; an animation only changes what is shown.
import { createState, DIRS, G2048, maxTile, move, restoreState, snapshot, undo } from './g2048-core.js';

const LW = 360;
const LH = 540;
const STORE = { best: 'pao-g2048-best', save: 'pao-g2048-save' };
const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const calm = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// base, light, dark. The ramp walks the house palette: cool and gentle for small tiles, hot for big ones.
const PAL = {
  2: ['#58d4de', '#a8f0f6', '#1f93a3'], 4: ['#44c986', '#8fe8b8', '#1c8a55'], 8: ['#ffd543', '#ffeb9a', '#c29a0c'],
  16: ['#ffa23c', '#ffcb8a', '#c0680a'], 32: ['#ff6f61', '#ffaaa0', '#b8382c'], 64: ['#ff5d80', '#ffa0b6', '#b92a52'],
  128: ['#e46bff', '#f2aaff', '#9a2cc0'], 256: ['#8e7bff', '#c3b8ff', '#5238c4'], 512: ['#4f8bff', '#9dc0ff', '#2457b8'],
  1024: ['#f04b4b', '#ff9a9a', '#a52222'], 2048: ['#ffcf3d', '#fff0a8', '#c78a00']
};
const BEYOND = ['#6a3fd0', '#a98cff', '#3c1d8a']; // 4096 and up: royal violet with a gold rim
const paint = (v) => PAL[v] ?? BEYOND;

const BOARD = { x: 12, y: 112, size: 336, gap: 8, pad: 8 };
const CELL = (BOARD.size - BOARD.pad * 2 - BOARD.gap * 3) / 4;
const BTN = { x: (LW - 132) / 2, y: 474, w: 132, h: 56 };
const cellXY = (r, c) => ({ x: BOARD.x + BOARD.pad + c * (CELL + BOARD.gap), y: BOARD.y + BOARD.pad + r * (CELL + BOARD.gap) });
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const mix = (a, b, t) => a + (b - a) * t;
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// 联机竞速（online 是 Session）：两人同一个开局，各玩各的盘面，先合出目标的赢。
// 盘面、分数、输赢都以服务端为准；本地只负责画和把滑动发出去，没有撤销、不写本机存档、不提交榜单。
export function mountG2048(wrap, { onHud = () => {}, onResult = null, online = null } = {}) {
  let alive = true;
  let core = null;
  let best = Number(readJson(STORE.best)) || 0;
  let raf = 0;
  let anim = null; // { t0, before: Map id -> value, slides, merges, spawnId }
  let reported = false;
  let toast = null;
  let drag = null; // { id, x, y, done }

  const canvas = el('canvas', 'game-canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = LW * dpr;
  canvas.height = LH * dpr;
  canvas.setAttribute('aria-label', '2048 游戏画布');
  const overlay = el('div', 'g2048-overlay');
  overlay.hidden = true;
  wrap.replaceChildren(canvas, overlay);
  const ctx = canvas.getContext('2d');
  // 对手的小盘面：放在画布外面（画布容器有固定的宽高比）。
  const rivalBox = el('div', 'race-rival'), rivalLine = el('div', ''), rivalGrid = el('div', 'rival-grid');
  let rival = null, pendingDir = null, ended = false;
  if (online) { rivalBox.append(rivalLine, rivalGrid); wrap.after(rivalBox); }
  const fromView = (player) => ({ tiles: player.tiles.map((t) => ({ ...t })), nextId: player.nextId, score: player.score, moves: player.moves, won: false, over: player.over, undosLeft: 0, history: [] });

  const SLIDE = () => (calm() ? 20 : 110);
  const POP = () => (calm() ? 20 : 170);
  const poke = () => { if (!raf && alive) raf = requestAnimationFrame(frame); };
  const hud = () => onHud(online ? `你 ${core.score} 分 · 对手 ${rival?.score ?? 0} 分 · 目标 ${online.view.target}` : `${core.score} 分 · 最高 ${best} · ${core.moves} 步`);
  const say = (text) => { toast = { text, until: performance.now() + 1500 }; poke(); };
  const persist = () => {
    if (online) return;
    if (core.over) writeJson(STORE.save, null);
    else writeJson(STORE.save, snapshot(core));
  };
  const bump = () => {
    if (online) return;
    if (core.score > best) { best = core.score; writeJson(STORE.best, best); }
  };

  function begin(state = createState()) {
    core = state;
    anim = null;
    toast = null;
    reported = false;
    overlay.hidden = true;
    persist();
    hud();
    poke();
  }
  // A run that ends (or is abandoned with points on the board) is submitted once.
  function submit(note) {
    if (online || reported || core.score < 1) return;
    reported = true;
    onResult?.('g2048', core.score).then((text) => { if (text && note?.isConnected) note.textContent = text; });
  }
  function restart() {
    if (online) return;
    submit(null);
    begin();
  }

  function play(dir) {
    if (online) {
      if (!alive || !overlay.hidden || core.over || online.result.over || !DIRS.includes(dir)) return false;
      pendingDir = dir;
      online.send({ type: 'move', dir });
      return true;
    }
    if (!alive || !overlay.hidden || core.over) return false;
    const before = new Map(core.tiles.map((t) => [t.id, t.v]));
    const result = move(core, dir);
    if (!result.ok) return false;
    anim = { t0: performance.now(), before, slides: result.slides, merges: result.merges, spawnId: result.spawned?.id ?? 0 };
    bump();
    persist();
    hud();
    poke();
    const settle = SLIDE() + POP() + 30;
    setTimeout(() => { if (alive && core.over) finish(); else if (alive && result.firstWin) won(); }, settle);
    return true;
  }
  function takeBack() {
    if (online) return say('竞速中不能撤销');
    if (!alive || !overlay.hidden) return;
    const result = undo(core);
    if (!result.ok) return say(result.reason === 'none-left' ? '撤销次数用完了' : '还没有可以撤销的一步');
    anim = null;
    reported = false;
    persist();
    hud();
    poke();
  }

  // ---- end cards ----
  function card(title, lines, buttons, cls = '') {
    overlay.replaceChildren();
    overlay.className = `g2048-overlay ${cls}`;
    const box = el('div', 'g2048-card');
    box.append(el('strong', '', title));
    for (const line of lines) box.append(el('p', '', line));
    const note = el('p', 'g2048-note');
    box.append(note);
    for (const { label, action, ghost } of buttons) {
      const button = el('button', `g2048-again${ghost ? ' ghost' : ''}`, label);
      button.addEventListener('click', action);
      box.append(button);
    }
    overlay.append(box);
    overlay.hidden = false;
    return note;
  }
  function won() {
    card('合出 2048！', [`当前 ${core.score} 分 · ${core.moves} 步`, '再往上还能合出 4096、8192……'], [
      { label: '继续挑战', action: () => { overlay.hidden = true; poke(); } },
      { label: '结算并重开', action: restart, ghost: true }
    ], 'won');
  }
  function finish() {
    bump();
    const record = core.score >= best && core.score > 0;
    const note = card('没有可走的步了', [
      `最大方块 ${maxTile(core)} · ${core.moves} 步`,
      `本局 ${core.score} 分${record ? ' · 新的本机最高！' : ` · 本机最高 ${best}`}`
    ], [{ label: '再来一局', action: restart }], core.won ? 'won' : '');
    submit(note);
  }

  // ---- input ----
  const toLogical = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * LW / rect.width, y: (event.clientY - rect.top) * LH / rect.height };
  };
  const SWIPE = 22;
  function onDown(event) {
    if (!alive || !overlay.hidden) return;
    event.preventDefault();
    const p = toLogical(event);
    if (p.x >= BTN.x && p.x <= BTN.x + BTN.w && p.y >= BTN.y && p.y <= BTN.y + BTN.h) return takeBack();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, done: false };
    canvas.setPointerCapture?.(event.pointerId);
  }
  function onMove(event) {
    if (!drag || drag.id !== event.pointerId || drag.done) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE) return;
    drag.done = true; // one swipe, one move: the finger has to lift before the next
    play(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }
  function onUp(event) { if (drag?.id === event.pointerId) drag = null; }
  const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' };
  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    if (event.key === 'z' || event.key === 'Z') return takeBack();
    const dir = KEYS[event.key];
    if (!dir) return;
    event.preventDefault();
    play(dir);
  }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  window.addEventListener('keydown', onKey);

  // ---- drawing ----
  function panel(x, y, w, h, label, value, accent) {
    roundRect(ctx, x, y, w, h, 16);
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
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.fillText(label, x + w / 2, y + 17);
    ctx.fillStyle = accent;
    ctx.font = '800 26px system-ui, sans-serif';
    ctx.fillText(String(value), x + w / 2, y + 42);
  }
  function drawWell() {
    const { x, y, size } = BOARD;
    ctx.save();
    ctx.shadowColor = '#58d4de66';
    ctx.shadowBlur = 22;
    roundRect(ctx, x, y, size, size, 20);
    const g = ctx.createLinearGradient(0, y, 0, y + size);
    g.addColorStop(0, '#1a1840');
    g.addColorStop(1, '#0d0c24');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#58d4de99';
    roundRect(ctx, x, y, size, size, 20);
    ctx.stroke();
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 4; c += 1) {
        const p = cellXY(r, c);
        roundRect(ctx, p.x, p.y, CELL, CELL, 13);
        const slot = ctx.createLinearGradient(0, p.y, 0, p.y + CELL);
        slot.addColorStop(0, '#0a0920');
        slot.addColorStop(1, '#1a1844');
        ctx.fillStyle = slot;
        ctx.fill();
      }
    }
  }
  // One glossy tile: a drop shadow, a body that darkens toward the bottom, a lit top edge and a soft streak.
  function drawTile(cx, cy, v, scale = 1, alpha = 1) {
    const [base, light, dark] = paint(v);
    const s = CELL * scale;
    const x = cx - s / 2, y = cy - s / 2;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (v >= 128) { ctx.shadowColor = base; ctx.shadowBlur = v >= 2048 ? 26 : 12; }
    roundRect(ctx, x, y + 3 * scale, s, s, 14 * scale);
    ctx.fillStyle = dark;
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, x, y, s, s - 3 * scale, 14 * scale);
    const g = ctx.createLinearGradient(0, y, 0, y + s);
    g.addColorStop(0, light);
    g.addColorStop(0.18, base);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = v > 2048 ? '#ffd543' : '#ffffff59';
    ctx.stroke();
    roundRect(ctx, x + s * 0.12, y + s * 0.08, s * 0.76, s * 0.12, s * 0.06);
    ctx.fillStyle = '#ffffff40';
    ctx.fill();
    const digits = String(v).length;
    const size = (digits <= 2 ? 34 : digits === 3 ? 29 : digits === 4 ? 24 : 19) * scale;
    ctx.font = `800 ${size}px "Manrope", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4 * scale;
    ctx.strokeStyle = `${dark}cc`;
    ctx.strokeText(String(v), cx, cy - 1 * scale);
    ctx.fillStyle = '#fff';
    ctx.fillText(String(v), cx, cy - 1 * scale);
    ctx.restore();
  }
  const centre = (r, c) => { const p = cellXY(r, c); return { x: p.x + CELL / 2, y: p.y + CELL / 2 }; };
  function drawTiles(now) {
    const elapsed = anim ? now - anim.t0 : Infinity;
    const slideT = anim ? clamp01(elapsed / SLIDE()) : 1;
    if (anim && slideT < 1) {
      const k = ease(slideT);
      for (const s of anim.slides) {
        const a = centre(s.from.r, s.from.c), b = centre(s.to.r, s.to.c);
        drawTile(mix(a.x, b.x, k), mix(a.y, b.y, k), anim.before.get(s.id));
      }
      return;
    }
    const popT = anim ? clamp01((elapsed - SLIDE()) / POP()) : 1;
    const merged = anim ? new Set(anim.merges.map((m) => m.id)) : null;
    for (const t of core.tiles) {
      const p = centre(t.r, t.c);
      let scale = 1;
      if (anim && popT < 1) {
        if (merged.has(t.id)) scale = 1 + 0.2 * Math.sin(popT * Math.PI);
        else if (t.id === anim.spawnId) scale = ease(popT);
      }
      if (scale > 0.02) drawTile(p.x, p.y, t.v, scale);
    }
    if (anim && elapsed >= SLIDE() + POP()) anim = null;
  }
  function drawButton() {
    const off = !core.history.length || core.undosLeft <= 0;
    roundRect(ctx, BTN.x, BTN.y + 3, BTN.w, BTN.h, 16);
    ctx.fillStyle = off ? '#3e4262' : '#1e55c4';
    ctx.fill();
    roundRect(ctx, BTN.x, BTN.y, BTN.w, BTN.h - 3, 16);
    const g = ctx.createLinearGradient(0, BTN.y, 0, BTN.y + BTN.h);
    g.addColorStop(0, off ? '#6a6f93' : '#6aa4ff');
    g.addColorStop(1, off ? '#555a7c' : '#3f7bff');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#ffffff55';
    ctx.stroke();
    ctx.fillStyle = off ? '#c4c7d8' : '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '800 18px system-ui, sans-serif';
    ctx.fillText('↶ 撤销', BTN.x + BTN.w / 2 - 6, BTN.y + BTN.h / 2 - 2);
    ctx.beginPath();
    ctx.arc(BTN.x + BTN.w - 9, BTN.y + 9, 11, 0, Math.PI * 2);
    ctx.fillStyle = off ? '#8a8ea8' : '#ff5d80';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.fillText(String(core.undosLeft), BTN.x + BTN.w - 9, BTN.y + 9.5);
  }
  function frame(now) {
    raf = 0;
    if (!alive) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    panel(12, 14, 164, 66, '分数', core.score, '#ffd543');
    panel(184, 14, 164, 66, online ? '对手' : '最高', online ? (rival?.score ?? 0) : Math.max(best, core.score), '#58d4de');
    ctx.fillStyle = '#c9cffc';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(online ? `先合出 ${online.view.target} 的人获胜` : `滑动合并相同数字，合出 ${G2048.goal}`, LW / 2, 98);
    drawWell();
    drawTiles(now);
    drawButton();
    ctx.fillStyle = '#8f96c9';
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('方向键 / WASD 也能玩 · Z 撤销', LW / 2, 462);
    if (toast && toast.until > now) {
      ctx.font = '800 14px system-ui, sans-serif';
      const width = ctx.measureText(toast.text).width + 28;
      roundRect(ctx, (LW - width) / 2, BOARD.y + BOARD.size / 2 - 14, width, 28, 14);
      ctx.fillStyle = '#000c';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(toast.text, LW / 2, BOARD.y + BOARD.size / 2);
    }
    if (anim || (toast && toast.until > now)) raf = requestAnimationFrame(frame);
  }

  // ---- online ----
  function drawRival() {
    rivalLine.replaceChildren();
    rivalLine.append('对手 ', el('b', '', String(rival.score)), ` 分 · 最大方块 ${rival.max} · ${rival.moves} 步${rival.over ? ' · 已无路可走' : ''}`);
    const cells = Array.from({ length: 16 }, () => ({ v: 0 }));
    for (const t of rival.tiles) cells[t.r * 4 + t.c] = t;
    rivalGrid.replaceChildren(...cells.map((t) => {
      const cell = el('i', '', t.v ? String(t.v) : '');
      if (t.v) cell.style.background = paint(t.v)[0];
      return cell;
    }));
  }
  function onlineEnd() {
    const { over, winner, reason } = online.result;
    if (!over || ended) return;
    ended = true;
    const me = winner === online.seat;
    const why = reason === 'forfeit' ? (me ? '对手已离开' : '你已离开本局')
      : reason === 'target' ? `${me ? '你' : '对手'}先合出了 ${online.view.target}`
      : '双方都无路可走，按分数决胜';
    card(winner === null ? '平局' : me ? '你赢了！' : '对手获胜', [why, `你 ${core.score} 分 · 对手 ${rival?.score ?? 0} 分`],
      [{ label: '看看盘面', action: () => { overlay.hidden = true; poke(); }, ghost: true }], me ? 'won' : '');
  }
  let round = online?.round ?? 0;
  function applyServer(payload) {
    const view = payload.view, mine = view.players[online.seat];
    if (payload.round !== round) { round = payload.round; ended = false; overlay.hidden = true; pendingDir = null; core = null; }   // 再来一局：丢掉上一局的一切
    let next = null;
    if (pendingDir && core && mine.moves === core.moves + 1) {
      // 在旧盘面的拷贝上空跑一遍同方向的滑动，只为拿到「谁滑去哪、谁合并了」的动画数据；盘面本身用服务端的。
      const sim = fromView({ ...core, max: 0 });
      sim.over = false;
      const result = move(sim, pendingDir, () => 0.5);
      if (result.ok) next = { t0: performance.now(), before: new Map(core.tiles.map((t) => [t.id, t.v])), slides: result.slides, merges: result.merges, spawnId: result.spawned?.id ?? 0 };
    }
    pendingDir = null;
    const wasStuck = core?.over;
    core = fromView(mine);
    anim = next;
    rival = view.players[1 - online.seat];
    drawRival();
    hud();
    poke();
    if (core.over && !wasStuck && !online.result.over) say('你的盘面已经无路可走，等对手结束');
    setTimeout(() => { if (alive) onlineEnd(); }, next ? SLIDE() + POP() + 30 : 0);
  }
  const off = online?.on('state', applyServer);

  if (online) {
    rival = online.view.players[1 - online.seat];
    drawRival();
    begin(fromView(online.view.players[online.seat]));
    onlineEnd();
  } else {
    // Pick up the unfinished game from last time, if there is one.
    const saved = restoreState(readJson(STORE.save));
    begin(saved && !saved.over ? saved : createState());
  }
  return {
    get state() { return core; },
    get animating() { return Boolean(anim); },
    restart,
    play,
    undo: takeBack,
    // A hand-built board for tests and for trying a position: tiles are { r, c, v }.
    load(tiles, extra = {}) {
      const state = restoreState({ tiles, ...extra });
      if (state) begin(state);
      return Boolean(state);
    },
    destroy() {
      alive = false;
      off?.();
      rivalBox.remove();
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      wrap.replaceChildren();
    }
  };
}
