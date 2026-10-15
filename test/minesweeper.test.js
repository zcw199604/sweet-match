import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../minesweeper-core.js');
const rng = () => .37;

test('扫雷：首点及相邻八格安全，布雷数量准确', () => {
  const s = core.createMines('easy');
  core.reveal(s, 40, rng);
  assert.equal(s.cells.filter(c => c.mine).length, 10);
  assert.equal(s.cells[40].adjacent, 0);
  assert.ok(core.neighbours(s, 40).every(i => !s.cells[i].mine));
  assert.notEqual(s.phase, 'lost');
});

test('扫雷：插旗保护格子且有数量上限，结束后不再操作', () => {
  const s = core.createMines('easy');
  core.toggleFlag(s, 0);
  assert.equal(core.reveal(s, 0, rng), false);
  assert.equal(s.started, false);
  for (let i = 1; i < 20; i++) core.toggleFlag(s, i);
  assert.equal(s.cells.filter(c => c.flagged).length, s.mines);
  s.phase = 'won';
  assert.equal(core.toggleFlag(s, 0), false);
});

test('扫雷：揭开全部安全格获胜，踩雷失败并保持终态', () => {
  const win = core.createMines('normal');
  core.reveal(win, 0, rng);
  win.cells.forEach((c, i) => { if (!c.mine) core.reveal(win, i); });
  assert.equal(win.phase, 'won');
  const lose = core.createMines('easy');
  core.reveal(lose, 40, rng);
  const bomb = lose.cells.findIndex(c => c.mine);
  assert.equal(core.reveal(lose, bomb), true);
  assert.equal(lose.phase, 'lost');
  assert.equal(lose.exploded, bomb);
  assert.equal(core.reveal(lose, 1), false);
});

test('扫雷：数字快开需足够旗子，错误标记会踩雷', () => {
  const s = core.createMines('easy');
  core.reveal(s, 40, rng);
  const i = s.cells.findIndex((c, i) => c.open && c.adjacent && core.neighbours(s, i).some(j => s.cells[j].mine));
  assert.equal(core.chord(s, i), false);
  const near = core.neighbours(s, i);
  near.filter(j => s.cells[j].mine).forEach(j => core.toggleFlag(s, j));
  assert.equal(core.chord(s, i), true);
  assert.ok(near.every(j => s.cells[j].mine || s.cells[j].open));
  const wrong = core.createMines('easy');
  core.reveal(wrong, 40, rng);
  const n = wrong.cells.findIndex((c,i) => c.open && c.adjacent === 1 && core.neighbours(wrong,i).some(j => !wrong.cells[j].mine && !wrong.cells[j].open));
  const safe = core.neighbours(wrong,n).find(j => !wrong.cells[j].mine && !wrong.cells[j].open);
  core.toggleFlag(wrong,safe);
  core.chord(wrong,n);
  assert.equal(wrong.phase,'lost');
});

const seeded = seed => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const handmade = (rows, cols, mineAt) => {
  const s = { rows, cols, mines: mineAt.length, cells: Array.from({ length: rows * cols }, (_, i) => ({ mine: mineAt.includes(i), adjacent: 0 })) };
  mineAt.forEach(m => core.neighbours(s, m).forEach(i => { s.cells[i].adjacent++; }));
  return s;
};

test('扫雷：无猜判定能区分二选一和可推理局面', () => {
  // 右侧一列两格只有一颗雷，两个 1 给不出任何区分 → 必须猜
  assert.equal(core.solvable(handmade(2, 4, [3]), 0), false);
  // 顶行 1 1 2 1 1：单格规则推不动，要穷举才得出唯一解
  assert.equal(core.solvable(handmade(3, 5, [1, 3]), 12), true);
});

test('扫雷：无猜模式默认关闭，开启后困难档每盘都能纯推理扫完', () => {
  assert.equal(core.createMines('hard').noGuess, false);
  const verdicts = new Set();
  for (let seed = 1; seed <= 30; seed++) {
    const plain = core.createMines('hard');
    core.reveal(plain, 100, seeded(seed));
    verdicts.add(core.solvable(plain, 100));
    const s = core.createMines('hard', { noGuess: true });
    core.reveal(s, 100, seeded(seed));
    assert.equal(s.cells.filter(c => c.mine).length, 40);
    assert.ok([100, ...core.neighbours(s, 100)].every(i => !s.cells[i].mine));
    assert.equal(core.solvable(s, 100), true);
  }
  // 关闭时仍是纯随机：30 盘里既有可推理的，也有必须猜的
  assert.deepEqual([...verdicts].sort(), [false, true]);
});
