import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); });
});

test('四款经典游戏能加载、重开、返回，并进入最近常玩', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await expect(page.locator('.arcade-card')).toHaveCount(38);
  for (const id of ['minesweeper', 'doudizhu', 'junqi', 'xiangqi']) {
    await page.locator(`.arcade-card[data-mode="${id}"]`).click();
    await expect(page.locator(`.${id}-game`)).toBeVisible();
    await expect(page.locator('#game-link')).toBeHidden();
    await expect(page.locator('#game-board')).toBeHidden();
    await expect(page.locator('#score-text')).not.toContainText('正在加载');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('#restart-game').click();
    await expect(page.locator(`.${id}-game`)).toBeVisible();
    await page.locator('#back-home').click();
    await expect(page.locator(`.recent-card[data-game="${id}"]`)).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('扫雷首点安全、手机插旗、难度切换和重开', async ({ page }) => {
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await page.locator('.arcade-card[data-mode="minesweeper"]').click();
  await page.locator('.mine-cell[data-cell="40"]').click();
  await expect(page.locator('.mine-cell.open')).not.toHaveCount(0);
  expect(await page.evaluate(() => window.__arcade.classic.state.phase)).not.toBe('lost');
  await page.locator('.mine-flag').click();
  await page.locator('.mine-cell:not(.open)').first().click();
  await expect(page.locator('.mine-cell.flagged')).toHaveCount(1);
  await page.locator('.mine-level').selectOption('hard');
  await expect(page.locator('.mine-cell')).toHaveCount(192);
  await expect(page.locator('.mine-cell.flagged')).toHaveCount(0);
  const box = await page.locator('.mine-board').boundingBox();
  expect(box.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.locator('#restart-game').click();
  await expect(page.locator('.mine-cell.open')).toHaveCount(0);
  await expect(page.locator('.mine-noguess')).toHaveText('无猜：关');
  await page.locator('.mine-noguess').click();
  await expect(page.locator('.mine-noguess')).toHaveClass(/selected/);
  await page.locator('.mine-flag').click();                                // 关掉前面打开的插旗模式
  await page.locator('.mine-cell[data-cell="100"]').click();
  expect(await page.evaluate(() => window.__arcade.classic.state.noGuess)).toBe(true);
  await expect(page.locator('.mine-cell.open')).not.toHaveCount(0);
});

test('扫雷无猜开关跟着账号走：换一台设备登录同一身份也是开着的', async ({ page }) => {
  const server = {};
  await mockPrefs(page, server);
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await page.locator('.arcade-card[data-mode="minesweeper"]').click();
  await expect(page.locator('.mine-noguess')).toHaveText('无猜：关');
  const saved = page.waitForRequest((r) => r.url().includes('/api/prefs') && r.method() === 'POST');
  await page.locator('.mine-noguess').click();
  await saved;
  await expect.poll(() => server.mineNoGuess).toBe(true);
  // 「另一台设备」：本机设置缓存清空，只剩同一个密码，打开时从服务端拉回来
  await page.evaluate(() => localStorage.removeItem('pao-prefs'));
  const pulled = page.waitForResponse((r) => r.url().includes('/api/prefs') && r.request().method() === 'GET');
  await page.reload(); await page.locator('body[data-ready]').waitFor(); await pulled;
  await page.locator('.arcade-card[data-mode="minesweeper"]').click();
  await expect(page.locator('.mine-noguess')).toHaveText('无猜：开');
  expect(await page.evaluate(() => window.__arcade.classic.state.noGuess)).toBe(true);
});

// 模拟 /api/prefs：server 就是「服务端」上这个身份的设置
async function mockPrefs(page, server) {
  await page.route('**/api/prefs**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') Object.assign(server, request.postDataJSON().prefs);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ prefs: server }) });
  });
}
// 旧版本留在本机的设置，只在第一次打开页面前写入（reload 不再写）
const legacyPrefs = (page) => page.addInitScript(() => {
  if (sessionStorage.getItem('legacy-seeded')) return;
  sessionStorage.setItem('legacy-seeded', '1');
  localStorage.setItem('pao-sudoku-level', 'hard'); localStorage.setItem('pao-goose-mode', 'endless');
});

