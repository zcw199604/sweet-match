import { test, expect } from '@playwright/test';

// ARCADE 23 起的新游戏：它们都挂在 window.__arcade.kit 上。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员'); });
});

async function open(page, id) {
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator(`.arcade-card[data-mode="${id}"]`).click();
  await expect(page.locator('#score-text')).not.toContainText('正在加载');
}
const kit = (page, fn, arg) => page.evaluate(([source, value]) => new Function('kit', 'arg', `return (${source})(kit, arg)`)(window.__arcade.kit, value), [fn.toString(), arg]);
async function tapAt(page, point) { await page.mouse.click(point.x, point.y); }

test('箭头消除: a free arrow slides away, a blocked one bounces and costs a life, and clearing the level submits it', async ({ page }) => {
  await open(page, 'arrows');
  const free = await kit(page, (k) => k.free()[0]);
  const before = await kit(page, (k) => k.state.arrows.filter((a) => !a.gone).length);
  await tapAt(page, await kit(page, (k, id) => k.locate(id), free));
  await expect.poll(() => kit(page, (k, id) => k.state.arrows[id].gone, free)).toBe(true);
  expect(await kit(page, (k) => k.state.arrows.filter((a) => !a.gone).length)).toBe(before - 1);
  const stuck = await kit(page, (k) => { const ok = new Set(k.free()); return k.state.arrows.find((a) => !a.gone && !ok.has(a.id))?.id ?? null; });
  if (stuck !== null) {
    await tapAt(page, await kit(page, (k, id) => k.locate(id), stuck));
    await expect.poll(() => kit(page, (k) => k.state.lives)).toBe(2);
  }
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await kit(page, (k) => { while (k.free().length) k.tap(k.free()[0]); });
  await expect(page.locator('.kit-card')).toContainText('第 1 关完成');
  expect((await posted).postDataJSON()).toMatchObject({ board: 'arrows', value: 1 });
  await page.locator('.kit-again').click();
  await expect(page.locator('#score-text')).toContainText('第 2 关');
});

test('羊了个羊: a free tile flies into the slot, three of a kind clear, and the witness order wins the level', async ({ page }) => {
  await open(page, 'sheep');
  const first = await kit(page, (k) => k.state.witness[0]);
  await tapAt(page, await kit(page, (k, id) => k.locate(id), first));
  await expect.poll(() => kit(page, (k, id) => k.state.tiles[id].where, first)).not.toBe('board');
  await page.locator('[data-kit-action="hint"]').click();
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await kit(page, (k) => { for (const id of k.state.witness) if (k.state.tiles[id].where === 'board') k.tap(id); });
  await expect(page.locator('.kit-card')).toContainText('第 1 关通过');
  expect((await posted).postDataJSON()).toMatchObject({ board: 'sheep', value: 1 });
  await page.locator('.kit-again').click();
  await expect(page.locator('#score-text')).toContainText('第 2 关');
  // 进度留在本机：回到大厅再进来还是第 2 关
  await page.locator('#back-home').click();
  await page.locator('.arcade-card[data-mode="sheep"]').click();
  await expect(page.locator('#score-text')).toContainText('第 2 关');
});

test('数织: a tap fills a cell, dragging fills a row, undo takes it back, and solving posts the time to the level board', async ({ page }) => {
  await open(page, 'nonogram');
  expect(await kit(page, (k) => k.board)).toBe('nonogram-easy');
  await tapAt(page, await kit(page, (k) => k.locate(0)));
  expect(await kit(page, (k) => k.state.marks[0])).toBe(1);
  const a = await kit(page, (k) => k.locate(5)), b = await kit(page, (k) => k.locate(9));
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 6 }); await page.mouse.up();
  expect(await kit(page, (k) => k.state.marks.slice(5, 10))).toEqual([1, 1, 1, 1, 1]);
  await kit(page, (k) => k.undo());
  expect(await kit(page, (k) => k.state.marks.slice(5, 10))).toEqual([0, 0, 0, 0, 0]);
  await kit(page, (k) => { k.undo(); });
  expect(await kit(page, (k) => k.state.marks[0])).toBe(0);
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await kit(page, (k) => k.solve());
  await expect(page.locator('.kit-card')).toContainText('画出来了');
  expect((await posted).postDataJSON()).toMatchObject({ board: 'nonogram-easy' });
  await page.locator('.kit-again', { hasText: '再来一题' }).click();
  await page.locator('[data-kit-action="level"]').click();
  await expect(page.locator('[data-kit-action="level"]')).toContainText('普通');
  expect(await kit(page, (k) => k.state.size)).toBe(10);
});

