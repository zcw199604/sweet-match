import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { pair, play, startServer, until, watch, wait } from './helpers.js';

const boot = async (t) => (await startServer(t)).url;
// 五子棋：黑方（座位 0）走第一列先成五，一局结束
const FIVE = (a, b) => [[a, { to: 0 }], [b, { to: 1 }], [a, { to: 15 }], [b, { to: 16 }], [a, { to: 30 }], [b, { to: 31 }], [a, { to: 45 }], [b, { to: 46 }], [a, { to: 60 }]];
async function finished(t, game = 'gomoku') {
  const url = await boot(t);
  const room = await pair(url, game);
  await play(room.seenA, FIVE(room.a, room.b));
  await until(() => room.seenB.state.result.over, { what: '对局结束' });
  return { url, ...room };
}

test('再来一局（保持座位）：一方提议、另一方同意 → 新的一局，座位不变，棋盘清空', async (t) => {
  const { a, b, seenA, seenB } = await finished(t);
  assert.equal(seenA.state.round, 0);
  a.send('rematch', { swap: false });
  await until(() => seenB.state.rematch, { what: '对方看到提议' });
  assert.deepEqual(seenB.state.rematch, { seat: 0, swap: false });
  await until(() => seenA.state.rematch, { what: '提议者也看到自己的提议' });
  assert.deepEqual(seenA.state.rematch, { seat: 0, swap: false });

  b.send('rematch', { swap: false });
  await until(() => seenA.state.round === 1 && seenB.state.round === 1, { what: '进入第 2 局' });
  assert.equal(seenA.state.rematch, null);
  assert.equal(seenA.state.result.over, false);
  assert.equal(seenA.state.view.board.filter(Boolean).length, 0, '棋盘清空');
  assert.deepEqual([seenA.state.seat, seenB.state.seat], [0, 1]);
  assert.ok(seenA.state.version > 9, '版本号继续递增，不会回退');

  await play(seenA, [[a, { to: 112 }]]);                  // 黑方还是座位 0，先走
  assert.equal(seenB.state.view.board[112].side, 1);
});

test('换边再来：座位对调，原来的后手变先手', async (t) => {
  const { a, b, seenA, seenB } = await finished(t);
  b.send('rematch', { swap: true });
  await until(() => seenA.state.rematch?.swap === true, { what: '看到换边提议' });
  assert.equal(seenA.state.rematch.seat, 1);
  a.send('rematch', { swap: true });
  await until(() => seenA.state.round === 1 && seenB.state.round === 1, { what: '进入第 2 局' });

  assert.deepEqual([seenA.state.seat, seenB.state.seat], [1, 0], '座位对调');
  assert.deepEqual(seenA.state.seats, ['online', 'online']);
  a.send('action', { to: 112 });                          // A 现在是白方，没轮到
  await until(() => seenA.rejects.length, { what: '白方抢步被拒绝' });
  assert.match(seenA.rejects.at(-1), /还没轮到你/);
  await play(seenB, [[b, { to: 112 }]]);                  // B 现在是黑方，先走
  assert.equal(seenA.state.view.board[112].side, 1);
});

test('一方想原座位、一方想换边：后提的覆盖先提的，由先提的一方决定是否同意', async (t) => {
  const { a, b, seenA, seenB } = await finished(t);
  a.send('rematch', { swap: false });
  await until(() => seenB.state.rematch, { what: '看到提议' });
  b.send('rematch', { swap: true });                      // 不一致 → 不开局，提议变成 B 的
  await until(() => seenA.state.rematch?.seat === 1, { what: '提议被覆盖' });
  assert.equal(seenA.state.round, 0);
  assert.deepEqual(seenA.state.rematch, { seat: 1, swap: true });
  a.send('rematch', { swap: true });                      // A 同意换边
  await until(() => seenA.state.round === 1, { what: '开始新的一局' });
  assert.deepEqual([seenA.state.seat, seenB.state.seat], [1, 0]);
});

