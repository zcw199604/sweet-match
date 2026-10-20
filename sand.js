// 沙画消消（ARCADE 25）的画面：一瓶分层的彩色流沙，中间一条传送带，下面三列沙桶。
// 规则在 sand-core.js；这里每 33 毫秒推进一拍，把沙子画成一张小图再放大，吸沙时画一道道沙流飞进桶里。
import { BELT, COLS, LANES, ROWS, addSlot, createLevel, outcome, sandLeft, send, step } from './sand-core.js';
import { CANDY, canvasGame, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const G = 8;
const BX = (W - COLS * G) / 2;
const BY = 34;
const BELT_Y = 404;
const LANE_X = [72, 180, 288];
const LANE_Y = 506;
const SAVE = store('pao-sand');
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const RGB = CANDY.map(([base]) => hexRgb(base));

function bucket(ctx, x, y, w, h, color, got, cap, { glow = false, alpha = 1 } = {}) {
  const [base, light, dark] = CANDY[color];
  ctx.save();
  ctx.globalAlpha = alpha;
  const shape = () => { ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w * 0.4, y + h); ctx.lineTo(x - w * 0.4, y + h); ctx.closePath(); };
  if (glow) { ctx.shadowColor = '#ffd543'; ctx.shadowBlur = 14; }
  shape(); ctx.fillStyle = '#f4efe6'; ctx.fill();
  ctx.shadowBlur = 0;
  // 吸进去的沙子从底往上堆
  const k = cap ? Math.min(1, got / cap) : 0;
  if (k > 0) {
    ctx.save(); shape(); ctx.clip();
    ctx.fillStyle = base; ctx.fillRect(x - w / 2, y + h * (1 - k), w, h * k);
    ctx.restore();
  }
  shape(); ctx.lineWidth = 3; ctx.strokeStyle = dark; ctx.stroke();
  roundRect(ctx, x - w / 2 - 3, y - 5, w + 6, 8, 4); ctx.fillStyle = base; ctx.fill();
  ctx.fillStyle = light; ctx.fillRect(x - w / 2 + 3, y - 3, w * 0.4, 2);
  text(ctx, String(Math.max(0, cap - got)), x, y + h * 0.55, { size: Math.max(11, w * 0.28), color: '#2a2440' });
  ctx.restore();
}

