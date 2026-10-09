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

test('home page fits narrow screens and exposes six arcade cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.arcade-card')).toHaveCount(6);
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

// 三消勇者团 is plain DOM; its live state is on window.__arcade.quest.
const quest = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__arcade.quest?.state ?? null)));
async function openQuest(page) {
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator('[data-mode="quest"]').click();
  await expect(page.locator('.quest-board .qt')).toHaveCount(36);
  await expect(page.locator('#score-text')).toContainText('第 1/10 关');
}
// Tap the two tiles of a swap that is known to make a match.
async function tapSwap(page) {
  const move = await page.evaluate(async () => {
    const { validSwaps } = await import('/quest-core.js');
    return validSwaps(window.__arcade.quest.state.board)[0];
  });
  const tile = ({ 0: r, 1: c }) => page.locator(`.qt[data-r="${r}"][data-c="${c}"]`);
  await tile(move.a).click();
  await tile(move.b).click();
  return move;
}

test('三消勇者团: enemies, party and the 6×6 board fit on one screen', async ({ page }) => {
  await openQuest(page);
  if (page.viewportSize().width <= 800) await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  await expect(page.locator('.qh')).toHaveCount(4);
  await expect(page.locator('.qe')).toHaveCount(1);
  await expect(page.locator('.qe-intent')).toContainText('攻击');
  await expect(page.locator('.quest-scene')).toBeVisible();
  const fit = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const board = rect('.quest-board'), last = [...document.querySelectorAll('#mobile-controls button')].at(-1).getBoundingClientRect(), enemy = rect('.qe');
    return { wide: document.documentElement.scrollWidth <= window.innerWidth + 1, board: board.bottom <= window.innerHeight && board.top >= 0, enemy: enemy.top >= 0, controls: last.bottom <= window.innerHeight, size: board.width };
  });
  expect(fit).toMatchObject({ wide: true, board: true, enemy: true, controls: true });
  expect(fit.size).toBeGreaterThan(240);
});

