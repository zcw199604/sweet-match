// 打砖块（ARCADE 38）的画面：霓虹砖墙、跟着手指的挡板、会分裂的球和两种道具。
// 规则都在 breakout-core.js；这里只管把一帧拆成 dt 交给核心，再按事件画动画和结算。
import { H, LIVES, PADDLE_H, PADDLE_Y, TOP, W, WALL, brickRect, bricksLeft, createLevel, launch, levelCount, update } from './breakout-core.js';
import { CANDY, canvasGame, candy, postScore, roundRect, store, text } from './kit.js';

const SAVE = store('pao-breakout-best');
const HP_COLORS = [null, 1, 5, 4]; // 1 血蓝、2 血橙、3 血紫

export function mountBreakout(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '打砖块游戏画布', game: 'breakout' });
  let state = null;
  let aimX = W / 2;
  let keys = new Set();
  let last = 0;
  let shakeUntil = 0;
  let finished = false;
  let pops = [];
  let best = SAVE.get(0);

  let lastHud = '';
  const hud = () => {
    const line = `第 ${state.level} 关 · ${state.score} 分 · 命 ${state.lives}`;
    if (line === lastHud) return;
    lastHud = line;
    onHud(line);
  };

  function begin(level, score = 0, lives = LIVES) {
    shell.closeCard();
    finished = false;
    state = createLevel(level);
    state.score = score;
    state.lives = lives;
    aimX = state.paddle.x + state.paddle.w / 2;
    pops = [];
    last = performance.now();
    hud();
    shell.poke();
  }

  shell.on('pointermove', (event) => {
    const p = shell.point(event);
    aimX = p.x;
    shell.poke();
  });
  shell.on('pointerdown', (event) => {
    if (shell.cardOpen || finished) return;
    event.preventDefault();
    shell.canvas.focus?.();
    const p = shell.point(event);
    aimX = p.x;
    if (state.status === 'ready') {
      const offset = (p.x - (state.paddle.x + state.paddle.w / 2)) / (state.paddle.w / 2);
      launch(state, Math.max(-0.55, Math.min(0.55, offset * 0.5)));
      hud();
    }
  });
  shell.on('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (!shell.cardOpen && state.status === 'ready') { launch(state, 0); hud(); }
      return;
    }
    if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(event.key)) {
      keys.add(event.key);
      event.preventDefault();
    }
  });
  shell.on('keyup', (event) => { keys.delete(event.key); });

  function pop(x, y, label, color = '#ffffff') {
    pops.push({ x, y, label, color, until: performance.now() + 700 });
  }

  // ---- 结算 ----
  function submit(note, value) {
    if (value > best) { best = value; SAVE.set(best); }
    postScore(onResult, 'breakout', value, note);
  }
  function levelClear() {
    if (finished) return;
    finished = true;
    const level = state.level;
    const total = state.score;
    if (level >= levelCount) {
      const { note } = shell.card({
        title: '全部通关！',
        lines: [`最后一关还剩 ${state.lives} 条命`, `总分 ${total}`, `最高分 ${Math.max(best, total)}`],
        buttons: [{ label: '再来一局', action: () => begin(1, 0, LIVES) }],
        tone: 'won'
      });
      hud();
      submit(note, total);
      return;
    }
    shell.card({
      title: `第 ${level} 关完成`,
      lines: [`本关得分 ${total}`, `还剩 ${state.lives} 条命，下一关多送一条（最多 ${LIVES} 条）`],
      buttons: [{ label: '下一关', action: () => begin(level + 1, total, Math.min(LIVES, state.lives + 1)) }],
      tone: 'won'
    });
    hud();
  }
  function gameOver() {
    if (finished) return;
    finished = true;
    const { note } = shell.card({
      title: '三条命用完了',
      lines: [`第 ${state.level} 关`, `本局得分 ${state.score}`, `最高分 ${Math.max(best, state.score)}`],
      buttons: [{ label: '再来一局', action: () => begin(1, 0, LIVES) }],
      tone: 'lost'
    });
    hud();
    submit(note, state.score);
  }

  // ---- 每帧 ----
  shell.render = (ctx, now) => {
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0);
    last = now;
    if (!shell.cardOpen && !finished && (state.status === 'ready' || state.status === 'playing')) {
      // 键盘：左右移动挡板
      if (keys.size) {
        const dir = (keys.has('ArrowRight') || keys.has('d') || keys.has('D') ? 1 : 0)
          - (keys.has('ArrowLeft') || keys.has('a') || keys.has('A') ? 1 : 0);
        if (dir) aimX = Math.max(WALL, Math.min(W - WALL, aimX + dir * 460 * dt));
      }
      const events = update(state, dt, aimX);
      for (const event of events) {
        if (event.type === 'break') {
          const brick = state.bricks[event.id];
          if (brick) {
            const rc = brickRect(brick);
            pop(rc.x + rc.w / 2, rc.y, `+${25 * brick.max}`, '#ffe27a');
          }
          if (brick && Math.random() < 0.06) shakeUntil = now + 120;
        } else if (event.type === 'lost') {
          shakeUntil = now + 240;
        } else if (event.type === 'wide') {
          shell.toast('挡板加宽 12 秒', 900, 70);
        } else if (event.type === 'multi') {
          shell.toast('三球齐发', 700, 70);
        } else if (event.type === 'clear') {
          levelClear();
          break;
        }
      }
      if (state.status === 'lost') gameOver();
      hud();
      // 等发球时不用 60 帧刷新，挡板跟着手指时由 pointermove 自己唤醒
      shell.poke(state.status === 'ready' ? 120 : 16);
    } else if (!finished && state.status === 'playing') {
      shell.poke(16);
    }

    const shake = now < shakeUntil ? Math.sin(now / 14) * 3 : 0;
    ctx.save();
    ctx.translate(shake, 0);

    // 背景
    const bg = ctx.createLinearGradient(0, TOP, 0, H);
    bg.addColorStop(0, '#141a2b');
    bg.addColorStop(1, '#0b0f1a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // 侧墙
    for (const x of [0, W - WALL]) {
      const g = ctx.createLinearGradient(x, 0, x + WALL, 0);
      g.addColorStop(0, '#2a3350');
      g.addColorStop(1, '#151b2c');
      ctx.fillStyle = g;
      ctx.fillRect(x, TOP - 3, WALL, H);
    }
    ctx.fillStyle = '#ffffff14';
    ctx.fillRect(WALL, TOP - 3, W - WALL * 2, 2);

    // 顶部信息
    text(ctx, `第 ${state.level} 关`, 18, 30, { size: 20, align: 'left' });
    text(ctx, `${state.score} 分`, W - 18, 30, { size: 20, align: 'right' });
    for (let i = 0; i < LIVES; i += 1) text(ctx, i < state.lives ? '♥' : '♡', W / 2 + (i - (LIVES - 1) / 2) * 24, 30, { size: 18, color: i < state.lives ? '#ff5d80' : '#ffffff40' });
    text(ctx, `${bricksLeft(state)} 块砖`, W / 2, 56, { size: 11, color: '#8d93b8' });

    // 砖块
    for (const brick of state.bricks) {
      if (!brick.alive) continue;
      const rc = brickRect(brick);
      const color = CANDY[HP_COLORS[brick.max] ?? 1];
      candy(ctx, rc.x, rc.y, rc.w, rc.h, 5, color);
      if (brick.hp < brick.max) {
        // 裂痕：打掉的血越多越花
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.strokeStyle = '#00000099';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const mx = rc.x + rc.w / 2, my = rc.y + rc.h / 2;
        ctx.moveTo(rc.x + 6, rc.y + 3);
        ctx.lineTo(mx - 4, my);
        ctx.lineTo(mx + 2, rc.y + rc.h - 4);
        if (brick.hp === 1) {
          ctx.moveTo(rc.x + rc.w - 6, rc.y + 3);
          ctx.lineTo(mx + 4, my);
          ctx.lineTo(rc.x + rc.w - 8, rc.y + rc.h - 3);
        }
        ctx.stroke();
        ctx.restore();
      }
    }

    // 道具
    for (const item of state.powerups) {
      roundRect(ctx, item.x - 15, item.y - 7, 30, 14, 7);
      ctx.fillStyle = item.kind === 'wide' ? '#58d4de' : '#ffcf3d';
      ctx.fill();
      ctx.strokeStyle = '#ffffff99';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      text(ctx, item.kind === 'wide' ? '↔' : '×3', item.x, item.y + 1, { size: 10, color: '#10131c' });
    }

    // 挡板
    const paddle = state.paddle;
    if (paddle.w > paddle.baseW) {
      ctx.save();
      ctx.shadowColor = '#58d4de';
      ctx.shadowBlur = 12;
    }
    const pg = ctx.createLinearGradient(0, PADDLE_Y, 0, PADDLE_Y + PADDLE_H);
    pg.addColorStop(0, '#e8f6ff');
    pg.addColorStop(0.5, '#8fd7ff');
    pg.addColorStop(1, '#3a8fd0');
    roundRect(ctx, paddle.x, PADDLE_Y, paddle.w, PADDLE_H, PADDLE_H / 2);
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = '#ffffffaa';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (paddle.w > paddle.baseW) ctx.restore();

    // 球和拖尾
    for (const ball of state.balls) {
      if (ball.stuck) {
        ctx.save();
        ctx.globalAlpha = 0.35 + Math.sin(now / 180) * 0.2;
        ctx.beginPath();
        ctx.arc(ball.x, PADDLE_Y - 26, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.shadowColor = '#9fe8ff';
      ctx.shadowBlur = 12;
      const bg2 = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.r);
      bg2.addColorStop(0, '#ffffff');
      bg2.addColorStop(0.6, '#c9f1ff');
      bg2.addColorStop(1, '#63b7e8');
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
      ctx.fillStyle = bg2;
      ctx.fill();
      ctx.restore();
    }

    // 飘字
    for (const p of [...pops]) {
      if (now > p.until) { pops = pops.filter((x) => x !== p); continue; }
      const t = (p.until - now) / 700;
      text(ctx, p.label, p.x, p.y - (1 - t) * 22, { size: 12, color: p.color, shadow: '#00000088' });
    }

    // 待发球提示
    if (state.status === 'ready' && !shell.cardOpen && !finished) {
      const a = 0.55 + Math.sin(now / 260) * 0.25;
      text(ctx, '点一下发球', W / 2, PADDLE_Y - 60, { size: 13, color: `rgba(255,255,255,${a})` });
    }
    ctx.restore();

    if (now < shakeUntil || pops.length) shell.poke(16);
  };

  begin(1);

  shell.regions = () => [
    { x: 0, y: 0, w: W, h: TOP, role: 'top' },
    { x: WALL, y: TOP, w: W - WALL * 2, h: PADDLE_Y - TOP + 24, role: 'main' }
  ];

  return {
    get state() { return state; },
    board: 'breakout',
    restart() { begin(1, 0, LIVES); },
    goto(level) { begin(level, 0, LIVES); },
    launch(angle = 0) { const ok = launch(state, angle); hud(); return ok; },
    setPaddle(x) { aimX = x; },
    // 测试用：把砖全打掉，走一遍过关结算。
    clearNow() {
      for (const b of state.bricks) b.alive = false;
      const events = update(state, 0.016, aimX);
      if (events.some((e) => e.type === 'clear')) levelClear();
    },
    // 测试用：直接结束这一局，走一遍失败结算和提交。
    loseNow() {
      state.lives = 0;
      state.status = 'lost';
      gameOver();
    },
    destroy() { shell.destroy(); }
  };
}
