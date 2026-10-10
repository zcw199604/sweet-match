import test from 'node:test';
import assert from 'node:assert/strict';
import { createAeroplane, rollAeroplane, moveAeroplane, previewAeroplane, aeroplaneCell } from '../aeroplane-core.js';

const ready = (progress, dice) => {
  const state = createAeroplane();
  state.planes[0][0] = progress;
  rollAeroplane(state, () => (dice - 0.5) / 6);
  return state;
};

test('四方各四机从机场出发，只有六点可以起飞', () => {
  const state = createAeroplane();
  assert.deepEqual(state.planes, Array.from({ length: 4 }, () => [-1, -1, -1, -1]));
  assert.equal(rollAeroplane(state, () => 0), true);
  assert.equal(state.turn, 1);
  assert.equal(state.phase, 'roll');
  const launch = createAeroplane();
  rollAeroplane(launch, () => 0.99);
  assert.deepEqual(launch.legal, [0, 1, 2, 3]);
  assert.equal(moveAeroplane(launch, 0), true);
  assert.equal(launch.planes[0][0], 0);
  assert.equal(launch.turn, 0);
});

test('连续第三个六点取消第三次行动并换手，保留前两步', () => {
  const state = createAeroplane();
  rollAeroplane(state, () => 0.99); moveAeroplane(state, 0);
  rollAeroplane(state, () => 0.99); moveAeroplane(state, 0);
  const before = state.planes[0][0];
  rollAeroplane(state, () => 0.99);
  assert.equal(state.turn, 1);
  assert.equal(state.planes[0][0], before);
  assert.match(state.message, /连续三次/);
});

test('同色跳四，跳后遇飞格飞十二，预览与实际终点相同且不会无限连跳', () => {
  const state = ready(11, 1);
  const preview = previewAeroplane(state, 0);
  assert.equal(preview.to, 28);
  assert.deepEqual(preview.bonuses, ['jump', 'fly']);
  assert.deepEqual(preview.path, [12, 16, 28]);
  moveAeroplane(state, 0);
  assert.equal(state.planes[0][0], preview.to);
  const fly = ready(15, 1);
  assert.deepEqual(previewAeroplane(fly, 0).bonuses, ['fly']);
  assert.equal(previewAeroplane(fly, 0).to, 28);
});

test('超出终点沿终点道反弹，终点精确抵达后不再可动', () => {
  const state = ready(55, 5);
  assert.deepEqual(previewAeroplane(state, 0).path, [56, 57, 56, 55, 54]);
  moveAeroplane(state, 0);
  assert.equal(state.planes[0][0], 54);
  const arrive = ready(56, 1);
  moveAeroplane(arrive, 0);
  assert.equal(arrive.planes[0][0], 57);
});

test('公共道落点撞回所有敌机，私人终点道不能互相撞机', () => {
  const state = ready(1, 1);
  state.planes[1][0] = 41;
  state.planes[1][1] = 41;
  assert.equal(aeroplaneCell(0, 2), aeroplaneCell(1, 41));
  moveAeroplane(state, 0);
  assert.deepEqual(state.planes[1].slice(0, 2), [-1, -1]);
  assert.equal(state.lastMove.captured.length, 2);
  const home = ready(51, 1);
  home.planes[1][0] = 52;
  moveAeroplane(home, 0);
  assert.equal(home.planes[1][0], 52);
});

test('同色终点跳跃不越入终点道，第四架到达结束游戏', () => {
  const near = ready(47, 1);
  assert.equal(previewAeroplane(near, 0).to, 48);
  const state = ready(56, 1);
  state.planes[0][1] = state.planes[0][2] = state.planes[0][3] = 57;
  moveAeroplane(state, 0);
  assert.equal(state.phase, 'won');
  assert.equal(state.winner, 0);
  assert.equal(rollAeroplane(state), false);
});

test('尚未掷骰、不合法棋子及重复移动不能更改棋局', () => {
  const state = createAeroplane();
  assert.equal(moveAeroplane(state, 0), false);
  rollAeroplane(state, () => 0.99);
  assert.equal(rollAeroplane(state), false);
  assert.equal(moveAeroplane(state, 7), false);
  assert.equal(moveAeroplane(state, 0), true);
  assert.equal(moveAeroplane(state, 0), false);
});
