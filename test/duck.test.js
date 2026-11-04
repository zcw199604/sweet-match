import test from 'node:test';
import assert from 'node:assert/strict';
import { CROSS, DUCK, EMPTY, LEVELS, conflicts, countSolutions, covered, createGame, cycle, generate, hintStep, logicSolve, setMark, shapeOf } from '../duck-core.js';

const connected = (n, region, g) => {
  const cells = region.flatMap((x, i) => (x === g ? [i] : []));
  const seen = new Set([cells[0]]), todo = [cells[0]];
  while (todo.length) {
    const i = todo.pop(), r = Math.floor(i / n), c = i % n;
    for (const [rr, cc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]) {
      const j = rr * n + cc;
      if (rr >= 0 && cc >= 0 && rr < n && cc < n && region[j] === g && !seen.has(j)) { seen.add(j); todo.push(j); }
    }
  }
  return seen.size === cells.length;
};

test('every generated puzzle has one answer that obeys all four rules, and logic alone finds it', () => {
  for (const level of Object.keys(LEVELS)) {
    for (const seed of [1, 2, 3, 7, 42, 2026]) {
      const p = generate(level, seed);
      const n = LEVELS[level].size;
      assert.equal(p.size, n);
      // n 块颜色，每块连成一片
      assert.deepEqual([...new Set(p.region)].sort((a, b) => a - b), [...Array(n).keys()]);
      for (let g = 0; g < n; g += 1) assert.ok(connected(n, p.region, g), `${level}/${seed} region ${g} split`);
      // 答案：每列一只、每色一只、相邻行不挨着
      assert.equal(new Set(p.solution).size, n);
      assert.equal(new Set(p.solution.map((c, r) => p.region[r * n + c])).size, n);
      p.solution.forEach((c, r) => { if (r) assert.ok(Math.abs(c - p.solution[r - 1]) > 1); });
      // 唯一解，而且推理求解器不靠猜就能解到同一个答案
      assert.deepEqual(countSolutions(n, p.region, 2), [p.solution]);
      const logic = logicSolve(p);
      assert.ok(logic.solved);
      assert.deepEqual(logic.ducks, p.solution.map((c, r) => r * n + c));
    }
  }
  assert.deepEqual(generate('normal', 9).region, generate('normal', 9).region);
});

test('difficulty follows the hardest technique the puzzle needs', () => {
  const tiers = (level) => [11, 12, 13, 14, 15, 16].map((s) => generate(level, s).tier);
  for (const t of tiers('easy')) assert.ok(t <= 2);
  for (const t of tiers('normal')) assert.equal(t, 3);
  // 困难题偶尔碰不到 4 级会退回最接近的一道，但大多数要用到「试一步」
  const hard = tiers('hard');
  assert.ok(hard.every((t) => t >= 3) && hard.filter((t) => t === 4).length >= 4);
});

test('the counter sees every solution of an open board', () => {
  // 5×5、每行一种颜色：只剩列和相邻的约束，正好 14 种摆法
  const region = Array.from({ length: 25 }, (_, i) => Math.floor(i / 5));
  assert.equal(countSolutions(5, region, 100).length, 14);
  // 4×4 只有两种不相邻的摆法
  assert.equal(countSolutions(4, Array.from({ length: 16 }, (_, i) => Math.floor(i / 4)), 100).length, 2);
});

test('a cell sees its row, column, colour and the eight cells around it', () => {
  const p = generate('easy', 5);
  const sees = new Set(shapeOf(p).sees[7]); // 第 2 行第 2 列
  for (const j of [0, 1, 2, 6, 8, 12, 13, 14]) assert.ok(sees.has(j));
  for (const j of [9, 10, 11, 1, 19, 25, 31]) assert.ok(sees.has(j));
  assert.ok(!sees.has(7));
  p.region.forEach((g, j) => { if (g === p.region[7] && j !== 7) assert.ok(sees.has(j)); });
});

test('marks cycle, clashing ducks are flagged, and the right ducks win', () => {
  const game = createGame('easy', 3), n = game.size;
  assert.equal(cycle(EMPTY), CROSS);
  assert.equal(cycle(CROSS), DUCK);
  assert.equal(cycle(DUCK), EMPTY);
  // 同一行两只、斜着挨着的两只都算打架
  setMark(game, 0, DUCK);
  setMark(game, 2, DUCK);
  assert.deepEqual([...conflicts(game)].sort(), [0, 2]);
  setMark(game, 2, EMPTY);
  setMark(game, n + 1, DUCK);
  assert.deepEqual([...conflicts(game)].sort((a, b) => a - b), [0, n + 1]);
  game.marks.fill(EMPTY);
  setMark(game, 0, DUCK);
  assert.ok(covered(game).has(1) && covered(game).has(n) && covered(game).has(n + 1));
  game.marks.fill(EMPTY);
  game.solution.forEach((c, r) => setMark(game, r * n + c, DUCK));
  assert.ok(game.done);
  assert.equal(setMark(game, 0, CROSS), false);
});

test('hints fix mistakes first, then always make progress until the pond is solved', () => {
  for (const level of Object.keys(LEVELS)) {
    const game = createGame(level, 21), n = game.size;
    const answer = new Set(game.solution.map((c, r) => r * n + c));
    const wrong = [...Array(n * n).keys()].find((i) => !answer.has(i));
    const right = [...answer][0];
    setMark(game, wrong, DUCK);
    setMark(game, right, CROSS);
    assert.deepEqual(hintStep(game).cells, [wrong]);
    assert.equal(game.marks[wrong], EMPTY);
    assert.deepEqual(hintStep(game).cells, [right]);
    assert.equal(game.marks[right], EMPTY);
    assert.ok(game.hinted);
    for (let k = 0; k < n * n && !game.done; k += 1) {
      const before = game.marks.join('');
      const step = hintStep(game);
      assert.ok(step.why);
      assert.notEqual(game.marks.join(''), before);
      // 提示从不出错：叉不落在答案上，鸭只放在答案上
      game.marks.forEach((v, i) => { if (v === CROSS) assert.ok(!answer.has(i)); if (v === DUCK) assert.ok(answer.has(i)); });
    }
    assert.ok(game.done, `${level} not solved by hints`);
  }
});
