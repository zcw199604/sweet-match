// 麻将连连看（ARCADE 28）的画面：象牙色麻将牌，点两张一样的、连得通就画出连线再消掉。
// 牌面全部用画布自绘（万字、筒子的圆、条子的竹节、风牌和三元牌），不用图片。
// 时间条下面一行切换「经典 / 移动模式」。移动模式里消掉之后牌会往本关的方向挤：那一行右边标着方向、牌桌那一边亮一道边，
// 牌先等连线播完再滑过去。
import { createLevel, findPair, link, outcome, remaining, tick, timeBonus, useHint, useShuffle } from './mahjong-core.js';
import { calm, canvasGame, easeOut, inRect, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const TOP = 104;
// 玩法开关的两格
const SWITCH = { classic: { x: 16, y: 66, w: 56, h: 24 }, move: { x: 72, y: 66, w: 82, h: 24 } };
const NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WINDS = ['东', '南', '西', '北'];
const SPOTS = [
  [[0.5, 0.5]],
  [[0.5, 0.27], [0.5, 0.73]],
  [[0.27, 0.22], [0.5, 0.5], [0.73, 0.78]],
  [[0.3, 0.28], [0.7, 0.28], [0.3, 0.72], [0.7, 0.72]],
  [[0.28, 0.24], [0.72, 0.24], [0.5, 0.5], [0.28, 0.76], [0.72, 0.76]],
  [[0.3, 0.2], [0.7, 0.2], [0.3, 0.5], [0.7, 0.5], [0.3, 0.8], [0.7, 0.8]],
  [[0.22, 0.16], [0.5, 0.26], [0.78, 0.36], [0.3, 0.62], [0.7, 0.62], [0.3, 0.86], [0.7, 0.86]],
  [[0.3, 0.14], [0.7, 0.14], [0.3, 0.38], [0.7, 0.38], [0.3, 0.62], [0.7, 0.62], [0.3, 0.86], [0.7, 0.86]],
  [[0.22, 0.18], [0.5, 0.18], [0.78, 0.18], [0.22, 0.5], [0.5, 0.5], [0.78, 0.5], [0.22, 0.82], [0.5, 0.82], [0.78, 0.82]]
];
const INK = '#23305a';
const RED = '#d23a3a';
const GREEN = '#1f8a4c';
const BLUE = '#2a62c9';
const SAVE = store('pao-mahjong');
const MODE_NAME = { classic: '经典', move: '移动模式' };
const TOWARD = { down: ['↓', '往下靠'], left: ['←', '往左靠'], up: ['↑', '往上靠'], right: ['→', '往右靠'] };
const SLIDE_WAIT = 200;
const SLIDE_MS = 220;

// 牌面：x, y, w, h 是牌面区域。
export function drawFace(ctx, kind, x, y, w, h) {
  const serif = '"Songti SC", "Noto Serif SC", "STSong", serif';
  if (kind < 9) {
    text(ctx, NUM[kind], x + w / 2, y + h * 0.3, { size: w * 0.46, color: INK, font: serif, weight: 900 });
    text(ctx, '万', x + w / 2, y + h * 0.72, { size: w * 0.5, color: RED, font: serif, weight: 900 });
  } else if (kind < 18) {
    const n = kind - 9, spots = SPOTS[n];
    const r = n === 0 ? w * 0.34 : n < 4 ? w * 0.17 : n < 6 ? w * 0.14 : w * 0.11;
    spots.forEach(([sx, sy], i) => {
      const color = n === 0 ? RED : [BLUE, GREEN, RED][i % 3];
      const cx = x + sx * w, cy = y + sy * h;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.62, 0, Math.PI * 2); ctx.fillStyle = '#fffaf0'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.32, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    });
  } else if (kind < 27) {
    const n = kind - 18, spots = SPOTS[n];
    const sw = n === 0 ? w * 0.18 : w * 0.11, sh = n === 0 ? h * 0.6 : n < 6 ? h * 0.22 : h * 0.17;
    spots.forEach(([sx, sy], i) => {
      const cx = x + sx * w, cy = y + sy * h;
      roundRect(ctx, cx - sw / 2, cy - sh / 2, sw, sh, sw / 2);
      ctx.fillStyle = n === 0 || (n === 4 && i === 2) || (n === 8 && i % 3 === 1) ? RED : GREEN;
      ctx.fill();
      ctx.fillStyle = '#ffffff99';
      ctx.fillRect(cx - sw * 0.5, cy - 0.6, sw, 1.2);
    });
  } else if (kind < 31) {
    text(ctx, WINDS[kind - 27], x + w / 2, y + h / 2, { size: w * 0.68, color: INK, font: serif, weight: 900 });
  } else if (kind === 31) {
    text(ctx, '中', x + w / 2, y + h / 2, { size: w * 0.7, color: RED, font: serif, weight: 900 });
  } else if (kind === 32) {
    text(ctx, '发', x + w / 2, y + h / 2, { size: w * 0.7, color: GREEN, font: serif, weight: 900 });
  } else {
    roundRect(ctx, x + w * 0.2, y + h * 0.18, w * 0.6, h * 0.64, 3);
    ctx.lineWidth = Math.max(1.5, w * 0.07);
    ctx.strokeStyle = BLUE;
    ctx.stroke();
  }
}
function drawTile(ctx, kind, x, y, w, h, { pick = false, glow = '', alpha = 1 } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  roundRect(ctx, x + 1, y + 3, w - 2, h - 2, 6);
  ctx.fillStyle = '#2f7d55';
  ctx.fill();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#fffdf6');
  g.addColorStop(1, '#efe4c8');
  roundRect(ctx, x + 1, y, w - 2, h - 4, 6);
  ctx.fillStyle = pick ? '#ffe38a' : g;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = pick ? 2.5 : 1;
  ctx.strokeStyle = pick ? '#ff9a3c' : '#d8c9a3';
  ctx.stroke();
  drawFace(ctx, kind, x + 4, y + 4, w - 8, h - 12);
  ctx.restore();
}

