// 隔墙狙击（ARCADE 41）的画面：训练场里两个木头人，一个躲在墙后，一个端着狙击镜隔墙打。
// 规则都在 wallshot-core.js。单机时规则和电脑都在这台浏览器里跑；联机时（online 是 Session）只收服务端裁剪过的视图、发动作。
// 两种情况都画同一份「视图」：狙击的人看不见藏好的人，躲的人只知道红光在哪一列。
import { BOT_LEVELS, MAPS, POSES, POSE_NAMES, RULES, SPEED, WALL, act, bodyParts, createBot, createMatch, exposedParts, tick, viewFor } from './wallshot-core.js';
import { canvasGame, inRect, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const GROUND = 334;                 // 地面（世界 y = 0）在画布上的 y
const TOP = GROUND - WALL.H;        // 墙顶
const SCENE = { x: 0, y: 104, w: W, h: 252 };
const SAVE = store('pao-wallshot');
const LEVEL_IDS = Object.keys(BOT_LEVELS);
const SEAT_COLOR = { me: ['#2fc4d6', '#a6f1f8', '#16808c'], rival: ['#ff8a4c', '#ffc6a3', '#b8521c'] };
const SCOPE_R = 62;
const ZOOM = 2.1;
const FIRE = { x: 286, y: 470, r: 54 };
const PAD = { x: 14, y: 372, w: 196, h: 196 };
const POSE_BTN = POSES.map((pose, i) => ({ pose, x: 14 + i * 113, y: 372, w: 105, h: 66 }));
const MOVE_BTN = [{ dir: -1, x: 14, y: 452, w: 162, h: 116 }, { dir: 1, x: 184, y: 452, w: 162, h: 116 }];
const MUTE = { x: 326, y: 62, w: 28, h: 28 };
const SEND_EVERY = 70;              // 联机时移动 / 瞄准的上报间隔（毫秒）

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sx = (x) => x;
const sy = (y) => GROUND - y;
const hash = (a, b = 0) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

// ---- 声音：Web Audio 现场合成（枪声、命中、打钢板、换姿势），第一次点画布时才建 ----
function makeSound() {
  let ac = null, out = null, noise = null, on = SAVE.get({}).sound !== false;
  const unlock = () => {
    if (!on) return;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ac = new AC(); } catch { return; }
      out = ac.createGain(); out.gain.value = 0.5; out.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate * 0.6, ac.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    }
    if (ac.state === 'suspended') ac.resume().catch(() => {});
  };
  const burst = (at, { dur, from, to, gain, type = 'lowpass' }) => {
    const src = ac.createBufferSource(); src.buffer = noise;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(from, at); f.frequency.exponentialRampToValueAtTime(to, at + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(out); src.start(at); src.stop(at + dur + 0.02);
  };
  const tone = (at, { f0, f1, dur, gain, type = 'sine' }) => {
    const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(out); o.start(at); o.stop(at + dur + 0.02);
  };
  const play = (fn) => { if (on && ac && ac.state === 'running') { try { fn(ac.currentTime); } catch { /* 声音出错不影响游戏 */ } } };
  return {
    unlock,
    get on() { return on; },
    toggle() { on = !on; SAVE.set({ ...SAVE.get({}), sound: on }); if (on) unlock(); return on; },
    shot: (far = false) => play((t) => { burst(t, { dur: far ? 0.35 : 0.5, from: far ? 2400 : 5200, to: 160, gain: far ? 0.35 : 0.9 }); tone(t, { f0: 140, f1: 40, dur: 0.22, gain: far ? 0.2 : 0.5, type: 'triangle' }); }),
    hit: (head) => play((t) => { tone(t + 0.04, { f0: head ? 520 : 240, f1: head ? 180 : 90, dur: 0.18, gain: 0.45, type: 'square' }); burst(t + 0.04, { dur: 0.12, from: 900, to: 300, gain: 0.4, type: 'bandpass' }); }),
    clank: () => play((t) => { tone(t + 0.03, { f0: 1900, f1: 1500, dur: 0.35, gain: 0.25, type: 'triangle' }); tone(t + 0.03, { f0: 2700, f1: 2300, dur: 0.25, gain: 0.12 }); }),
    thud: () => play((t) => burst(t + 0.03, { dur: 0.16, from: 1400, to: 200, gain: 0.35 })),
    click: () => play((t) => tone(t, { f0: 900, f1: 600, dur: 0.05, gain: 0.12, type: 'square' })),
    beep: (hi) => play((t) => tone(t, { f0: hi ? 1320 : 880, f1: hi ? 1320 : 880, dur: 0.09, gain: 0.12 }))
  };
}

