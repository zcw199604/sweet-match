import { test, expect } from '@playwright/test';

// 页面没有身份时会被登录弹窗盖住，所以默认每个用例都先带着一个已登录的身份。
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('pao-pw', 'e2eTestPass1'); localStorage.setItem('pao-name', '测试员');
  });
});

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

test('home page fits narrow screens and exposes ten arcade cards', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.arcade-card')).toHaveCount(10);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});

test('each game shows its whole board and controls without scrolling', async ({ page }) => {
  for (const mode of ['pop2', 'pop3', 'surge', 'blast', 'park', 'pour', 'g2048', 'sudoku']) {
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
  await expect(page.locator('#score-text')).toContainText('第 1/50 关');
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
  await expect(page.locator('.qh-fig svg.qa')).toHaveCount(4);
  await expect(page.locator('.qe-glyph svg.qa')).toHaveCount(1);
  const fit = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const board = rect('.quest-board'), last = [...document.querySelectorAll('#mobile-controls button')].at(-1).getBoundingClientRect(), enemy = rect('.qe');
    return { wide: document.documentElement.scrollWidth <= window.innerWidth + 1, board: board.bottom <= window.innerHeight && board.top >= 0, enemy: enemy.top >= 0, controls: last.bottom <= window.innerHeight, size: board.width };
  });
  expect(fit).toMatchObject({ wide: true, board: true, enemy: true, controls: true });
  expect(fit.size).toBeGreaterThan(240);
});

