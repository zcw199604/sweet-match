// 华容道（ARCADE 36）的画面：4×5 棋盘，拖动棋块滑进空格，把曹操送到下方出口。
// 规则都在 klotski-core.js；一次拖动算一步，松手才结算，所以可以一路拖着棋块横竖挪。
import { COLS, GOAL, LEVELS, ROWS, canMove, commit, createLevel, solved, stars, startDrag, undo as undoMove } from './klotski-core.js';
import { CANDY, candy, canvasGame, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const CELL = 68;
const BOARD = { x: (W - COLS * CELL) / 2, y: 148, w: COLS * CELL, h: ROWS * CELL };
const EXIT = { x: BOARD.x + BOARD.w / 2 - 34, y: BOARD.y + BOARD.h + 6, w: 68, h: 24 };
const SAVE = store('pao-klotski');
const COLORS = [0, 1, 2, 4]; // 曹操、竖将、横将、卒

export function mountKlotski(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '华容道游戏画布', game: 'klotski' });
  let state = null;
  let drag = null;     // 正在拖的那一块：{ id, r0, c0, moves0, grabR, grabC }
  let selected = 0;
  let finished = false;
  let celebrateUntil = 0;
  let best = SAVE.get({ level: 1, best: 0 });

  const hud = () => onHud(`第 ${state.level} 关 · ${state.moves} 步`);

  function begin(level) {
    shell.closeCard();
    state = createLevel(level);
    selected = 0;
    drag = null;
    finished = false;
    celebrateUntil = 0;
    hud();
    shell.poke();
  }

  // ---- 位置 ----
  const blockRect = (b) => ({ x: BOARD.x + b.c * CELL, y: BOARD.y + b.r * CELL, w: b.w * CELL, h: b.h * CELL });
  function blockAt(p) {
    const r = Math.floor((p.y - BOARD.y) / CELL);
    const c = Math.floor((p.x - BOARD.x) / CELL);
    if (r < 0 || c < 0 || r >= ROWS || c >= COLS) return null;
    return state.blocks.find((b) => r >= b.r && r < b.r + b.h && c >= b.c && c < b.c + b.w) ?? null;
  }
  const centerOf = (b) => [BOARD.x + (b.c + b.w / 2) * CELL, BOARD.y + (b.r + b.h / 2) * CELL];

  // 指针目标格 → 棋块该去的左上角；每一步只挪一格，碰到别的棋块就停。
  function pullToward(targetR, targetC) {
    const b = state.blocks[drag.id];
    for (let guard = 0; guard < 8; guard += 1) {
      const wantR = targetR - b.r;
      const wantC = targetC - b.c;
      if (wantR === 0 && wantC === 0) break;
      const verticalFirst = Math.abs(wantR) >= Math.abs(wantC);
      const order = verticalFirst
        ? [[Math.sign(wantR), 0], [0, Math.sign(wantC)]]
        : [[0, Math.sign(wantC)], [Math.sign(wantR), 0]];
      let step = false;
      for (const [dr, dc] of order) {
        if ((dr === 0 && dc === 0) || !canMove(state, drag.id, dr, dc)) continue;
        // 一次拖动里只往指针的方向走，不顺手蹭到反方向
        if (dr !== 0 && Math.abs(dr) > Math.abs(wantR)) continue;
        if (dc !== 0 && Math.abs(dc) > Math.abs(wantC)) continue;
        dragMoveFor(drag.id, dr, dc);
        step = true;
        break;
      }
      if (!step) break;
    }
  }

  // ---- 输入 ----
  shell.on('pointerdown', (event) => {
    if (shell.cardOpen || finished) return;
    event.preventDefault();
    const p = shell.point(event);
    const block = blockAt(p);
    if (!block) return;
    selected = block.id;
    shell.canvas.focus?.();
    const grabR = Math.floor((p.y - BOARD.y) / CELL) - block.r;
    const grabC = Math.floor((p.x - BOARD.x) / CELL) - block.c;
    drag = { ...startDrag(state, block.id), grabR, grabC };
    shell.canvas.setPointerCapture?.(event.pointerId);
    shell.poke();
  });
  shell.on('pointermove', (event) => {
    if (!drag) return;
    event.preventDefault();
    const p = shell.point(event);
    const tr = Math.floor((p.y - BOARD.y) / CELL) - drag.grabR;
    const tc = Math.floor((p.x - BOARD.x) / CELL) - drag.grabC;
    pullToward(tr, tc);
    shell.poke();
  });
  function release() {
    if (!drag) return;
    const finishedMove = commit(state, drag);
    drag = null;
    hud();
    shell.poke();
    if (finishedMove && solved(state)) win();
  }
  shell.on('pointerup', release);
  shell.on('pointercancel', release);

  shell.on('keydown', (event) => {
    if (shell.cardOpen) return;
    const dirs = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1], W: [-1, 0], S: [1, 0], A: [0, -1], D: [0, 1] };
    const dir = dirs[event.key];
    if (!dir) return;
    event.preventDefault();
    if (drag) return;
    nudge(selected, dir[0], dir[1]);
  });

  // 键盘和测试用：走一格算一步
  function nudge(id, dr, dc) {
    if (shell.cardOpen || finished) return false;
    const move = startDrag(state, id);
    const b = state.blocks[id];
    if (!canMove(state, id, dr, dc)) return false;
    b.r += dr;
    b.c += dc;
    commit(state, move);
    selected = id;
    hud();
    shell.poke(220);
    if (solved(state)) win();
    return true;
  }

  function win() {
    if (finished) return;
    finished = true;
    celebrateUntil = performance.now() + 1200;
    const level = state.level;
    const star = stars(state);
    best = { level: Math.min(LEVELS.length, level + 1), best: Math.max(best.best, level) };
    SAVE.set(best);
    const next = level < LEVELS.length;
    const { note } = shell.card({
      title: `第 ${level} 关完成`,
      lines: [
        `${'★'.repeat(star)}${'☆'.repeat(3 - star)}　${state.name}`,
        `用了 ${state.moves} 步，最少 ${state.par} 步`,
        `最高通关 第 ${best.best} 关`
      ],
      buttons: [{ label: next ? '下一关' : '再玩一遍', action: () => begin(next ? level + 1 : level) }],
      tone: 'won'
    });
    postScore(onResult, 'klotski', level, note);
  }

  // ---- 绘制 ----
  shell.render = (ctx, now) => {
    ctx.save();
    // 顶部信息
    text(ctx, `第 ${state.level} 关`, 18, 28, { size: 20, align: 'left' });
    text(ctx, state.name, W - 18, 30, { size: 15, align: 'right', color: '#c8cbe8' });
    text(ctx, `步数 ${state.moves}`, 18, 56, { size: 12, align: 'left', color: '#b9bde6', weight: 700 });
    text(ctx, `最少 ${state.par} 步`, W - 18, 56, { size: 12, align: 'right', color: '#b9bde6', weight: 700 });
    // 步数进度条：从 par 的 1.6 倍收回到 par
    const ratio = Math.min(1, state.moves / Math.max(1, state.par * 1.6));
    roundRect(ctx, 18, 72, W - 36, 6, 3);
    ctx.fillStyle = '#ffffff1c';
    ctx.fill();
    roundRect(ctx, 18, 72, (W - 36) * ratio, 6, 3);
    ctx.fillStyle = ratio > 1 ? '#ff5d80' : ratio > 0.75 ? '#ffcf3d' : '#44c986';
    ctx.fill();

    // 棋盘
    roundRect(ctx, BOARD.x - 10, BOARD.y - 10, BOARD.w + 20, BOARD.h + 20, 18);
    ctx.fillStyle = '#ffffff0c';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = '#ffffff1f';
    ctx.stroke();
    ctx.fillStyle = '#ffffff0a';
    for (let r = 0; r <= ROWS; r += 1) ctx.fillRect(BOARD.x, BOARD.y + r * CELL - 0.5, BOARD.w, 1);
    for (let c = 0; c <= COLS; c += 1) ctx.fillRect(BOARD.x + c * CELL - 0.5, BOARD.y, 1, BOARD.h);

    // 出口
    roundRect(ctx, EXIT.x, EXIT.y, EXIT.w, EXIT.h, 8);
    ctx.fillStyle = '#44c98633';
    ctx.fill();
    ctx.strokeStyle = '#44c98688';
    ctx.stroke();
    text(ctx, '出口', EXIT.x + EXIT.w / 2, EXIT.y + EXIT.h / 2 + 1, { size: 12, color: '#8ff0be' });
    // 出口上方的引导箭头
    text(ctx, '▼', BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h - 14, { size: 14, color: '#44c98655' });

    // 棋块
    for (const b of state.blocks) {
      const rc = blockRect(b);
      const moving = drag && drag.id === b.id;
      const won = solved(state) && b.id === 0 && now < celebrateUntil;
      const glow = won ? '#ffe27a' : moving ? '#ffffffbb' : selected === b.id ? '#ffffff55' : '';
      const color = CANDY[COLORS[b.kind]];
      const pad = 3;
      candy(ctx, rc.x + pad, rc.y + pad, rc.w - pad * 2, rc.h - pad * 2, 12, color, { glow });
      const [cx, cy] = centerOf(b);
      const label = b.kind === 0 ? '曹操' : b.kind === 3 ? '卒' : '将';
      text(ctx, label, cx, cy + 1, {
        size: b.kind === 0 ? 26 : b.kind === 3 ? 18 : b.h === 2 ? 22 : 20,
        color: '#fff',
        shadow: '#00000055'
      });
    }

    // 底部提示
    text(ctx, finished ? '曹操已到出口' : '按住棋块拖动，把它滑进空格', W / 2, 566, { size: 12, color: '#aeb5c4' });
    text(ctx, `已完成 ${best.best} / ${LEVELS.length} 关`, W / 2, 600, { size: 11, color: '#7c81a8' });
    ctx.restore();
    if (now < celebrateUntil) shell.poke(16);
  };

  begin(best.level || 1);

  shell.regions = () => [
    { x: 0, y: 0, w: W, h: 100, role: 'top' },
    { x: BOARD.x - 24, y: 92, w: BOARD.w + 48, h: EXIT.y + EXIT.h + 12 - 92, role: 'main' }
  ];

  return {
    get state() { return state; },
    cell: CELL,
    board: 'klotski',
    restart() { begin(state.level); },
    undo() {
      if (drag || shell.cardOpen) return;
      if (!undoMove(state)) return;
      hud();
      shell.poke();
    },
    goto(level) { begin(level); },
    locate(id) { const [x, y] = centerOf(state.blocks[id]); return shell.page(x, y); },
    legal() {
      const out = [];
      for (const b of state.blocks) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (canMove(state, b.id, dr, dc)) out.push({ id: b.id, dr, dc });
      }
      return out;
    },
    // 测试用：一次拖动把棋块平移 dr/dc 格（非法就停在能走的位置）。
    dragBy(id, dr, dc) {
      if (shell.cardOpen || finished) return false;
      const before = { r: state.blocks[id].r, c: state.blocks[id].c, moves: state.moves };
      const d = startDrag(state, id);
      const steps = Math.max(Math.abs(dr), Math.abs(dc));
      const sr = Math.sign(dr), sc = Math.sign(dc);
      for (let i = 0; i < steps; i += 1) {
        if (sr && !canMove(state, id, sr, 0)) break;
        if (sc && !canMove(state, id, 0, sc)) break;
        if (sr) dragMoveFor(id, sr, 0);
        if (sc) dragMoveFor(id, 0, sc);
      }
      commit(state, d);
      const changed = state.blocks[id].r !== before.r || state.blocks[id].c !== before.c;
      selected = id;
      hud();
      shell.poke();
      if (changed && solved(state)) win();
      return changed;
    },
    // 测试用：直接把曹操摆到出口，走一遍结算和提交。
    winNow() { state.blocks[0].r = GOAL.r; state.blocks[0].c = GOAL.c; win(); },
    destroy() { shell.destroy(); }
  };

  function dragMoveFor(id, dr, dc) {
    const b = state.blocks[id];
    b.r += dr;
    b.c += dc;
  }
}
