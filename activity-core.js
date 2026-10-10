// 游玩记录的共享部分：校验、请求处理、存储，以及隐藏看板用的汇总函数。
// 浏览器（activity.js、ops.html）和 Cloudflare Pages Function 都从这里取用；测试用内存存储，线上用 D1。
// 一行 = 一段连续游玩（一个 sid）。时间一律存 UTC 毫秒，东八区只在展示和汇总时换算。
import { BOARDS, GAMES, isBoard, isPlayerId, cleanName } from './leaderboard-core.js';

export const MAX_SESSION_MS = 12 * 60 * 60 * 1000; // 单段上限：12 小时
export const QUERY_LIMIT = 10_000;
export const MAX_RANGE_MS = 92 * 24 * 60 * 60 * 1000; // 看板一次最多查约 3 个月
const BODY_LIMIT = 1024;

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const isSessionId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);

// 客户端发累计值：已游玩 active_ms，以及距这一段开始过了 elapsed_ms。
// 服务端用自己的时钟推出开始时间，不信任客户端时钟；重复或乱序的心跳不会重复计时（active 只增不减）。
export async function handleActivity(request, store, now = Date.now()) {
  if (request.method !== 'POST') return json(405, { error: '不支持的请求方式' });
  const text = await request.text();
  if (text.length > BODY_LIMIT) return json(413, { error: '请求太大' });
  let body;
  try { body = JSON.parse(text); } catch { return json(400, { error: '请求格式不对' }); }
  const { sid, pid, board, active_ms: active, elapsed_ms: elapsed } = body ?? {};
  if (!isSessionId(sid) || !isPlayerId(pid)) return json(400, { error: '标识无效' });
  if (!isBoard(board) && !GAMES.some(game => game.id === board)) return json(400, { error: '未知游戏' });
  if (!Number.isInteger(active) || !Number.isInteger(elapsed) || active < 0 || elapsed < 0 || elapsed > MAX_SESSION_MS) return json(400, { error: '时长不合理' });
  await store.put({ sid, pid, name: cleanName(body.name), board, start_at: now - elapsed, last_at: now, active_ms: Math.min(active, elapsed) });
  return json(200, { ok: true });
}