test('三消勇者团: every hero and monster has a drawn figure that parses', async ({ page }) => {
  await page.goto('/');
  const art = await page.evaluate(async () => {
    const { heroSprite, foeSprite, FOE_IDS } = await import('/quest-art.js');
    return { heroes: [0, 1, 2, 3].map((i) => heroSprite(i)?.tagName), foes: FOE_IDS.map((id) => foeSprite(id)?.tagName), ids: FOE_IDS };
  });
  expect(art.heroes).toEqual(['svg', 'svg', 'svg', 'svg']);
  expect(art.foes).toEqual(art.ids.map(() => 'svg'));
  expect([...art.ids].sort()).toEqual(['assassin', 'bat', 'drake', 'fire', 'gargoyle', 'goblin', 'golem', 'infernal', 'knight', 'lich', 'mushroom', 'ogre', 'skeleton', 'slime', 'spider', 'spiderqueen', 'wolf', 'wraith']);
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

test('三消勇者团: each hero\'s action animation plays through and hands the turn back', async ({ page }) => {
  test.setTimeout(45_000);
  await openQuest(page);
  for (const type of [0, 1, 2, 3]) {
    await page.locator('#restart-game').click();
    // A swap whose first step makes this hero act; the slime is kept alive so the enemy answers.
    const move = await page.evaluate(async (type) => {
      const { validSwaps, swapTiles, resolveStep } = await import('/quest-core.js');
      const { state } = window.__arcade.quest;
      state.enemies[0].hp = state.enemies[0].maxHp = 9999;
      for (const swap of validSwaps(state.board)) {
        const copy = structuredClone(state);
        swapTiles(copy, ...swap.a, ...swap.b);
        if (resolveStep(copy).groups.some((group) => group.type === type)) return swap;
      }
      return null;
    }, type);
    if (!move) continue;
    await page.locator(`.qt[data-r="${move.a[0]}"][data-c="${move.a[1]}"]`).click();
    await page.locator(`.qt[data-r="${move.b[0]}"][data-c="${move.b[1]}"]`).click();
    await expect.poll(async () => { const s = await quest(page); return s.phase === 'player' && (s.turns >= 1 || s.bonus); }, { timeout: 9000 }).toBe(true);
  }
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
    state.bonus = true; // a 4-in-a-row would otherwise grant an extra move and the enemy would not act
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
  await expect(page.locator('#score-text')).toContainText('第 2/50 关');
  await expect(page.locator('.qe-name')).toHaveText(['史莱姆', '洞穴蝠']);
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
  // 改昵称：点「保存」后本机立刻生效，并 POST /api/player 让服务端同步所有榜单。
  const renames = [];
  await page.route('**/api/player', async (route) => { renames.push(route.request().postDataJSON()); await route.fulfill({ json: { name: '新昵称', boards: 3 } }); });
  await page.locator('#board-name').fill('新昵称');
  await page.locator('#board-rename').click();
  await expect(page.locator('#board-me-hint')).toHaveText('已同步到所有榜单');
  expect(await page.evaluate(() => localStorage.getItem('pao-name'))).toBe('新昵称');
  expect(renames).toHaveLength(1);
  expect(renames[0]).toMatchObject({ name: '新昵称' });
  expect(renames[0].pid).toMatch(/^[0-9a-f]{64}$/);
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
  await page.clock.runFor(10_000);
  await page.locator('#mobile-controls .mode-toggle').click(); // 经典 → 无尽
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

// 挪车接客 is one canvas; its live state is on window.__arcade.park, which can also say where a car is on the page.
const park = (page) => page.evaluate(() => { const { state, busy } = window.__arcade.park; return { stage: state.stage, moves: state.moves, queue: state.queue.length, boarded: state.boarded, busy, score: state.score }; });
async function openPark(page) {
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator('[data-mode="park"]').click();
  await page.waitForFunction(() => window.__arcade.park);
  await expect(page.locator('#score-text')).toContainText('第 1/30 关');
}
// Click the car `pick` names (run in the page, which can see the state), then wait for the move to finish.
async function clickCar(page, pick) {
  const spot = await page.evaluate(async (source) => {
    const core = await import('/park-core.js');
    const { state, locate } = window.__arcade.park;
    const id = new Function('core', 'state', `return (${source})(core, state)`)(core, state);
    return id === null ? null : { id, ...locate(id) };
  }, pick.toString());
  if (!spot) return null;
  await page.mouse.click(spot.x, spot.y);
  return spot.id;
}
const settled = (page) => page.waitForFunction(() => !window.__arcade.park.busy);

test('挪车接客: tapping a free car parks it and the front passenger boards; a blocked car stays put', async ({ page }) => {
  await openPark(page);
  // A blocked car first: nothing moves, nothing is spent.
  const blocked = await clickCar(page, (core, state) => state.cars.find((car) => !core.canExit(state, car.id))?.id ?? null);
  if (blocked !== null) expect((await park(page)).moves).toBe(0);
  // Then a free car that the front of the queue wants.
  const id = await clickCar(page, (core, state) => core.exitable(state).find((i) => state.cars[i].color === state.queue[0]) ?? core.exitable(state)[0]);
  expect(id).not.toBeNull();
  await expect.poll(async () => (await park(page)).moves).toBe(1);
  await settled(page);
  const after = await park(page);
  // The car is in a bay or has already left full; either way the score line has caught up with the core.
  expect(await page.evaluate((i) => window.__arcade.park.state.cars[i].status, id)).toMatch(/^(slot|gone)$/);
  await expect(page.locator('#score-text')).toContainText(`${after.score} 分`);
});

test('挪车接客: following the hints clears stage 1, submits the score, and 下一关 deals stage 2', async ({ page }) => {
  test.setTimeout(60_000);
  const posts = await stubScores(page);
  await openPark(page);
  await page.locator('#park-hint').click(); // lights a car up; nothing else changes
  expect((await park(page)).moves).toBe(0);
  for (let guard = 0; guard < 40 && await page.locator('.park-overlay').isHidden(); guard += 1) {
    await clickCar(page, (core, state) => core.findHint(state));
    await settled(page);
  }
  await expect(page.locator('.park-card strong')).toHaveText('第 1 关完成');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].board).toBe('park');
  expect(posts[0].value).toBeGreaterThan(100);
  await expect(page.locator('.park-note')).toContainText('全球第 3 名');
  await page.locator('.park-again').click();
  await expect(page.locator('.park-overlay')).toBeHidden();
  await expect(page.locator('#score-text')).toContainText('第 2/30 关');
  await page.locator('#back-home').click();
  expect(await page.evaluate(() => window.__arcade.park)).toBe(null);
});

test('挪车接客: a dead end shows 停车场堵死了, and 重试本关 deals the same cars again', async ({ page }) => {
  await openPark(page);
  const layout = await page.evaluate(() => JSON.stringify(window.__arcade.park.state.cars.map((car) => [car.r, car.c, car.dir, car.color])));
  // Fill four bays by hand, then park a car nobody is waiting for in the fifth.
  await page.evaluate(async () => {
    const { sendCar, exitable } = await import('/park-core.js');
    const { state } = window.__arcade.park;
    state.queue.unshift(7); // a colour no car has, at the front
    for (let i = 0; i < 4; i += 1) sendCar(state, exitable(state)[0]);
  });
  await clickCar(page, (core, state) => core.exitable(state)[0] ?? null);
  await expect(page.locator('.park-card strong')).toHaveText('停车场堵死了', { timeout: 10_000 });
  await page.locator('.park-again').click();
  await expect(page.locator('.park-overlay')).toBeHidden();
  expect(await page.evaluate(() => JSON.stringify(window.__arcade.park.state.cars.map((car) => [car.r, car.c, car.dir, car.color])))).toBe(layout);
  expect((await park(page)).moves).toBe(0);
});

// 倒水排序 is one canvas; its live state is on window.__arcade.pour, which can also say where a tube is on the page.
const pourState = (page) => page.evaluate(() => { const { state, busy, selected } = window.__arcade.pour; return { stage: state.stage, moves: state.moves, par: state.par, busy, selected, undo: state.left.undo, add: state.left.add, tubes: state.tubes.length, shelf: state.collected.length }; });
async function openPour(page) {
  await page.goto('/');
  await page.locator('body[data-ready]').waitFor();
  await page.locator('[data-mode="pour"]').click();
  await page.waitForFunction(() => window.__arcade.pour);
}
async function clickTube(page, i) {
  const spot = await page.evaluate((index) => window.__arcade.pour.locate(index), i);
  await page.mouse.click(spot.x, spot.y);
}
// The props are drawn into the canvas: 回退 0, 空瓶 1, 打乱 2, 提示 3, 重来 4 (see BUTTONS in pour.js).
async function clickProp(page, k) {
  const box = await page.locator('.game-canvas').boundingBox();
  const scale = box.width / 360;
  const left = (360 - (5 * 60 + 4 * 8)) / 2 + k * 68;
  await page.mouse.click(box.x + (left + 30) * scale, box.y + (548 + 6 + 28) * scale);
}
// Play the solver's answer for the current stage with real taps, waiting out each pour.
async function playSolution(page) {
  const moves = await page.evaluate(async () => {
    const { solve } = await import('/pour-core.js');
    const { state } = window.__arcade.pour;
    return solve(state.tubes).moves;
  });
  for (const move of moves) {
    await clickTube(page, move.from);
    await clickTube(page, move.to);
    await page.waitForFunction(() => !window.__arcade.pour.busy);
  }
  return moves.length;
}

test('倒水排序: a tap lifts a tube, a second tap pours it, and a wrong target just moves the choice', async ({ page }) => {
  await openPour(page);
  await expect(page.locator('#score-text')).toContainText('第 1/50 关');
  const first = await page.evaluate(() => {
    const { tubes } = window.__arcade.pour.state;
    const color = tubes[0][tubes[0].length - 1];
    return { from: 0, wrong: tubes.findIndex((t, i) => i > 0 && t.length && t[t.length - 1] !== color), empty: tubes.findIndex((t) => !t.length) };
  });
  await clickTube(page, first.from);
  expect((await pourState(page)).selected).toBe(first.from);
  await clickTube(page, first.from); // the same tube again puts it back
  expect((await pourState(page)).selected).toBeNull();
  await clickTube(page, first.from);
  await clickTube(page, first.wrong); // a different colour on top: the choice moves, nothing is poured
  expect(await pourState(page)).toMatchObject({ selected: first.wrong, moves: 0 });
  await clickTube(page, first.empty);
  await expect.poll(async () => (await pourState(page)).moves).toBe(1);
  await page.waitForFunction(() => !window.__arcade.pour.busy);
  await expect(page.locator('#score-text')).toContainText('1/');
});

test('倒水排序: the prop buttons work, and 回退 gives the pour back', async ({ page }) => {
  await openPour(page);
  const first = await page.evaluate(() => {
    const { tubes } = window.__arcade.pour.state;
    return { from: tubes.findIndex((t) => t.length), empty: tubes.findIndex((t) => !t.length) };
  });
  await clickTube(page, first.from);
  await clickTube(page, first.empty);
  await page.waitForFunction(() => !window.__arcade.pour.busy);
  expect((await pourState(page)).moves).toBe(1);
  await clickProp(page, 0);
  expect(await pourState(page)).toMatchObject({ moves: 0, undo: 2 });
  const tubes = (await pourState(page)).tubes;
  await clickProp(page, 1);
  expect(await pourState(page)).toMatchObject({ tubes: tubes + 1, add: 0 });
  await clickProp(page, 3); // a hint lights two tubes and changes nothing
  expect((await pourState(page)).moves).toBe(0);
});

test('倒水排序: solving stage 1 with taps submits the score, and the next visit resumes at stage 2', async ({ page }) => {
  test.setTimeout(60_000);
  const posts = await stubScores(page);
  await openPour(page);
  const steps = await playSolution(page);
  await expect(page.locator('.pour-card strong')).toHaveText('第 1 关完成');
  await expect(page.locator('.pour-card')).toContainText(`${steps} 步（最少 ${steps} 步）`);
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].board).toBe('pour');
  expect(posts[0].value).toBe(await page.evaluate(() => window.__arcade.pour.state.collected.length * 10 + 300));
  await expect(page.locator('.pour-note')).toContainText('全球第 3 名');
  await page.locator('.pour-again').click();
  await expect(page.locator('#score-text')).toContainText('第 2/50 关');
  // progress is kept on this device: leave and come back
  await page.locator('#back-home').click();
  await page.locator('.arcade-card[data-mode="pour"]').click();
  await page.waitForFunction(() => window.__arcade.pour);
  await expect(page.locator('#score-text')).toContainText('第 2/50 关');
  await page.locator('#restart-game').click(); // 重新开始 means a new run
  await expect(page.locator('#score-text')).toContainText('第 1/50 关 · 0 分');
});