test('麻将连连看: tapping two linkable tiles removes them, props count down, and clearing the table wins', async ({ page }) => {
  await open(page, 'mahjong');
  const before = await kit(page, (k) => k.state.grid.flat().filter((v) => v >= 0).length);
  const [a, b] = await kit(page, (k) => k.pair());
  await tapAt(page, await kit(page, (k, p) => k.locate(p.r, p.c), a));
  await tapAt(page, await kit(page, (k, p) => k.locate(p.r, p.c), b));
  await expect.poll(() => kit(page, (k) => k.state.grid.flat().filter((v) => v >= 0).length)).toBe(before - 2);
  await page.locator('[data-kit-action="hint"]').click();
  expect(await kit(page, (k) => k.state.hints)).toBe(2);
  await page.locator('[data-kit-action="shuffle"]').click();
  expect(await kit(page, (k) => k.state.shuffles)).toBe(2);
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await kit(page, (k) => { for (let p = k.pair(); p; p = k.pair()) { k.choose(p[0].r, p[0].c); k.choose(p[1].r, p[1].c); } });
  await expect(page.locator('.kit-card')).toContainText('第 1 关清空');
  expect((await posted).postDataJSON()).toMatchObject({ board: 'mahjong', value: 1 });
});

test('麻将连连看: move mode names its direction, keeps its own progress, and posts to its own board', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'mahjong');
  expect(await kit(page, (k) => k.playMode)).toBe('classic');
  await tapAt(page, await kit(page, (k) => k.locateSwitch('move')));
  expect(await kit(page, (k) => [k.playMode, k.board, k.state.gravity])).toEqual(['move', 'mahjong-move', 'down']);
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await kit(page, (k) => { for (let p = k.pair(); p; p = k.pair()) { k.choose(p[0].r, p[0].c); k.choose(p[1].r, p[1].c); } });
  await expect(page.locator('.kit-card')).toContainText('第 1 关清空');
  expect((await posted).postDataJSON()).toMatchObject({ board: 'mahjong-move', value: 1 });
  // 切回经典，两边进度各记各的
  await page.locator('.kit-card button', { hasText: '下一关' }).click();
  await tapAt(page, await kit(page, (k) => k.locateSwitch('classic')));
  expect(await kit(page, (k) => [k.playMode, k.state.level, k.state.gravity])).toEqual(['classic', 1, 'none']);
});

test('纸牌接龙: tapping the waste ace sends it home, the rest auto-collects, the time is posted, and 抽三张 turns three', async ({ page }) => {
  await open(page, 'solitaire');
  // 只差黑桃：A♠ 在翻牌区，K♠…2♠ 摞在第一列（2♠ 在最上面），其余三种花色已经收齐
  await kit(page, (k) => {
    const c = (rank, suit) => ({ rank, suit, up: true });
    const full = (suit) => Array.from({ length: 13 }, (_, i) => c(i + 1, suit));
    k.load({ draw: 1, seed: 1, stock: [], waste: [c(1, 0)], foundations: [[], full(1), full(2), full(3)], tableau: [Array.from({ length: 12 }, (_, i) => c(13 - i, 0)), [], [], [], [], [], []], moves: 0, history: [], recycles: 0 });
  });
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await tapAt(page, await kit(page, (k) => k.locate(1)));
  await expect(page.locator('.kit-card')).toContainText('全部收齐', { timeout: 8000 });
  expect((await posted).postDataJSON()).toMatchObject({ board: 'solitaire-1' });
  await page.locator('.kit-again').click();
  await expect(page.locator('[data-kit-action="mode"]')).toHaveText('抽一张');
  await page.locator('[data-kit-action="mode"]').click();
  await expect(page.locator('[data-kit-action="mode"]')).toHaveText('抽三张');
  await kit(page, (k) => k.draw());
  expect(await kit(page, (k) => k.state.waste.length)).toBe(3);
  expect(await kit(page, (k) => k.board)).toBe('solitaire-3');
});

