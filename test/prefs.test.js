import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPrefs, d1Store, emptyPrefs, hasPref, handlePrefs, memoryStore, parsePrefs, prefsFor, prefValue, setPrefValue, settlePrefs } from '../prefs-core.js';

const PID = (n) => `player-${String(n).padStart(4, '0')}`;
const post = (store, body) => handlePrefs(new Request('http://x/api/prefs', { method: 'POST', body: JSON.stringify(body) }), store, 1_000_000);
const get = (store, pid) => handlePrefs(new Request(`http://x/api/prefs?pid=${pid}`), store);

test('设置: 未设置时用默认值，未登记的键和类型不对的值被忽略', () => {
  let state = emptyPrefs(PID(1));
  assert.equal(prefValue(state, 'mineNoGuess'), false);
  state = setPrefValue(state, 'mineNoGuess', true);
  assert.equal(prefValue(state, 'mineNoGuess'), true);
  assert.deepEqual(state.pending, { mineNoGuess: true });
  assert.equal(setPrefValue(state, 'mineNoGuess', 'yes'), state);
  assert.equal(setPrefValue(state, 'unknown', true), state);
  const parsed = parsePrefs(JSON.stringify({ owner: PID(1), values: { mineNoGuess: 1, other: true }, pending: { mineNoGuess: true } }));
  assert.deepEqual(parsed, { owner: PID(1), values: {}, pending: { mineNoGuess: true } });
  assert.deepEqual(parsePrefs('{坏数据'), emptyPrefs());
});

test('设置: 数独难度和抓大鹅模式只接受登记过的选项', () => {
  const state = emptyPrefs(PID(1));
  assert.equal(prefValue(state, 'sudokuLevel'), 'normal');
  assert.equal(prefValue(state, 'gooseMode'), 'classic');
  assert.equal(hasPref(state, 'sudokuLevel'), false);
  const next = setPrefValue(setPrefValue(state, 'sudokuLevel', 'hard'), 'gooseMode', 'endless');
  assert.deepEqual(next.values, { sudokuLevel: 'hard', gooseMode: 'endless' });
  assert.equal(hasPref(next, 'sudokuLevel'), true);
  assert.equal(setPrefValue(next, 'sudokuLevel', 'expert'), next);
  assert.deepEqual(cleanPrefs({ sudokuLevel: 'easy', gooseMode: 'zen', mineNoGuess: 'true' }), { sudokuLevel: 'easy' });
});

test('设置: 缓存属于别的身份时作废，不把上一个人的设置带过去', () => {
  const mine = setPrefValue(emptyPrefs(PID(1)), 'mineNoGuess', true);
  assert.equal(prefsFor(mine, PID(1)), mine);
  assert.equal(prefValue(prefsFor(mine, PID(2)), 'mineNoGuess'), false);
  assert.equal(prefValue(prefsFor(mine, null), 'mineNoGuess'), false);
});

test('设置: 同步结果以服务端为准，但请求期间本机又改过的项保留并留待下次上报', () => {
  const sent = { mineNoGuess: true };
  let state = setPrefValue(emptyPrefs(PID(1)), 'mineNoGuess', true);
  assert.deepEqual(settlePrefs(state, sent, { mineNoGuess: true }), { owner: PID(1), values: { mineNoGuess: true }, pending: {} });
  state = setPrefValue(state, 'mineNoGuess', false); // 请求还在路上时又关掉了
  assert.deepEqual(settlePrefs(state, sent, { mineNoGuess: true }), { owner: PID(1), values: { mineNoGuess: false }, pending: { mineNoGuess: false } });
  // 只拉取（没有上报）时：别的设备改过的值覆盖本机
  assert.equal(prefValue(settlePrefs(emptyPrefs(PID(1)), {}, { mineNoGuess: true }), 'mineNoGuess'), true);
});

