import test from 'node:test';
import assert from 'node:assert/strict';
import { addTube, casualFailRate, createLevel, createState, findHint, generateLevel, legalMoves, LEVELS, movesOf, outcome, pour, POUR, propsUsed, shuffle, solve, stageScore, stars, STAGES, topRun, undo } from '../pour-core.js';

// A hand-built game from tubes written bottom to top. Colours are small integers.
const build = (tubes, par = 10) => createState({ stage: 1, seed: 1, tubes, par });

test('topRun reads the run of liquid on top', () => {
  assert.equal(topRun([]), null);
  assert.deepEqual(topRun([1, 2, 2]), { color: 2, len: 2 });
  assert.deepEqual(topRun([3, 3, 3, 3]), { color: 3, len: 4 });
  assert.deepEqual(topRun([1, 2]), { color: 2, len: 1 });
});

test('a pour moves the whole top run onto the same colour or an empty tube', () => {
  const state = build([[0, 1, 1], [1], [], [2, 2, 0]]);
  const r = pour(state, 0, 1);
  assert.equal(r.ok, true);
  assert.equal(r.count, 2);
  assert.deepEqual(state.tubes[0], [0]);
  assert.deepEqual(state.tubes[1], [1, 1, 1]);
  assert.equal(pour(state, 1, 2).ok, true);
  assert.deepEqual(state.tubes[2], [1, 1, 1]);
  assert.equal(state.moves, 2);
});

test('only as much as fits is poured, and the rest stays behind', () => {
  const state = build([[0, 1, 1, 1], [2, 1], []]);
  const r = pour(state, 0, 1);
  assert.equal(r.count, 2);
  assert.deepEqual(state.tubes[0], [0, 1]);
  assert.deepEqual(state.tubes[1], [2, 1, 1, 1]);
});

test('illegal pours change nothing and cost nothing', () => {
  const state = build([[0, 1], [2], [], [3, 3, 3, 3]]);
  const before = JSON.stringify(state);
  assert.equal(pour(state, 0, 1).reason, 'color');
  assert.equal(pour(state, 2, 0).reason, 'empty');
  assert.equal(pour(state, 0, 0).reason, 'bad-tube');
  assert.equal(pour(state, 0, 9).reason, 'bad-tube');
  assert.equal(pour(state, 1, 3).reason, 'full');
  assert.equal(JSON.stringify(state), before);
});

test('a tube filled with one colour is sealed, shelved and closed', () => {
  const state = build([[0, 0, 1, 1], [1, 1], [2]]);
  const r = pour(state, 0, 1);
  assert.deepEqual(r.events.map((e) => e.type), ['pour', 'seal']);
  assert.equal(state.sealed[1], true);
  assert.deepEqual(state.tubes[1], []);
  assert.deepEqual(state.collected, [1]);
  // nothing can pour into a sealed tube, even though it looks empty
  assert.equal(pour(state, 2, 1).reason, 'sealed');
  assert.equal(pour(state, 1, 2).reason, 'sealed');
  assert.ok(legalMoves(state).every((m) => m.to !== 1 && m.from !== 1));
});

test('legal moves skip pointless ones', () => {
  // tube 0 is all one colour: moving it into an empty tube changes nothing; two empties are the same
  const moves = movesOf([[0, 0], [], []], 4);
  assert.deepEqual(moves, []);
  const mixed = movesOf([[0, 1], [], []], 4);
  assert.equal(mixed.length, 1);
  assert.deepEqual(mixed[0], { from: 0, to: 1, count: 1 });
});

test('outcome: won, playing, stuck and lost', () => {
  const fresh = build([[0, 0, 1, 1], [1, 1], [0, 0]]);
  assert.equal(outcome(fresh), 'playing');
  pour(fresh, 0, 1);
  assert.equal(outcome(fresh), 'playing');
  pour(fresh, 0, 2);
  assert.equal(outcome(fresh), 'won');

  // two tubes, both full and mixed, nothing matches
  const stuck = build([[0, 1, 0, 1], [1, 0, 1, 0]]);
  assert.equal(outcome(stuck), 'stuck');
  stuck.left = { undo: 0, add: 0, shuffle: 0 };
  assert.equal(outcome(stuck), 'lost');
});