export function mountMahjong(wrap, { onHud = () => {}, onResult = null, onBoard = () => {} } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '麻将连连看游戏画布', game: 'mahjong' });
  let state = null;
  let lay = { tw: 40, th: 50, x: 0, y: TOP };
  let pick = null;
  let links = [];
  let hint = null;
  // 正在滑的牌：键是牌现在的格子 'r,c'，值是它从画面上哪儿 (fx, fy) 滑过来、什么时候开始
  let slides = new Map();
  let last = performance.now();
  // 两种玩法各记各的进度；旧存档（只有 level/best）算经典的
  const saved = SAVE.get({});
  let mode = saved.mode === 'move' ? 'move' : 'classic';
  const progress = { classic: saved.classic ?? { level: saved.level ?? 1, best: saved.best ?? 0 }, move: saved.move ?? { level: 1, best: 0 } };
  const persist = () => SAVE.set({ mode, ...progress });
  const board = () => (mode === 'move' ? 'mahjong-move' : 'mahjong');

  const clock = () => performance.now() / 1000;
  const hud = () => onHud(`第 ${state.level} 关 · 剩 ${remaining(state) / 2} 对 · ${state.score} 分`);
  const labels = () => shell.poke();
  function begin(level, seed) {
    shell.closeCard();
    state = createLevel(level, seed, mode);
    const tw = Math.min(44, Math.floor((W - 28) / state.cols));
    const th = Math.min(Math.round(tw * 1.28), Math.floor((H - TOP - 16) / state.rows));
    lay = { tw, th, x: Math.round((W - tw * state.cols) / 2), y: TOP + Math.round((H - TOP - 10 - th * state.rows) / 2) };
    pick = null; links = []; hint = null; slides = new Map();
    last = performance.now();
    hud(); labels(); onBoard();
    if (state.gravity !== 'none') shell.toast(`本关消掉之后，牌${TOWARD[state.gravity][1]}`, 1600);
    shell.poke(100);
  }
  const cellXY = (r, c) => [lay.x + (c + 0.5) * lay.tw, lay.y + (r + 0.5) * lay.th];
  // 牌在画面上的左上角：正在滑的按进度插值，滑之前停在原处
  function tilePos(r, c, now) {
    const x = lay.x + c * lay.tw, y = lay.y + r * lay.th, s = slides.get(`${r},${c}`);
    if (!s) return [x, y];
    const e = easeOut(Math.min(1, Math.max(0, (now - s.t0) / s.ms)));
    return [s.fx + (x - s.fx) * e, s.fy + (y - s.fy) * e];
  }
  const sliding = (now) => [...slides.values()].some((s) => now < s.t0 + s.ms);
  // 核心已经挤好了，画面上让挪了位置的牌从「现在看到的位置」滑到新格子；连着消也能接上
  function slideMoves(moves, now) {
    const wait = calm() ? 0 : SLIDE_WAIT, ms = calm() ? 1 : SLIDE_MS;
    const from = moves.map((m) => tilePos(m.from[0], m.from[1], now));
    const sources = new Set(moves.map((m) => m.from.join(',')));
    const next = new Map();
    for (const [key, s] of slides) {
      const [r, c] = key.split(',').map(Number);
      if (!sources.has(key) && state.grid[r][c] >= 0 && now < s.t0 + s.ms) next.set(key, s);
    }
    moves.forEach((m, i) => next.set(m.to.join(','), { fx: from[i][0], fy: from[i][1], t0: now + wait, ms }));
    slides = next;
    shell.poke(wait + ms + 50);
  }
  // 按牌在画面上的位置点中（滑动途中也点得准）
  function cellAt(p, now) {
    for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) {
      if (state.grid[r][c] < 0) continue;
      const [x, y] = tilePos(r, c, now);
      if (p.x >= x && p.x < x + lay.tw && p.y >= y && p.y < y + lay.th) return { r, c };
    }
    return null;
  }

  function choose(r, c) {
    if (shell.cardOpen || outcome(state) !== 'playing' || state.grid[r]?.[c] === undefined || state.grid[r][c] < 0) return;
    if (!pick || (pick.r === r && pick.c === c)) { pick = pick ? null : { r, c }; shell.poke(); return; }
    const now = performance.now(), at = [tilePos(pick.r, pick.c, now), tilePos(r, c, now)];
    const result = link(state, pick, { r, c }, clock());
    if (!result.ok) { pick = { r, c }; shell.poke(); return; }
    links.push({ path: result.path, kind: result.kind, at, t0: now });
    if (result.shuffled) slides = new Map();
    else if (result.moves.length) slideMoves(result.moves, now);
    if (state.combo > 1) shell.toast(`连击 ×${state.combo}`, 700, 40);
    if (result.shuffled) shell.toast('没有能连的了，自动洗牌', 1300);
    pick = null; hint = null;
    hud();
    shell.poke(400);
    if (outcome(state) === 'won') setTimeout(() => { if (shell.alive && outcome(state) === 'won' && !shell.cardOpen) finish('won'); }, 450);
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    const p = shell.point(event);
    const other = mode === 'move' ? 'classic' : 'move';
    if (inRect(p, SWITCH[other])) return api.mode();
    const cell = cellAt(p, performance.now());
    if (cell) choose(cell.r, cell.c);
  });

  function finish(end) {
    if (end === 'won') {
      const level = state.level, bonus = timeBonus(state);
      progress[mode] = { level: level + 1, best: Math.max(progress[mode].best, level) };
      persist();
      const { note } = shell.card({ title: `第 ${level} 关清空！`, lines: [`消牌 ${state.score} 分 · 剩余时间奖励 ${bonus} 分`, `${MODE_NAME[mode]}最高通关 第 ${progress[mode].best} 关`], buttons: [{ label: '下一关', action: () => begin(level + 1) }], tone: 'won' });
      postScore(onResult, board(), level, note);
    } else {
      const { level, seed } = state;
      shell.card({ title: '时间到', lines: [`还剩 ${remaining(state) / 2} 对没消。`, '同样的牌再来一次，先消外圈、给里面的牌腾出路。'], buttons: [{ label: '重试本关', action: () => begin(level, seed) }], tone: 'lost' });
    }
  }
  const timer = setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1000;
    last = now;
    if (!state || shell.cardOpen || document.hidden || outcome(state) !== 'playing') return;
    tick(state, Math.min(dt, 0.5));
    shell.poke();
    if (outcome(state) === 'lost') finish('lost');
  }, 200);

  shell.render = (ctx, now) => {
    text(ctx, `第 ${state.level} 关`, 16, 22, { size: 18, align: 'left' });
    text(ctx, `提示 ${state.hints} · 洗牌 ${state.shuffles}`, W / 2 + 10, 22, { size: 12, color: '#c9cdf0', weight: 700 });
    text(ctx, `${state.score} 分`, W - 16, 22, { size: 15, align: 'right', color: '#ffd543' });
    // 时间条；移动模式右边让出一块标方向
    const frac = state.left / state.time, moving = state.gravity !== 'none';
    const barW = W - 32;
    roundRect(ctx, 16, 42, barW, 12, 6);
    ctx.fillStyle = '#ffffff1a';
    ctx.fill();
    roundRect(ctx, 16, 42, Math.max(12, barW * frac), 12, 6);
    ctx.fillStyle = frac > 0.3 ? '#44c986' : frac > 0.12 ? '#ffd543' : '#ff5d80';
    ctx.fill();
    text(ctx, `${Math.ceil(state.left)} 秒`, 16 + barW / 2, 49, { size: 10, color: '#0b1020' });
    // 玩法开关；右边说明这一关的牌动不动、往哪边挤
    roundRect(ctx, SWITCH.classic.x, SWITCH.classic.y, SWITCH.move.x + SWITCH.move.w - SWITCH.classic.x, SWITCH.classic.h, 12);
    ctx.fillStyle = '#ffffff14'; ctx.fill();
    for (const id of ['classic', 'move']) {
      const r = SWITCH[id], on = id === mode;
      if (on) { roundRect(ctx, r.x + 2, r.y + 2, r.w - 4, r.h - 4, 10); ctx.fillStyle = '#ffd543'; ctx.fill(); }
      text(ctx, MODE_NAME[id], r.x + r.w / 2, r.y + r.h / 2 + 0.5, { size: 12, color: on ? '#3a2a00' : '#c9cdf0', weight: on ? 900 : 700 });
    }
    if (moving) {
      const [arrow, words] = TOWARD[state.gravity];
      roundRect(ctx, W - 94, 66, 78, 24, 12);
      ctx.fillStyle = '#ffd54326'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffd543aa'; ctx.stroke();
      text(ctx, `${arrow} ${words}`, W - 55, 78.5, { size: 12, color: '#ffe38a' });
    } else {
      text(ctx, '消掉后牌不动', W - 16, 78.5, { size: 11, color: '#9aa0cc', weight: 700, align: 'right' });
    }
    // 桌布
    const fx = lay.x - 8, fy = lay.y - 8, fw = lay.tw * state.cols + 16, fh = lay.th * state.rows + 16;
    roundRect(ctx, fx, fy, fw, fh, 14);
    ctx.fillStyle = '#1f5a3e';
    ctx.fill();
    // 牌往哪边挤，桌布那一边就亮一道边
    if (moving) {
      const edge = { down: [fx + 14, fy + fh - 4, fw - 28, 3], up: [fx + 14, fy + 1, fw - 28, 3], left: [fx + 1, fy + 14, 3, fh - 28], right: [fx + fw - 4, fy + 14, 3, fh - 28] }[state.gravity];
      ctx.save();
      ctx.shadowColor = '#ffd543'; ctx.shadowBlur = 8;
      roundRect(ctx, ...edge, 1.5);
      ctx.fillStyle = '#ffd543cc'; ctx.fill();
      ctx.restore();
    }
    const hintOn = hint && now < hint.until && Math.sin(now / 120) > -0.2;
    for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) {
      const kind = state.grid[r][c];
      if (kind < 0) continue;
      const glow = hintOn && hint.pair.some((p) => p.r === r && p.c === c) ? '#ffd543' : '';
      const [x, y] = tilePos(r, c, now);
      drawTile(ctx, kind, x, y, lay.tw, lay.th, { pick: pick && pick.r === r && pick.c === c, glow });
    }
    // 连线 + 消掉的两张淡出
    links = links.filter((item) => now - item.t0 < 360);
    for (const item of links) {
      const k = (now - item.t0) / 360;
      for (const [x, y] of item.at) drawTile(ctx, item.kind, x, y - k * 10, lay.tw, lay.th, { alpha: 1 - k, pick: true });
      ctx.save();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = '#ffe14d';
      ctx.shadowColor = '#ffe14d';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      item.path.forEach(([r, c], i) => { const [x, y] = cellXY(r, c); return i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
      ctx.restore();
    }
    for (const [key, s] of slides) if (now >= s.t0 + s.ms) slides.delete(key);
    if (links.length || hintOn || sliding(now)) shell.poke(16);
  };

  // 全屏：上面的关卡 / 时间条 / 玩法开关是信息栏，桌布连同牌是游戏区
  shell.regions = () => [
    { x: 0, y: 0, w: W, h: 94, role: 'top' },
    { x: lay.x - 12, y: lay.y - 12, w: lay.tw * state.cols + 24, h: lay.th * state.rows + 24, role: 'main' }
  ];

  const api = {
    get state() { return state; },
    get board() { return board(); },
    get playMode() { return mode; },
    restart() { begin(state.level, state.seed); },
    mode() {
      mode = mode === 'move' ? 'classic' : 'move';
      persist();
      begin(progress[mode].level || 1);
    },
    hint() {
      if (shell.cardOpen) return;
      const pair = useHint(state);
      if (!pair) return shell.toast(state.hints <= 0 ? '本关提示用完了' : '没有能连的了', 1200);
      hint = { pair, until: performance.now() + 2000 };
      labels();
      shell.poke(2050);
    },
    shuffle() {
      if (shell.cardOpen) return;
      if (!useShuffle(state)) return shell.toast('本关洗牌用完了', 1200);
      pick = null; hint = null; slides = new Map();
      labels();
      shell.poke();
    },
    choose,
    pair: () => findPair(state),
    goto(level, seed) { begin(level, seed); },
    locate(r, c) { const [x, y] = cellXY(r, c); return shell.page(x, y); },
    locateSwitch(id) { const r = SWITCH[id]; return shell.page(r.x + r.w / 2, r.y + r.h / 2); },
    destroy() { clearInterval(timer); shell.destroy(); }
  };
  begin(progress[mode].level || 1);
  return api;
}
