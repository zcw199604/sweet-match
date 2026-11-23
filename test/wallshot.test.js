import test from 'node:test';
import assert from 'node:assert/strict';
import { DAMAGE, MAPS, RULES, SPEED, WALL, act, bodyParts, createBot, createMatch, exposedParts, hitPart, hiderOf, markReady, moveHider, nextTimer, shoot, tick, viewFor } from '../wallshot-core.js';

const started = (opts = { mapIndex: 0, first: 0 }, now = 0) => {
  const s = createMatch(42, opts);
  markReady(s, 0, now);
  markReady(s, 1, now);
  return s;
};
const toAim = (s, now = RULES.HIDE_MS) => { tick(s, now); return now; };

test('双方准备好才开第一回合；躲藏 → 瞄准 → 揭晓 → 换边', () => {
  const s = createMatch(1, { mapIndex: 0, first: 1 });
  assert.equal(s.phase, 'ready');
  assert.equal(nextTimer(s, 0), null);
  markReady(s, 0, 100);
  assert.equal(s.phase, 'ready');
  assert.equal(markReady(s, 0, 100), false, '重复准备不算');
  markReady(s, 1, 200);
  assert.equal(s.phase, 'hide');
  assert.equal(s.turn, 1);
  assert.equal(s.sniper, 1);
  assert.equal(nextTimer(s, 1200), RULES.HIDE_MS - 1000);
  tick(s, 200 + RULES.HIDE_MS);
  assert.equal(s.phase, 'aim');
  tick(s, 200 + RULES.HIDE_MS + RULES.AIM_MS);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.last.reason, 'timeout');
  tick(s, 200 + RULES.HIDE_MS + RULES.AIM_MS + RULES.REVEAL_MS);
  assert.equal(s.phase, 'hide');
  assert.equal(s.sniper, 0, '换边');
  assert.equal(s.turn, 2);
});

test('时间一下跳很远也能一口气追上', () => {
  const s = started();
  tick(s, (RULES.HIDE_MS + RULES.AIM_MS + RULES.REVEAL_MS) * 2 + 10);
  assert.equal(s.turn, 3);
  assert.equal(s.phase, 'hide');
});

test('命中判定：爆头、身体、四肢；趴下时头朝面向的一边', () => {
  const stand = { x: 100, pose: 'stand', face: 1 };
  assert.equal(hitPart(stand, 100, 106), 'head');
  assert.equal(hitPart(stand, 100, 70), 'body');
  assert.equal(hitPart(stand, 120, 70), 'limb');
  assert.equal(hitPart(stand, 95, 20), 'limb');
  assert.equal(hitPart(stand, 100, 140), null);
  assert.equal(hitPart({ x: 100, pose: 'crouch', face: 1 }, 100, 106), null, '蹲下躲过站姿的爆头线');
  assert.equal(hitPart({ x: 100, pose: 'prone', face: 1 }, 136, 13), 'head');
  assert.equal(hitPart({ x: 100, pose: 'prone', face: -1 }, 64, 13), 'head');
  assert.equal(hitPart({ x: 100, pose: 'prone', face: -1 }, 136, 13), 'limb', '朝左趴时右边是腿');
});

test('打身体扣 30 并换边，打四肢扣 10，爆头直接赢', () => {
  let s = started(), now = toAim(s);
  s.hider.x = 100; s.hider.pose = 'stand';
  const shot = shoot(s, 0, { x: 100, y: 70 }, now);
  assert.equal(shot.part, 'body');
  assert.equal(s.hp[1], RULES.HP - DAMAGE.body);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.last.reason, 'hit');
  assert.equal(s.walls[1].holes.length, 1, '打中也留洞');
  assert.equal(shoot(s, 0, { x: 100, y: 70 }, now), null, '回合结束后不能再开枪');

  s = started(); now = toAim(s);
  s.hider.x = 100;
  assert.equal(shoot(s, 0, { x: 120, y: 70 }, now).part, 'limb');
  assert.equal(s.hp[1], RULES.HP - DAMAGE.limb);

  s = started(); now = toAim(s);
  s.hider.x = 100;
  shoot(s, 0, { x: 100, y: 106 }, now);
  assert.equal(s.status, 'over');
  assert.equal(s.winner, 0);
  assert.equal(s.reason, 'head');
  assert.equal(nextTimer(s, now), null);
});

