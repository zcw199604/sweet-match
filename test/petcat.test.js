import test from 'node:test';
import assert from 'node:assert/strict';
import { COATS, COAT_IDS, ROOM, atlasEntry, buildNapFactor, clamp, coatName, computeView, missingSprites, pointerToStage } from '../petcat/petcat-core.js';
import { ATLAS } from '../petcat/atlas.js';

test('毛色表：13 种，id 唯一，saba 是合成的没有贴图', () => {
  assert.equal(COATS.length, 13);
  assert.equal(new Set(COAT_IDS).size, 13);
  assert.ok(COAT_IDS.includes('saba'));
  assert.equal(atlasEntry(ATLAS, 'saba'), null);
  assert.equal(atlasEntry(ATLAS, 'saba-tail'), null);
  assert.equal(coatName('kuro'), '黑猫');
  assert.equal(coatName('norwegian'), '挪威森林猫');
  assert.equal(coatName('norwegian', 'jp'), 'ノルウェージャン・フォレスト・キャット');
  assert.equal(coatName('不存在'), '不存在');
});

test('精灵目录：27 张齐全，每条都是八元组且落在自己的画布里', () => {
  assert.deepEqual(missingSprites(ATLAS), []);
  assert.equal(Object.keys(ATLAS).length, 27);
  // 猫本体和房间是 1517×935 的横画布，尾巴是 684×200 的长条，手是 1024×1536 的竖画布
  const sheet = (name) => (name.endsWith('-tail') ? [684, 200] : name.endsWith('-slim') ? [1024, 1536] : [ROOM.width, ROOM.height]);
  for (const [name, entry] of Object.entries(ATLAS)) {
    assert.equal(atlasEntry(ATLAS, name).length, 8, name);
    const [offset, count, x, y, w, h, W, H] = entry;
    assert.ok(offset >= 0 && count > 0, name);
    assert.deepEqual([W, H], sheet(name), name);
    // 裁剪块要落在画布内
    assert.ok(x >= 0 && y >= 0 && x + w <= W && y + h <= H, name);
  }
});

test('缺精灵时能指出缺哪几个', () => {
  assert.deepEqual(missingSprites({}, ['kuro']), ['kuro', 'kuro-tail', 'room', 'hand-slim', 'grip-slim']);
  assert.deepEqual(missingSprites({}, ['saba']), ['room', 'hand-slim', 'grip-slim']);
});

test('毛发法线表：上下两半各 256 项，顺毛从正到负、逆毛反过来', () => {
  const table = buildNapFactor();
  assert.equal(table.length, 512);
  // i=0 → fibre=-1：顺毛 +，逆毛 -
  assert.equal(table[0], -6.885 + 3.06 - 8.16);
  assert.equal(table[256], -6.885 - 3.06 + 8.16 - 0);
  // i=255 → fibre≈+1
  assert.ok(Math.abs(table[255] - (-6.885 + 3.06 + 8.16 * (255 / 127.5 - 1))) < 1e-9);
  // 两半在 fibre≈-0.375（i≈80）处交叉：左边顺毛更亮，右边逆毛更暗
  for (const i of [0, 32, 64]) assert.ok(table[256 + i] > table[i], `i=${i}`);
  for (const i of [96, 128, 200, 255]) assert.ok(table[256 + i] < table[i], `i=${i}`);
  // 顺毛那一半随 fibre 单调递增
  for (let i = 1; i < 256; i++) assert.ok(table[i] > table[i - 1]);
});

test('布局换算：16:10 舞台把 1517×935 的房间铺满并居中，猫按比例跟着走', () => {
  const view = computeView({ width: 1517, height: 935, dpr: 1, catScale: 1, topCrop: 0 });
  assert.equal(view.roomW, 1517);
  assert.equal(view.roomH, 935);
  assert.equal(view.roomX, 0);
  assert.equal(view.roomY, 0);
  assert.equal(view.w, view.baseW);
  assert.equal(view.h, view.baseH);
  assert.ok(Math.abs(view.baseW - ROOM.width * ROOM.base) < 1e-9);
  assert.equal(view.kitten, false);
  assert.equal(view.touchLift, Math.min(62, 935 * 0.215) + 40);

  // 更宽的舞台按宽度放大，房间上下多出来的部分被 crop 掉
  const wide = computeView({ width: 2000, height: 935, dpr: 2, catScale: 1, topCrop: 0 });
  assert.ok(Math.abs(wide.roomW - 2000) < 1e-9);
  assert.ok(wide.roomY < 0, '房间比舞台高，应该往上溢出');

  // 窄屏裁掉上面 10%
  const narrow = computeView({ width: 390, height: 240, dpr: 3, catScale: 1, topCrop: 0.1 });
  assert.ok(Math.abs(narrow.roomW - Math.max(390, (240 / 0.9) / 935 * 1517)) < 1e-6);
});

test('布局换算：小猫（catScale 小）会整体缩进去，脖子补正跟着变大', () => {
  const big = computeView({ width: 1200, height: 740, dpr: 1, catScale: 0.86, topCrop: 0 });
  const small = computeView({ width: 1200, height: 740, dpr: 1, catScale: 0.65, topCrop: 0 });
  assert.ok(small.w < big.w && small.h < big.h);
  assert.equal(big.kitten, false);
  assert.equal(small.kitten, true);
  assert.ok(small.upperNeckExtra > big.upperNeckExtra);
  // 猫始终在房间里
  assert.ok(small.x > small.roomX && small.y > small.roomY);
  assert.ok(small.x + small.w < small.roomX + small.roomW);
});

test('指针映射：正放时按左上角算，横屏时整个舞台转 90°', () => {
  const view = { x: 100, y: 50, w: 400, h: 200, touchLift: 80 };
  const rect = { left: 10, top: 20, right: 810, bottom: 420 };   // 800×400 的舞台
  assert.deepEqual(pointerToStage({ rect, rotated: false, clientX: 310, clientY: 170, view }), { u: 0.5, v: 0.5 });
  // 触屏要抬手挡住的那一段
  assert.deepEqual(pointerToStage({ rect, rotated: false, clientX: 310, clientY: 170, lift: 80, view }), { u: 0.5, v: 0.1 });
  // 横屏：x 取纵向（相对 top）、y 从右边量回来，舞台框比可视区大，所以 v 会超过 1
  assert.deepEqual(pointerToStage({ rect, rotated: true, clientX: 110, clientY: 220, view }), { u: 0.25, v: 3.25 });
});

test('clamp 边界', () => {
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(2, 0, 1), 1);
  assert.equal(clamp(0.4, 0, 1), 0.4);
});