export function mountSand(wrap, { onHud = () => {}, onResult = null, onButtons = () => {} } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '沙画消消游戏画布', game: 'sand' });
  const pixels = document.createElement('canvas');
  pixels.width = COLS; pixels.height = ROWS;
  const pctx = pixels.getContext('2d');
  const image = pctx.createImageData(COLS, ROWS);
  const noise = Float32Array.from({ length: COLS * ROWS }, (_, i) => 0.86 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.22);
  let state = null;
  let loading = true;
  let streams = [];
  let leaving = [];
  let beltShift = 0;
  let progress = SAVE.get({ level: 1, best: 0 });
  let timer = 0;

  const hud = () => onHud(state ? `第 ${state.level} 关 · 剩 ${sandLeft(state)} 粒` : '正在铺沙画……');
  const labels = () => onButtons({ slot: state ? `加一格 ${state.extra}` : '加一格' });
  function begin(level, seed) {
    shell.closeCard();
    loading = true;
    state = null;
    hud();
    shell.poke();
    // 生成时要模拟玩一遍，可能要几百毫秒：先画一帧「正在铺沙画」再算
    setTimeout(() => {
      if (!shell.alive) return;
      state = createLevel(level, seed);
      loading = false;
      streams = []; leaving = [];
      hud(); labels();
      shell.poke();
    }, 30);
  }
  const slotX = (slot) => W / 2 + (slot - (state.beltSize - 1) / 2) * 60;

  function tick() {
    if (!state || loading || shell.cardOpen || document.hidden || outcome(state) !== 'playing') return;
    const { sucked, done } = step(state);
    const now = performance.now();
    for (const s of sucked) streams.push({ x0: BX + s.x * G + G / 2, slot: s.slot, color: state.belt[s.slot]?.color ?? done.find((d) => d.slot === s.slot)?.color ?? 0, t0: now });
    for (const d of done) leaving.push({ ...d, x: slotX(d.slot), t0: now });
    beltShift = (beltShift + 1.2) % 24;
    if (sucked.length || done.length) hud();
    shell.poke(60);
    const end = outcome(state);
    if (end !== 'playing') setTimeout(() => { if (shell.alive && state && outcome(state) === end && !shell.cardOpen) finish(end); }, 400);
  }
  timer = setInterval(tick, 33);

  function tapLane(lane) {
    if (!state || loading || shell.cardOpen) return false;
    const result = send(state, lane);
    if (!result) {
      if (state.lanes[lane]?.length) shell.toast('传送带满了，等桶吸满再放', 1100, BELT_Y - 20);
      return false;
    }
    if (result.merged >= 0) shell.toast('三个同色桶合成一个！', 900, BELT_Y - 20);
    shell.poke(200);
    return true;
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    if (!state || shell.cardOpen) return;
    const p = shell.point(event);
    if (p.y < LANE_Y - 30) return;
    const lane = LANE_X.findIndex((x) => Math.abs(p.x - x) < 54);
    if (lane >= 0) tapLane(lane);
  });

  function finish(end) {
    if (end === 'won') {
      const level = state.level;
      progress = { level: level + 1, best: Math.max(progress.best, level) };
      SAVE.set(progress);
      const { note } = shell.card({ title: `第 ${level} 关完成`, lines: [`沙画吸干净了 · 用了 ${state.sent} 个桶`, `最高通关 第 ${progress.best} 关`], buttons: [{ label: '下一关', action: () => begin(level + 1) }], tone: 'won' });
      postScore(onResult, 'sand', level, note);
    } else {
      const { level, seed } = state;
      const buttons = [{ label: '重试本关', action: () => begin(level, seed) }];
      if (state.extra > 0) buttons.push({ label: '加一格继续', ghost: true, action: () => { shell.closeCard(); api.slot(); } });
      shell.card({ title: '传送带堵住了', lines: ['传送带上的桶都吸不到自己颜色的沙子。先看底下露出来的是什么颜色，再放对应的桶。'], buttons, tone: 'lost' });
    }
  }

  shell.render = (ctx, now) => {
    // 瓶子
    roundRect(ctx, BX - 8, BY - 8, COLS * G + 16, ROWS * G + 16, 18);
    ctx.fillStyle = '#ffffff12'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff40'; ctx.stroke();
    if (!state) { text(ctx, '正在铺沙画……', W / 2, BY + ROWS * G / 2, { size: 16, color: '#c9cdf0' }); return; }
    const data = image.data;
    for (let i = 0; i < COLS * ROWS; i += 1) {
      const c = state.grid[i], o = i * 4;
      if (c < 0) { data[o + 3] = 0; continue; }
      const [r, g, b] = RGB[c], n = noise[i];
      data[o] = Math.min(255, r * n); data[o + 1] = Math.min(255, g * n); data[o + 2] = Math.min(255, b * n); data[o + 3] = 255;
    }
    pctx.putImageData(image, 0, 0);
    ctx.save();
    roundRect(ctx, BX, BY, COLS * G, ROWS * G, 12);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixels, BX, BY, COLS * G, ROWS * G);
    ctx.restore();
    // 吸沙口：瓶底一条亮线
    ctx.fillStyle = '#ffffff30';
    ctx.fillRect(BX, BY + ROWS * G - 2 * G, COLS * G, 1);
    // 传送带
    roundRect(ctx, 10, BELT_Y, W - 20, 64, 14);
    ctx.fillStyle = '#2b2f4f'; ctx.fill();
    ctx.save();
    roundRect(ctx, 10, BELT_Y, W - 20, 64, 14); ctx.clip();
    ctx.strokeStyle = '#ffffff12'; ctx.lineWidth = 6;
    for (let x = -24 + beltShift; x < W; x += 24) { ctx.beginPath(); ctx.moveTo(x, BELT_Y + 64); ctx.lineTo(x + 18, BELT_Y); ctx.stroke(); }
    ctx.restore();
    for (let slot = 0; slot < state.beltSize; slot += 1) {
      const x = slotX(slot), b = state.belt[slot];
      if (!b) { roundRect(ctx, x - 24, BELT_Y + 12, 48, 42, 8); ctx.strokeStyle = slot >= BELT ? '#ffd54366' : '#ffffff26'; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]); continue; }
      bucket(ctx, x, BELT_Y + 14, 46, 40, b.color, b.got, b.cap, { glow: Boolean(b.merged) });
    }
    leaving = leaving.filter((l) => now - l.t0 < 400);
    for (const l of leaving) { const k = (now - l.t0) / 400; bucket(ctx, l.x, BELT_Y + 14 - k * 40, 46, 40, l.color, 1, 1, { alpha: 1 - k }); }
    // 沙流：从瓶底飞向桶
    streams = streams.filter((s) => now - s.t0 < 260);
    for (const s of streams) {
      const k = (now - s.t0) / 260;
      const x = s.x0 + (slotX(s.slot) - s.x0) * k, y = BY + ROWS * G + (BELT_Y + 20 - BY - ROWS * G) * k;
      ctx.fillStyle = CANDY[s.color][0];
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
    // 三列沙桶
    for (let lane = 0; lane < LANES; lane += 1) {
      const list = state.lanes[lane], x = LANE_X[lane];
      roundRect(ctx, x - 52, LANE_Y - 22, 104, 128, 14);
      ctx.fillStyle = '#ffffff0c'; ctx.fill();
      list.slice(1, 3).forEach((b, k) => bucket(ctx, x, LANE_Y + 50 + k * 26, 36, 22, b.color, 0, b.cap, { alpha: 0.6 - k * 0.2 }));
      if (list[0]) bucket(ctx, x, LANE_Y - 4, 64, 54, list[0].color, 0, list[0].cap);
      if (list.length > 3) text(ctx, `+${list.length - 3}`, x + 40, LANE_Y + 96, { size: 11, color: '#b9bde6' });
    }
    if (streams.length || leaving.length) shell.poke(16);
  };

  const api = {
    get state() { return state; },
    get loading() { return loading; },
    board: 'sand',
    restart() { if (state) begin(state.level, state.seed); },
    slot() {
      if (!state || !addSlot(state)) return shell.toast('本关已经加过了', 1000, BELT_Y - 20);
      labels();
      shell.poke();
    },
    tapLane,
    // 测试用：快进若干拍
    advance(n) { for (let i = 0; i < n && state && outcome(state) === 'playing'; i += 1) step(state); tick(); },
    goto(level, seed) { begin(level, seed); },
    locateLane(lane) { return shell.page(LANE_X[lane], LANE_Y + 10); },
    destroy() { clearInterval(timer); shell.destroy(); }
  };
  begin(progress.level || 1);
  return api;
}
