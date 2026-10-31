import test from 'node:test';
import assert from 'node:assert/strict';
import { BALL_R, BRICK, H, LIVES, MAX_LEVEL, PADDLE_Y, W, WALL, brickRect, bricksLeft, createLevel, launch, levelCount, outcome, update } from '../breakout-core.js';

test('every level map is a 10-wide, breakable brick layout', () => {
  assert.equal(levelCount, MAX_LEVEL);
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const state = createLevel(level);
    assert.ok(state.bricks.length > 0, `level ${level} has no bricks`);
    const rows = new Set();
    for (const b of state.bricks) {
      assert.ok(b.r >= 0 && b.c >= 0 && b.c < 10, `level ${level} brick out of the ten columns`);
      assert.ok(b.hp >= 1 && b.hp <= 3);
      const rc = brickRect(b);
      assert.ok(rc.x >= WALL && rc.x + rc.w <= W - WALL, 'brick overlaps a side wall');
      rows.add(b.r);
    }
    assert.ok(rows.size >= 3, `level ${level} is too flat`);
    assert.equal(state.status, 'ready');
    assert.equal(state.lives, LIVES);
    assert.equal(bricksLeft(state), state.bricks.length);
  }
});

test('launching sends the ball up, and a wall bounces it back', () => {
  const state = createLevel(1);
  assert.equal(launch(state), true);
  assert.equal(state.status, 'playing');
  const ball = state.balls[0];
  assert.ok(ball.vy < 0);
  ball.x = WALL + 10;
  ball.y = 300;
  ball.vx = -200;
  ball.vy = -200;
  update(state, 0.02);
  assert.ok(ball.vx > 0, 'left wall should push the ball right');
});

test('hitting a brick costs it one hp and scores', () => {
  const state = createLevel(1);
  const brick = state.bricks[0];
  const rc = brickRect(brick);
  state.status = 'playing';
  state.balls = [{ x: rc.x + rc.w / 2, y: rc.y + rc.h + 14, vx: 0, vy: -320, r: BALL_R, stuck: false }];
  const before = state.score;
  const events = update(state, 0.03);
  assert.ok(events.some((e) => e.type === 'brick'));
  assert.equal(brick.hp, brick.max - 1);
  assert.ok(state.score > before);
});

test('a fast ball cannot tunnel through a brick in one frame', () => {
  const state = createLevel(1);
  const brick = state.bricks[0];
  const rc = brickRect(brick);
  state.status = 'playing';
  state.speed = 500;
  state.balls = [{ x: rc.x + rc.w / 2, y: rc.y + rc.h + 20, vx: 0, vy: -500, r: BALL_R, stuck: false }];
  update(state, 0.06, null);
  assert.ok(brick.hp < brick.max, 'the ball passed through the brick');
});

test('the paddle sends the ball back up at an angle', () => {
  const state = createLevel(2);
  state.status = 'playing';
  state.paddle.x = W / 2 - state.paddle.w / 2;
  state.balls = [{ x: state.paddle.x + state.paddle.w * 0.8, y: PADDLE_Y - 12, vx: 0, vy: 300, r: BALL_R, stuck: false }];
  update(state, 0.02, W / 2);
  const ball = state.balls[0];
  assert.ok(ball.vy < 0, 'the ball should bounce up');
  assert.ok(ball.vx > 0, 'hitting near the right edge should send it right');
});

test('three dropped balls end the run', () => {
  const state = createLevel(3);
  for (let i = 0; i < LIVES; i += 1) {
    launch(state);
    state.balls[0].y = H + 20;
    update(state, 0.016, null);
    if (i < LIVES - 1) {
      assert.equal(state.lives, LIVES - i - 1);
      assert.equal(state.status, 'ready', 'a new ball waits on the paddle');
    }
  }
  assert.equal(state.lives, 0);
  assert.equal(outcome(state), 'lost');
});

test('clearing the last brick clears the level and pays a bonus', () => {
  const state = createLevel(1);
  for (const b of state.bricks) b.alive = false;
  const before = state.score;
  const events = update(state, 0.016, null);
  assert.ok(events.some((e) => e.type === 'clear'));
  assert.equal(outcome(state), 'clear');
  assert.ok(state.score > before);
});

test('catching a wide capsule widens the paddle for a while', () => {
  const state = createLevel(4);
  state.status = 'playing';
  state.balls = [{ x: 100, y: 300, vx: 0, vy: -200, r: BALL_R, stuck: false }];
  state.powerups.push({ x: state.paddle.x + state.paddle.w / 2, y: PADDLE_Y + 4, vy: 0, kind: 'wide' });
  const events = update(state, 0.016, null);
  assert.ok(events.some((e) => e.type === 'wide'));
  assert.ok(state.paddle.w > state.paddle.baseW);
  assert.ok(state.paddle.wideUntil > 0);
  // 时间到了就缩回去
  state.time = state.paddle.wideUntil + 1;
  update(state, 0.016, null);
  assert.equal(state.paddle.w, state.paddle.baseW);
});

test('a multi-ball capsule splits the ball in three', () => {
  const state = createLevel(5);
  state.status = 'playing';
  state.balls = [{ x: 180, y: 300, vx: 60, vy: -200, r: BALL_R, stuck: false }];
  state.powerups.push({ x: state.paddle.x + state.paddle.w / 2, y: PADDLE_Y + 4, vy: 0, kind: 'multi' });
  update(state, 0.016, null);
  assert.equal(state.balls.length, 3);
  assert.ok(state.balls.every((b) => !b.stuck));
});

test('bricks are laid out inside the playfield and the bottom row leaves room for the paddle', () => {
  for (let level = 1; level <= MAX_LEVEL; level += 1) {
    const state = createLevel(level);
    const low = Math.max(...state.bricks.map((b) => brickRect(b).y + BRICK.h));
    assert.ok(low < PADDLE_Y - 100, `level ${level} bricks reach too low`);
  }
});
