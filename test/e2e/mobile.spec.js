import { test, expect } from '@playwright/test';

const game = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__arcade.state)));
// Logical canvas coordinates → page coordinates. Every canvas is 720 logical px
// wide (方块爆破's is taller), so the width alone gives the scale.
async function at(page, x, y) {
  const box = await page.locator('.game-canvas').boundingBox();
  const k = box.width / 720;
  return [box.x + x * k, box.y + y * k];
}
async function open(page, mode) {
  await page.goto('/');
  // The arcade cards only respond once app.js has run.
  await page.locator('body[data-ready]').waitFor();
  await page.locator(`[data-mode="${mode}"]`).click();
  await expect(page.locator('.game-canvas')).toBeVisible();
}

test('home page fits narrow screens and exposes five arcade cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.arcade-card')).toHaveCount(5);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test('each game shows its whole board and controls without scrolling', async ({ page }) => {
  for (const mode of ['pop2', 'pop3', 'surge', 'blast']) {
    await open(page, mode);
    // The last on-screen control: a board without extra controls (方块爆破) ends at the header's restart.
    const button = page.locator('#restart-game, #mobile-controls button').last();
    await expect(button).toBeVisible();
    const fit = await page.evaluate(() => {
      const canvas = document.querySelector('.game-canvas').getBoundingClientRect(), last = [...document.querySelectorAll('#restart-game, #mobile-controls button')].at(-1).getBoundingClientRect();
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

test('方块爆破: dragging a tray piece onto the board fills cells and empties its slot', async ({ page }) => {
  await open(page, 'blast');
  const slot = (await game(page)).tray.findIndex(Boolean);
  // Tray slot centres sit at 124 + slot*236, y 847; (360, 420) is the middle of the board.
  await page.mouse.move(...await at(page, 124 + slot * 236, 847));
  await page.mouse.down();
  await page.mouse.move(...await at(page, 360, 420), { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await game(page)).tray[slot]).toBe(null);
  expect((await game(page)).board.flat().filter(Boolean).length).toBeGreaterThan(0);
});

test('方块爆破: the best score is restored from localStorage', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pao-blast-best', '1234'));
  await open(page, 'blast');
  expect(await page.evaluate(() => window.__arcade.best)).toBe(1234);
  await expect(page.locator('#score-text')).toContainText('1234');
});

test('泡噗2: every theme reskins the board and the choice sticks', async ({ page }) => {
  await open(page, 'pop2');
  await expect(page.locator('.theme-chip')).toHaveCount(3);
  // Read a couple of pixels off the board: the base sits at the centre of the
  // arena, so its colour is a direct fingerprint of the skin in use.
  const centre = () => page.evaluate(() => {
    const canvas = document.querySelector('.game-canvas');
    const ctx = canvas.getContext('2d');
    const scale = canvas.width / 720;
    const d = ctx.getImageData(Math.round(360 * scale), Math.round(360 * scale), 1, 1).data;
    return [d[0], d[1], d[2]].join(',');
  });
  const seen = new Map();
  for (const id of ['space', 'reef', 'tribe']) {
    await page.locator(`.theme-chip[data-theme="${id}"]`).click();
    await expect(page.locator(`.theme-chip[data-theme="${id}"]`)).toHaveClass(/selected/);
    await expect.poll(centre).not.toBe('0,0,0');
    seen.set(id, await centre());
    expect(await page.evaluate(() => window.__arcade.theme)).toBe(id);
  }
  // Three skins, three different bases.
  expect(new Set(seen.values()).size).toBe(3);

  await page.reload();
  await page.locator('body[data-ready]').waitFor();
  await page.locator('[data-mode="pop2"]').click();
  await expect(page.locator('.theme-chip[data-theme="tribe"]')).toHaveClass(/selected/);
});

// 抓大鹅 draws with WebGL into its own canvas; its state lives on window.__arcade.goose.
const goose = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__arcade.goose?.state ?? null)));
async function openGoose(page) {
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator('[data-mode="goose"]').click();
  await expect(page.locator('.goose-canvas')).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => (await goose(page))?.pile.length).toBe(99);
}

test('抓大鹅: the bowl, tray and controls fit on one screen', async ({ page }) => {
  await openGoose(page);
  const fit = await page.evaluate(() => {
    const canvas = document.querySelector('.goose-canvas').getBoundingClientRect(), last = [...document.querySelectorAll('#mobile-controls button')].at(-1).getBoundingClientRect();
    return { wide: document.documentElement.scrollWidth <= window.innerWidth + 1, canvas: canvas.top >= 0 && canvas.bottom <= window.innerHeight, controls: last.bottom <= window.innerHeight, size: canvas.width };
  });
  expect(fit).toMatchObject({ wide: true, canvas: true, controls: true });
  expect(fit.size).toBeGreaterThan(250);
});

test('抓大鹅: tapping a reachable item sends it to the tray', async ({ page }) => {
  await openGoose(page);
  // Wait for the pile to settle, then tap an item that is not buried under another.
  // Finding and locating it happen in one call, since the pile can still shift between calls.
  const reachable = () => page.evaluate(() => { const g = window.__arcade.goose, [item] = g.debug.tappable(); return item ? g.debug.screenOf(item.id) : null; });
  let at = null;
  for (const until = Date.now() + 10_000; !at && Date.now() < until;) at = await reachable() ?? (await page.waitForTimeout(200), null);
  expect(at).not.toBe(null);
  await page.mouse.click(at.x, at.y);
  await expect.poll(async () => (await goose(page)).tray.map(entry => entry.status).join()).toBe('resting');
  expect((await goose(page)).pile).toHaveLength(98);
  await expect(page.locator('.goose-hud')).toContainText('98');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('抓大鹅: switching to endless mode restarts against the clock, and leaving frees the view', async ({ page }) => {
  await openGoose(page);
  await page.locator('#goose-mode').click();
  await expect.poll(async () => (await goose(page)).mode).toBe('endless');
  await expect(page.locator('.goose-hud')).toContainText('消除');
  await page.locator('#goose-shake').click();
  await page.locator('#back-home').click();
  expect(await page.evaluate(() => window.__arcade.goose)).toBe(null);
  // The choice of mode is remembered for the next visit.
  await page.locator('.arcade-card[data-mode="goose"]').click();
  await expect.poll(async () => (await goose(page))?.mode).toBe('endless');
});
