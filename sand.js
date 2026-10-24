// 沙画消消（ARCADE 25）的画面：一只玻璃瓶里装着分层的彩色流沙，中间一条传送带，下面三列沙桶。
// 规则在 sand-core.js；这里每 33 毫秒推进一拍。沙子先画到一张小图（每格拆成 2×2 粒、各自深浅不同）再放大，
// 吸沙时画一道道沙流飞进桶里，桶装满飞走时撒一把沙粒。
import { BELT, COLS, LANES, ROWS, SUCK_ROWS, addSlot, createLevel, outcome, sandLeft, send, step } from './sand-core.js';
import { CANDY, calm, canvasGame, easeOut, mix, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const G = 4;
const SUB = 2;
const BX = (W - COLS * G) / 2;
const BY = 34;
const BW = COLS * G;
const BH = ROWS * G;
const BELT_Y = 404;
const LANE_X = [72, 180, 288];
const LANE_Y = 506;
const SAVE = store('pao-sand');
const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const rgbHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const blend = (a, b, t) => rgbHex(hexRgb(a).map((v, i) => mix(v, hexRgb(b)[i], t)));
const RGB = CANDY.map(([base]) => hexRgb(base));
const LIGHT = CANDY.map(([, light]) => hexRgb(light));
const hash = (i, k) => { const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };

// 沙桶：带提手的小铁桶，桶口能看到吸进去的沙，桶身贴着还要装多少粒。shade 把颜色压暗（排队里靠后的桶）。
function pail(ctx, x, y, w, h, color, { got = 0, cap = 0, label = true, handle = true, shade = 0, glow = '', alpha = 1 } = {}) {
  const [base, light, dark] = CANDY[color].map((c) => (shade ? blend(c, '#1c1833', shade) : c));
  const bw = w * 0.76, rh = w * 0.26;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath(); ctx.ellipse(x, y + h + 1, bw * 0.56, rh * 0.3, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#00000040'; ctx.fill();
  if (handle) {
    ctx.beginPath(); ctx.ellipse(x, y, w * 0.5, w * 0.36, 0, Math.PI, 0);
    ctx.lineWidth = Math.max(1.5, w * 0.05); ctx.strokeStyle = dark; ctx.stroke();
  }
  const body = () => {
    ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - bw / 2, y + h);
    ctx.quadraticCurveTo(x, y + h + rh * 0.55, x + bw / 2, y + h); ctx.lineTo(x + w / 2, y); ctx.closePath();
  };
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 16; }
  const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  g.addColorStop(0, dark); g.addColorStop(0.2, base); g.addColorStop(0.34, light); g.addColorStop(0.52, base); g.addColorStop(1, dark);
  body(); ctx.fillStyle = g; ctx.fill();
  ctx.shadowBlur = 0;
  for (const t of [0.24, 0.8]) {
    const wt = mix(w, bw, t), yy = y + h * t;
    ctx.beginPath(); ctx.moveTo(x - wt / 2, yy); ctx.quadraticCurveTo(x, yy + rh * 0.35, x + wt / 2, yy);
    ctx.lineWidth = 1.2; ctx.strokeStyle = `${dark}99`; ctx.stroke();
  }
  body(); ctx.lineWidth = 1.5; ctx.strokeStyle = dark; ctx.stroke();
  // 桶口：里面暗，吸了沙就露出沙面，快满时冒尖
  ctx.beginPath(); ctx.ellipse(x, y, w / 2, rh / 2, 0, 0, Math.PI * 2);
  ctx.fillStyle = blend(dark, '#000000', 0.45); ctx.fill();
  const k = cap ? Math.min(1, got / cap) : 0;
  if (k > 0) {
    ctx.save(); ctx.globalAlpha *= Math.min(1, 0.4 + k);
    ctx.beginPath(); ctx.ellipse(x, y + rh * 0.12 * (1 - k), w * 0.43, rh * 0.36, 0, 0, Math.PI * 2);
    ctx.fillStyle = base; ctx.fill();
    if (k > 0.5) {
      ctx.beginPath(); ctx.moveTo(x - w * 0.38, y); ctx.quadraticCurveTo(x, y - rh * 1.8 * (k - 0.5), x + w * 0.38, y);
      ctx.fillStyle = base; ctx.fill();
    }
    ctx.fillStyle = light;
    for (let i = 0; i < 4; i += 1) ctx.fillRect(x - w * 0.25 + i * w * 0.15, y - rh * 0.1 - (k > 0.5 ? rh * 0.5 * (k - 0.5) : 0) + (i % 2) * 2, 1.5, 1.5);
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(x, y, w / 2, rh / 2, 0, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1.5, w * 0.06); ctx.strokeStyle = light; ctx.stroke();
  if (handle) for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(x + s * w * 0.5, y + 1, Math.max(1.5, w * 0.05), 0, Math.PI * 2); ctx.fillStyle = dark; ctx.fill(); }
  if (label) {
    const n = String(Math.max(0, cap - got)), size = Math.max(9, w * 0.27);
    ctx.font = `800 ${size}px Manrope, system-ui, sans-serif`;
    const pw = ctx.measureText(n).width + size * 0.9, ph = size * 1.25;
    roundRect(ctx, x - pw / 2, y + h * 0.56 - ph / 2, pw, ph, ph / 2);
    ctx.fillStyle = shade ? blend('#ffffff', '#1c1833', shade * 0.8) : '#fffffff0'; ctx.fill();
    text(ctx, n, x, y + h * 0.56 + 0.5, { size, color: shade ? blend('#2a2440', '#1c1833', shade) : '#2a2440' });
  }
  ctx.restore();
}

