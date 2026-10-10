import test from 'node:test';
import assert from 'node:assert/strict';
import { pair, play, startServer, until } from './helpers.js';

const boot = async (t) => (await startServer(t)).url;
test('房间名决定游戏：客户端不能用选项把 gomoku 房间换成别的游戏', async (t) => {
  const url = await boot(t);
  const { seenA } = await pair(url, 'gomoku', { game: 'xiangqi' });
  assert.equal(seenA.state.game, 'gomoku');
});

test('g2048 房间：两人同时滑动没有回合限制，最终有胜负，种子和历史不外泄', async (t) => {
  const url = await boot(t);
  const { a, b, seenA, seenB } = await pair(url, 'g2048', { target: 128 });
  assert.equal(seenA.state.view.target, 128);
  assert.deepEqual(seenA.state.view.players[0].tiles, seenB.state.view.players[0].tiles, '两人开局一样');
  const dirs = ['left', 'down', 'right', 'up'];
  for (let i = 0; i < 600; i++) { a.send('action', { type: 'move', dir: dirs[i % 4] }); b.send('action', { type: 'move', dir: dirs[(i + 1) % 4] }); }
  await until(() => seenA.state.result.over, { timeout: 15000, what: '竞速分出胜负' });
  assert.equal(seenA.state.result.over, true);
  assert.ok(['target', 'stuck'].includes(seenA.state.view.reason));
  assert.equal(seenA.state.version, seenB.state.version);
  assert.equal(JSON.stringify(seenA.state).includes('seed'), false);
  assert.equal(seenA.rejects.some((m) => /还没轮到你/.test(m)), false, '竞速不应出现「没轮到你」');
});

test('minesweeper 房间：看不到雷；踩雷的一方输', async (t) => {
  const url = await boot(t);
  const { a, b, seenA, seenB } = await pair(url, 'minesweeper', { level: 'easy' });
  assert.equal(seenA.state.view.cells.some((c) => c.mine), false);
  // 服务端的种子对客户端不可见，所以只能一格格试：翻开不同的格子，直到有人踩雷
  const closed = seenB.state.view.cells.flatMap((c, i) => (c.open ? [] : [i]));
  for (const index of closed) {
    if (seenB.state.result.over) break;
    const [version, rejects] = [seenB.state.version, seenB.rejects.length];
    b.send('action', { type: 'reveal', index });
    await until(() => seenB.state.version > version || seenB.rejects.length > rejects, { what: '这一格被服务端处理' });
  }
  assert.equal(seenB.state.result.over, true);
  if (seenB.state.view.reason === 'mine') assert.equal(seenA.state.result.winner, 0);
  else assert.equal(seenB.state.result.winner, 1);
  void a;
});

test('选项白名单：target/level 乱传会回落到默认值', async (t) => {
  const url = await boot(t);
  assert.equal((await pair(url, 'g2048', { target: 'x' })).seenA.state.view.target, 1024);
  assert.equal((await pair(url, 'minesweeper', { level: { $ne: 1 } })).seenA.state.view.level, 'normal');
});

test('一方主动退出，对局未结束 → 对方获胜（弃局），房间被锁', async (t) => {
  const url = await boot(t);
  const { a, seenB } = await pair(url, 'gomoku');
  await a.leave(true);
  await until(() => seenB.state.result.reason === 'forfeit', { what: '对方判胜' });
  assert.deepEqual(seenB.state.result, { over: true, winner: 1, reason: 'forfeit' });
  await until(() => seenB.state.seats[0] === 'empty', { what: '离开的座位变空' });
  assert.deepEqual(seenB.state.seats, ['empty', 'online']);
});

test('已经结束的对局，一方离开不算弃局，结果不变', async (t) => {
  const url = await boot(t);
  const { a, b, seenA, seenB } = await pair(url, 'gomoku');
  await play(seenA, [[a, { to: 0 }], [b, { to: 1 }], [a, { to: 15 }], [b, { to: 16 }], [a, { to: 30 }], [b, { to: 31 }], [a, { to: 45 }], [b, { to: 46 }], [a, { to: 60 }]]);
  await until(() => seenB.state.result.over, { what: '白方也看到结束' });
  assert.deepEqual(seenB.state.result, { over: true, winner: 0 });
  await b.leave(true);
  await until(() => seenA.state.seats[1] === 'empty', { what: '白方离开' });
  assert.deepEqual(seenA.state.result, { over: true, winner: 0 });
});

test('核心抛错的动作只会被拒绝，不会弄崩房间', async (t) => {
  const url = await boot(t);
  const { a, b, seenA, seenB } = await pair(url, 'draughts');
  a.send('action', { from: { evil: true }, path: 5, captures: 'x' });
  a.send('action', 'not even an object');
  await until(() => seenA.rejects.length >= 2, { what: '两个乱动作都被拒绝' });
  b.send('action', { from: 0 });
  await until(() => seenB.rejects.length >= 1, { what: '白方的乱动作被拒绝' });
  assert.equal(seenA.state.version, 0, '棋局没有被乱动作推进');
});