// 2048 is one canvas; its live state is on window.__arcade.g2048, and `load` sets a hand-made board.
const tilesOf = (page) => page.evaluate(() => window.__arcade.g2048.state.tiles.map(({ r, c, v }) => ({ r, c, v })));
async function openG2048(page, tiles) {
  await open(page, 'g2048');
  await page.waitForFunction(() => window.__arcade.g2048);
  await page.evaluate((t) => window.__arcade.g2048.load(t), tiles);
}
async function swipe(page, dx, dy) {
  const box = await page.locator('.game-canvas').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height * 0.45;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
}

test('2048: a swipe slides the tiles and merges equal ones, and the game is kept when you leave', async ({ page }) => {
  await openG2048(page, [{ r: 0, c: 0, v: 2 }, { r: 0, c: 3, v: 2 }, { r: 3, c: 3, v: 8 }]);
  await swipe(page, -90, 0);
  await expect.poll(async () => (await tilesOf(page)).find((t) => t.r === 0 && t.c === 0)?.v).toBe(4);
  expect(await page.evaluate(() => window.__arcade.g2048.state.score)).toBe(4);
  expect(await tilesOf(page)).toHaveLength(3); // the 4, the 8 and the new tile
  await expect(page.locator('#score-text')).toContainText('4 分');
  await page.locator('#back-home').click();
  await page.locator('.arcade-card[data-mode="g2048"]').click();
  await page.waitForFunction(() => window.__arcade.g2048);
  expect(await page.evaluate(() => window.__arcade.g2048.state.score)).toBe(4);
});

