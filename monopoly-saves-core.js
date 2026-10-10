// 大富翁（/monopoly/）的云端存档：按玩家 pid 存一份，换设备、换浏览器输入同一个密码就能接着玩。
// 和「最近常玩」「榜单」同一套身份（pid = 密码的 SHA-256）和同一个 D1。服务端不解释存档内容，只管存取：
// 校验形状和大小、每个 pid 最多保留最新的 MAX_SAVES 条。这里不碰 DOM，测试用内存存储，线上用 D1。
import { isPlayerId } from './leaderboard-core.js';

export const MAX_SAVES = 20;
const BODY_LIMIT = 1_500_000; // 字节；D1 单行上限 2MB，留出余量
const FUTURE_SLACK_MS = 10 * 60_000; // 允许客户端时钟比服务端快一点
const ID = /^[A-Za-z0-9_-]{8,64}$/;

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => typeof value === 'string' && value.length >= 1 && value.length <= max;
const strings = (list, max, each) => Array.isArray(list) && list.length <= max && list.every((item) => typeof item === 'string' && item.length <= each);

// 只留已知字段，形状不对就整条拒绝（返回 null）。存档里的 snapshot 是游戏自己的数据，这里不看内部。
export function cleanSave(raw, now = Date.now()) {
  if (!isObject(raw)) return null;
  const { id, mapId, mapVersion, mapName, saveTime, round, playerCount, playerUserIds, playerNames, snapshot, previousSnapshot } = raw;
  if (typeof id !== 'string' || !ID.test(id)) return null;
  if (!text(mapId, 128) || !text(mapVersion, 64) || typeof mapName !== 'string' || mapName.length > 200) return null;
  if (!Number.isInteger(saveTime) || saveTime <= 0 || !Number.isInteger(round) || round < 0) return null;
  if (!Number.isInteger(playerCount) || playerCount < 0 || playerCount > 64) return null;
  if (!strings(playerUserIds, 64, 128) || !strings(playerNames, 64, 64)) return null;
  if (!isObject(snapshot) || (previousSnapshot !== undefined && !isObject(previousSnapshot))) return null;
  const clean = { id, mapId, mapVersion, mapName, saveTime: Math.min(saveTime, now + FUTURE_SLACK_MS), round, playerCount, playerUserIds, playerNames, snapshot };
  if (previousSnapshot !== undefined) clean.previousSnapshot = previousSnapshot;
  return clean;
}

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

// store 约定（都是 async）：
//   list(pid, { mapId, version }) → 存档数组（可按地图、版本过滤），新的在前
//   get(pid, id) → 存档 | null
//   put(pid, save) —— 同 id 覆盖；写完后只保留这个 pid 最新的 MAX_SAVES 条
//   remove(pid, id)
// GET    ?pid=…[&mapId=…&version=…] → { saves, limit }；?pid=…&id=… → { save }，不存在 404
// POST   { pid, save }              → { ok: true }
// DELETE ?pid=…&id=…                → { ok: true }（不存在也算成功）
export async function handleMonopolySaves(request, store, now = Date.now()) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const pid = url.searchParams.get('pid');
    if (!isPlayerId(pid)) return json(400, { error: '玩家标识无效' });
    const id = url.searchParams.get('id');
    if (id !== null) {
      if (!ID.test(id)) return json(400, { error: '存档标识无效' });
      const save = await store.get(pid, id);
      return save ? json(200, { save }) : json(404, { error: '没有这个存档' });
    }
    const mapId = url.searchParams.get('mapId');
    const version = url.searchParams.get('version');
    return json(200, { saves: await store.list(pid, { mapId, version }), limit: MAX_SAVES });
  }
  if (request.method === 'POST') {
    const body = await request.text();
    if (new TextEncoder().encode(body).length > BODY_LIMIT) return json(413, { error: '存档太大' });
    let data;
    try { data = JSON.parse(body); } catch { return json(400, { error: '请求格式不对' }); }
    if (!isPlayerId(data?.pid)) return json(400, { error: '玩家标识无效' });
    const save = cleanSave(data.save, now);
    if (!save) return json(400, { error: '存档格式不对' });
    await store.put(data.pid, save);
    return json(200, { ok: true });
  }
  if (request.method === 'DELETE') {
    const pid = url.searchParams.get('pid');
    const id = url.searchParams.get('id');
    if (!isPlayerId(pid)) return json(400, { error: '玩家标识无效' });
    if (!ID.test(id ?? '')) return json(400, { error: '存档标识无效' });
    await store.remove(pid, id);
    return json(200, { ok: true });
  }
  return json(405, { error: '不支持的请求方式' });
}

