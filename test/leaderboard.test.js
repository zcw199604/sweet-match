import test from 'node:test';
import assert from 'node:assert/strict';
import { BOARDS, cleanName, d1Store, formatValue, handleScores, memoryStore } from '../leaderboard-core.js';

const PID = (n) => `player-${String(n).padStart(4, '0')}`;
const post = (store, body, now) => handleScores(new Request('http://x/api/scores', { method: 'POST', body: JSON.stringify(body) }), store, now);
const get = (store, query) => handleScores(new Request(`http://x/api/scores?${query}`), store);

// 内存存储和 D1 必须表现一致，所以同一组用例两边都跑。
// D1 这边用 node:sqlite 包一层最小的 D1 接口；运行环境没有 node:sqlite 时跳过。
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
  return {
    prepare: (sql) => statement(sql),
    batch: async (items) => { for (const item of items) await item.run(); return []; }
  };
}
const backends = { memory: async () => memoryStore(), d1: async () => { const db = await sqliteAsD1(); return db && d1Store(db); } };

for (const [name, create] of Object.entries(backends)) {
  test(`榜单(${name}): 提交、排序、只保留每人最好成绩`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    let reply = await (await post(store, { board: 'blast', pid: PID(1), name: '小明', value: 500 }, 1)).json();
    assert.deepEqual(reply, { board: 'blast', improved: true, best: 500, rank: 1 });
    await post(store, { board: 'blast', pid: PID(2), name: '小红', value: 900 }, 2);
    // 更低的成绩不会覆盖，但会告诉玩家他的最佳名次。
    reply = await (await post(store, { board: 'blast', pid: PID(1), name: '小明', value: 100 }, 3)).json();
    assert.deepEqual(reply, { board: 'blast', improved: false, best: 500, rank: 2 });
    reply = await (await post(store, { board: 'blast', pid: PID(1), name: '小明', value: 700 }, 4)).json();
    assert.deepEqual(reply, { board: 'blast', improved: true, best: 700, rank: 2 });

    const list = await (await get(store, `board=blast&pid=${PID(1)}`)).json();
    assert.deepEqual(list.entries.map(e => [e.rank, e.name, e.value]), [[1, '小红', 900], [2, '小明', 700]]);
    assert.deepEqual(list.me, { rank: 2, name: '小明', value: 700 });
    assert.equal((await (await get(store, 'board=blast')).json()).me, null);
    // 别的榜互不影响。
    assert.deepEqual((await (await get(store, 'board=pop2')).json()).entries, []);
  });

  test(`榜单(${name}): 并列同名次，先到先排；改昵称不丢成绩`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    await post(store, { board: 'surge', pid: PID(1), name: 'A', value: 300 }, 10);
    await post(store, { board: 'surge', pid: PID(2), name: 'B', value: 300 }, 11);
    await post(store, { board: 'surge', pid: PID(3), name: 'C', value: 100 }, 12);
    await post(store, { board: 'surge', pid: PID(1), name: '新名字', value: 50 }, 13);
    const { entries } = await (await get(store, 'board=surge')).json();
    assert.deepEqual(entries.map(e => [e.rank, e.name]), [[1, '新名字'], [1, 'B'], [3, 'C']]);
  });

  test(`榜单(${name}): 抓大鹅经典按用时升序，越快越靠前`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    await post(store, { board: 'goose-classic', pid: PID(1), name: 'A', value: 900 }, 1);
    await post(store, { board: 'goose-classic', pid: PID(2), name: 'B', value: 600 }, 2);
    let reply = await (await post(store, { board: 'goose-classic', pid: PID(1), name: 'A', value: 750 }, 3)).json();
    assert.equal(reply.improved, true);
    reply = await (await post(store, { board: 'goose-classic', pid: PID(1), name: 'A', value: 800 }, 4)).json();
    assert.deepEqual([reply.improved, reply.best, reply.rank], [false, 750, 2]);
    const { entries } = await (await get(store, 'board=goose-classic')).json();
    assert.deepEqual(entries.map(e => [e.name, e.value]), [['B', 600], ['A', 750]]);
  });
}

test('榜单: 拒绝未知榜单、非法玩家标识和不合理的成绩', async () => {
  const store = memoryStore();
  const bad = async (body) => (await post(store, { board: 'blast', pid: PID(1), value: 10, ...body })).status;
  assert.equal(await bad({ board: 'nope' }), 400);
  assert.equal(await bad({ board: '__proto__' }), 400);
  assert.equal(await bad({ pid: 'x' }), 400);
  assert.equal(await bad({ value: 0 }), 400);
  assert.equal(await bad({ value: -5 }), 400);
  assert.equal(await bad({ value: 1.5 }), 400);
  assert.equal(await bad({ value: '100' }), 400);
  assert.equal(await bad({ value: BOARDS.blast.max + 1 }), 400);
  assert.equal(await bad({ board: 'goose-classic', value: 20 }), 400); // 2 秒通关不可能
  assert.equal(await bad({ board: 'goose-endless', value: 1000 }), 400);
  assert.equal((await post(store, { board: 'blast', pid: PID(1), value: 'x'.repeat(2000) })).status, 413);
  assert.equal((await handleScores(new Request('http://x/api/scores', { method: 'POST', body: '{坏的' }), store)).status, 400);
  assert.equal((await handleScores(new Request('http://x/api/scores', { method: 'DELETE' }), store)).status, 405);
  assert.equal((await get(store, 'board=nope')).status, 400);
  assert.deepEqual((await (await get(store, 'board=blast')).json()).entries, []);
});

test('榜单: 昵称清洗与成绩显示', () => {
  assert.equal(cleanName('  小  明\n'), '小 明');
  assert.equal(cleanName(''), '无名玩家');
  assert.equal(cleanName(undefined), '无名玩家');
  assert.equal(cleanName('\u0007​'), '无名玩家');
  assert.equal([...cleanName('一二三四五六七八九十一二三四')].length, 12);
  assert.equal(cleanName('<b>x</b>'), '<b>x</b>'); // 不转义，页面一律用 textContent 渲染
  assert.equal(formatValue('blast', 1234), '1234 分');
  assert.equal(formatValue('goose-classic', 623), '62.3 秒');
  assert.equal(formatValue('goose-endless', 42), '42 件');
});
