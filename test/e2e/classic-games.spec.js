import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); });
});

test('四款经典游戏能加载、重开、返回，并进入最近常玩', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await expect(page.locator('.arcade-card')).toHaveCount(20);
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
