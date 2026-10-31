import { test, expect } from '@playwright/test';

// 全屏（app.js 的 setGameFull）：每个游戏的按钮栏都有一个全屏按钮。全屏后舞台铺满屏幕，游戏区放大，
// 按钮栏在最底下、「退出全屏」在最左边；返回手势 / 返回键先退出全屏，而不是离开页面。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); });
});
const GAMES = ['gomoku', 'aeroplane', 'reversi', 'draughts', 'jungle', 'minesweeper', 'doudizhu', 'junqi', 'xiangqi', 'pop2', 'pop3', 'surge', 'blast', 'quest', 'park', 'pour', 'g2048', 'suika', 'skychef', 'tetris', 'sudoku', 'soulforge', 'achroma', 'arrows', 'sheep', 'nonogram', 'mahjong', 'solitaire', 'hexsort', 'sokoban', 'screw', 'yarn', 'sand', 'runfast', 'tiaoqi', 'weiqi', 'goose', 'klotski', 'snake', 'breakout', 'bubble'];
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
    // 画布缓冲区的宽高比要和它在屏幕上的宽高比一致：不一致就是被拉变形了
    // （以前全屏派发的 resize 让泡噗的 resizeCanvas 把别的游戏的画布改成 1440×1440，画面清空、拉歪）
    const stretched = () => page.evaluate(() => { const c = document.querySelector('#game-stage canvas.game-canvas'); if (!c) return false; const r = c.getBoundingClientRect(); return Math.abs(c.width / c.height - r.width / r.height) > 0.02 * (r.width / r.height); });
    await full.click();
    await expect(page.locator('body'), id).toHaveClass(/game-full/);
    await expect(full).toHaveText('退出全屏');
    await expect.poll(stretched, { message: `${id}: 画布没被拉变形` }).toBe(false);
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

// 全屏时游戏区单独放大：画布游戏把信息栏和游戏区拆开重排（fit-view.js），棋牌类把棋盘 zoom 到最大。
// 竖屏和横屏各看一遍：游戏区比平时大、横屏时占满高度，点在放大后的位置上也照样落子。
const PHONE = { portrait: { width: 390, height: 664 }, landscape: { width: 844, height: 390 } };
for (const [shape, size] of Object.entries(PHONE)) {
  test(`${shape}: canvas games blow up the play area, keep the bars small, and taps still land`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page, 'mahjong');
    await page.waitForFunction(() => window.__arcade.kit?.state);
    // 相邻两张牌中心的距离 = 牌在屏幕上的宽度
    const tile = () => page.evaluate(() => { const { locate } = window.__arcade.kit; return locate(0, 1).x - locate(0, 0).x; });
    const before = await tile();
    await page.locator('[data-game-full]').click();
    await expect.poll(tile, { message: '牌变大了' }).toBeGreaterThan(before * 1.3);
    const corners = () => page.evaluate(() => { const { locate, state } = window.__arcade.kit; const a = locate(0, 0), b = locate(state.rows - 1, state.cols - 1); return { top: a.y, bottom: b.y, left: a.x, right: b.x }; });
    // 进全屏后尺寸要等一两帧才定下来
    if (shape === 'landscape') await expect.poll(async () => { const c = await corners(); return c.bottom - c.top; }, { message: '横屏时牌桌几乎占满高度' }).toBeGreaterThan(size.height * 0.6);
    const board = await corners();
    expect(board.top).toBeGreaterThan(0);
    expect(board.bottom).toBeLessThan(size.height);
    expect(board.right).toBeLessThan(size.width);
    // 真点两下：先点一对能连上的牌
    const left = () => page.evaluate(() => window.__arcade.kit.state.grid.flat().filter((v) => v >= 0).length);
    const count = await left();
    const [a, b] = await page.evaluate(() => { const { pair, locate } = window.__arcade.kit; const [p, q] = pair(); return [locate(p.r, p.c), locate(q.r, q.c)]; });
    await page.mouse.click(a.x, a.y);
    await page.mouse.click(b.x, b.y);
    await expect.poll(left).toBe(count - 2);

    // 自己画画布的游戏（数独）：格子变大，点格子能选中
    await page.locator('[data-game-full]').click();
    await open(page, 'sudoku');
    await page.waitForFunction(() => window.__arcade.sudoku);
    const cell = () => page.evaluate(() => { const { locate } = window.__arcade.sudoku; return locate('cell', 1).x - locate('cell', 0).x; });
    const small = await cell();
    await page.locator('[data-game-full]').click();
    await expect.poll(cell).toBeGreaterThan(small * 1.15);
    const spot = await page.evaluate(() => window.__arcade.sudoku.locate('cell', 40));
    await page.mouse.click(spot.x, spot.y);
    await expect.poll(() => page.evaluate(() => window.__arcade.sudoku.selected)).toBe(40);
  });

  test(`${shape}: board games zoom the board to the most room there is and clicks still land`, async ({ page }) => {
    await page.setViewportSize(size);
    await open(page, 'gomoku');
    const boardBox = () => page.locator('.strategy-board').boundingBox();
    const before = await boardBox();
    await page.locator('[data-game-full]').click();
    await expect.poll(async () => (await boardBox()).height).toBeGreaterThan(before.height * (shape === 'landscape' ? 1.3 : 0.99));
    const board = await boardBox();
    expect(inside(board, size), '棋盘在屏幕内').toBe(true);
    if (shape === 'landscape') expect(board.height, '横屏时棋盘占满高度').toBeGreaterThan(size.height * 0.85);
    await page.locator('[data-cell="112"]').click();
    await expect(page.locator('[data-cell="112"] .board-piece')).toBeVisible();
  });
}

