import { d1Store, handleRecent } from '../../recent-core.js';

// Cloudflare Pages Function：GET /api/recent?pid=… 取「最近常玩」，POST /api/recent 上报打开记录和游玩时长增量。
// 和榜单共用同一个 D1 绑定 DB。
export function onRequest({ request, env }) {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: '尚未配置数据库' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return handleRecent(request, d1Store(env.DB));
}
