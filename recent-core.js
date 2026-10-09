// 「最近常玩」的共享部分：每个游戏最后一次打开的时间和累计游玩时长，按最后打开排序。
// 浏览器（recent.js）和 Cloudflare Pages Function（functions/api/recent.js）都从这里取用，
// 测试用内存存储，线上用 D1。这里不碰 DOM，也不碰 localStorage。
//
// 同步模型：服务端是每个 pid 的汇总（last 取最大、ms 累加），本机缓存 = 服务端快照 + 还没上报的增量。
//   本机状态 { owner, games, pending }：owner 是缓存属于哪个 pid，games 是最近一次从服务端拿到的快照，
//   pending 是本机新产生、还没上报的 { last, ms 增量 }。显示用 viewOf(state) = games 与 pending 合并。
import { GAMES, isPlayerId } from './leaderboard-core.js';

export const RECENT_VISIBLE = 3;
const known = (game) => GAMES.some((item) => item.id === game);
const MAX_ITEMS = GAMES.length;
const MAX_DELTA_MS = 12 * 3600_000; // 单次上报最多累计 12 小时，挡住明显的乱填
const FUTURE_SLACK_MS = 10 * 60_000; // 允许客户端时钟比服务端快一点
const BODY_LIMIT = 2048;

// 存储里的内容不可信：未知游戏、负数和非数字一律丢掉。
function cleanMap(map) {
  const clean = {};
  if (!map || typeof map !== 'object') return clean;
  for (const [game, row] of Object.entries(map)) {
    if (!known(game) || !row || !Number.isFinite(row.last) || row.last <= 0) continue;
    clean[game] = { last: Math.round(row.last), ms: Number.isFinite(row.ms) && row.ms > 0 ? Math.round(row.ms) : 0 };
  }
  return clean;
}
export const emptyState = (owner = null) => ({ owner, games: {}, pending: {} });
export function parseState(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { return emptyState(); }
  if (!data || typeof data !== 'object') return emptyState();
  return { owner: isPlayerId(data.owner) ? data.owner : null, games: cleanMap(data.games), pending: cleanMap(data.pending) };
}
// 缓存只属于一个身份：换了人就从头开始；还没有归属（没登录时记下的）则由当前身份接手。
export function forOwner(state, pid) {
  if (!pid) return state.owner === null ? state : emptyState(); // 退出登录后，上一个身份的缓存不再显示
  if (state.owner === pid) return state;
  return state.owner === null ? { ...state, owner: pid } : emptyState(pid);
}

export function viewOf(state) {
  const view = { ...state.games };
  for (const [game, row] of Object.entries(state.pending)) {
    const base = view[game];
    view[game] = { last: Math.max(base?.last ?? 0, row.last), ms: (base?.ms ?? 0) + row.ms };
  }
  return view;
}
export function markOpened(state, game, now) {
  if (!known(game)) return state;
  return { ...state, pending: { ...state.pending, [game]: { last: now, ms: state.pending[game]?.ms ?? 0 } } };
}
// 只给玩过（打开过）的游戏累计；还没打开过的游戏不会凭空出现在列表里。
export function addPlayed(state, game, ms) {
  const base = viewOf(state)[game];
  if (!base || !(ms > 0)) return state;
  return { ...state, pending: { ...state.pending, [game]: { last: base.last, ms: (state.pending[game]?.ms ?? 0) + ms } } };
}
export const pendingItems = (state) => Object.entries(state.pending).map(([game, row]) => ({ game, last: row.last, ms: row.ms }));
export const takePending = (state) => ({ ...state, pending: {} });
// 上报失败：把拿走的增量放回去，和这期间新产生的合并。
export function restorePending(state, items) {
  const pending = { ...state.pending };
  for (const { game, last, ms } of items) pending[game] = { last: Math.max(pending[game]?.last ?? 0, last), ms: (pending[game]?.ms ?? 0) + ms };
  return { ...state, pending };
}
export const withServer = (state, games) => ({ ...state, games: cleanMap(games) });

