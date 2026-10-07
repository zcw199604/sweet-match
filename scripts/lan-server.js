import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
const rooms = new Map();
const json = (response, status, body) => { response.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'access-control-allow-origin': '*' }); response.end(JSON.stringify(body)); };
const code = () => randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
const read = async (request) => { let text = ''; for await (const chunk of request) text += chunk; try { return JSON.parse(text || '{}'); } catch { return {}; } };
function announce(room, message, except) { for (const client of room.clients) if (client.token !== except) { client.response.write(`data: ${JSON.stringify(message)}\n\n`); } }
export function createArcadeServer() {
  return createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'OPTIONS') { response.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type' }); return response.end(); }
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      const room = { code: code(), host: randomUUID(), guest: null, clients: new Set() }; rooms.set(room.code, room);
      return json(response, 201, { code: room.code, token: room.host, role: 'host' });
    }
    if (request.method === 'POST' && url.pathname === '/api/join') {
      const body = await read(request), room = rooms.get(String(body.code || '').toUpperCase());
      if (!room) return json(response, 404, { error: '房间不存在或已关闭' });
      if (room.guest) return json(response, 409, { error: '房间已满' });
      room.guest = randomUUID(); return json(response, 200, { code: room.code, token: room.guest, role: 'guest' });
    }
    if (request.method === 'POST' && url.pathname === '/api/message') {
      const body = await read(request), room = [...rooms.values()].find(item => item.host === body.token || item.guest === body.token);
      if (!room) return json(response, 401, { error: '无效令牌' }); announce(room, body.message, body.token); return json(response, 204, {});
    }
    if (request.method === 'POST' && url.pathname === '/api/leave') {
      const body = await read(request), room = [...rooms.values()].find(item => item.host === body.token || item.guest === body.token);
      if (!room) return json(response, 404, { error: '房间不存在' });
      if (room.host === body.token) { rooms.delete(room.code); announce(room, { type: 'closed' }, body.token); } else room.guest = null;
      return json(response, 204, {});
    }
    if (request.method === 'GET' && url.pathname === '/api/events') {
      const room = [...rooms.values()].find(item => item.host === url.searchParams.get('token') || item.guest === url.searchParams.get('token'));
      if (!room) return json(response, 401, { error: '无效令牌' });
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive', 'access-control-allow-origin': '*' });
      const client = { token: url.searchParams.get('token'), response }; room.clients.add(client); response.write(': connected\n\n');
      request.on('close', () => room.clients.delete(client)); return;
    }
    if (url.pathname === '/health') return json(response, 200, { ok: true, rooms: rooms.size });
    json(response, 404, { error: 'not found' });
  });
}
