import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); });
});
const games = ['gomoku', 'aeroplane', 'reversi', 'draughts', 'jungle'];
test('手机横屏保留棋盘与操作区', async ({ page }) => {
  await page.setViewportSize({width:844,height:390});
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  for(const id of games) {
    await page.locator(`.arcade-card[data-mode="${id}"]`).click();
    const box=await page.locator(`.${id}-board`).boundingBox();
    expect(box.y+box.height).toBeLessThanOrEqual(390);
    const controls=await page.locator(id==='aeroplane'?'.aero-controls':'.board-tools').boundingBox();
    expect(controls.y+controls.height).toBeLessThanOrEqual(390);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.locator('#back-home').click();
  }
});
test('五款棋盘加载、重开、返回和最近常玩，棋盘适应视口', async ({ page }) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await expect(page.locator('.arcade-card')).toHaveCount(20);
  for (const id of games) {
    await page.locator(`.arcade-card[data-mode="${id}"]`).click();
    await expect(page.locator(`.${id}-game`)).toBeVisible();
    await expect(page.locator('#game-link')).toBeHidden();
    await expect(page.locator('#game-board')).toBeHidden();
    await expect(page.locator('#score-text')).not.toContainText('加载');
    const box=await page.locator(`.${id}-board`).boundingBox();
    expect(box.width).toBeLessThanOrEqual(page.viewportSize().width);
    expect(box.y+box.height).toBeLessThanOrEqual(page.viewportSize().height);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.locator('#restart-game').click();
    expect(await page.evaluate(()=>window.__arcade.classic.state.moves)).toBe(0);
    await page.locator('#back-home').click();
    await expect(page.locator(`.recent-card[data-game="${id}"]`)).toBeVisible();
  }
  expect(errors).toEqual([]);
});
test('四款对弈人机应手、悔棋、切换双人和退出停止思考', async ({ page }) => {
  test.setTimeout(30_000);
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  for(const id of ['gomoku','reversi','draughts','jungle']) {
    await page.locator(`.arcade-card[data-mode="${id}"]`).click();
    if(id==='gomoku') await page.locator('[data-cell="112"]').click();
    else if(id==='reversi') await page.locator('.board-cell.target').first().click();
    else { await page.locator('.board-cell.movable').first().click(); await page.locator('.board-cell.target').first().click(); }
    await expect.poll(()=>page.evaluate(()=>window.__arcade.classic.state.moves)).toBe(2);
    await page.locator('[data-action="undo"]').click();
    expect(await page.evaluate(()=>window.__arcade.classic.state.moves)).toBe(0);
    await page.locator('[data-action="mode"]').selectOption('local');
    if(id==='gomoku') await page.locator('[data-cell="112"]').click();
    else if(id==='reversi') await page.locator('.board-cell.target').first().click();
    else { await page.locator('.board-cell.movable').first().click(); await page.locator('.board-cell.target').first().click(); }
    expect(await page.evaluate(()=>window.__arcade.classic.state.moves)).toBe(1);
    await page.locator('[data-action="mode"]').selectOption('ai');
    if(id==='gomoku') await page.locator('[data-cell="112"]').click();
    else if(id==='reversi') await page.locator('.board-cell.target').first().click();
    else { await page.locator('.board-cell.movable').first().click(); await page.locator('.board-cell.target').first().click(); }
    await page.evaluate(()=>{window.departed=window.__arcade.classic;window.departedMoves=window.departed.state.moves;});
    await page.locator('#back-home').click();
    await page.waitForTimeout(650);
    expect(await page.evaluate(()=>window.departed.state.moves)).toBe(await page.evaluate(()=>window.departedMoves));
  }
});

test('国际跳棋连吃按路线逐格选择，完成后才换手', async ({ page }) => {
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await page.locator('.arcade-card[data-mode="draughts"]').click();
  await page.locator('[data-action="mode"]').selectOption('local');
  await page.evaluate(()=>{
    const state=window.__arcade.classic.state;state.board.fill(null);
    state.board[61]={side:1,king:false};state.board[52]={side:2,king:false};state.board[34]={side:2,king:false};state.board[89]={side:2,king:false};
  });
  await page.locator('[data-cell="61"]').click();
  await page.locator('[data-cell="43"]').click();
  expect(await page.evaluate(()=>window.__arcade.classic.state.moves)).toBe(0);
  await expect(page.locator('[data-cell="43"] .board-piece')).toBeVisible();
  await expect(page.locator('.board-status')).toContainText('继续连吃');
  await page.locator('[data-cell="25"]').click();
  expect(await page.evaluate(()=>window.__arcade.classic.state.moves)).toBe(1);
  expect(await page.evaluate(()=>window.__arcade.classic.state.turn)).toBe(2);
  await expect(page.locator('.board-piece')).toHaveCount(2);
});

test('飞行棋掷骰、选机、路线预览、起飞和退出取消电脑动作', async ({ page }) => {
  await page.addInitScript(()=>{Math.random=()=>.99;});
  await page.goto('/'); await page.locator('body[data-ready]').waitFor();
  await page.locator('.arcade-card[data-mode="aeroplane"]').click();
  await page.locator('[data-action="roll"]').click();
  await expect(page.locator('.aero-plane.can-move')).toHaveCount(4);
  await page.locator('[data-choose="0"]').click();
  await expect(page.locator('.aero-route circle')).toHaveCount(1);
  await page.locator('[data-action="move"]').click();
  expect(await page.evaluate(()=>window.__arcade.classic.state.planes[0][0])).toBe(0);
  await page.locator('.aero-mode-select').selectOption('local');
  expect(await page.evaluate(()=>window.__arcade.classic.state.moves)).toBe(0);
  await page.locator('.aero-mode-select').selectOption('ai');
  for(let i=0;i<2;i++) {
    await page.locator('[data-action="roll"]').click();
    await page.locator('[data-choose="0"]').click();
    await page.locator('[data-action="move"]').click();
  }
  await page.locator('[data-action="roll"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__arcade.classic.state.phase)).toBe('move');
  expect(await page.evaluate(()=>window.__arcade.classic.state.turn)).toBe(1);
  await page.evaluate(()=>{window.departed=window.__arcade.classic;window.departedPlanes=JSON.stringify(window.departed.state);});
  await page.locator('#back-home').click();
  await page.waitForTimeout(900);
  expect(await page.evaluate(()=>JSON.stringify(window.departed.state))).toBe(await page.evaluate(()=>window.departedPlanes));
});