test('推箱子: arrow keys walk and push, undo puts the box back, and a solved level posts and moves on', async ({ page }) => {
  await open(page, 'sokoban');
  const start = await kit(page, (k) => k.state.player);
  // 找一个能走的方向用键盘走
  const dir = await kit(page, (k) => [0, 1, 2, 3].find((d) => { const g = k.state; const r = Math.floor(g.player / g.cols) + [-1, 0, 1, 0][d], c = g.player % g.cols + [0, 1, 0, -1][d]; const i = r * g.cols + c; return g.floor.has(i) && !g.boxes.has(i); }));
  await page.keyboard.press(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][dir]);
  await expect.poll(() => kit(page, (k) => k.state.moves)).toBe(1);
  expect(await kit(page, (k) => k.state.player)).not.toBe(start);
  await page.locator('[data-kit-action="undo"]').click();
  expect(await kit(page, (k) => k.state.player)).toBe(start);
  // 一个两步就能推完的小屋子：直接换成它来过关
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await kit(page, (k) => { k.goto(0); const g = k.state; g.boxes = new Set([...g.goals]); g.boxes.delete([...g.goals][0]); const goal = [...g.goals][0]; const box = goal - 1, player = goal - 2; g.boxes.add(box); g.player = player; g.floor.add(box); g.floor.add(player); g.walls.delete(box); g.walls.delete(player); return k.go(1); });
  await expect(page.locator('.kit-card')).toContainText('第 1 关完成');
  expect((await posted).postDataJSON()).toMatchObject({ board: 'sokoban', value: 1 });
  await page.locator('.kit-again', { hasText: '下一关' }).click();
  await expect(page.locator('#score-text')).toContainText('第 2 关');
});

test('六角排序: tapping a tray stack then a cell places it, matching tops merge, and reaching the target wins', async ({ page }) => {
  await open(page, 'hexsort');
  const tray = await kit(page, (k) => k.state.tray[0]);
  await tapAt(page, await kit(page, (k) => k.locateTray(0)));
  await tapAt(page, await kit(page, (k) => k.locate('0,0')));
  await expect.poll(() => kit(page, (k) => k.state.placed)).toBe(1);
  expect(await kit(page, (k) => Object.values(k.state.board).reduce((n, s) => n + s.length, 0) + k.state.cleared)).toBe(tray.length);
  await expect.poll(() => kit(page, (k) => k.busy)).toBe(false);
  // 把目标改成刚好差一片，再摆两叠能凑满十片的
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await kit(page, (k) => {
    const s = k.state;
    for (const key of Object.keys(s.board)) s.board[key] = [];
    s.board['1,0'] = [0, 0, 0, 0, 0, 0];
    s.tray = [[0, 0, 0, 0], null, null];
    s.shape.target = s.cleared + 10;
    return k.drop(0, '0,0');
  });
  await expect(page.locator('.kit-card')).toContainText('第 1 关完成', { timeout: 8000 });
  expect((await posted).postDataJSON()).toMatchObject({ board: 'hexsort', value: 1 });
});

test('拧螺丝: a free screw flies into its box, a covered one refuses, and turning them all wins the level', async ({ page }) => {
  await open(page, 'screw');
  const first = await kit(page, (k) => k.state.witness[0]);
  await tapAt(page, await kit(page, (k, id) => k.locate(id), first));
  await expect.poll(() => kit(page, (k, id) => k.state.screws[id].where, first)).not.toBe('board');
  const covered = await kit(page, (k) => k.state.screws.find((s) => s.where === 'board' && k.state.plates.some((p) => !p.fallen && p.z > k.state.plates[s.plate].z && s.x > p.x + 4 && s.x < p.x + p.w - 4 && s.y > p.y + 4 && s.y < p.y + p.h - 4))?.id ?? null);
  if (covered !== null) expect(await kit(page, (k, id) => k.tap(id), covered)).toBe(false);
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await kit(page, (k) => { for (const id of k.state.witness) if (k.state.screws[id].where === 'board') k.tap(id); });
  await expect(page.locator('.kit-card')).toContainText('第 1 关完成', { timeout: 10000 });
  expect((await posted).postDataJSON()).toMatchObject({ board: 'screw', value: 1 });
});

