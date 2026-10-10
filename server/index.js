import { defineServer, defineRoom, matchMaker, RelayRoom } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { ArcadeRoom } from './arcade-room.js';
import { CoopRoom } from './coop-room.js';
import { adapters } from './adapters/index.js';

// 允许的网页来源：逗号分隔，可写完整来源或 https://*.pages.dev 这样的通配。
// 留空表示不限制（本地开发和测试用），线上必须设置 ALLOWED_ORIGINS。
export function originMatcher(list) {
  const rules = list.map((item) => item.trim().replace(/\/$/, '')).filter(Boolean);
  if (!rules.length) return () => true;
  return (origin) => {
    if (!origin) return false;
    return rules.some((rule) => {
      if (!rule.includes('*')) return rule === origin;
      const [head, tail] = rule.split('*');
      return origin.startsWith(head) && origin.endsWith(tail) && origin.length > head.length + tail.length;
    });
  };
}

export function createServer({ allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',') } = {}) {
  const allowed = originMatcher(allowedOrigins);
  // 撮合接口（HTTP）的跨域：只回显白名单里的来源，其余不给 Allow-Origin，浏览器会自己拦下。
  matchMaker.controller.getCorsHeaders = (headers) => {
    const origin = headers.get('origin');
    // 框架默认头里的 Allow-Origin 是 *，且先合并；这里必须显式覆盖成 'null'，只返回 {} 会留下 *。
    return { 'Access-Control-Allow-Origin': allowed(origin) && origin ? origin : 'null', Vary: 'Origin' };
  };
  // 单包上限：框架默认只有 4KB，装不下实时游戏房主发的整盘快照（实测 1～3KB，长局会更大）。64KB 足够，又不至于让人拿来灌流量。
  const transport = new WebSocketTransport({
    maxPayload: 64 * 1024,
    beforeUpgrade: (request) => (allowed(request.headers.get('origin')) ? undefined : new Response(null, { status: 403 }))
  });
  // coop：泡噗 / 山山兔这类实时游戏的中继房间（游戏跑在房主浏览器里），其余都是按适配器开的权威房间。
  const rooms = { relay: defineRoom(RelayRoom), coop: defineRoom(CoopRoom).filterBy(['code']) };
  for (const game of Object.keys(adapters)) rooms[game] = defineRoom(ArcadeRoom).filterBy(['code']);
  return defineServer({ transport, rooms, greet: false });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || 2567);
  if (!process.env.ALLOWED_ORIGINS) console.warn('WARN: ALLOWED_ORIGINS 未设置，接受任意网页来源');
  createServer().listen(port).then(() => console.log(`arcade-server on :${port}`));
}