test('三枪都没中才换边；血打光也算赢', () => {
  const s = started(), now = toAim(s);
  s.hider.x = 300;
  for (const x of [20, 60, 100]) assert.equal(shoot(s, 0, { x, y: 70 }, now).part, null);
  assert.equal(s.bullets, 0);
  assert.equal(s.phase, 'reveal');
  assert.equal(s.last.reason, 'miss');
  assert.equal(s.walls[1].holes.length, 3);

  const t = started(), at = toAim(t);
  t.hp[1] = 25; t.hider.x = 100;
  shoot(t, 0, { x: 100, y: 70 }, at);
  assert.equal(t.status, 'over');
  assert.equal(t.reason, 'hp');
  assert.equal(t.hp[1], 0);
});

test('躲藏阶段不能开枪，狙击的人不能动躲的人，躲的人不能开枪', () => {
  const s = started();
  assert.equal(shoot(s, 0, { x: 100, y: 70 }, 10), null, '躲藏阶段');
  assert.equal(moveHider(s, 0, { x: 50 }, 10), false);
  const now = toAim(s);
  assert.equal(shoot(s, 1, { x: 100, y: 70 }, now), null);
  assert.equal(act(s, 0, { type: 'nope' }, now), false);
  assert.equal(act(s, 0, { type: 'shoot', x: 'a', y: 1 }, now), false);
});

test('移动按姿势限速，换姿势有冷却，不会走出墙', () => {
  const s = started();
  const h = s.hider;
  h.x = 100;
  const x0 = h.x;
  moveHider(s, 1, { x: x0 + 500 }, 1000);
  assert.ok(Math.abs(h.x - (x0 + SPEED.stand + RULES.SLACK)) < 0.2, `一秒最多走 ${SPEED.stand}（+容差）`);
  assert.equal(h.face, 1);
  moveHider(s, 1, { pose: 'prone' }, 1000);
  assert.equal(h.pose, 'prone');
  moveHider(s, 1, { pose: 'stand' }, 1100);
  assert.equal(h.pose, 'prone', '冷却中');
  const before = h.x;
  moveHider(s, 1, { x: 0 }, 2100);
  assert.ok(Math.abs(before - h.x - (SPEED.prone + RULES.SLACK)) < 0.2, '趴着爬得慢');
  assert.equal(h.face, -1);
  moveHider(s, 1, { pose: 'stand' }, 2100);
  for (let t = 3000; t < 9000; t += 500) moveHider(s, 1, { x: -999 }, t);
  assert.equal(h.x, RULES.EDGE);
});

test('打在钢板上不留洞也打不中；打穿窗口不留洞但能打中', () => {
  const site = MAPS.findIndex((m) => m.id === 'site'), map = MAPS[site];
  const s = started({ mapIndex: site, first: 0 }), now = toAim(s);
  const plate = map.steel[0];
  s.hider.x = plate.x + plate.w / 2; s.hider.pose = 'crouch';
  const shot = shoot(s, 0, { x: s.hider.x, y: 40 }, now);
  assert.equal(shot.steel, true);
  assert.equal(shot.part, null);
  assert.equal(s.walls[1].holes.length, 0);
  const win = map.windows[0];
  s.hider.x = win.x + win.w / 2; s.hider.pose = 'stand';
  const through = shoot(s, 0, { x: s.hider.x, y: win.y + 4 }, now);
  assert.equal(through.part, 'head');
  assert.equal(s.walls[1].holes.length, 0);
});

test('露出判定：洞或窗口后面的部位看得见', () => {
  const map = MAPS[0];
  const hider = { x: 100, pose: 'stand', face: 1 };
  assert.equal(exposedParts(hider, [], map).length, 0);
  assert.deepEqual(exposedParts(hider, [{ x: 100, y: 70, r: 8 }], map).map((p) => p.part), ['body']);
  assert.equal(exposedParts(hider, [{ x: 200, y: 70, r: 8 }], map).length, 0);
  const barn = MAPS.find((m) => m.id === 'barn');
  assert.ok(exposedParts({ x: barn.windows[0].x + 20, pose: 'stand', face: 1 }, [], barn).some((p) => p.part === 'head'), '站在窗下露头');
  assert.equal(exposedParts({ x: barn.windows[0].x + 20, pose: 'crouch', face: 1 }, [], barn).length, 0, '蹲下就看不见');
});

