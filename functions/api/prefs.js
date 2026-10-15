import { d1Store, handlePrefs } from '../../prefs-core.js';

// Cloudflare Pages Function：GET /api/prefs?pid=… 取这个身份的游戏设置，POST /api/prefs { pid, prefs } 改设置。
// 和榜单共用同一个 D1 绑定 DB。
export function onRequest({ request, env }) {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: '尚未配置数据库' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return handlePrefs(request, d1Store(env.DB));
}