// 比较令牌：先各自哈希成定长再逐字节异或，避免按长度或前缀提前返回。
async function safeEqual(a, b) {
  const digest = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const [x, y] = await Promise.all([digest(a), digest(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

// GET ?from=&to=（UTC 毫秒，按开始时间筛）。token 是服务端配置的 ADMIN_TOKEN。
export async function handleAdminActivity(request, store, token) {
  if (request.method !== 'GET') return json(405, { error: '不支持的请求方式' });
  if (!token) return json(503, { error: '看板尚未配置 ADMIN_TOKEN' });
  const given = /^Bearer (.+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  if (!given || !(await safeEqual(given, token))) return json(401, { error: '令牌不对' });
  const params = new URL(request.url).searchParams;
  const from = Number(params.get('from')), to = Number(params.get('to'));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to - from > MAX_RANGE_MS) return json(400, { error: '时间范围不合理' });
  const rows = await store.range(Math.floor(from), Math.floor(to), QUERY_LIMIT + 1);
  return json(200, { sessions: rows.slice(0, QUERY_LIMIT), truncated: rows.length > QUERY_LIMIT });
}

export function memoryStore() {
  const rows = new Map(); // sid → 一段游玩
  return {
    async put(row) {
      const mine = rows.get(row.sid);
      if (!mine) rows.set(row.sid, { ...row });
      else if (mine.pid === row.pid) Object.assign(mine, { name: row.name, last_at: row.last_at, active_ms: Math.max(mine.active_ms, row.active_ms) });
    },
    async range(from, to, limit) {
      return [...rows.values()].filter((row) => row.start_at >= from && row.start_at < to).sort((a, b) => a.start_at - b.start_at).slice(0, limit).map((row) => ({ ...row }));
    }
  };
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, pid TEXT NOT NULL, name TEXT NOT NULL, board TEXT NOT NULL, start_at INTEGER NOT NULL, last_at INTEGER NOT NULL, active_ms INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS sessions_by_time ON sessions (start_at)',
  'CREATE INDEX IF NOT EXISTS sessions_by_pid ON sessions (pid, start_at)'
];
const prepared = new WeakMap();

// Cloudflare D1。和榜单共用同一个数据库（绑定名 DB），第一次用到时自动建表。
export function d1Store(db) {
  const ready = () => prepared.get(db) ?? prepared.set(db, db.batch(SCHEMA.map((sql) => db.prepare(sql)))).get(db);
  const query = async (sql, ...args) => { await ready(); return db.prepare(sql).bind(...args); };
  return {
    async put({ sid, pid, name, board, start_at, last_at, active_ms }) {
      await (await query(
        `INSERT INTO sessions (sid, pid, name, board, start_at, last_at, active_ms) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT (sid) DO UPDATE SET name = excluded.name, last_at = excluded.last_at,
           active_ms = MAX(sessions.active_ms, excluded.active_ms)
         WHERE sessions.pid = excluded.pid`,
        sid, pid, name, board, start_at, last_at, active_ms
      )).run();
    },
    async range(from, to, limit) {
      const { results } = await (await query(
        'SELECT sid, pid, name, board, start_at, last_at, active_ms FROM sessions WHERE start_at >= ?1 AND start_at < ?2 ORDER BY start_at ASC LIMIT ?3',
        from, to, limit
      )).all();
      return results;
    }
  };
}

// ---- 看板汇总（纯函数，东八区没有夏令时，固定偏移即可）----
const CN_OFFSET = 8 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const pad = (n) => String(n).padStart(2, '0');

export const cnDayStart = (ms) => Math.floor((ms + CN_OFFSET) / DAY) * DAY - CN_OFFSET; // 当天 00:00（东八区）对应的 UTC 毫秒
export const cnDate = (ms) => new Date(ms + CN_OFFSET).toISOString().slice(0, 10);
export const cnTime = (ms) => { const d = new Date(ms + CN_OFFSET); return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`; };
export const gameOf = (board) => BOARDS[board]?.game ?? board;
export const boardTitle = (board, games) => {
  const rule = BOARDS[board];
  if (!rule) return games.find(game => game.id === board)?.title ?? board;
  const title = games.find((game) => game.id === rule.game)?.title ?? rule.game;
  return rule.label ? `${title} · ${rule.label.split(' · ')[0]}` : title;
};
export const formatDuration = (ms) => {
  const minutes = Math.round(ms / 60000);
  if (ms > 0 && minutes < 1) return `${Math.max(1, Math.round(ms / 1000))} 秒`;
  return minutes < 60 ? `${minutes} 分` : `${Math.floor(minutes / 60)} 时 ${minutes % 60} 分`;
};

// 把一段的活跃时长按墙钟区间 [start_at, last_at] 均摊到东八区各个整点，返回 Map(整点起始UTC毫秒 → 活跃毫秒)。
export function hourBuckets(session) {
  const buckets = new Map();
  const span = session.last_at - session.start_at;
  if (span <= 0 || session.active_ms <= 0) {
    if (session.active_ms > 0) buckets.set(Math.floor((session.start_at + CN_OFFSET) / HOUR) * HOUR - CN_OFFSET, session.active_ms);
    return buckets;
  }
  for (let t = Math.floor((session.start_at + CN_OFFSET) / HOUR) * HOUR - CN_OFFSET; t < session.last_at; t += HOUR) {
    const overlap = Math.min(t + HOUR, session.last_at) - Math.max(t, session.start_at);
    if (overlap > 0) buckets.set(t, (buckets.get(t) ?? 0) + (session.active_ms * overlap) / span);
  }
  return buckets;
}

// 玩家汇总：每人总时长、局数、最近在线、各游戏时长，按总时长降序。
export function summarizePlayers(sessions) {
  const players = new Map();
  for (const session of sessions) {
    const player = players.get(session.pid) ?? players.set(session.pid, { pid: session.pid, name: session.name, total: 0, count: 0, lastAt: 0, byGame: {} }).get(session.pid);
    const game = gameOf(session.board);
    player.total += session.active_ms;
    player.count += 1;
    player.byGame[game] = (player.byGame[game] ?? 0) + session.active_ms;
    if (session.last_at >= player.lastAt) { player.lastAt = session.last_at; player.name = session.name; }
  }
  return [...players.values()].sort((a, b) => b.total - a.total || b.lastAt - a.lastAt);
}

// 热力图：每个东八区日期一行，24 个整点各累计活跃毫秒。
export function heatmap(sessions) {
  const days = new Map();
  for (const session of sessions) {
    for (const [hourStart, ms] of hourBuckets(session)) {
      const date = cnDate(hourStart);
      const row = days.get(date) ?? days.set(date, Array(24).fill(0)).get(date);
      row[Math.floor(((hourStart + CN_OFFSET) % DAY) / HOUR)] += ms;
    }
  }
  return [...days.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([date, hours]) => ({ date, hours }));
}