test('2048: a swipe that moves nothing is ignored, and undo takes a move back', async ({ page }) => {
  await openG2048(page, [{ r: 0, c: 0, v: 2 }, { r: 0, c: 1, v: 4 }]);
  await swipe(page, -90, 0); // already against the left wall
  expect(await page.evaluate(() => window.__arcade.g2048.state.moves)).toBe(0);
  await swipe(page, 0, 90);
  await expect.poll(() => page.evaluate(() => window.__arcade.g2048.state.moves)).toBe(1);
  const box = await page.locator('.game-canvas').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * (502 / 540)); // the 撤销 button
  await expect.poll(() => page.evaluate(() => window.__arcade.g2048.state.moves)).toBe(0);
  expect(await page.evaluate(() => window.__arcade.g2048.state.undosLeft)).toBe(2);
});

test('2048: a game with no moves left ends, posts its score, and 再来一局 starts over', async ({ page }) => {
  const posts = await stubScores(page);
  // One merge (16 + 16) is the only move; whatever then spawns in the gap cannot merge.
  const rows = [[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 8], [4, 2, 16, 16]];
  await openG2048(page, rows.flatMap((row, r) => row.map((v, c) => ({ r, c, v }))));
  await swipe(page, -90, 0);
  await expect(page.locator('.g2048-card strong')).toHaveText('没有可走的步了');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0]).toMatchObject({ board: 'g2048', value: 32 });
  await expect(page.locator('.g2048-note')).toContainText('全球第 3 名');
  await page.locator('.g2048-again').click();
  await expect.poll(() => page.evaluate(() => window.__arcade.g2048.state.score)).toBe(0);
  expect(await tilesOf(page)).toHaveLength(2);
});

