import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cellsOf, COLS, createState, DIFF_IDS, DIFFS, ghostY, gravityInterval, HIDDEN, hardDrop, hold, move, previews, restoreState,
  rotate, ROWS, SHAPES, snapshot, tick, TYPES
} from '../tetris-core.js';

const seeded = (seed) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
// The visible well written from the top down: each string is a row ('.' empty, a letter is a block), padded to the
// bottom of the board. `well(['..........', 'XXXXXXXXX.'])` has one nearly full row on the floor under an empty one.
const well = (rows) => {
  const board = Array.from({ length: ROWS }, () => '.'.repeat(COLS));
  rows.forEach((row, i) => { board[ROWS - rows.length + i] = row.padEnd(COLS, '.'); });
  return board;
};
// A game with this well and this piece (and the pieces after it) in hand.
const game = ({ rows = [], piece = 'T', rot = 0, x = 3, y = 0, queue = 'IOTSZJL', diff = 'normal', ...rest } = {}) =>
  restoreState({ diff, board: well(rows), piece: { type: piece, rot, x, y }, queue, ...rest }, seeded(1));
const kinds = (events) => events.map((e) => e.type);
const lockOf = (events) => events.find((e) => e.type === 'lock');
// Game time passes in small steps, like frames do.
const run = (state, seconds) => {
  const events = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.05) events.push(...tick(state, Math.min(0.05, seconds - t)));
  return events;
};
const FULL = 'IIIIIIIII.'; // a full row except the last column
const spare = 'I.........'; // keeps the well from being empty afterwards, so no perfect clear sneaks into a score

test('every piece is four distinct cells in every rotation; only the O looks the same turned', () => {
  for (const type of TYPES) for (let rot = 0; rot < 4; rot += 1) assert.equal(new Set(SHAPES[type][rot].map(String)).size, 4);
  assert.deepEqual(SHAPES.O[1], SHAPES.O[0]);
  assert.notDeepEqual(SHAPES.T[1], SHAPES.T[0]);
  assert.deepEqual(SHAPES.I[1].map(([x]) => x), [2, 2, 2, 2]);
});

test('a new game has a piece born in the middle, the first level of its difficulty, and a full preview queue', () => {
  for (const diff of DIFF_IDS) {
    const state = createState(diff, seeded(3));
    assert.equal(state.level, DIFFS[diff].start);
    assert.equal(state.score, 0);
    assert.equal(state.piece.x, 3);
    assert.equal(previews(state, 3).length, 3);
    assert.equal(state.over, false);
  }
  assert.equal(createState('nonsense').diff, 'normal');
});

test('the 7-bag deals every piece once before any repeats', () => {
  const state = createState('normal', seeded(7));
  const dealt = [state.piece.type, ...previews(state, 13)];
  assert.deepEqual(dealt.slice(0, 7).sort(), [...TYPES].sort());
  assert.deepEqual(dealt.slice(7, 14).sort(), [...TYPES].sort());
});

test('the piece slides sideways up to the wall, and stops at blocks', () => {
  const state = game({ piece: 'O', y: ROWS - 2, rows: ['......I...'] });
  while (move(state, -1));
  assert.equal(Math.min(...cellsOf('O', 0, state.piece.x, state.piece.y).map(([c]) => c)), 0);
  while (move(state, 1));
  assert.equal(Math.max(...cellsOf('O', 0, state.piece.x, state.piece.y).map(([c]) => c)), 5);
});

test('rotating turns the piece both ways, and the O never changes', () => {
  const state = game({ piece: 'T', y: 5 });
  assert.equal(rotate(state, 1), true);
  assert.equal(state.piece.rot, 1);
  assert.equal(rotate(state, -1), true);
  assert.equal(rotate(state, -1), true);
  assert.equal(state.piece.rot, 3);
  assert.equal(rotate(game({ piece: 'O', y: 5 }), 1), false);
});

test('a piece against the wall kicks sideways when it turns', () => {
  const state = game({ piece: 'I', rot: 1, x: -2, y: 5 }); // a vertical I standing in column 0
  assert.equal(rotate(state, 1), true);
  assert.equal(state.piece.rot, 2);
  assert.ok(cellsOf('I', 2, state.piece.x, state.piece.y).every(([c]) => c >= 0 && c < COLS));
  // A piece that fits nowhere after turning stays as it was.
  const pit = game({ piece: 'I', rot: 1, x: 1, y: ROWS - 4, rows: Array(4).fill('III.IIIIII') }); // standing in a one-wide, four-deep slot
  assert.equal(rotate(pit, 1), false);
  assert.equal(pit.piece.rot, 1);
});