// 最后打开的在前；时间相同按游戏表里的顺序，保证稳定。
export function recentList(view) {
  const order = (game) => GAMES.findIndex((item) => item.id === game);
  return Object.entries(view)
    .map(([game, row]) => ({ game, title: GAMES[order(game)].title, last: row.last, ms: row.ms }))
    .sort((a, b) => b.last - a.last || order(a.game) - order(b.game));
}
// 不满一分钟显示秒，之后向下取整到分钟（不会把 59 秒显示成「1 分」）。
export function formatPlayed(ms) {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 1) return '刚开始';
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes} 分` : `${Math.floor(minutes / 60)} 时 ${minutes % 60} 分`;
}
export function formatAgo(last, now) {
  const minutes = Math.floor(Math.max(0, now - last) / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 60 * 24) return `${Math.floor(minutes / 60)} 小时前`;
  return `${Math.floor(minutes / (60 * 24))} 天前`;
}

// ---- 服务端 ----
const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

// store 约定（都是 async）：
//   list(pid) → { [game]: { last, ms } }
//   add(pid, items) —— items: [{ game, last, ms }]，last 取较大值，ms 累加
// GET ?pid=…               → { games }
// POST { pid, items: [...] } → 先累加再返回合并后的 { games }；items 可以为空
export async function handleRecent(request, store, now = Date.now()) {
  if (request.method === 'GET') {
    const pid = new URL(request.url).searchParams.get('pid');
    if (!isPlayerId(pid)) return json(400, { error: '玩家标识无效' });
    return json(200, { games: await store.list(pid) });
  }
  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > BODY_LIMIT) return json(413, { error: '请求太大' });
    let body;
    try { body = JSON.parse(text); } catch { return json(400, { error: '请求格式不对' }); }
    const { pid, items } = body ?? {};
    if (!isPlayerId(pid)) return json(400, { error: '玩家标识无效' });
    if (!Array.isArray(items) || items.length > MAX_ITEMS) return json(400, { error: '记录格式不对' });
    const merged = new Map(); // 同一个游戏出现多次时先合并，避免批量写入里重复主键
    for (const item of items) {
      if (!item || !known(item.game) || !Number.isInteger(item.last) || item.last <= 0 || !Number.isInteger(item.ms) || item.ms < 0 || item.ms > MAX_DELTA_MS) {
        return json(400, { error: '记录不在合理范围内' });
      }
      const row = { game: item.game, last: Math.min(item.last, now + FUTURE_SLACK_MS), ms: item.ms };
      const before = merged.get(item.game);
      merged.set(item.game, before ? { game: item.game, last: Math.max(before.last, row.last), ms: before.ms + row.ms } : row);
    }
    if (merged.size) await store.add(pid, [...merged.values()]);
    return json(200, { games: await store.list(pid) });
  }
  return json(405, { error: '不支持的请求方式' });
}

export function memoryStore() {
  const rows = new Map(); // pid → Map(game → { last, ms })
  return {
    async list(pid) { return Object.fromEntries([...(rows.get(pid) ?? [])].map(([game, row]) => [game, { ...row }])); },
    async add(pid, items) {
      const mine = rows.get(pid) ?? rows.set(pid, new Map()).get(pid);
      for (const { game, last, ms } of items) {
        const row = mine.get(game);
        if (row) { row.last = Math.max(row.last, last); row.ms += ms; } else mine.set(game, { last, ms });
      }
    }
  };
}

const SCHEMA = 'CREATE TABLE IF NOT EXISTS recent (pid TEXT NOT NULL, game TEXT NOT NULL, last_at INTEGER NOT NULL, ms INTEGER NOT NULL, PRIMARY KEY (pid, game))';
const prepared = new WeakMap();

// Cloudflare D1，和榜单共用同一个绑定 DB。第一次用到时自动建表。
export function d1Store(db) {
  const ready = () => prepared.get(db) ?? prepared.set(db, db.prepare(SCHEMA).run()).get(db);
  return {
    async list(pid) {
      await ready();
      const { results } = await db.prepare('SELECT game, last_at, ms FROM recent WHERE pid = ?1').bind(pid).all();
      return Object.fromEntries(results.map((row) => [row.game, { last: row.last_at, ms: row.ms }]));
    },
    async add(pid, items) {
      await ready();
      // 并发上报由数据库保证：last 只会变大，ms 在原值上累加。
      const sql = `INSERT INTO recent (pid, game, last_at, ms) VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT (pid, game) DO UPDATE SET last_at = MAX(recent.last_at, excluded.last_at), ms = recent.ms + excluded.ms`;
      await db.batch(items.map(({ game, last, ms }) => db.prepare(sql).bind(pid, game, last, ms)));
    }
  };
}