// 全屏里的横竖屏：默认跟着手机方向；「转横屏 / 转竖屏」换成另一种。测试用的浏览器锁不了屏幕方向，
// 走的是 CSS 把舞台转 90° 的模拟（body.full-rot），所以点击要按转过的坐标落下去（各游戏的 locate 已经换算好）。
test.describe('turning in full screen', () => {
  test.skip(({ isMobile }) => !isMobile, '只在触屏设备上给切换按钮');
  const classes = (page) => page.evaluate(() => ['full-land', 'full-rot'].filter((c) => document.body.classList.contains(c)).join(' '));
  for (const [shape, size] of Object.entries(PHONE)) {
    test(`${shape} phone: full screen follows the phone, then turns the other way and still plays`, async ({ page }) => {
      await page.setViewportSize(size);
      const land = shape === 'landscape';
      await open(page, 'mahjong');
      await page.waitForFunction(() => window.__arcade.kit?.state);
      await page.locator('[data-game-full]').click();
      const turn = page.locator('[data-game-turn]');
      // 默认：跟着手机
      await expect(turn).toHaveText(land ? '转竖屏' : '转横屏');
      expect(await classes(page)).toBe(land ? 'full-land' : '');
      // 换成另一种：舞台转 90°，按另一种方向排
      await turn.click();
      await expect(turn).toHaveText(land ? '转横屏' : '转竖屏');
      expect(await classes(page)).toBe(land ? 'full-rot' : 'full-land full-rot');
      const stage = await page.locator('#game-stage').boundingBox();
      expect([Math.round(stage.width), Math.round(stage.height)], '转过之后仍然铺满屏幕').toEqual([size.width, size.height]);
      // 转过的牌桌照样点得中
      const left = () => page.evaluate(() => window.__arcade.kit.state.grid.flat().filter((v) => v >= 0).length);
      const count = await left();
      const spots = await page.evaluate(() => { const { pair, locate } = window.__arcade.kit; const [p, q] = pair(); return [locate(p.r, p.c), locate(q.r, q.c)]; });
      for (const spot of spots) {
        expect(spot.x > 0 && spot.x < size.width && spot.y > 0 && spot.y < size.height, '牌在屏幕内').toBe(true);
        await page.mouse.click(spot.x, spot.y);
      }
      await expect.poll(left).toBe(count - 2);
      // 换个游戏：自己画画布的数独、网页棋盘的五子棋、3D 的抓大鹅，全屏和方向都还在
      await page.locator('[data-game-full]').click();
      await expect(page.locator('body')).not.toHaveClass(/full-rot|full-land/);
      await open(page, 'sudoku');
      await page.waitForFunction(() => window.__arcade.sudoku);
      await page.locator('[data-game-full]').click();
      await turn.click();
      expect(await classes(page)).toContain('full-rot');
      const cell = await page.evaluate(() => window.__arcade.sudoku.locate('cell', 40));
      await page.mouse.click(cell.x, cell.y);
      await expect.poll(() => page.evaluate(() => window.__arcade.sudoku.selected)).toBe(40);
      await page.locator('[data-game-full]').click();
      await open(page, 'gomoku');
      await page.locator('[data-game-full]').click();
      await turn.click();
      await page.locator('[data-cell="112"]').click();
      await expect(page.locator('[data-cell="112"] .board-piece')).toBeVisible();
      // 再按一次就转回跟手机一致的方向，不再旋转
      await turn.click();
      expect(await classes(page)).toBe(land ? 'full-land' : '');
    });
  }

  test('the goose pile is still picked where it is drawn when turned', async ({ page }) => {
    await page.setViewportSize(PHONE.portrait);
    await open(page, 'goose');
    await page.waitForFunction(() => window.__arcade.goose?.debug);
    await page.locator('[data-game-full]').click();
    await page.locator('[data-game-turn]').click();
    expect(await classes(page)).toBe('full-land full-rot');
    // 物品落稳后，在它画出来的位置一点就能点中（屏幕坐标 → 射线检测走的是同一套换算）
    await expect.poll(() => page.evaluate(() => window.__arcade.goose.debug.tappable().length), { timeout: 8000 }).toBeGreaterThan(0);
    const [first] = await page.evaluate(() => window.__arcade.goose.debug.tappable());
    const at = await page.evaluate((id) => window.__arcade.goose.debug.screenOf(id), first.id);
    expect(at.x > 0 && at.x < PHONE.portrait.width && at.y > 0 && at.y < PHONE.portrait.height).toBe(true);
  });
});
