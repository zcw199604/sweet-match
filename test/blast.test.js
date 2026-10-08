import test from 'node:test';
import assert from 'node:assert/strict';
import { SHADES } from '../art.js';
import { BLAST_SHAPES } from '../blast-shapes.js';
import { act, BLAST, BLAST_COLORS, BLAST_WEIGHTS, blastCanPlace, blastCellAt, blastCellCentre, blastHasValidPlacement, blastMultiplier, blastPreviewLines, blastSnap, createGame, tickGame } from '../game-core.js';

const run = (state, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) tickGame(state, 1 / 60); };
// Replace a tray slot with a hand-built piece so a test can place an exact shape.
const give = (state, slot, cells, color = 'coral') => { state.tray[slot] = { id: 900 + slot, name: 'test', cells: cells.map(([dx, dy]) => ({ dx, dy, color })) }; };
const one = (state, slot = 0, color = 'coral') => give(state, slot, [[0, 0]], color);
const shape = (...pairs) => pairs.map(([dx, dy]) => ({ dx, dy }));
const place = (state, slot, col, row) => act(state, 0, { type: 'place', slot, col, row });
const pops = (state) => state.effects.filter(item => item.type === 'pop').length;
// The board is BLAST.COLS × BLAST.ROWS (square); LAST is its final row and column.
const N = BLAST.COLS, LAST = N - 1;
// What clearing `lines` lines at once scores before the streak multiplier.
const linePay = (lines) => lines * N * 10 + ({ 1: 20, 2: 30, 3: 40 })[lines];
// A board whose empty cells are all isolated, so no two-cell piece can ever fit.
const isolatedGaps = (state) => {
  for (let row = 0; row < BLAST.ROWS; row += 1) for (let col = 0; col < BLAST.COLS; col += 1) state.board[row][col] = 'coral';
  for (let row = 0; row < BLAST.ROWS; row += 1) { state.board[row][row] = null; state.board[row][(row + 2) % BLAST.COLS] = null; }
};

test('blast deals the same pieces for the same seed and different ones for another', () => {
  const a = createGame('blast', 42), b = createGame('blast', 42);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.tray, createGame('blast', 43).tray);
  assert.deepEqual(a.tray.map(piece => piece.id), [1, 2, 3]);
});

test('a blast snapshot survives a round trip and replays identically', () => {
  const host = createGame('blast', 7);
  one(host, 0);
  place(host, 0, 0, 0);
  const guest = JSON.parse(JSON.stringify(host));
  one(host, 1); place(host, 1, 2, 2);
  one(guest, 1); place(guest, 1, 2, 2);
  assert.deepEqual(guest, JSON.parse(JSON.stringify(host)));
});

test('every shape is normalised, inside the board and frozen', () => {
  const seen = new Set();
  for (const shape of BLAST_SHAPES) {
    assert.ok(shape.cells.length >= 1 && shape.cells.length <= 9, `${shape.name} cell count`);
    assert.equal(Math.min(...shape.cells.map(cell => cell.dx)), 0, `${shape.name} dx origin`);
    assert.equal(Math.min(...shape.cells.map(cell => cell.dy)), 0, `${shape.name} dy origin`);
    for (const cell of shape.cells) {
      assert.ok(Number.isInteger(cell.dx) && Number.isInteger(cell.dy) && cell.dx >= 0 && cell.dy >= 0, `${shape.name} cell`);
      assert.ok(cell.dx < BLAST.COLS && cell.dy < BLAST.ROWS, `${shape.name} fits the board`);
    }
    const key = shape.cells.map(cell => `${cell.dx},${cell.dy}`).join(';');
    assert.ok(!seen.has(key), `${shape.name} is a duplicate`);
    seen.add(key);
    assert.ok(Object.isFrozen(shape) && Object.isFrozen(shape.cells), `${shape.name} is frozen`);
  }
  assert.ok(Object.isFrozen(BLAST_SHAPES));
});

test('a new blast game starts empty with a full tray', () => {
  const state = createGame('blast', 5);
  assert.equal(state.phase, 'playing');
  assert.equal(BLAST.ROWS, N, 'the board is square');
  assert.deepEqual(state.board, Array.from({ length: N }, () => Array(N).fill(null)));
  assert.equal(state.tray.length, 3);
  assert.ok(state.tray.every(Boolean));
  assert.equal(state.score, 0); assert.equal(state.streak, 0); assert.equal(state.cleared, 0);
});

