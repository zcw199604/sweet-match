import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { HOST_KEY, startServer, until, wait } from './helpers.js';

function watchNet(room) {
  const box = { state: null, net: [] };
  room.onMessage('state', (m) => { box.state = m; });
  room.onMessage('net', (m) => box.net.push(m));
  room.send('sync');
  return box;
}
async function coop(t) {
  const { url } = await startServer(t);
  const host = await new Client(url).create('coop', { hostKey: HOST_KEY });
  const seenH = watchNet(host);
  await until(() => seenH.state?.code, { what: '房间码' });
  const guest = await new Client(url).join('coop', { code: seenH.state.code });
  const seenG = watchNet(guest);
  await until(() => seenH.state.seats.join() === 'online,online' && seenG.state?.seats.join() === 'online,online', { what: '双方入座' });
  return { url, host, guest, seenH, seenG, code: seenH.state.code };
}

test('coop：房主是座位 0，客人座位 1；双方互相转发 hello / action / snapshot', async (t) => {
  const { host, guest, seenH, seenG } = await coop(t);
  assert.equal(seenH.state.seat, 0);
  assert.equal(seenG.state.seat, 1);
  guest.send('net', { type: 'hello' });
  guest.send('net', { type: 'action', player: 1, action: { type: 'move', x: 1, y: 2 } });
  host.send('net', { type: 'snapshot', state: { mode: 'pop2', players: [] } });
  await until(() => seenH.net.length === 2 && seenG.net.length === 1, { what: '转发到位' });
  assert.deepEqual(seenH.net.map((m) => m.type), ['hello', 'action']);
  assert.deepEqual(seenG.net[0].state, { mode: 'pop2', players: [] });
});

test('coop：只转发白名单里的包；乱七八糟的、太大的、伪造 closed 的都丢掉', async (t) => {
  const { host, guest, seenH, seenG } = await coop(t);
  for (const bad of ['text', 42, null, [], { type: 'closed' }, { type: 'x' }, {}, { type: 'snapshot', state: 'x'.repeat(40 * 1024) }]) guest.send('net', bad);
  host.send('net', { type: 'closed' });
  guest.send('net', { type: 'hello' });
  await until(() => seenH.net.length === 1, { what: '合法的 hello 到了' });
  await wait(100);
  assert.equal(seenH.net.length, 1);
  assert.equal(seenG.net.length, 0);
});

test('coop：发太快会被限速（突发上限之外的包被丢）', async (t) => {
  const { guest, seenH } = await coop(t);
  for (let i = 0; i < 400; i++) guest.send('net', { type: 'action', n: i });
  await wait(300);
  assert.ok(seenH.net.length > 50 && seenH.net.length < 260, `实际转发 ${seenH.net.length}`);
});

test('coop：没有房间码进不去；第三个人进不去', async (t) => {
  const { url, code } = await coop(t);
  await assert.rejects(new Client(url).join('coop', { code: 'ZZZZZ' }));
  await assert.rejects(new Client(url).join('coop', { code }));
});

test('coop：客人退出后房主还在，座位空出来，可以换人；房主退出则房间关闭并通知客人', async (t) => {
  const { url, host, guest, seenH, seenG, code } = await coop(t);
  await guest.leave(true);
  await until(() => seenH.state.seats.join() === 'online,empty', { what: '客人离开' });
  host.send('net', { type: 'snapshot', state: {} });           // 对方不在线，丢掉但不报错
  const next = await new Client(url).join('coop', { code });
  const seenN = watchNet(next);
  await until(() => seenH.state.seats.join() === 'online,online' && seenN.state?.seat === 1, { what: '新客人入座' });
  host.send('net', { type: 'snapshot', state: { ok: 1 } });
  await until(() => seenN.net.length === 1, { what: '新客人收到快照' });
  void seenG;
  await host.leave(true);
  await until(() => seenN.net.some((m) => m.type === 'closed'), { what: '房主离开通知客人' });
});

test('coop：房主和客人掉线 60 秒内能重连并继续转发', async (t) => {
  const { url, guest, host, seenH, seenG } = await coop(t);
  const token = guest.reconnectionToken;
  guest.connection.close(4001);                                 // 非主动退出的断开
  await until(() => seenH.state.seats.join() === 'online,offline', { what: '客人掉线' });
  const back = await new Client(url).reconnect(token);
  const seenB = watchNet(back);
  await until(() => seenH.state.seats.join() === 'online,online' && seenB.state?.seat === 1, { what: '客人回来' });
  host.send('net', { type: 'snapshot', state: { again: true } });
  await until(() => seenB.net.length === 1, { what: '重连后继续收到' });
  void seenG;
});
