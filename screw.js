// 拧螺丝（ARCADE 24）的画面：上面两个螺丝盒、中间一排暂存孔、下面一堆半透明的彩色板子。
// 规则在 screw-core.js，点一下核心立刻算完；画面另存一份「看到的样子」（vis），按事件一件件回放：
// 螺丝转着飞进盒子或暂存孔，板子拧光就翻着掉下去，盒子装满就收走、下一盒滑进来。
import { ACTIVE, AREA, addHole, createLevel, findHint, isFree, left, outcome, tapScrew } from './screw-core.js';
import { CANDY, button, calm, canvasGame, inRect, orb, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const BOX_Y = 18;
const BOX_W = 140;
const BOX_H = 64;
const boxX = (slot) => W / 2 - BOX_W - 8 + slot * (BOX_W + 16);
const TRAY_Y = 112;
const OX = (W - AREA.w) / 2;
const OY = 176;
const ADD_BTN = { x: 118, y: 580, w: 124, h: 40 };
// 亚克力板的三种色：板面、高光、边缘
const TINTS = [
  ['#7fb2ff', '#d4e6ff', '#3f6fcc'], ['#ff9fd0', '#ffdcee', '#c4528f'], ['#7fe3ab', '#d6f9e4', '#2f9e63'],
  ['#ffd86b', '#fff3c4', '#c39a1c'], ['#b89cff', '#e8dfff', '#6f4fd0'], ['#6fe0e6', '#d0f8fa', '#239aa1']
];
const SAVE = store('pao-screw');

// 半透明亚克力板：投在下层的影子、底边一道厚度、斜向反光和内圈高光。板面保持半透明，下层的螺丝还能隐约看见。
function drawPlate(ctx, x, y, w, h, tint, { shadow = true } = {}) {
  const [base, light, edge] = TINTS[tint];
  const r = Math.min(14, w / 2, h / 2);
  ctx.save();
  // 影子单独画（形状挪到画面外，只让影子落回来），不让板子本身叠两层颜色。
  // 影子的偏移和模糊按设备像素算、不跟坐标变换走，所以乘上缩放；带旋转时不画。
  if (shadow) {
    const k = ctx.getTransform().a;
    ctx.shadowColor = '#05081c66';
    ctx.shadowBlur = 12 * k;
    ctx.shadowOffsetX = 10000 * k;
    ctx.shadowOffsetY = 7 * k;
    roundRect(ctx, x - 10000, y, w, h, r);
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.shadowColor = 'transparent';
  }
  // 厚度：只露出板面下沿的一条边
  if (ctx.roundRect) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x - 2, y + h / 2, w + 4, h); ctx.clip();
    ctx.beginPath();
    ctx.roundRect(x, y + 4, w, h, r);
    ctx.roundRect(x, y, w, h, r);
    ctx.fillStyle = `${edge}e0`; ctx.fill('evenodd');
    ctx.restore();
  }
  // 板面
  roundRect(ctx, x, y, w, h, r);
  const g = ctx.createLinearGradient(x, y, x + w * 0.5, y + h);
  g.addColorStop(0, `${light}e0`); g.addColorStop(0.5, `${base}c8`); g.addColorStop(1, `${base}b8`);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = `${edge}dd`; ctx.stroke();
  ctx.clip();
  // 斜向反光
  const sx = x + w * 0.22, lean = h * 0.55;
  ctx.beginPath();
  ctx.moveTo(sx, y); ctx.lineTo(sx + 16, y); ctx.lineTo(sx + 16 - lean, y + h); ctx.lineTo(sx - lean, y + h); ctx.closePath();
  ctx.moveTo(sx + 24, y); ctx.lineTo(sx + 30, y); ctx.lineTo(sx + 30 - lean, y + h); ctx.lineTo(sx + 24 - lean, y + h); ctx.closePath();
  ctx.fillStyle = '#ffffff24'; ctx.fill();
  // 内圈高光和上沿亮条
  roundRect(ctx, x + 2, y + 2, w - 4, h - 4, r - 2);
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffff8c'; ctx.stroke();
  roundRect(ctx, x + 9, y + 4.5, w - 18, 4, 2);
  ctx.fillStyle = '#ffffff70'; ctx.fill();
  ctx.restore();
}
// 板上的螺丝孔：凹下去的一圈，下沿受光；螺丝拧走后就是一个透空的孔。
function drawHole(ctx, x, y, empty) {
  ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x, y - 3, 4, x, y, 14);
  g.addColorStop(0, empty ? '#0b0f2488' : '#00000048'); g.addColorStop(1, empty ? '#0b0f2450' : '#00000020');
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 13.5, Math.PI * 0.15, Math.PI * 0.85);
  ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffff80'; ctx.stroke();
}
// 工作台底板上的一排排小孔，缓存成图案只画一次
const pegs = new WeakMap();
function pegboard(ctx) {
  if (!pegs.has(ctx)) {
    const tile = document.createElement('canvas');
    tile.width = tile.height = 20;
    const g = tile.getContext('2d');
    g.fillStyle = '#ffffff12';
    g.beginPath(); g.arc(10, 10, 1.8, 0, Math.PI * 2); g.fill();
    pegs.set(ctx, ctx.createPattern(tile, 'repeat'));
  }
  return pegs.get(ctx);
}

