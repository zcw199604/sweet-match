import { Client } from '@colyseus/sdk';

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const HOST_KEY = 'host-key-0123456789abcdef';

// 轮询直到 check() 为真。固定 sleep 在慢机器（CI）上会偶发失败，所以断言前一律等条件而不是等时间。
export async function until(check, { timeout = 5000, interval = 10, what = '条件' } = {}) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeout) throw new Error(`等了 ${timeout}ms，${what}还是没有成立`);
    await wait(interval);
  }
}

// 记录一个座位最近一次收到的 state、所有 reject 和 notice
export function watch(room) {
  const box = { state: null, rejects: [], notices: [] };
  room.onMessage('state', (m) => { box.state = m; });
  room.onMessage('reject', (m) => box.rejects.push(m.message));
  room.onMessage('notice', (m) => box.notices.push(m.text));
  room.send('sync');
  return box;
}

// 创建者凭 hostKey 建房，读到服务端生成的房间码；对方凭房间码加入；等到双方都看到「两个座位都在线」。
export async function pair(url, game, options = {}) {
  const a = await new Client(url).create(game, { hostKey: HOST_KEY, ...options });
  const seenA = watch(a);
  await until(() => seenA.state?.code, { what: '创建者拿到房间码' });
  const code = seenA.state.code;
  const b = await new Client(url).join(game, { code });
  const seenB = watch(b);
  await until(() => seenA.state.seats.join() === 'online,online' && seenB.state?.seats.join() === 'online,online', { what: '双方入座' });
  return { a, b, seenA, seenB, code };
}

// 依次走几步，每一步都等服务端确认（版本号 +1）再走下一步
export async function play(seen, steps) {
  for (const [room, action] of steps) {
    const before = seen.state.version;
    room.send('action', action);
    await until(() => seen.state.version > before, { what: `走子 ${JSON.stringify(action)} 被确认` });
  }
}

// 起一个监听在「操作系统分配的空闲端口」上的服务端。不要自己挑端口：挑到别的程序占着的就会 EADDRINUSE，
// 而且 listen 的错误是异步抛出的，表现成测试莫名其妙卡到超时。
import { createServer } from '../index.js';
export async function startServer(t, options = { allowedOrigins: [''] }) {
  const server = createServer(options);
  await server.listen(0);
  const port = server.transport.server.address().port;
  t.after(() => server.gracefullyShutdown(false));
  return { server, port, url: `ws://localhost:${port}` };
}
