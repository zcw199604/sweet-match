// 数独鸭（ARCADE 40）的画面：浅色的卡片风——上面是关卡名、鸭数 / 计时胶囊和三条规则的小图示，
// 中间一块白色底板上排着一格一格分开的圆角色块（同色相邻的格子连成一片），下面是四个大按钮。
//
// 手机上的操作：
//   点一下：空 → ✕ → 鸭 → 空（点两下就是放鸭）；
//   长按约 0.35 秒：直接放鸭 / 拿走鸭，按住时格子上转一圈进度，到了轻震一下；
//   拖动：一路打 ✕（从 ✕ 上开始拖就是一路擦掉）；手指要明显移动才算拖，手抖不会误打；
//   按下时这一格缩一下、整行整列提亮，免得手指挡住看不清按的是哪格；放鸭 / 冲突时轻震（支持震动的手机）。
// 电脑上右键直接放 / 拿鸭。左上角是色弱模式（每种颜色加一个形状符号），右上角是音效开关，点标题换难度。
// 音效见 duck-sound.js；动画：开局色块波浪弹出、落鸭溅水、冲突发抖、闲时眨眼、通关跳跃和彩纸。
import { CROSS, DUCK, EMPTY, LEVELS, conflicts, covered, createGame, cycle, ducksOf, hintStep, setMark } from './duck-core.js';
import { calm, canvasGame, easeOut, inRect, postScore, roundRect, store, text } from './kit.js';
import { duckSound } from './duck-sound.js';

const W = 360;
const H = 544;
const IDS = Object.keys(LEVELS);
const SAVE = store('pao-duck');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const INK = '#2b2f45';
const SUB = '#7a809c';
const LINE = '#dfe3f0';
// 区域配色：平涂的糖果色。区域之间靠白色缝隙分开；色弱模式再给每种颜色加一个形状。
const PALETTE = ['#a9d88f', '#e8bf4f', '#fda96c', '#69bce6', '#e07b7b', '#b39ae8', '#5fcfbf', '#f39cc0', '#c9a27e', '#9aa9c9'];
const SHAPES = ['circle', 'triangle', 'square', 'diamond', 'star', 'heart', 'plus', 'ring', 'hex', 'bar'];
const LONG_PRESS = 350;
const easeBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// ---- 版面（逻辑坐标 360×544） ----
const BLIND = { x: 6, y: 4, w: 36, h: 36 };
const SOUND = { x: W - 42, y: 4, w: 36, h: 36 };
const TITLE = { x: 90, y: 4, w: 180, h: 36 };
const LEGEND = { x: 6, y: 78, w: W - 12, h: 46 };
const BOARD = { x: 4, y: 132, w: W - 8, h: 352 };
const TOOLS = ['undo', 'clear', 'hint', 'auto'].map((key, k) => ({ key, rect: { x: 8 + k * 88, y: 492, w: 80, h: 44 } }));
const TOOL_LABEL = { undo: '撤销', clear: '清空', hint: '提示', auto: '自动✕' };
const TOAST_Y = BOARD.y + BOARD.h - 28;

