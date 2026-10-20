// 麻将连连看（ARCADE 28）的画面：象牙色麻将牌，点两张一样的、连得通就画出连线再消掉。
// 牌面全部用画布自绘（万字、筒子的圆、条子的竹节、风牌和三元牌），不用图片。
import { createLevel, findPair, link, outcome, remaining, tick, timeBonus, useHint, useShuffle } from './mahjong-core.js';
import { canvasGame, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 610;
const TOP = 74;
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

export function mountMahjong(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '麻将连连看游戏画布', game: 'mahjong' });
  let state = null;
  let lay = { tw: 40, th: 50, x: 0, y: TOP };
  let pick = null;
  let links = [];
  let hint = null;
  let last = performance.now();
  let progress = SAVE.get({ level: 1, best: 0 });

  const clock = () => performance.now() / 1000;
  const hud = () => onHud(`第 ${state.level} 关 · 剩 ${remaining(state) / 2} 对 · ${state.score} 分`);
  const labels = () => shell.poke();
  function begin(level, seed) {
    shell.closeCard();
    state = createLevel(level, seed);
    const tw = Math.min(44, Math.floor((W - 28) / state.cols));
    const th = Math.min(Math.round(tw * 1.28), Math.floor((H - TOP - 16) / state.rows));
    lay = { tw, th, x: Math.round((W - tw * state.cols) / 2), y: TOP + Math.round((H - TOP - 10 - th * state.rows) / 2) };
    pick = null; links = []; hint = null;
    last = performance.now();
    hud(); labels();
    shell.poke(100);
  }
  const cellXY = (r, c) => [lay.x + (c + 0.5) * lay.tw, lay.y + (r + 0.5) * lay.th];

  function choose(r, c) {
    if (shell.cardOpen || outcome(state) !== 'playing' || state.grid[r]?.[c] === undefined || state.grid[r][c] < 0) return;
    if (!pick || (pick.r === r && pick.c === c)) { pick = pick ? null : { r, c }; shell.poke(); return; }
    const result = link(state, pick, { r, c }, clock());
    if (!result.ok) { pick = { r, c }; shell.poke(); return; }
    links.push({ path: result.path, kind: result.kind, a: pick, b: { r, c }, t0: performance.now() });
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
    const c = Math.floor((p.x - lay.x) / lay.tw), r = Math.floor((p.y - lay.y) / lay.th);
    if (r >= 0 && c >= 0 && r < state.rows && c < state.cols) choose(r, c);
  });

  function finish(end) {
    if (end === 'won') {
      const level = state.level, bonus = timeBonus(state);
      progress = { level: level + 1, best: Math.max(progress.best, level) };
      SAVE.set(progress);
      const { note } = shell.card({ title: `第 ${level} 关清空！`, lines: [`消牌 ${state.score} 分 · 剩余时间奖励 ${bonus} 分`, `最高通关 第 ${progress.best} 关`], buttons: [{ label: '下一关', action: () => begin(level + 1) }], tone: 'won' });
      postScore(onResult, 'mahjong', level, note);
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
    // 时间条
    const frac = state.left / state.time;
    roundRect(ctx, 16, 42, W - 32, 12, 6);
    ctx.fillStyle = '#ffffff1a';
    ctx.fill();
    roundRect(ctx, 16, 42, Math.max(12, (W - 32) * frac), 12, 6);
    ctx.fillStyle = frac > 0.3 ? '#44c986' : frac > 0.12 ? '#ffd543' : '#ff5d80';
    ctx.fill();
    text(ctx, `${Math.ceil(state.left)} 秒`, W / 2, 49, { size: 10, color: '#0b1020' });
    // 桌布
    roundRect(ctx, lay.x - 8, lay.y - 8, lay.tw * state.cols + 16, lay.th * state.rows + 16, 14);
    ctx.fillStyle = '#1f5a3e';
    ctx.fill();
    const hintOn = hint && now < hint.until && Math.sin(now / 120) > -0.2;
    for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) {
      const kind = state.grid[r][c];
      if (kind < 0) continue;
      const glow = hintOn && hint.pair.some((p) => p.r === r && p.c === c) ? '#ffd543' : '';
      drawTile(ctx, kind, lay.x + c * lay.tw, lay.y + r * lay.th, lay.tw, lay.th, { pick: pick && pick.r === r && pick.c === c, glow });
    }
    // 连线 + 消掉的两张淡出
    links = links.filter((item) => now - item.t0 < 360);
    for (const item of links) {
      const k = (now - item.t0) / 360;
      for (const p of [item.a, item.b]) drawTile(ctx, item.kind, lay.x + p.c * lay.tw, lay.y + p.r * lay.th - k * 10, lay.tw, lay.th, { alpha: 1 - k, pick: true });
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
    if (links.length || hintOn) shell.poke(16);
  };

  begin(progress.level || 1);
  return {
    get state() { return state; },
    board: 'mahjong',
    restart() { begin(state.level, state.seed); },
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
      pick = null; hint = null;
      labels();
      shell.poke();
    },
    choose,
    pair: () => findPair(state),
    goto(level, seed) { begin(level, seed); },
    locate(r, c) { const [x, y] = cellXY(r, c); return shell.page(x, y); },
    destroy() { clearInterval(timer); shell.destroy(); }
  };
}
