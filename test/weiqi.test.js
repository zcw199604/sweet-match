import test from 'node:test';
import assert from 'node:assert/strict';
import { BLACK, PASS, WHITE, createGame, groupAt, guessDead, idx, isLegal, pass, play, score, think, undo } from '../weiqi-core.js';

const at = (g, r, c) => idx(g, r, c);
// 依次落子：[r, c] 黑白交替；null 表示停一手
function moves(g, list) { for (const m of list) (m ? play(g, at(g, ...m)) : pass(g)); return g; }

test('a stone with no liberties is captured, and suicide is not allowed', () => {
  const g = createGame(9);
  // 白子在 (0,0)，黑从两边堵
  moves(g, [[0, 1], [0, 0], [1, 1]]);
  assert.equal(g.board[at(g, 0, 0)], WHITE);
  moves(g, [[5, 5], [1, 0]]);
  assert.equal(g.board[at(g, 0, 0)], 0);
  assert.equal(g.captures[BLACK], 1);
  // 现在轮到白：(0,0) 四周都是黑子，白下进去就是自杀
  assert.equal(g.toPlay, WHITE);
  assert.equal(isLegal(g, at(g, 0, 0)), false);
  // (0,1)(1,1)(1,0) 连成一块，气是 (0,0)(0,2)(1,2)(2,1)(2,0)
  assert.equal(groupAt(g.board, g.N, at(g, 0, 1)).liberties, 5);
});

test('a ko cannot be retaken straight away', () => {
  const g = createGame(9);
  // 标准的劫：黑 (1,0)(0,1)(2,1)(1,2)；白 (0,2)(2,2)(1,3)(1,1 先提)
  moves(g, [[1, 0], [0, 2], [0, 1], [2, 2], [2, 1], [1, 3], [8, 8], [1, 1], [1, 2]]);
  // 黑 (1,2) 提了白 (1,1)
  assert.equal(g.board[at(g, 1, 1)], 0);
  assert.equal(g.toPlay, WHITE);
  assert.equal(isLegal(g, at(g, 1, 1)), false);
  play(g, at(g, 7, 7)); play(g, at(g, 6, 6));   // 找劫材、应劫
  assert.equal(isLegal(g, at(g, 1, 1)), true);
});

test('two passes end the game, area scoring counts stones plus surrounded points, and undo goes back', () => {
  const g = createGame(9);
  // 黑在第 4 列竖着一道墙，白在第 5 列：黑 45 子 + 白 36+7.5
  for (let r = 0; r < 9; r += 1) { play(g, at(g, r, 4)); play(g, at(g, r, 5)); }
  pass(g); pass(g);
  assert.equal(g.over, true);
  const s = score(g);
  assert.equal(s.black, 45);
  assert.equal(s.white, 36 + 7.5);
  assert.equal(s.winner, BLACK);
  assert.equal(undo(g), true);
  assert.equal(g.over, false);
  // 拿掉白墙最上面那颗：右边的空就和黑子连通了，变成谁都不算的单官
  const dead = new Set([at(g, 0, 5)]);
  assert.equal(score(g, dead).white, 8 + 7.5);
});

test('the computer answers with a legal point, and dead-stone guessing finds a hopeless stone', () => {
  const g = createGame(9);
  const { move } = think(g, 200, () => 0.42);
  assert.notEqual(move, PASS);
  assert.equal(isLegal(g, move), true);
  // 白一颗孤子陷在黑围住的角里
  const h = moves(createGame(9), [[0, 3], [1, 1], [1, 3], [8, 8], [2, 3], [8, 7], [3, 3], [8, 6], [3, 2], [8, 5], [3, 1], [8, 4], [3, 0], [7, 8]]);
  assert.ok(guessDead(h, 300).has(at(h, 1, 1)));
});
