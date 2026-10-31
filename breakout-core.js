// 打砖块（ARCADE 38）的规则：球在左右墙之间弹，挡板接球，砖块按生命值扣。
// 12 张手写砖图，3 条命；掉落的道具接住能加宽挡板或分裂多球。规则不碰 DOM，测试直接 import。
import { clamp } from './kit-core.js';

export const W = 360;
export const H = 640;
export const WALL = 10;
export const TOP = 96;
export const PADDLE_Y = 592;
export const PADDLE_H = 11;
export const BALL_R = 6;
export const BRICK = { w: 32, h: 16, gapX: 2, gapY: 3, x: 10, y: 126 };
export const LIVES = 3;
export const MAX_LEVEL = 12;

// 10 列宽：1/2/3 是砖的生命值，. 是空位。
const MAPS = [
  ['1111111111', '1111111111', '1111111111'],
  ['1.1.1.1.1.', '.1.1.1.1.1', '1.1.1.1.1.', '.1.1.1.1.1'],
  ['....11....', '...1111...', '..111111..', '.11111111.', '1111111111'],
  ['1.1.1.1.1.', '1.1.1.1.1.', '1.1.1.1.1.', '1.1.1.1.1.', '1.1.1.1.1.', '1.1.1.1.1.'],
  ['1111111111', '1........1', '1.111111.1', '1.1....1.1', '1.1.11.1.1'],
  ['....11....', '...1221...', '..122221..', '.12222221.', '..122221..', '...1221...', '....11....'],
  ['1111..1111', '1221..1221', '1221..1221', '1111..1111'],
  ['11........', '.11.......', '..11......', '...11.....', '....11....', '.....11...', '......11..', '.......11.'],
  ['2222222222', '..........', '1111111111', '..........', '2222222222'],
  ['.11....11.', '1111..1111', '1111111111', '.11111111.', '..111111..', '...1111...', '....11....'],
  ['3333333333', '3........3', '3.222222.3', '3.2....2.3', '3.2.11.2.3', '3.2....2.3', '3.222222.3', '3........3'],
  ['2222222222', '2.111111.2', '2.1....1.2', '2.1.33.1.2', '2.1....1.2', '2.111111.2', '2222222222']
];

export const levelCount = MAPS.length;
export const brickRect = (b) => ({
  x: BRICK.x + b.c * (BRICK.w + BRICK.gapX),
  y: BRICK.y + b.r * (BRICK.h + BRICK.gapY),
  w: BRICK.w,
  h: BRICK.h
});

export function createLevel(level) {
  const n = clamp(Math.floor(level) || 1, 1, MAX_LEVEL);
  const map = MAPS[(n - 1) % MAPS.length];
  const bricks = [];
  map.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '.' || ch === ' ') return;
      const hp = Number(ch);
      bricks.push({ id: bricks.length, r, c, hp, max: hp, alive: true });
    });
  });
  const baseW = 76;
  return {
    level: n,
    bricks,
    paddle: { x: W / 2 - baseW / 2, w: baseW, baseW, wideUntil: 0 },
    balls: [{ x: W / 2, y: PADDLE_Y - BALL_R - 2, vx: 0, vy: 0, r: BALL_R, stuck: true }],
    powerups: [],
    score: 0,
    lives: LIVES,
    status: 'ready',
    time: 0,
    speed: Math.min(430, 300 + (n - 1) * 10),
    combo: 0
  };
}

export const bricksLeft = (state) => state.bricks.reduce((n, b) => n + (b.alive ? 1 : 0), 0);
export const outcome = (state) => state.status;

export function launch(state, angle = 0) {
  let launched = false;
  for (const ball of state.balls) {
    if (!ball.stuck) continue;
    const a = clamp(angle, -1.05, 1.05);
    ball.vx = Math.sin(a) * state.speed;
    ball.vy = -Math.abs(Math.cos(a) * state.speed);
    ball.stuck = false;
    launched = true;
  }
  if (launched) state.status = 'playing';
  return launched;
}

function bounceBrick(state, ball, brick) {
  const rc = brickRect(brick);
  const cx = clamp(ball.x, rc.x, rc.x + rc.w);
  const cy = clamp(ball.y, rc.y, rc.y + rc.h);
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  if (dx * dx + dy * dy > ball.r * ball.r) return false;
  const px = Math.min(ball.x + ball.r - rc.x, rc.x + rc.w - (ball.x - ball.r));
  const py = Math.min(ball.y + ball.r - rc.y, rc.y + rc.h - (ball.y - ball.r));
  if (px < py) {
    ball.vx = -ball.vx;
    ball.x += ball.x < rc.x + rc.w / 2 ? -px : px;
  } else {
    ball.vy = -ball.vy;
    ball.y += ball.y < rc.y + rc.h / 2 ? -py : py;
  }
  brick.hp -= 1;
  state.score += 5;
  if (brick.hp <= 0) {
    brick.alive = false;
    state.score += 25 * brick.max;
    if (state.rand() < 0.09) {
      state.powerups.push({
        x: rc.x + rc.w / 2,
        y: rc.y + rc.h / 2,
        vy: 120,
        kind: state.rand() < 0.5 ? 'wide' : 'multi'
      });
    }
  }
  return true;
}

