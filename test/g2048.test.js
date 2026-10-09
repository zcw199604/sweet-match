import test from 'node:test';
import assert from 'node:assert/strict';
import { canMove, createState, G2048, maxTile, move, restoreState, snapshot, undo } from '../g2048-core.js';

// A board written row by row (0 = empty); the rng is pinned so a spawn lands in the first free cell as a 2.
const first = () => 0.5;
const board = (rows, extra = {}) => restoreState({ tiles: rows.flatMap((row, r) => row.map((v, c) => (v ? { r, c, v } : null)).filter(Boolean)), ...extra });
const read = (state) => {
  const rows = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (const t of state.tiles) rows[t.r][t.c] = t.v;
  return rows;
};
// The spawn is part of every move, so compare the board without the one new 2 that move added.
const without = (state, spawned) => { const rows = read(state); rows[spawned.r][spawned.c] = 0; return rows; };

test('a new game starts with two tiles of 2 or 4', () => {
  const state = createState();
  assert.equal(state.tiles.length, 2);
  assert.ok(state.tiles.every((t) => t.v === 2 || t.v === 4));
  assert.equal(state.score, 0);
});

test('a move slides every tile to the wall, and a tile merges only once per move', () => {
  const state = board([[2, 0, 2, 4], [2, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 8]]);
  const r = move(state, 'left', first);
  assert.equal(r.ok, true);
  assert.deepEqual(without(state, r.spawned), [[4, 4, 0, 0], [4, 4, 0, 0], [0, 0, 0, 0], [8, 0, 0, 0]]);
  assert.equal(r.gained, 12); // 4 from row 0, 4 + 4 from row 1
  assert.equal(state.score, 12);
});

test('the pair nearest the wall merges first: 2 2 2 slides to 4 2', () => {
  const state = board([[2, 2, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  move(state, 'left', () => 0.99); // spawn lands in the last free cell, out of the way
  assert.deepEqual(read(state)[0].slice(0, 2), [4, 2]);
  const right = board([[0, 2, 2, 2], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  move(right, 'right', () => 0.99);
  assert.deepEqual(read(right)[0].slice(2), [2, 4]);
});

test('all four directions slide the right way', () => {
  const start = () => board([[0, 0, 0, 0], [0, 0, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  for (const [dir, r, c] of [['left', 1, 0], ['right', 1, 3], ['up', 0, 2], ['down', 3, 2]]) {
    const state = start();
    const result = move(state, dir, first);
    assert.equal(result.ok, true, dir);
    const tile = state.tiles.find((t) => t.id !== result.spawned.id);
    assert.deepEqual([tile.r, tile.c], [r, c], dir);
  }
});

test('a move that changes nothing is refused and does not spawn, score or count', () => {
  const state = board([[2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  assert.deepEqual(move(state, 'left', first), { ok: false });
  assert.equal(state.tiles.length, 2);
  assert.equal(state.moves, 0);
  assert.equal(state.history.length, 0);
});

test('merge events name the two parents and the tile that replaces them', () => {
  const state = board([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const ids = state.tiles.map((t) => t.id);
  const r = move(state, 'left', first);
  assert.equal(r.merges.length, 1);
  assert.deepEqual(r.merges[0].parents, ids);
  assert.equal(r.merges[0].v, 4);
  assert.deepEqual(r.slides.map((s) => s.to), [{ r: 0, c: 0 }, { r: 0, c: 0 }]);
  assert.ok(!ids.includes(r.merges[0].id));
});

test('a full board with no equal neighbours is over; one equal pair keeps it alive', () => {
  const dead = board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 4, 2]]);
  assert.equal(canMove(dead), false);
  assert.equal(dead.over, true);
  assert.deepEqual(move(dead, 'left', first), { ok: false });
  const alive = board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [4, 2, 2, 4]]);
  assert.equal(canMove(alive), true);
  assert.equal(alive.over, false);
});

test('filling the board with the last move ends the game when nothing can merge', () => {
  const state = board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [0, 4, 2, 4]]);
  assert.equal(move(state, 'right', first).ok, false); // row 3 is already packed to the right
  const left = move(state, 'left', first); // row 3 becomes 4 2 4 _, then a 2 spawns in the gap
  assert.equal(left.ok, true);
  assert.equal(state.tiles.length, 16);
  assert.equal(state.over, true);
});

test('making 2048 sets won once; the game carries on', () => {
  const state = board([[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
  const r = move(state, 'left', first);
  assert.equal(r.firstWin, true);
  assert.equal(state.won, true);
  assert.equal(maxTile(state), 2048);
  const again = board([[2048, 2048, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { won: true });
  assert.equal(move(again, 'left', first).firstWin, false);
});

test('undo rewinds the last move and its score, three times at most', () => {
  const state = board([[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { undosLeft: 3 });
  const before = read(state);
  assert.deepEqual(undo(state), { ok: false, reason: 'empty' });
  move(state, 'left', first);
  assert.equal(state.score, 4);
  assert.equal(undo(state).ok, true);
  assert.deepEqual(read(state), before);
  assert.equal(state.score, 0);
  assert.equal(state.moves, 0);
  assert.equal(state.undosLeft, 2);
  const busy = board([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { undosLeft: 0 });
  move(busy, 'right', first);
  assert.deepEqual(undo(busy), { ok: false, reason: 'none-left' });
});

test('undo brings back a game that had just ended', () => {
  const state = board([[2, 4, 2, 4], [4, 2, 4, 2], [2, 4, 2, 4], [0, 4, 2, 4]], { undosLeft: 3 });
  move(state, 'left', first);
  assert.equal(state.over, true);
  undo(state);
  assert.equal(state.over, false);
  assert.equal(state.tiles.length, 15);
});

test('a board with no undo count starts with the full allowance; a saved zero stays zero', () => {
  assert.equal(board([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]).undosLeft, G2048.undos);
  assert.equal(board([[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], { undosLeft: 0 }).undosLeft, 0);
});

test('a saved game round-trips, and a damaged one is refused', () => {
  const state = board([[2, 4, 0, 0], [0, 8, 0, 0], [0, 0, 0, 0], [0, 0, 0, 16]], { score: 120, moves: 9, undosLeft: 1 });
  const back = restoreState(JSON.parse(JSON.stringify(snapshot(state))));
  assert.deepEqual(read(back), read(state));
  assert.equal(back.score, 120);
  assert.equal(back.undosLeft, 1);
  assert.equal(restoreState(null), null);
  assert.equal(restoreState({ tiles: [{ r: 0, c: 0, v: 3 }] }), null); // not a power of two
  assert.equal(restoreState({ tiles: [{ r: 0, c: 0, v: 2 }, { r: 0, c: 0, v: 4 }] }), null); // two on one cell
  assert.equal(restoreState({ tiles: [{ r: 4, c: 0, v: 2 }] }), null);
  assert.equal(restoreState({ tiles: [] }), null);
});

test('a random playout always leaves a legal board and a score equal to the merged total', () => {
  let seed = 7;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const state = createState(rng);
  let total = 0;
  for (let i = 0; i < 4000 && !state.over; i += 1) {
    const r = move(state, ['left', 'up', 'right', 'down'][Math.floor(rng() * 4)], rng);
    if (r.ok) total += r.gained;
    assert.ok(state.tiles.length <= 16);
    assert.equal(new Set(state.tiles.map((t) => t.r * 4 + t.c)).size, state.tiles.length);
  }
  assert.equal(state.score, total);
  assert.ok(state.moves > 20);
  assert.equal(G2048.size, 4);
});