test('gravity pulls the piece down at the level\'s speed, and the interval shrinks every level and with difficulty', () => {
  const state = game({ piece: 'T', y: 0 });
  const y0 = state.piece.y;
  run(state, gravityInterval(1, 'normal') * 3 + 0.01);
  assert.equal(state.piece.y, y0 + 3);
  assert.ok(gravityInterval(2, 'normal') < gravityInterval(1, 'normal'));
  assert.ok(gravityInterval(1, 'easy') > gravityInterval(1, 'normal'));
  assert.ok(gravityInterval(1, 'hard') < gravityInterval(1, 'normal'));
  assert.ok(gravityInterval(30, 'normal') < 0.001);
});

test('soft drop is faster than gravity and pays a point per row; hard drop pays two per row', () => {
  const soft = game({ piece: 'T', y: 0 });
  soft.soft = true;
  const y0 = soft.piece.y;
  run(soft, 0.5);
  assert.ok(soft.piece.y - y0 >= 10);
  assert.equal(soft.score, soft.piece.y - y0);

  const hard = game({ piece: 'T', y: 0 });
  const rows = ghostY(hard) - hard.piece.y;
  assert.equal(kinds(hardDrop(hard))[0], 'lock');
  assert.equal(hard.score, rows * 2);
  assert.ok(hard.piece.y <= 1); // the next piece is already in
});

test('a landed piece can still slide until the lock delay runs out, then it locks and the next one comes', () => {
  const state = game({ piece: 'O', y: 0 });
  state.piece.y = ghostY(state);
  run(state, DIFFS.normal.lock - 0.1);
  assert.equal(state.board[ROWS - 1].some(Boolean), false);
  assert.equal(move(state, 1), true); // sliding restarts the clock
  run(state, DIFFS.normal.lock - 0.1);
  assert.equal(state.board[ROWS - 1].some(Boolean), false);
  assert.ok(kinds(run(state, 0.2)).includes('lock'));
  assert.equal(state.board[ROWS - 1].filter(Boolean).length, 2);
  assert.equal(state.piece.type, 'I'); // the first of the queue
});

test('stalling on the ground cannot go on forever: only so many slides restart the clock', () => {
  const state = game({ piece: 'O', y: 0 });
  state.piece.y = ghostY(state);
  let slides = 0;
  for (let i = 0; i < 200 && !state.board[ROWS - 1].some(Boolean); i += 1) {
    run(state, DIFFS.normal.lock * 0.6);
    if (!state.board[ROWS - 1].some(Boolean) && move(state, i % 2 ? 1 : -1)) slides += 1;
  }
  assert.ok(state.board[ROWS - 1].some(Boolean), 'the piece locked in the end');
  assert.ok(slides <= 20);
});

test('clearing 1, 2, 3 or 4 rows scores 100, 300, 500 or 800 times the level', () => {
  for (const [n, points] of [[1, 100], [2, 300], [3, 500], [4, 800]]) {
    const state = game({ piece: 'I', rot: 1, x: 7, y: 0, rows: [spare, ...Array(n).fill(FULL)] }); // a vertical I down the open column 9
    const lock = lockOf(hardDrop(state));
    assert.equal(lock.lines, n);
    assert.equal(lock.gained, points, `${n} rows`);
  }
  const level3 = game({ piece: 'I', rot: 1, x: 7, y: 0, rows: [spare, FULL], lines: 20 });
  assert.equal(level3.level, 3);
  assert.equal(lockOf(hardDrop(level3)).gained, 300);
});

test('cleared rows drop everything above them, and the line count adds up', () => {
  const state = game({ piece: 'I', rot: 1, x: 7, y: 0, rows: ['.I........', FULL] });
  const events = hardDrop(state);
  assert.equal(lockOf(events).lines, 1);
  assert.equal(state.lines, 1);
  assert.equal(state.board[ROWS - 1][1], 'I'); // what sat above the cleared row came down
  assert.equal(state.board[ROWS - 2].filter(Boolean).length, 1); // and the rest of the vertical I
});

test('every perLevel lines is a new level (10 normal, 12 easy, 8 hard), and the level-up is announced', () => {
  for (const diff of DIFF_IDS) {
    const { perLevel, start } = DIFFS[diff];
    const state = game({ diff, piece: 'I', rot: 1, x: 7, y: 0, rows: [spare, FULL], lines: perLevel - 1 });
    assert.equal(state.level, start);
    const events = hardDrop(state);
    assert.deepEqual(events.filter((e) => e.type === 'level').map((e) => e.level), [start + 1]);
    assert.equal(state.level, start + 1);
  }
});