test('undo restores the board, the shelf and the move count, and spends one use', () => {
  const state = build([[0, 0, 1, 1], [1, 1], [0, 0]]);
  const first = JSON.stringify(state.tubes);
  pour(state, 0, 1); // seals tube 1
  assert.equal(state.collected.length, 1);
  assert.equal(undo(state).ok, true);
  assert.equal(JSON.stringify(state.tubes), first);
  assert.deepEqual(state.sealed, [false, false, false]);
  assert.deepEqual(state.collected, []);
  assert.equal(state.moves, 0);
  assert.equal(state.left.undo, POUR.UNDO - 1);
  assert.equal(undo(state).reason, 'nothing');
});

test('undo runs out after its uses', () => {
  const state = build([[0, 1], [0], [1], []]);
  for (let i = 0; i < POUR.UNDO; i += 1) {
    assert.equal(pour(state, 0, 2).ok, true);
    assert.equal(undo(state).ok, true);
  }
  pour(state, 0, 2);
  assert.equal(undo(state).reason, 'none-left');
});

test('an added tube survives an undo, empty', () => {
  const state = build([[0, 1], [0], [1]]);
  pour(state, 0, 1);
  assert.equal(addTube(state).ok, true);
  assert.equal(state.tubes.length, 4);
  pour(state, 1, 3);
  undo(state); // takes back the pour into the new tube
  assert.equal(state.tubes.length, 4);
  assert.deepEqual(state.tubes[3], []);
  undo(state); // takes back the first pour
  assert.equal(state.tubes.length, 4);
  assert.deepEqual(state.tubes[0], [0, 1]);
});

test('addTube is limited to its uses', () => {
  const state = build([[0, 1], [0], [1]]);
  assert.equal(addTube(state).ok, true);
  assert.equal(addTube(state).reason, 'none-left');
  assert.equal(state.tubes.length, 4);
  assert.equal(state.sealed.length, 4);
});

test('shuffle re-deals the open tubes, keeps fill levels, leaves the level winnable', () => {
  const state = createLevel(3, 7);
  const sizes = state.tubes.map((t) => t.length);
  const cells = state.tubes.flat().sort();
  const before = JSON.stringify(state.tubes);
  const r = shuffle(state);
  assert.equal(r.ok, true);
  assert.notEqual(JSON.stringify(state.tubes), before);
  assert.deepEqual(state.tubes.map((t) => t.length), sizes);
  assert.deepEqual(state.tubes.flat().sort(), cells);
  assert.equal(solve(state.tubes, { weight: 3 }).ok, true);
  assert.equal(state.left.shuffle, POUR.SHUFFLE - 1);
  assert.equal(shuffle(state).reason, 'none-left');
  // and it can be taken back
  assert.equal(undo(state).ok, true);
  assert.equal(JSON.stringify(state.tubes), before);
});

test('shuffle leaves sealed tubes alone and is deterministic', () => {
  const make = () => {
    const s = build([[3, 3, 1, 1], [1, 1], [0, 2, 0, 2], [2, 0, 2, 0], [3, 3], []]);
    pour(s, 0, 1);
    return s;
  };
  const a = make();
  const b = make();
  assert.equal(shuffle(a).ok, true);
  assert.equal(shuffle(b).ok, true);
  assert.deepEqual(a.tubes, b.tubes);
  assert.equal(a.sealed[1], true);
  assert.deepEqual(a.tubes[1], []);
});

test('the solver finds the shortest solution', () => {
  // cap 2: 0 over 1 in tube A, 1 over 0 in tube B, one empty tube. Three pours is the best.
  const r = solve([[0, 1], [1, 0], []], { cap: 2 });
  assert.equal(r.ok, true);
  assert.equal(r.exact, true);
  assert.equal(r.moves.length, 3);
  assert.deepEqual(solve([[], []]).moves, []);
});

