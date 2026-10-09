// 全球榜单的共享部分：榜单定义、输入校验、请求处理和存储。
// 浏览器（leaderboard.js）和 Cloudflare Pages Function（functions/api/scores.js）都从这里取用，
// 测试用内存存储，线上用 D1。这里不碰 DOM，也不碰 localStorage。

const MAX_SCORE = 9_999_999;

// 每个「游戏 + 模式」一份榜。order 决定谁更好：desc 越大越好，asc 越小越好（抓大鹅经典按通关用时）。
// scale 是存储值与显示值的倍数：用时按 0.1 秒存成整数。min / max 是服务端的合理性范围，挡住明显的乱填。
export const BOARDS = {
  pop2: { game: 'pop2', label: '', order: 'desc', unit: '分', scale: 1, min: 1, max: MAX_SCORE },
  'pop3-classic': { game: 'pop3', label: '经典', order: 'desc', unit: '分', scale: 1, min: 1, max: MAX_SCORE },
  'pop3-endless': { game: 'pop3', label: '无尽', order: 'desc', unit: '分', scale: 1, min: 1, max: MAX_SCORE },
  surge: { game: 'surge', label: '', order: 'desc', unit: '分', scale: 1, min: 1, max: MAX_SCORE },
  blast: { game: 'blast', label: '', order: 'desc', unit: '分', scale: 1, min: 1, max: MAX_SCORE },
  // 99 件物品、每次凑三个，再快也不可能少于 15 秒。
  'goose-classic': { game: 'goose', label: '经典 · 用时', order: 'asc', unit: '秒', scale: 10, min: 150, max: 36_000 },
  'goose-endless': { game: 'goose', label: '无尽 · 消除', order: 'desc', unit: '件', scale: 1, min: 1, max: 999 },
  // 十关打满、每关速通也只有三万出头，十万封顶。
  quest: { game: 'quest', label: '', order: 'desc', unit: '分', scale: 1, min: 1, max: 100_000 },
  // 三十关乘客共约 5900 人（每人 5 分）加关卡奖励 46500，合计不到 8 万，十五万封顶。
  park: { game: 'park', label: '', order: 'desc', unit: '分', scale: 1, min: 1, max: 150_000 },
  // 五十关共 390 瓶（每瓶 10 分）加每关最多 300 分的星级奖励，满分 18900，两万封顶。
  pour: { game: 'pour', label: '', order: 'desc', unit: '分', scale: 1, min: 1, max: 20_000 }
};
export const GAMES = [
  { id: 'pop2', title: '泡噗 2' },
  { id: 'pop3', title: '泡噗 3' },
  { id: 'surge', title: '山山兔' },
  { id: 'blast', title: '方块爆破' },
  { id: 'goose', title: '抓大鹅' },
  { id: 'quest', title: '三消勇者团' },
  { id: 'park', title: '挪车接客' },
  { id: 'pour', title: '倒水排序' }
];
export const boardsOf = (game) => Object.keys(BOARDS).filter((id) => BOARDS[id].game === game);

export const NAME_MAX = 12;
export const TOP_LIMIT = 20;
const BODY_LIMIT = 1024;

export const isBoard = (id) => typeof id === 'string' && Object.hasOwn(BOARDS, id);
export const formatValue = (board, value) => {
  const { scale, unit } = BOARDS[board];
  return `${scale === 1 ? value : (value / scale).toFixed(1)} ${unit}`;
};
// 用时越小越好，其余越大越好。
export const isBetter = (board, value, than) => (BOARDS[board].order === 'asc' ? value < than : value > than);

export function cleanName(raw) {
  const text = String(raw ?? '').replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return [...text].slice(0, NAME_MAX).join('') || '无名玩家';
}
export const isPlayerId = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(id);

// ---- 密码即身份 ----
// 玩家没有账号：pid 是「站点前缀 + 密码」的 SHA-256，同一个密码在任何浏览器里算出同一个 pid。
// 不用 crypto.subtle：局域网里的 http://192.168.x.x 不是安全上下文，那里没有 subtle。
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 32;
export const isPassword = (text) => typeof text === 'string' && /^[A-Za-z0-9]+$/.test(text) && text.length >= PASSWORD_MIN && text.length <= PASSWORD_MAX;

