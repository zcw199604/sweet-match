import { test, expect } from '@playwright/test';
import { derivePid } from '../../leaderboard-core.js';
import { handleRecent, memoryStore } from '../../recent-core.js';

const PASSWORD = 'e2eTestPass1';
const PID = derivePid(PASSWORD);
const OTHER = derivePid('someoneElse99');

// 只在第一次加载时写入，这样刷新、回到首页后看到的是页面自己更新过的数据。
const seed = (page, cache) => page.addInitScript(({ cache, password }) => {
  if (localStorage.getItem('seeded')) return;
  localStorage.setItem('seeded', '1');
  localStorage.setItem('pao-pw', password); localStorage.setItem('pao-name', '测试员');
  if (cache) localStorage.setItem('pao-recent', JSON.stringify(cache));
}, { cache, password: PASSWORD });

// 用真正的服务端处理函数 + 内存存储当 /api/recent，这样页面和服务端的约定一起被测到。
async function serve(page, store = memoryStore()) {
  const calls = [];
  await page.route('**/api/recent**', async (route) => {
    const request = route.request();
    const body = request.method() === 'POST' ? request.postData() : undefined;
    calls.push({ method: request.method(), body: body && JSON.parse(body) });
    const response = await handleRecent(new Request(request.url(), { method: request.method(), body }), store);
    await route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  return { store, calls };
}
const ready = async (page) => { await page.goto('/'); await page.locator('body[data-ready]').waitFor(); };

test('最近常玩: 默认三个按最后打开排序，右上角显示时长，更多展开全部', async ({ page }) => {
  const now = Date.now();
  const games = { pop2: { last: now - 5000, ms: 42_000 }, goose: { last: now - 9 * 60_000, ms: 15 * 60_000 }, blast: { last: now - 3600_000, ms: 3900_000 }, pour: { last: now - 2 * 86400_000, ms: 0 } };
  await seed(page, { owner: PID, games, pending: {} });
  // 服务端才是权威：同步后页面显示的是服务端的汇总，所以服务端也要有同样的记录。
  const store = memoryStore();
  await store.add(PID, Object.entries(games).map(([game, row]) => ({ game, last: row.last, ms: row.ms })));
  await serve(page, store);
  await ready(page);
  const cards = page.locator('.recent-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.locator('.recent-title')).toHaveText(['泡噗 2', '抓大鹅', '方块爆破']);
  await expect(cards.locator('.recent-time')).toHaveText(['42 秒', '15 分', '1 时 5 分']);
  await expect(page.locator('#recent-more')).toHaveText('更多（4）');
  await page.locator('#recent-more').click();
  await expect(cards).toHaveCount(4);
  await expect(cards.last().locator('.recent-title')).toHaveText('倒水排序');
  await expect(cards.last().locator('.recent-time')).toHaveText('刚开始');
  await page.locator('#recent-more').click();
  await expect(cards).toHaveCount(3);
  await cards.nth(1).click();
  await expect(page.locator('#game-title')).toHaveText('抓大鹅');
});

test('最近常玩: 换一台设备（本机没有缓存）输入同一个密码，看到服务端的记录；别人的缓存不会混进来', async ({ page }) => {
  const now = Date.now();
  const store = memoryStore();
  await store.add(PID, [{ game: 'park', last: now - 60_000, ms: 600_000 }, { game: 'quest', last: now - 120_000, ms: 90_000 }]);
  await store.add(OTHER, [{ game: 'surge', last: now, ms: 1000 }]);
  // 本机缓存是另一个身份留下的：必须丢弃，而不是合并。
  await seed(page, { owner: OTHER, games: { surge: { last: now, ms: 1000 } }, pending: { pop2: { last: now, ms: 5000 } } });
  const { calls } = await serve(page, store);
  await ready(page);
  await expect(page.locator('.recent-card .recent-title')).toHaveText(['挪车接客', '三消勇者团']);
  await expect(page.locator('.recent-card .recent-time')).toHaveText(['10 分', '1 分']);
  expect(calls.every((call) => !call.body || call.body.pid === PID)).toBe(true);
  expect(calls.some((call) => call.body?.items?.length)).toBe(false); // 别人的增量一条都不能报上去
});

test('最近常玩: 打开游戏立刻上报，玩一会儿回到首页后时长也同步到服务端', async ({ page }) => {
  await seed(page, null);
  const { store, calls } = await serve(page);
  await ready(page);
  await expect(page.locator('#recent')).toBeHidden();
  await page.locator('[data-mode="pop2"]').click();
  await expect(page.locator('.game-canvas')).toBeVisible();
  await expect.poll(() => calls.some((call) => call.body?.items?.some((item) => item.game === 'pop2'))).toBe(true);
  for (let i = 0; i < 6; i += 1) { await page.mouse.move(100 + i * 20, 200); await page.waitForTimeout(500); }
  await page.locator('#back-home').click();
  await expect(page.locator('.recent-card .recent-title')).toHaveText('泡噗 2');
  await expect(page.locator('.recent-card .recent-time')).toHaveText(/^\d+ 秒$/);
  await expect(page.locator('#recent-more')).toBeHidden();
  // 回首页时会把时长报上去：服务端的累计和卡片一致。
  await expect.poll(async () => (await store.list(PID)).pop2?.ms ?? 0).toBeGreaterThan(1000);
});

test('最近常玩: 服务端连不上时用本机缓存，增量留着等恢复后补报', async ({ page }) => {
  await seed(page, null);
  let online = false;
  const store = memoryStore();
  await page.route('**/api/recent**', async (route) => {
    if (!online) return route.abort();
    const request = route.request(), body = request.method() === 'POST' ? request.postData() : undefined;
    const response = await handleRecent(new Request(request.url(), { method: request.method(), body }), store);
    return route.fulfill({ status: response.status, contentType: 'application/json', body: await response.text() });
  });
  await ready(page);
  await page.locator('[data-mode="blast"]').click();
  await expect(page.locator('.game-canvas')).toBeVisible();
  await page.locator('#back-home').click();
  await expect(page.locator('.recent-card .recent-title')).toHaveText('方块爆破');
  // 上报失败后增量会放回 pending（请求在途时它暂时在飞行中，所以要等）。
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('pao-recent')).pending.blast?.last ?? 0)).toBeGreaterThan(0);
  expect(await store.list(PID)).toEqual({});
  // 网络恢复后，下一次回到首页就补报。
  online = true;
  await page.locator('[data-mode="pop2"]').click();
  await expect.poll(async () => Object.keys(await store.list(PID)).sort()).toEqual(['blast', 'pop2']);
});
