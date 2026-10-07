import { test, expect } from '@playwright/test';

const game = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__arcade.state)));
// Logical 720×720 board coordinates → page coordinates.
async function at(page, x, y) {
  const box = await page.locator('.game-canvas').boundingBox();
  return [box.x + x * box.width / 720, box.y + y * box.height / 720];
}
async function open(page, mode) {
  await page.goto('/');
  await page.locator(`[data-mode="${mode}"]`).click();
  await expect(page.locator('.game-canvas')).toBeVisible();
}

test('home page fits narrow screens and exposes three arcade cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.arcade-card')).toHaveCount(3);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test('each game shows its whole board and controls without scrolling', async ({ page }) => {
  for (const mode of ['pop2', 'pop3', 'surge']) {
    await open(page, mode);
    const button = page.locator('#mobile-controls button').last();
    await expect(button).toBeVisible();
    const fit = await page.evaluate(() => {
      const canvas = document.querySelector('.game-canvas').getBoundingClientRect(), last = [...document.querySelectorAll('#mobile-controls button')].at(-1).getBoundingClientRect();
      return { wide: document.documentElement.scrollWidth <= window.innerWidth + 1, canvas: canvas.top >= 0 && canvas.bottom <= window.innerHeight, controls: last.bottom <= window.innerHeight, size: canvas.width };
    });
    expect(fit).toMatchObject({ wide: true, canvas: true, controls: true });
    expect(fit.size).toBeGreaterThan(250);
    await page.locator('#back-home').click();
  }
});

test('泡噗2: dragging anywhere steers the ship without scrolling the page', async ({ page }) => {
  await open(page, 'pop2');
  const before = (await game(page)).players[0];
  const [x, y] = await at(page, 200, 600);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y - 40, { steps: 4 });
  await expect.poll(async () => (await game(page)).players[0].x).toBeGreaterThan(before.x + 30);
  await page.mouse.up();
  expect((await game(page)).players[0].y).toBeLessThan(before.y - 15);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('泡噗3: the beat button is judged and dragging moves the ship inside its well', async ({ page }) => {
  await open(page, 'pop3');
  await page.locator('#mobile-controls .beat').click();
  await expect.poll(async () => (await game(page)).players[0].judge).not.toBe('');
  const before = (await game(page)).players[0];
  const [x, y] = await at(page, 200, 400);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 50, y, { steps: 4 });
  await expect.poll(async () => (await game(page)).players[0].x).toBeLessThan(before.x - 20);
  await page.mouse.up();
});

test('山山兔: tapping a belt piece and then a cell carries the piece onto the field', async ({ page }) => {
  await open(page, 'surge');
  const state = await game(page), piece = state.belt.find(item => item.x > 150 && item.x < 560);
  await page.mouse.click(...await at(page, piece.x, 140));
  await expect.poll(async () => Boolean((await game(page)).players[0].held)).toBe(true);
  await page.locator('#mobile-controls button', { hasText: '旋转' }).click();
  // Column 5, row 2 of the 12×6 field; every piece fits around it whichever way it is turned.
  await page.mouse.click(...await at(page, 36 + 5.5 * 54, 252 + 2.5 * 54));
  await expect.poll(async () => (await game(page)).players[0].held).toBe(null);
  // A piece of a single colour fires the moment it lands, leaving energy instead of blocks.
  const after = await game(page);
  expect(after.board.flat().filter(Boolean).length + after.energy).toBeGreaterThan(0);
});

test('one device can switch between solo and shared-screen play', async ({ page }) => {
  await open(page, 'pop3');
  expect((await game(page)).players).toHaveLength(1);
  await page.locator('.player-toggle').click();
  await expect.poll(async () => (await game(page)).players.length).toBe(2);
  await expect(page.locator('#mobile-controls .beat')).toHaveCount(2);
});