// 轮常量：前 64 个素数立方根的小数部分，取 32 位。
const K = (() => {
  const primes = [];
  for (let n = 2; primes.length < 64; n += 1) if (primes.every((p) => n % p)) primes.push(n);
  return Uint32Array.from(primes, (p) => Math.floor((Math.cbrt(p) % 1) * 2 ** 32));
})();
export function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const padded = new Uint8Array(((data.length + 9 + 63) >> 6) << 6);
  padded.set(data);
  padded[data.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor((data.length * 8) / 2 ** 32));
  view.setUint32(padded.length - 4, (data.length * 8) >>> 0);
  const h = Uint32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19);
  const w = new Uint32Array(64);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(offset + i * 4);
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i += 1) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    [a, b, c, d, e, f, g, hh].forEach((value, i) => { h[i] = (h[i] + value) | 0; });
  }
  return [...h].map((value) => (value >>> 0).toString(16).padStart(8, '0')).join('');
}
export const derivePid = (password) => sha256Hex(`pao-arcade:${password}`);

const json = (status, body) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

// store 约定（都是 async）：
//   entry(board, pid) → { name, value } | null
//   put(board, pid, name, value, at)   —— 只在更好时才覆盖分数，昵称总是更新
//   top(board, limit) → [{ name, value, at }]，已按名次排好
//   rank(board, value) → 比 value 更好的人数 + 1
export async function handleScores(request, store, now = Date.now()) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const board = url.searchParams.get('board');
    if (!isBoard(board)) return json(400, { error: '未知榜单' });
    const rows = await store.top(board, TOP_LIMIT);
    // 并列同名次（标准竞赛排名），与下面 rank() 的算法一致。
    const entries = [];
    rows.forEach((row, index) => {
      entries.push({ rank: index && row.value === rows[index - 1].value ? entries[index - 1].rank : index + 1, name: row.name, value: row.value, at: row.at });
    });
    const pid = url.searchParams.get('pid');
    let me = null;
    if (isPlayerId(pid)) {
      const mine = await store.entry(board, pid);
      if (mine) me = { rank: await store.rank(board, mine.value), name: mine.name, value: mine.value };
    }
    return json(200, { board, entries, me });
  }
  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > BODY_LIMIT) return json(413, { error: '请求太大' });
    let body;
    try { body = JSON.parse(text); } catch { return json(400, { error: '请求格式不对' }); }
    const { board, pid, value } = body ?? {};
    if (!isBoard(board)) return json(400, { error: '未知榜单' });
    if (!isPlayerId(pid)) return json(400, { error: '玩家标识无效' });
    const rule = BOARDS[board];
    if (!Number.isInteger(value) || value < rule.min || value > rule.max) return json(400, { error: '成绩不在合理范围内' });
    const name = cleanName(body.name);
    const previous = await store.entry(board, pid);
    const improved = !previous || isBetter(board, value, previous.value);
    await store.put(board, pid, name, value, now);
    const best = improved ? value : previous.value;
    return json(200, { board, improved, best, rank: await store.rank(board, best) });
  }
  return json(405, { error: '不支持的请求方式' });
}

// 身份接口（functions/api/player.js）：
//   GET  ?pid=…           → { exists, name, boards }，登录前预览这个密码对应的身份
//   POST { pid, name }    → 把该 pid 在所有榜上的昵称一并改掉，返回 { name, boards }
// 另需要 store.profile(pid) → { name, boards } | null 和 store.rename(pid, name) → 改了几行。
export async function handlePlayer(request, store) {
  if (request.method === 'GET') {
    const pid = new URL(request.url).searchParams.get('pid');
    if (!isPlayerId(pid)) return json(400, { error: '玩家标识无效' });
    const profile = await store.profile(pid);
    return json(200, profile ? { exists: true, ...profile } : { exists: false, name: null, boards: 0 });
  }
  if (request.method === 'POST') {
    const text = await request.text();
    if (text.length > BODY_LIMIT) return json(413, { error: '请求太大' });
    let body;
    try { body = JSON.parse(text); } catch { return json(400, { error: '请求格式不对' }); }
    if (!isPlayerId(body?.pid)) return json(400, { error: '玩家标识无效' });
    const name = cleanName(body.name);
    return json(200, { name, boards: await store.rename(body.pid, name) });
  }
  return json(405, { error: '不支持的请求方式' });
}