function resetBall(state) {
  state.balls = [{ x: state.paddle.x + state.paddle.w / 2, y: PADDLE_Y - BALL_R - 2, vx: 0, vy: 0, r: BALL_R, stuck: true }];
  state.status = 'ready';
  state.combo = 0;
}

function loseBall(state, ball) {
  state.balls = state.balls.filter((b) => b !== ball);
  if (!state.balls.length) {
    state.lives -= 1;
    if (state.lives <= 0) {
      state.status = 'lost';
    } else {
      resetBall(state);
    }
  }
}

// dt 秒；paddleX 是挡板中心的横坐标（手指/鼠标位置），返回这一帧发生的事件。
export function update(state, dt, paddleX = null, rand = Math.random) {
  const events = [];
  if (state.status === 'lost' || state.status === 'clear') return events;
  state.rand = rand;
  state.time += dt;

  // 道具时限
  const paddle = state.paddle;
  if (paddle.wideUntil && state.time > paddle.wideUntil) {
    paddle.w = paddle.baseW;
    paddle.wideUntil = 0;
  }
  if (paddleX !== null) paddle.x = clamp(paddleX - paddle.w / 2, WALL + 2, W - WALL - 2 - paddle.w);
  paddle.x = clamp(paddle.x, WALL + 2, W - WALL - 2 - paddle.w);

  // 挡板接住待发的球
  for (const ball of state.balls) {
    if (!ball.stuck) continue;
    ball.x = clamp(paddle.x + paddle.w / 2, WALL + ball.r, W - WALL - ball.r);
    ball.y = PADDLE_Y - ball.r - 2;
  }

  // 小球分小步走，速度快时也不会穿过砖块
  for (const ball of state.balls) {
    if (ball.stuck) continue;
    const dist = Math.hypot(ball.vx, ball.vy) * dt;
    const steps = Math.max(1, Math.ceil(dist / 4));
    for (let s = 0; s < steps; s += 1) {
      const sub = dt / steps;
      ball.x += ball.vx * sub;
      ball.y += ball.vy * sub;

      if (ball.x - ball.r < WALL + 2) { ball.x = WALL + 2 + ball.r; ball.vx = Math.abs(ball.vx); }
      if (ball.x + ball.r > W - WALL - 2) { ball.x = W - WALL - 2 - ball.r; ball.vx = -Math.abs(ball.vx); }
      if (ball.y - ball.r < TOP) { ball.y = TOP + ball.r; ball.vy = Math.abs(ball.vy); }

      // 挡板
      if (ball.vy > 0 && ball.y + ball.r >= PADDLE_Y && ball.y - ball.r <= PADDLE_Y + PADDLE_H
        && ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
        const offset = clamp((ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2), -1, 1);
        const angle = offset * 1.0;
        const speed = Math.max(state.speed * 0.85, Math.hypot(ball.vx, ball.vy));
        ball.vx = Math.sin(angle) * speed;
        ball.vy = -Math.abs(Math.cos(angle) * speed);
        ball.y = PADDLE_Y - ball.r - 0.5;
        state.combo = 0;
        events.push({ type: 'paddle' });
      }

      // 砖块：一帧最多撞一块，撞完就进入下一小步
      for (const brick of state.bricks) {
        if (!brick.alive) continue;
        if (!bounceBrick(state, ball, brick)) continue;
        events.push({ type: 'brick', id: brick.id, hp: brick.hp, alive: brick.alive });
        if (brick.hp <= 0) events.push({ type: 'break', id: brick.id });
        // 避免球贴着砖块连撞：把球沿法线推出来一点点
        break;
      }

      // 球掉出画面
      if (ball.y - ball.r > H) {
        loseBall(state, ball);
        events.push({ type: 'lost' });
        break;
      }
    }
  }

  // 道具下落
  for (const item of [...state.powerups]) {
    item.y += item.vy * dt;
    if (item.y > H) {
      state.powerups = state.powerups.filter((p) => p !== item);
      continue;
    }
    const inX = item.x >= paddle.x && item.x <= paddle.x + paddle.w;
    const inY = item.y + 8 >= PADDLE_Y && item.y - 8 <= PADDLE_Y + PADDLE_H;
    if (!inX || !inY) continue;
    state.powerups = state.powerups.filter((p) => p !== item);
    if (item.kind === 'wide') {
      paddle.w = Math.round(paddle.baseW * 1.6);
      paddle.x = clamp(paddle.x, WALL + 2, W - WALL - 2 - paddle.w);
      paddle.wideUntil = state.time + 12;
      events.push({ type: 'wide' });
    } else if (item.kind === 'multi') {
      const source = state.balls.find((b) => !b.stuck) ?? { x: paddle.x + paddle.w / 2, y: PADDLE_Y - 20, vx: 0, vy: -1 };
      for (const sign of [-1, 1]) {
        const speed = Math.max(state.speed * 0.8, Math.hypot(source.vx, source.vy));
        state.balls.push({
          x: source.x,
          y: source.y,
          vx: Math.sin(sign * 0.55) * speed,
          vy: -Math.abs(Math.cos(sign * 0.55) * speed),
          r: BALL_R,
          stuck: false
        });
      }
      events.push({ type: 'multi' });
    }
  }

  if (state.balls.some((b) => !b.stuck)) state.status = 'playing';
  if (bricksLeft(state) === 0) {
    state.status = 'clear';
    state.score += 200 * state.level + 50 * state.lives;
    events.push({ type: 'clear' });
  }
  return events;
}
