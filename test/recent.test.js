import test from 'node:test';
import assert from 'node:assert/strict';
import { addPlayed, d1Store, emptyState, forOwner, formatAgo, formatPlayed, handleRecent, markOpened, memoryStore, parseState, pendingItems, recentList, restorePending, takePending, viewOf, withServer } from '../recent-core.js';

const MIN = 60_000;
const PID = (n) => `player-${String(n).padStart(4, '0')}`;
const post = (store, body, now = 1_000_000) => handleRecent(new Request('http://x/api/recent', { method: 'POST', body: JSON.stringify(body) }), store, now);
const get = (store, pid) => handleRecent(new Request(`http://x/api/recent?pid=${pid}`), store);

test('最近常玩: 按最后打开排序，重复打开只更新时间不丢累计时长', () => {
  let state = emptyState(PID(1));
  state = markOpened(state, 'pop2', 1000);
  state = markOpened(state, 'goose', 2000);
  state = markOpened(state, 'blast', 3000);
  state = addPlayed(state, 'pop2', 90_000);
  assert.deepEqual(recentList(viewOf(state)).map((row) => row.game), ['blast', 'goose', 'pop2']);
  state = markOpened(state, 'pop2', 4000);
  assert.deepEqual(recentList(viewOf(state)).map((row) => [row.game, row.title, row.ms]), [['pop2', '泡噗 2', 90_000], ['blast', '方块爆破', 0], ['goose', '抓大鹅', 0]]);
});

test('最近常玩: 没打开过的游戏不会出现，也不会凭空累计；未知游戏被忽略', () => {
  const state = markOpened(emptyState(), 'pop2', 1000);
  assert.equal(addPlayed(state, 'surge', 5000), state);
  assert.equal(addPlayed(state, 'pop2', 0), state);
  assert.equal(addPlayed(state, 'pop2', -5), state);
  assert.equal(markOpened(state, 'nope', 2000), state);
  assert.deepEqual(recentList(viewOf(state)).map((row) => row.game), ['pop2']);
  assert.equal(viewOf(addPlayed(addPlayed(state, 'pop2', 1000), 'pop2', 2500)).pop2.ms, 3500);
});

test('最近常玩: 显示 = 服务端快照 + 还没上报的增量；上报后增量清空，失败则放回去', () => {
  let state = withServer(emptyState(PID(1)), { pop2: { last: 500, ms: 60_000 }, goose: { last: 400, ms: 5000 } });
  // 在服务端已有记录的游戏上继续玩（比如另一台设备玩过），不需要重新打开也能累计。
  state = addPlayed(state, 'goose', 2000);
  state = markOpened(state, 'pop2', 900);
  assert.deepEqual(viewOf(state), { pop2: { last: 900, ms: 60_000 }, goose: { last: 400, ms: 7000 } });
  assert.deepEqual(pendingItems(state), [{ game: 'goose', last: 400, ms: 2000 }, { game: 'pop2', last: 900, ms: 0 }]);
  const items = pendingItems(state);
  const taken = takePending(state);
  assert.deepEqual(taken.pending, {});
  // 上报期间又玩了一会儿，失败后放回去要和新增量合并。
  const during = addPlayed(taken, 'goose', 500);
  const restored = restorePending(during, items);
  assert.deepEqual(restored.pending.goose, { last: 400, ms: 2500 });
  assert.deepEqual(restored.pending.pop2, { last: 900, ms: 0 });
});

test('最近常玩: 缓存只属于一个身份，换人清空，未归属的由当前身份接手', () => {
  const mine = markOpened(emptyState(PID(1)), 'pop2', 1000);
  assert.equal(forOwner(mine, PID(1)), mine);
  assert.deepEqual(forOwner(mine, PID(2)), emptyState(PID(2)));
  assert.deepEqual(forOwner(mine, null), emptyState()); // 退出登录后不显示上一个人的
  const anonymous = markOpened(emptyState(), 'pop2', 1000);
  assert.equal(forOwner(anonymous, PID(2)).owner, PID(2));
  assert.deepEqual(viewOf(forOwner(anonymous, PID(2))), { pop2: { last: 1000, ms: 0 } });
  assert.equal(forOwner(anonymous, null), anonymous);
});

test('最近常玩: 本地存储里的脏数据被丢掉', () => {
  assert.deepEqual(parseState(null), emptyState());
  assert.deepEqual(parseState('{坏的'), emptyState());
  assert.deepEqual(parseState('[1,2]'), emptyState());
  const raw = JSON.stringify({ owner: 'x', games: { pop2: { last: 5, ms: 1200.4 }, nope: { last: 5, ms: 1 }, goose: { last: 'x', ms: 1 }, blast: { last: 9, ms: -3 }, quest: null, park: { last: 0, ms: 1 } }, pending: 'oops' });
  assert.deepEqual(parseState(raw), { owner: null, games: { pop2: { last: 5, ms: 1200 }, blast: { last: 9, ms: 0 } }, pending: {} });
});

