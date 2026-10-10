import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@colyseus/sdk';
import { pair, play, startServer, until, wait, watch } from './helpers.js';

test('gomoku room: two players play to a win, server rejects out-of-turn moves', async (t) => {
  const { url } = await startServer(t);

  const { a, b, seenA, seenB } = await pair(url, 'gomoku');
  assert.deepEqual(seenA.state.seats, ['online', 'online']);
  assert.equal(seenB.state.seat, 1);

  b.send('action', { to: 0 });              // 白方抢着走黑方的回合
  await until(() => seenB.rejects.length, { what: '白方抢步被拒绝' });
  assert.match(seenB.rejects.at(-1), /还没轮到你/);

  // 黑方走一列、白方走另一列，黑方先成五
  await play(seenA, [[a, { to: 0 }], [b, { to: 1 }], [a, { to: 15 }], [b, { to: 16 }], [a, { to: 30 }], [b, { to: 31 }], [a, { to: 45 }], [b, { to: 46 }], [a, { to: 60 }]]);
  await until(() => seenB.state.version === seenA.state.version, { what: '双方版本一致' });
  assert.equal(seenA.state.result.over, true);
  assert.equal(seenA.state.result.winner, 0);
});

test('gomoku room: dropped client reconnects and gets the current state', async (t) => {
  const { url } = await startServer(t);

  const { a, seenA, seenB } = await pair(url, 'gomoku');
  await play(seenA, [[a, { to: 112 }]]);

  const token = a.reconnectionToken;
  a.connection.close(4001);               // 非主动退出的断开（4000 是 leave() 用的 CONSENTED）
  await until(() => seenB.state.seats[0] === 'offline', { what: '对方看到我离线' });
  const a2 = await new Client(url).reconnect(token);
  const seenA2 = watch(a2);
  await until(() => seenA2.state && seenB.state.seats[0] === 'online', { what: '重连后恢复在线' });
  assert.equal(seenA2.state.seat, 0);
  assert.equal(seenA2.state.version, 1);
  assert.equal(seenA2.state.view.board[112].side, 1);
});

test('relay room (built-in): messages go to the other peers only, tagged with sender', async (t) => {
  const { url } = await startServer(t);
  const host = await new Client(url).create('relay', { maxClients: 2 });
  const guest = await new Client(url).joinById(host.roomId);
  const got = new Promise((resolve) => guest.onMessage('snapshot', resolve));
  const echoed = []; host.onMessage('snapshot', (m) => echoed.push(m));
  host.send('snapshot', { tick: 7 });
  const [from, payload] = await got;
  assert.equal(from, host.sessionId);
  assert.deepEqual(payload, { tick: 7 });
  await wait(60);                           // 「不会回显给发送者」是反向断言，只能等一小会儿
  assert.equal(echoed.length, 0);
});

test('origin allowlist: matcher rules', async () => {
  const { originMatcher } = await import('../index.js');
  const ok = originMatcher(['https://a.example.com', 'https://*.pages.dev']);
  assert.equal(ok('https://a.example.com'), true);
  assert.equal(ok('https://x.pages.dev'), true);
  assert.equal(ok('https://pages.dev'), false);
  assert.equal(ok('https://evil.com'), false);
  assert.equal(ok('https://a.example.com.evil.com'), false);
  assert.equal(ok(null), false);
  assert.equal(originMatcher([''])('https://anything'), true);
});

test('origin allowlist: websocket upgrade from a foreign origin is refused', async (t) => {
  const { port } = await startServer(t, { allowedOrigins: ['https://good.example.com'] });
  const probe = (origin) => fetch(`http://localhost:${port}/matchmake/create/gomoku`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST' } });
  assert.equal((await probe('https://good.example.com')).headers.get('access-control-allow-origin'), 'https://good.example.com');
  assert.equal((await probe('https://evil.example.com')).headers.get('access-control-allow-origin'), 'null');
  const status = await new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:${port}/anything`, { headers: { origin: 'https://evil.example.com' } });
    ws.onerror = () => resolve('refused'); ws.onopen = () => { ws.close(); resolve('open'); };
  });
  assert.equal(status, 'refused');
});