test('blastCanPlace rejects out of bounds and overlaps', () => {
  const state = createGame('blast', 5);
  const wide = shape([0, 0], [1, 0], [2, 0], [3, 0], [4, 0]);
  assert.equal(blastCanPlace(state, wide, N - 4, 0), false);
  assert.equal(blastCanPlace(state, wide, N - 5, 0), true);
  state.board[0][1] = 'coral';
  assert.equal(blastCanPlace(state, wide, 0, 0), false);
  assert.equal(blastCanPlace(state, shape([0, 0]), 0, 0), true);
});

test('placing a piece commits it and empties only its own slot', () => {
  const state = createGame('blast', 5);
  const kept = state.tray[2].id;
  give(state, 0, [[0, 0], [1, 0]]);
  assert.equal(place(state, 0, 2, 3), true);
  assert.equal(state.board[3][2], 'coral'); assert.equal(state.board[3][3], 'coral');
  assert.equal(state.tray[0], null); assert.equal(state.tray[2].id, kept);
  assert.equal(place(state, 0, 0, 0), false, 'an emptied slot cannot be placed again');
});

test('a full row clears and scores the base plus the combo bonus', () => {
  const state = createGame('blast', 5);
  for (let col = 0; col < LAST; col += 1) state.board[0][col] = 'coral';
  one(state, 0);
  assert.equal(place(state, 0, LAST, 0), true);
  assert.deepEqual(state.board[0], Array(N).fill(null));
  assert.equal(state.cleared, 1); assert.equal(state.streak, 1); assert.equal(state.score, linePay(1));
});

test('a full column clears too', () => {
  const state = createGame('blast', 5);
  for (let row = 0; row < LAST; row += 1) state.board[row][4] = 'coral';
  one(state, 0);
  assert.equal(place(state, 0, 4, LAST), true);
  for (let row = 0; row < N; row += 1) assert.equal(state.board[row][4], null);
  assert.equal(state.cleared, 1); assert.equal(state.score, linePay(1));
});

test('a row and a column clearing together count the crossing cell once', () => {
  const state = createGame('blast', 5);
  for (let col = 0; col < N; col += 1) if (col !== 3) state.board[3][col] = 'coral';
  for (let row = 0; row < N; row += 1) if (row !== 3) state.board[row][3] = 'coral';
  one(state, 0);
  assert.equal(place(state, 0, 3, 3), true);
  assert.equal(state.cleared, 2); assert.equal(state.score, linePay(2));
  assert.equal(state.board[3][3], null);
  assert.equal(pops(state), 2 * N - 1, 'a row plus a column minus the shared crossing cell');
});

test('the drag preview names exactly the lines a placement would clear', () => {
  const state = createGame('blast', 5);
  for (let col = 0; col < N; col += 1) if (col !== 3) state.board[3][col] = 'coral';
  for (let row = 0; row < N; row += 1) if (row !== 3) state.board[row][3] = 'coral';
  const dot = shape([0, 0]);
  assert.deepEqual(blastPreviewLines(state, dot, 3, 3), { rows: [3], cols: [3] });
  assert.deepEqual(blastPreviewLines(state, dot, 0, 0), { rows: [], cols: [] }, 'a quiet spot clears nothing');
  assert.deepEqual(blastPreviewLines(state, dot, 2, 3), { rows: [], cols: [] }, 'an occupied spot previews nothing');
  const before = structuredClone(state.board);
  blastPreviewLines(state, dot, 3, 3);
  assert.deepEqual(state.board, before, 'previewing never touches the board');
  one(state, 0, 'amber'); place(state, 0, 3, 3);
  assert.equal(state.cleared, 2, 'the preview agreed with the real clear');
});

test('a clear tells the view where the piece landed and how to animate it', () => {
  const state = createGame('blast', 5);
  for (let col = 0; col < LAST; col += 1) state.board[0][col] = 'coral';
  one(state, 0, 'cyan');
  place(state, 0, LAST, 0);
  const landed = state.effects.find(item => item.type === 'place');
  assert.deepEqual(landed.cells, [{ col: LAST, row: 0 }]); assert.equal(landed.color, 'cyan');
  assert.deepEqual(state.effects.filter(item => item.type === 'line').map(item => [item.axis, item.index]), [['row', 0]]);
  const bursts = state.effects.filter(item => item.type === 'pop');
  assert.ok(bursts.every(item => item.color === 'cyan'), 'cleared cells burst in the placed colour');
  const delayOf = (col) => bursts.find(item => item.x === blastCellCentre(col, 0).x).delay;
  assert.equal(delayOf(LAST), 0, 'the ripple starts under the placed piece');
  assert.ok(delayOf(0) > delayOf(LAST - 4) && delayOf(LAST - 4) > delayOf(LAST - 2), 'and spreads outward from it');
  const text = state.effects.find(item => item.type === 'text');
  assert.equal(text.lines, 1); assert.equal(text.streak, 1);
});

