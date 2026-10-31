// 贪吃蛇（ARCADE 37）的画面：网格、果子、会穿墙的蛇和障碍墙。
// 规则都在 snake-core.js；这里只管按 tick 推进、插值画出滑行、接住滑动和键盘输入。
import { LIVES, MAX_LEVEL, START_LENGTH, createLevel, foodAhead, lengthOf, outcome, step, turn } from './snake-core.js';
import { canvasGame, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const AREA = { x: 12, y: 104, w: W - 24, h: 470 };
const SAVE = store('pao-snake');
const HEAD = '#6ff0a8';
const TAIL = '#1f8f66';

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const HEAD_RGB = hex(HEAD);
const TAIL_RGB = hex(TAIL);
const bodyColor = (t) => {
  const a = Math.round(HEAD_RGB[0] + (TAIL_RGB[0] - HEAD_RGB[0]) * t);
  const b = Math.round(HEAD_RGB[1] + (TAIL_RGB[1] - HEAD_RGB[1]) * t);
  const c = Math.round(HEAD_RGB[2] + (TAIL_RGB[2] - HEAD_RGB[2]) * t);
  return `rgb(${a},${b},${c})`;
};

export function mountSnake(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '贪吃蛇游戏画布', game: 'snake' });
  let state = null;
  let layout = { cell: 24, x: AREA.x, y: AREA.y };
  let swipe = null;
  let shakeUntil = 0;
  let flashUntil = 0;
  let finished = false;
  let best = SAVE.get({ level: 1, best: 0 });

  const hud = () => onHud(`第 ${state.level} 关 · 长度 ${lengthOf(state)} / ${state.need + START_LENGTH}`);

  function begin(level, seed) {
    shell.closeCard();
    state = createLevel(level, seed);
    const size = state.rows;
    const cell = Math.max(9, Math.min(Math.floor(AREA.w / size), Math.floor(AREA.h / size)));
    const board = cell * size;
    layout = { cell, x: AREA.x + (AREA.w - board) / 2, y: AREA.y + (AREA.h - board) / 2 };
    state.lastStep = performance.now();
    swipe = null;
    finished = false;
    shakeUntil = 0;
    flashUntil = 0;
    hud();
    shell.poke();
  }

  const center = ([r, c]) => [layout.x + (c + 0.5) * layout.cell, layout.y + (r + 0.5) * layout.cell];

  // ---- 输入 ----
  shell.on('pointerdown', (event) => {
    if (shell.cardOpen || finished) return;
    event.preventDefault();
    const p = shell.point(event);
    swipe = { x: p.x, y: p.y };
    shell.canvas.focus?.();
  });
  shell.on('pointermove', (event) => {
    if (!swipe) return;
    event.preventDefault();
    const p = shell.point(event);
    const dx = p.x - swipe.x;
    const dy = p.y - swipe.y;
    if (Math.hypot(dx, dy) < 22) return;
    turn(state, Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    swipe = { x: p.x, y: p.y };
    shell.poke(state.tick);
  });
  shell.on('pointerup', () => { swipe = null; });
  shell.on('pointercancel', () => { swipe = null; });

  shell.on('keydown', (event) => {
    if (shell.cardOpen) return;
    const dir = {
      ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
      w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right'
    }[event.key];
    if (!dir) return;
    event.preventDefault();
    turn(state, dir);
    shell.poke(state.tick);
  });

  // ---- 结算 ----
  function finish(end) {
    if (finished) return;
    finished = true;
    if (end === 'won') {
      const level = state.level;
      best = { level: Math.min(MAX_LEVEL, level + 1), best: Math.max(best.best, level) };
      SAVE.set(best);
      const next = level < MAX_LEVEL;
      const { note } = shell.card({
        title: `第 ${level} 关完成`,
        lines: [
          `长度 ${lengthOf(state)} 节，吃到 ${state.eaten} 个果子`,
          `还剩 ${state.lives} 条命`,
          `最高通关 第 ${best.best} 关`
        ],
        buttons: [{ label: next ? '下一关' : '再玩一遍', action: () => begin(next ? level + 1 : level) }],
        tone: 'won'
      });
      postScore(onResult, 'snake', level, note);
    } else {
      shell.card({
        title: '命用完了',
        lines: [`这一关要长到 ${state.need + START_LENGTH} 节，现在 ${lengthOf(state)} 节。`, '撞到墙、边或者自己都会少一条命，再试一次吧。'],
        buttons: [{ label: '重试本关', action: () => begin(state.level, state.seed) }],
        tone: 'lost'
      });
    }
    hud();
  }

  // ---- 每帧 ----
  shell.render = (ctx, now) => {
    if (!shell.cardOpen && !finished && !state.paused && state.status === 'playing') {
      if (!state.lastStep) state.lastStep = now;
      let guard = 0;
      while (now - state.lastStep >= state.tick && guard < 4 && state.status === 'playing') {
        state.lastStep += state.tick;
        guard += 1;
        const result = step(state);
        if (result.died) {
          shakeUntil = now + 260;
          flashUntil = now + 220;
          shell.toast(`还剩 ${state.lives} 条命`, 900, W / 2);
          if (state.status === 'lost') { hud(); finish('lost'); break; }
          state.lastStep = now;
          hud();
        } else if (result.won) {
          hud();
          finish('won');
          break;
        } else if (result.ate) {
          hud();
        }
      }
      if (now - state.lastStep > state.tick * 4) state.lastStep = now;
      shell.poke(state.tick);
    }

    const t = state.prev && state.status === 'playing' ? Math.min(1, (now - state.lastStep) / state.tick) : 0;
    const shake = now < shakeUntil ? Math.sin(now / 16) * 3 : 0;
    ctx.save();
    ctx.translate(shake, 0);

    // 顶部
    text(ctx, `第 ${state.level} 关`, 18, 30, { size: 20, align: 'left' });
    const speed = Math.round(1000 / state.tick);
    text(ctx, `${state.wrap ? '穿墙 · ' : ''}${speed} 格/秒`, W - 18, 32, { size: 12, align: 'right', color: '#b9bde6', weight: 700 });
    text(ctx, `长度 ${lengthOf(state)} / ${state.need + START_LENGTH}`, 18, 58, { size: 12, align: 'left', color: '#b9bde6', weight: 700 });
    for (let i = 0; i < LIVES; i += 1) text(ctx, i < state.lives ? '♥' : '♡', W - 24 - i * 24, 58, { size: 20, color: i < state.lives ? '#ff5d80' : '#ffffff55' });

    // 棋盘
    const board = layout.cell * state.rows;
    roundRect(ctx, layout.x - 8, layout.y - 8, board + 16, board + 16, 16);
    ctx.fillStyle = '#ffffff0d';
    ctx.fill();
    ctx.strokeStyle = '#ffffff17';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ffffff10';
    for (let r = 0; r < state.rows; r += 1) for (let c = 0; c < state.cols; c += 1) {
      if ((r + c) % 2) continue;
      const [x, y] = center([r, c]);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, layout.cell * 0.05), 0, Math.PI * 2);
      ctx.fill();
    }

    // 障碍
    for (const k of state.walls) {
      const r = Math.floor(k / state.cols), c = k % state.cols;
      const [x, y] = center([r, c]);
      const s = layout.cell * 0.9;
      roundRect(ctx, x - s / 2, y - s / 2, s, s, s * 0.22);
      ctx.fillStyle = '#2b3654';
      ctx.fill();
      ctx.strokeStyle = '#59688f';
      ctx.lineWidth = Math.max(1, s * 0.06);
      ctx.stroke();
      roundRect(ctx, x - s * 0.28, y - s * 0.3, s * 0.56, s * 0.16, s * 0.08);
      ctx.fillStyle = '#ffffff18';
      ctx.fill();
    }

    // 果子
    if (state.food) {
      const [fx, fy] = center([state.food.r, state.food.c]);
      const pulse = 1 + Math.sin(now / 220) * 0.05;
      const r = layout.cell * 0.31 * pulse;
      ctx.save();
      ctx.shadowColor = '#ff5d80';
      ctx.shadowBlur = 14;
      const g = ctx.createRadialGradient(fx - r * 0.3, fy - r * 0.35, r * 0.1, fx, fy, r);
      g.addColorStop(0, '#ffd0d8');
      g.addColorStop(0.45, '#ff6b86');
      g.addColorStop(1, '#c21f45');
      ctx.beginPath();
      ctx.arc(fx, fy, r, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.restore();
      ctx.beginPath();
      ctx.ellipse(fx + r * 0.1, fy - r * 1.05, r * 0.42, r * 0.2, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = '#44c986';
      ctx.fill();
    }

    // 蛇：从尾巴往头画，越靠近头越亮
    const prev = state.prev;
    const usePrev = prev && prev.length === state.snake.length && state.status === 'playing';
    for (let i = state.snake.length - 1; i >= 0; i -= 1) {
      const [r, c] = state.snake[i];
      let x = layout.x + (c + 0.5) * layout.cell;
      let y = layout.y + (r + 0.5) * layout.cell;
      if (usePrev) {
        const [pr, pc] = prev[i];
        // 穿墙的一步差值大于 1，保持原位不插值
        if (Math.abs(r - pr) <= 1 && Math.abs(c - pc) <= 1) {
          x = layout.x + (pc + 0.5 + (c - pc) * t) * layout.cell;
          y = layout.y + (pr + 0.5 + (r - pr) * t) * layout.cell;
        }
      }
      const head = i === 0;
      const s = layout.cell * (head ? 0.9 : 0.82 - Math.min(0.18, i * 0.006));
      const color = bodyColor(Math.min(1, i / Math.max(6, state.snake.length)));
      ctx.save();
      if (head) { ctx.shadowColor = '#6ff0a8'; ctx.shadowBlur = 12; }
      roundRect(ctx, x - s / 2, y - s / 2 + (head ? 0 : 0.5), s, s, s * 0.3);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.strokeStyle = head ? '#ccffe3' : '#0c3b2c';
      ctx.stroke();
      roundRect(ctx, x - s * 0.3, y - s * 0.36, s * 0.6, s * 0.16, s * 0.08);
      ctx.fillStyle = '#ffffff30';
      ctx.fill();
      ctx.restore();
      if (head) {
        // 眼睛朝着行进方向
        const [dr, dc] = state.dir;
        const ex = x + dc * s * 0.16;
        const ey = y + dr * s * 0.16;
        const side = dc !== 0 ? [0, 1] : [1, 0];
        for (const sign of [-1, 1]) {
          const px = ex + side[1] * sign * s * 0.18;
          const py = ey + side[0] * sign * s * 0.18;
          ctx.beginPath();
          ctx.arc(px, py, s * 0.13, 0, Math.PI * 2);
          ctx.fillStyle = '#0b1a13';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px - s * 0.03, py - s * 0.03, s * 0.045, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }
      }
    }

    // 命中闪红
    if (now < flashUntil) {
      ctx.fillStyle = `rgba(255,60,80,${((flashUntil - now) / 220) * 0.16})`;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

    if (now < shakeUntil || now < flashUntil) shell.poke(16);
    text(ctx, state.wrap ? '滑一下转向 · 边缘会穿到另一边' : '滑一下转向，吃果子变长', W / 2, 604, { size: 11, color: '#8d93b8' });
    if (best.best > 0) text(ctx, `最高通关 第 ${best.best} 关`, W / 2, 626, { size: 10, color: '#6d7298' });
  };

  begin(best.level || 1);

  shell.regions = () => {
    const board = layout.cell * state.rows;
    return [
      { x: 0, y: 0, w: W, h: 96, role: 'top' },
      { x: Math.max(0, layout.x - 16), y: Math.max(0, layout.y - 16), w: Math.min(W, board + 32), h: board + 32, role: 'main' }
    ];
  };

  return {
    get state() { return state; },
    board: 'snake',
    restart() { begin(state.level, state.seed); },
    goto(level) { begin(level); },
    turn: (dir) => turn(state, dir),
    // 测试用：暂停自动前进，只让 stepNow 一步步走。
    pause() { state.paused = true; state.lastStep = performance.now(); },
    // 测试用：立刻走 n 步，不等 tick。
    stepNow(n = 1) {
      for (let i = 0; i < n && state.status === 'playing'; i += 1) {
        const result = step(state);
        if (result.won) { hud(); finish('won'); break; }
        if (result.died) { if (state.status === 'lost') { hud(); finish('lost'); } hud(); break; }
      }
      state.lastStep = performance.now();
      shell.poke();
      return state;
    },
    feedAhead() { return foodAhead(state); },
    // 测试用：直接过关，走一遍结算和提交。
    winNow() { state.eaten = state.need; hud(); finish('won'); },
    destroy() { shell.destroy(); }
  };
}
