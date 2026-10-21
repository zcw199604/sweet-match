// 数织（ARCADE 29）的画面：左边、上边是数字，中间是格子；可以按住拖动一次涂一排。
// 每个难度各存一份没做完的题，计时从第一下操作开始；用过提示的题不上榜。
import { CROSS, EMPTY, FILL, LEVELS, colOf, createGame, hintCell, lineDone, rowOf, setCell } from './nonogram-core.js';
import { CANDY, button, canvasGame, inRect, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 500;
const IDS = Object.keys(LEVELS);
const SAVE = store('pao-nonogram');
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function mountNonogram(wrap, { onHud = () => {}, onResult = null, onButtons = () => {}, onBoard = () => {} } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '数织游戏画布', game: 'nonogram' });
  const saved = SAVE.get({ level: 'easy', games: {} });
  let level = IDS.includes(saved.level) ? saved.level : 'easy';
  const games = saved.games ?? {};
  let game = null;
  let lay = null;
  let tool = FILL;
  let drag = null;
  let undo = [];
  let startedAt = 0;
  let focus = null;
  const TOOLS = [
    { key: FILL, label: '■ 涂黑', rect: { x: 18, y: 446, w: 104, h: 42 } },
    { key: CROSS, label: '✕ 打叉', rect: { x: 128, y: 446, w: 104, h: 42 } },
    { key: 'undo', label: '↶ 撤销', rect: { x: 238, y: 446, w: 104, h: 42 } }
  ];

  const elapsed = () => game.elapsed + (startedAt ? (performance.now() - startedAt) / 1000 : 0);
  const persist = () => { if (startedAt) { game.elapsed = elapsed(); startedAt = performance.now(); } SAVE.set({ level, games: { ...games, [level]: game } }); };
  const hud = () => onHud(`${LEVELS[level].label} ${game.size}×${game.size} · ⏱ ${mmss(elapsed())}${game.hinted ? ' · 用过提示' : ''}`);
  const labels = () => onButtons({ level: `${LEVELS[level].label} · 换难度` });

  function layout() {
    const size = game.size;
    const font = size <= 5 ? 15 : size <= 10 ? 12 : 10;
    const maxRow = Math.max(1, ...game.rows.map((c) => c.length));
    const maxCol = Math.max(1, ...game.cols.map((c) => c.length));
    const clueW = maxRow * (font * 0.95 + 4) + 6;
    const clueH = maxCol * (font + 3) + 6;
    const cell = Math.floor(Math.min((W - 16 - clueW) / size, (H - 44 - 66 - clueH) / size, 56));
    const gx = Math.round((W - clueW - cell * size) / 2 + clueW);
    lay = { font, cell, gx, gy: 44 + clueH, clueW, clueH };
  }
  function load(nextLevel, fresh = false) {
    if (game && startedAt) persist();
    level = nextLevel;
    game = !fresh && games[level] && !games[level].done ? games[level] : createGame(level, Date.now());
    games[level] = game;
    startedAt = 0;
    undo = [];
    shell.closeCard();
    layout();
    labels();
    onBoard();
    persist();
    hud();
    shell.poke();
  }

  // ---- input ----
  const cellAt = (p) => {
    const c = Math.floor((p.x - lay.gx) / lay.cell), r = Math.floor((p.y - lay.gy) / lay.cell);
    return r >= 0 && c >= 0 && r < game.size && c < game.size ? { r, c } : null;
  };
  function apply(index, value, group) {
    const prev = game.marks[index];
    if (!setCell(game, index, value)) return;
    group.push([index, prev]);
    if (!startedAt) startedAt = performance.now();
    if (game.done) win();
  }
  function paint(r, c) {
    const index = r * game.size + c, cur = game.marks[index];
    if (drag.target === EMPTY ? cur !== drag.from : cur !== EMPTY) return;
    apply(index, drag.target, drag.group);
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    const p = shell.point(event);
    for (const t of TOOLS) {
      if (!inRect(p, t.rect)) continue;
      if (t.key === 'undo') return back();
      tool = t.key;
      return shell.poke();
    }
    if (game.done || shell.cardOpen) return;
    const at = cellAt(p);
    if (!at) return;
    const cur = game.marks[at.r * game.size + at.c];
    // 右键 / 打叉工具都是打叉；在已经是同一种标记的格子上按下就是擦掉
    const want = event.button === 2 ? CROSS : tool;
    drag = { start: at, axis: null, from: cur, target: cur === want ? EMPTY : want, group: [] };
    focus = at;
    try { shell.canvas.setPointerCapture(event.pointerId); } catch { /* synthetic event */ }
    const index = at.r * game.size + at.c;
    apply(index, drag.target, drag.group);
    hud();
    shell.poke();
  });
  shell.on('pointermove', (event) => {
    if (!drag || game.done) return;
    const at = cellAt(shell.point(event));
    if (!at) return;
    if (!drag.axis && (at.r !== drag.start.r || at.c !== drag.start.c)) drag.axis = at.r === drag.start.r ? 'row' : 'col';
    if (!drag.axis) return;
    const r = drag.axis === 'row' ? drag.start.r : at.r, c = drag.axis === 'row' ? at.c : drag.start.c;
    const [a, b] = drag.axis === 'row' ? [Math.min(c, drag.start.c), Math.max(c, drag.start.c)] : [Math.min(r, drag.start.r), Math.max(r, drag.start.r)];
    for (let k = a; k <= b && !game.done; k += 1) drag.axis === 'row' ? paint(r, k) : paint(k, c);
    focus = { r, c };
    shell.poke();
  });
  const endDrag = () => {
    if (!drag) return;
    if (drag.group.length) { undo.push(drag.group); persist(); }
    drag = null;
  };
  shell.on('pointerup', endDrag);
  shell.on('pointercancel', endDrag);
  shell.on('contextmenu', (event) => event.preventDefault());
  function back() {
    if (game.done) return;
    const group = undo.pop();
    if (!group) return shell.toast('没有可以撤销的了', 1000, 470);
    for (const [index, prev] of group.reverse()) game.marks[index] = prev;
    persist();
    shell.poke();
  }

  function win() {
    const time = elapsed();
    game.elapsed = time;
    startedAt = 0;
    persist();
    hud();
    shell.poke(600);
    setTimeout(() => {
      if (!shell.alive || !game.done) return;
      const lines = [`${LEVELS[level].label} ${game.size}×${game.size} · 用时 ${mmss(time)}`];
      if (game.hinted) lines.push('用过提示，这一题不计入榜单。');
      const { note } = shell.card({ title: '画出来了！', lines, buttons: [{ label: '再来一题', action: () => load(level, true) }, { label: '看看图', ghost: true, action: () => shell.closeCard() }], tone: 'won' });
      if (!game.hinted) postScore(onResult, `nonogram-${level}`, Math.round(time * 10), note);
    }, 700);
  }

  // ---- drawing ----
  shell.render = (ctx, now) => {
    const { size, marks, rows, cols, done } = game;
    const { cell, gx, gy, font } = lay;
    text(ctx, `${LEVELS[level].label} · ${size}×${size}`, 16, 22, { size: 16, align: 'left' });
    text(ctx, `⏱ ${mmss(elapsed())}`, W - 16, 22, { size: 14, align: 'right', color: '#c9cdf0', weight: 700, font: '"DM Mono", monospace' });
    // 底板
    roundRect(ctx, gx - 4, gy - 4, cell * size + 8, cell * size + 8, 10);
    ctx.fillStyle = '#fff8ec';
    ctx.fill();
    if (focus && !done) {
      ctx.fillStyle = '#8e7bff22';
      ctx.fillRect(gx, gy + focus.r * cell, cell * size, cell);
      ctx.fillRect(gx + focus.c * cell, gy, cell, cell * size);
    }
    // 线索
    for (let r = 0; r < size; r += 1) {
      const ok = lineDone(marks, rows[r], rowOf(marks, size, r));
      const clue = rows[r].length ? rows[r] : [0];
      clue.forEach((n, i) => text(ctx, String(n), gx - 8 - (clue.length - 1 - i) * (font * 0.95 + 4), gy + (r + 0.5) * cell + 1, { size: font, align: 'right', color: ok ? '#ffffff55' : '#ffffff', weight: 800 }));
    }
    for (let c = 0; c < size; c += 1) {
      const ok = lineDone(marks, cols[c], colOf(marks, size, c));
      const clue = cols[c].length ? cols[c] : [0];
      clue.forEach((n, i) => text(ctx, String(n), gx + (c + 0.5) * cell, gy - 8 - (clue.length - 1 - i) * (font + 3), { size: font, color: ok ? '#ffffff55' : '#ffffff', weight: 800 }));
    }
    // 格子
    for (let i = 0; i < size * size; i += 1) {
      const r = Math.floor(i / size), c = i % size, x = gx + c * cell, y = gy + r * cell;
      if (marks[i] === FILL) {
        const tone = done ? CANDY[[4, 1, 7, 2, 6][(r + c) % 5]] : CANDY[4];
        roundRect(ctx, x + 1.5, y + 1.5, cell - 3, cell - 3, Math.max(2, cell * 0.18));
        const g = ctx.createLinearGradient(0, y, 0, y + cell);
        g.addColorStop(0, tone[1]); g.addColorStop(0.4, tone[0]); g.addColorStop(1, tone[2]);
        ctx.fillStyle = g;
        ctx.fill();
      } else if (marks[i] === CROSS && !done) {
        ctx.strokeStyle = '#b4a9c8';
        ctx.lineWidth = Math.max(1.2, cell * 0.08);
        const m = cell * 0.3;
        ctx.beginPath();
        ctx.moveTo(x + m, y + m); ctx.lineTo(x + cell - m, y + cell - m);
        ctx.moveTo(x + cell - m, y + m); ctx.lineTo(x + m, y + cell - m);
        ctx.stroke();
      }
    }
    // 网格线，每 5 格加粗
    for (let k = 0; k <= size; k += 1) {
      const bold = k % 5 === 0;
      ctx.strokeStyle = bold ? '#6b5f8c' : '#d9cfe6';
      ctx.lineWidth = bold ? 1.6 : 0.8;
      ctx.beginPath();
      ctx.moveTo(gx + k * cell, gy); ctx.lineTo(gx + k * cell, gy + size * cell);
      ctx.moveTo(gx, gy + k * cell); ctx.lineTo(gx + size * cell, gy + k * cell);
      ctx.stroke();
    }
    for (const t of TOOLS) button(ctx, t.rect, t.label, { on: t.key === tool });
    void now;
  };
  const timer = setInterval(() => { if (startedAt && !game.done) { hud(); shell.poke(); } }, 1000);

  load(level);
  // 全屏：上面的难度 / 计时、下面的工具按钮是信息栏，线索连同格子是游戏区
  shell.regions = () => {
    const size = game.size, { cell, gx, gy, clueW, clueH } = lay;
    return [
      { x: 0, y: 0, w: W, h: 38, role: 'top' },
      { x: gx - clueW - 6, y: gy - clueH - 6, w: clueW + cell * size + 16, h: clueH + cell * size + 16, role: 'main' },
      { x: 0, y: TOOLS[0].rect.y - 8, w: W, h: TOOLS[0].rect.h + 16, role: 'bottom' }
    ];
  };

  return {
    get state() { return game; },
    get board() { return `nonogram-${level}`; },
    restart() { load(level, true); },
    level() { load(IDS[(IDS.indexOf(level) + 1) % IDS.length]); },
    hint() {
      if (game.done || shell.cardOpen) return;
      const index = hintCell(game);
      if (index === null) return;
      if (!startedAt && !game.done) startedAt = performance.now();
      focus = { r: Math.floor(index / game.size), c: index % game.size };
      persist();
      hud();
      if (game.done) win();
      shell.poke();
    },
    undo: back,
    // 测试用：按答案一次填完；某格在页面上的位置。
    solve() { game.solution.forEach((v, i) => { if (!game.done && v) apply(i, FILL, []); }); },
    locate(index) { return shell.page(lay.gx + (index % game.size + 0.5) * lay.cell, lay.gy + (Math.floor(index / game.size) + 0.5) * lay.cell); },
    destroy() { if (startedAt) persist(); clearInterval(timer); shell.destroy(); }
  };
}
