import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countSolutions, createGame, DIFFS, DIFF_IDS, emptyCount, erase, firstOpen, fullGrid, generate, hint, isLocked, isWrong, MISTAKES,
  noteBit, pack, PEERS, place, placed, solvableBySingles, solve, toggleNote, undo, unpack
} from '../sudoku-core.js';

// A small repeatable rng, so a puzzle can be named by its seed.
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const digits = (text) => [...text].map(Number);
const valid = (grid) => {
  for (let k = 0; k < 9; k += 1) {
    const row = new Set(), col = new Set(), box = new Set();
    for (let j = 0; j < 9; j += 1) {
      row.add(grid[k * 9 + j]); col.add(grid[j * 9 + k]);
      box.add(grid[(Math.floor(k / 3) * 3 + Math.floor(j / 3)) * 9 + (k % 3) * 3 + (j % 3)]);
    }
    if (row.size !== 9 || col.size !== 9 || box.size !== 9) return false;
  }
  return !grid.includes(0);
};
const make = (seed = 11, diff = 'easy') => createGame(generate(diff, seeded(seed)));
// First empty cell, and a digit that is wrong for it.
const wrongFor = (state, i) => [1, 2, 3, 4, 5, 6, 7, 8, 9].find((d) => d !== Number(state.solution[i]));

test('a generated full grid obeys every row, column and box', () => {
  assert.equal(valid(fullGrid(seeded(3))), true);
  assert.notDeepEqual(fullGrid(seeded(3)), fullGrid(seeded(4)));
});

test('every level makes a puzzle with exactly one solution that matches the stored answer', () => {
  for (const diff of DIFF_IDS) {
    for (const seed of [1, 2, 3]) {
      const g = generate(diff, seeded(seed));
      const start = digits(g.puzzle);
      assert.equal(countSolutions(start, 2), 1, `${diff}/${seed}`);
      assert.deepEqual(solve(start), digits(g.solution), `${diff}/${seed}`);
      assert.ok(start.every((d, i) => !d || d === Number(g.solution[i])));
    }
  }
});

test('the levels differ the way they say: givens and the techniques they need', () => {
  const clues = (diff, seed) => digits(generate(diff, seeded(seed)).puzzle).filter(Boolean).length;
  for (const seed of [5, 6, 7]) {
    assert.equal(clues('easy', seed), DIFFS.easy.clues);
    assert.equal(clues('normal', seed), DIFFS.normal.clues);
    assert.ok(clues('hard', seed) <= DIFFS.hard.clues + 3);
    assert.equal(solvableBySingles(digits(generate('easy', seeded(seed)).puzzle)), true);
    assert.equal(solvableBySingles(digits(generate('normal', seeded(seed)).puzzle)), true);
    assert.equal(solvableBySingles(digits(generate('hard', seeded(seed)).puzzle)), false);
  }
});

test('the solver rejects a grid whose givens clash and finds several answers for an open one', () => {
  const clash = Array(81).fill(0);
  clash[0] = 5; clash[1] = 5;
  assert.equal(countSolutions(clash), 0);
  assert.equal(countSolutions(Array(81).fill(0), 2), 2);
});

test('peers: every cell sees 20 others, none of them itself', () => {
  assert.ok(PEERS.every((list, i) => list.length === 20 && !list.includes(i)));
});

test('a right digit is kept and clears that candidate from the cells that see it', () => {
  const state = make();
  const i = firstOpen(state);
  const d = Number(state.solution[i]);
  const seer = PEERS[i].find((j) => state.cells[j] === 0);
  state.notes[seer] = noteBit(d) | noteBit(d === 9 ? 1 : d + 1);
  assert.deepEqual(place(state, i, d), { ok: true, correct: true });
  assert.equal(state.cells[i], d);
  assert.equal(state.notes[seer] & noteBit(d), 0);
  assert.notEqual(state.notes[seer], 0); // the other candidate stays
  assert.equal(isLocked(state, i), true);
  assert.equal(place(state, i, wrongFor(state, i)).reason, 'locked');
  assert.equal(state.mistakes, 0);
});

test('a wrong digit is shown, counted, and can be replaced; three of them lose the game', () => {
  const state = make();
  const open = state.cells.map((d, i) => (d ? -1 : i)).filter((i) => i >= 0);
  const [a, b, c] = open;
  assert.deepEqual(place(state, a, wrongFor(state, a)), { ok: true, correct: false });
  assert.equal(isWrong(state, a), true);
  assert.equal(state.mistakes, 1);
  assert.equal(place(state, a, Number(state.solution[a])).correct, true); // fixed
  place(state, b, wrongFor(state, b));
  assert.equal(state.status, 'playing');
  place(state, c, wrongFor(state, c));
  assert.equal(state.mistakes, MISTAKES);
  assert.equal(state.status, 'lost');
  assert.equal(place(state, open[3], Number(state.solution[open[3]])).reason, 'over');
});

