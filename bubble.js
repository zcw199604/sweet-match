// 泡泡龙（ARCADE 39）的画面：六边形泡泡墙、会反弹的瞄准线、发射和同色爆开。
// 规则都在 bubble-core.js；这里只管把一球的飞行拆成小步、画粒子和掉落，以及结算。
import { COLS, MAX_LEVEL, R, ROWS, SHOOT_Y, TOP, aimPath, cellCenter, colorsInGrid, createLevel, setAim, shoot, step, swap } from './bubble-core.js';
import { CANDY, canvasGame, orb, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const SAVE = store('pao-bubble');
const NEXT = { x: 292, y: 572, r: 19 };

export function mountBubble(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '泡泡龙游戏画布', game: 'bubble' });
  let state = null;
  let last = 0;
  let finished = false;
  let gesture = null;
  let parts = [];
  let falling = [];
  let pops = [];
  let shakeUntil = 0;
  let best = SAVE.get({ level: 1, best: 0 });

  const dropsLeft = () => state.dropEvery - (state.misses % state.dropEvery);
  const hud = () => onHud(`第 ${state.level} 关 · ${state.score} 分`);

  function begin(level, seed) {
    shell.closeCard();
    state = createLevel(level, seed);
    last = performance.now();
    finished = false;
    gesture = null;
    parts = [];
    falling = [];
    pops = [];
    shakeUntil = 0;
    hud();
    shell.poke();
  }

  // ---- 输入 ----
  function aimAt(p) {
    setAim(state, p.x, p.y);
    gesture = 'aim';
    shell.poke();
  }
  shell.on('pointerdown', (event) => {
    if (shell.cardOpen || finished) return;
    event.preventDefault();
    shell.canvas.focus?.();
    const p = shell.point(event);
    if (Math.hypot(p.x - NEXT.x, p.y - NEXT.y) <= NEXT.r + 10) {
      if (swap(state)) { gesture = null; shell.toast('换一颗', 600, 70); shell.poke(); }
      return;
    }
    if (state.flying) return;
    aimAt(p);
  });
  shell.on('pointermove', (event) => {
    if (gesture !== 'aim' || shell.cardOpen) return;
    event.preventDefault();
    aimAt(shell.point(event));
  });
  function fire() {
    if (!gesture || gesture !== 'aim') return;
    gesture = null;
    if (state.flying || finished) return;
    if (shoot(state)) hud();
    shell.poke();
  }
  shell.on('pointerup', fire);
  shell.on('pointercancel', () => { gesture = null; });

  shell.on('keydown', (event) => {
    if (shell.cardOpen || finished) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const stepAngle = event.key === 'ArrowLeft' ? -0.07 : 0.07;
      state.shooter.angle = Math.max(-1.32, Math.min(1.32, state.shooter.angle + stepAngle));
      shell.poke();
    } else if (event.key === ' ') {
      event.preventDefault();
      if (!state.flying && shoot(state)) hud();
    } else if (event.key === 's' || event.key === 'S') {
      event.preventDefault();
      if (swap(state)) shell.poke();
    }
  });

  // ---- 结算与动画 ----
  function burst(cells, color) {
    for (const [r, c] of cells) {
      const p = cellCenter(state, r, c);
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2 + Math.random();
        parts.push({ x: p.x, y: p.y, vx: Math.cos(a) * (60 + Math.random() * 90), vy: Math.sin(a) * (60 + Math.random() * 90), r: 2 + Math.random() * 3, color: CANDY[color], until: performance.now() + 520 });
      }
      pops.push({ x: p.x, y: p.y - 8, label: '+10', until: performance.now() + 650 });
    }
  }
  function handle(result) {
    if (!result) return;
    if (result.poppedCells?.length) {
      const color = result.color ?? 0;
      burst(result.poppedCells, color);
    }
    if (result.droppedCells?.length) {
      for (const cell of result.droppedCells) {
        const p = cellCenter(state, cell.r, cell.c);
        falling.push({ x: p.x, y: p.y, vy: 40 + Math.random() * 60, vx: (Math.random() - 0.5) * 50, color: cell.color, r: R - 1 });
      }
    }
    if (result.dropRow) {
      shell.toast('顶上来了，小心', 900, 74);
      shakeUntil = performance.now() + 260;
    }
    hud();
  }

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
          `消掉 ${state.popped} 颗，掉落 ${state.dropped} 颗`,
          `这关用了 ${state.shots} 发，得到 ${state.score} 分`,
          `最高通关 第 ${best.best} 关`
        ],
        buttons: [{ label: next ? '下一关' : '再玩一遍', action: () => begin(next ? level + 1 : 1) }],
        tone: 'won'
      });
      postScore(onResult, 'bubble', level, note);
    } else {
      shell.card({
        title: '泡泡落到底了',
        lines: ['再顶一排就会输。先把挂得最下面的同色泡泡打掉，别让墙面一直往下长。', '这一关的布局不变，再试一次。'],
        buttons: [{ label: '重试本关', action: () => begin(state.level, state.seed) }],
        tone: 'lost'
      });
    }
    hud();
  }

  // ---- 每帧 ----
  shell.render = (ctx, now) => {
    const dt = Math.min(0.03, last ? (now - last) / 1000 : 0);
    last = now;

    if (!shell.cardOpen && !finished) {
      if (state.flying) {
        const result = step(state, dt);
        if (result) handle(result);
        if (state.status === 'won') finish('won');
        else if (state.status === 'lost') finish('lost');
        shell.poke(16);
      } else {
        shell.poke(120);
      }
    }

    // 粒子 / 掉落 / 飘字
    parts = parts.filter((p) => now < p.until);
    for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 240 * dt; }
    falling = falling.filter((f) => f.y < H + 40);
    for (const f of falling) { f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 400 * dt; }

    const shake = now < shakeUntil ? Math.sin(now / 16) * 3 : 0;
    ctx.save();
    ctx.translate(shake, 0);

    // 背景
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#191d38');
    bg.addColorStop(0.6, '#12152a');
    bg.addColorStop(1, '#0c0f1e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 顶部信息
    text(ctx, `第 ${state.level} 关`, 18, 30, { size: 20, align: 'left' });
    text(ctx, `${state.score} 分`, W - 18, 30, { size: 20, align: 'right' });
    text(ctx, `再失手 ${dropsLeft()} 次顶一排`, 18, 58, { size: 11, align: 'left', color: '#9aa0c8', weight: 700 });
    text(ctx, `${colorsInGrid(state).length} 种颜色`, W - 18, 58, { size: 11, align: 'right', color: '#9aa0c8', weight: 700 });

    // 天花板
    roundRect(ctx, 12, TOP - 14, W - 24, 10, 5);
    ctx.fillStyle = '#ffffff1c';
    ctx.fill();
    // 危险线
    const dangerY = TOP + R + ROWS * 24 - 2;
    ctx.save();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = '#ff5d8055';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, dangerY);
    ctx.lineTo(W - 16, dangerY);
    ctx.stroke();
    ctx.restore();

    // 泡泡墙
    for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
      const color = state.grid[r][c];
      if (color === null) continue;
      const p = cellCenter(state, r, c);
      orb(ctx, p.x, p.y, R - 0.5, CANDY[color]);
      ctx.beginPath();
      ctx.arc(p.x - R * 0.32, p.y - R * 0.36, R * 0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff70';
      ctx.fill();
    }

    // 瞄准线
    if (!state.flying && !finished && !shell.cardOpen) {
      const { pts } = aimPath(state);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.38)';
      ctx.lineWidth = 2;
      ctx.setLineDash([2, 10]);
      ctx.lineCap = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.restore();
      const [ex, ey] = pts.at(-1);
      ctx.beginPath();
      ctx.arc(ex, ey, R * 0.55, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 发射器
    ctx.save();
    ctx.translate(state.shooter.x, state.shooter.y);
    ctx.rotate(state.shooter.angle);
    roundRect(ctx, -9, -34, 18, 44, 9);
    const gun = ctx.createLinearGradient(0, -34, 0, 10);
    gun.addColorStop(0, '#6b7194');
    gun.addColorStop(1, '#2b3050');
    ctx.fillStyle = gun;
    ctx.fill();
    ctx.strokeStyle = '#ffffff33';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(state.shooter.x, state.shooter.y, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#00000055';
    ctx.fill();
    if (!state.flying) {
      orb(ctx, state.shooter.x, state.shooter.y, R, CANDY[state.shooter.current], { glow: CANDY[state.shooter.current][1] });
    }

    // 下一颗
    ctx.beginPath();
    ctx.arc(NEXT.x, NEXT.y, NEXT.r + 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff10';
    ctx.fill();
    ctx.strokeStyle = '#ffffff26';
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    orb(ctx, NEXT.x, NEXT.y, R - 2, CANDY[state.shooter.next]);
    text(ctx, '换', NEXT.x, NEXT.y + NEXT.r + 14, { size: 9, color: '#8d93b8' });

    // 飞行的球
    if (state.flying) {
      orb(ctx, state.flying.x, state.flying.y, R, CANDY[state.flying.color], { glow: CANDY[state.flying.color][1] });
    }

    // 掉落的泡泡
    for (const f of falling) {
      orb(ctx, f.x, f.y, f.r, CANDY[f.color], { alpha: 0.9 });
    }

    // 粒子
    for (const p of parts) {
      const t = Math.max(0, (p.until - now) / 520);
      ctx.globalAlpha = t;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color[1];
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // 飘字
    for (const p of pops) {
      if (now > p.until) { pops = pops.filter((x) => x !== p); continue; }
      const t = (p.until - now) / 650;
      text(ctx, p.label, p.x, p.y - (1 - t) * 20, { size: 11, color: '#ffe27a', shadow: '#00000088' });
    }
    ctx.restore();

    text(ctx, '拖动瞄准，松手发射 · 点右边的球换一颗', W / 2, 627, { size: 11, color: '#8d93b8' });
    if (now < shakeUntil || parts.length || falling.length || pops.length) shell.poke(16);
  };

  begin(best.level || 1);

  shell.regions = () => [
    { x: 0, y: 0, w: W, h: 84, role: 'top' },
    { x: 0, y: 84, w: W, h: SHOOT_Y + 50 - 84, role: 'main' }
  ];

  return {
    get state() { return state; },
    board: 'bubble',
    restart() { begin(state.level, state.seed); },
    goto(level) { begin(level); },
    aim(x, y) { setAim(state, x, y); shell.poke(); return state.shooter.angle; },
    swap() { return swap(state); },
    // 测试用：发射并快进到吸附结算。
    shootNow() {
      if (!shoot(state)) return null;
      hud();
      let result = null;
      for (let i = 0; i < 4000 && state.flying; i += 1) result = step(state, 0.008) ?? result;
      handle(result);
      if (state.status === 'won') finish('won');
      else if (state.status === 'lost') finish('lost');
      shell.poke();
      return result;
    },
    // 测试用：把桌子清空，走一遍过关结算和提交。
    winNow() {
      for (const row of state.grid) row.fill(null);
      state.status = 'won';
      finish('won');
    },
    destroy() { shell.destroy(); }
  };
}
