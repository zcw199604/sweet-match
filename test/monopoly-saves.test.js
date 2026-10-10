import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SAVES, cleanSave, d1Store, handleMonopolySaves, memoryStore } from '../monopoly-saves-core.js';

const NOW = 1_000_000;
const PID = (n) => `player-${String(n).padStart(4, '0')}`;
const ID = (n) => `save${String(n).padStart(6, '0')}`;
const save = (n, extra = {}) => ({
  id: ID(n), mapId: 'map-a', mapVersion: '0', mapName: '非常好地图', saveTime: 1000 + n, round: n,
  playerCount: 2, playerUserIds: ['u1', 'ai1'], playerNames: ['玩家1', 'AI玩家1'],
  snapshot: { currentRound: n, playerSnapshots: { u1: { money: 10000 } } }, ...extra
});
const call = (store, method, query = '', body) => handleMonopolySaves(
  new Request(`http://x/api/monopoly-saves${query}`, { method, body: body === undefined ? undefined : JSON.stringify(body) }), store, NOW
);
const put = (store, pid, record) => call(store, 'POST', '', { pid, save: record });
const list = async (store, pid, query = '') => (await (await call(store, 'GET', `?pid=${pid}${query}`)).json()).saves;

// 内存存储和 D1 必须表现一致，同一组用例两边都跑；D1 这边用 node:sqlite 包一层最小接口。
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
  test(`大富翁云存档(${name}): 存、列、取、删，别的玩家看不到`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    assert.deepEqual(await list(store, PID(1)), []);
    assert.equal((await put(store, PID(1), save(1))).status, 200);
    assert.equal((await put(store, PID(1), save(2, { mapId: 'map-b' }))).status, 200);
    assert.equal((await put(store, PID(1), save(3, { mapVersion: '1' }))).status, 200);
    // 新的在前；按地图和版本过滤。
    assert.deepEqual((await list(store, PID(1))).map((s) => s.id), [ID(3), ID(2), ID(1)]);
    assert.deepEqual((await list(store, PID(1), '&mapId=map-a')).map((s) => s.id), [ID(3), ID(1)]);
    assert.deepEqual((await list(store, PID(1), '&mapId=map-a&version=0')).map((s) => s.id), [ID(1)]);
    // 内容原样返回，包括 previousSnapshot。
    await put(store, PID(1), save(4, { previousSnapshot: { currentRound: 3 } }));
    const got = await (await call(store, 'GET', `?pid=${PID(1)}&id=${ID(4)}`)).json();
    assert.deepEqual(got.save, save(4, { previousSnapshot: { currentRound: 3 } }));
    assert.equal((await call(store, 'GET', `?pid=${PID(1)}&id=${ID(99)}`)).status, 404);
    // 别人既列不出也取不到，删不掉。
    assert.deepEqual(await list(store, PID(2)), []);
    assert.equal((await call(store, 'GET', `?pid=${PID(2)}&id=${ID(4)}`)).status, 404);
    await call(store, 'DELETE', `?pid=${PID(2)}&id=${ID(4)}`);
    assert.equal((await list(store, PID(1))).length, 4);
    // 删自己的；重复删也算成功。
    assert.equal((await call(store, 'DELETE', `?pid=${PID(1)}&id=${ID(4)}`)).status, 200);
    assert.equal((await call(store, 'DELETE', `?pid=${PID(1)}&id=${ID(4)}`)).status, 200);
    assert.deepEqual((await list(store, PID(1))).map((s) => s.id), [ID(3), ID(2), ID(1)]);
  });

  test(`大富翁云存档(${name}): 同 id 覆盖，不会多出一条`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    await put(store, PID(1), save(1, { round: 1 }));
    await put(store, PID(1), save(1, { round: 7, saveTime: 5000 }));
    const rows = await list(store, PID(1));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].round, 7);
  });

  test(`大富翁云存档(${name}): 每个玩家只留最新的 ${MAX_SAVES} 条，别人的不受影响`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    await put(store, PID(2), save(500));
    for (let n = 1; n <= MAX_SAVES + 5; n += 1) await put(store, PID(1), save(n));
    const rows = await list(store, PID(1));
    assert.equal(rows.length, MAX_SAVES);
    assert.equal(rows[0].id, ID(MAX_SAVES + 5));
    assert.equal(rows.at(-1).id, ID(6)); // 最老的 5 条被挤掉
    assert.equal((await list(store, PID(2))).length, 1);
    // 补传一条比现有全部都老的存档：写进去又被立刻挤掉，不会把新的挤走。
    await put(store, PID(1), save(0, { saveTime: 1 }));
    assert.deepEqual((await list(store, PID(1))).map((s) => s.id), rows.map((s) => s.id));
  });
}

test('大富翁云存档: 拒绝非法玩家标识、形状不对的存档、过大的请求和不支持的方法', async () => {
  const store = memoryStore();
  const post = (body) => call(store, 'POST', '', body).then((r) => r.status);
  assert.equal(await post({ pid: 'x', save: save(1) }), 400);
  assert.equal(await post({ pid: PID(1) }), 400);
  assert.equal(await post({ pid: PID(1), save: { ...save(1), id: '../etc' } }), 400);
  assert.equal(await post({ pid: PID(1), save: { ...save(1), snapshot: [] } }), 400);
  assert.equal(await post({ pid: PID(1), save: { ...save(1), previousSnapshot: 'x' } }), 400);
  assert.equal(await post({ pid: PID(1), save: { ...save(1), round: -1 } }), 400);
  assert.equal(await post({ pid: PID(1), save: { ...save(1), playerNames: Array(65).fill('a') } }), 400);
  assert.equal(await post({ pid: PID(1), save: { ...save(1), mapId: '' } }), 400);
  const huge = { pid: PID(1), save: save(1, { snapshot: { blob: 'x'.repeat(1_600_000) } }) };
  assert.equal(await post(huge), 413);
  const broken = await handleMonopolySaves(new Request('http://x/api/monopoly-saves', { method: 'POST', body: '{坏的' }), store, NOW);
  assert.equal(broken.status, 400);
  assert.equal((await call(store, 'GET', '?pid=x')).status, 400);
  assert.equal((await call(store, 'GET', `?pid=${PID(1)}&id=../x`)).status, 400);
  assert.equal((await call(store, 'DELETE', `?pid=${PID(1)}`)).status, 400);
  assert.equal((await call(store, 'PUT')).status, 405);
  assert.deepEqual(await list(store, PID(1)), []);
});

test('大富翁云存档: 只保留已知字段，未来的保存时间被收紧到当前', () => {
  const clean = cleanSave({ ...save(1, { saveTime: NOW * 10 }), evil: '<script>', extra: { a: 1 } }, NOW);
  assert.equal('evil' in clean, false);
  assert.equal('extra' in clean, false);
  assert.equal(clean.saveTime, NOW + 10 * 60_000);
  assert.equal('previousSnapshot' in clean, false);
  assert.equal(cleanSave(null), null);
  assert.equal(cleanSave('x'), null);
});
