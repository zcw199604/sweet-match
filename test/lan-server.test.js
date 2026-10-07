import test from 'node:test';
import assert from 'node:assert/strict';
import { createArcadeServer } from '../scripts/lan-server.js';

test('LAN room allows two players, forwards messages and rejects unauthenticated writes', async () => {
  const server = createArcadeServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  try {
    const host = await (await post('/api/rooms', {})).json();
    assert.match(host.code, /^[A-Z0-9]{6}$/);
    const guest = await (await post('/api/join', { code: host.code })).json();
    assert.equal(guest.role, 'guest');
    assert.equal((await post('/api/join', { code: host.code })).status, 409);
    assert.equal((await post('/api/message', { token: 'wrong', message: { type: 'action' } })).status, 401);
    const controller = new AbortController();
    const stream = await fetch(`${base}/api/events?token=${guest.token}`, { signal: controller.signal });
    const reader = stream.body.getReader(); await reader.read();
    await post('/api/message', { token: host.token, message: { type: 'snapshot', value: 123 } });
    const received = new TextDecoder().decode((await reader.read()).value);
    assert.ok(received.includes('123'));
    controller.abort();
    await post('/api/leave', { token: host.token });
    assert.equal((await post('/api/join', { code: host.code })).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