test('clears in a row build a combo that pays 50 per step, and a lock that clears nothing breaks it', () => {
  const state = game({ piece: 'I', rot: 1, x: 7, y: 0, rows: [spare, FULL] });
  assert.equal(lockOf(hardDrop(state)).combo, 0);
  state.board = well([spare, FULL]).map((r) => [...r].map((c) => (c === '.' ? 0 : c)));
  state.piece = { type: 'I', rot: 1, x: 7, y: 0 };
  const second = lockOf(hardDrop(state));
  assert.equal(second.combo, 1);
  assert.equal(second.gained, 100 + 50);
  const miss = lockOf(hardDrop(state));
  assert.equal(miss.lines, 0);
  assert.equal(state.combo, -1);
});

test('tetrises back to back pay half again, and an ordinary clear ends the streak', () => {
  const four = [spare, FULL, FULL, FULL, FULL];
  const state = game({ piece: 'I', rot: 1, x: 7, y: 0, rows: four });
  const a = lockOf(hardDrop(state));
  assert.deepEqual([a.b2b, a.gained], [false, 800]);
  state.board = well(four).map((r) => [...r].map((c) => (c === '.' ? 0 : c)));
  state.piece = { type: 'I', rot: 1, x: 7, y: 0 };
  state.combo = -1;
  const b = lockOf(hardDrop(state));
  assert.deepEqual([b.b2b, b.gained], [true, 1200]);
  state.board = well([spare, FULL]).map((r) => [...r].map((c) => (c === '.' ? 0 : c)));
  state.piece = { type: 'I', rot: 1, x: 7, y: 0 };
  state.combo = -1;
  hardDrop(state);
  assert.equal(state.b2b, false);
});

test('an empty well after a clear is a perfect clear and pays a bonus', () => {
  const state = game({ piece: 'I', rot: 0, x: 0, y: 0, rows: ['....IIIIII'] });
  const lock = lockOf(hardDrop(state));
  assert.equal(lock.lines, 1);
  assert.equal(lock.perfect, true);
  assert.equal(lock.gained, 100 + 800);
  assert.equal(lockOf(hardDrop(game({ piece: 'I', rot: 1, x: 7, y: 0, rows: [FULL] }))).perfect, false);
});

// A T pointing down into a one-block hole, with a block over its top-left corner: three corners are taken.
const spinWell = ['...I......', 'III...IIII', 'IIII.IIIII'];
test('a T that was turned into a tight spot is a T-spin and pays well; the same lock after a plain move does not', () => {
  const spin = game({ piece: 'T', rot: 2, x: 3, y: ROWS - 3, rows: spinWell });
  spin.lastMove = 'rotate';
  const lock = lockOf(hardDrop(spin));
  assert.deepEqual([lock.lines, lock.tspin, lock.gained], [2, 'full', 1200]);

  const plain = game({ piece: 'T', rot: 2, x: 3, y: ROWS - 3, rows: spinWell });
  plain.lastMove = 'move';
  const flat = lockOf(hardDrop(plain));
  assert.deepEqual([flat.lines, flat.tspin, flat.gained], [2, null, 300]);
});

test('a T-spin with no lines still scores, but a spin with only one front corner is just a mini', () => {
  const none = game({ piece: 'T', rot: 2, x: 3, y: ROWS - 3, rows: ['...I......', 'II....IIII', 'IIII.IIIII'] });
  none.lastMove = 'rotate';
  const zero = lockOf(hardDrop(none));
  assert.deepEqual([zero.lines, zero.tspin, zero.gained], [1, 'full', 800]);
  const mini = game({ piece: 'T', rot: 2, x: 3, y: ROWS - 3, rows: ['...I.I....', 'III...IIII', 'III..IIIII'] });
  mini.lastMove = 'rotate';
  const small = lockOf(hardDrop(mini));
  assert.equal(small.tspin, 'mini');
});

test('a T-spin line clear and a tetris both count for back to back', () => {
  const spin = game({ piece: 'T', rot: 2, x: 3, y: ROWS - 3, rows: spinWell });
  spin.lastMove = 'rotate';
  spin.b2b = true;
  const lock = lockOf(hardDrop(spin));
  assert.equal(lock.b2b, true);
  assert.equal(lock.gained, 1800);
});