// ---- 墙面贴图：每种材质画一次存起来，洞和窗口再挖掉 ----
const TEX_SCALE = 3;
const texCache = new Map();
function wallTexture(style) {
  if (texCache.has(style)) return texCache.get(style);
  const c = document.createElement('canvas');
  c.width = WALL.W * TEX_SCALE; c.height = WALL.H * TEX_SCALE;
  const g = c.getContext('2d');
  g.scale(TEX_SCALE, TEX_SCALE);
  const w = WALL.W, h = WALL.H;
  if (style === 'brick') {
    g.fillStyle = '#e2c3a6'; g.fillRect(0, 0, w, h);
    for (let row = 0, y = 0; y < h; row += 1, y += 15) {
      for (let x = row % 2 ? -15 : 0, i = 0; x < w; x += 30, i += 1) {
        const t = hash(row, i);
        g.fillStyle = `hsl(${10 + t * 8}, ${48 + t * 12}%, ${40 + t * 10}%)`;
        roundRect(g, x + 1, y + 1, 28, 13, 2); g.fill();
        g.fillStyle = '#ffffff22'; g.fillRect(x + 3, y + 2, 22, 2);
        if (t > 0.82) { g.fillStyle = '#00000022'; g.fillRect(x + 6 + t * 8, y + 5, 6, 4); }
      }
    }
  } else if (style === 'plank') {
    for (let i = 0, x = 0; x < w; i += 1, x += 24) {
      const t = hash(i, 3);
      g.fillStyle = `hsl(${26 + t * 6}, ${42 + t * 10}%, ${36 + t * 10}%)`; g.fillRect(x, 0, 24, h);
      g.strokeStyle = '#00000018'; g.lineWidth = 1;
      for (let k = 0; k < 4; k += 1) { g.beginPath(); g.moveTo(x + 5 + k * 4.5, 0); g.bezierCurveTo(x + 3 + k * 5, h * 0.3, x + 8 + k * 4, h * 0.6, x + 5 + k * 4.5, h); g.stroke(); }
      g.fillStyle = '#2a1708'; g.fillRect(x, 0, 1.5, h);
      g.fillStyle = '#ffffff1c'; g.fillRect(x + 2, 0, 2, h);
      for (const ny of [18, h - 22]) { g.fillStyle = '#5a5a66'; g.beginPath(); g.arc(x + 12, ny, 1.8, 0, Math.PI * 2); g.fill(); }
    }
    g.fillStyle = '#6b4424'; g.fillRect(0, 30, w, 9); g.fillRect(0, h - 44, w, 9);
    g.fillStyle = '#ffffff20'; g.fillRect(0, 30, w, 2); g.fillRect(0, h - 44, w, 2);
  } else if (style === 'concrete') {
    g.fillStyle = '#b9b5ab'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i += 1) { g.fillStyle = hash(i, 9) > 0.5 ? '#00000010' : '#ffffff14'; g.fillRect(hash(i, 1) * w, hash(i, 2) * h, 2 + hash(i, 4) * 3, 1.5); }
    g.strokeStyle = '#8d897f'; g.lineWidth = 1.2;
    for (const x of [90, 180, 270]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.beginPath(); g.moveTo(0, 85); g.lineTo(w, 85); g.stroke();
    for (let x = 22; x < w; x += 45) for (const y of [42, 128]) { g.fillStyle = '#7f7b72'; g.beginPath(); g.arc(x, y, 2.2, 0, Math.PI * 2); g.fill(); }
    const stain = g.createLinearGradient(0, h - 40, 0, h); stain.addColorStop(0, '#00000000'); stain.addColorStop(1, '#4a3b2a40');
    g.fillStyle = stain; g.fillRect(0, h - 40, w, 40);
    g.fillStyle = '#f2c230'; for (let x = -10; x < w; x += 28) { g.beginPath(); g.moveTo(x, h - 8); g.lineTo(x + 14, h - 8); g.lineTo(x + 22, h); g.lineTo(x + 8, h); g.fill(); }
    g.fillStyle = '#2c2c2c'; for (let x = 4; x < w; x += 28) { g.beginPath(); g.moveTo(x, h - 8); g.lineTo(x + 14, h - 8); g.lineTo(x + 22, h); g.lineTo(x + 8, h); g.fill(); }
  } else {
    g.fillStyle = '#5e7f33'; g.fillRect(0, 0, w, h);
    for (let i = 0, x = 0; x < w; i += 1, x += 18) {
      const t = hash(i, 7);
      const grad = g.createLinearGradient(x, 0, x + 18, 0);
      grad.addColorStop(0, '#4f6d27'); grad.addColorStop(0.35, `hsl(${84 + t * 10}, 45%, ${50 + t * 8}%)`); grad.addColorStop(1, '#46621f');
      g.fillStyle = grad; roundRect(g, x + 0.5, -4, 17, h + 8, 6); g.fill();
      for (let y = 20 + t * 30; y < h; y += 44 + t * 8) { g.fillStyle = '#3f5a1b'; g.fillRect(x + 1, y, 16, 2.5); g.fillStyle = '#ffffff30'; g.fillRect(x + 1, y + 2.5, 16, 1); }
    }
    g.fillStyle = '#c9a25f';
    for (const y of [44, 124]) { g.fillRect(0, y, w, 7); g.fillStyle = '#00000025'; for (let x = 0; x < w; x += 9) g.fillRect(x, y, 4, 7); g.fillStyle = '#c9a25f'; }
  }
  texCache.set(style, c);
  return c;
}

// 墙（按地图和洞的数目缓存）：front = 狙击的人看到的正面；ghost = 躲的人看的半透明「透视」版本。
function buildWall(map, holes) {
  const c = document.createElement('canvas');
  c.width = WALL.W * TEX_SCALE; c.height = WALL.H * TEX_SCALE;
  const g = c.getContext('2d');
  g.drawImage(wallTexture(map.style), 0, 0);
  g.scale(TEX_SCALE, TEX_SCALE);
  const Y = (y) => WALL.H - y;
  // 洞口四周先画一圈焦黑和裂纹，再把洞挖掉
  for (const h of holes) {
    const cx = h.x, cy = Y(h.y);
    const burn = g.createRadialGradient(cx, cy, h.r * 0.8, cx, cy, h.r * 2.1);
    burn.addColorStop(0, '#1d1410cc'); burn.addColorStop(1, '#1d141000');
    g.fillStyle = burn; g.beginPath(); g.arc(cx, cy, h.r * 2.1, 0, Math.PI * 2); g.fill();
    if (!h.pre) {
      g.strokeStyle = '#2a1d16aa'; g.lineWidth = 0.9;
      for (let k = 0; k < 4; k += 1) {
        const a = hash(h.x, h.y + k) * Math.PI * 2, len = h.r * (1.4 + hash(h.y, k) * 1.3);
        g.beginPath(); g.moveTo(cx + Math.cos(a) * h.r, cy + Math.sin(a) * h.r);
        g.lineTo(cx + Math.cos(a + 0.2) * (h.r + len * 0.5), cy + Math.sin(a + 0.2) * (h.r + len * 0.5));
        g.lineTo(cx + Math.cos(a - 0.1) * (h.r + len), cy + Math.sin(a - 0.1) * (h.r + len)); g.stroke();
      }
    }
  }
  for (const w of map.windows) {
    g.fillStyle = '#5b3a1e'; g.fillRect(w.x - 5, Y(w.y + w.h) - 5, w.w + 10, w.h + 10);
    g.fillStyle = '#7a5230'; g.fillRect(w.x - 7, Y(w.y) + 2, w.w + 14, 5);
  }
  g.globalCompositeOperation = 'destination-out';
  for (const h of holes) { g.beginPath(); g.arc(h.x, Y(h.y), h.r, 0, Math.PI * 2); g.fill(); }
  for (const w of map.windows) g.fillRect(w.x, Y(w.y + w.h), w.w, w.h);
  return c;
}