test('对方拒绝：提议撤掉，提议者收到通知；提议者自己取消则不打扰对方', async (t) => {
  const { a, b, seenA, seenB } = await finished(t);
  a.send('rematch', { swap: false });
  await until(() => seenB.state.rematch, { what: '看到提议' });
  b.send('rematch-clear');
  await until(() => seenA.notices.length, { what: '提议者收到拒绝通知' });
  assert.match(seenA.notices[0], /拒绝/);
  await until(() => seenA.state.rematch === null && seenB.state.rematch === null, { what: '双方都看到提议被撤掉' });

  b.send('rematch', { swap: false });
  await until(() => seenA.state.rematch, { what: '看到新的提议' });
  b.send('rematch-clear');                                // 自己取消
  await until(() => seenA.state.rematch === null, { what: '提议被撤掉' });
  await wait(50);
  assert.equal(seenB.notices.length, 0, '自己取消不会给自己发拒绝通知');
  assert.equal(seenA.notices.length, 1, '也不会再给对方发通知');
  assert.equal(seenA.state.round, 0);
});

test('对局没结束不能提议再来一局', async (t) => {
  const url = await boot(t);
  const { a, seenA } = await pair(url, 'gomoku');
  a.send('rematch', { swap: false });
  await until(() => seenA.rejects.length, { what: '提议被拒绝' });
  assert.match(seenA.rejects[0], /还没结束/);
  assert.equal(seenA.state.rematch, null);
  assert.equal(seenA.state.round, 0);
});

test('弃局的对局不能再来一局（对方已经走了）', async (t) => {
  const url = await boot(t);
  const { a, b, seenB } = await pair(url, 'gomoku');
  await a.leave(true);
  await until(() => seenB.state.result.reason === 'forfeit', { what: '判对方获胜' });
  b.send('rematch', { swap: false });
  await until(() => seenB.rejects.length, { what: '提议被拒绝' });
  assert.equal(seenB.state.rematch, null);
});

test('对手在提议后离开：提议作废，剩下的人也不能再提议', async (t) => {
  const { a, b, seenA, seenB } = await finished(t);
  a.send('rematch', { swap: false });
  await until(() => seenB.state.rematch, { what: '看到提议' });
  await b.leave(true);
  await until(() => seenA.state.seats[1] === 'empty', { what: 'B 离开' });
  assert.equal(seenA.state.rematch, null);
  a.send('rematch', { swap: false });
  await until(() => seenA.rejects.length, { what: '再提议被拒绝' });
  assert.match(seenA.rejects.at(-1), /离开/);
});

test('对局结束后刷新页面（断线重连）不丢座位，还能接着再来一局', async (t) => {
  const { url, a, b, seenB } = await finished(t);
  const token = a.reconnectionToken;
  a.connection.close(4001);
  await until(() => seenB.state.seats[0] === 'offline', { what: '对方看到我离线' });
  const a2 = await new Client(url).reconnect(token);
  const seenA2 = watch(a2);
  await until(() => seenA2.state && seenB.state.seats[0] === 'online', { what: '重连成功' });
  assert.equal(seenA2.state.seat, 0);
  assert.equal(seenA2.state.result.over, true);
  a2.send('rematch', { swap: false });
  await until(() => seenB.state.rematch, { what: '重连后还能提议' });
  b.send('rematch', { swap: false });
  await until(() => seenA2.state.round === 1, { what: '开始新的一局' });
});

test('扫雷竞速：再来一局沿用创建时的难度，换一块新雷区，进度清零', async (t) => {
  const url = await boot(t);
  const { a, b, seenA, seenB } = await pair(url, 'minesweeper', { level: 'easy' });
  // 看不到雷在哪，所以一格格点，直到分出胜负
  for (const index of seenA.state.view.cells.flatMap((c, i) => (c.open ? [] : [i]))) {
    if (seenA.state.result.over) break;
    const [version, rejects] = [seenA.state.version, seenA.rejects.length];
    a.send('action', { type: 'reveal', index });
    await until(() => seenA.state.version > version || seenA.rejects.length > rejects, { what: '这一格被处理' });
  }
  assert.equal(seenA.state.result.over, true);
  a.send('rematch', { swap: true });                       // 竞速里换边没有意义，但协议上允许；沿用提议
  await until(() => seenB.state.rematch, { what: '看到提议' });
  b.send('rematch', { swap: true });
  await until(() => seenA.state.round === 1, { what: '开始新的一局' });
  assert.equal(seenA.state.view.level, 'easy');
  assert.equal(seenA.state.view.rows, 9);
  assert.equal(seenA.state.result.over, false);
  assert.ok(seenA.state.view.me.opened > 0 && seenA.state.view.me.opened < seenA.state.view.me.total);
  assert.equal(seenA.state.view.cells.some((c) => c.mine), false, '新一局的雷依然不外泄');
});