export function mountSand(wrap, { onHud = () => {}, onResult = null, onButtons = () => {} } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '沙画消消游戏画布', game: 'sand' });
  const PW = COLS * SUB, PH = ROWS * SUB;
  const pixels = document.createElement('canvas');
  pixels.width = PW; pixels.height = PH;
  const pctx = pixels.getContext('2d');
  const image = pctx.createImageData(PW, PH);
  // 每一小粒固定的深浅、偏亮色的程度，和少数闪光的粒
  const bright = Float32Array.from({ length: PW * PH }, (_, i) => 0.82 + hash(i, 1) * 0.24);
  const tint = Float32Array.from({ length: PW * PH }, (_, i) => (hash(i, 2) < 0.22 ? hash(i, 3) * 0.55 : 0));
  const glint = Uint8Array.from({ length: PW * PH }, (_, i) => (hash(i, 4) < 0.025 ? 1 : 0));
  let state = null;
  let loading = true;
  let streams = [];
  let leaving = [];
  let bursts = [];
  const flying = new WeakMap();
  let flyUntil = 0;
  let beltShift = 0;
  let progress = SAVE.get({ level: 1, best: 0 });
  let timer = 0;

  // 沙子有好几千粒，顶栏只报吸掉了百分之几，手机竖屏也不折行
  const hud = () => onHud(state ? `第 ${state.level} 关 · 已吸 ${Math.floor((1 - sandLeft(state) / state.total) * 100)}%` : '正在铺沙画……');
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
      streams = []; leaving = []; bursts = [];
      hud(); labels();
      shell.poke();
    }, 30);
  }
  const slotX = (slot) => W / 2 + (slot - (state.beltSize - 1) / 2) * 60;
  function scatter(x, y, color, n) {
    if (calm()) return;
    const now = performance.now();
    for (let i = 0; i < n; i += 1) {
      const a = Math.PI * (1.1 + Math.random() * 0.8), v = 0.05 + Math.random() * 0.09;
      bursts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: 1.2 + Math.random() * 1.6, color, t0: now });
    }
  }

  function tick() {
    if (!state || loading || shell.cardOpen || document.hidden || outcome(state) !== 'playing') return;
    const { sucked, done } = step(state);
    const now = performance.now();
    for (const s of sucked) streams.push({ x0: BX + s.x * G + G / 2, slot: s.slot, color: state.belt[s.slot]?.color ?? done.find((d) => d.slot === s.slot)?.color ?? 0, t0: now });
    for (const d of done) { leaving.push({ ...d, x: slotX(d.slot), t0: now }); scatter(slotX(d.slot), BELT_Y + 20, d.color, 14); }
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
    const placed = state.belt[result.slot];
    if (placed) { flying.set(placed, { x: LANE_X[lane], y: LANE_Y + 6, t0: performance.now() }); flyUntil = performance.now() + 240; }
    if (result.merged >= 0) {
      shell.toast('三个同色桶合成一个！', 900, BELT_Y - 20);
      scatter(slotX(result.merged), BELT_Y + 20, 3, 16);
    }
    shell.poke(260);
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

  function drawSand(ctx) {
    const data = image.data, grid = state.grid;
    for (let i = 0; i < COLS * ROWS; i += 1) {
      const c = grid[i], x = i % COLS, y = (i - x) / COLS;
      const surface = c >= 0 && (y === 0 || grid[i - COLS] < 0);
      for (let sy = 0; sy < SUB; sy += 1) for (let sx = 0; sx < SUB; sx += 1) {
        const p = (y * SUB + sy) * PW + x * SUB + sx, o = p * 4;
        if (c < 0) { data[o + 3] = 0; continue; }
        const [r, g, b] = RGB[c], [lr, lg, lb] = LIGHT[c], t = glint[p] ? 0.8 : tint[p];
        const n = bright[p] * (surface ? (sy === 0 ? 1.2 : 1.07) : 1);
        data[o] = Math.min(255, mix(r, lr, t) * n); data[o + 1] = Math.min(255, mix(g, lg, t) * n); data[o + 2] = Math.min(255, mix(b, lb, t) * n); data[o + 3] = 255;
      }
    }
    pctx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(pixels, BX, BY, BW, BH);
    ctx.imageSmoothingEnabled = true;
  }

  // 玻璃瓶：后壁、沙子、瓶底的吸沙光带、两侧的弧面暗影和高光、瓶口
  function drawBottle(ctx, now) {
    const ox = BX - 8, oy = BY - 8, ow = BW + 16, oh = BH + 16;
    ctx.beginPath(); ctx.ellipse(W / 2, oy + oh - 1, ow * 0.46, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#00000055'; ctx.fill();
    const back = ctx.createLinearGradient(0, oy, 0, oy + oh);
    back.addColorStop(0, '#ffffff1e'); back.addColorStop(1, '#ffffff0a');
    roundRect(ctx, ox, oy, ow, oh, 22); ctx.fillStyle = back; ctx.fill();
    ctx.save();
    roundRect(ctx, BX, BY, BW, BH, 14); ctx.clip();
    ctx.fillStyle = '#0b0a1a40'; ctx.fillRect(BX, BY, BW, BH);
    if (state) {
      drawSand(ctx);
      const busy = state.belt.some(Boolean), pulse = 0.5 + 0.5 * Math.sin(now / 280);
      const strip = ctx.createLinearGradient(0, BY + BH - SUCK_ROWS * G - 12, 0, BY + BH);
      strip.addColorStop(0, '#fff0b000');
      strip.addColorStop(1, `rgba(255,240,176,${busy ? 0.16 + 0.12 * pulse : 0.1})`);
      ctx.fillStyle = strip; ctx.fillRect(BX, BY + BH - SUCK_ROWS * G - 12, BW, SUCK_ROWS * G + 12);
    }
    for (const [x0, x1] of [[BX, BX + 18], [BX + BW, BX + BW - 18]]) {
      const edge = ctx.createLinearGradient(x0, 0, x1, 0);
      edge.addColorStop(0, '#00000038'); edge.addColorStop(1, '#00000000');
      ctx.fillStyle = edge; ctx.fillRect(Math.min(x0, x1), BY, 18, BH);
    }
    ctx.restore();
    roundRect(ctx, BX + 10, BY + 14, 7, BH * 0.6, 4); ctx.fillStyle = '#ffffff24'; ctx.fill();
    roundRect(ctx, BX + 21, BY + 14, 3, BH * 0.28, 2); ctx.fillStyle = '#ffffff1a'; ctx.fill();
    roundRect(ctx, BX + BW - 14, BY + BH * 0.55, 4, BH * 0.3, 2); ctx.fillStyle = '#ffffff14'; ctx.fill();
    roundRect(ctx, ox, oy, ow, oh, 22); ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff4d'; ctx.stroke();
    roundRect(ctx, ox + 3, oy + 3, ow - 6, oh - 6, 19); ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff1a'; ctx.stroke();
    const lip = ctx.createLinearGradient(0, oy - 8, 0, oy + 4);
    lip.addColorStop(0, '#ffffff55'); lip.addColorStop(1, '#ffffff1c');
    roundRect(ctx, ox - 6, oy - 8, ow + 12, 12, 6); ctx.fillStyle = lip; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffff60'; ctx.stroke();
  }

  function drawBelt(ctx) {
    const frame = ctx.createLinearGradient(0, BELT_Y, 0, BELT_Y + 64);
    frame.addColorStop(0, '#514a70'); frame.addColorStop(1, '#2a2540');
    roundRect(ctx, 8, BELT_Y, W - 16, 64, 18); ctx.fillStyle = frame; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff22'; ctx.stroke();
    ctx.save();
    roundRect(ctx, 16, BELT_Y + 8, W - 32, 48, 12); ctx.fillStyle = '#191526'; ctx.fill(); ctx.clip();
    ctx.fillStyle = '#ffffff0b';
    for (let x = 2 + (beltShift % 14); x < W; x += 14) ctx.fillRect(x, BELT_Y + 8, 6, 48);
    ctx.fillStyle = '#ffffff16'; ctx.fillRect(16, BELT_Y + 8, W - 32, 1.5);
    ctx.fillStyle = '#00000040'; ctx.fillRect(16, BELT_Y + 50, W - 32, 6);
    ctx.restore();
    for (const x of [16, W - 16]) { ctx.beginPath(); ctx.arc(x, BELT_Y + 32, 3, 0, Math.PI * 2); ctx.fillStyle = '#ffffff30'; ctx.fill(); }
  }

  shell.render = (ctx, now) => {
    drawBottle(ctx, now);
    if (!state) { text(ctx, '正在铺沙画……', W / 2, BY + BH / 2, { size: 16, color: '#e6dcff' }); return; }
    drawBelt(ctx);
    for (let slot = 0; slot < state.beltSize; slot += 1) {
      const x = slotX(slot), b = state.belt[slot];
      if (!b) {
        roundRect(ctx, x - 22, BELT_Y + 12, 44, 40, 10); ctx.fillStyle = '#ffffff06'; ctx.fill();
        ctx.strokeStyle = slot >= BELT ? '#ffd54380' : '#ffffff2a'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
        continue;
      }
      const big = Boolean(b.merged), fly = flying.get(b);
      let px = x, py = BELT_Y + 20, w = big ? 48 : 44, h = big ? 36 : 34;
      if (fly && now - fly.t0 < 220) {
        const k = easeOut((now - fly.t0) / 220);
        px = mix(fly.x, x, k); py = mix(fly.y, py, k) - Math.sin(k * Math.PI) * 18; w = mix(62, w, k); h = mix(46, h, k);
      }
      pail(ctx, px, py, w, h, b.color, { got: b.got, cap: b.cap, glow: big ? '#ffd543' : '' });
      if (big) { ctx.beginPath(); ctx.arc(px + w / 2 - 2, py + 4, 7, 0, Math.PI * 2); ctx.fillStyle = '#ffd543'; ctx.fill(); text(ctx, '★', px + w / 2 - 2, py + 4.5, { size: 9, color: '#7a4a00' }); }
    }
    leaving = leaving.filter((l) => now - l.t0 < 420);
    for (const l of leaving) { const k = easeOut((now - l.t0) / 420); pail(ctx, l.x, BELT_Y + 20 - k * 44, 44 * (1 - k * 0.3), 34 * (1 - k * 0.3), l.color, { got: 1, cap: 1, label: false, alpha: 1 - k }); }
    // 沙流：从瓶底弯着飞进桶口，带一小截拖尾
    streams = streams.filter((s) => now - s.t0 < 300);
    for (const s of streams) {
      const tx = slotX(s.slot), [base, light] = CANDY[s.color];
      for (let j = 2; j >= 0; j -= 1) {
        const k = Math.max(0, (now - s.t0) / 300 - j * 0.07), u = 1 - k;
        const x = u * u * s.x0 + 2 * u * k * s.x0 + k * k * tx, y = mix(BY + BH, BELT_Y + 20, k * k);
        ctx.globalAlpha = 1 - j * 0.35;
        ctx.beginPath(); ctx.arc(x, y, 2.1 - j * 0.5, 0, Math.PI * 2); ctx.fillStyle = j ? base : light; ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    bursts = bursts.filter((p) => now - p.t0 < 520);
    for (const p of bursts) {
      const t = now - p.t0;
      ctx.globalAlpha = 1 - t / 520;
      ctx.beginPath(); ctx.arc(p.x + p.vx * t, p.y + p.vy * t + 0.00025 * t * t, p.r, 0, Math.PI * 2);
      ctx.fillStyle = CANDY[p.color][1]; ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 三列沙桶：最前面的大桶，后面两个小一点、颜色压暗
    for (let lane = 0; lane < LANES; lane += 1) {
      const list = state.lanes[lane], x = LANE_X[lane];
      const tray = ctx.createLinearGradient(0, LANE_Y - 22, 0, LANE_Y + 112);
      tray.addColorStop(0, '#ffffff14'); tray.addColorStop(1, '#ffffff05');
      roundRect(ctx, x - 52, LANE_Y - 22, 104, 134, 16); ctx.fillStyle = tray; ctx.fill();
      ctx.lineWidth = 1; ctx.strokeStyle = '#ffffff12'; ctx.stroke();
      if (!list.length) { text(ctx, '空了', x, LANE_Y + 40, { size: 13, color: '#ffffff40' }); continue; }
      [[66, 40, 20, 0.3], [92, 34, 16, 0.5]].forEach(([dy, w, h, shade], k) => {
        const b = list[k + 1];
        if (b) pail(ctx, x, LANE_Y + dy, w, h, b.color, { cap: b.cap, handle: false, shade });
      }, null);
      pail(ctx, x, LANE_Y + 6, 62, 46, list[0].color, { cap: list[0].cap });
      if (list.length > 3) text(ctx, `+${list.length - 3}`, x + 38, LANE_Y + 104, { size: 11, color: '#cfc6f0' });
    }
    if (streams.length || leaving.length || bursts.length || now < flyUntil) shell.poke(16);
  };

  // 全屏：瓶子是游戏区，下面的传送带和三列桶保持原大小（横屏时在右边）
  shell.regions = () => [
    { x: BX - 16, y: BY - 18, w: BW + 32, h: BH + 30, role: 'main' },
    { x: 0, y: BELT_Y - 4, w: W, h: H - BELT_Y + 4, role: 'bottom' }
  ];

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