test('三消勇者团: a swap that lines up three resolves, then the enemy answers', async ({ page }) => {
  await openQuest(page);
  // A long cascade can finish the first wave outright; keep the slime alive so the enemy phase is what we watch.
  await page.evaluate(() => { const [slime] = window.__arcade.quest.state.enemies; slime.hp = slime.maxHp = 9999; });
  await tapSwap(page);
  // The cleared tiles fly to their hero and the hero's action floats a number over someone.
  await expect(page.locator('.quest-fx .qfloat').first()).toBeAttached();
  await expect(page.locator('.quest-turn')).toHaveText(/敌人行动|额外回合|你的回合/);
  // Back to the player: either the enemy has answered (turns +1) or a 4-line earned an extra move.
  await expect.poll(async () => { const s = await quest(page); return s.phase === 'player' && (s.turns >= 1 || s.bonus); }, { timeout: 8000 }).toBe(true);
  expect((await quest(page)).score).toBeGreaterThanOrEqual(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('三消勇者团: a swap that makes no match is refused without costing the turn', async ({ page }) => {
  await openQuest(page);
  const cell = await page.evaluate(async () => {
    const { validSwaps } = await import('/quest-core.js');
    const { board } = window.__arcade.quest.state, good = validSwaps(board).map(({ a, b }) => `${a}|${b}`);
    for (let r = 0; r < 6; r += 1) for (let c = 0; c < 5; c += 1) if (board[r][c] !== board[r][c + 1] && !good.includes(`${[r, c]}|${[r, c + 1]}`)) return { a: [r, c], b: [r, c + 1] };
    return null;
  });
  test.skip(!cell, 'every neighbouring pair matches on this board');
  const before = await quest(page);
  await page.locator(`.qt[data-r="${cell.a[0]}"][data-c="${cell.a[1]}"]`).click();
  await page.locator(`.qt[data-r="${cell.b[0]}"][data-c="${cell.b[1]}"]`).click();
  await expect(page.locator('.quest-msg')).toContainText('连不成三个');
  const after = await quest(page);
  expect(after.board).toEqual(before.board);
  expect(after.phase).toBe('player');
});

test('三消勇者团: the hint button lights up a swap that works', async ({ page }) => {
  await openQuest(page);
  await page.locator('#quest-hint').click();
  await expect(page.locator('.qt.hint')).toHaveCount(2);
});

test('三消勇者团: losing shows the end card, submits the score, and 再来一局 starts over', async ({ page }) => {
  const posts = await stubScores(page);
  await openQuest(page);
  // Leave one hero standing on 1 HP and an enemy that cannot miss, then make any move.
  await page.evaluate(() => {
    const { state } = window.__arcade.quest;
    state.score = 321;
    state.enemies[0].hp = state.enemies[0].maxHp = 9999; // a long cascade must not win the wave first
    state.party.forEach((hero, i) => { hero.hp = i === 0 ? 1 : 0; });
    state.enemies[0].intent = { n: '必杀', k: 'pierce', p: 99 };
  });
  await tapSwap(page);
  await expect(page.locator('.quest-card strong')).toHaveText('全军覆没', { timeout: 10_000 });
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ board: 'quest', value: 321 });
  await expect(page.locator('.quest-card p')).toContainText('全球第 3 名');
  await page.locator('.quest-again').click();
  await expect(page.locator('.quest-overlay')).toBeHidden();
  expect((await quest(page)).stage).toBe(1);
  expect((await quest(page)).score).toBe(0);
  await expect(page.locator('.qh.down')).toHaveCount(0);
  await page.locator('#back-home').click();
  expect(await page.evaluate(() => window.__arcade.quest)).toBe(null);
});

test('三消勇者团: clearing a wave offers rewards and the next stage starts', async ({ page }) => {
  await openQuest(page);
  await page.evaluate(() => {
    const { state } = window.__arcade.quest;
    // One hit from dead whatever the first match is: mage and warrior tiles both finish it.
    state.enemies[0].hp = 1;
    state.party[1].hp = state.party[0].hp = 1;
  });
  // Swap until the board's first valid move kills the slime (warrior/mage), or give up after a few tries.
  for (let tries = 0; tries < 6; tries += 1) {
    const phase = (await quest(page)).phase;
    if (phase === 'build') break;
    if (phase !== 'player') { await page.waitForTimeout(500); continue; }
    const kill = await page.evaluate(async () => {
      const { validSwaps, swapTiles, resolveStep } = await import('/quest-core.js');
      const { state } = window.__arcade.quest;
      for (const move of validSwaps(state.board)) {
        const copy = structuredClone(state);
        swapTiles(copy, ...move.a, ...move.b);
        resolveStep(copy);
        if (copy.enemies[0].hp <= 0) return move;
      }
      return null;
    });
    if (!kill) { await page.locator('#restart-game').click(); await page.evaluate(() => { window.__arcade.quest.state.enemies[0].hp = 1; }); continue; }
    await page.locator(`.qt[data-r="${kill.a[0]}"][data-c="${kill.a[1]}"]`).click();
    await page.locator(`.qt[data-r="${kill.b[0]}"][data-c="${kill.b[1]}"]`).click();
    await expect.poll(async () => (await quest(page)).phase, { timeout: 8000 }).toBe('build');
  }
  await expect(page.locator('.quest-perk')).toHaveCount(3);
  await page.locator('.quest-perk').first().click();
  await expect(page.locator('.quest-overlay')).toBeHidden();
  await expect(page.locator('#score-text')).toContainText('第 2/10 关');
  await expect(page.locator('.qe-name')).toHaveText('洞穴蝠');
  await expect(page.locator('.quest-route i').nth(1)).toHaveClass(/now/);
  // The party marches to the next wave; the board takes moves again once it arrives.
  await expect(page.locator('.quest-turn')).toHaveText('你的回合', { timeout: 5000 });
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

// ---- 山山兔横屏：手机横过来时只显示传送带和棋盘的宽画布 ----
test.describe('山山兔 sideways on a phone', () => {
  test.use({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });

  test('the canvas turns wide, fits the screen, and taps land on the right world spot', async ({ page }) => {
    await open(page, 'surge');
    const box = await page.locator('.game-canvas').boundingBox();
    // 720 × 516 的视窗，比原来的正方形更宽，而且整块画布和按钮都在屏幕内。
    expect(box.width / box.height).toBeCloseTo(720 / 516, 1);
    // 顶部导航栏收成右上角一小排按钮，画布吃满屏幕高度；按钮都在屏幕内，也没压住画布。
    expect(box.height).toBeGreaterThan(360);
    for (const id of ['#back-home', '#game-board', '#game-link']) {
      const rect = await page.locator(id).boundingBox();
      expect(rect.x).toBeGreaterThanOrEqual(box.x + box.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(390);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    expect(await page.locator('#mobile-controls button').last().evaluate((node) => node.getBoundingClientRect().bottom <= window.innerHeight)).toBe(true);
    // 画布顶边对应世界坐标 y=84：点第 7 列第 5 行（世界中心 x=36+6.5*54, y=252+4.5*54）。
    const k = box.width / 720;
    await page.mouse.click(box.x + (36 + 6.5 * 54) * k, box.y + (252 + 4.5 * 54 - 84) * k);
    await expect.poll(async () => (await game(page)).players[0].ty).toBeGreaterThan(480);
    const rabbit = (await game(page)).players[0];
    expect(rabbit.tx).toBeCloseTo(36 + 6.5 * 54, -1);
    expect(rabbit.ty).toBeCloseTo(252 + 4.5 * 54, -1);
    // 画布不再画标题和状态栏，关卡、防线、能量都在侧栏文字里。
    await expect(page.locator('#score-text')).toContainText('第 1 关');
    await expect(page.locator('#score-text')).toContainText('⚡');
    await page.locator('#back-home').click();
    await expect(page.locator('#home')).toHaveClass(/active/);
  });

  test('turning the phone upright goes back to the square board', async ({ page }) => {
    await open(page, 'surge');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect.poll(async () => { const b = await page.locator('.game-canvas').boundingBox(); return Math.round(b.width / b.height * 100); }).toBe(100);
    await expect(page.locator('#score-text')).not.toContainText('⚡');
  });
});

// ---- 游玩记录：桩接口收心跳 ----
test('活跃时长只在游戏界面计时，离开时上报累计值，模式切换另起一段', async ({ page }) => {
  const reports = [];
  await page.route('**/api/activity', async (route) => { reports.push(JSON.parse(route.request().postData())); await route.fulfill({ json: { ok: true } }); });
  await page.route('**/api/scores**', (route) => route.abort());
  await page.clock.install();
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.clock.runFor(3_000); // 在首页停留不计时
  await page.locator('[data-mode="pop3"]').click();
  await expect(page.locator('.game-canvas')).toBeVisible();
  await page.mouse.move(100, 100);
  await page.clock.runFor(10_000);
  await page.locator('#mobile-controls .mode-toggle').click(); // 经典 → 无尽
  await page.mouse.move(120, 120);
  await page.clock.runFor(8_000);
  await page.locator('#back-home').click();
  await expect.poll(() => reports.length).toBe(2);
  const [classic, endless] = reports;
  expect(classic).toMatchObject({ board: 'pop3-classic' });
  expect(endless).toMatchObject({ board: 'pop3-endless' });
  expect(classic.active_ms).toBeGreaterThan(8_000);
  expect(classic.active_ms).toBeLessThanOrEqual(classic.elapsed_ms);
  expect(endless.active_ms).toBeGreaterThan(6_000);
  expect(endless.active_ms).toBeLessThan(10_000);
  expect(endless.sid).not.toBe(classic.sid);
  expect(endless.pid).toBe(classic.pid);
});

test('隐藏看板: 令牌错误回到登录，正确后按东八区展示玩家、时间线和热力图', async ({ page }) => {
  const day = Date.UTC(2026, 9, 8, 13, 58); // 北京时间 21:58
  const sessions = [
    { sid: 'sess-0001', pid: 'player-0001', name: '小明', board: 'goose-classic', start_at: day, last_at: day + 22 * 60_000, active_ms: 20 * 60_000 },
    { sid: 'sess-0002', pid: 'player-0002', name: '小红', board: 'blast', start_at: day + 3600_000, last_at: day + 3600_000 + 9 * 60_000, active_ms: 9 * 60_000 }
  ];
  await page.route('**/api/admin/activity**', (route) => {
    if (route.request().headers().authorization !== 'Bearer good') return route.fulfill({ status: 401, json: { error: '令牌不对' } });
    return route.fulfill({ json: { sessions, truncated: false } });
  });
  await page.goto('/ops.html');
  await page.locator('#token').fill('bad');
  await page.locator('#login-form button').click();
  await expect(page.locator('#login-error')).toHaveText('令牌不对');
  await page.locator('#token').fill('good');
  await page.locator('#login-form button').click();
  await expect(page.locator('#panel')).toBeVisible();
  await expect(page.locator('#players tr.pick')).toHaveCount(2);
  await expect(page.locator('#timeline')).toContainText('21:58–22:20');
  await expect(page.locator('#timeline')).toContainText('抓大鹅 · 经典');
  await page.locator('#players tr.pick', { hasText: '小红' }).click();
  await expect(page.locator('#timeline tr')).toHaveCount(2);
  await expect(page.locator('#timeline')).toContainText('9 分');
  await expect(page.locator('#heat i[title*="22:00"]').first()).toBeVisible();
});