test('2048: making 2048 offers to go on, and the board keeps playing', async ({ page }) => {
  await openG2048(page, [{ r: 0, c: 0, v: 1024 }, { r: 0, c: 1, v: 1024 }]);
  await swipe(page, -90, 0);
  await expect(page.locator('.g2048-card strong')).toHaveText('合出 2048！');
  await page.locator('.g2048-again').first().click(); // 继续挑战
  await expect(page.locator('.g2048-overlay')).toBeHidden();
  await swipe(page, 0, 90);
  await expect.poll(() => page.evaluate(() => window.__arcade.g2048.state.moves)).toBe(2);
});

// 数独: a puzzle that is the answer with one cell blanked, so a whole game is a couple of taps.
const sudokuState = (page) => page.evaluate(() => {
  const { state, selected } = window.__arcade.sudoku;
  return { status: state.status, mistakes: state.mistakes, hints: state.hints, diff: state.diff, selected, empty: state.cells.filter((d) => d === 0).length };
});
async function openSudoku(page, blanks = [0]) {
  await open(page, 'sudoku');
  await page.waitForFunction(() => window.__arcade.sudoku);
  return page.evaluate(async (cells) => {
    const { generate } = await import('/sudoku-core.js');
    const { solution } = generate('easy');
    const puzzle = [...solution].map((d, i) => (cells.includes(i) ? '0' : d)).join('');
    window.__arcade.sudoku.load({ puzzle, solution });
    return solution;
  }, blanks);
}
async function tapCell(page, i) {
  const spot = await page.evaluate((index) => window.__arcade.sudoku.locate('cell', index), i);
  await page.mouse.click(spot.x, spot.y);
}
async function tapDigit(page, d) {
  const spot = await page.evaluate((digit) => window.__arcade.sudoku.locate('pad', digit), d);
  await page.mouse.click(spot.x, spot.y);
}
const tapTool = async (page, id) => {
  const spot = await page.evaluate((tool) => window.__arcade.sudoku.locate('tool', tool), id);
  await page.mouse.click(spot.x, spot.y);
};