test('数独难度和抓大鹅模式：旧版本本机设置迁到账号上，换设备也一样', async ({ page }) => {
  const server = {};
  await mockPrefs(page, server); await legacyPrefs(page);
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await expect.poll(() => [server.sudokuLevel, server.gooseMode]).toEqual(['hard', 'endless']);
  expect(await page.evaluate(() => [localStorage.getItem('pao-sudoku-level'), localStorage.getItem('pao-goose-mode')])).toEqual([null, null]);
  // 「另一台设备」：本机缓存清空，只剩同一个密码
  await page.evaluate(() => localStorage.removeItem('pao-prefs'));
  const pulled = page.waitForResponse((r) => r.url().includes('/api/prefs') && r.request().method() === 'GET');
  await page.reload(); await page.locator('body[data-ready]').waitFor(); await pulled;
  await page.locator('.arcade-card[data-mode="sudoku"]').click();
  await expect(page.locator('#sudoku-level')).toHaveText('困难 · 切换简单');
  await page.locator('#sudoku-level').click();
  await expect.poll(() => server.sudokuLevel).toBe('easy');
  await page.locator('#back-home').click();
  await page.locator('.arcade-card[data-mode="goose"]').click();
  await expect(page.locator('#goose-mode')).toHaveText('无尽模式 · 切换经典');
  await page.locator('#goose-mode').click();
  await expect.poll(() => server.gooseMode).toBe('classic');
});

test('数独难度：账号上已有设置时以账号为准，本机旧值不会覆盖', async ({ page }) => {
  const server = { sudokuLevel: 'easy' };
  await mockPrefs(page, server); await legacyPrefs(page);
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await expect.poll(() => server.gooseMode).toBe('endless');               // 账号上没有的项照常迁过去
  await page.locator('.arcade-card[data-mode="sudoku"]').click();
  await expect(page.locator('#sudoku-level')).toHaveText('简单 · 切换普通');
  expect(server.sudokuLevel).toBe('easy');
});

test('斗地主叫分、选牌提示、出牌和退出取消电脑回合', async ({ page }) => {
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await page.locator('.arcade-card[data-mode="doudizhu"]').click();
  await page.locator('[data-action="bid-3"]').click();
  await expect(page.locator('.dd-hand [data-card]')).toHaveCount(20);
  await page.locator('[data-action="hint"]').click();
  await expect(page.locator('.dd-hand .selected')).not.toHaveCount(0);
  await page.locator('[data-action="play"]').click();
  await expect.poll(() => page.evaluate(() => window.__arcade.classic.state.players[0].cards.length)).toBeLessThan(20);
  const controls = await page.locator('.dd-actions').boundingBox();
  expect(controls.y + controls.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.evaluate(() => { window.departedClassic = window.__arcade.classic; window.departedCards = window.departedClassic.state.players.map(p => p.cards.length); });
  await page.locator('#back-home').click();
  await page.waitForTimeout(750);
  expect(await page.evaluate(() => window.departedClassic.state.players.map(p => p.cards.length))).toEqual(await page.evaluate(() => window.departedCards));
});

test('军棋翻子进入电脑回合，同屏模式轮流翻棋', async ({ page }) => {
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await page.locator('.arcade-card[data-mode="junqi"]').click();
  await expect(page.locator('.junqi-cell')).toHaveCount(60);
  await page.locator('.junqi-cell.face-down').first().click();
  await expect.poll(() => page.evaluate(() => window.__arcade.classic.state.moves)).toBe(2);
  const board = await page.locator('.junqi-board').boundingBox();
  expect(board.y + board.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.getByRole('button', { name: '同屏双人', exact: true }).click();
  await page.locator('.junqi-cell.face-down').first().click();
  await page.locator('.junqi-cell.face-down').first().click();
  expect(await page.evaluate(() => window.__arcade.classic.state.moves)).toBe(2);
  expect(await page.evaluate(() => window.__arcade.classic.state.turn)).toBe(0);
});

test('象棋合法落点、人机应手、悔棋与同屏双方落子', async ({ page }) => {
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await page.locator('.arcade-card[data-mode="xiangqi"]').click();
  await expect(page.locator('.xiangqi-piece')).toHaveCount(32);
  await page.locator('[data-square="a3"]').click();
  await expect(page.locator('[data-square="a4"]')).toHaveClass(/move-target/);
  await page.locator('[data-square="a4"]').click();
  await expect.poll(() => page.evaluate(() => window.__arcade.classic.state.history.length)).toBe(2);
  await page.locator('[data-action="undo"]').click();
  expect(await page.evaluate(() => window.__arcade.classic.state.history.length)).toBe(0);
  const board = await page.locator('.xiangqi-board').boundingBox();
  expect(board.y + board.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.locator('[data-action="mode"]').selectOption('local');
  await page.locator('[data-square="a3"]').click();
  await page.locator('[data-square="a4"]').click();
  await page.locator('[data-square="a6"]').click();
  await page.locator('[data-square="a5"]').click();
  expect(await page.evaluate(() => window.__arcade.classic.state.history.length)).toBe(2);
  await page.locator('[data-action="undo"]').click();
  expect(await page.evaluate(() => window.__arcade.classic.state.history.length)).toBe(1);
  expect(await page.evaluate(() => window.__arcade.classic.state.turn)).toBe('b');
});
