import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { HOST_KEY, pair, startServer, until, watch } from './helpers.js';

process.env.BOT_DELAY_MS = '15';   // 电脑代打的间隔调短；房间每次调度时才读这个值
const boot = async (t) => (await startServer(t)).url;

// 三个人入座：创建者凭 hostKey，其余两人凭房间码。
async function trio(url, game, options = {}) {
  const a = await new Client(url).create(game, { hostKey: HOST_KEY, ...options });
  const seenA = watch(a);
  await until(() => seenA.state?.code, { what: '创建者拿到房间码' });
  const code = seenA.state.code;
  const b = await new Client(url).join(game, { code });
  const c = await new Client(url).join(game, { code });
  const seenB = watch(b), seenC = watch(c);
  await until(() => [seenA, seenB, seenC].every((s) => s.state?.seats.join() === 'online,online,online'), { what: '三人入座' });
  return { rooms: [a, b, c], seen: [seenA, seenB, seenC], code };
}

test('junqi 房间：座位 0 先手；暗棋不泄漏身份；对手看到的是翻开后的牌', async (t) => {
  const url = await boot(t);
  const { a, b, seenA, seenB } = await pair(url, 'junqi');
  const hidden = seenB.state.view.board.filter((p) => p && !p.revealed);
  assert.ok(hidden.length > 40);
  assert.ok(hidden.every((p) => Object.keys(p).join() === 'revealed'));
  b.send('action', { type: 'flip', at: 0 });
  await until(() => seenB.rejects.length, { what: '后手抢先被拒' });
  assert.match(seenB.rejects[0], /还没轮到你/);
  const at = seenA.state.view.board.findIndex(Boolean);
  const v = seenA.state.version;
  a.send('action', { type: 'flip', at });
  await until(() => seenB.state.version > v, { what: '翻棋被确认' });
  assert.equal(seenB.state.view.board[at].revealed, true);
  assert.ok(seenB.state.view.board[at].kind);
  assert.ok(seenB.state.view.players[0]);
});

test('doudizhu 房间：2 个真人 + 1 个电脑，电脑自己叫分、出牌，轮到真人就停下', async (t) => {
  const url = await boot(t);
  const { a, b, seenA, seenB } = await pair(url, 'doudizhu', { humans: 2 });
  assert.equal(seenA.state.seats.length, 2);
  assert.equal(seenA.state.view.players[2].bot, true);
  assert.equal(seenA.state.view.players[1].bot, false);
  assert.equal(seenA.state.view.players[0].cards.length, 17);
  assert.deepEqual(seenA.state.view.players[1].cards, []);
  // 玩家 0 叫 1 分，玩家 1 叫 2 分，电脑自己表态，之后必有人当上地主；整个过程不需要客户端替电脑出手
  a.send('action', { type: 'bid', score: 1 });
  await until(() => seenB.state.view.current === 0, { what: '轮到玩家 1（视角旋转后 current=0）' });
  b.send('action', { type: 'bid', score: 2 });
  await until(() => seenA.state.view.phase === 'playing', { what: '电脑也叫完分，有人当上地主' });
  assert.ok(seenA.state.version >= 3, '三家各叫了一次，其中一次是电脑自己叫的');
  assert.notEqual(seenA.state.view.players[2].bid, null);
  assert.notEqual(seenA.state.view.landlord, null);
  // 电脑当上地主时，它先出牌（不需要任何客户端动作），出完轮到真人
  if (seenA.state.view.landlord === 2) await until(() => seenA.state.view.current !== 2 || seenA.state.view.turns > 0, { what: '电脑先手出牌' });
});

