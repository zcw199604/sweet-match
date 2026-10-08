import { d1Store, handleActivity } from '../../activity-core.js';

// Cloudflare Pages Function：POST /api/activity 接收游玩心跳（用榜单同一个 D1 绑定 DB）。
export function onRequest({ request, env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: '尚未配置数据库' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  return handleActivity(request, d1Store(env.DB));
}
