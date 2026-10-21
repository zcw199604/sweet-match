import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVE, HOLES, addHole, coverOf, createLevel, findHint, isFree, outcome, tapScrew } from '../screw-core.js';

// 手摆：两块板子，上面那块（z=1）盖住下面那块的一颗螺丝
function hand() {
  const plates = [{ id: 0, x: 0, y: 0, w: 100, h: 40, z: 0, tint: 0, fallen: false }, { id: 1, x: 60, y: 0, w: 40, h: 100, z: 1, tint: 1, fallen: false }];
  const screws = [
    { id: 0, plate: 0, x: 18, y: 20, color: 0, where: 'board' },
    { id: 1, plate: 0, x: 80, y: 20, color: 0, where: 'board' },
    { id: 2, plate: 1, x: 80, y: 80, color: 0, where: 'board' }
  ];
  return { level: 1, seed: 1, plates, screws, queue: [1], active: [{ color: 0, filled: [] }, null], tray: [], holes: HOLES, extra: 1, moves: 0 };
}

test('a screw under a higher plate cannot be turned until that plate falls', () => {
  const state = hand();
  assert.deepEqual(coverOf(state, state.screws[1]).map((p) => p.id), [1]);
  assert.equal(tapScrew(state, 1), null);
  const events = tapScrew(state, 2);
  assert.deepEqual(events.map((e) => e.type), ['to-box', 'fall']);
  assert.equal(state.plates[1].fallen, true);
  assert.equal(isFree(state, 1), true);
  tapScrew(state, 0);
  const last = tapScrew(state, 1);
  assert.ok(last.some((e) => e.type === 'box-done'));
  assert.ok(last.some((e) => e.type === 'box-new' && e.color === 1));
  assert.equal(outcome(state), 'won');
});

test('screws with no matching box wait in the holes and jump in when their box arrives', () => {
  const state = hand();
  state.screws.forEach((s) => { s.color = 1; });
  state.plates[1].z = -1; // 不再盖住
  tapScrew(state, 0);
  assert.deepEqual(state.tray, [0]);
  state.active[0].filled = [9, 9, 9]; // 假装第一盒满了：结算时换上颜色 1 的盒子
  state.screws[9] = { id: 9, plate: 0, x: 0, y: 0, color: 0, where: 'box' };
  const events = tapScrew(state, 1);
  assert.ok(events.some((e) => e.type === 'tray-to-box' && e.id === 0));
  assert.deepEqual(state.tray, []);
});

test('full holes with nothing that fits a box lose, and one extra hole can be added per level', () => {
  const state = hand();
  state.tray = [0, 0, 0, 0, 0];
  state.screws.forEach((s) => { s.color = 3; });
  assert.equal(outcome(state), 'lost');
  assert.equal(addHole(state), true);
  assert.equal(state.holes, HOLES + 1);
  assert.equal(outcome(state), 'playing');
  assert.equal(addHole(state), false);
});

test('every level can be cleared in its witness order without filling the holes', () => {
  for (const level of [1, 3, 6, 10, 20]) {
    for (const seed of [1, 4, 9]) {
      const state = createLevel(level, seed);
      assert.equal(state.screws.length % 3, 0);
      assert.equal(state.active.length, ACTIVE);
      for (const id of state.witness) {
        assert.ok(tapScrew(state, id), `level ${level} seed ${seed}: screw ${id} refused`);
        assert.ok(state.tray.length < HOLES);
      }
      assert.equal(outcome(state), 'won');
      assert.equal(findHint(state), null);
    }
  }
});

test('upper plates press down on lower screws, more as levels climb', () => {
  const coveredShare = (level) => {
    let covered = 0, total = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const state = createLevel(level, seed);
      for (const s of state.screws.filter((x) => state.plates[x.plate].z === 0)) {
        total += 1;
        if (coverOf(state, s).length) covered += 1;
      }
    }
    return covered / total;
  };
  assert.ok(coveredShare(5) > 0.45);
  assert.ok(coveredShare(10) > 0.6);
  assert.ok(coveredShare(15) > 0.7);
});