test('毛线三消: an outer ball is taken, an inner one refuses, and unpicking the whole picture wins', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'yarn');
  const outer = await kit(page, (k) => k.state.balls.findIndex((c) => c >= 0));
  const before = await kit(page, (k) => k.state.moves);
  await tapAt(page, await kit(page, (k, i) => k.locate(i), outer));
  await expect.poll(() => kit(page, (k) => k.state.moves)).toBe(before + 1);
  const inner = await kit(page, (k) => { const s = k.state; return s.balls.findIndex((c, i) => c >= 0 && !s.taken[i] && [[0, 1], [0, -1], [1, 0], [-1, 0]].every(([dr, dc]) => { const r = Math.floor(i / s.cols) + dr, cc = (i % s.cols) + dc; return r >= 0 && cc >= 0 && r < s.rows && cc < s.cols && s.balls[r * s.cols + cc] >= 0 && !s.taken[r * s.cols + cc]; })); });
  expect(await kit(page, (k, i) => k.take(i), inner)).toBe(false);
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await kit(page, (k) => { for (let n = 0; n < 400; n += 1) { const s = k.state; const exposed = s.balls.map((c, i) => (c >= 0 && !s.taken[i] && [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dr, dc]) => { const r = Math.floor(i / s.cols) + dr, cc = (i % s.cols) + dc; return r < 0 || cc < 0 || r >= s.rows || cc >= s.cols || s.balls[r * s.cols + cc] < 0 || s.taken[r * s.cols + cc]; }) ? i : -1)).filter((i) => i >= 0); if (!exposed.length) break; const fit = exposed.find((i) => s.spools.some((x) => x && x.color === s.balls[i] && x.filled < 3)); k.take(fit ?? exposed[0]); } });
  await expect(page.locator('.kit-card')).toContainText('拆完了', { timeout: 15000 });
  expect((await posted).postDataJSON()).toMatchObject({ board: 'yarn', value: 1 });
});

test('沙画消消: tapping a lane puts its bucket on the belt, it sucks sand, and clearing the bottle wins', async ({ page }) => {
  await open(page, 'sand');
  await expect.poll(() => kit(page, (k) => k.loading)).toBe(false);
  // 换成一个小局面：瓶底三粒红沙，第一列一个能装三粒的红桶
  await kit(page, (k) => { const s = k.state; s.grid.fill(-1); for (const x of [3, 4, 5]) s.grid[s.grid.length - 1 - x] = 0; s.total = 3; s.absorbed = 0; s.lanes = [[{ color: 0, cap: 3, got: 0 }], [], []]; });
  const posted = page.waitForRequest((r) => r.url().includes('/api/scores') && r.method() === 'POST');
  await tapAt(page, await kit(page, (k) => k.locateLane(0)));
  expect(await kit(page, (k) => k.state.belt[0]?.color)).toBe(0);
  await expect(page.locator('.kit-card')).toContainText('第 1 关完成', { timeout: 8000 });
  expect((await posted).postDataJSON()).toMatchObject({ board: 'sand', value: 1 });
});

test('跑得快: tapping cards selects them, a legal play leaves the hand, the computers answer, and the board button stays hidden', async ({ page }) => {
  await open(page, 'runfast');
  await expect(page.locator('#game-board')).toBeHidden();
  // 等到轮到自己而且有牌可出（要不起就点「不要」，有大必压时按钮才是亮的）
  await expect.poll(() => kit(page, (k) => { if (k.state.current !== 0) return false; if (!k.moves().length) { k.act('pass'); return false; } return true; }), { timeout: 12000 }).toBe(true);
  const move = await kit(page, (k) => k.moves().sort((a, b) => a.cards.length - b.cards.length)[0]);
  for (const id of move.cards) await tapAt(page, await kit(page, (k, x) => k.locate(x), id));
  await kit(page, (k) => k.act('play'));
  expect(await kit(page, (k) => k.state.hands[0].length)).toBe(16 - move.cards.length);
  await expect.poll(() => kit(page, (k) => k.state.current), { timeout: 8000 }).toBe(0);
  expect(await kit(page, (k) => k.state.log.length)).toBeGreaterThanOrEqual(2);
});

