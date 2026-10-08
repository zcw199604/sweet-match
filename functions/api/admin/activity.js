import { d1Store, handleAdminActivity } from '../../../activity-core.js';

// 隐藏看板（/ops.html）的数据接口：GET /api/admin/activity?from=&to=，需要 Authorization: Bearer <ADMIN_TOKEN>。
// ADMIN_TOKEN 在 Pages 项目的 Settings → Variables and Secrets 里配成 Secret（见 README「游玩记录」）。
export function onRequest({ request, env }) {
  if (!env.DB) return new Response(JSON.stringify({ error: '尚未配置数据库' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  return handleAdminActivity(request, d1Store(env.DB), env.ADMIN_TOKEN);
}