// 内存存储和 D1 必须表现一致，同一组用例两边都跑；D1 这边用 node:sqlite 包一层最小接口。
async function sqliteAsD1() {
  let DatabaseSync;
  try { ({ DatabaseSync } = await import('node:sqlite')); } catch { return null; }
  const sqlite = new DatabaseSync(':memory:');
  const statement = (sql, args = []) => ({
    bind: (...next) => statement(sql, next),
    run: async () => { sqlite.prepare(sql).run(...args); return {}; },
    all: async () => ({ results: sqlite.prepare(sql).all(...args) })
  });
  return { prepare: (sql) => statement(sql), batch: async (items) => { for (const item of items) await item.run(); return []; } };
}
const backends = { memory: async () => memoryStore(), d1: async () => { const db = await sqliteAsD1(); return db && d1Store(db); } };

for (const [name, create] of Object.entries(backends)) {
  test(`设置(${name}): 按身份保存，换设备拉取得到同样的值，身份之间互不影响`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    assert.deepEqual(await (await get(store, PID(1))).json(), { prefs: {} });
    assert.deepEqual(await (await post(store, { pid: PID(1), prefs: { mineNoGuess: true } })).json(), { prefs: { mineNoGuess: true } });
    assert.deepEqual(await (await get(store, PID(1))).json(), { prefs: { mineNoGuess: true } });
    assert.deepEqual(await (await post(store, { pid: PID(1), prefs: { mineNoGuess: false } })).json(), { prefs: { mineNoGuess: false } });
    assert.deepEqual(await (await post(store, { pid: PID(1), prefs: { sudokuLevel: 'hard', gooseMode: 'endless' } })).json(),
      { prefs: { mineNoGuess: false, sudokuLevel: 'hard', gooseMode: 'endless' } });
    assert.deepEqual(await (await get(store, PID(2))).json(), { prefs: {} });
  });

  test(`设置(${name}): 拒绝无效身份、未登记的键、类型不对的值和过大的请求`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    assert.equal((await get(store, 'x')).status, 400);
    assert.equal((await post(store, { pid: 'x', prefs: {} })).status, 400);
    assert.equal((await post(store, { pid: PID(1), prefs: [] })).status, 400);
    assert.equal((await post(store, { pid: PID(1), prefs: { mineNoGuess: 'on' } })).status, 400);
    assert.equal((await post(store, { pid: PID(1), prefs: { mineNoGuess: true, admin: true } })).status, 400);
    assert.equal((await post(store, { pid: PID(1), prefs: { sudokuLevel: 'expert' } })).status, 400);
    assert.equal((await post(store, { pid: PID(1), prefs: { pad: 'x'.repeat(2000) } })).status, 413);
    assert.equal((await handlePrefs(new Request('http://x/api/prefs', { method: 'DELETE' }), store)).status, 405);
    assert.deepEqual(await (await get(store, PID(1))).json(), { prefs: {} });
  });
}

test('俄罗斯方块的难度是一项设置：只认简单 / 普通 / 困难，默认普通', () => {
  assert.equal(prefValue(emptyPrefs(PID(1)), 'tetrisLevel'), 'normal');
  assert.deepEqual(cleanPrefs({ tetrisLevel: 'hard', sudokuLevel: 'easy' }), { tetrisLevel: 'hard', sudokuLevel: 'easy' });
  assert.deepEqual(cleanPrefs({ tetrisLevel: 'insane' }), {});
  const state = setPrefValue(emptyPrefs(PID(1)), 'tetrisLevel', 'easy');
  assert.deepEqual(state.pending, { tetrisLevel: 'easy' });
  assert.equal(setPrefValue(state, 'tetrisLevel', 'expert'), state);
});

test('2048 的主题是一项设置：只认糖果 / 经典 / 霓虹，默认糖果', () => {
  assert.equal(prefValue(emptyPrefs(PID(1)), 'g2048Theme'), 'candy');
  assert.deepEqual(cleanPrefs({ g2048Theme: 'neon' }), { g2048Theme: 'neon' });
  assert.deepEqual(cleanPrefs({ g2048Theme: 'pastel' }), {});
});
