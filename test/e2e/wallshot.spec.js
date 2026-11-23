import { test, expect } from '@playwright/test';

// 隔墙狙击（ARCADE 41）：单机对电脑 + 联机（连 playwright.config.js 里起的本机房间服务）。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); });
});

const kit = (page, fn, arg) => page.evaluate(([source, value]) => new Function('kit', 'arg', `return (${source})(kit, arg)`)(window.__arcade.kit, value), [fn.toString(), arg]);
async function open(page) {
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator('.arcade-card[data-mode="wallshot"]').click();
  await expect(page.locator('#score-text')).toContainText('回合');
}

test('隔墙狙击 单机：躲的时候按钮能走、能换姿势；狙的时候照着头打一枪就赢；换难度会重开', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await expect(page.locator('.mode-tab[data-tab="online"]')).toBeVisible();
  // 先轮到谁是随机的：轮到电脑狙就先当一回躲的人
  if (await kit(page, (k) => k.view.sniper !== k.view.seat)) {
    const x0 = await kit(page, (k) => k.view.body.x);
    const box = await page.locator('.kit-wrap canvas').boundingBox();
    const at = (x, y) => ({ x: box.x + x * box.width / 360, y: box.y + y * box.height / 640 });
    const right = at(265, 510);
    await page.mouse.move(right.x, right.y);
    await page.mouse.down();
    await expect.poll(() => kit(page, (k) => k.view.body.x)).toBeGreaterThan(x0 + 10);
    await page.mouse.up();
    const crouch = at(66, 405);
    await page.mouse.click(crouch.x, crouch.y);
    await expect.poll(() => kit(page, (k) => k.view.body.pose)).toBe('crouch');
    // 快进到电脑开枪那几秒，然后到换边
    await kit(page, (k) => k.skip());
    await expect.poll(() => kit(page, (k) => k.view.phase), { timeout: 16_000 }).not.toBe('aim');
    if (await kit(page, (k) => k.view.status === 'playing')) {
      await kit(page, (k) => k.skip());
      await expect.poll(() => kit(page, (k) => k.view.sniper === k.view.seat)).toBe(true);
    }
  }
  if (await kit(page, (k) => k.view.status === 'playing')) {
    await kit(page, (k) => k.skip());
    await expect.poll(() => kit(page, (k) => k.view.phase)).toBe('aim');
    const head = await kit(page, (k) => ({ x: k.state.hider.x, pose: k.state.hider.pose, face: k.state.hider.face }));
    const y = { stand: 106, crouch: 72, prone: 13 }[head.pose];
    const x = head.pose === 'prone' ? head.x + 36 * head.face : head.x;
    expect(await kit(page, (k, p) => k.fireAt(p.x, p.y), { x, y })).toBe(true);
  }
  await expect(page.locator('.kit-card')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('.kit-card')).toContainText(/你赢了|电脑赢了|平局/);
  await page.locator('.kit-again').first().click();
  await expect(page.locator('.kit-card')).toBeHidden();
  expect(await kit(page, (k) => k.view.turn)).toBe(1);
  await page.locator('[data-kit-action="level"]').click();
  await expect(page.locator('[data-kit-action="level"]')).toHaveText('电脑：困难');
  expect(errors).toEqual([]);
});

async function player(browser, name) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 900, height: 1200 } });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(`${name}: ${error.message}`));
  page.on('dialog', (dialog) => dialog.accept());
  await page.addInitScript(() => { localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); });
  return page;
}
const game = (page, fn, arg) => page.evaluate(([source, value]) => new Function('g', 'arg', `return (${source})(g, arg)`)(window.__arcade.kit.game, value), [fn.toString(), arg]);

test('隔墙狙击 联机：两人进房后自动开局，一人狙一人躲，狙击的人看不到藏好的人，爆头分出胜负', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', '联机流程只在桌面跑一遍');
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  for (const p of [a, b]) { await p.goto('/'); await p.locator('body[data-ready]').waitFor(); await p.locator('.arcade-card[data-mode="wallshot"]').click(); await p.locator('.mode-tab[data-tab="online"]').click(); }
  await a.locator('.online-primary').click();
  const code = (await a.locator('.online-code').innerText()).trim();
  await b.locator('.online-join input').fill(code);
  await b.locator('.online-join .online-secondary').click();
  for (const p of [a, b]) await expect.poll(() => p.evaluate(() => window.__arcade.kit?.game?.view?.phase ?? null), { timeout: 8000 }).toBe('hide');
  const sniperSeat = await game(a, (g) => g.view.sniper);
  const [shooter, hider] = (await game(a, (g) => g.view.seat)) === sniperSeat ? [a, b] : [b, a];
  expect(await game(shooter, (g) => g.view.body)).toBeNull();
  const body = await game(hider, (g) => g.view.body);
  expect(body).not.toBeNull();
  await expect.poll(() => game(shooter, (g) => g.view.phase), { timeout: 9000 }).toBe('aim');
  const now = await game(hider, (g) => g.view.body);
  const y = { stand: 106, crouch: 72, prone: 13 }[now.pose];
  await game(shooter, (g, p) => g.fireAt(p.x, p.y), { x: now.pose === 'prone' ? now.x + 36 * now.face : now.x, y });
  await expect(shooter.locator('.kit-card')).toContainText('你赢了', { timeout: 8000 });
  await expect(hider.locator('.kit-card')).toContainText('对手获胜');
  await expect(shooter.locator('.online-after')).toContainText('再来一局');
  expect([...a.errors, ...b.errors]).toEqual([]);
});
