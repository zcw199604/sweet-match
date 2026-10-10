import test from 'node:test';
import assert from 'node:assert/strict';

const core = await import('../xiangqi-core.js');
const fen = (pieces, turn = 'r') => {
  const cells = Array(90).fill(null);
  for (const [sq, type] of Object.entries(pieces)) cells[(9 - Number(sq[1])) * 9 + sq.charCodeAt(0) - 97] = type;
  const rows = [];
  for (let y = 0; y < 10; y++) {
    let row = '', empty = 0;
    for (let x = 0; x < 9; x++) {
      const p = cells[y * 9 + x];
      if (!p) empty++;
      else { if (empty) row += empty; empty = 0; row += p; }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join('/')} ${turn} - - 0 1`;
};
const position = (pieces, turn) => core.createXiangqi({ fen: fen({ e0: 'K', d9: 'k', ...pieces }, turn) });
const targets = (s, from) => core.legalMoves(s, from).map(m => m.to);

test('象棋：标准开局 32 子，红先行，非法着法不改变局面', () => {
  const s = core.createXiangqi();
  assert.equal(s.board.flat().filter(Boolean).length, 32);
  assert.equal(s.turn, 'r');
  const before = s.fen;
  assert.equal(core.moveXiangqi(s, 'a0', 'a3').ok, false);
  assert.equal(s.fen, before);
  assert.equal(core.moveXiangqi(s, 'a3', 'a4').ok, true);
  assert.equal(s.turn, 'b');
  assert.equal(s.history.length, 1);
});

test('象棋：马腿和象眼阻挡，象不能过河', () => {
  const horse = position({ b0: 'N', b1: 'R' });
  assert.ok(!targets(horse, 'b0').includes('c2'));
  assert.ok(targets(horse, 'b0').includes('d1'));
  const elephant = position({ c0: 'B', d1: 'R' });
  assert.ok(!targets(elephant, 'c0').includes('e2'));
  assert.ok(targets(elephant, 'c0').includes('a2'));
  const river = position({ c4: 'B', a0: 'R' });
  assert.ok(!targets(river, 'c4').includes('e6'));
});

test('象棋：炮吃子必须恰好一个炮架，炮移动不能越子', () => {
  const s = position({ a2: 'C', a4: 'P', a6: 'r', i0: 'R' });
  assert.ok(targets(s, 'a2').includes('a6'));
  assert.ok(!targets(s, 'a2').includes('a5'));
  const noScreen = position({ a2: 'C', a6: 'r', i0: 'R' });
  assert.ok(!targets(noScreen, 'a2').includes('a6'));
  const twoScreens = position({ a2: 'C', a4: 'P', a5: 'p', a6: 'r', i0: 'R' });
  assert.ok(!targets(twoScreens, 'a2').includes('a6'));
});

test('象棋：兵卒过河前只向前，过河后可平移但不能退，士帅受九宫限制', () => {
  const s = position({ a3: 'P', c5: 'P', d0: 'A', i0: 'R' });
  assert.deepEqual(targets(s, 'a3'), ['a4']);
  assert.ok(targets(s, 'c5').includes('b5'));
  assert.ok(!targets(s, 'c5').includes('c4'));
  assert.deepEqual(targets(s, 'd0'), ['e1']);
  assert.ok(targets(s, 'e0').every(sq => ['d0', 'e1', 'f0'].includes(sq)));
});

test('象棋：禁止将帅照面和自将，将军必须应将', () => {
  const facing = position({ d9: null, e9: 'k', e5: 'R' });
  assert.ok(!targets(facing, 'e5').includes('d5'));
  const pinned = position({ e5: 'r', e1: 'R' });
  assert.ok(!targets(pinned, 'e1').includes('d1'));
  const check = position({ e5: 'r', a0: 'R' });
  assert.equal(check.check, true);
  assert.equal(core.moveXiangqi(check, 'a0', 'a1').ok, false);
});

test('象棋：将死与困毙均判负，终局后不能继续落子', () => {
  const mate = core.createXiangqi({ fen: fen({ e9: 'k', e0: 'K', a9: 'R', e7: 'R' }, 'b') });
  assert.equal(mate.phase, 'over');
  assert.equal(mate.winner, 'r');
  assert.equal(mate.reason, 'checkmate');
  assert.equal(core.moveXiangqi(mate, 'e9', 'f9').ok, false);
  const stale = core.createXiangqi({ fen: fen({ e9: 'k', e0: 'K', d8: 'R', f8: 'R', e5: 'P' }, 'b') });
  assert.equal(stale.phase, 'over');
  assert.equal(stale.winner, 'r');
  assert.equal(stale.reason, 'stalemate');
});

test('象棋：悔棋恢复棋子、回合和终态，AI只返回合法着法且不改变局面', () => {
  const s = core.createXiangqi();
  const start = s.fen;
  core.moveXiangqi(s, 'a3', 'a4');
  const before = s.fen;
  const ai = core.chooseXiangqiMove(s);
  assert.ok(core.legalMoves(s).some(m => m.from === ai.from && m.to === ai.to));
  assert.equal(s.fen, before);
  core.moveXiangqi(s, ai.from, ai.to);
  assert.equal(core.undoXiangqi(s, 2), true);
  assert.equal(s.fen, start);
  assert.equal(s.history.length, 0);
  assert.equal(core.undoXiangqi(s), false);
});

test('象棋：取消分片AI不会留下搜索中的局面，思考时悔棋回到红方', () => {
  const s = core.createXiangqi();
  const start = s.fen;
  core.moveXiangqi(s, 'a3', 'a4');
  const before = s.fen;
  const search = core.xiangqiSearch(s);
  assert.equal(search.next().done, false);
  search.return();
  assert.equal(s.fen, before);
  assert.equal(s.turn, 'b');
  assert.equal(core.undoXiangqi(s, 1), true);
  assert.equal(s.fen, start);
  assert.equal(s.turn, 'r');
});