test('最近常玩: 时长与相对时间的显示', () => {
  assert.equal(formatPlayed(0), '刚开始');
  assert.equal(formatPlayed(42_000), '42 秒');
  assert.equal(formatPlayed(59_900), '59 秒');
  assert.equal(formatPlayed(MIN), '1 分');
  assert.equal(formatPlayed(15 * MIN), '15 分');
  assert.equal(formatPlayed(65 * MIN), '1 时 5 分');
  assert.equal(formatAgo(1000, 1000 + 20_000), '刚刚');
  assert.equal(formatAgo(0, 5 * MIN), '5 分钟前');
  assert.equal(formatAgo(0, 3 * 60 * MIN), '3 小时前');
  assert.equal(formatAgo(0, 2 * 24 * 60 * MIN), '2 天前');
  assert.equal(formatAgo(5000, 1000), '刚刚'); // 时钟被调回去也不出负数
});

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
  test(`最近常玩(${name}): 上报累加时长、last 取最大，两台设备互不覆盖`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    assert.deepEqual(await (await get(store, PID(1))).json(), { games: {} });
    // 设备 A 玩了泡噗 2 一分钟。
    let reply = await (await post(store, { pid: PID(1), items: [{ game: 'pop2', last: 5000, ms: 60_000 }] })).json();
    assert.deepEqual(reply, { games: { pop2: { last: 5000, ms: 60_000 } } });
    // 设备 B 先打开了抓大鹅，又玩了泡噗 2 半分钟（时间戳更早，因为离线时记的）。
    reply = await (await post(store, { pid: PID(1), items: [{ game: 'goose', last: 7000, ms: 0 }, { game: 'pop2', last: 4000, ms: 30_000 }] })).json();
    assert.deepEqual(reply.games, { pop2: { last: 5000, ms: 90_000 }, goose: { last: 7000, ms: 0 } });
    // 空 items 只是拉取；别人的数据互不影响。
    assert.deepEqual((await (await post(store, { pid: PID(1), items: [] })).json()).games, reply.games);
    assert.deepEqual(await (await get(store, PID(2))).json(), { games: {} });
    assert.deepEqual((await (await get(store, PID(1))).json()).games, reply.games);
  });

  test(`最近常玩(${name}): 同一次请求里同一个游戏出现多次也能合并`, async (t) => {
    const store = await create();
    if (!store) return t.skip('当前 Node 没有 node:sqlite');
    const reply = await (await post(store, { pid: PID(1), items: [{ game: 'blast', last: 100, ms: 1000 }, { game: 'blast', last: 300, ms: 2000 }] })).json();
    assert.deepEqual(reply.games, { blast: { last: 300, ms: 3000 } });
  });
}

test('最近常玩: 拒绝非法玩家标识、未知游戏和不合理的数值；未来时间被收紧到当前', async () => {
  const store = memoryStore();
  const item = { game: 'pop2', last: 5000, ms: 1000 };
  const bad = async (body) => (await post(store, { pid: PID(1), items: [item], ...body })).status;
  assert.equal(await bad({ pid: 'x' }), 400);
  assert.equal(await bad({ items: 'nope' }), 400);
  assert.equal(await bad({ items: [{ ...item, game: 'nope' }] }), 400);
  assert.equal(await bad({ items: [{ ...item, game: '__proto__' }] }), 400);
  assert.equal(await bad({ items: [{ ...item, last: 0 }] }), 400);
  assert.equal(await bad({ items: [{ ...item, last: 1.5 }] }), 400);
  assert.equal(await bad({ items: [{ ...item, ms: -1 }] }), 400);
  assert.equal(await bad({ items: [{ ...item, ms: 13 * 3600_000 }] }), 400);
  assert.equal(await bad({ items: [{ ...item, ms: '1000' }] }), 400);
  assert.equal(await bad({ items: Array(9).fill(item) }), 400);
  assert.equal(await bad({ items: [null] }), 400);
  assert.deepEqual((await (await get(store, PID(1))).json()).games, {}); // 出错的请求不写入
  const future = await (await post(store, { pid: PID(2), items: [{ game: 'pop2', last: 9_999_999_999_999, ms: 0 }] }, 1_000_000)).json();
  assert.equal(future.games.pop2.last, 1_000_000 + 10 * MIN);
  assert.equal((await handleRecent(new Request('http://x/api/recent', { method: 'POST', body: '{坏的' }), store)).status, 400);
  assert.equal((await handleRecent(new Request('http://x/api/recent', { method: 'POST', body: 'x'.repeat(3000) }), store)).status, 413);
  assert.equal((await handleRecent(new Request('http://x/api/recent', { method: 'DELETE' }), store)).status, 405);
  assert.equal((await get(store, 'x')).status, 400);
});
