import { d1Store, handlePlayer } from '../../leaderboard-core.js';

// Cloudflare Pages Function：GET /api/player?pid=… 预览一个密码对应的身份，POST /api/player 同步改名到所有榜单。
// 和 /api/scores 共用同一个 D1 绑定 DB。
export function onRequest({ request, env }) {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: '榜单尚未配置数据库' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return handlePlayer(request, d1Store(env.DB));
}