const byNewest = (a, b) => b.saveTime - a.saveTime || (a.id < b.id ? -1 : 1);
const matches = ({ mapId, version }) => (save) => (mapId === null || mapId === undefined || save.mapId === mapId) && (version === null || version === undefined || save.mapVersion === version);

export function memoryStore() {
  const rows = new Map(); // pid → Map(id → save)
  return {
    async list(pid, filter = {}) { return [...(rows.get(pid)?.values() ?? [])].filter(matches(filter)).sort(byNewest).map((save) => structuredClone(save)); },
    async get(pid, id) { const save = rows.get(pid)?.get(id); return save ? structuredClone(save) : null; },
    async put(pid, save) {
      const mine = rows.get(pid) ?? rows.set(pid, new Map()).get(pid);
      mine.set(save.id, structuredClone(save));
      for (const old of [...mine.values()].sort(byNewest).slice(MAX_SAVES)) mine.delete(old.id);
    },
    async remove(pid, id) { rows.get(pid)?.delete(id); }
  };
}

const SCHEMA = 'CREATE TABLE IF NOT EXISTS monopoly_saves (pid TEXT NOT NULL, id TEXT NOT NULL, map_id TEXT NOT NULL, map_version TEXT NOT NULL, saved_at INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (pid, id))';
const prepared = new WeakMap();

// Cloudflare D1，和榜单共用同一个绑定 DB。第一次用到时自动建表。
export function d1Store(db) {
  const ready = () => prepared.get(db) ?? prepared.set(db, db.prepare(SCHEMA).run()).get(db);
  const parse = (rows) => rows.map((row) => JSON.parse(row.data));
  return {
    async list(pid, { mapId, version } = {}) {
      await ready();
      // 一个 pid 最多 MAX_SAVES 行，过滤放在 SQL 里只是为了少传；不带条件的占位用 IS NOT NULL。
      const { results } = await db.prepare(
        'SELECT data FROM monopoly_saves WHERE pid = ?1 AND (?2 IS NULL OR map_id = ?2) AND (?3 IS NULL OR map_version = ?3) ORDER BY saved_at DESC, id'
      ).bind(pid, mapId ?? null, version ?? null).all();
      return parse(results);
    },
    async get(pid, id) {
      await ready();
      const row = await db.prepare('SELECT data FROM monopoly_saves WHERE pid = ?1 AND id = ?2').bind(pid, id).first();
      return row ? JSON.parse(row.data) : null;
    },
    async put(pid, save) {
      await ready();
      await db.batch([
        db.prepare('INSERT OR REPLACE INTO monopoly_saves (pid, id, map_id, map_version, saved_at, data) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
          .bind(pid, save.id, save.mapId, save.mapVersion, save.saveTime, JSON.stringify(save)),
        db.prepare('DELETE FROM monopoly_saves WHERE pid = ?1 AND id NOT IN (SELECT id FROM monopoly_saves WHERE pid = ?1 ORDER BY saved_at DESC, id LIMIT ?2)')
          .bind(pid, MAX_SAVES)
      ]);
    },
    async remove(pid, id) {
      await ready();
      await db.prepare('DELETE FROM monopoly_saves WHERE pid = ?1 AND id = ?2').bind(pid, id).run();
    }
  };
}
