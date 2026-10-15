// 跟着身份（pid）走的游戏设置，比如扫雷的「无猜」开关：换浏览器输入同一个密码，设置也跟着回来。
// 浏览器（prefs.js）和 Cloudflare Pages Function（functions/api/prefs.js）都从这里取用，
// 测试用内存存储，线上用 D1。这里不碰 DOM，也不碰 localStorage。
//
// 同步模型：每个设置项各自「后写为准」。本机缓存 { owner, values, pending }：values 是当前生效的值，
// pending 是本机改过、还没报上去的项；拉取服务端结果时，pending 里的项以本机为准。
import { isPlayerId } from './leaderboard-core.js';

// 只接受这里登记过的设置项；新增设置时在这里加一行默认值，类型由默认值决定。
export const PREFS = { mineNoGuess: false };
const BODY_LIMIT = 1024;

// 存储和请求里的内容都不可信：未登记的键、类型不对的值一律丢掉。
export function cleanPrefs(map) {
  const clean = {};
  if (!map || typeof map !== 'object') return clean;
  for (const [key, value] of Object.entries(map)) {
    if (Object.hasOwn(PREFS, key) && typeof value === typeof PREFS[key]) clean[key] = value;
  }
  return clean;
}

export const emptyPrefs = (owner = null) => ({ owner, values: {}, pending: {} });
export function parsePrefs(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return emptyPrefs(); }
  if (!data || typeof data !== 'object') return emptyPrefs();
  return { owner: isPlayerId(data.owner) ? data.owner : null, values: cleanPrefs(data.values), pending: cleanPrefs(data.pending) };
}
// 缓存不属于当前身份（换了人 / 退出登录）就作废，免得把上一个人的设置带过去。
export const prefsFor = (state, pid) => (state.owner === pid ? state : emptyPrefs(pid));
export const prefValue = (state, key) => ({ ...PREFS, ...state.values })[key];
export function setPrefValue(state, key, value) {
  const one = cleanPrefs({ [key]: value });
  if (!Object.hasOwn(one, key)) return state;
  return { ...state, values: { ...state.values, ...one }, pending: { ...state.pending, ...one } };
}
// 报上去之后清掉已同步的项；期间又改了的项（值不同）留着下次再报。
export function settlePrefs(state, sent, server) {
  const pending = Object.fromEntries(Object.entries(state.pending).filter(([key, value]) => sent[key] !== value));
  return { ...state, values: { ...cleanPrefs(server), ...pending }, pending };
}

// ---- 服务端 ----
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

// store 约定（都是 async）：
//   list(pid) → { [key]: value }
//   put(pid, prefs, at) —— 覆盖写入这些项
// GET ?pid=…               → { prefs }
// POST { pid, prefs: {…} } → 写入后返回该身份全部的 { prefs }
export async function handlePrefs(request, store, now = Date.now()) {
  if (request.method === 'GET') {
    const pid = new URL(request.url).searchParams.get('pid');
    if (!isPlayerId(pid)) return json(400, { error: '玩家标识无效' });
    return json(200, { prefs: cleanPrefs(await store.list(pid)) });
  }
  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > BODY_LIMIT) return json(413, { error: '请求太大' });
    let body;
    try { body = JSON.parse(text); } catch { return json(400, { error: '请求格式不对' }); }
    const { pid, prefs } = body ?? {};
    if (!isPlayerId(pid)) return json(400, { error: '玩家标识无效' });
    if (!prefs || typeof prefs !== 'object' || Array.isArray(prefs)) return json(400, { error: '设置格式不对' });
    const clean = cleanPrefs(prefs);
    if (Object.keys(clean).length !== Object.keys(prefs).length) return json(400, { error: '设置项不认识或取值不对' });
    if (Object.keys(clean).length) await store.put(pid, clean, now);
    return json(200, { prefs: cleanPrefs(await store.list(pid)) });
  }
  return json(405, { error: '不支持的请求方式' });
}

export function memoryStore() {
  const rows = new Map(); // pid → { [key]: value }
  return {
    async list(pid) { return { ...rows.get(pid) }; },
    async put(pid, prefs) { rows.set(pid, { ...rows.get(pid), ...prefs }); }
  };
}

const SCHEMA = 'CREATE TABLE IF NOT EXISTS prefs (pid TEXT NOT NULL, key TEXT NOT NULL, value TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (pid, key))';
const prepared = new WeakMap();

// Cloudflare D1，和榜单共用同一个绑定 DB。第一次用到时自动建表；值按 JSON 存。
export function d1Store(db) {
  const ready = () => prepared.get(db) ?? prepared.set(db, db.prepare(SCHEMA).run()).get(db);
  return {
    async list(pid) {
      await ready();
      const { results } = await db.prepare('SELECT key, value FROM prefs WHERE pid = ?1').bind(pid).all();
      const prefs = {};
      for (const row of results) { try { prefs[row.key] = JSON.parse(row.value); } catch { /* 坏数据当作没设置 */ } }
      return prefs;
    },
    async put(pid, prefs, at) {
      await ready();
      const sql = `INSERT INTO prefs (pid, key, value, at) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT (pid, key) DO UPDATE SET value = excluded.value, at = excluded.at`;
      await db.batch(Object.entries(prefs).map(([key, value]) => db.prepare(sql).bind(pid, key, JSON.stringify(value), at)));
    }
  };
}
