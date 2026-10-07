import { test, expect } from '@playwright/test';

test('home page fits narrow screens and exposes three arcade cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.arcade-card')).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test('each game opens a canvas and mobile controls', async ({ page }) => {
  await page.goto('/');
  for (const mode of ['pop2', 'pop3', 'surge']) {
    await page.locator(`[data-mode="${mode}"]`).click();
    await expect(page.locator('.game-canvas')).toBeVisible();
    await expect(page.locator('#mobile-controls button').first()).toBeVisible();
    await page.locator('#back-home').click();
  }
});

test('touch drag aims and release fires without page scrolling', async ({ page }) => {
  await page.goto('/');
  await page.locator('[data-mode="pop2"]').click();
  const canvas = page.locator('.game-canvas');
  const before = await page.locator('#score-text').textContent();
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .7);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .65, box.y + box.height * .45);
  await page.mouse.up();
  await expect.poll(() => page.locator('#score-text').textContent()).not.toBe(before);
});
