import { test, expect } from '@playwright/test';

// 全屏（app.js 的 setGameFull）：每个游戏的按钮栏都有一个全屏按钮。全屏后舞台铺满屏幕，游戏区放大，
// 按钮栏在最底下、「退出全屏」在最左边；返回手势 / 返回键先退出全屏，而不是离开页面。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); });
});
const GAMES = ['gomoku', 'aeroplane', 'reversi', 'draughts', 'jungle', 'minesweeper', 'doudizhu', 'junqi', 'xiangqi', 'pop2', 'pop3', 'surge', 'blast', 'quest', 'park', 'pour', 'g2048', 'suika', 'skychef', 'tetris', 'sudoku', 'soulforge', 'achroma', 'arrows', 'sheep', 'nonogram', 'mahjong', 'solitaire', 'hexsort', 'sokoban', 'screw', 'yarn', 'sand', 'runfast', 'tiaoqi', 'weiqi', 'goose'];
const EMBEDDED = ['soulforge', 'achroma'];
const AREA = '#game-stage > :is(.canvas-wrap, .classic-wrap, .embed-wrap)';
async function open(page, id) {
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator(`.arcade-card[data-mode="${id}"]`).click();
  // 内嵌的外站游戏要等网络，载完没载完都不影响铺满的布局
  if (EMBEDDED.includes(id)) await expect(page.locator('[data-game-full]')).toBeVisible();
  else await expect(page.locator('#score-text')).not.toContainText(/正在(加载|载入)/);
}
const inside = (box, view) => box.x >= -1 && box.y >= -1 && box.x + box.width <= view.width + 1 && box.y + box.height <= view.height + 1;

test('every game: the full-screen button fits, full screen fills the screen with a game area at least as big, and the exit is bottom-left', async ({ page }) => {
  test.setTimeout(GAMES.length * 6000);
  const view = page.viewportSize();
  for (const id of GAMES) {
    await open(page, id);
    const full = page.locator('[data-game-full]');
    await expect.poll(async () => inside(await full.boundingBox(), view), { message: `${id}: 按钮在屏幕内` }).toBe(true);   // 刚进来页面还在归位
    const before = await page.locator(AREA).boundingBox();
    await full.click();
    await expect(page.locator('body'), id).toHaveClass(/game-full/);
    await expect(full).toHaveText('退出全屏');
    const stage = await page.locator('#game-stage').boundingBox();
    expect([Math.round(stage.x), Math.round(stage.y), Math.round(stage.width), Math.round(stage.height)], `${id}: 铺满屏幕`).toEqual([0, 0, view.width, view.height]);
    await expect.poll(async () => { const box = await page.locator(AREA).boundingBox(); return inside(box, view) && box.width >= before.width * 0.98; }, { message: `${id}: 游戏区在屏幕内且不比平时小` }).toBe(true);
    const exit = await full.boundingBox(), bar = await page.locator('#game-stage > .stage-top').boundingBox();
    expect(exit.x, `${id}: 退出全屏在最左边`).toBeLessThan(20);
    expect(bar.y + bar.height, `${id}: 按钮栏在最底下`).toBeGreaterThan(view.height - 30);
    await full.click();
    await expect(page.locator('body'), id).not.toHaveClass(/game-full/);
    await expect(full).toHaveAttribute('aria-label', '全屏');
  }
});

test('the back gesture leaves full screen but not the game, the exit button leaves no extra history, and leaving the game ends full screen', async ({ page }) => {
  await open(page, 'mahjong');
  await page.waitForFunction(() => window.__arcade.kit?.state);
  const tiles = () => page.evaluate(() => window.__arcade.kit.state.grid.flat().filter((v) => v >= 0).length);
  // 全屏里照样点得中
  await page.locator('[data-game-full]').click();
  const left = await tiles();
  await page.evaluate(() => { const [a, b] = window.__arcade.kit.pair(); window.__arcade.kit.choose(a.r, a.c); window.__arcade.kit.choose(b.r, b.c); });
  await expect.poll(tiles).toBe(left - 2);
  // 返回手势：只退出全屏，还在这一局里
  await page.goBack();
  await expect(page.locator('body')).not.toHaveClass(/game-full/);
  await expect(page.locator('#game')).toHaveClass(/active/);
  expect(page.url()).toContain('#game/mahjong');
  expect(await tiles()).toBe(left - 2);
  // 按钮退出：进入时记的那一步也撤掉，不留一个「按了没反应」的返回
  const depth = await page.evaluate(() => history.length);
  await page.locator('[data-game-full]').click();
  await page.locator('[data-game-full]').click();
  await expect(page.locator('body')).not.toHaveClass(/game-full/);
  await expect.poll(() => page.evaluate(() => history.state?.gameFull ?? false)).toBe(false);
  expect(page.url()).toContain('#game/mahjong');
  expect(await page.evaluate(() => history.length)).toBeLessThanOrEqual(depth + 1);
  // 全屏中离开游戏：铺满撤掉，地址回到首页
  await page.locator('[data-game-full]').click();
  await page.evaluate(() => document.querySelector('#back-home').click());
  await expect(page.locator('body')).not.toHaveClass(/game-full/);
  await expect(page.locator('#home')).toHaveClass(/active/);
  await expect.poll(() => page.url()).toContain('#home');
});
