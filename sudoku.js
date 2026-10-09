// 数独: the view. One 2D canvas: mistakes, clock and hints on top, the 9×9 grid, a row of tools, and a number pad
// along the bottom. sudoku-core.js decides what a digit does; this module draws it in the arcade's candy
// style: dark glossy slots, the givens in plain white, every digit you place as a glossy rainbow chip
// (1 red … 9 pink), and a pad whose buttons are the same chips.
// Each difficulty keeps its own unfinished puzzle, so switching level never throws progress away.
import {
  createGame, DIFFS, DIFF_IDS, col, emptyCount, erase, firstOpen, generate, hint, isLocked, isWrong, MISTAKES, noteBit,
  pack, PEERS, place, placed, row, toggleNote, undo, unpack
} from './sudoku-core.js';

const LW = 360;
const LH = 560;
const STORE = { best: 'pao-sudoku-best', save: 'pao-sudoku-save' };
const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const mmss = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// base, light, dark for the digits 1..9 (index 0 unused).
const PAL = [null,
  ['#f04b4b', '#ff8d8d', '#a82626'], ['#ff8f2e', '#ffbb7a', '#b3560a'], ['#ffcf3d', '#ffe58a', '#b88c0a'],
  ['#a9e03a', '#d3f27f', '#6c9210'], ['#38c26b', '#86e3a8', '#1d8444'], ['#2fcfd6', '#8ceef2', '#17878d'],
  ['#3d8bff', '#8dbbff', '#1f55b3'], ['#9b6bff', '#c6aaff', '#6038c4'], ['#ff77c0', '#ffb0dc', '#b83d86']
];
const CELL = 35, GAP = 2, BOXGAP = 6;
const BOX = CELL * 3 + GAP * 2;
const GRID = { x: (LW - (BOX * 3 + BOXGAP * 2)) / 2, y: 70, size: BOX * 3 + BOXGAP * 2 };
const cellXY = (i) => {
  const r = row(i), c = col(i);
  return {
    x: GRID.x + Math.floor(c / 3) * (BOX + BOXGAP) + (c % 3) * (CELL + GAP),
    y: GRID.y + Math.floor(r / 3) * (BOX + BOXGAP) + (r % 3) * (CELL + GAP)
  };
};
const TOOLS = [
  { id: 'undo', icon: '↶', label: '撤销' },
  { id: 'erase', icon: '⌫', label: '擦除' },
  { id: 'note', icon: '✎', label: '笔记' },
  { id: 'hint', icon: '💡', label: '提示' }
];
const TB = { y: 420, w: 78, h: 52, gap: 8 };
const toolX = (k) => (LW - (TOOLS.length * TB.w + (TOOLS.length - 1) * TB.gap)) / 2 + k * (TB.w + TB.gap);
const NUM = { y: 486, w: 35, h: 66, gap: 3 };
const numX = (d) => (LW - (9 * NUM.w + 8 * NUM.gap)) / 2 + (d - 1) * (NUM.w + NUM.gap);
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