function drawScrew(ctx, x, y, color, { r = 11, spin = 0, dim = false, ring = false } = {}) {
  ctx.save();
  if (ring) { ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = 2; ctx.stroke(); }
  orb(ctx, x, y, r, CANDY[color], { alpha: dim ? 0.55 : 1 });
  ctx.translate(x, y);
  ctx.rotate(spin);
  ctx.strokeStyle = dim ? '#00000055' : '#00000088';
  ctx.lineWidth = Math.max(1.5, r * 0.22);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.5, 0); ctx.lineTo(r * 0.5, 0);
  ctx.moveTo(0, -r * 0.5); ctx.lineTo(0, r * 0.5);
  ctx.stroke();
  ctx.restore();
}

export function mountScrew(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '拧螺丝游戏画布', game: 'screw' });
  let state = null;
  let vis = null;
  let queue = [];
  let playing = false;
  let flights = [];
  let falls = [];
  let departs = [];
  let hint = null;
  let progress = SAVE.get({ level: 1, best: 0 });

  const hud = () => onHud(`第 ${state.level} 关 · 还剩 ${left(state)} 颗`);
  function begin(level, seed) {
    shell.closeCard();
    state = createLevel(level, seed);
    vis = { boxes: state.active.map((b) => b && { color: b.color, n: 0, t0: 0 }), tray: [], board: new Set(state.screws.map((s) => s.id)), fallen: new Set() };
    queue = []; playing = false; flights = []; falls = []; departs = []; hint = null;
    hud();
    shell.poke(100);
  }

  // ---- positions ----
  const holeXY = (slot, index) => [boxX(slot) + 34 + index * 36, BOX_Y + BOX_H / 2 + 6];
  const trayXY = (index) => { const n = state.holes, step = Math.min(50, (W - 40) / n); return [W / 2 + (index - (n - 1) / 2) * step, TRAY_Y + 22]; };
  const boardXY = (screw) => [OX + screw.x, OY + screw.y];

  // ---- playback ----
  // 排队的事件多了就加快回放，连点也不会越拖越久；减少动态效果时一律快放。
  const pace = (ms) => Math.round(ms * (calm() ? 0.25 : queue.length > 6 ? 0.35 : queue.length > 2 ? 0.6 : 1));
  const fly = (id, from, to, wait) => new Promise((resolve) => {
    const ms = pace(wait);
    const flight = { id, from, to, t0: performance.now(), ms, color: state.screws[id].color };
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
      if (ev.type === 'to-box') {
        vis.board.delete(ev.id);
        const box = vis.boxes[ev.slot];
        await fly(ev.id, boardXY(state.screws[ev.id]), holeXY(ev.slot, box ? box.n : 0), 260);
        if (vis.boxes[ev.slot]) vis.boxes[ev.slot].n += 1;
      } else if (ev.type === 'to-tray') {
        vis.board.delete(ev.id);
        await fly(ev.id, boardXY(state.screws[ev.id]), trayXY(vis.tray.length), 240);
        vis.tray.push(ev.id);
      } else if (ev.type === 'fall') {
        vis.fallen.add(ev.plate);
        falls.push({ plate: state.plates[ev.plate], t0: performance.now(), spin: Math.random() > 0.5 ? 1 : -1 });
        shell.poke(800);
      } else if (ev.type === 'box-done') {
        const box = vis.boxes[ev.slot];
        vis.boxes[ev.slot] = null;
        if (box) departs.push({ slot: ev.slot, color: box.color, t0: performance.now() });
        shell.poke(400);
        await shell.tween(pace(220));
      } else if (ev.type === 'box-new') {
        vis.boxes[ev.slot] = { color: ev.color, n: 0, t0: performance.now() };
        shell.poke(300);
        await shell.tween(pace(180));
      } else if (ev.type === 'tray-to-box') {
        const index = vis.tray.indexOf(ev.id);
        const from = trayXY(Math.max(0, index));
        vis.tray = vis.tray.filter((x) => x !== ev.id);
        const box = vis.boxes[ev.slot];
        await fly(ev.id, from, holeXY(ev.slot, box ? box.n : 0), 220);
        if (vis.boxes[ev.slot]) vis.boxes[ev.slot].n += 1;
      }
    }
    playing = false;
    if (state !== mine || !shell.alive) return;
    const end = outcome(state);
    if (end !== 'playing' && !shell.cardOpen) setTimeout(() => { if (shell.alive && state === mine && outcome(state) === end && !shell.cardOpen) finish(end); }, 300);
  }
  function tap(id) {
    if (shell.cardOpen || outcome(state) !== 'playing') return false;
    const events = tapScrew(state, id);
    if (!events) {
      if (state.screws[id]?.where === 'board' && !isFree(state, id)) shell.toast('被上面的板子挡住了', 900, 150);
      else if (state.tray.length >= state.holes) shell.toast('暂存孔满了', 900, 150);
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
    if (inRect(p, ADD_BTN)) return api.addHole();
    // 离手指最近的、上面没东西挡着的螺丝优先
    let best = null, dist = 24;
    for (const s of state.screws) {
      if (s.where !== 'board') continue;
      const [x, y] = boardXY(s), d = Math.hypot(p.x - x, p.y - y) - (isFree(state, s.id) ? 6 : 0);
      if (d < dist) { dist = d; best = s.id; }
    }
    if (best !== null) tap(best);
  });

  function finish(end) {
    if (end === 'won') {
      const level = state.level;
      progress = { level: level + 1, best: Math.max(progress.best, level) };
      SAVE.set(progress);
      const { note } = shell.card({ title: `第 ${level} 关完成`, lines: [`拧了 ${state.moves} 颗螺丝`, `最高通关 第 ${progress.best} 关`], buttons: [{ label: '下一关', action: () => begin(level + 1) }], tone: 'won' });
      postScore(onResult, 'screw', level, note);
    } else {
      const { level, seed } = state;
      const buttons = [{ label: '重试本关', action: () => begin(level, seed) }];
      if (state.extra > 0) buttons.push({ label: '加一个孔继续', ghost: true, action: () => { shell.closeCard(); api.addHole(); } });
      shell.card({ title: '暂存孔满了', lines: ['没有同色盒子的螺丝都会进暂存孔。先拧颜色对得上盒子的，或者先拆开盖在上面的板子。'], buttons, tone: 'lost' });
    }
  }

  // ---- drawing ----
  function drawBox(ctx, x, y, color, n, alpha = 1) {
    const [base, light, dark] = CANDY[color];
    ctx.save();
    ctx.globalAlpha = alpha;
    roundRect(ctx, x, y + 6, BOX_W, BOX_H - 4, 14);
    ctx.fillStyle = dark; ctx.fill();
    roundRect(ctx, x, y, BOX_W, BOX_H - 6, 14);
    const g = ctx.createLinearGradient(0, y, 0, y + BOX_H);
    g.addColorStop(0, light); g.addColorStop(0.4, base); g.addColorStop(1, base);
    ctx.fillStyle = g; ctx.fill();
    for (let i = 0; i < 3; i += 1) {
      const hx = x + 34 + i * 36, hy = y + BOX_H / 2 + 6 - 6;
      ctx.beginPath(); ctx.arc(hx, hy + 6, 12, 0, Math.PI * 2); ctx.fillStyle = '#00000040'; ctx.fill();
      if (i < n) drawScrew(ctx, hx, hy + 6, color, { r: 11 });
    }
    ctx.restore();
  }
  shell.render = (ctx, now) => {
    // 螺丝盒
    for (let slot = 0; slot < ACTIVE; slot += 1) {
      const box = vis.boxes[slot];
      if (!box) { roundRect(ctx, boxX(slot), BOX_Y, BOX_W, BOX_H - 6, 14); ctx.strokeStyle = '#ffffff22'; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]); continue; }
      const k = Math.min(1, (now - box.t0) / 200);
      drawBox(ctx, boxX(slot), BOX_Y - (1 - k) * 40, box.color, box.n, k);
    }
    departs = departs.filter((d) => now - d.t0 < 380);
    for (const d of departs) { const k = (now - d.t0) / 380; drawBox(ctx, boxX(d.slot), BOX_Y - k * 70, d.color, 3, 1 - k); }
    text(ctx, `还有 ${state.queue.length} 盒`, W / 2, BOX_Y + BOX_H + 8, { size: 11, color: '#b9bde6', weight: 700 });
    // 暂存孔
    for (let i = 0; i < state.holes; i += 1) {
      const [x, y] = trayXY(i);
      ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#0b0f24'; ctx.fill();
      ctx.strokeStyle = i >= 5 ? '#ffd54388' : '#ffffff26'; ctx.lineWidth = 2; ctx.stroke();
      const id = vis.tray[i];
      if (id !== undefined) drawScrew(ctx, x, y, state.screws[id].color, { r: 11 });
    }
    // 板子：按层画，螺丝跟着自己的板子画，上层半透明的板子会盖在下层螺丝上
    roundRect(ctx, OX - 10, OY - 10, AREA.w + 20, AREA.h + 20, 18);
    ctx.fillStyle = '#ffffff0c'; ctx.fill();
    ctx.fillStyle = pegboard(ctx); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff14'; ctx.stroke();
    const plates = state.plates.filter((p) => !vis.fallen.has(p.id)).sort((a, b) => a.z - b.z || a.id - b.id);
    const hintOn = hint !== null && now < hint.until && Math.sin(now / 110) > -0.2;
    for (const plate of plates) {
      drawPlate(ctx, OX + plate.x, OY + plate.y, plate.w, plate.h, plate.tint);
      for (const s of state.screws) {
        if (s.plate !== plate.id) continue;
        const [x, y] = boardXY(s), on = vis.board.has(s.id);
        drawHole(ctx, x, y, !on);
        if (!on) continue;
        ctx.beginPath(); ctx.arc(x + 1, y + 2.5, 11, 0, Math.PI * 2); ctx.fillStyle = '#00000038'; ctx.fill();
        drawScrew(ctx, x, y, s.color, { r: 11, ring: hintOn && hint.id === s.id });
      }
    }
    // 掉下去的板子
    falls = falls.filter((f) => now - f.t0 < 700);
    for (const f of falls) {
      const k = (now - f.t0) / 700, p = f.plate;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.translate(OX + p.x + p.w / 2, OY + p.y + p.h / 2 + k * k * 420);
      ctx.rotate(f.spin * k * 0.9);
      drawPlate(ctx, -p.w / 2, -p.h / 2, p.w, p.h, p.tint, { shadow: false });
      for (const s of state.screws) if (s.plate === p.id) drawHole(ctx, s.x - p.x - p.w / 2, s.y - p.y - p.h / 2, true);
      ctx.restore();
    }
    // 飞行中的螺丝：边飞边转
    for (const f of flights) {
      const t = Math.min(1, (now - f.t0) / f.ms), e = 1 - (1 - t) ** 2;
      const x = f.from[0] + (f.to[0] - f.from[0]) * e, y = f.from[1] + (f.to[1] - f.from[1]) * e - Math.sin(t * Math.PI) * 40;
      drawScrew(ctx, x, y, f.color, { r: 11 + Math.sin(t * Math.PI) * 3, spin: t * Math.PI * 4 });
    }
    button(ctx, ADD_BTN, '＋ 加一个孔', { off: state.extra <= 0, badge: state.extra });
    if (flights.length || falls.length || departs.length || hintOn || vis.boxes.some((b) => b && now - b.t0 < 200)) shell.poke(16);
  };

  const api = {
    get state() { return state; },
    get playing() { return playing; },
    board: 'screw',
    restart() { begin(state.level, state.seed); },
    hint() {
      if (shell.cardOpen) return;
      const id = findHint(state);
      if (id === null) return;
      hint = { id, until: performance.now() + 1800 };
      shell.poke(1850);
    },
    addHole() {
      if (!addHole(state)) return shell.toast('本关已经加过了', 1000, 150);
      shell.poke();
      if (outcome(state) === 'playing' && shell.cardOpen) shell.closeCard();
    },
    tap,
    goto(level, seed) { begin(level, seed); },
    locate(id) { const [x, y] = boardXY(state.screws[id]); return shell.page(x, y); },
    destroy() { shell.destroy(); }
  };
  begin(progress.level || 1);
  return api;
}
