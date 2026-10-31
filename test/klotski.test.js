import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, GOAL, LEVELS, ROWS, canMove, commit, createLevel, fits, move, occupancy, solved, stars, startDrag, undo } from '../klotski-core.js';

const cellsOf = (block) => {
  const out = [];
  for (let y = 0; y < block.h; y += 1) for (let x = 0; x < block.w; x += 1) out.push(`${block.r + y},${block.c + x}`);
  return out;
};

test('every classic layout is a 4×5 board with 18 covered cells, one 曹操 and two empty cells', () => {
  assert.equal(LEVELS.length, 39);
  for (const level of LEVELS) {
    const covered = new Set();
    let big = 0;
    for (const b of level.blocks) {
      assert.ok(b.r >= 0 && b.c >= 0 && b.r + b.h <= ROWS && b.c + b.w <= COLS, `${level.name} block out of board`);
      const area = b.h * b.w;
      if (area === 4) big += 1;
      for (const k of cellsOf(b)) {
        assert.ok(!covered.has(k), `${level.name} overlaps at ${k}`);
        covered.add(k);
      }
    }
    assert.equal(covered.size, 18, `${level.name} covers ${covered.size} cells`);
    assert.equal(big, 1, `${level.name} has ${big} 2×2 blocks`);
    assert.ok(level.par >= 20 && level.par <= 140, `${level.name} par ${level.par}`);
  }
});

test('levels run easiest to hardest', () => {
  for (let i = 1; i < LEVELS.length; i += 1) assert.ok(LEVELS[i].par >= LEVELS[i - 1].par);
});

test('a block can only slide into empty cells and never overlaps another', () => {
  const state = createLevel(1);
  for (const block of state.blocks) {
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const before = { ...block };
      const ok = move(state, block.id, dr, dc);
      if (ok) {
        assert.ok(fits(state, block, block.r, block.c));
        move(state, block.id, -dr, -dc);
      }
      assert.deepEqual({ r: block.r, c: block.c }, { r: before.r, c: before.c });
    }
  }
  // 全部挤在一起时，曹操一步也动不了
  assert.equal(canMove(state, 0, 0, 1) || canMove(state, 0, 0, -1) || canMove(state, 0, 1, 0) || canMove(state, 0, -1, 0), false);
});

// 找一个能连着走两格的块（先试走再退回去，不改动局面）。
function twoStep(state) {
  for (const b of state.blocks) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (!canMove(state, b.id, dr, dc)) continue;
    const r = b.r, c = b.c;
    move(state, b.id, dr, dc);
    const again = canMove(state, b.id, dr, dc);
    move(state, b.id, -dr, -dc);
    assert.deepEqual({ r: b.r, c: b.c }, { r, c });
    if (again) return { id: b.id, dr, dc };
  }
  return null;
}

test('one drag counts one move no matter how many cells it crosses, and undo takes it back', () => {
  const state = createLevel(1);
  const slide = twoStep(state);
  assert.ok(slide, 'level 1 should have a block with room for two slides');
  const drag0 = startDrag(state, slide.id);
  assert.equal(commit(state, drag0), false, 'a tap without moving is not a move');
  assert.equal(state.moves, 0);

  const drag = startDrag(state, slide.id);
  move(state, slide.id, slide.dr, slide.dc);
  move(state, slide.id, slide.dr, slide.dc);
  assert.equal(commit(state, drag), true);
  assert.equal(state.moves, 1);
  assert.equal(undo(state), true);
  assert.equal(state.moves, 0);
  assert.equal(state.blocks[slide.id].r, drag.r);
  assert.equal(state.blocks[slide.id].c, drag.c);
});

function oneStep(state) {
  for (const b of state.blocks) for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (canMove(state, b.id, dr, dc)) return { id: b.id, dr, dc };
  }
  return null;
}

test('undo unwinds drags in order', () => {
  const state = createLevel(2);
  const slide = oneStep(state);
  assert.ok(slide);
  const b = state.blocks[slide.id];
  const d1 = startDrag(state, b.id);
  move(state, b.id, slide.dr, slide.dc);
  commit(state, d1);
  const d2 = startDrag(state, b.id);
  move(state, b.id, -slide.dr, -slide.dc);
  commit(state, d2);
  assert.equal(state.moves, 2);
  undo(state);
  assert.equal(state.moves, 1);
  undo(state);
  assert.equal(state.moves, 0);
  assert.equal(undo(state), false);
});

test('winning is the 2×2 block on the goal, and the star rating follows par', () => {
  const state = createLevel(5);
  assert.equal(solved(state), false);
  state.blocks[0].r = GOAL.r;
  state.blocks[0].c = GOAL.c;
  assert.equal(solved(state), true);
  state.moves = state.par - 1;
  assert.equal(stars(state), 3);
  state.moves = state.par;
  assert.equal(stars(state), 3);
  state.moves = state.par + 1;
  assert.equal(stars(state), 2);
  state.moves = Math.ceil(state.par * 1.4);
  assert.equal(stars(state), 1);
});

test('a random walk of legal slides keeps the board consistent', () => {
  const state = createLevel(3);
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let i = 0; i < 400; i += 1) {
    const b = state.blocks[Math.floor(rand() * state.blocks.length)];
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => rand() - 0.5);
    for (const [dr, dc] of dirs) {
      if (canMove(state, b.id, dr, dc)) { move(state, b.id, dr, dc); break; }
    }
    const seen = new Set();
    for (const block of state.blocks) for (const k of cellsOf(block)) {
      assert.ok(!seen.has(k), 'blocks overlap during the walk');
      seen.add(k);
    }
  }
  assert.equal(occupancy(state).size, 18);
});
