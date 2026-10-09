import { test, expect } from '@playwright/test';

test('登录门: 没有身份时盖住首页，输入用户名和密码后进入，刷新不再询问', async ({ page }) => {
  // 接口拦成不可用：登录不依赖服务端。
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"x"}' }));
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#login-pw')).toHaveValue(/^[A-Za-z0-9]{12}$/);
  await page.locator('#login-pw').fill('short');
  await page.locator('#login-name').fill('小明');
  await page.locator('#login-submit').click();
  await expect(page.locator('#login-hint')).toContainText('8~32');
  await expect(page.locator('#login')).toBeVisible();
  await page.locator('#login-pw').fill('MyPassword9');
  await page.locator('#login-submit').click();
  await expect(page.locator('#login')).toBeHidden();
  expect(await page.evaluate(() => [localStorage.getItem('pao-pw'), localStorage.getItem('pao-name')])).toEqual(['MyPassword9', '小明']);
  await page.reload();
  await page.locator('body[data-ready]').waitFor();
  await expect(page.locator('#login')).toBeHidden();
});

test('登录门: 密码对应已有身份时先预览，确认后进入，并把榜单上的名字改成新填的', async ({ page }) => {
  const renames = [];
  await page.route('**/api/player**', async (route) => {
    const request = route.request();
    if (request.method() === 'POST') { renames.push(request.postDataJSON()); return route.fulfill({ json: { name: '小明', boards: 3 } }); }
    return route.fulfill({ json: { exists: true, name: '老玩家', boards: 3 } });
  });
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator('#login-name').fill('小明');
  await page.locator('#login-pw').fill('MyPassword9');
  await page.locator('#login-submit').click();
  await expect(page.locator('#login-hint')).toContainText('找到已有身份「老玩家」，3 个榜单有成绩');
  await expect(page.locator('#login-hint')).toContainText('改为「小明」');
  await expect(page.locator('#login-submit')).toHaveText('确认进入');
  await expect(page.locator('#login')).toBeVisible();
  // 再改一下密码就要重新预览。
  await page.locator('#login-pw').fill('MyPassword8');
  await expect(page.locator('#login-submit')).toHaveText('进入');
  await page.locator('#login-pw').fill('MyPassword9');
  await page.locator('#login-submit').click();
  await page.locator('#login-submit').click();
  await expect(page.locator('#login')).toBeHidden();
  expect(renames).toHaveLength(1);
  expect(renames[0]).toMatchObject({ name: '小明' });
});

test('登录门: 退出登录后重新弹出，旧身份被清掉', async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('seeded')) { localStorage.setItem('seeded', '1'); localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); } });
  await page.route('**/api/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"x"}' }));
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await expect(page.locator('#login')).toBeHidden();
  await page.locator('#open-board').click();
  await expect(page.locator('#board-name')).toHaveValue('测试员');
  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('#board-logout').click();
  await expect(page.locator('#login')).toBeVisible();
  await expect(page.locator('#board')).not.toHaveClass(/active/);
  expect(await page.evaluate(() => localStorage.getItem('pao-pw'))).toBeNull();
});
