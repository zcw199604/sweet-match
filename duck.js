// 数独鸭（ARCADE 40）的画面：池塘里一块奶油色木筏，上面是糖果色的区域格子，鸭子是画布手绘的小黄鸭。
// 点一下格子：空 → ✕ → 鸭 → 空；按住拖动一路打 ✕（从 ✕ 上开始拖就是一路擦掉）；电脑上右键直接放 / 拿鸭。
// 动画：开局格子按对角线波浪弹出；鸭子从上面落下、压扁再弹回，溅起水花和涟漪；拿走时缩小飘走；
// 打架的鸭子抖一下、脚下一圈红光；闲着时随机眨眼歪头；通关时鸭子一排排跳起来，羽毛和花瓣落下。
import { CROSS, DUCK, EMPTY, LEVELS, conflicts, covered, createGame, cycle, ducksOf, hintStep, setMark } from './duck-core.js';
import { button, calm, canvasGame, easeOut, inRect, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 500;
const IDS = Object.keys(LEVELS);
const SAVE = store('pao-duck');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// 区域配色：底色 / 高光。都是偏粉的糖果色，避开鸭子的柠檬黄；区域之间另画粗边框，不只靠颜色区分。
const PALETTE = [
  ['#ffa3bd', '#ffd3df'], ['#ffbe7a', '#ffdcb5'], ['#e6cf92', '#f6e8c6'], ['#bfe36c', '#ddf2ac'], ['#78dcb2', '#b6eed6'],
  ['#6ccfe0', '#b0e8f1'], ['#8db4ff', '#c4d8ff'], ['#b7a2ff', '#d9cdff'], ['#ee9fe8', '#f7cff3'], ['#b9c4d4', '#dde3eb']
];
const INK = '#3d2f63';
const easeBack = (t) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// ---- 小黄鸭：朝左的侧身，(x, y) 是格子中心，s 是格子边长 ----
export function drawDuck(ctx, x, y, s, { lift = 0, sx = 1, sy = 1, tilt = 0, blink = false, alpha = 1, angry = false, shadow = true } = {}) {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (shadow) {
    const k = Math.max(0.35, 1 - lift / s);
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.3, s * 0.3 * k, s * 0.07 * k, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#24395a40';
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
  // 先用粗描边画出外轮廓，再填色盖住内侧，身子和头的轮廓就连成一整只
  ctx.lineJoin = 'round';
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
  ctx.beginPath();
  ctx.ellipse(u(-0.32), u(-0.09), u(0.11), u(0.055), 0.08, 0, Math.PI * 2);
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

export function mountDuck(wrap, { onHud = () => {}, onResult = null, onButtons = () => {}, onBoard = () => {} } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '数独鸭游戏画布', game: 'duck' });
  const saved = SAVE.get({ level: 'easy', games: {}, auto: true });
  let level = IDS.includes(saved.level) ? saved.level : 'easy';
  const games = saved.games ?? {};
  let auto = saved.auto !== false;
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
  const TOOLS = [
    { key: 'undo', rect: { x: 18, y: 446, w: 104, h: 42 } },
    { key: 'auto', rect: { x: 128, y: 446, w: 104, h: 42 } },
    { key: 'clear', rect: { x: 238, y: 446, w: 104, h: 42 } }
  ];
  const toolLabel = (key) => (key === 'undo' ? '↶ 撤销' : key === 'clear' ? '⟲ 清空' : `✕ 自动 ${auto ? '开' : '关'}`);

  const elapsed = () => game.elapsed + (startedAt ? (performance.now() - startedAt) / 1000 : 0);
  const persist = () => { if (startedAt) { game.elapsed = elapsed(); startedAt = performance.now(); } SAVE.set({ level, games: { ...games, [level]: game }, auto }); };
  const hud = () => onHud(`${LEVELS[level].label} ${game.size}×${game.size} · ⏱ ${mmss(elapsed())}${game.hinted ? ' · 用过提示' : ''}`);
  const labels = () => onButtons({ level: `${LEVELS[level].label} · 换难度` });

  function layout() {
    const n = game.size;
    const cell = Math.floor(Math.min(328 / n, 56));
    const size = cell * n;
    lay = { cell, size, gx: Math.round((W - size) / 2), gy: 44 + Math.round((334 - size) / 2) };
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
    fx.clear();
    shell.closeCard();
    layout();
    labels();
    onBoard();
    persist();
    hud();
    introAt = motion() ? performance.now() : 0;
    shell.poke(900);
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
    if (game.done) win();
  }
  function commit(group) {
    if (group.length) { undo.push(group); persist(); }
    hud();
    shell.poke();
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    const p = shell.point(event);
    for (const t of TOOLS) {
      if (!inRect(p, t.rect)) continue;
      if (t.key === 'undo') return back();
      if (t.key === 'clear') return clearAll();
      auto = !auto;
      persist();
      return shell.poke();
    }
    if (game.done || shell.cardOpen) return;
    const at = cellAt(p);
    if (at === null) return;
    drag = { start: at, last: at, point: p, mode: null, group: [], right: event.button === 2 };
    try { shell.canvas.setPointerCapture(event.pointerId); } catch { /* synthetic event */ }
  });
  function paint(i) {
    const cur = game.marks[i];
    if (drag.mode === 'cross' && cur === EMPTY) apply(i, CROSS, drag.group);
    else if (drag.mode === 'erase' && cur === CROSS) apply(i, EMPTY, drag.group);
  }
  shell.on('pointermove', (event) => {
    if (!drag || drag.right || game.done) return;
    const p = shell.point(event);
    // 指针移动得快会跳过格子：沿着这一段每隔三分之一格取一个点
    const steps = Math.max(1, Math.ceil(Math.hypot(p.x - drag.point.x, p.y - drag.point.y) / (lay.cell / 3)));
    for (let k = 1; k <= steps; k += 1) {
      const at = cellAt({ x: drag.point.x + ((p.x - drag.point.x) * k) / steps, y: drag.point.y + ((p.y - drag.point.y) * k) / steps });
      if (at === null || at === drag.last) continue;
      if (!drag.mode) {
        drag.mode = game.marks[drag.start] === CROSS ? 'erase' : 'cross';
        paint(drag.start);
      }
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
    if (!d.mode && event.type === 'pointerup' && !game.done) {
      const cur = game.marks[d.start];
      apply(d.start, d.right ? (cur === DUCK ? EMPTY : DUCK) : cycle(cur), d.group);
    }
    commit(d.group);
  };
  shell.on('pointerup', endDrag);
  shell.on('pointercancel', endDrag);
  shell.on('contextmenu', (event) => event.preventDefault());
  function back() {
    if (game.done) return;
    const group = undo.pop();
    if (!group) return shell.toast('没有可以撤销的了', 1000, 420);
    for (const [i, prev] of [...group].reverse()) {
      if (prev === DUCK) effect(i, 'drop', 520);
      else if (game.marks[i] === DUCK) effect(i, 'leave', 260);
      game.marks[i] = prev;
    }
    hint = null;
    persist();
    shell.poke();
  }
  function clearAll() {
    if (game.done || shell.cardOpen) return;
    const group = [];
    game.marks.forEach((v, i) => { if (v !== EMPTY) apply(i, EMPTY, group); });
    if (!group.length) return shell.toast('池塘已经是空的了', 1000, 420);
    commit(group);
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
    const wave = motion() ? n * 80 + 700 : 0;
    if (motion()) {
      const tones = ['#ffe066', '#fff6c8', '#ffb3c7', '#9fe8ff', '#c9b8ff', '#b9f0a0'];
      confetti = Array.from({ length: 46 }, (_, k) => ({
        x: Math.random() * W, y: -20 - Math.random() * 160, vy: 60 + Math.random() * 70, sway: 0.6 + Math.random() * 1.4,
        phase: Math.random() * 6.28, spin: (Math.random() - 0.5) * 6, size: 4 + Math.random() * 5, color: tones[k % tones.length], feather: k % 3 === 0
      }));
      shell.poke(wave + 2600);
    }
    setTimeout(() => {
      if (!shell.alive || !game.done) return;
      const lines = [`${LEVELS[level].label} ${n}×${n} · 用时 ${mmss(time)}`];
      if (game.hinted) lines.push('用过提示，这一题不计入榜单。');
      const { note } = shell.card({ title: '鸭鸭全部就位！', lines, buttons: [{ label: '再来一题', action: () => load(level, true) }, { label: '看看池塘', ghost: true, action: () => shell.closeCard() }], tone: 'won' });
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
  function backdrop(ctx, now) {
    // 水面上几道慢慢晃的涟漪和两片荷叶，垫在信息栏后面
    ctx.save();
    ctx.strokeStyle = '#ffffff1f';
    ctx.lineWidth = 1.4;
    for (const [x, y, r] of [[60, 412, 24], [300, 396, 30], [180, 430, 18]]) {
      const k = (now / 3200 + x / 100) % 1;
      ctx.beginPath();
      ctx.ellipse(x, y, r * (0.6 + k * 0.6), r * 0.22 * (0.6 + k * 0.6), 0, 0, Math.PI * 2);
      ctx.globalAlpha = 1 - k;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const pad = (x, y, r, rot) => {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, r, rot + 0.35, rot + Math.PI * 2 - 0.05);
      ctx.closePath();
      ctx.fillStyle = '#4fbf7a';
      ctx.fill();
      ctx.strokeStyle = '#2f8a55';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };
    pad(4, 404, 24, -0.4);
    pad(W - 2, 428, 20, 2.6);
    ctx.fillStyle = '#ffb3cf';
    for (let k = 0; k < 5; k += 1) {
      ctx.beginPath();
      ctx.ellipse(10 + Math.cos(k * 1.256) * 5, 398 + Math.sin(k * 1.256) * 5, 5, 2.6, k * 1.256, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(10, 398, 2.6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffe066';
    ctx.fill();
    ctx.restore();
  }
  function tiles(ctx, now) {
    const { size: n, region, done } = game;
    const { cell, gx, gy, size } = lay;
    // 木筏底板
    ctx.save();
    ctx.shadowColor = done && winAt ? '#ffe066' : '#06324a99';
    ctx.shadowBlur = done && winAt ? 26 + Math.sin(now / 160) * 8 : 18;
    ctx.shadowOffsetY = done && winAt ? 0 : 6;
    roundRect(ctx, gx - 7, gy - 7, size + 14, size + 14, 14);
    ctx.fillStyle = '#fff8ec';
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, gx, gy, size, size, 8);
    ctx.clip();
    for (let i = 0; i < n * n; i += 1) {
      const r = Math.floor(i / n), c = i % n, x = gx + c * cell, y = gy + r * cell;
      const [base, light] = PALETTE[region[i] % PALETTE.length];
      let k = 1;
      if (introAt) k = easeBack(clamp01((now - introAt - (r + c) * 22) / 280));
      if (k <= 0) continue;
      ctx.save();
      if (k !== 1) { ctx.translate(x + cell / 2, y + cell / 2); ctx.scale(k, k); ctx.translate(-x - cell / 2, -y - cell / 2); }
      ctx.fillStyle = base;
      ctx.fillRect(x, y, cell + 0.5, cell + 0.5);
      ctx.fillStyle = light;
      ctx.globalAlpha = 0.32;
      ctx.fillRect(x, y, cell + 0.5, cell * 0.3);
      ctx.globalAlpha = 1;
      if ((r + c) % 2) { ctx.fillStyle = '#ffffff14'; ctx.fillRect(x, y, cell, cell); }
      ctx.restore();
    }
    ctx.restore();
  }
  function grid(ctx, now) {
    const { size: n, region } = game;
    const { cell, gx, gy, size } = lay;
    const alpha = introAt ? clamp01((now - introAt - 120) / 400) : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = '#3d2f6326';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let k = 1; k < n; k += 1) {
      ctx.moveTo(gx + k * cell, gy); ctx.lineTo(gx + k * cell, gy + size);
      ctx.moveTo(gx, gy + k * cell); ctx.lineTo(gx + size, gy + k * cell);
    }
    ctx.stroke();
    // 区域之间的粗边框
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2.2, cell * 0.07);
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let r = 0; r < n; r += 1) for (let c = 0; c < n; c += 1) {
      const g = region[r * n + c], x = gx + c * cell, y = gy + r * cell;
      if (c + 1 < n && region[r * n + c + 1] !== g) { ctx.moveTo(x + cell, y); ctx.lineTo(x + cell, y + cell); }
      if (r + 1 < n && region[(r + 1) * n + c] !== g) { ctx.moveTo(x, y + cell); ctx.lineTo(x + cell, y + cell); }
    }
    ctx.stroke();
    roundRect(ctx, gx, gy, size, size, 8);
    ctx.lineWidth = Math.max(2.6, cell * 0.08);
    ctx.stroke();
    ctx.restore();
  }
  function marksLayer(ctx, now) {
    const { size: n, marks, done } = game;
    const { cell } = lay;
    const bad = conflicts(game);
    const seen = auto && !done ? covered(game) : null;
    const winFade = done && winAt ? clamp01(1 - (now - winAt) / 300) : 1;
    // 提示涉及的格子：白色描边一闪一闪
    if (hint && now - hint.t0 < 2400) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.4;
      ctx.globalAlpha = 0.45 + 0.45 * Math.sin((now - hint.t0) / 120);
      for (const i of hint.focus) {
        const { x, y } = centre(i);
        roundRect(ctx, x - cell / 2 + 2, y - cell / 2 + 2, cell - 4, cell - 4, 6);
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
        const m = cell * 0.2 * k;
        ctx.save();
        ctx.globalAlpha = winFade;
        ctx.strokeStyle = '#3d2f6380';
        ctx.lineWidth = Math.max(1.6, cell * 0.075);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - m, y - m); ctx.lineTo(x + m, y + m);
        ctx.moveTo(x + m, y - m); ctx.lineTo(x - m, y + m);
        ctx.stroke();
        ctx.restore();
      } else if (marks[i] === EMPTY && seen?.has(i)) {
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.6, cell * 0.06), 0, Math.PI * 2);
        ctx.fillStyle = '#3d2f6340';
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
          drawDuck(ctx, x, y, cell, { alpha: 1 - p, sx: 1 - p * 0.6, sy: 1 - p * 0.6, lift: p * cell * 0.3 });
        }
        continue;
      }
      const angry = bad.has(i);
      if (angry) {
        const pulse = 0.55 + 0.35 * Math.sin(now / 140);
        ctx.save();
        ctx.fillStyle = '#ff3b5c2e';
        ctx.fillRect(x - cell / 2, y - cell / 2, cell, cell);
        ctx.beginPath();
        ctx.ellipse(x, y + cell * 0.28, cell * 0.4, cell * 0.13, 0, 0, Math.PI * 2);
        ctx.strokeStyle = '#ff3b5c';
        ctx.globalAlpha = pulse;
        ctx.lineWidth = Math.max(1.6, cell * 0.06);
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
      drawDuck(ctx, x, y, cell * (n >= 10 ? 0.96 : 0.9), o);
    }
    if (bad.size) shell.poke(120);
    for (const [i, f] of fx) if (now - f.t0 > 700) fx.delete(i);
  }
  function splash(ctx, x, y, cell, p) {
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, cell * 0.035);
    for (const d of [0, 0.25]) {
      const q = clamp01((p - d) / (1 - d));
      if (q <= 0) continue;
      ctx.globalAlpha = (1 - q) * 0.9;
      ctx.beginPath();
      ctx.ellipse(x, y, cell * (0.25 + q * 0.35), cell * (0.07 + q * 0.1), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8fbff';
    for (let k = 0; k < 5; k += 1) {
      const a = Math.PI * (0.15 + k * 0.175), dist = cell * 0.45 * easeOut(p);
      const dx = Math.cos(a) * dist, dy = -Math.sin(a) * cell * 0.4 * Math.sin(p * Math.PI);
      ctx.globalAlpha = 1 - p;
      ctx.beginPath();
      ctx.arc(x - dx, y + dy, Math.max(1, cell * 0.04 * (1 - p * 0.5)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function sparkle(ctx, x, y, cell, p) {
    ctx.save();
    ctx.globalAlpha = 1 - p;
    ctx.fillStyle = '#fff6b0';
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
      if (c.feather) {
        ctx.ellipse(0, 0, c.size * 1.4, c.size * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#e0a82e88';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(-c.size * 1.4, 0); ctx.lineTo(c.size * 1.4, 0); ctx.stroke();
      } else {
        ctx.ellipse(0, 0, c.size * 0.7, c.size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }
  function topBar(ctx) {
    const n = game.size, count = ducksOf(game).length;
    text(ctx, `${LEVELS[level].label} · ${n}×${n}`, 16, 22, { size: 16, align: 'left' });
    drawDuck(ctx, W / 2 - 16, 22, 24, { shadow: false });
    text(ctx, `${count}/${n}`, W / 2 + 4, 23, { size: 15, align: 'left', color: count === n && !conflicts(game).size ? '#ffe066' : '#ffffff', font: '"DM Mono", monospace' });
    text(ctx, `⏱ ${mmss(elapsed())}`, W - 16, 22, { size: 14, align: 'right', color: '#d8f4ff', weight: 700, font: '"DM Mono", monospace' });
  }
  function message(ctx) {
    const bad = conflicts(game).size;
    let line = '每行、每列、每种颜色各放一只鸭，鸭和鸭不能挨着（斜着也不行）';
    let color = '#e4f7ff';
    if (game.done) { line = '每一只鸭都找到了自己的位置！'; color = '#ffe066'; }
    else if (bad) { line = '有鸭子打架了：同一行、同一列、同一种颜色，或者挨在一起'; color = '#ffc2cc'; }
    else if (hint) { line = `提示：${hint.why}`; color = '#fff3b0'; }
    const lines = wrapLines(ctx, line, 316, 13);
    lines.slice(0, 2).forEach((l, k) => text(ctx, l, W / 2, 404 + (k - (Math.min(2, lines.length) - 1) / 2) * 18, { size: 13, color }));
  }
  shell.render = (ctx, now) => {
    if (introAt && now - introAt > 1200) introAt = 0;
    backdrop(ctx, now);
    topBar(ctx);
    tiles(ctx, now);
    grid(ctx, now);
    marksLayer(ctx, now);
    message(ctx);
    for (const t of TOOLS) button(ctx, t.rect, toolLabel(t.key), { on: t.key === 'auto' && auto });
    confettiLayer(ctx, now);
  };

  load(level);
  // 全屏：上面的难度 / 鸭数 / 计时、下面的说明和按钮是信息栏，木筏是游戏区
  shell.regions = () => [
    { x: 0, y: 0, w: W, h: 38, role: 'top' },
    { x: lay.gx - 10, y: lay.gy - 10, w: lay.size + 20, h: lay.size + 20, role: 'main' },
    { x: 0, y: 384, w: W, h: H - 384, role: 'bottom' }
  ];

  return {
    get state() { return game; },
    get board() { return `duck-${level}`; },
    restart() { load(level, true); },
    level() { load(IDS[(IDS.indexOf(level) + 1) % IDS.length]); },
    hint() {
      if (game.done || shell.cardOpen) return;
      const before = [...game.marks];
      const step = hintStep(game);
      if (!step) return;
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
    },
    undo: back,
    // 测试用：点一下某格；按答案把鸭全部放好；某格在页面上的位置。
    tap(i) { const g = []; apply(i, cycle(game.marks[i]), g); commit(g); },
    solve() {
      const g = [], n = game.size, answer = new Set(game.solution.map((c, r) => r * n + c));
      ducksOf(game).forEach((i) => { if (!answer.has(i)) apply(i, EMPTY, g); });
      for (const i of answer) if (!game.done) apply(i, DUCK, g);
      commit(g);
    },
    locate(i) { const { x, y } = centre(i); return shell.page(x, y); },
    destroy() { if (startedAt) persist(); clearInterval(timer); clearInterval(idle); shell.destroy(); }
  };
}
