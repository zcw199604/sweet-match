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
