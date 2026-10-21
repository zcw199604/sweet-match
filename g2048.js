// 2048: the view. One 2D canvas: the score plaques on top, the 4×4 well in the middle, the undo
// button underneath. g2048-core.js decides what a move does; this module draws glossy candy tiles
// and plays the events back: tiles slide, the two parents of a merge melt into one that pops, and a
// new tile grows in. The core state is always up to date; an animation only changes what is shown.
import { createState, DIRS, G2048, maxTile, move, restoreState, snapshot, undo } from './g2048-core.js';
import { createFx, isG2048Theme, themeLook } from './g2048-art.js';
import { getPref } from './prefs.js';
import { rngFrom } from './rng-core.js';
import { fitView } from './fit-view.js';
import { framePoint } from './screen-frame.js';

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
  let theme = 'candy';
  let look = themeLook(theme);
  const fx = createFx(); // sparks, rings and shakes; only the neon theme sets them off

  const canvas = el('canvas', 'game-canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = LW * dpr;
  canvas.height = LH * dpr;
  canvas.setAttribute('aria-label', '2048 游戏画布');
  const overlay = el('div', 'g2048-overlay');
  overlay.hidden = true;
  wrap.replaceChildren(canvas, overlay);
  // The look is a display setting of this device (or account): it never touches the game or the server.
  function setTheme(id) {
    if (!isG2048Theme(id)) return;
    theme = id;
    look = themeLook(id);
    wrap.dataset.theme = id;
    fx.clear();
    if (rival) drawRival();
    poke();
  }
  const onTheme = (event) => setTheme(event.detail);
  document.addEventListener('pao-g2048-theme', onTheme);
  let ctx = canvas.getContext('2d');
  // 全屏：上面的分数 / 说明、下面的撤销按钮是信息栏，棋盘是游戏区（fit-view.js）
  const fit = fitView(canvas, { width: LW, height: LH, onChange: () => poke(), regions: () => [
    { x: 0, y: 0, w: LW, h: 108, role: 'top' },
    { x: BOARD.x - 4, y: BOARD.y - 4, w: BOARD.size + 8, h: BOARD.size + 8, role: 'main' },
    { x: 0, y: 450, w: LW, h: LH - 450, role: 'bottom' }
  ] });
  // 对手的小盘面：放在画布外面（画布容器有固定的宽高比）。
  const rivalBox = el('div', 'race-rival'), rivalLine = el('div', ''), rivalGrid = el('div', 'rival-grid');
  // 联机时每一步都在本地完整算出来（服务端发来的随机状态 seed 能算出同样的新块），发出去不用等；
  // core 比 lastMine（服务端最近一次给的我方盘面）多走的那几步就是还没确认的，出错时退回到 lastMine。
  // rival 是正在显示的对手盘面，rivalNext 是服务端给的最新的：对手面板最多每 RIVAL_EVERY 刷新一次。
  let rival = null, rivalNext = null, rivalShown = 0, rivalTimer = 0;
  let lastMine = null, seed = null, ended = false;
  const RIVAL_EVERY = 2000;
  if (online) { rivalBox.append(rivalLine, rivalGrid); wrap.after(rivalBox); }
  const fromView = (player) => ({ tiles: player.tiles.map((t) => ({ ...t })), nextId: player.nextId, score: player.score, moves: player.moves, won: false, over: player.over, undosLeft: 0, history: [] });

  const SLIDE = () => (calm() ? 20 : 110);
  const POP = () => (calm() ? 20 : 170);
  const poke = () => { if (!raf && alive) raf = requestAnimationFrame(frame); };
  // Hand a move's merges to the effects, timed for the moment the sliding tiles land.
  const celebrate = (a) => {
    if (!look.fx || calm()) return;
    const spawn = core.tiles.find((t) => t.id === a.spawnId);
    fx.burst({ merges: a.merges, spawn, at: a.t0 + SLIDE(), centre, cell: CELL, goal: G2048.goal });
  };
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
    fx.clear();
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
    } else if (!alive || !overlay.hidden || core.over) return false;
    const before = new Map(core.tiles.map((t) => [t.id, t.v]));
    const result = online ? move(core, dir, rngFrom(seed)) : move(core, dir);
    if (!result.ok) return false;
    anim = { t0: performance.now(), before, slides: result.slides, merges: result.merges, spawnId: result.spawned?.id ?? 0 };
    celebrate(anim);
    bump();
    persist();
    hud();
    poke();
    if (online) {
      online.send({ type: 'move', dir });   // 不等回包：服务端用同一个随机状态，会算出一模一样的结果
      if (core.over) say('你的盘面已经无路可走，等对手结束');
      return true;
    }
    // With the effects on, the 2048 card waits for the fireworks to play out instead of covering them.
    const settle = SLIDE() + POP() + 30 + (result.firstWin && look.fx && !calm() ? 900 : 0);
    setTimeout(() => { if (alive && core.over) finish(); else if (alive && result.firstWin) won(); }, settle);
    return true;
  }
  function takeBack() {
    if (online) return say('竞速中不能撤销');
    if (!alive || !overlay.hidden) return;
    const result = undo(core);
    if (!result.ok) return say(result.reason === 'none-left' ? '撤销次数用完了' : '还没有可以撤销的一步');
    anim = null;
    fx.clear();
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
  const toLogical = (event) => fit.point(event.clientX, event.clientY);
  const SWIPE = 22;
  function onDown(event) {
    if (!alive || !overlay.hidden) return;
    event.preventDefault();
    const p = toLogical(event);
    if (p.x >= BTN.x && p.x <= BTN.x + BTN.w && p.y >= BTN.y && p.y <= BTN.y + BTN.h) return takeBack();
    drag = { id: event.pointerId, ...framePoint(event.clientX, event.clientY), done: false };
    canvas.setPointerCapture?.(event.pointerId);
  }
  function onMove(event) {
    if (!drag || drag.id !== event.pointerId || drag.done) return;
    const p = framePoint(event.clientX, event.clientY), dx = p.x - drag.x, dy = p.y - drag.y;
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
    const P = look.panel;
    ctx.save();
    if (P.glow) { ctx.shadowColor = P.edge; ctx.shadowBlur = 14; }
    roundRect(ctx, x, y, w, h, P.radius);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, P.top);
    g.addColorStop(1, P.bottom);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();
    if (P.edge) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = P.edge;
      ctx.stroke();
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = P.label;
    ctx.font = `700 12px ${P.font}`;
    ctx.fillText(label, x + w / 2, y + 17);
    ctx.fillStyle = accent;
    ctx.font = `800 26px ${P.font}`;
    ctx.fillText(String(value), x + w / 2, y + 42);
  }
  const slots = Array.from({ length: 16 }, (_, i) => cellXY(Math.floor(i / 4), i % 4));
  function drawTile(cx, cy, v, scale = 1, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    look.tile(ctx, cx, cy, v, CELL, scale);
    ctx.restore();
  }
  const centre = (r, c) => { const p = cellXY(r, c); return { x: p.x + CELL / 2, y: p.y + CELL / 2 }; };
  function drawTiles(now) {
    const elapsed = anim ? now - anim.t0 : Infinity;
    const slideT = anim ? clamp01(elapsed / SLIDE()) : 1;
    if (anim && slideT < 1) {
      // The glowing theme leaves a fading streak of copies behind each moving tile.
      const lags = look.trail && !calm() ? [0.34, 0.18, 0] : [0];
      for (const lag of lags) {
        const k = ease(clamp01(slideT - lag));
        for (const s of anim.slides) {
          const a = centre(s.from.r, s.from.c), b = centre(s.to.r, s.to.c);
          if (lag && a.x === b.x && a.y === b.y) continue;
          drawTile(mix(a.x, b.x, k), mix(a.y, b.y, k), anim.before.get(s.id), lag ? 0.94 : 1, lag ? 0.42 - lag : 1);
        }
      }
      return;
    }
    const popT = anim ? clamp01((elapsed - SLIDE()) / POP()) : 1;
    const merged = anim ? new Set(anim.merges.map((m) => m.id)) : null;
    for (const t of core.tiles) {
      const p = centre(t.r, t.c);
      let scale = 1;
      if (anim && popT < 1) {
        if (merged.has(t.id)) scale = 1 + look.pop * Math.sin(popT * Math.PI);
        else if (t.id === anim.spawnId) scale = ease(popT);
      }
      if (scale > 0.02) drawTile(p.x, p.y, t.v, scale);
    }
    if (anim && elapsed >= SLIDE() + POP()) anim = null;
  }
  function drawButton() {
    const off = !core.history.length || core.undosLeft <= 0;
    const B = look.button, [top, bottom, base, ink] = off ? B.off : B.on;
    ctx.save();
    if (B.glow && !off) { ctx.shadowColor = top; ctx.shadowBlur = 16; }
    roundRect(ctx, BTN.x, BTN.y + 3, BTN.w, BTN.h, B.radius);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.restore();
    roundRect(ctx, BTN.x, BTN.y, BTN.w, BTN.h - 3, B.radius);
    const g = ctx.createLinearGradient(0, BTN.y, 0, BTN.y + BTN.h);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fill();
    if (B.edge) {
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = B.edge;
      ctx.stroke();
    }
    ctx.fillStyle = ink;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 18px ${look.panel.font}`;
    ctx.fillText('↶ 撤销', BTN.x + BTN.w / 2 - 6, BTN.y + BTN.h / 2 - 2);
    ctx.beginPath();
    ctx.arc(BTN.x + BTN.w - 9, BTN.y + 9, 11, 0, Math.PI * 2);
    ctx.fillStyle = off ? B.badgeOff : B.badge;
    ctx.fill();
    ctx.fillStyle = off ? '#fff' : B.badgeInk;
    ctx.font = '800 12px system-ui, sans-serif';
    ctx.fillText(String(core.undosLeft), BTN.x + BTN.w - 9, BTN.y + 9.5);
  }
  function frame(now) {
    raf = 0;
    if (!alive) return;
    ctx = fit.begin();
    look.backdrop?.(ctx, LW, LH);
    panel(12, 14, 164, 66, '分数', core.score, look.panel.score);
    panel(184, 14, 164, 66, online ? '对手' : '最高', online ? (rival?.score ?? 0) : Math.max(best, core.score), look.panel.best);
    ctx.fillStyle = look.ink;
    ctx.font = `700 13px ${look.panel.font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(online ? `先合出 ${online.view.target} 的人获胜` : `滑动合并相同数字，合出 ${G2048.goal}`, LW / 2, 98);
    const busy = fx.alive(now);
    const jolt = fx.shake(now);
    ctx.save();
    ctx.translate(jolt.x, jolt.y);
    look.well(ctx, BOARD, slots, CELL);
    drawTiles(now);
    if (busy) fx.draw(ctx, now, LW, LH, BOARD);
    ctx.restore();
    drawButton();
    ctx.fillStyle = look.faint;
    ctx.font = '600 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('方向键 / WASD 也能玩 · Z 撤销', LW / 2, 462);
    if (toast && toast.until > now) {
      ctx.font = '800 14px system-ui, sans-serif';
      const width = ctx.measureText(toast.text).width + 28;
      roundRect(ctx, (LW - width) / 2, BOARD.y + BOARD.size / 2 - 14, width, 28, 14);
      ctx.fillStyle = look.toast[0];
      ctx.fill();
      ctx.fillStyle = look.toast[1];
      ctx.fillText(toast.text, LW / 2, BOARD.y + BOARD.size / 2);
    }
    fit.end();
    if (anim || busy || (toast && toast.until > now)) raf = requestAnimationFrame(frame);
  }

  // ---- online ----
  function drawRival() {
    rivalLine.replaceChildren();
    rivalLine.append('对手 ', el('b', '', String(rival.score)), ` 分 · 最大方块 ${rival.max} · ${rival.moves} 步${rival.over ? ' · 已无路可走' : ''}`);
    const cells = Array.from({ length: 16 }, () => ({ v: 0 }));
    for (const t of rival.tiles) cells[t.r * 4 + t.c] = t;
    rivalGrid.replaceChildren(...cells.map((t) => {
      const cell = el('i', '', t.v ? String(t.v) : '');
      if (t.v) [cell.style.background, cell.style.color] = look.swatch(t.v);
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
  // 对手面板（小盘面、画布上的「对手」分数、顶栏文字）节流显示；now=true 立刻刷新（开局、结束时）。
  function showRival(now = false) {
    const wait = RIVAL_EVERY - (performance.now() - rivalShown);
    if (!now && wait > 0) {
      if (!rivalTimer) rivalTimer = setTimeout(() => { rivalTimer = 0; if (alive) showRival(true); }, wait);
      return;
    }
    clearTimeout(rivalTimer);
    rivalTimer = 0;
    rivalShown = performance.now();
    if (rival === rivalNext) return;
    rival = rivalNext;
    drawRival();
    hud();
    poke();
  }
  // 盘面和随机状态都换成服务端最后确认的（开局、对不上、被拒、断线时）。
  function resync() {
    core = fromView(lastMine);
    seed = { s: lastMine.rng };
    anim = null;
    hud();
    poke();
  }
  // 有一步被拒或连接断了：丢掉还没确认的那几步。
  const rollback = () => { if (core && core.moves !== lastMine.moves) resync(); };
  const sameBoard = (a, b) => a.score === b.score && a.tiles.length === b.tiles.length
    && a.tiles.every((t) => b.tiles.some((u) => u.id === t.id && u.r === t.r && u.c === t.c && u.v === t.v));
  let round = online?.round ?? 0;
  function applyServer(payload) {
    const view = payload.view, mine = view.players[online.seat];
    if (payload.round !== round) { round = payload.round; ended = false; overlay.hidden = true; core = null; }   // 再来一局：丢掉上一局的一切
    rivalNext = view.players[1 - online.seat];
    lastMine = mine;
    // 本地每一步都已经算在前面了：服务端确认的是更早的某一步、或者只是对手走了，盘面和动画都不动。
    // 只有开局/重连（服务端走得比本地远），或者全部确认后和本地对不上，才以服务端为准。
    if (!core || mine.moves > core.moves || (mine.moves === core.moves && !sameBoard(core, mine))) {
      const wasStuck = core?.over;
      resync();
      if (core.over && !wasStuck && !online.result.over) say('你的盘面已经无路可走，等对手结束');
    }
    if (online.result.over) showRival(true); else showRival();
    setTimeout(() => { if (alive) onlineEnd(); }, anim ? SLIDE() + POP() + 30 : 0);
  }
  const offs = online ? [
    online.on('state', applyServer),
    online.on('reject', rollback),
    online.on('status', (status) => { if (status !== 'live') rollback(); })
  ] : [];

  setTheme(getPref('g2048Theme'));
  if (online) {
    lastMine = online.view.players[online.seat];
    rivalNext = online.view.players[1 - online.seat];
    seed = { s: lastMine.rng };
    begin(fromView(lastMine));
    showRival(true);
    onlineEnd();
  } else {
    // Pick up the unfinished game from last time, if there is one.
    const saved = restoreState(readJson(STORE.save));
    begin(saved && !saved.over ? saved : createState());
  }
  return {
    get state() { return core; },
    get animating() { return Boolean(anim); },
    get theme() { return theme; },
    get effects() { return fx.count; },
    setTheme,
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
      fit.destroy();
      for (const off of offs) off();
      clearTimeout(rivalTimer);
      document.removeEventListener('pao-g2048-theme', onTheme);
      rivalBox.remove();
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      wrap.replaceChildren();
    }
  };
}