test('the tray records when each fresh triple was dealt', () => {
  const state = createGame('blast', 5);
  assert.equal(state.dealtAt, 0);
  run(state, 0.5);
  for (let slot = 0; slot < 3; slot += 1) { one(state, slot); place(state, slot, slot * 2, LAST); }
  assert.ok(Math.abs(state.dealtAt - state.elapsed) < 1e-9, 'the refill is stamped with the current time');
});

test('consecutive clearing moves raise the multiplier, a quiet move resets it', () => {
  const state = createGame('blast', 5);
  const sweep = (row) => { for (let col = 0; col < LAST; col += 1) state.board[row][col] = 'coral'; };
  sweep(0); one(state, 0); place(state, 0, LAST, 0);
  sweep(1); one(state, 1); place(state, 1, LAST, 1);
  sweep(2); one(state, 2); place(state, 2, LAST, 2);
  const pay = linePay(1);
  assert.equal(state.score, pay + Math.floor(pay * 1.05) + Math.floor(pay * 1.1));
  assert.equal(state.streak, 3);
  assert.equal(blastMultiplier(1), 1); assert.equal(blastMultiplier(3), 1.1);
  one(state, 0); place(state, 0, 0, LAST);
  assert.equal(state.streak, 0, 'a move that clears nothing breaks the streak');
  sweep(3); one(state, 1); place(state, 1, LAST, 3);
  assert.equal(state.score, pay + Math.floor(pay * 1.05) + Math.floor(pay * 1.1) + pay);
});

test('clearing several lines at once pays a bigger bonus', () => {
  const two = createGame('blast', 5);
  for (let col = 0; col < LAST; col += 1) { two.board[0][col] = 'coral'; two.board[1][col] = 'coral'; }
  give(two, 0, [[0, 0], [0, 1]]);
  assert.equal(place(two, 0, LAST, 0), true);
  assert.equal(two.cleared, 2); assert.equal(two.score, linePay(2));
  const three = createGame('blast', 5);
  for (let row = 0; row < 3; row += 1) for (let col = 0; col < LAST; col += 1) three.board[row][col] = 'coral';
  give(three, 0, [[0, 0], [0, 1], [0, 2]]);
  assert.equal(place(three, 0, LAST, 0), true);
  assert.equal(three.cleared, 3); assert.equal(three.score, linePay(3));
});

test('the tray refills only once every slot is spent', () => {
  const state = createGame('blast', 5);
  const first = state.tray.map(piece => piece.id);
  one(state, 0); place(state, 0, 0, 0);
  assert.deepEqual(state.tray.map(piece => piece ? piece.id : null), [null, first[1], first[2]]);
  one(state, 1); place(state, 1, 2, 0);
  one(state, 2); place(state, 2, 4, 0);
  assert.ok(state.tray.every(Boolean), 'a spent tray is dealt a fresh triple');
  assert.ok(state.tray.every(piece => piece.id > Math.max(...first)));
});

test('a drop that misses snaps to the nearest free neighbour', () => {
  const state = createGame('blast', 5);
  state.board[3][3] = 'coral';
  one(state, 0);
  assert.equal(place(state, 0, 3, 3), true);
  assert.equal(state.board[2][3], 'coral', 'SNAP tries the cell above the anchor second');
  assert.equal(state.board[3][3], 'coral', 'the occupied cell is untouched');
});

test('blastSnap prefers the anchor itself, then walks BLAST.SNAP in order', () => {
  const state = createGame('blast', 5);
  const cells = [{ dx: 0, dy: 0 }];
  assert.deepEqual(blastSnap(state, cells, 3, 3), { col: 3, row: 3 });
  state.board[3][3] = 'coral';
  assert.deepEqual(blastSnap(state, cells, 3, 3), { col: 3, row: 2 });
  state.board[2][3] = 'coral';
  assert.deepEqual(blastSnap(state, cells, 3, 3), { col: 3, row: 4 });
});

test('a drop with nowhere to land leaves the board and tray untouched', () => {
  const state = createGame('blast', 5);
  isolatedGaps(state);
  give(state, 0, [[0, 0], [1, 0]]);
  const before = structuredClone(state);
  assert.equal(place(state, 0, 0, 0), false);
  assert.deepEqual(state, before);
});