test('the solver replays to a win and says no to an unwinnable position', () => {
  const state = createLevel(2, 3);
  const r = solve(state.tubes);
  assert.equal(r.ok, true);
  for (const move of r.moves) assert.equal(pour(state, move.from, move.to).ok, true, 'solver move should be legal');
  assert.equal(outcome(state), 'won');
  assert.equal(state.moves, r.moves.length);
  // full mixed tubes and no spare tube: no move exists at all
  assert.equal(solve([[0, 1, 0, 1], [1, 0, 1, 0]]).ok, false);
});

test('a hint is a legal move that keeps the level winnable', () => {
  const state = createLevel(4, 5);
  for (let i = 0; i < 6; i += 1) {
    const hint = findHint(state);
    assert.ok(hint, 'hint');
    assert.equal(pour(state, hint.from, hint.to).ok, true);
  }
  assert.equal(solve(state.tubes.map((t, i) => (state.sealed[i] ? null : t)), { weight: 3 }).ok, true);
  assert.equal(findHint(build([[0, 1, 0, 1], [1, 0, 1, 0]])), null);
});

test('every stage makes a solvable, non-trivial level, the same one for the same seed', () => {
  for (let stage = 1; stage <= STAGES; stage += 1) {
    for (const seed of [1, 2]) {
      const def = generateLevel(stage, seed);
      const { colors, empty } = LEVELS[stage - 1];
      assert.equal(def.tubes.length, colors + empty);
      assert.deepEqual(def.tubes.flat().sort((a, b) => a - b), Array.from({ length: colors * POUR.CAP }, (_, i) => Math.floor(i / POUR.CAP)));
      assert.ok(def.tubes.every((t) => t.length === POUR.CAP || t.length === 0), 'full or empty at the start');
      assert.ok(def.tubes.every((t) => !(t.length && t.every((c) => c === t[0]))), 'nothing sorted at the start');
      assert.ok(def.par >= colors, `stage ${stage} seed ${seed}: par ${def.par}`);
      // par is a real, playable solution
      const state = createState(def);
      const r = solve(def.tubes, { weight: 3 });
      assert.equal(r.ok, true);
      for (const move of r.moves) assert.equal(pour(state, move.from, move.to).ok, true);
      assert.equal(outcome(state), 'won');
      assert.ok(r.moves.length >= def.par || !def.exact, 'exact par is the minimum');
      assert.deepEqual(generateLevel(stage, seed), def);
    }
  }
});

test('stars follow par and cost one per prop used; the stage score adds the shelf', () => {
  const state = build([[0, 1]], 4);
  state.collected = [0, 1, 2];
  state.moves = 4;
  assert.equal(stars(state), 3);
  state.moves = 5; // 4 * 1.3 rounds up to 6
  assert.equal(stars(state), 2);
  state.moves = 6;
  assert.equal(stars(state), 2);
  state.moves = 7;
  assert.equal(stars(state), 1);
  state.moves = 4;
  state.left.undo -= 1;
  assert.equal(propsUsed(state), 1);
  assert.equal(stars(state), 2);
  state.left.add -= 1;
  state.left.shuffle -= 1;
  assert.equal(stars(state), 1);
  assert.equal(stageScore(state), 3 * POUR.PER_TUBE + POUR.STAR_BONUS[0]);
  state.left = { undo: POUR.UNDO, add: POUR.ADD_TUBE, shuffle: POUR.SHUFFLE };
  assert.equal(stageScore(state), 3 * POUR.PER_TUBE + POUR.STAR_BONUS[2]);
});

test('a short-sighted player breezes through the first stages and gets stuck on the last', () => {
  const rate = (stage) => casualFailRate(generateLevel(stage, 1), { runs: 20 });
  assert.ok(rate(1) <= 0.2, 'stage 1 should be easy');
  assert.ok(rate(STAGES) >= 0.8, 'the last stage should need planning');
  // same seed, same rate
  const def = generateLevel(6, 1);
  assert.equal(casualFailRate(def, { seed: 3 }), casualFailRate(def, { seed: 3 }));
});