test('hold swaps the piece once per turn; an empty hold takes the next piece from the queue', () => {
  const state = game({ piece: 'T', queue: 'ISZJLOT' });
  assert.deepEqual(kinds(hold(state)), ['hold']);
  assert.equal(state.hold, 'T');
  assert.equal(state.piece.type, 'I');
  assert.deepEqual(hold(state), []); // already held this turn
  hardDrop(state);
  assert.equal(state.holdUsed, false);
  const now = state.piece.type;
  hold(state);
  assert.equal(state.hold, now);
  assert.equal(state.piece.type, 'T'); // the one that was held comes back
});

test('the ghost is where a hard drop would land', () => {
  const state = game({ piece: 'L', x: 0, y: 0, rows: ['....IIIIII'] });
  const y = ghostY(state);
  assert.equal(Math.max(...cellsOf('L', 0, state.piece.x, y).map(([, r]) => r)), ROWS - 1);
  hardDrop(state);
  assert.equal(state.board[ROWS - 1].filter(Boolean).length, 9);
});

test('the game ends when a new piece has no room, and then nothing moves any more', () => {
  const state = game({ piece: 'O', queue: 'OOOOOOO', rows: [] });
  for (const r of [0, 1, 2, 3]) state.board[r] = [0, 0, 0, 'I', 'I', 0, 0, 0, 0, 0];
  const events = hardDrop(state);
  assert.equal(state.over, true);
  assert.ok(kinds(events).includes('over'));
  assert.deepEqual(tick(state, 1), []);
  assert.equal(hardDrop(state).length, 0);
  assert.equal(move(state, 1), false);
  assert.equal(rotate(state, 1), false);
  assert.deepEqual(hold(state), []);
});

test('a piece that locks entirely above the well also ends the game', () => {
  const state = game({ piece: 'O', rows: [] });
  for (let r = HIDDEN; r < ROWS; r += 1) state.board[r] = [...'IIII.IIIII'].map((c) => (c === '.' ? 0 : c));
  state.board[HIDDEN][4] = 0;
  state.piece = { type: 'O', rot: 0, x: 3, y: 0 };
  const events = hardDrop(state);
  assert.equal(state.over, true);
  assert.equal(events.at(-1).reason, 'lockout');
});

test('a saved game comes back as the same game, and odd saves are refused', () => {
  const state = createState('hard', seeded(5));
  for (let i = 0; i < 6; i += 1) { move(state, i % 2 ? 1 : -1); hardDrop(state); }
  const saved = JSON.parse(JSON.stringify(snapshot(state)));
  const back = restoreState(saved, seeded(9));
  assert.deepEqual(snapshot(back), snapshot(state));
  assert.equal(back.level, state.level);
  assert.equal(restoreState(null), null);
  assert.equal(restoreState({ ...saved, diff: 'insane' }), null);
  assert.equal(restoreState({ ...saved, board: saved.board.slice(1) }), null);
  assert.equal(restoreState({ ...saved, board: saved.board.map((r) => r.replace('.', 'Q')) }), null);
});

test('difficulty sets the pace and the help: easy is gentler, hard starts fast with less preview and no ghost', () => {
  assert.ok(DIFFS.easy.speed < DIFFS.normal.speed && DIFFS.normal.speed < DIFFS.hard.speed);
  assert.ok(DIFFS.easy.lock > DIFFS.normal.lock && DIFFS.normal.lock > DIFFS.hard.lock);
  assert.ok(DIFFS.hard.start > DIFFS.normal.start);
  assert.ok(DIFFS.easy.perLevel > DIFFS.normal.perLevel && DIFFS.normal.perLevel > DIFFS.hard.perLevel);
  assert.ok(DIFFS.easy.preview >= DIFFS.normal.preview && DIFFS.normal.preview > DIFFS.hard.preview);
  assert.ok(DIFFS.easy.ghost && DIFFS.normal.ghost && !DIFFS.hard.ghost);
  const fallen = (diff) => { const s = createState(diff, seeded(2)); const y = s.piece.y; run(s, 1); return s.piece.y - y; };
  assert.ok(fallen('easy') < fallen('normal') && fallen('normal') < fallen('hard'));
});

test('a long random game never breaks the board: every locked cell is a piece letter inside the well', () => {
  const rng = seeded(31);
  const state = createState('normal', rng);
  for (let i = 0; i < 400 && !state.over; i += 1) {
    const r = rng();
    if (r < 0.3) move(state, -1); else if (r < 0.6) move(state, 1); else if (r < 0.8) rotate(state, 1); else hardDrop(state);
    run(state, 0.05);
  }
  assert.equal(state.board.length, ROWS);
  assert.ok(state.board.every((row) => row.length === COLS && row.every((c) => c === 0 || TYPES.includes(c))));
  assert.ok(state.pieces > 5);
});
