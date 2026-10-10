import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { HOST_KEY, until, watch, pair, startServer } from './helpers.js';

const boot = async (t) => (await startServer(t)).url;
const fails = async (promise) => { try { await promise; return null; } catch (e) { return e.message || String(e); } };

test('房间码：服务端生成 5 位、不含易混字符，创建者读得到', async (t) => {
  const url = await boot(t);
  const { seenA } = await pair(url, 'gomoku');
  assert.match(seenA.state.code, /^[A-HJ-NP-Z2-9]{5}$/);
});

test('房间码：同时开很多房间，码都不重复', async (t) => {
  const url = await boot(t);
  const codes = new Set();
  for (let i = 0; i < 25; i++) {
    const room = await new Client(url).create('gomoku', { hostKey: HOST_KEY });
    const seen = watch(room);
    await until(() => seen.state?.code, { what: '拿到房间码' });
    codes.add(seen.state.code);
  }
  assert.equal(codes.size, 25);
});

test('加入：带对房间码能进；没有码、码不对、没有创建者密钥都进不去', async (t) => {
  const url = await boot(t);
  const { code } = await pair(url, 'xiangqi');      // 这个房间已满，另开一个等人的
  const host = await new Client(url).create('xiangqi', { hostKey: HOST_KEY });
  const seen = watch(host);
  const waiting = (await until(() => seen.state?.code, { what: '拿到房间码' }));
  assert.notEqual(waiting, code);

  assert.ok(await fails(new Client(url).join('xiangqi', {})), '不带码应当失败');
  assert.ok(await fails(new Client(url).join('xiangqi', { code: 'ZZZZZ' })), '错码应当失败');
  const guest = await new Client(url).join('xiangqi', { code: waiting });
  const seenGuest = watch(guest);
  await until(() => seenGuest.state && seen.state.seats.join() === 'online,online', { what: '客人入座' });
  assert.equal(seenGuest.state.seat, 1);
});

test('没有创建者密钥就建不了房间（创建者自己也要过 onAuth）', async (t) => {
  const url = await boot(t);
  assert.match(await fails(new Client(url).create('gomoku', {})) ?? '', /房间码不对/);
  assert.match(await fails(new Client(url).create('gomoku', { hostKey: 'short' })) ?? '', /房间码不对/, '太短的密钥也不行');
});

test('房间已满：第三个人带着对的房间码也进不去', async (t) => {
  const url = await boot(t);
  const { code } = await pair(url, 'reversi');
  assert.ok(await fails(new Client(url).join('reversi', { code })));
});

test('房间码只对它所在的游戏有效', async (t) => {
  const url = await boot(t);
  const host = await new Client(url).create('gomoku', { hostKey: HOST_KEY });
  const seen = watch(host);
  await until(() => seen.state?.code, { what: '拿到房间码' });
  assert.ok(await fails(new Client(url).join('xiangqi', { code: seen.state.code })));
});

test('创建者密钥只能用一次：拿同一个密钥再来一次占不到第二个座位', async (t) => {
  const url = await boot(t);
  const host = await new Client(url).create('gomoku', { hostKey: HOST_KEY });
  const seen = watch(host);
  await until(() => seen.state?.code, { what: '拿到房间码' });
  const error = await fails(new Client(url).joinById(host.roomId, { hostKey: HOST_KEY }));
  assert.match(error ?? '', /房间码不对/);
  assert.equal(seen.state.seats.join(), 'online,empty', '第二个座位仍然空着');
});