test('givens cannot be changed or erased', () => {
  const state = make();
  const g = state.given.indexOf(true);
  assert.equal(place(state, g, wrongFor(state, g)).ok, false);
  assert.equal(erase(state, g).ok, false);
  assert.equal(toggleNote(state, g, 3).ok, false);
  assert.equal(state.mistakes, 0);
});

test('notes toggle on an empty cell and erase wipes them; erase also empties a wrong digit', () => {
  const state = make();
  const i = firstOpen(state);
  assert.equal(toggleNote(state, i, 4).ok, true);
  assert.equal(toggleNote(state, i, 7).ok, true);
  assert.equal(state.notes[i], noteBit(4) | noteBit(7));
  assert.equal(toggleNote(state, i, 4).ok, true);
  assert.equal(state.notes[i], noteBit(7));
  assert.equal(erase(state, i).ok, true);
  assert.equal(state.notes[i], 0);
  assert.equal(erase(state, i).ok, false); // nothing left to erase
  place(state, i, wrongFor(state, i));
  assert.equal(erase(state, i).ok, true);
  assert.equal(state.cells[i], 0);
  assert.equal(state.mistakes, 1); // the mistake stays
});

test('undo takes back the last entry, including the notes a right digit cleared', () => {
  const state = make();
  const i = firstOpen(state);
  const d = Number(state.solution[i]);
  const seer = PEERS[i].find((j) => state.cells[j] === 0);
  state.notes[seer] = noteBit(d);
  place(state, i, d);
  assert.equal(state.notes[seer], 0);
  assert.equal(undo(state).ok, true);
  assert.equal(state.cells[i], 0);
  assert.equal(state.notes[seer], noteBit(d));
  assert.equal(undo(state).ok, false);
  const j = firstOpen(state);
  place(state, j, wrongFor(state, j));
  undo(state);
  assert.equal(state.cells[j], 0);
  assert.equal(state.mistakes, 1); // undo does not refund a mistake
});

test('a hint reveals the right digit, counts, and fixes a wrong one', () => {
  const state = make();
  const i = firstOpen(state);
  assert.equal(hint(state, i).ok, true);
  assert.equal(state.cells[i], Number(state.solution[i]));
  assert.equal(state.hints, 1);
  assert.equal(hint(state, i).ok, false); // already right
  const j = firstOpen(state);
  place(state, j, wrongFor(state, j));
  assert.equal(hint(state, j).ok, true);
  assert.equal(state.cells[j], Number(state.solution[j]));
  assert.equal(state.hints, 2);
});

test('filling every cell correctly wins, and the tallies follow along', () => {
  const state = make();
  assert.equal(placed(state).slice(1).reduce((a, b) => a + b, 0), 81 - emptyCount(state));
  for (let i = 0; i < 81; i += 1) if (!state.given[i]) place(state, i, Number(state.solution[i]));
  assert.equal(state.status, 'won');
  assert.equal(emptyCount(state), 0);
  assert.deepEqual(placed(state).slice(1), Array(9).fill(9));
  assert.equal(state.mistakes, 0);
});

test('a saved game round-trips; a damaged one is refused', () => {
  const state = make(9, 'normal');
  const i = firstOpen(state);
  place(state, i, Number(state.solution[i]));
  const j = firstOpen(state);
  toggleNote(state, j, 5);
  const back = unpack(JSON.parse(JSON.stringify(pack(state))));
  assert.deepEqual(back.cells, state.cells);
  assert.deepEqual(back.notes, state.notes);
  assert.equal(back.diff, 'normal');
  assert.equal(unpack(null), null);
  assert.equal(unpack({ ...pack(state), diff: 'nope' }), null);
  assert.equal(unpack({ ...pack(state), cells: '123' }), null);
  const swapped = state.solution.slice(0, 80) + (state.solution[80] === '9' ? '1' : '9');
  assert.equal(unpack({ ...pack(state), solution: swapped }), null); // the answer must agree with the givens
  const cheat = state.puzzle.replace(/[1-9]/, (m) => String((Number(m) % 9) + 1));
  assert.equal(unpack({ ...pack(state), puzzle: cheat }), null);
});
