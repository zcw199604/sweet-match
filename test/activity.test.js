import test from 'node:test';
import assert from 'node:assert/strict';
import { cnDate, cnDayStart, cnTime, d1Store, formatDuration, handleActivity, handleAdminActivity, heatmap, hourBuckets, memoryStore, summarizePlayers } from '../activity-core.js';

const PID = (n) => `player-${String(n).padStart(4, '0')}`;
const MIN = 60_000, HOUR = 60 * MIN;
const beat = (store, body, now) => handleActivity(new Request('http://x/api/activity', { method: 'POST', body: JSON.stringify({ sid: 'sess-0001', pid: PID(1), name: '小明', board: 'goose-classic', active_ms: 0, elapsed_ms: 0, ...body }) }), store, now);
const admin = (store, query, token = 'secret', configured = 'secret') => handleAdminActivity(new Request(`http://x/api/admin/activity?${query}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }), store, configured);

// 和榜单测试一样：内存存储和 D1 表现必须一致。D1 这边用 node:sqlite 包一层最小接口。
async function sqliteAsD1() {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { return null; }
  const sqlite = new DatabaseSync(':memory:');
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    run: async () => { sqlite.prepare(sql).run(...args); return {}; },
    first: async () => sqlite.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) })
  });
  return { prepare: (sql) => statement(sql), batch: async (items) => { for (const item of items) await item.run(); return []; } };
}
const backends = { memory: async () => memoryStore(), d1: async () => { const db = await sqliteAsD1(); return db && d1Store(db); } };

for (const [name, create] of Object.entries(backends)) {
  test(`游玩记录(${name}): 心跳是累计值，重复和乱序不会多算，开始时间取服务端时钟`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    const T = 1_000_000_000_000;
    assert.equal((await beat(store, { active_ms: 60_000, elapsed_ms: 65_000 }, T + 65_000)).status, 200);
    await beat(store, { active_ms: 120_000, elapsed_ms: 130_000 }, T + 130_000);
    await beat(store, { active_ms: 60_000, elapsed_ms: 65_000 }, T + 140_000); // 迟到的旧心跳
    await beat(store, { active_ms: 120_000, elapsed_ms: 130_000, name: '新名字' }, T + 150_000); // 重发
    const rows = await store.range(0, T * 2, 10);
    assert.deepEqual(rows.map((r) => ({ ...r })), [{ sid: 'sess-0001', pid: PID(1), name: '新名字', board: 'goose-classic', start_at: T, last_at: T + 150_000, active_ms: 120_000 }]);
  });

  test(`游玩记录(${name}): 别的玩家不能改写已有的段；按开始时间筛选并排序`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    await beat(store, { active_ms: 10_000, elapsed_ms: 10_000 }, 10_000);
    await beat(store, { pid: PID(2), active_ms: 99_000, elapsed_ms: 99_000 }, 20_000);
    await beat(store, { sid: 'sess-0002', board: 'blast', active_ms: 5_000, elapsed_ms: 5_000 }, 7_000 + 5_000);
    await beat(store, { sid: 'sess-0003', board: 'surge', active_ms: 5_000, elapsed_ms: 5_000 }, 500_000);
    assert.equal((await store.range(0, 1_000_000, 10)).find((r) => r.sid === 'sess-0001').active_ms, 10_000);
    assert.deepEqual((await store.range(0, 100_000, 10)).map((r) => r.sid), ['sess-0001', 'sess-0002']); // 开始时间 0 和 7000
    assert.deepEqual((await store.range(400_000, 600_000, 10)).map((r) => r.sid), ['sess-0003']);
    assert.equal((await store.range(0, 1_000_000, 2)).length, 2);
  });
}

test('游玩记录: 拒绝非法输入，active 不超过 elapsed', async () => {
  const store = memoryStore();
  const bad = async (body) => (await beat(store, body, 1_000_000)).status;
  assert.equal(await bad({ sid: 'x' }), 400);
  assert.equal(await bad({ pid: 'x' }), 400);
  assert.equal(await bad({ board: 'nope' }), 400);
  assert.equal(await bad({ board: '__proto__' }), 400);
  assert.equal(await bad({ active_ms: -1 }), 400);
  assert.equal(await bad({ active_ms: 1.5 }), 400);
  assert.equal(await bad({ active_ms: '5' }), 400);
  assert.equal(await bad({ elapsed_ms: 13 * HOUR, active_ms: 1 }), 400);
  assert.equal((await beat(store, { name: 'x'.repeat(2000) }, 1)).status, 413);
  assert.equal((await handleActivity(new Request('http://x', { method: 'POST', body: '{坏的' }), store)).status, 400);
  assert.equal((await handleActivity(new Request('http://x', { method: 'GET' }), store)).status, 405);
  await beat(store, { active_ms: 50_000, elapsed_ms: 10_000 }, 1_000_000);
  assert.equal((await store.range(0, 2_000_000, 5))[0].active_ms, 10_000);
});

test('看板接口: 必须带对令牌；没配置令牌时一律不开放', async () => {
  const store = memoryStore();
  await beat(store, { active_ms: 5_000, elapsed_ms: 5_000 }, 100_000);
  assert.equal((await admin(store, 'from=0&to=200000', null)).status, 401);
  assert.equal((await admin(store, 'from=0&to=200000', 'wrong')).status, 401);
  assert.equal((await admin(store, 'from=0&to=200000', 'secret', '')).status, 503);
  assert.equal((await admin(store, 'from=0&to=200000', '', '')).status, 503);
  const ok = await admin(store, 'from=0&to=200000');
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).sessions.length, 1);
  assert.equal((await admin(store, 'from=abc&to=5')).status, 400);
  assert.equal((await admin(store, 'from=9&to=5')).status, 400);
  assert.equal((await admin(store, `from=0&to=${400 * 24 * HOUR}`)).status, 400);
  assert.equal((await handleAdminActivity(new Request('http://x', { method: 'POST' }), store, 'secret')).status, 405);
});

test('东八区换算与时长显示', () => {
  const t = Date.UTC(2026, 9, 8, 16, 30); // 北京时间 10-09 00:30
  assert.equal(cnDate(t), '2026-10-09');
  assert.equal(cnTime(t), '00:30');
  assert.equal(cnDayStart(t), Date.UTC(2026, 9, 8, 16, 0));
  assert.equal(formatDuration(20_000), '20 秒');
  assert.equal(formatDuration(22 * MIN), '22 分');
  assert.equal(formatDuration(75 * MIN), '1 时 15 分');
});

test('汇总: 跨整点 / 跨午夜按东八区均摊到各小时', () => {
  // 北京时间 23:30–00:30，活跃 30 分钟（中间歇了一半）：两侧各 15 分钟。
  const start = Date.UTC(2026, 9, 8, 15, 30);
  const session = { pid: PID(1), name: 'A', board: 'blast', start_at: start, last_at: start + HOUR, active_ms: 30 * MIN };
  const buckets = [...hourBuckets(session)].map(([hour, ms]) => [cnDate(hour), cnTime(hour), ms / MIN]);
  assert.deepEqual(buckets, [['2026-10-08', '23:00', 15], ['2026-10-09', '00:00', 15]]);
  const rows = heatmap([session]);
  assert.deepEqual(rows.map((r) => [r.date, r.hours[23] / MIN, r.hours[0] / MIN]), [['2026-10-09', 0, 15], ['2026-10-08', 15, 0]]);
});

test('汇总: 玩家按总时长排序，最近的昵称生效', () => {
  const s = (pid, name, board, active, last) => ({ pid, name, board, start_at: last - active, last_at: last, active_ms: active });
  const players = summarizePlayers([s(PID(1), '旧名', 'goose-classic', 10 * MIN, 100 * MIN), s(PID(1), '新名', 'goose-endless', 5 * MIN, 200 * MIN), s(PID(2), 'B', 'blast', 60 * MIN, 150 * MIN)]);
  assert.deepEqual(players.map((p) => [p.name, p.total / MIN, p.count, p.byGame]), [['B', 60, 1, { blast: 60 * MIN }], ['新名', 15, 2, { goose: 15 * MIN }]]);
  assert.equal(players[1].lastAt, 200 * MIN);
});