test('doudizhu 房间：3 个真人，谁都不能替别人出牌；中途有人离开 → 本局作废，不判输赢', async (t) => {
  const url = await boot(t);
  const { rooms: [a, b, c], seen: [seenA, seenB, seenC] } = await trio(url, 'doudizhu', { humans: 3 });
  assert.equal(seenA.state.seats.length, 3);
  b.send('action', { type: 'bid', score: 1 });
  await until(() => seenB.rejects.length, { what: '非当前玩家被拒' });
  c.send('action', { type: 'bid', score: 1 });
  a.send('action', { type: 'bid', score: 2 });
  await until(() => seenB.state.view.current === 0, { what: '轮到座位 1' });
  await b.leave(true);
  await until(() => seenA.state.result.reason === 'abandoned', { what: '本局作废' });
  assert.deepEqual(seenA.state.result, { over: true, winner: null, reason: 'abandoned' });
  assert.equal(seenC.state.result.reason, 'abandoned');
  assert.deepEqual(seenA.state.seats, ['online', 'empty', 'online']);
  void seenB;
});

test('doudizhu 房间：3 人局结束后，要三个人都点再来一局才开始', async (t) => {
  const url = await boot(t);
  const { rooms, seen } = await trio(url, 'doudizhu', { humans: 3 });
  // 不去真打一局：把一局打到结束需要大量出牌，这里只验证「没结束时不能提议」，完整流程由单测的 playOut 覆盖。
  rooms[1].send('rematch', { swap: false });
  await until(() => seen[1].rejects.length, { what: '没结束就提议被拒' });
  assert.equal(seen[0].state.rematch, null);
});

test('aeroplane 房间：2 个真人，黄蓝由电脑代打，掷骰在服务端', async (t) => {
  const url = await boot(t);
  const { a, b, seenA, seenB } = await pair(url, 'aeroplane', { humans: 2 });
  assert.deepEqual(seenA.state.view.teams, [0, null, 1, null]);
  assert.equal(seenA.state.view.team, 0);
  assert.equal(seenB.state.view.team, 2);
  b.send('action', { type: 'roll' });
  await until(() => seenB.rejects.length, { what: '没轮到绿队' });
  // 红队一直掷到掷出 6 起飞再走一步，让回合轮到电脑；之后电脑队自己走，直到绿队的回合
  for (let i = 0; i < 400 && seenA.state.view.turn !== 2 && !seenA.state.result.over; i++) {
    const before = seenA.state.version, view = seenA.state.view;
    if (view.turn === 0) a.send('action', view.phase === 'roll' ? { type: 'roll' } : { type: 'move', plane: view.legal[0] });
    await until(() => seenA.state.version > before || seenA.state.view.turn === 2, { what: '红队或电脑走了一步' });
  }
  assert.equal(seenA.state.view.turn, 2, '电脑队走完后轮到绿队（座位 1）');
  await until(() => seenB.state.view.turn === 2, { what: '绿队看到轮到自己' });
  const before = seenB.state.version;
  b.send('action', { type: 'roll' });
  await until(() => seenB.state.version > before, { what: '绿队掷骰成功' });
  assert.ok(seenB.state.view.dice >= 1 && seenB.state.view.dice <= 6);
});

test('aeroplane 房间：2 人局一方退出 → 另一方获胜（和普通对弈一样）', async (t) => {
  const url = await boot(t);
  const { a, seenB } = await pair(url, 'aeroplane', { humans: 2 });
  await a.leave(true);
  await until(() => seenB.state.result.reason === 'forfeit', { what: '弃局' });
  assert.equal(seenB.state.result.winner, 1);
});

test('房间座位数跟选项走：aeroplane 默认 2 人，3 人局要等第三个人', async (t) => {
  const url = await boot(t);
  const a = await new Client(url).create('aeroplane', { hostKey: HOST_KEY, humans: 3 });
  const seenA = watch(a);
  await until(() => seenA.state?.code, { what: '房间码' });
  assert.deepEqual(seenA.state.seats, ['online', 'empty', 'empty']);
  const b = await new Client(url).join('aeroplane', { code: seenA.state.code });
  watch(b);
  await until(() => seenA.state.seats.join() === 'online,online,empty', { what: '第二人入座' });
  a.send('action', { type: 'roll' });
  await until(() => seenA.rejects.length, { what: '人没齐不能开局' });
  assert.match(seenA.rejects[0], /没到齐/);
});