test('视图按座位裁剪：狙击的人看不见藏好的人，只知道准星的躲的人看不到高低', () => {
  const s = started(), now = toAim(s);
  s.hider.x = 100;
  let sniper = viewFor(s, 0, now), hider = viewFor(s, 1, now);
  assert.equal(sniper.body, null);
  assert.deepEqual(Object.keys(hider.aim), ['x']);
  assert.equal(hider.body.x, 100);
  assert.equal(sniper.left, RULES.AIM_MS);
  shoot(s, 0, { x: 104, y: 75 }, now);   // 打中身体 → 揭晓
  sniper = viewFor(s, 0, now);
  assert.equal(sniper.body.x, 100, '揭晓时双方都看得见');
  assert.equal(JSON.stringify(viewFor(s, 0, now)).includes('rng'), false);

  const t = started(), at = toAim(t);
  t.hider.x = 100;
  t.walls[1].holes.push({ x: 100, y: 70, r: 8 });
  assert.equal(viewFor(t, 0, at).body.x, 100, '透过洞看得见');
});

test('20 回合打完按血量定胜负，血一样是平局', () => {
  const s = started();
  s.turn = RULES.TURNS;
  s.hp = [70, 90];
  tick(s, RULES.HIDE_MS + RULES.AIM_MS + RULES.REVEAL_MS);
  assert.equal(s.status, 'over');
  assert.equal(s.winner, 1);
  assert.equal(s.reason, 'turns');
  const t = started();
  t.turn = RULES.TURNS;
  tick(t, RULES.HIDE_MS + RULES.AIM_MS + RULES.REVEAL_MS);
  assert.equal(t.winner, null);
  assert.equal(t.reason, 'draw');
});

test('每张地图开局的位置都藏得住（不从窗口、小洞露出来）', () => {
  MAPS.forEach((map, mapIndex) => {
    const s = createMatch(1, { mapIndex });
    for (const spot of s.spots) assert.equal(exposedParts(spot, s.walls[0].holes, map).length, 0, map.id);
  });
});

test('同一个种子开出同一局；地图和先手都按种子定', () => {
  assert.deepEqual(createMatch(9), createMatch(9));
  const maps = new Set(), firsts = new Set();
  for (let seed = 1; seed < 60; seed += 1) { const s = createMatch(seed); maps.add(s.map); firsts.add(s.sniper); }
  assert.equal(maps.size, MAPS.length);
  assert.equal(firsts.size, 2);
  assert.equal(bodyParts({ x: 10, pose: 'nope' }).length, 6, '未知姿势当站着');
});

// 两个电脑对打整局：一定会结束，而且难的电脑赢得多。
function botMatch(seed, levels) {
  const s = createMatch(seed);
  const bots = [createBot(levels[0], seed * 3 + 1), createBot(levels[1], seed * 5 + 2)];
  let now = 0;
  for (let i = 0; i < 40000 && s.status === 'playing'; i += 1) {
    now += 50;
    tick(s, now);
    for (const seat of [0, 1]) for (const a of bots[seat].step(s, seat, now)) act(s, seat, a, now);
  }
  return s;
}
test('电脑对电脑：整局一定会结束，困难的电脑比简单的赢得多', () => {
  let hardWins = 0, total = 0, turns = 0;
  for (let seed = 1; seed <= 40; seed += 1) {
    const levels = seed % 2 ? ['hard', 'easy'] : ['easy', 'hard'];
    const s = botMatch(seed, levels);
    assert.equal(s.status, 'over', `第 ${seed} 局没打完`);
    total += 1;
    turns += s.turn;
    if (s.winner !== null && levels[s.winner] === 'hard') hardWins += 1;
  }
  assert.ok(hardWins / total > 0.6, `困难只赢了 ${hardWins}/${total}`);
  assert.ok(turns / total > 2, `平均 ${turns / total} 回合，太快了`);
});

test('电脑躲的时候会动，狙的时候会把三枪打完', () => {
  const s = started({ mapIndex: 0, first: 0 });
  const bot = createBot('normal', 3);
  const x0 = s.hider.x;
  let now = 0, moved = false;
  for (; now < RULES.HIDE_MS + RULES.AIM_MS && s.phase !== 'reveal'; now += 50) {
    tick(s, now);
    for (const a of bot.step(s, 1, now)) act(s, 1, a, now);
    if (Math.abs(s.hider.x - x0) > 5) moved = true;
  }
  assert.ok(moved);
  const t = started({ mapIndex: 0, first: 0 });
  const sniper = createBot('normal', 4);
  t.hider.x = WALL.W - RULES.EDGE;
  for (now = 0; now < RULES.HIDE_MS + RULES.AIM_MS - 50 && t.phase !== 'reveal'; now += 50) {
    tick(t, now);
    for (const a of sniper.step(t, 0, now)) act(t, 0, a, now);
  }
  assert.ok(t.shots.length >= 1, '至少开了一枪');
  assert.equal(hiderOf(t), 1);
});
