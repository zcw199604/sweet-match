// 挪车接客: the view. One 2D canvas: the waiting queue on top, five bays under it, the jam below.
// park-core.js decides what a tap does; this module draws the cars and plays the events back:
// the car drives off the board and into a bay, then passengers walk from the queue into it.
// The core state is always up to date; `vis` is what is currently shown, one event behind.
import { PARK, STAGES, createLevel, findHint, outcome, sendCar, settle, stageBonus } from './park-core.js';

const LW = 360;
const LH = 640;
const STORE = { best: 'pao-park-best' };
const readCount = (key) => { try { return Math.max(0, Number(localStorage.getItem(key)) || 0); } catch { return 0; } };
const writeCount = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* private mode */ } };
const calm = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// base, light, dark — in COLORS order.
const PAL = [
  ['#f04b4b', '#ff8d8d', '#a82626'], ['#3d8bff', '#8dbbff', '#1f55b3'], ['#38c26b', '#86e3a8', '#1d8444'], ['#ffcf3d', '#ffe58a', '#b88c0a'],
  ['#9b6bff', '#c6aaff', '#6038c4'], ['#ff8f2e', '#ffbb7a', '#b3560a'], ['#ff77c0', '#ffb0dc', '#b83d86'], ['#2fcfd6', '#8ceef2', '#17878d']
];
const ANGLE = [-Math.PI / 2, 0, Math.PI / 2, Math.PI];
const QUEUE = { x: 14, y: 40, step: 21, shown: 15 };
const BAY = { y: 70, w: 62, h: 96, gap: 6 };
const bayX = (index) => (LW - (PARK.SLOTS * BAY.w + (PARK.SLOTS - 1) * BAY.gap)) / 2 + index * (BAY.w + BAY.gap);
const BOARD = { x: 10, y: 182, w: LW - 20, h: LH - 182 - 10 };
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const mix = (a, b, t) => a + (b - a) * t;
function turn(from, to, t) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d * t;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

