import { test, expect } from '@playwright/test';

// 摸猫模拟器（ARCADE 42）：整站是原作者的成品，这里用 Shadow DOM 装进舞台。
// 重点验证三件事：能挂载出画面、毛色和顶栏文案会跟着换、离开后影子树和页面滚动锁都收干净。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pao-pw', 'e2eTestPass1');
    localStorage.setItem('pao-name', '测试员');
    localStorage.setItem('pet-the-cat-theme', 'light');
  });
});

async function open(page) {
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator('.arcade-card[data-mode="petcat"]').click();
  await expect(page.locator('#score-text')).toContainText('13 种毛色');
}

const shadowState = (page) => page.evaluate(() => {
  const host = document.querySelector('.petcat-room');
  const stage = host?.shadowRoot?.getElementById('stage');
  return {
    hosts: document.querySelectorAll('.petcat-room').length,
    ready: stage?.dataset.ready ?? null,
    selected: stage?.dataset.selected ?? null,
    theme: host?.dataset.theme ?? null,
    coats: host?.shadowRoot?.querySelectorAll('[data-cat]').length ?? 0,
    scene: stage?.querySelector('#scene')?.width ?? 0
  };
});

test('摸猫模拟器：画面挂起来，13 个毛色都在，换毛色顶栏跟着变', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);

  await expect.poll(() => shadowState(page).then((s) => s.ready)).toBe('true');
  const mounted = await shadowState(page);
  expect(mounted.hosts).toBe(1);
  expect(mounted.coats).toBe(13);
  expect(mounted.scene).toBeGreaterThan(0);
  await expect(page.locator('#score-text')).toContainText('黑猫');

  // 影子树里的毛色按钮：Playwright 的定位器会穿过 open shadow root
  await page.locator('.petcat-room [data-cat="siam"]').click();
  await expect.poll(() => shadowState(page).then((s) => s.selected)).toBe('siam');
  await expect(page.locator('#score-text')).toContainText('暹罗');

  await page.locator('.petcat-room [data-cat="norwegian"]').click();
  await expect(page.locator('#score-text')).toContainText('挪威森林猫');

  // 深色主题只切影子树里的 host，不碰街机厅自己的 :root
  await page.locator('.petcat-room #theme').click();
  await expect.poll(() => shadowState(page).then((s) => s.theme)).toBe('dark');
  expect(await page.evaluate(() => document.documentElement.dataset.theme ?? '')).toBe('');

  // 在猫背上划一道不会报错（抚摸走的是 canvas 里的形变，只验证不炸）
  const box = await page.locator('.petcat-room #stage').boundingBox();
  await page.mouse.move(box.x + box.width * 0.34, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 0; i < 12; i++) {
    await page.mouse.move(box.x + box.width * (0.34 + 0.4 * i / 12), box.y + box.height * 0.52);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  await expect(page.locator('.petcat-room #stage')).toHaveAttribute('data-over', 'true');

  expect(errors).toEqual([]);
});

test('摸猫模拟器：重新开始会重画同一只猫，回到街机厅后影子树和滚动锁都清掉，再进也只有一个实例', async ({ page }) => {
  await open(page);
  await expect.poll(() => shadowState(page).then((s) => s.ready)).toBe('true');

  await page.locator('#restart-game').click();
  await expect.poll(() => shadowState(page).then((s) => s.ready)).toBe('true');
  expect((await shadowState(page)).selected).toBe('kuro');

  await page.locator('#back-home').click();
  await expect.poll(() => shadowState(page).then((s) => s.hosts)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.classList.contains('is-full-page'))).toBe(false);
  // 卸掉之后宿主容器上的记号也一起去掉
  expect(await page.evaluate(() => document.querySelectorAll('.petcat-wrap').length)).toBe(0);

  await page.locator('.arcade-card[data-mode="petcat"]').click();
  await expect.poll(() => shadowState(page).then((s) => s.ready)).toBe('true');
  expect((await shadowState(page)).hosts).toBe(1);
});