test('中国跳棋: tapping a piece shows where it can go, a tap there moves it, the computer replies, and 悔棋 takes both back', async ({ page }) => {
  await open(page, 'tiaoqi');
  const piece = await kit(page, (k) => Object.keys(k.state.board).find((c) => k.state.board[c] === 0 && c.split(',')[2] === '5'));
  await tapAt(page, await kit(page, (k, c) => k.locate(c), piece));
  const to = await kit(page, (k, c) => { const [x, y, z] = c.split(',').map(Number); return [`${x + 1},${y},${z - 1}`, `${x},${y + 1},${z - 1}`].find((d) => !(d in k.state.board)); }, piece);
  await tapAt(page, await kit(page, (k, c) => k.locate(c), to));
  await expect.poll(() => kit(page, (k, c) => k.state.board[c], to)).toBe(0);
  await expect.poll(() => kit(page, (k) => k.state.moves), { timeout: 6000 }).toBe(2);
  await page.locator('[data-kit-action="undo"]').click();
  expect(await kit(page, (k) => k.state.moves)).toBe(0);
  expect(await kit(page, (k, c) => k.state.board[c], piece)).toBe(0);
  await page.locator('[data-kit-action="mode"]').click();
  await expect(page.locator('[data-kit-action="mode"]')).toHaveText('对两个电脑');
  expect(await kit(page, (k) => k.state.players)).toBe(3);
});

test('围棋: a tap places a stone and the computer answers; two passes in 双人 lead to counting and a result', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pao-weiqi', JSON.stringify({ mode: 'black', level: 'easy' })));
  await open(page, 'weiqi');
  await expect(page.locator('[data-kit-action="level"]')).toHaveText('简单');
  await tapAt(page, await kit(page, (k) => k.locate(4, 4)));
  expect(await kit(page, (k) => k.state.board[k.state.N * 5 + 5])).toBe(1);
  await expect.poll(() => kit(page, (k) => k.state.moves), { timeout: 10000 }).toBe(2);
  await page.locator('[data-kit-action="mode"]').click();
  await page.locator('[data-kit-action="mode"]').click();
  await expect(page.locator('[data-kit-action="mode"]')).toHaveText('双人');
  await expect(page.locator('[data-kit-action="level"]')).toBeHidden();
  await kit(page, (k) => { k.tapPoint(k.state.N * 3 + 3); k.tapPoint(k.state.N * 7 + 7); k.tapButton('left'); k.tapButton('left'); });
  await expect.poll(() => kit(page, (k) => Boolean(k.scoring))).toBe(true);
  await kit(page, (k) => k.tapButton('left'));
  await expect(page.locator('.kit-card')).toContainText('胜');
});

// 每款新游戏：画布和顶栏按钮都在一屏里，不用滚动，也不会横向撑出页面。
const NEW_GAMES = ['arrows', 'screw', 'sand', 'runfast', 'hexsort', 'mahjong', 'nonogram', 'solitaire', 'sokoban', 'tiaoqi', 'weiqi', 'sheep', 'yarn'];
for (const id of NEW_GAMES) {
  test(`${id}: the whole board and the header buttons fit on one screen`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, id);
    if (page.viewportSize().width <= 800) await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    const fit = await page.evaluate(() => {
      const canvas = document.querySelector('.kit-wrap .game-canvas').getBoundingClientRect();
      const buttons = [...document.querySelectorAll('.stage-actions button:not([hidden])')].map((b) => b.getBoundingClientRect());
      return {
        wide: document.documentElement.scrollWidth <= innerWidth + 1,
        canvas: canvas.top >= 0 && canvas.bottom <= innerHeight + 1,
        buttons: buttons.every((b) => b.right <= innerWidth + 1 && b.left >= -1 && b.bottom <= innerHeight),
        size: canvas.width
      };
    });
    expect(fit).toMatchObject({ wide: true, canvas: true, buttons: true });
    expect(fit.size).toBeGreaterThan(230);
    await page.locator('#back-home').click();
    await expect(page.locator(`.recent-card[data-game="${id}"]`)).toBeVisible();
    expect(errors).toEqual([]);
  });
}
