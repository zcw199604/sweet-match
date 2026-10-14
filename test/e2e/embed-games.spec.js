import { test, expect } from '@playwright/test';

// 外站用桩页面代替：测试不依赖对方站点在线，只验证本站怎么嵌、怎么卸。
const GAMES = { soulforge: 'https://soulforge.glasden.top/', achroma: 'https://game.unsnow.online/ach/' };

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); });
  for (const [id, url] of Object.entries(GAMES)) {
    await page.route(`${url}**`, (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><title>${id}</title><canvas id="c"></canvas><p id="stub">${id}</p>` }));
  }
});

test('第三方游戏：iframe 嵌入原站（沙箱不允许跳走本页），能重新载入，返回后卸载并进入最近常玩', async ({ page }) => {
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  for (const [id, url] of Object.entries(GAMES)) {
    await page.locator(`.arcade-card[data-mode="${id}"]`).click();
    const frame = page.locator('.embed-frame');
    await expect(frame).toHaveAttribute('src', url);
    const sandbox = await frame.getAttribute('sandbox');
    expect(sandbox).toContain('allow-scripts');
    expect(sandbox).not.toContain('allow-top-navigation');
    expect(sandbox).toContain('allow-orientation-lock');
    await expect(page.frameLocator('.embed-frame').locator('#stub')).toHaveText(id);
    await expect(page.locator('.embed-cover')).toBeHidden();
    await expect(page.locator('#score-text')).toContainText(new URL(url).host);
    await expect(page.locator('#game-link')).toBeHidden();
    await expect(page.locator('#game-board')).toBeHidden();
    const box = await frame.boundingBox();
    expect(box.width).toBeLessThanOrEqual(page.viewportSize().width);
    expect(box.height).toBeGreaterThan(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    for (const id of ['#embed-open', '#restart-game']) {                       // 手机上按钮不能被挤出舞台
      const button = await page.locator(id).boundingBox();
      expect(button.x + button.width).toBeLessThanOrEqual(page.viewportSize().width);
    }

    const popup = page.waitForEvent('popup');
    await page.locator('#embed-open').click();
    expect((await popup).url()).toBe(url);
    await (await popup).close();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#restart-game').click();
    await expect(page.frameLocator('.embed-frame').locator('#stub')).toHaveText(id);

    await page.locator('#back-home').click();
    await expect(page.locator('.embed-frame')).toHaveCount(0);
    await expect(page.locator(`.recent-card[data-game="${id}"]`)).toBeVisible();
  }
  expect(errors).toEqual([]);
});
