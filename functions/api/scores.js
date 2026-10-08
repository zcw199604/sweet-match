import { d1Store, handleScores } from '../../leaderboard-core.js';

// Cloudflare Pages Function：GET /api/scores?board=… 取榜，POST /api/scores 提交成绩。
// 需要在 Pages 项目里把一个 D1 数据库绑定为 DB（见 README「全球榜单」）。
export function onRequest({ request, env }) {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: '榜单尚未配置数据库' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return handleScores(request, d1Store(env.DB));
}
