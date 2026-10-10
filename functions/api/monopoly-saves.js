import { d1Store, handleMonopolySaves } from '../../monopoly-saves-core.js';

// Cloudflare Pages Function：大富翁（/monopoly/）的云端存档。
//   GET /api/monopoly-saves?pid=…[&mapId=…&version=…]  列出存档；?pid=…&id=… 取一条
//   POST /api/monopoly-saves  { pid, save }             保存
//   DELETE /api/monopoly-saves?pid=…&id=…               删除
// 和榜单共用同一个 D1 绑定 DB。
export function onRequest({ request, env }) {
  if (!env.DB) {
    return new Response(JSON.stringify({ error: '尚未配置数据库' }), { status: 503, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return handleMonopolySaves(request, d1Store(env.DB));
}
