import { test, expect } from '@playwright/test';

// 两个独立的浏览器上下文扮演两位玩家，连本机起的真实房间服务（playwright.config.js 里的第二个 webServer，需要先 npm --prefix server ci）。
async function player(browser, name) {
  const context = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1000, height: 1200 } });
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', (error) => page.errors.push(`${name}: ${error.message}`));
  page.on('dialog', (dialog) => dialog.accept());
  await page.addInitScript(() => { localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); });
  return page;
}
const openGame = async (page, game) => {
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator(`.arcade-card[data-mode="${game}"]`).click();
};
const goOnline = (page) => page.locator('.mode-tab[data-tab="online"]').click();
async function createRoom(page, game) {
  await openGame(page, game);
  await goOnline(page);
  await page.locator('.online-primary').click();
  const code = (await page.locator('.online-code').innerText()).trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  return code;
}
async function joinRoom(page, game, code) {
  await openGame(page, game);
  await goOnline(page);
  await page.locator('.online-join input').fill(code.toLowerCase());
  await page.locator('.online-join .online-secondary').click();
}
const stone = (page, at, side) => page.locator(`.board-cell[data-cell="${at}"] .board-piece.side-${side}`);

test('五子棋：创建房间 → 房间码加入 → 轮流落子，非己方回合不能点，一方离开另一方获胜', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  const code = await createRoom(a, 'gomoku');
  await expect(a.locator('.online-waiting')).toBeVisible();
  await joinRoom(b, 'gomoku', code);

  for (const page of [a, b]) await expect(page.locator('.gomoku-board')).toBeVisible();
  await expect(a.locator('.online-you')).toHaveText('你是黑方');
  await expect(b.locator('.online-you')).toHaveText('你是白方');
  await expect(a.locator('.board-tools')).toBeHidden();                     // 对弈/悔棋/重开 在联机里不该出现
  const cell = await a.locator('.board-cell[data-cell="0"]').boundingBox();
  expect(Math.abs(cell.width - cell.height)).toBeLessThan(2);               // 联机界面的样式不能把棋盘格子撑歪
  await expect(a.locator('.online-rival')).toContainText('对手在线');
  await expect(a.locator('.online-room')).toContainText(code);

  await expect(b.locator('.board-cell[data-cell="112"]')).toBeDisabled();   // 白方：还没轮到
  await a.locator('.board-cell[data-cell="112"]').click();
  await expect(stone(a, 112, 1)).toBeVisible();
  await expect(stone(b, 112, 1)).toBeVisible();                             // 对手那边也落了
  await expect(b.locator('.board-status')).toContainText('轮到你');
  await expect(a.locator('.board-status')).toContainText('等待对手');
  await expect(a.locator('.board-cell[data-cell="113"]')).toBeDisabled();   // 黑方：已经走过，轮到对方

  await b.locator('.board-cell[data-cell="113"]').click();
  await expect(stone(a, 113, 2)).toBeVisible();

  await b.locator('.online-bar .online-ghost').click();                     // 白方离开（dialog 已自动确认）
  await expect(a.locator('.board-status')).toContainText('对手已离开');
  await expect(a.locator('.online-rival')).toContainText('对手已离开');
  await expect(b.locator('.online-lobby')).toBeVisible();
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('邀请链接：打开链接直接进到对应游戏的联机页并入座（象棋），走子双方同步', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  await createRoom(a, 'xiangqi');
  const link = await a.locator('.online-link').inputValue();
  expect(link).toMatch(/\/\?game=xiangqi&room=[A-HJ-NP-Z2-9]{5}$/);

  await b.goto(link);                                                       // 不用点任何按钮
  await expect(b.locator('.xiangqi-board')).toBeVisible();
  await expect(a.locator('.xiangqi-board')).toBeVisible();
  await expect(a.locator('.online-you')).toHaveText('你是红方');
  await expect(b.locator('.online-you')).toHaveText('你是黑方');
  await expect(a.locator('.xiangqi-tools')).toBeHidden();
  await expect(b.locator('.xiangqi-board')).toHaveClass(/flipped/);          // 黑方视角：棋盘转过来，自己的棋子在下面
  await expect(a.locator('.xiangqi-board')).not.toHaveClass(/flipped/);
  expect(b.url()).not.toContain('room=');                                   // 链接里的房间码用完即清

  await a.locator('[data-square="b2"]').click();                            // 红炮平中
  await a.locator('[data-square="e2"]').click();
  await expect(b.locator('[data-square="e2"] .xiangqi-piece.red')).toBeVisible();
  await expect(b.locator('.xiangqi-status')).toContainText('轮到你');
  await expect(a.locator('.xiangqi-status')).toContainText('等待对手');
  await b.locator('[data-square="a3"]').click();                            // 黑方点红方的兵：无效选择，不会走
  await expect(b.locator('.xiangqi-cell.move-target')).toHaveCount(0);

  await b.locator('[data-square="b7"]').click();                            // 黑炮平中
  await b.locator('[data-square="e7"]').click();
  await expect(a.locator('[data-square="e7"] .xiangqi-piece.black')).toBeVisible();
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('刷新页面后回到联机页，棋盘和对手的落子都还在', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  const code = await createRoom(a, 'reversi');
  await joinRoom(b, 'reversi', code);
  await expect(a.locator('.reversi-board')).toBeVisible();
  const legal = a.locator('.board-cell.target').first();
  const at = await legal.getAttribute('data-cell');
  await legal.click();
  await expect(b.locator(`.board-cell[data-cell="${at}"] .board-piece.side-1`)).toBeVisible();

  await a.reload();                                                         // 刷新：座位保留 60 秒
  await expect(a.locator('.reversi-board')).toBeVisible();
  await expect(a.locator('.online-room')).toContainText(code);
  await expect(a.locator(`.board-cell[data-cell="${at}"] .board-piece.side-1`)).toBeVisible();
  await expect(b.locator('.online-rival')).toContainText('对手在线');
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('加入失败：格式不对、房间不存在、房间已满，都给出明确提示', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B'), c = await player(browser, 'C');
  await openGame(c, 'jungle');
  await goOnline(c);
  await c.locator('.online-join input').fill('12');
  await c.locator('.online-join .online-secondary').click();
  await expect(c.locator('.online-msg')).toContainText('5 位');
  await c.locator('.online-join input').fill('ZZZZZ');
  await c.locator('.online-join .online-secondary').click();
  await expect(c.locator('.online-msg')).toContainText('房间不存在');

  const code = await createRoom(a, 'jungle');
  await joinRoom(b, 'jungle', code);
  await expect(b.locator('.jungle-board')).toBeVisible();
  await c.locator('.online-join input').fill(code);
  await c.locator('.online-join .online-secondary').click();
  await expect(c.locator('.online-msg')).toContainText('已经满员');         // 第三个人
  expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
  for (const page of [a, b, c]) await page.context().close();
});

test('2048 竞速：开局一样，一方滑动，另一方的对手面板同步更新；竞速里不能撤销', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  await openGame(a, 'g2048');
  await goOnline(a);
  await a.locator('.online-option select').selectOption({ label: '512' });
  await a.locator('.online-primary').click();
  const code = (await a.locator('.online-code').innerText()).trim();
  await joinRoom(b, 'g2048', code);

  for (const page of [a, b]) {
    await expect(page.locator('canvas.game-canvas')).toBeVisible();
    await expect(page.locator('.race-rival')).toContainText('对手');
    await expect(page.locator('#score-text')).toContainText('目标 512');
  }
  // 同一个开局：两边的对手面板里，数字格的个数和内容一致（都是 2 个初始方块）
  const rivalTiles = (page) => page.locator('.rival-grid i').allInnerTexts().then((all) => all.filter(Boolean).sort());
  expect(await rivalTiles(a)).toEqual(expect.arrayContaining([expect.stringMatching(/^[24]$/)]));
  expect((await rivalTiles(a)).length).toBe(2);
  expect(await rivalTiles(a)).toEqual(await rivalTiles(b));

  await expect.poll(async () => {
    for (const key of ['ArrowLeft', 'ArrowDown', 'ArrowRight', 'ArrowUp']) {
      await a.keyboard.press(key);
      if ((await b.locator('.race-rival').innerText()).includes(' 1 步')) return true;
    }
    return false;
  }, { timeout: 8000 }).toBe(true);
  await a.keyboard.press('z');                                              // 撤销键：提示，不改变局面
  await expect(a.locator('#score-text')).toContainText('你');
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('扫雷竞速：同一块雷区、起手展开一样；点击由服务端裁决，对手看到进度而不是盘面', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  await openGame(a, 'minesweeper');
  await goOnline(a);
  await a.locator('.online-option select').selectOption({ label: '简单' });
  await a.locator('.online-primary').click();
  const code = (await a.locator('.online-code').innerText()).trim();
  await joinRoom(b, 'minesweeper', code);
  for (const page of [a, b]) {
    await expect(page.locator('.mine-board')).toBeVisible();
    await expect(page.locator('.mine-cell')).toHaveCount(81);
    await expect(page.locator('.mine-level')).toBeHidden();                 // 难度由房主在创建时定
    await expect(page.locator('.race-rival')).toContainText('对手进度');
  }
  const opened = (page) => page.locator('.mine-cell.open').count();
  const sample = await a.locator('.mine-cell').first().boundingBox();
  expect(Math.abs(sample.width - sample.height)).toBeLessThan(2);           // 格子是方的，没有被联机样式撑歪
  expect(sample.x + sample.width).toBeLessThanOrEqual(1000);
  const start = await opened(a);
  expect(start).toBeGreaterThan(0);
  expect(await opened(b)).toBe(start);                                      // 两人起手一样
  expect(await a.locator('.mine-cell', { hasText: '✹' }).count()).toBe(0);  // 开局看不到任何雷

  await a.locator('.mine-cell:not(.open)').first().click();
  await expect.poll(async () => (await opened(a)) !== start || (await a.locator('.classic-status').innerText()).includes('地雷')).toBe(true);
  expect(await opened(b)).toBe(start);                                      // 对手的盘面不会因为我的点击而变
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('本地 / 联机来回切换不影响本地游戏，也不残留联机界面', async ({ browser }) => {
  const a = await player(browser, 'A');
  await openGame(a, 'gomoku');
  await expect(a.locator('.gomoku-board')).toBeVisible();
  await a.locator('.board-cell[data-cell="112"]').click();                  // 本地先走一手
  await goOnline(a);
  await expect(a.locator('.online-lobby')).toBeVisible();
  await expect(a.locator('.gomoku-board')).toHaveCount(0);
  await expect(a.locator('#restart-game')).toBeHidden();
  await a.locator('.mode-tab[data-tab="local"]').click();
  await expect(a.locator('.gomoku-board')).toBeVisible();
  await expect(a.locator('.online-lobby')).toHaveCount(0);
  await expect(a.locator('#restart-game')).toBeVisible();
  expect(a.errors).toEqual([]);
  await a.context().close();
});

// 五子棋：黑方（A）下第 0 列先成五，白方（B）下第 1 列
async function finishGomoku(a, b) {
  const steps = [[a, 0, 1], [b, 1, 2], [a, 15, 1], [b, 16, 2], [a, 30, 1], [b, 31, 2], [a, 45, 1], [b, 46, 2], [a, 60, 1]];
  for (const [who, at, side] of steps) {
    await who.locator(`.board-cell[data-cell="${at}"]`).click();
    await expect(stone(a, at, side)).toBeVisible();
    await expect(stone(b, at, side)).toBeVisible();
  }
  await expect(a.locator('.board-status')).toContainText('你赢了');
  await expect(b.locator('.board-status')).toContainText('你输了');
}
const after = (page) => page.locator('.online-after');

test('再来一局 · 换边：一方邀请、另一方同意 → 座位对调、棋盘清空、原来的后手先走', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  const code = await createRoom(a, 'gomoku');
  await joinRoom(b, 'gomoku', code);
  await expect(a.locator('.gomoku-board')).toBeVisible();
  await expect(after(a)).toBeHidden();                                        // 对局进行中没有这个条

  await finishGomoku(a, b);
  for (const page of [a, b]) {
    await expect(after(page)).toBeVisible();
    await expect(after(page).getByRole('button', { name: '再来一局' })).toBeVisible();
    await expect(after(page).getByRole('button', { name: '换边再来' })).toBeVisible();
  }
  await expect(a.locator('.board-cell[data-cell="112"]')).toBeDisabled();    // 结束了，不能再落子

  await a.getByRole('button', { name: '换边再来' }).click();
  await expect(after(a)).toContainText('已向对手发出邀请');
  await expect(after(b)).toContainText('对手想换边再来一局');
  await b.getByRole('button', { name: '同意' }).click();

  await expect(a.locator('.online-you')).toHaveText('你是白方');               // 座位对调
  await expect(b.locator('.online-you')).toHaveText('你是黑方');
  await expect(after(a)).toBeHidden();
  await expect(after(b)).toBeHidden();
  for (const page of [a, b]) await expect(page.locator('.board-piece')).toHaveCount(0);   // 棋盘清空
  await expect(b.locator('.board-status')).toContainText('轮到你');
  await expect(a.locator('.board-cell[data-cell="112"]')).toBeDisabled();
  await b.locator('.board-cell[data-cell="112"]').click();                    // 现在 B 先手
  await expect(stone(a, 112, 1)).toBeVisible();
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('再来一局 · 不换边 / 拒绝 / 取消：座位保持，拒绝时提议者收到通知', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  const code = await createRoom(a, 'gomoku');
  await joinRoom(b, 'gomoku', code);
  await expect(a.locator('.gomoku-board')).toBeVisible();
  await finishGomoku(a, b);

  await b.getByRole('button', { name: '再来一局' }).click();                  // B 邀请，A 拒绝
  await expect(after(a)).toContainText('对手想再来一局');
  await a.getByRole('button', { name: '拒绝' }).click();
  await expect(b.locator('.online-note')).toContainText('对手拒绝了再来一局');
  await expect(after(b).getByRole('button', { name: '再来一局' })).toBeVisible();   // 回到可以重新邀请的状态
  await expect(after(a)).not.toContainText('对手想');

  await a.getByRole('button', { name: '再来一局' }).click();                  // A 邀请又自己取消
  await expect(after(a)).toContainText('等待确认');
  await a.getByRole('button', { name: '取消邀请' }).click();
  await expect(after(b)).not.toContainText('对手想');

  await a.getByRole('button', { name: '再来一局' }).click();                  // 这次 B 同意（原座位）
  await b.getByRole('button', { name: '同意' }).click();
  await expect(a.locator('.online-you')).toHaveText('你是黑方');               // 座位没变
  await expect(b.locator('.online-you')).toHaveText('你是白方');
  for (const page of [a, b]) await expect(page.locator('.board-piece')).toHaveCount(0);
  await a.locator('.board-cell[data-cell="112"]').click();
  await expect(stone(b, 112, 1)).toBeVisible();
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('对手离开后不能再来一局，提示明确且没有多余按钮', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  const code = await createRoom(a, 'gomoku');
  await joinRoom(b, 'gomoku', code);
  await expect(a.locator('.gomoku-board')).toBeVisible();
  await finishGomoku(a, b);
  await b.locator('.online-bar .online-ghost').click();                       // B 离开
  await expect(after(a)).toContainText('对手已经离开');
  await expect(after(a).getByRole('button')).toHaveCount(0);
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('扫雷竞速结束后再来一局：没有「换边」（两边对称），难度沿用，换一块新雷区', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  await openGame(a, 'minesweeper');
  await goOnline(a);
  await a.locator('.online-option select').selectOption({ label: '简单' });
  await a.locator('.online-primary').click();
  const code = (await a.locator('.online-code').innerText()).trim();
  await joinRoom(b, 'minesweeper', code);
  await expect(a.locator('.mine-board')).toBeVisible();

  // 看不到雷在哪：从头到尾点，直到分出胜负（踩雷或者扫完）
  await expect.poll(async () => {
    const cell = a.locator('.mine-cell:not(.open):not(:disabled)').first();
    if (await cell.count()) await cell.click();
    return after(a).isVisible();
  }, { timeout: 20000 }).toBe(true);
  await expect(after(b)).toBeVisible();
  await expect(after(a).getByRole('button', { name: '换边再来' })).toHaveCount(0);

  await a.getByRole('button', { name: '再来一局' }).click();
  await b.getByRole('button', { name: '同意' }).click();
  await expect(after(a)).toBeHidden();
  for (const page of [a, b]) {
    await expect(page.locator('.mine-cell')).toHaveCount(81);                 // 难度沿用：简单 9×9
    await expect(page.locator('.mine-cell:not(:disabled)').first()).toBeVisible();   // 新的一局可以点
    await expect(page.locator('.classic-status')).toContainText('抢在对手前');
    expect(await page.locator('.mine-cell', { hasText: '✹' }).count()).toBe(0);
  }
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

// ---------- 军棋 / 斗地主 / 飞行棋 ----------
const pickOption = async (page, label, text) => {
  await page.locator('.online-option', { hasText: label }).locator('select').selectOption({ label: text });
};

test('军棋：暗棋身份只有翻开后才可见，轮流翻棋/走子，非己方回合不能点，一方离开另一方获胜', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  const code = await createRoom(a, 'junqi');
  await joinRoom(b, 'junqi', code);
  for (const page of [a, b]) await expect(page.locator('.junqi-board')).toBeVisible();
  await expect(a.locator('.online-you')).toHaveText('你是先手');
  await expect(a.locator('.junqi-toolbar')).toBeHidden();
  await expect(a.locator('.junqi-cell.face-down')).toHaveCount(50);
  // 暗棋的身份不在对手的内存里：服务端发来的 view 里没有 kind / side
  const leaked = await b.evaluate(() => window.__arcade.classic.session.view.board.filter((p) => p && !p.revealed && (p.kind || p.side)).length);
  expect(leaked).toBe(0);

  await expect(b.locator('.junqi-cell').first()).toBeDisabled();             // 后手：还没轮到
  await a.locator('.junqi-cell.face-down').first().click();
  await expect(a.locator('.junqi-cell.face-up')).toHaveCount(1);
  await expect(b.locator('.junqi-cell.face-up')).toHaveCount(1);             // 对手也看到翻开的棋子
  await expect(b.locator('.junqi-status')).toContainText('轮到你');
  await expect(a.locator('.junqi-status')).toContainText('等待对手');
  await expect(a.locator('.junqi-cell.face-down').first()).toBeDisabled();
  await b.locator('.junqi-cell.face-down').first().click();
  await expect(a.locator('.junqi-cell.face-up')).toHaveCount(2);
  await expect(a.locator('.junqi-status')).toContainText('轮到你');

  await b.locator('.online-bar .online-ghost').click();
  await expect(a.locator('.junqi-status')).toContainText('对手已离开');
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('斗地主：2 个真人 + 1 个电脑，叫分 → 地主出牌 → 电脑接着打；别人的手牌不在页面里', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  await openGame(a, 'doudizhu');
  await goOnline(a);
  await expect(a.locator('.online-option', { hasText: '真人玩家' })).toBeVisible();
  await a.locator('.online-primary').click();
  const code = (await a.locator('.online-code').innerText()).trim();
  await expect(a.locator('.online-waiting')).toBeVisible();
  await joinRoom(b, 'doudizhu', code);
  for (const page of [a, b]) await expect(page.locator('.dd-hand .dd-card')).toHaveCount(17);
  await expect(a.locator('.online-you')).toHaveText('你是玩家 1');
  await expect(a.locator('.dd-actions [data-action="restart"]')).toBeHidden();

  await expect(a.locator('.dd-my-label')).toContainText('轮到你');
  await expect(b.locator('[data-action="bid-1"]')).toBeDisabled();           // 还没轮到
  await a.locator('[data-action="bid-1"]').click();
  await expect(b.locator('.dd-my-label')).toContainText('轮到你');
  await b.locator('[data-action="bid-3"]').click();                          // 3 分直接成为地主
  await expect(b.locator('.dd-hand .dd-card')).toHaveCount(20);
  await expect(a.locator('.dd-hand .dd-card')).toHaveCount(17);
  await expect(a.locator('.dd-bottom .dd-card')).toHaveCount(3);             // 底牌公开了
  const hidden = await a.evaluate(() => window.__arcade.classic.session.view.players.slice(1).map((p) => p.cards.length));
  expect(hidden).toEqual([0, 0]);                                            // 对手的手牌从来没发给过我

  await b.locator('.dd-hand .dd-card').first().click();                      // 地主领出一张
  await b.locator('[data-action="play"]').click();
  await expect(b.locator('.dd-hand .dd-card')).toHaveCount(19);
  await expect(a.locator('.dd-table-label')).toContainText('单张');
  // 下家是电脑：它自己出牌或不要，之后轮到玩家 1（A），全程没有人替它点击
  await expect(a.locator('.dd-my-label')).toContainText('轮到你', { timeout: 10_000 });
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('飞行棋：2 个真人（红·绿）+ 电脑代打黄·蓝；骰子由服务端掷，双方看到同一个点数', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  await openGame(a, 'aeroplane');
  await goOnline(a);
  await a.locator('.online-primary').click();                                // 默认 2 人
  const code = (await a.locator('.online-code').innerText()).trim();
  await joinRoom(b, 'aeroplane', code);
  for (const page of [a, b]) await expect(page.locator('.aeroplane-board')).toBeVisible();
  await expect(a.locator('.online-you')).toHaveText('你是红队');
  await expect(b.locator('.online-you')).toHaveText('你是绿队');
  await expect(a.locator('.aero-mode')).toBeHidden();
  await expect(b.locator('.aero-dice')).toBeDisabled();                      // 红队先行

  const dice = (page) => page.locator('.aero-dice').innerText();
  // 红队操作到回合结束：掷骰，需要选飞机时选第一架并确认；掷到 6 会继续，所以循环到轮到绿队为止
  for (let i = 0; i < 80 && (await b.locator('.aero-dice').isDisabled()); i++) {
    if (await a.locator('.aero-dice').isEnabled()) await a.locator('.aero-dice').click();
    else if (await a.locator('.aero-choices [data-choose]').count()) {
      await a.locator('.aero-choices [data-choose]').first().click();
      await a.locator('[data-action="move"]').click();
    } else await a.waitForTimeout(100);
  }
  await expect(b.locator('.aero-dice')).toBeEnabled({ timeout: 15_000 });   // 黄、蓝由电脑走完，轮到绿队
  await expect(b.locator('.aero-turn')).toContainText('你的回合');
  await expect(a.locator('.aero-turn')).toContainText('绿队');
  await b.locator('.aero-dice').click();
  await expect.poll(async () => (await dice(a)) === (await dice(b)) && (await dice(b)) !== '⚄').toBe(true);
  await b.locator('.online-bar .online-ghost').click();                      // 一方离开，另一方获胜（2 人局）
  await expect(a.locator('.aero-turn')).toContainText('本局已结束');
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('飞行棋 3 人局：等待界面显示 n/3，人齐才开始；座位名跟着队伍走', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B'), c = await player(browser, 'C');
  await openGame(a, 'aeroplane');
  await goOnline(a);
  await pickOption(a, '真人玩家', '3 人（红 · 黄 · 绿）');
  await a.locator('.online-primary').click();
  const code = (await a.locator('.online-code').innerText()).trim();
  await expect(a.locator('.online-waiting')).toContainText('1/3');
  await joinRoom(b, 'aeroplane', code);
  await expect(a.locator('.online-waiting')).toContainText('2/3');
  await expect(b.locator('.online-waiting')).toContainText('2/3');
  await expect(a.locator('.aeroplane-board')).toHaveCount(0);
  await joinRoom(c, 'aeroplane', code);
  for (const page of [a, b, c]) await expect(page.locator('.aeroplane-board')).toBeVisible();
  await expect(b.locator('.online-you')).toHaveText('你是黄队');
  await expect(c.locator('.online-you')).toHaveText('你是绿队');
  await expect(a.locator('.online-rival')).toContainText('其他玩家都在线');
  await c.locator('.online-bar .online-ghost').click();                      // 三人局有人离开 → 本局作废，不判输赢
  await expect(a.locator('.aero-turn')).toContainText('本局已结束');
  await expect(a.locator('.online-after-text')).toContainText('不能再来一局');
  expect([...a.errors, ...b.errors, ...c.errors]).toEqual([]);
  for (const page of [a, b, c]) await page.context().close();
});

// ---------- 泡噗 / 山山兔：在线房间 ----------
test('泡噗 2 在线房间：房主建房选游戏，客人用房间码加入后自动进入同一局，操作同步给房主', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  await a.goto('/'); await a.locator('body[data-ready]').waitFor();
  await a.locator('#open-link').click();
  await a.locator('#online-create').click();
  await expect(a.locator('#online-copy')).toBeVisible();
  const code = await a.locator('#online-code').inputValue();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  await expect(a.locator('#link-state')).toContainText('房主');
  await a.locator('#close-link').click();
  await a.locator('.arcade-card[data-mode="pop2"]').click();

  await b.goto('/'); await b.locator('body[data-ready]').waitFor();
  await b.locator('#open-link').click();
  await b.locator('#online-code').fill(code.toLowerCase());
  await b.locator('#online-join').click();
  await b.locator('#close-link').click();
  await expect(b.locator('#game.active .game-canvas')).toBeVisible({ timeout: 10_000 });   // 房主的快照把客人带进了游戏
  await expect(b.locator('#seat-text')).toContainText('玩家 2');
  expect(await a.evaluate(() => window.__arcade.state.players.length)).toBe(2);

  const before = await a.evaluate(() => window.__arcade.state.players[1].tx);
  await b.keyboard.down('a');
  await b.waitForTimeout(500);
  await b.keyboard.up('a');
  await expect.poll(() => a.evaluate(() => window.__arcade.state.players[1].tx)).not.toBe(before);   // 客人的操作到了房主那里

  await a.locator('#game-link').click();
  await a.locator('#leave-room').click();                                    // 房主断开 → 客人收到通知
  await expect(b.locator('#link-state')).not.toHaveClass(/online/);
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});

test('山山兔在线房间：邀请链接直接加入；错误房间码有提示', async ({ browser }) => {
  const a = await player(browser, 'A'), b = await player(browser, 'B');
  await b.goto('/'); await b.locator('body[data-ready]').waitFor();
  await b.locator('#open-link').click();
  await b.locator('#online-code').fill('ZZZZZ');
  await b.locator('#online-join').click();
  await expect(b.locator('#online-info')).toContainText('房间不存在');
  await b.locator('#online-code').fill('12');
  await b.locator('#online-join').click();
  await expect(b.locator('#online-info')).toContainText('5 位');

  await a.goto('/'); await a.locator('body[data-ready]').waitFor();
  await a.locator('#open-link').click();
  await a.locator('#online-create').click();
  await expect(a.locator('#online-copy')).toBeVisible();
  const code = await a.locator('#online-code').inputValue();
  await a.locator('#close-link').click();
  await a.locator('.arcade-card[data-mode="surge"]').click();

  await b.goto(`/?coop=${code}`);                                            // 邀请链接：不用点任何按钮
  await b.locator('#close-link').click();
  await expect(b.locator('#game.active .game-canvas')).toBeVisible({ timeout: 10_000 });
  expect(b.url()).not.toContain('coop=');
  await expect(b.locator('#link-state')).toContainText('玩家 2');
  expect(await b.evaluate(() => window.__arcade.mode)).toBe('surge');
  expect([...a.errors, ...b.errors]).toEqual([]);
  await a.context().close(); await b.context().close();
});