// ---- 小黄鸭：朝左的侧身，(x, y) 是格子中心，s 是格子边长；sticker 时外面描一圈白边，放在任何颜色上都清楚 ----
export function drawDuck(ctx, x, y, s, { lift = 0, sx = 1, sy = 1, tilt = 0, blink = false, alpha = 1, angry = false, shadow = true, sticker = true } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (shadow) {
    const k = Math.max(0.35, 1 - lift / s);
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.3, s * 0.3 * k, s * 0.07 * k, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2b2f4530';
    ctx.fill();
  }
  // 以脚底为原点压扁 / 拉长，再整体抬高
  ctx.translate(x, y + s * 0.28 - lift);
  ctx.rotate(tilt);
  ctx.scale(sx, sy);
  ctx.translate(0, -s * 0.28);
  const u = (v) => v * s;
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(u(0.28), u(0.02));
    ctx.quadraticCurveTo(u(0.40), u(-0.04), u(0.42), u(-0.13));
    ctx.quadraticCurveTo(u(0.47), u(0.06), u(0.34), u(0.16));
    ctx.closePath();
    ctx.moveTo(u(0.38), u(0.10));
    ctx.ellipse(u(0.05), u(0.10), u(0.33), u(0.2), 0, 0, Math.PI * 2);
  };
  const headPath = () => { ctx.beginPath(); ctx.arc(u(-0.12), u(-0.13), u(0.19), 0, Math.PI * 2); };
  const beakPath = () => { ctx.beginPath(); ctx.ellipse(u(-0.32), u(-0.09), u(0.11), u(0.055), 0.08, 0, Math.PI * 2); };
  ctx.lineJoin = 'round';
  if (sticker) {
    ctx.lineWidth = u(0.17);
    ctx.strokeStyle = '#ffffff';
    bodyPath(); ctx.stroke();
    headPath(); ctx.stroke();
    beakPath(); ctx.stroke();
  }
  // 先用粗描边画出外轮廓，再填色盖住内侧，身子和头的轮廓就连成一整只
  ctx.lineWidth = u(0.07);
  ctx.strokeStyle = '#d18a12';
  bodyPath(); ctx.stroke();
  headPath(); ctx.stroke();
  const g = ctx.createLinearGradient(0, u(-0.32), 0, u(0.3));
  g.addColorStop(0, '#fff7c2');
  g.addColorStop(0.42, '#ffd84a');
  g.addColorStop(1, '#f5a524');
  ctx.fillStyle = g;
  bodyPath(); ctx.fill();
  headPath(); ctx.fill();
  // 呆毛
  ctx.beginPath();
  ctx.moveTo(u(-0.13), u(-0.31));
  ctx.quadraticCurveTo(u(-0.1), u(-0.42), u(-0.02), u(-0.39));
  ctx.lineWidth = u(0.035);
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#e8a419';
  ctx.stroke();
  // 翅膀
  ctx.beginPath();
  ctx.ellipse(u(0.11), u(0.1), u(0.15), u(0.085), -0.35, 0, Math.PI * 2);
  ctx.fillStyle = '#f7b62a';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(u(0.09), u(0.07), u(0.09), u(0.035), -0.35, Math.PI, Math.PI * 2);
  ctx.strokeStyle = '#ffe58a';
  ctx.lineWidth = u(0.025);
  ctx.stroke();
  // 头顶高光
  ctx.beginPath();
  ctx.ellipse(u(-0.07), u(-0.24), u(0.075), u(0.035), -0.2, 0, Math.PI * 2);
  ctx.fillStyle = '#fffbe6cc';
  ctx.fill();
  // 嘴
  beakPath();
  ctx.fillStyle = '#ff8a2a';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(u(-0.42), u(-0.085));
  ctx.quadraticCurveTo(u(-0.33), u(-0.07), u(-0.24), u(-0.09));
  ctx.strokeStyle = '#d65a12';
  ctx.lineWidth = u(0.02);
  ctx.stroke();
  // 腮红
  ctx.beginPath();
  ctx.ellipse(u(-0.07), u(-0.06), u(0.045), u(0.028), 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ff8fa3aa';
  ctx.fill();
  // 眼睛
  ctx.fillStyle = '#2b1d0e';
  ctx.beginPath();
  ctx.ellipse(u(-0.17), u(-0.17), u(0.034), blink ? u(0.007) : u(0.044), 0, 0, Math.PI * 2);
  ctx.fill();
  if (!blink) {
    ctx.beginPath();
    ctx.arc(u(-0.182), u(-0.188), u(0.013), 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  if (angry) {
    ctx.beginPath();
    ctx.moveTo(u(-0.23), u(-0.26));
    ctx.lineTo(u(-0.12), u(-0.23));
    ctx.strokeStyle = '#7a2d14';
    ctx.lineWidth = u(0.03);
    ctx.stroke();
  }
  ctx.restore();
}

// 色弱模式的形状符号：以 (x, y) 为中心、半径 r。
function drawShape(ctx, kind, x, y, r) {
  ctx.beginPath();
  const poly = (k, rot, rr) => { for (let i = 0; i < k; i += 1) { const a = rot + (i * Math.PI * 2) / k; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); };
  if (kind === 'circle') ctx.arc(x, y, r * 0.85, 0, Math.PI * 2);
  else if (kind === 'triangle') poly(3, -Math.PI / 2, r * 1.1);
  else if (kind === 'square') ctx.rect(x - r * 0.75, y - r * 0.75, r * 1.5, r * 1.5);
  else if (kind === 'diamond') poly(4, 0, r * 1.05);
  else if (kind === 'hex') poly(6, 0, r);
  else if (kind === 'bar') ctx.rect(x - r, y - r * 0.35, r * 2, r * 0.7);
  else if (kind === 'plus') { ctx.rect(x - r, y - r * 0.32, r * 2, r * 0.64); ctx.rect(x - r * 0.32, y - r, r * 0.64, r * 2); }
  else if (kind === 'star') { for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r * 1.1; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
  else if (kind === 'heart') {
    ctx.moveTo(x, y + r * 0.9);
    ctx.bezierCurveTo(x - r * 1.3, y - r * 0.1, x - r * 0.6, y - r * 1.1, x, y - r * 0.35);
    ctx.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.3, y - r * 0.1, x, y + r * 0.9);
  } else if (kind === 'ring') { ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); ctx.arc(x, y, r * 0.45, 0, Math.PI * 2, true); }
  // 「十」字两条矩形交叠，用 nonzero 填满；圆环靠反向的内圈挖空
  ctx.fill();
}

function wrapLines(ctx, value, max, size) {
  ctx.save();
  ctx.font = `800 ${size}px Manrope, system-ui, sans-serif`;
  const out = [];
  let cur = '';
  for (const ch of value) {
    if (cur && ctx.measureText(cur + ch).width > max) { out.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) out.push(cur);
  ctx.restore();
  return out;
}
// 浅色的「键帽」：白底、浅描边、底下一道厚边当阴影。
function keycap(ctx, r, { on = false, round = false } = {}) {
  const rad = round ? r.w / 2 : 14;
  ctx.save();
  roundRect(ctx, r.x, r.y + 3, r.w, r.h, rad);
  ctx.fillStyle = on ? '#e9b937' : '#cdd3e6';
  ctx.fill();
  roundRect(ctx, r.x, r.y, r.w, r.h, rad);
  ctx.fillStyle = on ? '#fff4c7' : '#ffffff';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = on ? '#efc54f' : LINE;
  ctx.stroke();
  ctx.restore();
}
// 底部按钮的小图标（18px 见方，中心在 x, y）。
function toolIcon(ctx, key, x, y) {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (key === 'undo') {
    ctx.arc(x + 1, y + 1, 7, Math.PI * 1.05, Math.PI * 2.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 5); ctx.lineTo(x - 6.5, y + 2); ctx.lineTo(x, y - 1.5);
    ctx.stroke();
  } else if (key === 'clear') {
    // 橡皮擦：斜放的两色小块
    ctx.translate(x, y);
    ctx.rotate(-0.6);
    roundRect(ctx, -9, -5, 18, 10, 3);
    ctx.fillStyle = '#ff9fb2';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(1, -5); ctx.lineTo(1, 5);
    ctx.stroke();
  } else if (key === 'hint') {
    ctx.arc(x, y - 2.5, 6.5, Math.PI * 0.8, Math.PI * 2.2);
    ctx.lineTo(x + 3, y + 6);
    ctx.lineTo(x - 3, y + 6);
    ctx.closePath();
    ctx.fillStyle = '#ffd84a';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 2.5, y + 9.5); ctx.lineTo(x + 2.5, y + 9.5);
    ctx.stroke();
  } else {
    roundRect(ctx, x - 8, y - 8, 16, 16, 4);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 3.5); ctx.lineTo(x + 3.5, y + 3.5);
    ctx.moveTo(x + 3.5, y - 3.5); ctx.lineTo(x - 3.5, y + 3.5);
    ctx.stroke();
  }
  ctx.restore();
}

