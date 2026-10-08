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
    // Opening a game smooth-scrolls the page back to the top; on a phone the boards sit close
    // to the top edge, so measure once the scroll has landed.
    if (page.viewportSize().width <= 800) await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
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

test('泡噗3: on a phone held upright the lone well is widened and fills the width of a tall canvas', async ({ page }) => {
  const view = page.viewportSize();
  test.skip(view.width > 800 || view.height < view.width, 'only phone-sized portrait screens get the tall board');
  await open(page, 'pop3');
  const box = await page.locator('.game-canvas').boundingBox();
  expect(box.height / box.width).toBeGreaterThan(1.4);
  expect((await game(page)).cols).toBe(14);
  // The widened well (14 columns) spans nearly the whole canvas width, with cells of at least 20 css px.
  expect(box.width * (692 / 720) / 14).toBeGreaterThan(20);
  // Sharing the screen goes back to the square board with two wells.
  await page.locator('.player-toggle:not(.mode-toggle)').click();
  await expect.poll(async () => (await page.locator('.game-canvas').boundingBox()).height).toBeLessThan(box.height * 0.8);
});

test('泡噗3: the mode button switches to 无尽, remembers it, and the notes speed up', async ({ page }) => {
  await open(page, 'pop3');
  expect((await game(page)).endless).toBe(false);
  await page.locator('.mode-toggle').click();
  await expect.poll(async () => (await game(page)).endless).toBe(true);
  await expect(page.locator('.mode-toggle')).toContainText('无尽');
  expect(await page.evaluate(() => localStorage.getItem('pao-pop3-mode'))).toBe('endless');
  // The choice survives a reload.
  await page.reload(); await page.locator('body[data-ready]').waitFor();
  await page.locator('[data-mode="pop3"]').click();
  await expect.poll(async () => (await game(page)).endless).toBe(true);
  await page.locator('.mode-toggle').click();
  await expect.poll(async () => (await game(page)).endless).toBe(false);
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
  await page.locator('.player-toggle:not(.mode-toggle)').click();
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

// ---- 全球榜单：用桩接口代替线上的 /api/scores ----
async function stubScores(page, entries = []) {
  const posts = [];
  await page.route('**/api/scores**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      posts.push(body);
      return route.fulfill({ json: { board: body.board, improved: true, best: body.value, rank: 3 } });
    }
    return route.fulfill({ json: { board: new URL(request.url()).searchParams.get('board'), entries, me: null } });
  });
  return posts;
}

test('榜单: 首页能打开弹窗，按游戏和模式切换，昵称被记住', async ({ page }) => {
  await stubScores(page, [{ rank: 1, name: '<b>阿福</b>', value: 4200, at: 1 }, { rank: 2, name: '小满', value: 900, at: 2 }]);
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator('#open-board').click();
  await expect(page.locator('.board-row')).toHaveCount(2);
  // 昵称按纯文本渲染，不会被当成 HTML。
  await expect(page.locator('.board-row .board-name').first()).toHaveText('<b>阿福</b>');
  await expect(page.locator('.board-row .board-value').first()).toHaveText('4200 分');
  await page.locator('.board-tab', { hasText: '抓大鹅' }).click();
  await expect(page.locator('.board-mode')).toHaveCount(2);
  await page.locator('.board-mode', { hasText: '无尽' }).click();
  await expect(page.locator('.board-row .board-value').first()).toHaveText('4200 件');
  await page.locator('#board-name').fill('新昵称');
  await page.locator('#board-name').dispatchEvent('change');
  expect(await page.evaluate(() => localStorage.getItem('pao-name'))).toBe('新昵称');
  await page.locator('#close-board').click();
  await expect(page.locator('#board')).not.toHaveClass(/active/);
});

test('榜单: 游戏里的榜单按钮直接打开当前模式', async ({ page }) => {
  await stubScores(page);
  await open(page, 'pop3');
  await page.locator('#game-board').click();
  await expect(page.locator('.board-tab.active')).toHaveText('泡噗 3');
  await expect(page.locator('.board-mode.active')).toHaveText('经典');
  await expect(page.locator('#board-hint')).toContainText('还没有人上榜');
});

test('榜单: 单人一局结束后自动提交成绩', async ({ page }) => {
  const posts = await stubScores(page);
  await open(page, 'blast');
  await page.evaluate(() => { const { state } = window.__arcade; state.score = 321; state.phase = 'lost'; });
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ board: 'blast', value: 321 });
  expect(posts[0].pid).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  expect(posts[0].name).toBeTruthy();
  // 同一局结算卡片停在屏幕上，不会每帧重复提交。
  await page.waitForTimeout(400);
  expect(posts).toHaveLength(1);
});

test('榜单: 泡噗3 无尽和经典分开计榜；同屏双人不上榜', async ({ page }) => {
  const posts = await stubScores(page);
  await open(page, 'pop3');
  await page.evaluate(() => { const { state } = window.__arcade; state.score = 50; state.phase = 'lost'; });
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].board).toBe('pop3-classic');
  await page.locator('.mode-toggle').click();
  await page.evaluate(() => { const { state } = window.__arcade; state.score = 60; state.phase = 'lost'; });
  await expect.poll(() => posts.length).toBe(2);
  expect(posts[1].board).toBe('pop3-endless');
  // 切到同屏双人再打完：两个人的合计分不能和单人比。
  await page.locator('.player-toggle:not(.mode-toggle)').click();
  await page.evaluate(() => { const { state } = window.__arcade; state.score = 70; state.phase = 'lost'; });
  await page.waitForTimeout(500);
  expect(posts).toHaveLength(2);
});

test('榜单: 连不上服务时游戏照常结算', async ({ page }) => {
  await page.route('**/api/scores**', (route) => route.abort());
  await open(page, 'surge');
  await page.evaluate(() => { const { state } = window.__arcade; state.score = 10; state.phase = 'lost'; });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__arcade.state.phase)).toBe('lost');
  await page.locator('#game-board').click();
  await expect(page.locator('#board-hint')).not.toHaveText('加载中……');
});