export function memoryStore() {
  const rows = new Map(); // board → Map(pid → { name, value, at })
  const table = (board) => rows.get(board) ?? rows.set(board, new Map()).get(board);
  const ordered = (board) => [...table(board).values()].sort((a, b) => (BOARDS[board].order === 'asc' ? a.value - b.value : b.value - a.value) || a.at - b.at);
  return {
    async entry(board, pid) { return table(board).get(pid) ?? null; },
    async put(board, pid, name, value, at) {
      const mine = table(board).get(pid);
      if (!mine) table(board).set(pid, { name, value, at });
      else if (isBetter(board, value, mine.value)) Object.assign(mine, { name, value, at });
      else mine.name = name;
    },
    async top(board, limit) { return ordered(board).slice(0, limit).map(({ name, value, at }) => ({ name, value, at })); },
    async rank(board, value) { return 1 + [...table(board).values()].filter((row) => isBetter(board, row.value, value)).length; },
    async profile(pid) {
      const mine = [...rows.values()].map((t) => t.get(pid)).filter(Boolean).sort((a, b) => b.at - a.at);
      return mine.length ? { name: mine[0].name, boards: mine.length } : null;
    },
    async rename(pid, name) {
      let changed = 0;
      for (const t of rows.values()) if (t.has(pid)) { t.get(pid).name = name; changed += 1; }
      return changed;
    }
  };
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS scores (board TEXT NOT NULL, pid TEXT NOT NULL, name TEXT NOT NULL, value INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (board, pid))',
  'CREATE INDEX IF NOT EXISTS scores_by_value ON scores (board, value)',
  'CREATE INDEX IF NOT EXISTS scores_by_pid ON scores (pid)'
];
const prepared = new WeakMap();

// Cloudflare D1。第一次用到时自动建表，不需要单独跑迁移。
export function d1Store(db) {
  const ready = () => prepared.get(db) ?? prepared.set(db, db.batch(SCHEMA.map((sql) => db.prepare(sql)))).get(db);
  const query = async (sql, ...args) => { await ready(); return db.prepare(sql).bind(...args); };
  return {
    async entry(board, pid) {
      return (await query('SELECT name, value FROM scores WHERE board = ?1 AND pid = ?2', board, pid)).first();
    },
    async put(board, pid, name, value, at) {
      // 并发提交时由数据库保证只往更好的方向改。
      const better = BOARDS[board].order === 'asc' ? '<' : '>';
      await (await query(
        `INSERT INTO scores (board, pid, name, value, at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (board, pid) DO UPDATE SET name = excluded.name,
           value = CASE WHEN excluded.value ${better} scores.value THEN excluded.value ELSE scores.value END,
           at = CASE WHEN excluded.value ${better} scores.value THEN excluded.at ELSE scores.at END`,
        board, pid, name, value, at
      )).run();
    },
    async top(board, limit) {
      const direction = BOARDS[board].order === 'asc' ? 'ASC' : 'DESC';
      const { results } = await (await query(`SELECT name, value, at FROM scores WHERE board = ?1 ORDER BY value ${direction}, at ASC LIMIT ?2`, board, limit)).all();
      return results;
    },
    async rank(board, value) {
      const better = BOARDS[board].order === 'asc' ? '<' : '>';
      const row = await (await query(`SELECT COUNT(*) AS n FROM scores WHERE board = ?1 AND value ${better} ?2`, board, value)).first();
      return row.n + 1;
    },
    async profile(pid) {
      const { results } = await (await query('SELECT name FROM scores WHERE pid = ?1 ORDER BY at DESC', pid)).all();
      return results.length ? { name: results[0].name, boards: results.length } : null;
    },
    async rename(pid, name) {
      const { results } = await (await query('SELECT COUNT(*) AS n FROM scores WHERE pid = ?1', pid)).all();
      await (await query('UPDATE scores SET name = ?2 WHERE pid = ?1', pid, name)).run();
      return results[0].n;
    }
  };
}