test('the round ends when none of the tray pieces fit anywhere', () => {
  const state = createGame('blast', 5);
  isolatedGaps(state);
  one(state, 0); give(state, 1, [[0, 0], [1, 0]]); give(state, 2, [[0, 0], [1, 0]]);
  assert.equal(place(state, 0, 0, 0), true);
  assert.equal(state.phase, 'lost');
  const before = structuredClone(state);
  assert.equal(place(state, 1, 0, 0), false, 'a finished round accepts nothing');
  run(state, 0.5);
  assert.deepEqual(state, before, 'and ticking does not revive it');
});

test('emptying the tray refills it before the round is judged', () => {
  const state = createGame('blast', 5);
  one(state, 0); one(state, 1); one(state, 2);
  assert.equal(place(state, 0, 0, 0), true);
  assert.equal(place(state, 1, 2, 0), true);
  assert.equal(place(state, 2, 4, 0), true);
  assert.ok(state.tray.every(Boolean), 'the tray is never left empty when the verdict is made');
  assert.equal(state.phase, 'playing');
});

test('blast ignores malformed actions', () => {
  const state = createGame('blast', 5);
  assert.equal(place(state, 9, 0, 0), false);
  assert.equal(place(state, -1, 0, 0), false);
  assert.equal(place(state, 0, NaN, 0), false);
  assert.equal(place(state, 0, 0.5, 0), false);
  assert.equal(place(state, 0, -4, -4), false);
  assert.equal(act(state, 0, { type: 'nonsense' }), false);
  assert.equal(act(state, 0, { type: 'place' }), false);
  assert.equal(act(state, 0, { type: 'move', x: 5000, y: 5000 }), true);
  assert.equal(state.board.flat().filter(Boolean).length, 0, 'a move never touches the board');
  const centre = blastCellCentre(3, 3);
  assert.deepEqual(blastCellAt(centre.x, centre.y), { col: 3, row: 3 }, 'cellAt inverts cellCentre');
});

test('no shape is a diagonal: every cell touches another along an edge', () => {
  for (const { name, cells } of BLAST_SHAPES) {
    if (cells.length === 1) continue;
    const seen = new Set([0]), queue = [0];
    while (queue.length) {
      const at = cells[queue.pop()];
      cells.forEach((cell, index) => { if (!seen.has(index) && Math.abs(cell.dx - at.dx) + Math.abs(cell.dy - at.dy) === 1) { seen.add(index); queue.push(index); } });
    }
    assert.equal(seen.size, cells.length, `${name} is connected`);
  }
});

test('small pieces are dealt far more often than big ones', () => {
  for (const shape of BLAST_SHAPES) assert.ok(BLAST_WEIGHTS[shape.cells.length] > 0, `${shape.name} has a weight`);
  const counts = {};
  for (let seed = 1; seed <= 400; seed += 1) for (const piece of createGame('blast', seed).tray) counts[piece.cells.length] = (counts[piece.cells.length] || 0) + 1;
  // Per shape: a three-cell shape should turn up several times as often as the nine-cell one.
  const perShape = (size) => counts[size] / BLAST_SHAPES.filter(shape => shape.cells.length === size).length;
  assert.ok(perShape(3) > perShape(5) * 1.8, 'three-cell shapes beat five-cell ones');
  assert.ok((counts[9] || 0) < 1200 * 0.02, 'the 3×3 slab is rare');
});

test('a fresh triple always has a piece that fits, even on a nearly full board', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const state = createGame('blast', seed);
    isolatedGaps(state);
    // Fill one of the two gaps in rows 0–2: no line completes, so the refill lands on
    // a board of isolated holes where only the single cell fits.
    const gaps = [];
    for (let row = 0; row < N; row += 1) for (let col = 0; col < N; col += 1) if (!state.board[row][col]) gaps.push([col, row]);
    one(state, 0); one(state, 1); one(state, 2);
    for (let slot = 0; slot < 3; slot += 1) assert.equal(place(state, slot, ...gaps[slot * 2]), true);
    assert.equal(state.cleared, 0);
    assert.equal(state.phase, 'playing', `seed ${seed}: the refill offered a move`);
    assert.ok(state.tray.some(piece => blastHasValidPlacement(state, piece.cells)));
  }
});

test('every blast colour has a full neon shade record', () => {
  for (const color of BLAST_COLORS) {
    const record = SHADES[color];
    assert.ok(record, `${color} is missing from SHADES`);
    for (const key of ['base', 'light', 'dark', 'edge', 'rim', 'glow']) {
      assert.match(record[key], /^#[0-9a-f]{6}$/i, `${color}.${key}`);
    }
  }
  assert.ok(blastHasValidPlacement(createGame('blast', 5), shape([0, 0])));
});