// ---- 木头人 ----
function drawDummy(ctx, body, palette, { flash = 0, alpha = 1 } = {}) {
  const parts = bodyParts(body);
  const [vest, vestLight, vestDark] = palette;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'round';
  const wood = (x, y, w, h, r) => {
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, '#c98f55'); g.addColorStop(0.45, '#e9b77d'); g.addColorStop(1, '#b97e45');
    roundRect(ctx, x, y, w, h, r); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#6e4521'; ctx.stroke();
  };
  for (const p of parts.filter((q) => q.part === 'limb')) wood(sx(p.x), sy(p.y + p.h), p.w, p.h, Math.min(p.w, p.h) / 2);
  const torso = parts.find((q) => q.part === 'body');
  if (torso) {
    const x = sx(torso.x), y = sy(torso.y + torso.h);
    const g = ctx.createLinearGradient(x, y, x, y + torso.h);
    g.addColorStop(0, vestLight); g.addColorStop(0.4, vest); g.addColorStop(1, vestDark);
    roundRect(ctx, x, y, torso.w, torso.h, 7); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#3b2a1a'; ctx.stroke();
    // 胸口的靶心
    const cx = x + torso.w / 2, cy = y + torso.h / 2, r = Math.min(torso.w, torso.h) * 0.3;
    for (const [k, col] of [[1, '#fff'], [0.66, '#e8434b'], [0.33, '#fff']]) { ctx.beginPath(); ctx.arc(cx, cy, r * k, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
  }
  const head = parts.find((q) => q.part === 'head');
  if (head) {
    const x = sx(head.x), y = sy(head.y), r = head.r, f = body.face || 1;
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.2, x, y, r);
    g.addColorStop(0, '#f6cf98'); g.addColorStop(1, '#c58a50');
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#6e4521'; ctx.stroke();
    // 头带（座位颜色）和飘带
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = vest; ctx.fillRect(x - r, y - r * 0.62, r * 2, r * 0.42); ctx.restore();
    ctx.fillStyle = vest;
    ctx.beginPath(); ctx.moveTo(x - f * r * 0.9, y - r * 0.5); ctx.lineTo(x - f * (r + 9), y - r * 0.85); ctx.lineTo(x - f * (r + 7), y - r * 0.2); ctx.closePath(); ctx.fill();
    // 脸朝面向的一边
    const ex = x + f * r * 0.22;
    ctx.fillStyle = '#3a2412';
    ctx.beginPath(); ctx.arc(ex - r * 0.32, y + r * 0.02, r * 0.12, 0, Math.PI * 2); ctx.arc(ex + r * 0.32, y + r * 0.02, r * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff9aa266';
    ctx.beginPath(); ctx.arc(ex - r * 0.52, y + r * 0.34, r * 0.16, 0, Math.PI * 2); ctx.arc(ex + r * 0.52, y + r * 0.34, r * 0.16, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2412'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(ex, y + r * 0.3, r * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  }
  if (flash > 0) {
    // 被打中：整个人闪一下红（只盖在身体各部位上）
    ctx.globalAlpha = alpha * flash * 0.7;
    ctx.fillStyle = '#ff3b3b';
    for (const p of parts) {
      if (p.kind === 'circle') { ctx.beginPath(); ctx.arc(sx(p.x), sy(p.y), p.r, 0, Math.PI * 2); ctx.fill(); }
      else { roundRect(ctx, sx(p.x), sy(p.y + p.h), p.w, p.h, Math.min(p.w, p.h) / 2); ctx.fill(); }
    }
  }
  ctx.restore();
}

export function mountWallshot(wrap, { onHud = () => {}, onButtons = () => {}, online = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '隔墙狙击游戏画布', game: 'wallshot' });
  const sound = makeSound();
  const saved = SAVE.get({});
  let level = LEVEL_IDS.includes(saved.level) ? saved.level : 'normal';
  let stats = saved.stats ?? {};
  let driver = null;
  let last = 0;
  // 本地即时反馈：躲的人自己的位置先在本地走（联机时服务端再确认），准星也在本地。
  let me = null;
  let aim = { x: WALL.W / 2, y: 60 };
  let laser = null;
  let keys = new Set();
  let holds = new Map();          // pointerId → 移动方向（按住 ◀ ▶）
  let drag = null;                // { id, mode: 'aim' | 'walk', last }
  let walkTo = null;
  let wantPose = null;
  let sentAt = 0;
  let sentKey = '';
  let lastShotN = 0;
  let lastTurn = -1;
  let lastFireAt = 0;
  let turnBanner = null;
  let fx = [];
  let flashUntil = 0;
  let recoil = 0;
  let shake = 0;
  let hitFlash = 0;
  let ended = false;
  let wallCache = { key: '', canvas: null };
  let lastBeep = -1;

  // ---- 对局来源：单机 / 联机 ----
  function localDriver() {
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0;
    const state = createMatch(seed);
    const bot = createBot(level, seed ^ 0x5bd1e995);
    const now0 = performance.now();
    act(state, 0, { type: 'ready' }, now0);
    act(state, 1, { type: 'ready' }, now0);
    return {
      local: true, seat: 0, state, level,
      view: (now) => viewFor(state, 0, now),
      send: (action, now) => act(state, 0, action, now),
      paused: false,
      update(now) {
        tick(state, now);
        if (!this.paused) for (const a of bot.step(state, 1, now)) act(state, 1, a, now);
      }
    };
  }
  function onlineDriver() {
    let recvAt = performance.now();
    return {
      local: false,
      get seat() { return online.seat; },
      view(now) {
        const v = online.view;
        return v ? { ...v, left: Math.max(0, v.left - (now - recvAt)) } : null;
      },
      send: (action) => online.send(action),
      update() {},
      received() { recvAt = performance.now(); }
    };
  }

  const roleOf = (v) => (v.seat === v.sniper ? 'sniper' : 'hider');
  const rivalName = () => (online ? '对手' : `电脑·${BOT_LEVELS[level].label}`);
  const labels = () => onButtons({ level: online ? null : `电脑：${BOT_LEVELS[level].label}` });

  function hud(v) {
    if (!v) return;
    const mine = v.hp[v.seat], theirs = v.hp[1 - v.seat];
    const rec = stats[level];
    onHud(`你 ${mine} 血 · ${rivalName()} ${theirs} 血 · 第 ${Math.max(1, v.turn)}/${v.turns} 回合${!online && rec ? ` · 战绩 ${rec.w} 胜 ${rec.l} 负` : ''}`);
  }

  function resetView() {
    me = null; aim = { x: WALL.W / 2, y: 60 }; laser = null; walkTo = null; wantPose = null;
    lastShotN = 0; lastTurn = -1; fx = []; ended = false; turnBanner = null; hitFlash = 0; shake = 0;
    wallCache = { key: '', canvas: null };
    holds.clear(); drag = null;
  }
  function begin() {
    shell.closeCard();
    resetView();
    driver = online ? onlineDriver() : localDriver();
    last = performance.now();
    labels();
    shell.poke();
  }

  // ---- 输入 ----
  function pressFire(now) {
    const v = driver.view(now);
    if (!v || roleOf(v) !== 'sniper' || v.phase !== 'aim' || v.bullets <= 0 || now - lastFireAt < 320) return false;
    lastFireAt = now;
    flashUntil = now + 90;
    recoil = 1;
    sound.shot();
    driver.send({ type: 'shoot', x: aim.x, y: aim.y }, now);
    return true;
  }
  const toWorld = (p) => ({ x: clamp(p.x, 0, WALL.W), y: clamp(GROUND - p.y, 0, WALL.H) });
  const inScene = (p) => p.y >= TOP - 20 && p.y <= GROUND + 14;
  shell.on('pointerdown', (event) => {
    if (shell.cardOpen || !driver) return;
    event.preventDefault();
    shell.canvas.focus?.();
    sound.unlock();
    const p = shell.point(event), now = performance.now(), v = driver.view(now);
    if (inRect(p, MUTE)) { sound.toggle(); shell.poke(); return; }
    if (!v || v.status !== 'playing') return;
    const mouse = event.pointerType === 'mouse';
    if (roleOf(v) === 'sniper') {
      if (Math.hypot(p.x - FIRE.x, p.y - FIRE.y) <= FIRE.r + 8) { pressFire(now); return; }
      if (mouse && inScene(p)) { aim = toWorld(p); pressFire(now); return; }
      if (inScene(p) || inRect(p, PAD)) { drag = { id: event.pointerId, mode: 'aim', last: p, gain: inRect(p, PAD) ? 0.75 : 0.55 }; shell.canvas.setPointerCapture?.(event.pointerId); }
      return;
    }
    const pose = POSE_BTN.find((b) => inRect(p, b));
    if (pose) { wantPose = pose.pose; return; }
    const move = MOVE_BTN.find((b) => inRect(p, b));
    if (move) { holds.set(event.pointerId, move.dir); walkTo = null; shell.canvas.setPointerCapture?.(event.pointerId); return; }
    if (inScene(p)) { drag = { id: event.pointerId, mode: 'walk', last: p }; walkTo = clamp(p.x, RULES.EDGE, WALL.W - RULES.EDGE); shell.canvas.setPointerCapture?.(event.pointerId); }
  });
  shell.on('pointermove', (event) => {
    if (shell.cardOpen || !driver) return;
    const p = shell.point(event);
    if (drag && drag.id === event.pointerId) {
      event.preventDefault();
      if (drag.mode === 'aim') {
        aim = { x: clamp(aim.x + (p.x - drag.last.x) * drag.gain, 0, WALL.W), y: clamp(aim.y - (p.y - drag.last.y) * drag.gain, 0, WALL.H) };
      } else walkTo = clamp(p.x, RULES.EDGE, WALL.W - RULES.EDGE);
      drag.last = p;
      return;
    }
    if (event.pointerType === 'mouse' && inScene(p)) {
      const v = driver.view(performance.now());
      if (v && roleOf(v) === 'sniper') aim = toWorld(p);
    }
  });
  const release = (event) => {
    holds.delete(event.pointerId);
    if (drag && drag.id === event.pointerId) { if (drag.mode === 'walk') walkTo = null; drag = null; }
  };
  shell.on('pointerup', release);
  shell.on('pointercancel', release);
  shell.on('keydown', (event) => {
    if (!driver || shell.cardOpen || event.target?.tagName === 'INPUT') return;
    const k = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'a', 'd', 'w', 's', '1', '2', '3'].includes(k)) event.preventDefault();
    sound.unlock();
    keys.add(k);
    if (k === ' ') pressFire(performance.now());
    if (k === '1') wantPose = 'stand';
    if (k === '2') wantPose = 'crouch';
    if (k === '3') wantPose = 'prone';
    // 躲的时候 ↑ ↓ 一级一级换姿势（狙的时候 ↑ ↓ 是移动准星，在每帧里处理）
    const v = driver.view(performance.now());
    if (v && roleOf(v) === 'hider' && me && !event.repeat && ['arrowup', 'w', 'arrowdown', 's'].includes(k)) {
      const i = POSES.indexOf(wantPose ?? me.pose) + (k === 'arrowup' || k === 'w' ? -1 : 1);
      wantPose = POSES[clamp(i, 0, POSES.length - 1)];
    }
  }, window);
  shell.on('keyup', (event) => keys.delete(event.key.toLowerCase()), window);
  shell.on('blur', () => { keys.clear(); holds.clear(); }, window);

  // ---- 每帧：推进规则、处理输入、上报 ----
  function step(now, dt, v) {
    driver.update(now);
    // 联机时对手离开（服务端判了胜负）后就别再发动作了，否则每一下都会弹「本局已结束」
    const role = roleOf(v), live = v.status === 'playing' && (v.phase === 'hide' || v.phase === 'aim') && !online?.result.over;
    if (v.turn !== lastTurn) {
      lastTurn = v.turn;
      if (v.turn > 0) turnBanner = { text: role === 'sniper' ? '你来狙！' : '你来躲！', sub: role === 'sniper' ? '等对手藏好，然后隔墙打三枪' : '趁 5 秒藏好，躲开红光', at: now };
      me = role === 'hider' && v.body ? { ...v.body } : null;
      sentKey = '';
      aim = { x: WALL.W / 2, y: 60 };
      laser = null;
      walkTo = null; wantPose = null; holds.clear(); drag = null;
    }
    if (role === 'hider' && live && me) {
      let dir = 0;
      if (keys.has('arrowleft') || keys.has('a')) dir -= 1;
      if (keys.has('arrowright') || keys.has('d')) dir += 1;
      for (const d of holds.values()) dir += d;
      dir = Math.sign(dir);
      if (!dir && walkTo !== null && Math.abs(walkTo - me.x) > 1.5) dir = Math.sign(walkTo - me.x);
      if (dir) {
        let nx = me.x + dir * SPEED[me.pose] * dt;
        if (walkTo !== null && !holds.size && Math.sign(walkTo - nx) !== dir) nx = walkTo;
        me.x = clamp(nx, RULES.EDGE, WALL.W - RULES.EDGE);
        me.face = dir;
      }
      if (wantPose && wantPose !== me.pose && (me.cool ?? 0) <= 0) { me.pose = wantPose; me.cool = RULES.POSE_COOLDOWN; sound.click(); }
      wantPose = null;
      me.cool = Math.max(0, (me.cool ?? 0) - dt * 1000);
      const key = `${me.x.toFixed(1)}|${me.pose}`;
      let truth = driver.view(now).body;
      // 联机时服务端可能因为换姿势冷却没认：过一会儿再报一次
      const stale = truth && truth.pose !== me.pose && now - sentAt > 250;
      if ((key !== sentKey || stale) && (driver.local || now - sentAt >= SEND_EVERY || !sentKey.endsWith(me.pose) || stale)) {
        sentKey = key; sentAt = now;
        driver.send({ type: 'move', x: me.x, pose: me.pose }, now);
        truth = driver.view(now).body;
      }
      // 单机：规则就在本地，直接以它为准；联机：差得多（被服务端截断）才拉回来
      if (truth && driver.local) { me.x = truth.x; me.pose = truth.pose; }
      else if (truth && Math.abs(truth.x - me.x) > 24) me.x = truth.x;
    }
    if (role === 'sniper' && live) {
      const speed = 140 * dt;
      if (keys.has('arrowleft') || keys.has('a')) aim.x -= speed;
      if (keys.has('arrowright') || keys.has('d')) aim.x += speed;
      if (keys.has('arrowup') || keys.has('w')) aim.y += speed;
      if (keys.has('arrowdown') || keys.has('s')) aim.y -= speed;
      aim = { x: clamp(aim.x, 0, WALL.W), y: clamp(aim.y, 0, WALL.H) };
      const key = `${aim.x.toFixed(1)}|${aim.y.toFixed(1)}`;
      if (key !== sentKey && (driver.local || now - sentAt >= SEND_EVERY)) { sentKey = key; sentAt = now; driver.send({ type: 'aim', x: aim.x, y: aim.y }, now); }
    }
    // 红光（躲的人看到的准星列）平滑跟随
    if (role === 'hider' && v.aim && v.phase === 'aim') laser = laser === null ? v.aim.x : laser + (v.aim.x - laser) * Math.min(1, dt * 9);
    else if (v.phase !== 'aim') laser = null;
    // 新的一枪：洞口碎屑、命中飘字、声音
    if (v.shotCount < lastShotN) lastShotN = 0;
    if (v.shotCount > lastShotN) {
      for (const s of v.shots.filter((q) => q.n > lastShotN)) {
        if (role === 'hider') sound.shot(true);
        const label = s.steel ? '铛！' : s.part === 'head' ? '爆头！' : s.part ? `-${s.damage}` : '';
        if (s.steel) sound.clank(); else if (s.part) sound.hit(s.part === 'head'); else sound.thud();
        for (let i = 0; i < (s.steel ? 10 : 14); i += 1) {
          const a = Math.random() * Math.PI * 2, sp = 30 + Math.random() * 90;
          fx.push({ kind: s.steel ? 'spark' : 'chip', x: sx(s.x), y: sy(s.y), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, at: now, life: 500 + Math.random() * 400 });
        }
        if (label) fx.push({ kind: 'label', text: label, x: sx(s.x), y: sy(s.y) - 14, at: now, life: 1100, color: s.steel ? '#ffe27a' : '#ff4d5e' });
        if (s.part) { hitFlash = 1; shake = s.part === 'head' ? 1 : 0.6; }
      }
      lastShotN = v.shotCount;
    }
    if (live && v.phase === 'hide') {
      const sec = Math.ceil(v.left / 1000);
      if (sec !== lastBeep && sec <= 3 && sec > 0) { lastBeep = sec; sound.beep(false); }
    } else lastBeep = -1;
  }

  // ---- 画面 ----
  function wallImage(v) {
    const key = `${v.map}|${v.holes.length}|${v.holes.at(-1)?.x ?? ''}|${v.hider}`;
    if (wallCache.key !== key) wallCache = { key, canvas: buildWall(MAPS[v.map], v.holes) };
    return wallCache.canvas;
  }
  function drawSky(ctx, now) {
    const g = ctx.createLinearGradient(0, SCENE.y, 0, TOP + 20);
    g.addColorStop(0, '#7ccfff'); g.addColorStop(1, '#d9f2ff');
    ctx.fillStyle = g; ctx.fillRect(0, SCENE.y, W, GROUND - SCENE.y);
    ctx.fillStyle = '#ffffffd0';
    for (let i = 0; i < 3; i += 1) {
      const x = ((i * 140 + now * 0.006) % (W + 120)) - 60, y = SCENE.y + 14 + i * 9;
      ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.arc(x + 12, y - 4, 11, 0, Math.PI * 2); ctx.arc(x + 25, y, 8, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#9ccf86';
    ctx.beginPath(); ctx.moveTo(0, TOP + 8);
    for (let x = 0; x <= W; x += 30) ctx.quadraticCurveTo(x + 15, TOP - 14 - hash(x) * 10, x + 30, TOP + 6);
    ctx.lineTo(W, TOP + 30); ctx.lineTo(0, TOP + 30); ctx.fill();
  }
  function drawGround(ctx) {
    ctx.fillStyle = '#7bc25a'; ctx.fillRect(0, GROUND, W, SCENE.y + SCENE.h - GROUND);
    ctx.fillStyle = '#5fa443'; ctx.fillRect(0, GROUND, W, 3);
    ctx.fillStyle = '#ffffff30'; for (let x = 6; x < W; x += 22) ctx.fillRect(x, GROUND + 8 + hash(x) * 8, 6, 2);
  }
  // 墙后面（从洞里看进去）：front 时是暗的，ghost 时是亮一点的后院
  function drawBehind(ctx, ghost) {
    const g = ctx.createLinearGradient(0, TOP, 0, GROUND);
    if (ghost) { g.addColorStop(0, '#cfe6d2'); g.addColorStop(1, '#a9cfa0'); } else { g.addColorStop(0, '#2b2340'); g.addColorStop(1, '#40335a'); }
    ctx.fillStyle = g; ctx.fillRect(0, TOP, W, WALL.H);
  }
  function drawSteel(ctx, map, alpha = 1) {
    ctx.save(); ctx.globalAlpha = alpha;
    for (const s of map.steel) {
      const x = sx(s.x), y = sy(s.y + s.h);
      const g = ctx.createLinearGradient(x, y, x + s.w, y + s.h);
      g.addColorStop(0, '#d7dde6'); g.addColorStop(0.5, '#8d97a6'); g.addColorStop(1, '#b8c0cc');
      roundRect(ctx, x, y, s.w, s.h, 3); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#4b5361'; ctx.stroke();
      ctx.fillStyle = '#5d6573';
      for (const [rx, ry] of [[4, 4], [s.w - 4, 4], [4, s.h - 4], [s.w - 4, s.h - 4]]) { ctx.beginPath(); ctx.arc(x + rx, y + ry, 1.8, 0, Math.PI * 2); ctx.fill(); }
      ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 6, y + s.h - 8); ctx.lineTo(x + s.w - 10, y + 8); ctx.stroke();
    }
    ctx.restore();
  }
  // 墙这一层（墙后、人、墙、钢板）。ghost：躲的人 / 揭晓时看的半透明墙。
  function drawWallLayer(ctx, v, { ghost, showBody }) {
    const map = MAPS[v.map];
    drawBehind(ctx, ghost);
    const body = v.seat === v.hider && me && v.phase !== 'reveal' && v.phase !== 'over' ? me : v.body;
    if (showBody && body) drawDummy(ctx, body, v.hider === v.seat ? SEAT_COLOR.me : SEAT_COLOR.rival, { flash: hitFlash });
    ctx.save();
    ctx.globalAlpha = ghost ? 0.5 : 1;
    ctx.drawImage(wallImage(v), 0, TOP, WALL.W, WALL.H);
    ctx.restore();
    if (ghost) {
      // 透视时把洞和窗口描亮：这些地方会被看见
      ctx.save();
      ctx.strokeStyle = '#fff8c8'; ctx.lineWidth = 1.6; ctx.shadowColor = '#fff3a0'; ctx.shadowBlur = 6;
      for (const h of v.holes) { ctx.beginPath(); ctx.arc(sx(h.x), sy(h.y), h.r, 0, Math.PI * 2); ctx.stroke(); }
      for (const w of map.windows) ctx.strokeRect(sx(w.x), sy(w.y + w.h), w.w, w.h);
      ctx.restore();
    }
    drawSteel(ctx, map, ghost ? 0.6 : 1);
  }
  function drawLaser(ctx, now) {
    if (laser === null) return;
    const x = sx(laser), pulse = 0.75 + Math.sin(now / 90) * 0.25;
    const g = ctx.createLinearGradient(x - 22, 0, x + 22, 0);
    g.addColorStop(0, '#ff304000'); g.addColorStop(0.5, `rgba(255,48,64,${0.38 * pulse})`); g.addColorStop(1, '#ff304000');
    ctx.fillStyle = g; ctx.fillRect(x - 22, TOP - 6, 44, WALL.H + 6);
    ctx.fillStyle = `rgba(255,70,80,${0.9 * pulse})`; ctx.fillRect(x - 1, TOP - 6, 2, WALL.H + 6);
    ctx.beginPath(); ctx.moveTo(x, TOP - 4); ctx.lineTo(x - 7, TOP - 16); ctx.lineTo(x + 7, TOP - 16); ctx.closePath(); ctx.fill();
    if (me && Math.abs(laser - me.x) < 34) text(ctx, '！', sx(me.x), sy(me.pose === 'stand' ? 134 : me.pose === 'crouch' ? 100 : 40), { size: 20, color: '#ff3b4b', shadow: '#00000066' });
  }
  // 躲的人从洞或窗口露出来了：头顶冒一个提醒
  function drawExposed(ctx, v, now) {
    if (!me || !exposedParts(me, v.holes, MAPS[v.map]).length) return;
    const top = { stand: 128, crouch: 94, prone: 34 }[me.pose] ?? 128;
    const x = clamp(sx(me.x), 40, W - 40), y = sy(top) - 6 - Math.sin(now / 160) * 2;
    roundRect(ctx, x - 34, y - 11, 68, 22, 11); ctx.fillStyle = '#ff4757e6'; ctx.fill();
    text(ctx, '露出来了', x, y + 1, { size: 11, color: '#fff' });
  }
  function drawScope(ctx, v, now) {
    const ax = sx(aim.x), ay = sy(aim.y) - recoil * 10;
    // 雾：瞄准镜以外几乎看不清
    ctx.save();
    ctx.beginPath(); ctx.rect(0, SCENE.y, W, SCENE.h); ctx.arc(ax, ay, SCOPE_R, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(22,26,44,0.84)'; ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(ax, ay, SCOPE_R, 0, Math.PI * 2); ctx.clip();
    ctx.translate(ax, ay); ctx.scale(ZOOM, ZOOM); ctx.translate(-sx(aim.x), -sy(aim.y));
    drawSky(ctx, now);
    drawWallLayer(ctx, v, { ghost: false, showBody: true });
    drawGround(ctx);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = 6; ctx.strokeStyle = '#101320'; ctx.beginPath(); ctx.arc(ax, ay, SCOPE_R + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#000000b0';
    ctx.beginPath(); ctx.moveTo(ax - SCOPE_R, ay); ctx.lineTo(ax - 6, ay); ctx.moveTo(ax + 6, ay); ctx.lineTo(ax + SCOPE_R, ay);
    ctx.moveTo(ax, ay - SCOPE_R); ctx.lineTo(ax, ay - 6); ctx.moveTo(ax, ay + 6); ctx.lineTo(ax, ay + SCOPE_R); ctx.stroke();
    ctx.fillStyle = '#ff3346'; ctx.beginPath(); ctx.arc(ax, ay, 1.8, 0, Math.PI * 2); ctx.fill();
    for (let k = -3; k <= 3; k += 1) if (k) { ctx.fillStyle = '#000000a0'; ctx.fillRect(ax + k * 14 - 0.8, ay - 3, 1.6, 6); ctx.fillRect(ax - 3, ay + k * 14 - 0.8, 6, 1.6); }
    ctx.restore();
  }
  function drawFx(ctx, now, dt) {
    fx = fx.filter((f) => now - f.at < f.life);
    for (const f of fx) {
      const t = (now - f.at) / f.life;
      if (f.kind === 'label') { text(ctx, f.text, f.x, f.y - t * 26, { size: f.text.length > 2 ? 18 : 16, color: f.color, shadow: '#000000aa' }); continue; }
      f.vy += 260 * dt; f.x += f.vx * dt; f.y += f.vy * dt;
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = f.kind === 'spark' ? '#ffd84a' : '#8a5a3c';
      ctx.fillRect(f.x - 1.5, f.y - 1.5, f.kind === 'spark' ? 2 : 3, f.kind === 'spark' ? 2 : 3);
      ctx.globalAlpha = 1;
    }
  }
  function hpBar(ctx, x, y, w, name, hp, palette, right) {
    roundRect(ctx, x, y, w, 40, 12); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#dfe3ef'; ctx.stroke();
    text(ctx, name, right ? x + w - 10 : x + 10, y + 12, { size: 11, color: '#5a6080', align: right ? 'right' : 'left' });
    text(ctx, `${hp}`, right ? x + 10 : x + w - 10, y + 12, { size: 12, color: palette[2], align: right ? 'left' : 'right' });
    roundRect(ctx, x + 8, y + 22, w - 16, 10, 5); ctx.fillStyle = '#eceef6'; ctx.fill();
    const fw = (w - 16) * hp / RULES.HP;
    if (fw > 0) { roundRect(ctx, right ? x + 8 + (w - 16) - fw : x + 8, y + 22, fw, 10, 5); ctx.fillStyle = palette[0]; ctx.fill(); }
  }
  function drawHud(ctx, v) {
    const g = ctx.createLinearGradient(0, 0, 0, SCENE.y);
    g.addColorStop(0, '#f4f6fc'); g.addColorStop(1, '#e9ecf7');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, SCENE.y);
    hpBar(ctx, 10, 10, 140, '你', v.hp[v.seat], SEAT_COLOR.me, false);
    hpBar(ctx, W - 150, 10, 140, rivalName(), v.hp[1 - v.seat], SEAT_COLOR.rival, true);
    text(ctx, `${Math.max(1, v.turn)}/${v.turns}`, W / 2, 24, { size: 15, color: '#3a3f5c' });
    text(ctx, '回合', W / 2, 41, { size: 10, color: '#8d93b8', weight: 700 });
    const role = roleOf(v);
    let line = '', tone = '#3a3f5c';
    const sec = Math.ceil(v.left / 1000);
    if (v.phase === 'ready') line = '等待开局……';
    else if (v.phase === 'hide') line = role === 'sniper' ? `对手正在藏 · ${sec}` : `快藏好！ · ${sec}`;
    else if (v.phase === 'aim') { line = role === 'sniper' ? `开枪！ · ${sec}` : `小心红光 · ${sec}`; tone = sec <= 3 ? '#e5484d' : '#3a3f5c'; }
    else if (v.phase === 'reveal') line = lastLine(v);
    else line = v.winner === null ? '平局' : v.winner === v.seat ? '你赢了！' : `${rivalName()}赢了`;
    roundRect(ctx, 10, 58, MUTE.x - 18, 34, 12); ctx.fillStyle = role === 'sniper' ? '#fff1f1' : '#ecfbfd'; ctx.fill();
    text(ctx, role === 'sniper' ? '◎ 狙击' : '◌ 躲藏', 22, 75, { size: 13, color: role === 'sniper' ? '#c9303b' : '#13808c', align: 'left' });
    text(ctx, line, 92, 75, { size: 13, color: tone, align: 'left' });
    if (role === 'sniper' && v.phase !== 'reveal' && v.phase !== 'over') {
      for (let i = 0; i < RULES.BULLETS; i += 1) {
        const bx = MUTE.x - 26 - i * 12, on = i < v.bullets;
        roundRect(ctx, bx, 66, 7, 18, 3.5); ctx.fillStyle = on ? '#e1a13a' : '#d6d9e4'; ctx.fill();
        if (on) { ctx.fillStyle = '#b06d16'; ctx.fillRect(bx, 79, 7, 5); }
      }
    }
    roundRect(ctx, MUTE.x, MUTE.y, MUTE.w, MUTE.h, 9); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#dfe3ef'; ctx.stroke();
    text(ctx, sound.on ? '🔊' : '🔇', MUTE.x + MUTE.w / 2, MUTE.y + MUTE.h / 2 + 1, { size: 14 });
  }
  function lastLine(v) {
    const l = v.last;
    if (!l) return '';
    const mine = l.sniper === v.seat;
    if (l.reason === 'hit') return mine ? `打中了！对手 -${l.damage}` : `被打中了 -${l.damage}`;
    if (l.reason === 'miss') return mine ? '三枪都没中，换边' : '躲过去了！换边';
    return mine ? '时间到，换边' : '对手没开枪，换边';
  }
  function drawControls(ctx, v) {
    ctx.fillStyle = '#f4f6fc'; ctx.fillRect(0, SCENE.y + SCENE.h, W, H - SCENE.y - SCENE.h);
    const role = roleOf(v), live = v.status === 'playing' && (v.phase === 'hide' || v.phase === 'aim');
    ctx.save();
    ctx.globalAlpha = live ? 1 : 0.45;
    if (role === 'sniper') {
      roundRect(ctx, PAD.x, PAD.y, PAD.w, PAD.h, 18); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = '#dfe3ef'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#d5d9e8';
      for (let i = 1; i < 6; i += 1) for (let j = 1; j < 6; j += 1) { ctx.beginPath(); ctx.arc(PAD.x + i * PAD.w / 6, PAD.y + j * PAD.h / 6, 1.6, 0, Math.PI * 2); ctx.fill(); }
      text(ctx, '按住拖动', PAD.x + PAD.w / 2, PAD.y + PAD.h / 2 - 9, { size: 14, color: '#5a6080' });
      text(ctx, '移动准星', PAD.x + PAD.w / 2, PAD.y + PAD.h / 2 + 11, { size: 12, color: '#8d93b8', weight: 700 });
      const ready = v.phase === 'aim' && v.bullets > 0;
      const g = ctx.createRadialGradient(FIRE.x - 16, FIRE.y - 18, 6, FIRE.x, FIRE.y, FIRE.r);
      g.addColorStop(0, ready ? '#ff8a8a' : '#e2e4ec'); g.addColorStop(1, ready ? '#d62f3d' : '#b9bdcc');
      ctx.beginPath(); ctx.arc(FIRE.x, FIRE.y + 4, FIRE.r, 0, Math.PI * 2); ctx.fillStyle = ready ? '#8f1d27' : '#9ea3b5'; ctx.fill();
      ctx.beginPath(); ctx.arc(FIRE.x, FIRE.y, FIRE.r, 0, Math.PI * 2); ctx.fillStyle = g; ctx.fill();
      text(ctx, '开火', FIRE.x, FIRE.y - 4, { size: 20, color: '#fff', shadow: '#00000055' });
      text(ctx, `剩 ${v.bullets} 发`, FIRE.x, FIRE.y + 18, { size: 11, color: '#ffffffd0', weight: 700 });
      text(ctx, v.phase === 'hide' ? '对手藏好前不能开枪，先看看洞里有没有动静' : '键鼠：鼠标在墙上瞄准、点一下开火 · 方向键微调、空格开火', W / 2, 600, { size: 10.5, color: '#8d93b8', weight: 700 });
    } else {
      const cool = me?.cool ?? 0;
      for (const b of POSE_BTN) {
        const on = me?.pose === b.pose;
        roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.fillStyle = on ? '#2fc4d6' : '#ffffff'; ctx.fill(); ctx.strokeStyle = on ? '#16808c' : '#dfe3ef'; ctx.lineWidth = 1.2; ctx.stroke();
        poseIcon(ctx, b.pose, b.x + 26, b.y + b.h / 2 + 2, on ? '#ffffff' : '#5a6080');
        text(ctx, POSE_NAMES[b.pose], b.x + 66, b.y + 24, { size: 17, color: on ? '#fff' : '#3a3f5c' });
        text(ctx, { stand: '跑得快', crouch: '中速', prone: '爬得慢' }[b.pose], b.x + 66, b.y + 46, { size: 10, color: on ? '#e6fbff' : '#8d93b8', weight: 700 });
        if (cool > 0 && !on) { roundRect(ctx, b.x, b.y, b.w, b.h, 14); ctx.fillStyle = '#ffffff99'; ctx.fill(); }
      }
      for (const b of MOVE_BTN) {
        const held = [...holds.values()].includes(b.dir) || (b.dir < 0 ? keys.has('arrowleft') || keys.has('a') : keys.has('arrowright') || keys.has('d'));
        roundRect(ctx, b.x, b.y + (held ? 3 : 0), b.w, b.h, 18); ctx.fillStyle = held ? '#dff6f9' : '#ffffff'; ctx.fill(); ctx.strokeStyle = '#dfe3ef'; ctx.stroke();
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2 + (held ? 3 : 0);
        ctx.fillStyle = '#2fc4d6';
        ctx.beginPath(); ctx.moveTo(cx + b.dir * 22, cy); ctx.lineTo(cx - b.dir * 14, cy - 22); ctx.lineTo(cx - b.dir * 14, cy + 22); ctx.closePath(); ctx.fill();
      }
      text(ctx, '按住 ◀ ▶ 或在墙上拖动 · 键盘 ←→ 移动、1 2 3 换姿势', W / 2, 600, { size: 10.5, color: '#8d93b8', weight: 700 });
    }
    ctx.restore();
    text(ctx, `${MAPS[v.map].name} · ${online ? '联机对战' : `对电脑（${BOT_LEVELS[level].label}）`}`, W / 2, 622, { size: 10.5, color: '#b0b5cc', weight: 700 });
  }
  function poseIcon(ctx, pose, x, y, color) {
    ctx.save(); ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
    if (pose === 'stand') { ctx.beginPath(); ctx.arc(x, y - 16, 5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 6); ctx.moveTo(x, y + 6); ctx.lineTo(x - 5, y + 18); ctx.moveTo(x, y + 6); ctx.lineTo(x + 5, y + 18); ctx.stroke(); }
    else if (pose === 'crouch') { ctx.beginPath(); ctx.arc(x, y - 6, 5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x, y + 9); ctx.lineTo(x - 7, y + 12); ctx.lineTo(x - 4, y + 18); ctx.moveTo(x, y + 9); ctx.lineTo(x + 7, y + 12); ctx.lineTo(x + 6, y + 18); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(x + 13, y + 12, 5, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 6, y + 14); ctx.lineTo(x - 14, y + 14); ctx.stroke(); }
    ctx.restore();
  }

  function endCard(v, forfeit = false) {
    if (ended) return;
    ended = true;
    const won = forfeit ? online.result.winner === v.seat : v.winner === v.seat, draw = !forfeit && v.winner === null;
    const why = forfeit ? (won ? '对手离开了房间' : '你离开了这一局') : v.reason === 'head' ? (won ? '一枪爆头！' : '被一枪爆头了') : v.reason === 'hp' ? (won ? '把对手的血打光了' : '血被打光了')
      : v.reason === 'draw' ? `${RULES.TURNS} 回合打完，血量一样` : `${RULES.TURNS} 回合打完，${won ? '你' : '对手'}剩的血多`;
    const lines = [why];
    if (!online) {
      const rec = stats[level] ?? { w: 0, l: 0, d: 0 };
      if (draw) rec.d += 1; else if (won) rec.w += 1; else rec.l += 1;
      stats = { ...stats, [level]: rec };
      SAVE.set({ ...SAVE.get({}), level, stats });
      lines.push(`对${BOT_LEVELS[level].label}电脑：${rec.w} 胜 ${rec.l} 负${rec.d ? ` ${rec.d} 平` : ''}`);
    }
    const buttons = online ? [{ label: '看看墙', ghost: true, action: () => shell.closeCard() }]
      : [{ label: '再来一局', action: () => begin() }, { label: '看看墙', ghost: true, action: () => shell.closeCard() }];
    setTimeout(() => {
      if (!shell.alive) return;
      shell.card({ title: draw ? '平局' : won ? '你赢了！' : online ? '对手获胜' : '电脑赢了', lines, buttons, tone: won ? 'won' : '' });
    }, 900);
    hud(v);
  }

  shell.render = (ctx, now) => {
    if (!driver) return;
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    let v = driver.view(now);
    if (!v) { ctx.fillStyle = '#f4f6fc'; ctx.fillRect(0, 0, W, H); text(ctx, '正在同步……', W / 2, H / 2, { size: 14, color: '#5a6080' }); shell.poke(200); return; }
    step(now, dt, v);
    v = driver.view(now);
    const role = roleOf(v);
    recoil = Math.max(0, recoil - dt * 6);
    hitFlash = Math.max(0, hitFlash - dt * 2.5);
    shake = Math.max(0, shake - dt * 3);
    drawHud(ctx, v);
    ctx.save();
    ctx.beginPath(); ctx.rect(SCENE.x, SCENE.y, SCENE.w, SCENE.h); ctx.clip();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * 8 * shake, (Math.random() - 0.5) * 6 * shake);
    drawSky(ctx, now);
    const reveal = v.phase === 'reveal' || v.phase === 'over';
    const ghost = reveal || role === 'hider';
    // 瞄准阶段狙击的人：底图不画人（雾外看不见），人只在瞄准镜里出现
    const scoped = role === 'sniper' && v.phase === 'aim' && v.status === 'playing';
    drawWallLayer(ctx, v, { ghost, showBody: !scoped });
    drawGround(ctx);
    if (role === 'hider' && v.phase === 'aim') drawLaser(ctx, now);
    if (role === 'hider' && (v.phase === 'hide' || v.phase === 'aim')) drawExposed(ctx, v, now);
    if (scoped) drawScope(ctx, v, now);
    else if (role === 'sniper' && v.phase === 'hide') {
      const ax = sx(aim.x), ay = sy(aim.y);
      ctx.strokeStyle = '#ff3346c0'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(ax, ay, 10, 0, Math.PI * 2); ctx.moveTo(ax - 16, ay); ctx.lineTo(ax + 16, ay); ctx.moveTo(ax, ay - 16); ctx.lineTo(ax, ay + 16); ctx.stroke();
    }
    drawFx(ctx, now, dt);
    if (now < flashUntil) { ctx.fillStyle = '#fff8e0b0'; ctx.fillRect(0, SCENE.y, W, SCENE.h); }
    if (turnBanner && now - turnBanner.at < 1600) {
      const t = (now - turnBanner.at) / 1600, a = t < 0.15 ? t / 0.15 : t > 0.8 ? (1 - t) / 0.2 : 1;
      ctx.globalAlpha = a;
      roundRect(ctx, 40, SCENE.y + 18, W - 80, 56, 16); ctx.fillStyle = '#1d2033dd'; ctx.fill();
      text(ctx, turnBanner.text, W / 2, SCENE.y + 38, { size: 20, color: '#fff' });
      text(ctx, turnBanner.sub, W / 2, SCENE.y + 60, { size: 11, color: '#c7cbe0', weight: 700 });
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    drawControls(ctx, v);
    if (v.status === 'over') endCard(v);
    else if (online?.result.over) endCard(v, true);
    else if (Math.floor(now / 500) !== Math.floor((now - dt * 1000) / 500)) hud(v);
    shell.poke((v.status === 'over' || online?.result.over) && !fx.length ? 0 : 100);
  };

  shell.regions = () => [
    { x: 0, y: 0, w: W, h: SCENE.y, role: 'top' },
    { x: 0, y: SCENE.y, w: W, h: SCENE.h, role: 'main' },
    { x: 0, y: SCENE.y + SCENE.h, w: W, h: H - SCENE.y - SCENE.h, role: 'bottom' }
  ];

  // ---- 联机 ----
  let round = online?.round ?? 0;
  const offs = [];
  function onlineSync() {
    driver?.received?.();
    if (online.round !== round) { round = online.round; shell.closeCard(); resetView(); }
    const v = online.view;
    if (v && v.phase === 'ready' && !v.ready[online.seat]) online.send({ type: 'ready' });
    shell.poke();
  }
  if (online) offs.push(online.on('state', onlineSync));

  begin();
  if (online) onlineSync();

  return {
    get state() { return driver?.state ?? null; },
    get view() { return driver?.view(performance.now()) ?? null; },
    get aim() { return { ...aim }; },
    restart() { if (!online) begin(); },
    level() {
      if (online) return;
      level = LEVEL_IDS[(LEVEL_IDS.indexOf(level) + 1) % LEVEL_IDS.length];
      SAVE.set({ ...SAVE.get({}), level });
      begin();
      shell.toast(`电脑难度：${BOT_LEVELS[level].label}`, 1200, SCENE.y + 120);
    },
    // 测试用：瞄到某处开一枪；把当前阶段快进到下一阶段（只在单机有效）。
    fireAt(x, y) { aim = { x, y }; lastFireAt = 0; return pressFire(performance.now()); },
    pauseBot(on = true) { if (driver?.local) driver.paused = on; },
    skip() { if (driver?.local) { const s = driver.state; s.phaseEnds = performance.now(); tick(s, performance.now()); shell.poke(); } },
    destroy() { offs.forEach((off) => off()); shell.destroy(); }
  };
}