export function mountSudoku(wrap, { diff = 'normal', onHud = () => {}, onResult = null } = {}) {
  let alive = true;
  let level = DIFFS[diff] ? diff : 'normal';
  let core = null;
  let elapsed = 0;
  let lastTick = performance.now();
  let selected = -1;
  let focus = 0; // a digit picked on the pad with no cell chosen: every copy of it lights up
  let noteMode = false;
  let raf = 0;
  let toast = null;
  let shake = null; // { until, cell } a wrong digit rattles
  let settled = false;
  const best = readJson(STORE.best) ?? {};

  const canvas = el('canvas', 'game-canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = LW * dpr;
  canvas.height = LH * dpr;
  canvas.setAttribute('aria-label', '数独游戏画布');
  const overlay = el('div', 'sudoku-overlay');
  overlay.hidden = true;
  wrap.replaceChildren(canvas, overlay);
  const ctx = canvas.getContext('2d');

  const poke = () => { if (!raf && alive) raf = requestAnimationFrame(frame); };
  const say = (text) => { toast = { text, until: performance.now() + 1600 }; poke(); };
  const running = () => alive && core.status === 'playing' && overlay.hidden && !document.hidden;
  const hud = () => onHud(`${DIFFS[level].label} · 用时 ${mmss(elapsed)} · 错误 ${core.mistakes}/${MISTAKES}`);
  const save = () => {
    const all = readJson(STORE.save) ?? {};
    all[level] = core.status === 'playing' ? { ...pack(core), elapsed: Math.round(elapsed) } : null;
    writeJson(STORE.save, all);
  };
  // The clock only runs while the puzzle is in view and unfinished.
  const tick = () => {
    const now = performance.now();
    if (running()) elapsed += now - lastTick;
    lastTick = now;
    hud();
    poke();
  };
  const timer = setInterval(tick, 500);
  const onVisible = () => { tick(); if (document.hidden) save(); };
  document.addEventListener('visibilitychange', onVisible);

  // ---- a puzzle ----
  function open(next, fresh) {
    level = next;
    const saved = fresh ? null : (readJson(STORE.save) ?? {})[level];
    const resumed = saved ? unpack(saved) : null;
    core = resumed ?? createGame(generate(level));
    elapsed = resumed ? Math.max(0, Number(saved.elapsed) || 0) : 0;
    selected = -1; focus = 0; noteMode = false; settled = false; toast = null; shake = null;
    lastTick = performance.now();
    overlay.hidden = true;
    save();
    hud();
    poke();
  }
  // Same puzzle from the givens, with the clock back at zero.
  function retry() {
    const { diff: d, puzzle, solution } = core;
    core = createGame({ diff: d, puzzle, solution });
    elapsed = 0; selected = -1; focus = 0; settled = false;
    lastTick = performance.now();
    overlay.hidden = true;
    save();
    hud();
    poke();
  }

  // ---- end cards ----
  function card(title, lines, buttons, cls = '') {
    overlay.replaceChildren();
    overlay.className = `sudoku-overlay ${cls}`;
    const box = el('div', 'sudoku-card');
    box.append(el('strong', '', title));
    for (const line of lines) box.append(el('p', '', line));
    const note = el('p', 'sudoku-note');
    box.append(note);
    for (const { label, action, ghost } of buttons) {
      const button = el('button', `sudoku-again${ghost ? ' ghost' : ''}`, label);
      button.addEventListener('click', action);
      box.append(button);
    }
    overlay.append(box);
    overlay.hidden = false;
    return note;
  }
  function settle() {
    if (settled || core.status === 'playing') return;
    settled = true;
    tick();
    save();
    if (core.status === 'lost') {
      card(`错了 ${MISTAKES} 次`, ['这局先到这里：同一题可以再试，也可以换一题。'], [
        { label: '重试本题', action: retry },
        { label: '换一题', action: () => open(level, true), ghost: true }
      ]);
      return;
    }
    const time = Math.round(elapsed / 100); // tenths of a second, as the board stores it
    const fastest = best[level];
    const record = core.hints === 0 && (!fastest || time < fastest);
    if (record) { best[level] = time; writeJson(STORE.best, best); }
    const note = card('解出来了！', [
      `${DIFFS[level].label} · 用时 ${mmss(elapsed)} · 错误 ${core.mistakes} 次 · 提示 ${core.hints} 次`,
      core.hints ? '用了提示的局不计入榜单。' : `本机最快 ${mmss((best[level] ?? time) * 100)}${record ? ' · 新纪录！' : ''}`
    ], [{ label: '下一题', action: () => open(level, true) }], 'won');
    if (core.hints === 0) onResult?.(`sudoku-${level}`, time).then((text) => { if (text && note.isConnected) note.textContent = text; });
  }

  // ---- actions ----
  const after = () => { save(); hud(); poke(); settle(); };
  function digit(d) {
    if (!alive || !overlay.hidden || d < 1 || d > 9) return;
    if (selected < 0) { focus = focus === d ? 0 : d; return poke(); }
    if (noteMode && core.cells[selected] === 0) {
      if (toggleNote(core, selected, d).ok) after();
      return;
    }
    const result = place(core, selected, d);
    if (!result.ok) { if (result.reason === 'locked') say('这一格已经定了'); return; }
    focus = 0;
    if (!result.correct) { shake = { until: performance.now() + 380, cell: selected }; say(`不对，还剩 ${MISTAKES - core.mistakes} 次机会`); }
    after();
  }
  function tool(id) {
    if (!alive || !overlay.hidden) return;
    if (id === 'undo') { if (undo(core).ok) after(); else say('没有可以撤销的了'); }
    else if (id === 'erase') {
      if (selected < 0) return say('先点一格');
      if (erase(core, selected).ok) after(); else say(isLocked(core, selected) ? '这一格已经定了' : '这一格是空的');
    } else if (id === 'note') {
      noteMode = !noteMode;
      say(noteMode ? '笔记：点数字记候选' : '笔记已关闭');
    } else if (id === 'hint') {
      const at = selected >= 0 && !isLocked(core, selected) ? selected : firstOpen(core);
      if (at < 0) return;
      const first = core.hints === 0;
      if (hint(core, at).ok) { selected = at; if (first) say('用了提示：这局不计入榜单'); after(); }
    }
    poke();
  }
  // Tapping the chosen cell again lets go of it.
  function choose(i) { pick(selected === i ? -1 : i); }
  function pick(i) { selected = i; focus = 0; poke(); }

  // ---- input ----
  function onPointer(event) {
    if (!alive || !overlay.hidden) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * LW / rect.width, py = (event.clientY - rect.top) * LH / rect.height;
    if (py >= NUM.y) {
      for (let d = 1; d <= 9; d += 1) if (px >= numX(d) && px <= numX(d) + NUM.w) return digit(d);
      return;
    }
    if (py >= TB.y) {
      const k = TOOLS.findIndex((_, j) => px >= toolX(j) && px <= toolX(j) + TB.w);
      if (k >= 0 && py <= TB.y + TB.h) tool(TOOLS[k].id);
      return;
    }
    const i = cellAt(px, py);
    if (i >= 0) choose(i);
  }
  function cellAt(px, py) {
    for (let i = 0; i < 81; i += 1) {
      const { x, y } = cellXY(i);
      if (px >= x - 1 && px <= x + CELL + 1 && py >= y - 1 && py <= y + CELL + 1) return i;
    }
    return -1;
  }
  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    if (!overlay.hidden) return;
    const k = event.key;
    if (/^[1-9]$/.test(k)) { event.preventDefault(); return digit(Number(k)); }
    if (k === 'Backspace' || k === 'Delete' || k === '0') { event.preventDefault(); return tool('erase'); }
    if (k === 'n' || k === 'N') return tool('note');
    if (k === 'z' || k === 'Z') return tool('undo');
    if (k === 'h' || k === 'H') return tool('hint');
    const step = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[k];
    if (step) {
      event.preventDefault();
      const from = selected < 0 ? 40 : selected;
      pick(Math.min(8, Math.max(0, row(from) + step[0])) * 9 + Math.min(8, Math.max(0, col(from) + step[1])));
    }
  }
  canvas.addEventListener('pointerdown', onPointer);
  window.addEventListener('keydown', onKey);

  // ---- drawing ----
  function drawChip(x, y, w, h, d, radius) {
    const [base, light, dark] = PAL[d];
    roundRect(ctx, x, y + 2, w, h, radius);
    ctx.fillStyle = dark;
    ctx.fill();
    roundRect(ctx, x, y, w, h - 2, radius);
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, light);
    g.addColorStop(0.2, base);
    g.addColorStop(1, dark);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff59';
    ctx.stroke();
    roundRect(ctx, x + w * 0.14, y + 4, w * 0.72, 4, 2);
    ctx.fillStyle = '#ffffff40';
    ctx.fill();
  }
  function drawText(text, cx, cy, size, fill, outline) {
    ctx.font = `800 ${size}px "Manrope", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (outline) { ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = outline; ctx.strokeText(text, cx, cy); }
    ctx.fillStyle = fill;
    ctx.fillText(text, cx, cy);
  }
  function drawHeader() {
    // mistakes: three hearts that go dark as they are spent
    for (let k = 0; k < MISTAKES; k += 1) {
      const x = 22 + k * 24, y = 28, spent = k < core.mistakes;
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.moveTo(0, 7); ctx.bezierCurveTo(-13, -3, -6, -12, 0, -5); ctx.bezierCurveTo(6, -12, 13, -3, 0, 7);
      ctx.fillStyle = spent ? '#ffffff22' : '#ff5d80';
      if (!spent) { ctx.shadowColor = '#ff5d80'; ctx.shadowBlur = 8; }
      ctx.fill();
      ctx.restore();
    }
    drawText(mmss(elapsed), LW / 2, 28, 24, '#ffffff');
    ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c9cffc';
    ctx.fillText(`${DIFFS[level].label} · 提示 ${core.hints}`, LW - 14, 28);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c9cffc';
    ctx.fillText(`还剩 ${emptyCount(core)} 格`, 14, 52);
  }
  function drawGrid(now) {
    roundRect(ctx, GRID.x - 6, GRID.y - 6, GRID.size + 12, GRID.size + 12, 18);
    const g = ctx.createLinearGradient(0, GRID.y, 0, GRID.y + GRID.size);
    g.addColorStop(0, '#2a2670');
    g.addColorStop(1, '#14123a');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#58d4de80';
    ctx.stroke();
    const sel = selected;
    const lit = sel >= 0 ? core.cells[sel] : focus; // the digit to light up everywhere
    const seen = sel >= 0 ? new Set(PEERS[sel]) : null;
    for (let i = 0; i < 81; i += 1) {
      const { x, y } = cellXY(i);
      const v = core.cells[i];
      const wrong = isWrong(core, i);
      const boxTint = (Math.floor(row(i) / 3) + Math.floor(col(i) / 3)) % 2;
      roundRect(ctx, x, y, CELL, CELL, 8);
      const slot = ctx.createLinearGradient(0, y, 0, y + CELL);
      slot.addColorStop(0, boxTint ? '#171540' : '#1d1b4e');
      slot.addColorStop(1, boxTint ? '#0f0d2b' : '#14123a');
      ctx.fillStyle = slot;
      ctx.fill();
      if (seen?.has(i)) { ctx.fillStyle = '#ffffff14'; ctx.fill(); }
      if (lit && v === lit && !wrong) { ctx.fillStyle = '#ffd54338'; ctx.fill(); }
      let dx = 0;
      if (shake && shake.cell === i && shake.until > now) dx = Math.sin(now / 22) * 2.5;
      if (v && !wrong && !core.given[i]) drawChip(x + 2 + dx, y + 2, CELL - 4, CELL - 4, v, 8);
      if (v) {
        if (wrong) {
          roundRect(ctx, x, y, CELL, CELL, 8);
          ctx.fillStyle = '#c4263a55';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#ff5d80';
          ctx.stroke();
        }
        drawText(String(v), x + CELL / 2 + dx, y + CELL / 2 + 1, 22, core.given[i] ? '#f1f3ff' : wrong ? '#ff9fb2' : '#ffffff', core.given[i] ? null : wrong ? '#5a0f1f' : `${PAL[v][2]}cc`);
      } else if (core.notes[i]) {
        for (let d = 1; d <= 9; d += 1) {
          if (!(core.notes[i] & noteBit(d))) continue;
          const on = lit === d;
          drawText(String(d), x + 6 + ((d - 1) % 3) * 11.5, y + 7 + Math.floor((d - 1) / 3) * 10.5, 9.5, on ? '#ffd543' : PAL[d][1]);
        }
      }
    }
    if (sel >= 0) {
      const { x, y } = cellXY(sel);
      ctx.save();
      ctx.shadowColor = '#ffd543';
      ctx.shadowBlur = 12;
      roundRect(ctx, x - 1, y - 1, CELL + 2, CELL + 2, 9);
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffd543';
      ctx.stroke();
      ctx.restore();
    }
  }
  function drawTools() {
    TOOLS.forEach((button, k) => {
      const x = toolX(k), y = TB.y;
      const off = (button.id === 'undo' && !core.history.length);
      const on = button.id === 'note' && noteMode;
      roundRect(ctx, x, y + 3, TB.w, TB.h, 14);
      ctx.fillStyle = off ? '#3e4262' : on ? '#b8870a' : '#1e55c4';
      ctx.fill();
      roundRect(ctx, x, y, TB.w, TB.h - 3, 14);
      const g = ctx.createLinearGradient(0, y, 0, y + TB.h);
      g.addColorStop(0, off ? '#6a6f93' : on ? '#ffe58a' : '#6aa4ff');
      g.addColorStop(1, off ? '#555a7c' : on ? '#ffbc1c' : '#3f7bff');
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff55';
      ctx.stroke();
      ctx.fillStyle = off ? '#c4c7d8' : on ? '#4b3300' : '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 19px system-ui, sans-serif';
      ctx.fillText(button.icon, x + TB.w / 2, y + 18);
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillText(button.id === 'note' ? `笔记${noteMode ? '·开' : ''}` : button.label, x + TB.w / 2, y + 38);
    });
  }
  function drawPad() {
    const counts = placed(core);
    for (let d = 1; d <= 9; d += 1) {
      const x = numX(d), y = NUM.y;
      const left = 9 - counts[d];
      if (left <= 0) {
        roundRect(ctx, x, y, NUM.w, NUM.h, 12);
        ctx.fillStyle = '#ffffff12';
        ctx.fill();
        drawText(String(d), x + NUM.w / 2, y + NUM.h / 2, 22, '#ffffff33');
        continue;
      }
      const dark = PAL[d][2];
      drawChip(x, y, NUM.w, NUM.h, d, 12);
      drawText(String(d), x + NUM.w / 2, y + 22, 24, '#fff', `${dark}cc`);
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.fillStyle = '#ffffffd9';
      ctx.fillText(`×${left}`, x + NUM.w / 2, y + NUM.h - 12);
      if (noteMode || focus === d) {
        roundRect(ctx, x - 1, y - 1, NUM.w + 2, NUM.h + 2, 13);
        ctx.lineWidth = 2;
        ctx.strokeStyle = focus === d ? '#ffd543' : '#ffffffaa';
        ctx.setLineDash(noteMode && focus !== d ? [3, 3] : []);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }
  function frame(now) {
    raf = 0;
    if (!alive) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    drawHeader();
    drawGrid(now);
    drawTools();
    drawPad();
    if (toast && toast.until > now) {
      ctx.font = '800 14px system-ui, sans-serif';
      const width = ctx.measureText(toast.text).width + 28;
      roundRect(ctx, (LW - width) / 2, GRID.y + GRID.size / 2 - 14, width, 28, 14);
      ctx.fillStyle = '#000d';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(toast.text, LW / 2, GRID.y + GRID.size / 2);
    }
    if ((toast && toast.until > now) || (shake && shake.until > now)) raf = requestAnimationFrame(frame);
  }

  open(level, false);
  return {
    get state() { return core; },
    get level() { return level; },
    get selected() { return selected; },
    get elapsed() { return elapsed; },
    get noteMode() { return noteMode; },
    // 重新开始: a brand-new puzzle of the current level.
    restart() { open(level, true); },
    setLevel(next) { if (DIFF_IDS.includes(next) && next !== level) { save(); open(next, false); } },
    select(i) { if (alive && overlay.hidden && i >= 0 && i < 81) pick(i); },
    digit,
    tool,
    // Where a cell, a tool or a pad button sits on the page, for tests that click it.
    locate(kind, index) {
      const rect = canvas.getBoundingClientRect();
      const at = kind === 'cell' ? { x: cellXY(index).x + CELL / 2, y: cellXY(index).y + CELL / 2 }
        : kind === 'tool' ? { x: toolX(TOOLS.findIndex((t) => t.id === index)) + TB.w / 2, y: TB.y + TB.h / 2 }
          : { x: numX(index) + NUM.w / 2, y: NUM.y + NUM.h / 2 };
      return { x: rect.left + at.x * rect.width / LW, y: rect.top + at.y * rect.height / LH };
    },
    // A hand-made puzzle for tests: { puzzle, solution } as 81-digit strings.
    load(puzzle) { core = createGame({ diff: level, ...puzzle }); elapsed = 0; selected = -1; focus = 0; settled = false; overlay.hidden = true; save(); hud(); poke(); },
    destroy() {
      tick(); // bank the seconds since the last tick before the clock stops
      save();
      alive = false;
      cancelAnimationFrame(raf);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('pointerdown', onPointer);
      wrap.replaceChildren();
    }
  };
}