function drawCar(ctx, cx, cy, angle, len, wid, color, { alpha = 1, glow = '' } = {}) {
  const [base, light, dark] = PAL[color];
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#171a22';
  for (const sx of [-0.3, 0.3]) for (const sy of [-1, 1]) { roundRect(ctx, sx * len - len * 0.1, sy * wid * 0.5 - wid * 0.08, len * 0.2, wid * 0.16, wid * 0.05); ctx.fill(); }
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
  roundRect(ctx, -len / 2, -wid / 2, len, wid, wid * 0.3);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = Math.max(1.2, wid * 0.05);
  ctx.strokeStyle = glow || dark;
  ctx.stroke();
  roundRect(ctx, -len / 2 + wid * 0.08, -wid / 2 + wid * 0.06, len - wid * 0.16, wid * 0.22, wid * 0.1);
  ctx.fillStyle = light;
  ctx.globalAlpha = alpha * 0.55;
  ctx.fill();
  ctx.globalAlpha = alpha;
  // windows: one cabin on a car, a window at each end of a bus (the arrow sits between)
  ctx.fillStyle = '#25324a';
  const bus = len > wid * 2.6;
  if (bus) for (const x of [-0.3, 0.2]) { roundRect(ctx, x * len - len * 0.09, -wid * 0.33, len * 0.18, wid * 0.66, wid * 0.08); ctx.fill(); }
  else { roundRect(ctx, -len * 0.27, -wid * 0.34, len * 0.5, wid * 0.68, wid * 0.12); ctx.fill(); }
  ctx.fillStyle = '#fff6c2';
  for (const sy of [-1, 1]) { ctx.beginPath(); ctx.arc(len / 2 - wid * 0.1, sy * wid * 0.27, wid * 0.075, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#ff4747';
  for (const sy of [-1, 1]) { roundRect(ctx, -len / 2 + wid * 0.02, sy * wid * 0.27 - wid * 0.05, wid * 0.07, wid * 0.1, 1); ctx.fill(); }
  // the arrow on the roof says which way it drives
  const s = wid * 0.34, h = s * 0.3;
  ctx.beginPath();
  ctx.moveTo(-s, -h); ctx.lineTo(s * 0.1, -h); ctx.lineTo(s * 0.1, -s * 0.72); ctx.lineTo(s, 0);
  ctx.lineTo(s * 0.1, s * 0.72); ctx.lineTo(s * 0.1, h); ctx.lineTo(-s, h);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#0006';
  ctx.stroke();
  ctx.restore();
}
function drawPerson(ctx, x, y, color, r = 8, ring = false) {
  const [base, light, dark] = PAL[color];
  ctx.save();
  if (ring) { ctx.beginPath(); ctx.arc(x, y - 1, r + 4, 0, Math.PI * 2); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
  ctx.beginPath();
  ctx.ellipse(x, y + r * 0.35, r * 0.85, r * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = base;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = dark;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - r * 0.7, r * 0.55, 0, Math.PI * 2);
  ctx.fillStyle = light;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function mountPark(wrap, { onHud = () => {}, onResult = null } = {}) {
  let alive = true;
  let epoch = 0; // bumped by restart, so a half-played move stops touching the new game
  let runScore = 0;
  let best = readCount(STORE.best);
  let core = null;
  let vis = null;
  let lay = { cell: 40, x: 0, y: 0 };
  let busy = false;
  let pending = null;
  let animUntil = 0;
  let raf = 0;
  const anims = [];
  const marks = new Map(); // car id -> { kind, until }
  let toast = null;

  const canvas = el('canvas', 'game-canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = LW * dpr;
  canvas.height = LH * dpr;
  canvas.setAttribute('aria-label', '挪车接客游戏画布');
  const overlay = el('div', 'park-overlay');
  overlay.hidden = true;
  wrap.replaceChildren(canvas, overlay);
  const ctx = canvas.getContext('2d');

  const poke = (ms) => { animUntil = Math.max(animUntil, performance.now() + ms); if (!raf && alive) raf = requestAnimationFrame(frame); };
  const speed = (ms) => (calm() ? ms * 0.2 : ms);
  const tween = (ms, draw) => new Promise((resolve) => {
    anims.push({ t0: performance.now(), ms: speed(ms), draw, resolve });
    poke(speed(ms) + 60);
  });
  const hud = () => onHud(`第 ${core.stage}/${STAGES} 关 · 剩 ${vis.queue.length} 人 · ${runScore + vis.score} 分`);

  // ---- level ----
  function begin(stage, seed) {
    epoch += 1;
    busy = false;
    pending = null;
    marks.clear();
    toast = null;
    anims.splice(0).forEach((anim) => anim.resolve());
    core = createLevel(stage, seed);
    vis = { queue: [...core.queue], bays: Array(PARK.SLOTS).fill(null), left: new Set(), score: 0, shiftAt: 0 };
    const cell = Math.min(56, Math.floor(BOARD.w / core.cols), Math.floor(BOARD.h / core.rows));
    lay = { cell, x: BOARD.x + (BOARD.w - cell * core.cols) / 2, y: BOARD.y + (BOARD.h - cell * core.rows) / 4 };
    overlay.hidden = true;
    hud();
    poke(100);
  }
  function restart() {
    runScore = 0;
    begin(1, Date.now());
  }

  // ---- geometry ----
  const cellCenter = (r, c) => [lay.x + (c + 0.5) * lay.cell, lay.y + (r + 0.5) * lay.cell];
  function carPose(car) {
    const horizontal = car.dir === 1 || car.dir === 3;
    const [x, y] = cellCenter(car.r + (horizontal ? 0 : (car.len - 1) / 2), car.c + (horizontal ? (car.len - 1) / 2 : 0));
    return { x, y, angle: ANGLE[car.dir], len: car.len * lay.cell - lay.cell * 0.14, wid: lay.cell * 0.8 };
  }
  const bayScale = (len) => (len === 3 ? 25 : 31);
  const bayCenter = (index) => [bayX(index) + BAY.w / 2, BAY.y + 38];
  const queueSpot = (index) => [QUEUE.x + 10 + index * QUEUE.step, QUEUE.y + 12];

  // ---- playback ----
  async function drive(car, slot) {
    const from = carPose(car);
    const [bx, by] = bayCenter(slot);
    const cs = bayScale(car.len);
    const to = { x: bx, y: by, angle: ANGLE[0], len: car.len * cs - cs * 0.14, wid: cs * 0.8 };
    const dx = [0, 1, 0, -1][car.dir];
    const dy = [-1, 0, 1, 0][car.dir];
    // out through the edge of the board, far enough that the tail clears it
    let reach = 0;
    for (;;) {
      const px = from.x + dx * reach, py = from.y + dy * reach;
      const half = from.len / 2;
      if (px + half < lay.x || px - half > lay.x + lay.cell * core.cols || py + half < lay.y || py - half > lay.y + lay.cell * core.rows) break;
      reach += lay.cell * 0.5;
    }
    const outMs = 90 + (reach / lay.cell) * 28, flyMs = 230;
    const out = { x: from.x + dx * reach, y: from.y + dy * reach };
    vis.left.add(car.id);
    const total = outMs + flyMs;
    await tween(total, (g, t) => {
      const ms = t * total;
      if (ms < outMs) {
        const p = ease(ms / outMs);
        drawCar(g, mix(from.x, out.x, p), mix(from.y, out.y, p), from.angle, from.len, from.wid, car.color);
      } else {
        const p = ease((ms - outMs) / flyMs);
        drawCar(g, mix(out.x, to.x, p), mix(out.y, to.y, p), turn(from.angle, to.angle, p), mix(from.len, to.len, p), mix(from.wid, to.wid, p), car.color);
      }
    });
  }
  async function board(event) {
    const [fx, fy] = queueSpot(0);
    const [tx, ty] = bayCenter(event.slot);
    vis.queue.shift();
    vis.shiftAt = performance.now();
    await tween(150, (g, t) => {
      const p = ease(t);
      drawPerson(g, mix(fx, tx, p), mix(fy, ty, p) - Math.sin(p * Math.PI) * 14, event.color, 8);
    });
    const bay = vis.bays[event.slot];
    if (bay) bay.filled += 1;
    vis.score += PARK.PER_PASSENGER;
    hud();
  }
  async function depart(event) {
    const bay = vis.bays[event.slot];
    vis.bays[event.slot] = null;
    if (!bay) return;
    const car = core.cars[bay.id];
    const [bx, by] = bayCenter(event.slot);
    const cs = bayScale(car.len), len = car.len * cs - cs * 0.14, wid = cs * 0.8;
    await tween(260, (g, t) => drawCar(g, bx, mix(by, -80, ease(t) ** 2), ANGLE[0], len, wid, car.color, { alpha: 1 - t * 0.4 }));
  }
  async function move(id) {
    const mine = epoch;
    const car = core.cars[id];
    const result = sendCar(core, id);
    if (!result.ok) {
      if (result.reason === 'blocked') {
        marks.set(id, { kind: 'bad', until: performance.now() + 500 });
        marks.set(result.by, { kind: 'block', until: performance.now() + 700 });
        say('被挡住了，先挪走前面的车');
      } else if (result.reason === 'full') say('停车位满了，等乘客上车');
      return;
    }
    busy = true;
    marks.delete(id);
    await drive(car, result.slot);
    if (mine !== epoch || !alive) return;
    vis.bays[result.slot] = { id, filled: 0 };
    for (const event of settle(core)) {
      if (event.t === 'board') await board(event); else await depart(event);
      if (mine !== epoch || !alive) return;
    }
    busy = false;
    const state = outcome(core);
    if (state === 'won') return won();
    if (state === 'lost') return lost();
    if (pending !== null) { const next = pending; pending = null; tap(next); }
  }
  function say(text) {
    toast = { text, until: performance.now() + 1400 };
    poke(1500);
  }
  function tap(id) {
    if (!alive || !overlay.hidden) return;
    if (busy) { pending = id; return; }
    if (core.cars[id]?.status === 'board') move(id);
  }
  function carAt(x, y) {
    const c = Math.floor((x - lay.x) / lay.cell), r = Math.floor((y - lay.y) / lay.cell);
    if (r < 0 || c < 0 || r >= core.rows || c >= core.cols) return null;
    return core.cars.find((car) => car.status === 'board' && !vis.left.has(car.id) && car.r <= r && car.c <= c && (car.dir === 1 || car.dir === 3 ? r === car.r && c < car.c + car.len : c === car.c && r < car.r + car.len))?.id ?? null;
  }
  function onPointer(event) {
    const rect = canvas.getBoundingClientRect();
    const id = carAt((event.clientX - rect.left) * LW / rect.width, (event.clientY - rect.top) * LH / rect.height);
    if (id !== null) { event.preventDefault(); tap(id); }
  }
  canvas.addEventListener('pointerdown', onPointer);

  function hint() {
    if (!alive || busy || !overlay.hidden) return;
    const id = findHint(core);
    if (id === null) return say('这一步很难，试试别的车');
    marks.set(id, { kind: 'hint', until: performance.now() + 1800 });
    poke(1900);
  }

  // ---- end of a level ----
  function card(title, lines, label, action, cls = '') {
    overlay.replaceChildren();
    overlay.className = `park-overlay ${cls}`;
    const box = el('div', 'park-card');
    box.append(el('strong', '', title));
    for (const line of lines) box.append(el('p', '', line));
    const button = el('button', 'park-again', label);
    button.addEventListener('click', action);
    box.append(button);
    overlay.append(box);
    overlay.hidden = false;
    return box;
  }
  function won() {
    const bonus = stageBonus(core);
    const stage = core.stage;
    runScore += core.score + bonus;
    if (runScore > best) { best = runScore; writeCount(STORE.best, best); }
    const last = stage >= STAGES;
    const box = card(last ? '全部通关！' : `第 ${stage} 关完成`, [`乘客全部上车 · 关卡奖励 +${bonus}`, `总分 ${runScore} · 本机最佳 ${best}`], last ? '再来一局' : '下一关', last ? restart : () => begin(stage + 1, Date.now()), 'won');
    const note = el('p', 'park-note');
    box.insertBefore(note, box.lastChild);
    onResult?.('park', runScore).then((text) => { if (text && note.isConnected) note.textContent = text; });
  }
  function lost() {
    const stage = core.stage, seed = core.seed;
    const full = core.slots.every((id) => id !== null);
    card('停车场堵死了', [full ? '五个车位都停满了，前面的乘客找不到自己的车。' : '没有车能开出来了。', '这一关的布局不变，换个顺序再试一次。'], '重试本关', () => begin(stage, seed));
  }

  // ---- drawing ----
  function drawBoard(now) {
    const w = lay.cell * core.cols, h = lay.cell * core.rows;
    roundRect(ctx, lay.x - 6, lay.y - 6, w + 12, h + 12, 12);
    ctx.fillStyle = '#444b5e';
    ctx.fill();
    ctx.strokeStyle = '#ffffff12';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let c = 1; c < core.cols; c += 1) { ctx.moveTo(lay.x + c * lay.cell, lay.y); ctx.lineTo(lay.x + c * lay.cell, lay.y + h); }
    for (let r = 1; r < core.rows; r += 1) { ctx.moveTo(lay.x, lay.y + r * lay.cell); ctx.lineTo(lay.x + w, lay.y + r * lay.cell); }
    ctx.stroke();
    for (const car of core.cars) {
      if (car.status !== 'board' || vis.left.has(car.id)) continue;
      const pose = carPose(car), mark = marks.get(car.id);
      let { x, y } = pose;
      let glow = '';
      if (mark && mark.until > now) {
        if (mark.kind === 'bad') { const shake = Math.sin(now / 24) * 3; x += car.dir === 1 || car.dir === 3 ? 0 : shake; y += car.dir === 1 || car.dir === 3 ? shake : 0; glow = '#ff3b3b'; }
        else if (mark.kind === 'block') glow = '#ff3b3b';
        else glow = Math.sin(now / 120) > 0 ? '#ffffff' : '#ffd543';
      }
      drawCar(ctx, x, y, pose.angle, pose.len, pose.wid, car.color, { glow });
    }
  }
  function drawBays() {
    for (let i = 0; i < PARK.SLOTS; i += 1) {
      const x = bayX(i);
      roundRect(ctx, x, BAY.y, BAY.w, BAY.h, 10);
      ctx.fillStyle = '#2a3249';
      ctx.fill();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#ffffff33';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      const bay = vis.bays[i];
      if (!bay) continue;
      const car = core.cars[bay.id];
      const [cx, cy] = bayCenter(i), cs = bayScale(car.len);
      drawCar(ctx, cx, cy, ANGLE[0], car.len * cs - cs * 0.14, cs * 0.8, car.color);
      // one pip per seat, filled as passengers board
      const pip = Math.min(9, (BAY.w - 10) / car.cap);
      for (let s = 0; s < car.cap; s += 1) {
        ctx.beginPath();
        ctx.arc(x + BAY.w / 2 + (s - (car.cap - 1) / 2) * pip, BAY.y + BAY.h - 12, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = s < bay.filled ? PAL[car.color][0] : '#ffffff26';
        ctx.fill();
      }
    }
  }
  function drawQueue(now) {
    roundRect(ctx, 6, 6, LW - 12, 58, 12);
    ctx.fillStyle = '#232b40';
    ctx.fill();
    ctx.fillStyle = '#aeb5c4';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('候车区', 16, 20);
    ctx.textAlign = 'right';
    ctx.fillText(`还剩 ${vis.queue.length} 人`, LW - 16, 20);
    const shift = QUEUE.step * Math.max(0, 1 - (now - vis.shiftAt) / 110);
    ctx.save();
    roundRect(ctx, 10, 30, LW - 20, 30, 8);
    ctx.clip();
    vis.queue.slice(0, QUEUE.shown + 1).forEach((color, index) => {
      const [x, y] = queueSpot(index);
      drawPerson(ctx, x + shift, y + 2, color, 8, index === 0);
    });
    ctx.restore();
  }
  function frame(now) {
    raf = 0;
    if (!alive) return;
    for (let i = anims.length - 1; i >= 0; i -= 1) {
      if (now - anims[i].t0 >= anims[i].ms) { const [done] = anims.splice(i, 1); done.resolve(); }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    drawQueue(now);
    drawBays();
    drawBoard(now);
    for (const anim of anims) anim.draw(ctx, Math.min(1, (now - anim.t0) / anim.ms));
    if (toast && toast.until > now) {
      ctx.font = '800 14px system-ui, sans-serif';
      const width = ctx.measureText(toast.text).width + 28;
      roundRect(ctx, (LW - width) / 2, 174, width, 28, 14);
      ctx.fillStyle = '#000c';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(toast.text, LW / 2, 188);
    }
    const marking = [...marks.values()].some((mark) => mark.until > now) || (toast && toast.until > now);
    if (anims.length || marking || now < animUntil) raf = requestAnimationFrame(frame);
  }

  restart();
  return {
    get state() { return core; },
    get busy() { return busy; },
    restart,
    hint,
    // Where a car sits on the page, for tests that click it.
    locate(id) {
      const rect = canvas.getBoundingClientRect(), pose = carPose(core.cars[id]);
      return { x: rect.left + pose.x * rect.width / LW, y: rect.top + pose.y * rect.height / LH };
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      anims.splice(0).forEach((anim) => anim.resolve());
      canvas.removeEventListener('pointerdown', onPointer);
      wrap.replaceChildren();
    }
  };
}