test('数独: the right digit solves the puzzle and posts the time to the level\'s board', async ({ page }) => {
  const posts = await stubScores(page);
  const solution = await openSudoku(page, [40]);
  await tapCell(page, 40);
  expect((await sudokuState(page)).selected).toBe(40);
  await tapDigit(page, Number(solution[40]));
  await expect(page.locator('.sudoku-card strong')).toHaveText('解出来了！');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].board).toBe('sudoku-normal');
  expect(Number.isInteger(posts[0].value)).toBe(true);
  await expect(page.locator('.sudoku-note')).toContainText('全球第 3 名');
  await page.locator('.sudoku-again').click(); // 下一题
  await expect(page.locator('.sudoku-overlay')).toBeHidden();
  expect((await sudokuState(page)).empty).toBeGreaterThan(20);
});

test('数独: a wrong digit costs a try, three lose the game, and 重试本题 starts the same puzzle again', async ({ page }) => {
  const solution = await openSudoku(page, [0, 1, 2]);
  for (const i of [0, 1, 2]) {
    await tapCell(page, i);
    await tapDigit(page, Number(solution[i]) === 1 ? 2 : 1);
  }
  await expect(page.locator('.sudoku-card strong')).toHaveText('错了 3 次');
  await page.locator('.sudoku-again').first().click();
  expect(await sudokuState(page)).toMatchObject({ status: 'playing', mistakes: 0, empty: 3 });
});

test('数独: a hint solves a cell but takes the game off the board; notes and erase work', async ({ page }) => {
  const posts = await stubScores(page);
  const solution = await openSudoku(page, [10, 11]);
  await tapCell(page, 10);
  await tapTool(page, 'note');
  await tapDigit(page, 4);
  await tapDigit(page, 6);
  expect(await page.evaluate(() => window.__arcade.sudoku.state.notes[10])).toBe((1 << 4) | (1 << 6));
  await tapTool(page, 'erase');
  expect(await page.evaluate(() => window.__arcade.sudoku.state.notes[10])).toBe(0);
  await tapTool(page, 'note'); // notes off again
  await tapCell(page, 11);
  await tapTool(page, 'hint');
  expect(await page.evaluate(() => window.__arcade.sudoku.state.cells[11])).toBe(Number(solution[11]));
  await tapCell(page, 10);
  await tapDigit(page, Number(solution[10]));
  await expect(page.locator('.sudoku-card')).toContainText('用了提示的局不计入榜单');
  await page.waitForTimeout(300);
  expect(posts).toHaveLength(0);
});

test('数独: switching level opens that level\'s own puzzle and is remembered', async ({ page }) => {
  await open(page, 'sudoku');
  await page.waitForFunction(() => window.__arcade.sudoku);
  expect((await sudokuState(page)).diff).toBe('normal');
  await expect(page.locator('#sudoku-level')).toHaveText('普通 · 切换困难');
  await page.locator('#sudoku-level').click();
  await expect(page.locator('#sudoku-level')).toHaveText('困难 · 切换简单');
  expect((await sudokuState(page)).diff).toBe('hard');
  expect(await page.evaluate(() => localStorage.getItem('pao-sudoku-level'))).toBe('hard');
  // the unfinished puzzle of a level is waiting when you come back to it
  const hardPuzzle = await page.evaluate(() => window.__arcade.sudoku.state.puzzle);
  await page.locator('#sudoku-level').click();
  await page.locator('#sudoku-level').click();
  await page.locator('#sudoku-level').click();
  expect(await page.evaluate(() => window.__arcade.sudoku.state.puzzle)).toBe(hardPuzzle);
});