export function mountDuck(wrap, { onHud = () => {}, onResult = null, onButtons = () => {}, onBoard = () => {} } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '数独鸭游戏画布', game: 'duck' });
  const saved = SAVE.get({ level: 'easy', games: {}, auto: true });
  let level = IDS.includes(saved.level) ? saved.level : 'easy';
  const games = saved.games ?? {};
  let auto = saved.auto !== false;
  let blind = saved.blind === true;
  const sfx = duckSound(saved.sound !== false);
  let hush = false; // 清空、一键解题这类成批改格子时不逐格出声
  let touch = false; // 最近一次是手指操作：只有这时才震动
  let game = null;
  let lay = null;
  let drag = null;
  let undo = [];
  let startedAt = 0;
  let introAt = 0;
  let winAt = 0;
  let hint = null; // { focus:Set, why, t0 }
  let confetti = [];
  const fx = new Map(); // 格子 → { kind: 'drop' | 'leave' | 'pop' | 'idle' | 'shake', t0 }
  const motion = () => !calm();
  const buzz = (pattern) => { if (touch) try { navigator.vibrate?.(pattern); } catch { /* 不支持就算了 */ } };

  const elapsed = () => game.elapsed + (startedAt ? (performance.now() - startedAt) / 1000 : 0);
  const persist = () => { if (startedAt) { game.elapsed = elapsed(); startedAt = performance.now(); } SAVE.set({ level, games: { ...games, [level]: game }, auto, blind, sound: sfx.on }); };
  const hud = () => onHud(`${LEVELS[level].label} ${game.size}×${game.size} · ⏱ ${mmss(elapsed())}${game.hinted ? ' · 用过提示' : ''}`);
  const labels = () => onButtons({ level: `${LEVELS[level].label} · 换难度` });

  function layout() {
    const n = game.size;
    const cell = Math.floor(Math.min((BOARD.w - 16) / n, 60));
    const size = cell * n;
    lay = { cell, size, gap: Math.max(2, Math.round(cell * 0.08)), gx: Math.round((W - size) / 2), gy: BOARD.y + Math.round((BOARD.h - size) / 2) };
  }
  function load(nextLevel, fresh = false) {
    if (game && startedAt) persist();
    level = nextLevel;
    game = !fresh && games[level] && !games[level].done ? games[level] : createGame(level, Date.now());
    games[level] = game;
    startedAt = 0;
    undo = [];
    hint = null;
    winAt = 0;
    confetti = [];
    if (drag) clearTimeout(drag.timer);
    drag = null;
    fx.clear();
    shell.closeCard();
    layout();
    labels();
    onBoard();
    persist();
    hud();
    introAt = motion() ? performance.now() : 0;
    shell.poke(900);
    sfx.play('deal');
  }

  // ---- 输入 ----
  const cellAt = (p) => {
    const c = Math.floor((p.x - lay.gx) / lay.cell), r = Math.floor((p.y - lay.gy) / lay.cell);
    return r >= 0 && c >= 0 && r < game.size && c < game.size ? r * game.size + c : null;
  };
  const centre = (i) => ({ x: lay.gx + ((i % game.size) + 0.5) * lay.cell, y: lay.gy + (Math.floor(i / game.size) + 0.5) * lay.cell });
  function effect(i, kind, ms) {
    if (!motion()) return;
    fx.set(i, { kind, t0: performance.now() });
    shell.poke(ms);
  }
  function apply(i, value, group) {
    const prev = game.marks[i];
    const before = conflicts(game);
    if (!setMark(game, i, value)) return;
    group.push([i, prev]);
    if (!startedAt) startedAt = performance.now();
    hint = null;
    if (value === DUCK) {
      effect(i, 'drop', 520);
      // 新放的鸭和谁打架了：双方一起抖一下
      for (const j of conflicts(game)) if (j !== i && !before.has(j)) effect(j, 'shake', 360);
    } else if (prev === DUCK) effect(i, 'leave', 260);
    else if (value === CROSS) effect(i, 'pop', 200);
    if (!hush) {
      if (value === DUCK) {
        sfx.play('place');
        if (conflicts(game).has(i)) { sfx.play('clash', { delay: 0.3 }); buzz([18, 50, 18]); } else buzz(12);
      } else if (prev === DUCK) sfx.play('pickup');
      else sfx.play(value === CROSS ? 'cross' : 'erase');
    }
    if (game.done) win();
  }
  function commit(group) {
    if (group.length) { undo.push(group); persist(); }
    hud();
    shell.poke();
  }
  function press(key) {
    if (key === 'undo') return back();
    if (key === 'clear') return clearAll();
    if (key === 'hint') return giveHint();
    auto = !auto;
    persist();
    sfx.play('toggle');
    shell.toast(auto ? '自动标记：开' : '自动标记：关', 1000, TOAST_Y);
    shell.poke();
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    touch = event.pointerType === 'touch';
    sfx.unlock();
    const p = shell.point(event);
    if (inRect(p, SOUND)) return toggleSound();
    if (inRect(p, BLIND)) return toggleBlind();
    if (inRect(p, TITLE)) return nextLevel();
    for (const t of TOOLS) if (inRect(p, t.rect)) return press(t.key);
    if (game.done || shell.cardOpen) return;
    const at = cellAt(p);
    if (at === null) return;
    if (drag) clearTimeout(drag.timer);
    const mine = { start: at, last: at, from: p, point: p, mode: null, long: false, t0: performance.now(), group: [], right: event.button === 2, timer: 0 };
    drag = mine;
    // 长按：直接放 / 拿鸭（右键本来就是这个意思，不用等）
    if (!mine.right) {
      mine.timer = setTimeout(() => {
        if (drag !== mine || mine.mode || game.done) return;
        mine.long = true;
        apply(mine.start, game.marks[mine.start] === DUCK ? EMPTY : DUCK, mine.group);
        shell.poke();
      }, LONG_PRESS);
      shell.poke(LONG_PRESS + 60);
    }
    try { shell.canvas.setPointerCapture(event.pointerId); } catch { /* synthetic event */ }
    shell.poke();
  });
  function paint(i) {
    const cur = game.marks[i];
    if (drag.mode === 'cross' && cur === EMPTY) apply(i, CROSS, drag.group);
    else if (drag.mode === 'erase' && cur === CROSS) apply(i, EMPTY, drag.group);
  }
  shell.on('pointermove', (event) => {
    if (!drag || drag.right || drag.long || game.done) return;
    const p = shell.point(event);
    if (!drag.mode) {
      // 手指一按下总会抖几像素：明显移动了才当成拖动
      if (Math.hypot(p.x - drag.from.x, p.y - drag.from.y) < Math.max(8, lay.cell * 0.32)) return;
      clearTimeout(drag.timer);
      drag.mode = game.marks[drag.start] === CROSS ? 'erase' : 'cross';
      paint(drag.start);
    }
    // 指针移动得快会跳过格子：沿着这一段每隔三分之一格取一个点
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - drag.point.x, p.y - drag.point.y) / (lay.cell / 3)));
    for (let k = 1; k <= steps && !game.done; k += 1) {
      const at = cellAt({ x: drag.point.x + ((p.x - drag.point.x) * k) / steps, y: drag.point.y + ((p.y - drag.point.y) * k) / steps });
      if (at === null || at === drag.last) continue;
      drag.last = at;
      paint(at);
    }
    drag.point = p;
    shell.poke();
  });
  const endDrag = (event) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    clearTimeout(d.timer);
    if (!d.mode && !d.long && event.type === 'pointerup' && !game.done) {
      const cur = game.marks[d.start];
      apply(d.start, d.right ? (cur === DUCK ? EMPTY : DUCK) : cycle(cur), d.group);
    }
    commit(d.group);
  };
  shell.on('pointerup', endDrag);
  shell.on('pointercancel', endDrag);
  shell.on('contextmenu', (event) => event.preventDefault());
  function back() {
    if (game.done || shell.cardOpen) return;
    const group = undo.pop();
    if (!group) return shell.toast('没有可以撤销的了', 1000, TOAST_Y);
    for (const [i, prev] of [...group].reverse()) {
      if (prev === DUCK) effect(i, 'drop', 520);
      else if (game.marks[i] === DUCK) effect(i, 'leave', 260);
      game.marks[i] = prev;
    }
    hint = null;
    sfx.play('undo');
    persist();
    shell.poke();
  }
  function clearAll() {
    if (game.done || shell.cardOpen) return;
    const group = [];
    hush = true;
    game.marks.forEach((v, i) => { if (v !== EMPTY) apply(i, EMPTY, group); });
    hush = false;
    if (!group.length) return shell.toast('棋盘已经是空的了', 1000, TOAST_Y);
    sfx.play('clear');
    commit(group);
  }
  function giveHint() {
    if (game.done || shell.cardOpen) return;
    sfx.unlock();
    const before = [...game.marks];
    const step = hintStep(game);
    if (!step) return;
    sfx.play('hint');
    if (step.cells.some((i) => game.marks[i] === DUCK)) sfx.play('place', { delay: 0.12 });
    const group = step.cells.map((i) => [i, before[i]]);
    for (const i of step.cells) {
      if (game.marks[i] === DUCK) effect(i, 'drop', 520);
      else if (before[i] === DUCK) effect(i, 'leave', 260);
      else if (game.marks[i] === CROSS) effect(i, 'pop', 200);
    }
    if (!startedAt) startedAt = performance.now();
    if (group.length) undo.push(group);
    hint = { focus: new Set(step.focus), why: step.why, t0: performance.now() };
    persist();
    hud();
    shell.poke(2400);
    if (game.done) { hint = null; win(); }
  }
  function toggleSound() {
    sfx.on = !sfx.on;
    sfx.unlock();
    sfx.play('place');
    persist();
    shell.toast(sfx.on ? '音效已打开' : '已静音', 900, TOAST_Y);
  }
  function toggleBlind() {
    blind = !blind;
    persist();
    sfx.play('toggle');
    shell.toast(blind ? '色弱模式：每种颜色加了一个形状' : '色弱模式已关闭', 1200, TOAST_Y);
  }
  function nextLevel() {
    sfx.unlock();
    load(IDS[(IDS.indexOf(level) + 1) % IDS.length]);
  }

  // ---- 通关 ----
  function win() {
    const time = elapsed();
    game.elapsed = time;
    startedAt = 0;
    persist();
    hud();
    winAt = performance.now();
    const n = game.size;
    // 和画面的跳跃波浪同一个节奏：第 r 行在 r × 80ms 起跳
    sfx.play('win', { rows: n, step: 0.08, delay: 0.3 });
    buzz([20, 60, 20, 60, 40]);
    const wave = motion() ? n * 80 + 700 : 0;
    if (motion()) {
      const tones = ['#ffd84a', '#ff9fb2', '#69bce6', '#a9d88f', '#b39ae8', '#fda96c'];
      confetti = Array.from({ length: 50 }, (_, k) => ({
        x: Math.random() * W, y: -20 - Math.random() * 160, vy: 70 + Math.random() * 70, sway: 0.6 + Math.random() * 1.4,
        phase: Math.random() * 6.28, spin: (Math.random() - 0.5) * 6, size: 4 + Math.random() * 4, color: tones[k % tones.length], feather: k % 3 === 0
      }));
      shell.poke(wave + 2600);
    }
    setTimeout(() => {
      if (!shell.alive || !game.done) return;
      const lines = [`${LEVELS[level].label} ${n}×${n} · 用时 ${mmss(time)}`];
      if (game.hinted) lines.push('用过提示，这一题不计入榜单。');
      const { note } = shell.card({ title: '鸭鸭全部就位！', lines, buttons: [{ label: '再来一题', action: () => load(level, true) }, { label: '看看棋盘', ghost: true, action: () => shell.closeCard() }], tone: 'won' });
      if (!game.hinted) postScore(onResult, `duck-${level}`, Math.round(time * 10), note);
    }, wave + 500);
  }

  // ---- 闲着时：随机一只鸭眨眼歪头 ----
  const idle = setInterval(() => {
    if (!motion() || !shell.alive || game.done || drag) return;
    const ducks = ducksOf(game).filter((i) => !fx.has(i));
    if (!ducks.length || Math.random() < 0.35) return;
    effect(ducks[Math.floor(Math.random() * ducks.length)], 'idle', 620);
  }, 1700);
  const timer = setInterval(() => { if (startedAt && !game.done) { hud(); shell.poke(); } }, 1000);

  // ---- 绘制 ----
  function topBar(ctx) {
    const n = game.size, count = ducksOf(game).length, bad = conflicts(game).size;
    // 左：色弱模式（睁眼 = 开）
    keycap(ctx, BLIND, { round: true, on: blind });
    const ex = BLIND.x + BLIND.w / 2, ey = BLIND.y + BLIND.h / 2;
    ctx.save();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (blind) {
      ctx.moveTo(ex - 10, ey);
      ctx.quadraticCurveTo(ex, ey - 10, ex + 10, ey);
      ctx.quadraticCurveTo(ex, ey + 10, ex - 10, ey);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(ex, ey, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = INK;
      ctx.fill();
    } else {
      ctx.moveTo(ex - 10, ey - 2);
      ctx.quadraticCurveTo(ex, ey + 7, ex + 10, ey - 2);
      for (const k of [-6, 0, 6]) { ctx.moveTo(ex + k, ey + 2.5); ctx.lineTo(ex + k * 1.3, ey + 6.5); }
      ctx.stroke();
    }
    ctx.restore();
    // 右：音效（开着画声波，关了画一个叉）
    keycap(ctx, SOUND, { round: true });
    const cx = SOUND.x + SOUND.w / 2, cy = SOUND.y + SOUND.h / 2;
    ctx.save();
    ctx.fillStyle = sfx.on ? INK : '#a3a9c2';
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath();
    ctx.moveTo(cx - 9, cy - 3.5); ctx.lineTo(cx - 5, cy - 3.5); ctx.lineTo(cx, cy - 8); ctx.lineTo(cx, cy + 8); ctx.lineTo(cx - 5, cy + 3.5); ctx.lineTo(cx - 9, cy + 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    if (sfx.on) {
      ctx.arc(cx + 1, cy, 4.5, -0.9, 0.9);
      ctx.moveTo(cx + 1 + 8 * Math.cos(-0.9), cy + 8 * Math.sin(-0.9));
      ctx.arc(cx + 1, cy, 8, -0.9, 0.9);
    } else {
      ctx.moveTo(cx + 3, cy - 4); ctx.lineTo(cx + 9, cy + 4);
      ctx.moveTo(cx + 9, cy - 4); ctx.lineTo(cx + 3, cy + 4);
    }
    ctx.stroke();
    ctx.restore();
    // 中：关卡名（点一下换难度）
    text(ctx, `${LEVELS[level].label} · ${n}×${n}`, W / 2 - 6, 23, { size: 20, color: INK, weight: 900 });
    ctx.save();
    ctx.fillStyle = SUB;
    ctx.beginPath();
    ctx.moveTo(W / 2 + 60, 20); ctx.lineTo(W / 2 + 68, 20); ctx.lineTo(W / 2 + 64, 25);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // 鸭数 / 计时两个胶囊
    const pill = (x, w) => { roundRect(ctx, x, 44, w, 28, 14); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#ccd2e6'; ctx.stroke(); };
    pill(W / 2 - 104, 98);
    drawDuck(ctx, W / 2 - 80, 58, 24, { shadow: false, sticker: false });
    const full = count === n && !bad;
    text(ctx, `${count}/${n}`, W / 2 - 38, 59, { size: 16, color: full ? '#2f8f5b' : bad ? '#d9485f' : '#4a5bd0', weight: 800, font: '"DM Mono", monospace' });
    pill(W / 2 + 6, 98);
    text(ctx, `⏱ ${mmss(elapsed())}`, W / 2 + 55, 59, { size: 15, color: INK, weight: 700, font: '"DM Mono", monospace' });
  }
  // 规则卡：平时是三条规则的小图示；冲突 / 提示 / 通关时换成一句话。
  function legend(ctx) {
    const { x, y, w, h } = LEGEND;
    const bad = conflicts(game).size;
    let msg = null;
    if (game.done) msg = { text: '每一只鸭都找到了自己的位置！', color: '#2f8f5b', bg: '#eefbf1', line: '#bfe8cb' };
    else if (bad) msg = { text: '有鸭子打架了：同一行、同一列、同一种颜色，或者挨在一起', color: '#d9485f', bg: '#fff0f2', line: '#f6c5ce' };
    else if (hint) msg = { text: hint.why, color: '#8a6400', bg: '#fff8dc', line: '#f1dc93' };
    roundRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = msg ? msg.bg : '#ffffff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = msg ? msg.line : '#d3dbf0';
    ctx.stroke();
    if (msg) {
      if (hint && !bad && !game.done) toolIcon(ctx, 'hint', x + 24, y + h / 2);
      else drawDuck(ctx, x + 24, y + h / 2 + 2, 30, { shadow: false, angry: Boolean(bad) && !game.done });
      const lines = wrapLines(ctx, msg.text, w - 64, 13).slice(0, 2);
      lines.forEach((l, k) => text(ctx, l, x + 46, y + h / 2 + 1 + (k - (lines.length - 1) / 2) * 17, { size: 13, color: msg.color, align: 'left' }));
      return;
    }
    // 三张小图：c 是同一种颜色的格子，x 打叉，d 鸭
    const seg = w / 3;
    const minis = [
      { cells: ['cx', 'cx', 'e', 'cx', 'cd', 'e', 'e', 'e', 'e'], lines: ['1 种颜色', '1 只鸭子'] },
      { cells: ['e', 'x', 'e', 'x', 'd', 'x', 'e', 'x', 'e'], lines: ['每行每列', '各 1 只鸭子'] },
      { cells: ['x', 'x', 'x', 'x', 'd', 'x', 'x', 'x', 'x'], lines: ['鸭子之间', '不能挨着'] }
    ];
    minis.forEach((m, k) => {
      const sx = x + seg * k;
      if (k) { ctx.fillStyle = '#d3dbf0'; ctx.fillRect(sx - 1, y + 9, 2, h - 18); }
      const s = 9.5, gx = sx + 12, gy = y + (h - s * 3 - 3) / 2;
      m.cells.forEach((kind, i) => {
        const cx = gx + (i % 3) * (s + 1.5), cy = gy + Math.floor(i / 3) * (s + 1.5);
        roundRect(ctx, cx, cy, s, s, 2.2);
        ctx.fillStyle = kind.startsWith('c') ? PALETTE[0] : kind === 'x' ? '#6273a8' : '#d5dcef';
        ctx.fill();
        if (kind === 'x' || kind === 'cx') {
          ctx.save();
          ctx.strokeStyle = kind === 'x' ? '#ffffff' : '#2b2f4599';
          ctx.lineWidth = 1.4;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(cx + 2.6, cy + 2.6); ctx.lineTo(cx + s - 2.6, cy + s - 2.6);
          ctx.moveTo(cx + s - 2.6, cy + 2.6); ctx.lineTo(cx + 2.6, cy + s - 2.6);
          ctx.stroke();
          ctx.restore();
        }
        if (kind === 'd' || kind === 'cd') drawDuck(ctx, cx + s / 2, cy + s / 2, s * 1.25, { shadow: false, sticker: false });
      });
      m.lines.forEach((l, j) => text(ctx, l, sx + 44 + (seg - 44) / 2, y + 16 + j * 15, { size: 11.5, color: INK }));
    });
  }
  function boardLayer(ctx, now) {
    const { size: n, region, done } = game;
    const { cell, gx, gy, gap } = lay;
    const glow = done && winAt;
    // 白色底板
    ctx.save();
    ctx.shadowColor = glow ? '#ffd84a' : '#9aa3c233';
    ctx.shadowBlur = glow ? 22 + Math.sin(now / 160) * 8 : 12;
    ctx.shadowOffsetY = glow ? 0 : 4;
    roundRect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 22);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.restore();
    roundRect(ctx, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 22);
    ctx.lineWidth = 2;
    ctx.strokeStyle = glow ? '#f1cf5a' : '#d3dbf0';
    ctx.stroke();
    const rr = Math.max(3, cell * 0.17), half = gap / 2;
    const bridge = introAt ? clamp01((now - introAt - 2 * n * 22 - 120) / 220) : 1;
    const hot = drag ? (drag.mode ? drag.last : drag.start) : null;
    const pressed = drag && !drag.mode ? drag.start : null;
    for (let i = 0; i < n * n; i += 1) {
      const r = Math.floor(i / n), c = i % n, x = gx + c * cell, y = gy + r * cell, g = region[i];
      let k = 1;
      if (introAt) k = easeBack(clamp01((now - introAt - (r + c) * 22) / 280));
      if (k <= 0) continue;
      if (pressed === i) k *= 0.9; // 按下的这一格缩一下
      ctx.save();
      if (k !== 1) { ctx.translate(x + cell / 2, y + cell / 2); ctx.scale(k, k); ctx.translate(-x - cell / 2, -y - cell / 2); }
      ctx.fillStyle = PALETTE[g % PALETTE.length];
      roundRect(ctx, x + half, y + half, cell - gap, cell - gap, rr);
      ctx.fill();
      ctx.restore();
      // 同色相邻的格子把中间的缝补上，连成一片（按下的那格不补，看得出它缩了）
      if (bridge > 0 && pressed !== i) {
        ctx.save();
        ctx.globalAlpha = bridge;
        ctx.fillStyle = PALETTE[g % PALETTE.length];
        const right = c + 1 < n && region[i + 1] === g && pressed !== i + 1;
        const down = r + 1 < n && region[i + n] === g && pressed !== i + n;
        if (right) ctx.fillRect(x + cell - half - rr, y + half, gap + 2 * rr, cell - gap);
        if (down) ctx.fillRect(x + half, y + cell - half - rr, cell - gap, gap + 2 * rr);
        if (right && down && region[i + n + 1] === g && pressed !== i + n + 1) ctx.fillRect(x + cell - half - 1, y + cell - half - 1, gap + 2, gap + 2);
        ctx.restore();
      }
    }
    // 色弱模式：每格左上角一个这种颜色的形状
    if (blind) {
      ctx.save();
      ctx.fillStyle = '#ffffffd9';
      for (let i = 0; i < n * n; i += 1) {
        const x = gx + (i % n) * cell, y = gy + Math.floor(i / n) * cell;
        drawShape(ctx, SHAPES[region[i] % SHAPES.length], x + half + cell * 0.18, y + half + cell * 0.18, Math.max(2.4, cell * 0.08));
      }
      ctx.restore();
    }
    // 按住 / 拖动时：这一行这一列提亮；长按转一圈进度
    if (hot !== null && !done) {
      const r = Math.floor(hot / n), c = hot % n;
      ctx.save();
      ctx.fillStyle = '#ffffff47';
      ctx.fillRect(gx, gy + r * cell, cell * n, cell);
      ctx.fillRect(gx + c * cell, gy, cell, cell * n);
      ctx.restore();
      if (!drag.mode && !drag.long && !drag.right) {
        const p = clamp01((now - drag.t0 - 110) / (LONG_PRESS - 110));
        if (p > 0) {
          const { x, y } = centre(hot);
          ctx.save();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(2.5, cell * 0.08);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(x, y, cell * 0.34, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        if (p < 1) shell.poke(30);
      }
    }
  }
  function marksLayer(ctx, now) {
    const { size: n, marks, done } = game;
    const { cell, gap } = lay;
    const bad = conflicts(game);
    const seen = auto && !done ? covered(game) : null;
    const winFade = done && winAt ? clamp01(1 - (now - winAt) / 300) : 1;
    const rr = Math.max(3, cell * 0.17);
    // 提示涉及的格子：白色描边一闪一闪
    if (hint && now - hint.t0 < 2400) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.5 + 0.45 * Math.sin((now - hint.t0) / 120);
      for (const i of hint.focus) {
        const { x, y } = centre(i);
        roundRect(ctx, x - cell / 2 + gap / 2 + 2, y - cell / 2 + gap / 2 + 2, cell - gap - 4, cell - gap - 4, rr - 1);
        ctx.stroke();
      }
      ctx.restore();
    }
    for (let i = 0; i < n * n; i += 1) {
      const { x, y } = centre(i);
      const f = fx.get(i);
      const t = f ? now - f.t0 : 0;
      if (marks[i] === CROSS && winFade > 0) {
        const k = f?.kind === 'pop' ? easeBack(clamp01(t / 200)) : 1;
        const m = cell * 0.16 * k;
        ctx.save();
        ctx.globalAlpha = winFade;
        ctx.strokeStyle = '#2b2f458c';
        ctx.lineWidth = Math.max(2, cell * 0.075);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - m, y - m); ctx.lineTo(x + m, y + m);
        ctx.moveTo(x + m, y - m); ctx.lineTo(x - m, y + m);
        ctx.stroke();
        ctx.restore();
      } else if (marks[i] === EMPTY && seen?.has(i)) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.8, cell * 0.06), 0, Math.PI * 2);
        ctx.fillStyle = '#2b2f4545';
        ctx.fill();
      }
    }
    // 鸭子按行从上往下画，下一行的鸭子盖住上一行跳起来的影子
    for (let i = 0; i < n * n; i += 1) {
      const { x, y } = centre(i);
      const f = fx.get(i);
      const t = f ? now - f.t0 : 0;
      if (marks[i] !== DUCK) {
        if (f?.kind === 'leave' && t < 260) {
          const p = t / 260;
          drawDuck(ctx, x, y, cell * 0.86, { alpha: 1 - p, sx: 1 - p * 0.6, sy: 1 - p * 0.6, lift: p * cell * 0.3 });
        }
        continue;
      }
      const angry = bad.has(i);
      if (angry) {
        const pulse = 0.55 + 0.35 * Math.sin(now / 140);
        ctx.save();
        roundRect(ctx, x - cell / 2 + gap / 2, y - cell / 2 + gap / 2, cell - gap, cell - gap, rr);
        ctx.fillStyle = '#ff3b5c38';
        ctx.fill();
        ctx.strokeStyle = '#ff3b5c';
        ctx.globalAlpha = pulse;
        ctx.lineWidth = Math.max(2, cell * 0.06);
        ctx.stroke();
        ctx.restore();
      }
      const o = { angry };
      if (f?.kind === 'drop' && t < 520) {
        const p = t / 520;
        if (p < 0.5) { o.lift = (1 - (p / 0.5) ** 2) * cell * 0.75; o.sx = 0.9; o.sy = 1.12; o.alpha = Math.min(1, p * 5); }
        else if (p < 0.7) { const q = (p - 0.5) / 0.2; o.sx = 1 + 0.18 * Math.sin(q * Math.PI); o.sy = 1 - 0.2 * Math.sin(q * Math.PI); }
        else { const q = (p - 0.7) / 0.3; o.lift = Math.sin(q * Math.PI) * cell * 0.08; }
        if (p > 0.48) splash(ctx, x, y + cell * 0.28, cell, (p - 0.48) / 0.52);
      } else if (f?.kind === 'shake' && t < 360) {
        o.tilt = Math.sin(t / 22) * 0.18 * (1 - t / 360);
      } else if (f?.kind === 'idle' && t < 620) {
        o.blink = t > 180 && t < 320;
        o.tilt = Math.sin((t / 620) * Math.PI * 2) * 0.12;
      }
      if (done && winAt && motion()) {
        const r = Math.floor(i / n), q = (now - winAt - r * 80) / 460;
        if (q > 0 && q < 1) { o.lift = Math.sin(q * Math.PI) * cell * 0.5; o.sy = 1 + Math.sin(q * Math.PI) * 0.08; o.sx = 1 - Math.sin(q * Math.PI) * 0.05; }
        else if (q >= 1) { o.lift = Math.abs(Math.sin((now - winAt) / 260 + r)) * cell * 0.06; o.blink = ((now - winAt) / 900 + i) % 3 < 0.1; }
        if (q > 0.35 && q < 1) sparkle(ctx, x, y - cell * 0.35, cell, (q - 0.35) / 0.65);
      }
      drawDuck(ctx, x, y, cell * (n >= 10 ? 0.92 : 0.86), o);
    }
    if (bad.size) shell.poke(120);
    for (const [i, f] of fx) if (now - f.t0 > 700) fx.delete(i);
  }
  function splash(ctx, x, y, cell, p) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1.2, cell * 0.04);
    for (const d of [0, 0.25]) {
      const q = clamp01((p - d) / (1 - d));
      if (q <= 0) continue;
      ctx.globalAlpha = (1 - q) * 0.95;
      ctx.beginPath();
      ctx.ellipse(x, y, cell * (0.25 + q * 0.3), cell * (0.07 + q * 0.09), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    for (let k = 0; k < 5; k += 1) {
      const a = Math.PI * (0.15 + k * 0.175), dist = cell * 0.42 * easeOut(p);
      const dx = Math.cos(a) * dist, dy = -Math.sin(a) * cell * 0.4 * Math.sin(p * Math.PI);
      ctx.globalAlpha = 1 - p;
      ctx.beginPath();
      ctx.arc(x - dx, y + dy, Math.max(1.2, cell * 0.045 * (1 - p * 0.5)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function sparkle(ctx, x, y, cell, p) {
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = '#ffcf3d';
    for (let k = 0; k < 3; k += 1) {
      const a = -Math.PI / 2 + (k - 1) * 0.9, d = cell * (0.25 + p * 0.35), s = cell * 0.07 * (1 - p * 0.4);
      const sx = x + Math.cos(a) * d, sy = y + Math.sin(a) * d;
      ctx.beginPath();
      ctx.moveTo(sx, sy - s * 1.6); ctx.lineTo(sx + s * 0.45, sy - s * 0.45); ctx.lineTo(sx + s * 1.6, sy); ctx.lineTo(sx + s * 0.45, sy + s * 0.45);
      ctx.lineTo(sx, sy + s * 1.6); ctx.lineTo(sx - s * 0.45, sy + s * 0.45); ctx.lineTo(sx - s * 1.6, sy); ctx.lineTo(sx - s * 0.45, sy - s * 0.45);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  function confettiLayer(ctx, now) {
    if (!confetti.length || !winAt) return;
    const t = (now - winAt) / 1000 - game.size * 0.08;
    if (t < 0 || t > 3.6) return;
    ctx.save();
    for (const c of confetti) {
      const y = c.y + c.vy * t, x = c.x + Math.sin(t * c.sway * 2 + c.phase) * 18;
      if (y > H + 10) continue;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(c.phase + t * c.spin);
      ctx.globalAlpha = clamp01(3.6 - t);
      ctx.fillStyle = c.color;
      ctx.beginPath();
      if (c.feather) ctx.ellipse(0, 0, c.size * 1.4, c.size * 0.5, 0, 0, Math.PI * 2);
      else ctx.rect(-c.size * 0.6, -c.size * 0.35, c.size * 1.2, c.size * 0.7);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  function toolsLayer(ctx) {
    for (const t of TOOLS) {
      const on = t.key === 'auto' && auto;
      const off = (t.key === 'undo' && !undo.length) || game.done;
      ctx.save();
      ctx.globalAlpha = off ? 0.55 : 1;
      keycap(ctx, t.rect, { on });
      toolIcon(ctx, t.key, t.rect.x + 22, t.rect.y + t.rect.h / 2);
      text(ctx, TOOL_LABEL[t.key], t.rect.x + 51, t.rect.y + t.rect.h / 2 + 1, { size: 14, color: INK });
      ctx.restore();
    }
  }
  shell.render = (ctx, now) => {
    if (introAt && now - introAt > 1400) introAt = 0;
    topBar(ctx);
    legend(ctx);
    boardLayer(ctx, now);
    marksLayer(ctx, now);
    toolsLayer(ctx);
    confettiLayer(ctx, now);
  };

  load(level);
  // 全屏：上面的标题 / 胶囊 / 规则卡、下面的按钮是信息栏，白色底板是游戏区
  shell.regions = () => [
    { x: 0, y: 0, w: W, h: LEGEND.y + LEGEND.h + 4, role: 'top' },
    { x: BOARD.x - 2, y: BOARD.y - 2, w: BOARD.w + 4, h: BOARD.h + 4, role: 'main' },
    { x: 0, y: TOOLS[0].rect.y - 4, w: W, h: H - TOOLS[0].rect.y + 4, role: 'bottom' }
  ];

  const RECTS = { sound: SOUND, blind: BLIND, title: TITLE };
  return {
    get state() { return game; },
    get board() { return `duck-${level}`; },
    restart() { sfx.unlock(); load(level, true); },
    level: nextLevel,
    hint: giveHint,
    undo: back,
    sound: toggleSound,
    get soundOn() { return sfx.on; },
    get sounds() { return [...sfx.log]; },
    get blind() { return blind; },
    // 测试用：点一下某格；按答案把鸭全部放好；画布上格子 / 按钮在页面上的位置。
    tap(i) { const g = []; apply(i, cycle(game.marks[i]), g); commit(g); },
    solve() {
      const g = [], n = game.size, answer = new Set(game.solution.map((c, r) => r * n + c));
      hush = true;
      ducksOf(game).forEach((i) => { if (!answer.has(i)) apply(i, EMPTY, g); });
      for (const i of answer) if (!game.done) apply(i, DUCK, g);
      hush = false;
      commit(g);
    },
    locate(i) { const { x, y } = centre(i); return shell.page(x, y); },
    locateButton(key) {
      const r = RECTS[key] ?? TOOLS.find((t) => t.key === key).rect;
      return shell.page(r.x + r.w / 2, r.y + r.h / 2);
    },
    locateSound() { return shell.page(SOUND.x + SOUND.w / 2, SOUND.y + SOUND.h / 2); },
    destroy() { if (startedAt) persist(); if (drag) clearTimeout(drag.timer); clearInterval(timer); clearInterval(idle); shell.destroy(); }
  };
}
