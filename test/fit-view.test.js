import test from 'node:test';
import assert from 'node:assert/strict';
import { placeRegions } from '../fit-view.js';

// 麻将连连看的样子：上面一条信息栏，中间牌桌（比整张画布小得多），没有下栏；羊了个羊再多一条下栏。
const MAHJONG = [{ x: 0, y: 0, w: 360, h: 94, role: 'top' }, { x: 50, y: 190, w: 260, h: 360, role: 'main' }];
const SHEEP = [{ x: 0, y: 0, w: 360, h: 38, role: 'top' }, { x: 60, y: 90, w: 240, h: 260, role: 'main' }, { x: 0, y: 446, w: 360, h: 194, role: 'bottom' }];
const box = (p) => ({ x: p.x, y: p.y, r: p.x + p.src.w * p.s, b: p.y + p.src.h * p.s });
const inside = (p, cw, ch) => { const b = box(p); return b.x >= -0.5 && b.y >= -0.5 && b.r <= cw + 0.5 && b.b <= ch + 0.5; };
const overlap = (a, b) => { const p = box(a), q = box(b); return p.x < q.r - 0.5 && q.x < p.r - 0.5 && p.y < q.b - 0.5 && q.y < p.b - 0.5; };
const role = (out, name) => out.filter((p) => p.src.role === name);

for (const [name, regions] of [['mahjong', MAHJONG], ['sheep', SHEEP]]) {
  test(`${name}: portrait keeps bars at their size and blows the play area up`, () => {
    const cw = 390, ch = 602, out = placeRegions(regions, cw, ch);
    assert.equal(out.length, regions.length);
    for (const p of out) assert.ok(inside(p, cw, ch), `${p.src.role} 在可用区域内`);
    for (let i = 0; i < out.length; i += 1) for (let j = i + 1; j < out.length; j += 1) assert.ok(!overlap(out[i], out[j]), '各块不重叠');
    for (const bar of out.filter((p) => p.src.role !== 'main')) assert.ok(bar.s <= 0.9, '信息栏不放大');
    const [main] = role(out, 'main');
    // 整张 360×640 画布等比放进来时的倍数：游戏区要明显比它大
    assert.ok(main.s > Math.min(cw / 360, ch / 640) * 1.2, `游戏区放大了（${main.s.toFixed(2)}）`);
    // 上栏在游戏区上面，下栏在下面
    for (const top of role(out, 'top')) assert.ok(box(top).b <= main.y + 0.5);
    for (const bottom of role(out, 'bottom')) assert.ok(bottom.y >= box(main).b - 0.5);
  });

  test(`${name}: landscape puts the play area on the left at full height and the bars in one column on the right`, () => {
    const cw = 658, ch = 374, out = placeRegions(regions, cw, ch);
    for (const p of out) assert.ok(inside(p, cw, ch), `${p.src.role} 在可用区域内`);
    for (let i = 0; i < out.length; i += 1) for (let j = i + 1; j < out.length; j += 1) assert.ok(!overlap(out[i], out[j]), '各块不重叠');
    const [main] = role(out, 'main'), bars = out.filter((p) => p !== main);
    assert.ok(Math.abs(main.src.h * main.s - ch) < 1, '游戏区占满高度');
    for (const bar of bars) {
      assert.ok(bar.x >= box(main).r, '信息栏在游戏区右边');
      assert.ok(bar.s >= 0.72 && bar.s <= 0.9, '信息栏的字还看得清');
    }
  });
}

test('a bar can be sent to the left in landscape', () => {
  const out = placeRegions([{ x: 0, y: 0, w: 100, h: 60, role: 'top', land: 'left' }, { x: 0, y: 60, w: 200, h: 300, role: 'main' }], 700, 360);
  const [bar] = role(out, 'top'), [main] = role(out, 'main');
  assert.ok(box(bar).r <= main.x + 0.5);
});

test('a wide play area is limited by the width and stays centred', () => {
  const out = placeRegions([{ x: 0, y: 0, w: 360, h: 40, role: 'top' }, { x: 0, y: 40, w: 360, h: 200, role: 'main' }], 390, 700);
  const [main] = role(out, 'main');
  assert.ok(Math.abs(main.src.w * main.s - 390) < 1);
  assert.ok(main.y > 40, '竖向居中在上栏下面');
});
