import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseReward, createQuest, enemyStep, findMatches, finishMove, intentPower, PERKS, QUEST, resolveStep, setTarget, swapTiles, validSwaps } from '../quest-core.js';

const W = 0, M = 1, G = 2, P = 3;
// A board with no match anywhere: along a row the type steps by 1, down a column by 2.
const calm = () => Array.from({ length: QUEST.ROWS }, (_, r) => Array.from({ length: QUEST.COLS }, (_, c) => (2 * r + c) % 4));
// The pattern repeats every four columns, so the tile just past a line could join it: change that one.
function cap(board, type, length, row = 0) {
  if (length >= QUEST.COLS || board[row][length] !== type) return;
  const near = [board[row][length + 1], board[row + 1]?.[length], board[row - 1]?.[length]];
  board[row][length] = [0, 1, 2, 3].find((value) => value !== type && !near.includes(value));
}
// Drop a horizontal line of `type` into the top-left, ready for resolveStep.
function line(state, type, length = 3, row = 0) {
  state.board = calm();
  for (let c = 0; c < length; c += 1) state.board[row][c] = type;
  cap(state.board, type, length, row);
  state.phase = 'resolving';
  state.combo = 0;
  state.longest = 0;
}
const fresh = (seed = 1) => createQuest(seed);
const hp = (state) => state.party.map((hero) => hero.hp);

test('a new quest deals four heroes and a playable board with no ready-made match', () => {
  const state = fresh(7);
  assert.equal(state.party.length, 4);
  assert.equal(state.board.length, QUEST.ROWS);
  assert.deepEqual(findMatches(state.board), []);
  assert.ok(validSwaps(state.board).length > 0);
  assert.deepEqual(fresh(7), state);
  assert.notDeepEqual(fresh(8).board, state.board);
  assert.equal(state.enemies.length, 1);
});

test('findMatches reports distinct cells per colour and the longest straight line', () => {
  const board = calm();
  for (let c = 0; c < 4; c += 1) board[0][c] = W;
  cap(board, W, 4);
  board[1][0] = board[2][0] = W; // an L: the corner cell is shared
  const [group] = findMatches(board);
  assert.equal(group.type, W);
  assert.equal(group.count, 6);
  assert.equal(group.run, 4);
  assert.equal(findMatches(calm()).length, 0);
});

test('a swap that makes no match is refused and leaves the board alone', () => {
  const state = fresh(3);
  state.board = calm();
  const copy = structuredClone(state.board);
  assert.equal(swapTiles(state, 0, 0, 0, 1), false);
  assert.equal(swapTiles(state, 0, 0, 2, 2), false);
  assert.deepEqual(state.board, copy);
  assert.equal(state.phase, 'player');
});

test('a swap that makes a match starts resolving', () => {
  const state = fresh(3);
  state.board = calm();
  // Row 0: W W x W — swapping the x with the W below lines up three.
  state.board[0][0] = state.board[0][1] = W;
  state.board[0][2] = G;
  state.board[0][3] = W;
  state.board[1][2] = W;
  assert.equal(swapTiles(state, 0, 2, 0, 3), true);
  assert.equal(state.phase, 'resolving');
});

test('战士 deals physical damage that armour reduces; a longer line hits harder', () => {
  const state = fresh(1);
  state.enemies[0].def = 2;
  const before = state.enemies[0].hp;
  line(state, W, 3);
  const step = resolveStep(state);
  assert.equal(step.events[0].kind, 'damage');
  assert.equal(before - state.enemies[0].hp, 3 * 6 - 2);
  const four = fresh(1);
  four.enemies[0].def = 0;
  line(four, W, 4);
  resolveStep(four);
  assert.equal(four.enemies[0].maxHp - four.enemies[0].hp, Math.round(4 * 6 * 1.4));
});

test('法师 pierces armour, splashes at 4 and freezes the whole wave at 5', () => {
  const state = fresh(1);
  state.enemies = [{ ...state.enemies[0], uid: 0, def: 50 }, { ...state.enemies[0], uid: 1, def: 50, hp: 42, maxHp: 42 }];
  const hpOf = () => state.enemies.map((enemy) => enemy.maxHp - enemy.hp);
  line(state, M, 3);
  resolveStep(state);
  assert.deepEqual(hpOf(), [15, 0]);

  state.enemies.forEach((enemy) => { enemy.hp = enemy.maxHp; });
  line(state, M, 4);
  resolveStep(state);
  assert.deepEqual(hpOf(), [20, 12]);

  state.enemies.forEach((enemy) => { enemy.hp = enemy.maxHp; });
  line(state, M, 5);
  const step = resolveStep(state);
  assert.deepEqual(hpOf(), [Math.round(25 * 1.3), Math.round(25 * 1.3)]);
  assert.equal(step.events.filter((event) => event.kind === 'freeze').length, 2);
  assert.deepEqual(state.enemies.map((enemy) => enemy.frozen), [1, 1]);
});

test('盾卫 raises a shield and taunts; four in a line shields the party', () => {
  const state = fresh(1);
  line(state, G, 3);
  resolveStep(state);
  assert.equal(state.party[2].shield, 15);
  assert.equal(state.taunt, QUEST.TAUNT_TURNS);
  assert.deepEqual(state.party.map((hero) => hero.shield), [0, 0, 15, 0]);

  line(state, G, 4);
  resolveStep(state);
  assert.deepEqual(state.party.map((hero) => hero.shield), [12, 12, 15 + 20, 12]);
});

test('牧师 heals the weakest hero; five in a line heals everyone and revives the fallen', () => {
  const state = fresh(1);
  state.party[0].hp = 80;
  state.party[1].hp = 20;
  line(state, P, 3);
  resolveStep(state);
  assert.deepEqual(hp(state).slice(0, 2), [80, 20 + 19]);

  state.party[0].hp = 0;
  line(state, P, 5);
  const step = resolveStep(state);
  assert.ok(step.events.some((event) => event.kind === 'revive' && event.hero === 0));
  assert.equal(state.party[0].hp, Math.round(state.party[0].maxHp * QUEST.REVIVE_RATIO));
});

test('a fallen hero\'s tiles do nothing', () => {
  const state = fresh(1);
  state.party[0].hp = 0;
  const before = state.enemies[0].hp;
  line(state, W, 3);
  const step = resolveStep(state);
  assert.equal(state.enemies[0].hp, before);
  assert.deepEqual(step.events.map((event) => event.kind), ['fizzle']);
});

test('cascades raise the combo multiplier and the step stops once the wave is dead', () => {
  const state = fresh(1);
  state.combo = 1;
  line(state, W, 3);
  state.combo = 1;
  const step = resolveStep(state);
  assert.equal(step.combo, 2);
  assert.equal(step.mult, 1.25);
  assert.equal(state.bestCombo, 2);
  state.enemies[0].hp = 0;
  line(state, W, 3);
  assert.equal(resolveStep(state), null);
});

test('killing the wave scores the kill and offers three rewards', () => {
  const state = fresh(1);
  state.enemies[0].hp = 1;
  line(state, W, 3);
  const step = resolveStep(state);
  assert.equal(step.cleared, true);
  assert.equal(state.kills, 1);
  assert.equal(state.score, 40);
  assert.deepEqual(finishMove(state), { outcome: 'cleared' });
  assert.equal(state.phase, 'build');
  assert.equal(new Set(state.offers).size, 3);
  assert.ok(state.score > 40);
});

test('a line of four earns one extra move, but not a chain, against ordinary enemies', () => {
  const state = fresh(1);
  state.enemies[0].hp = state.enemies[0].maxHp = 999;
  line(state, W, 4);
  resolveStep(state);
  assert.equal(finishMove(state).outcome, 'extra');
  assert.equal(state.phase, 'player');
  state.board = calm();
  state.phase = 'resolving'; state.longest = 4;
  assert.equal(finishMove(state).outcome, 'enemy');
  assert.equal(state.bonus, false);
});

test('against a boss the extra move can chain', () => {
  const state = fresh(1);
  state.enemies = [{ ...state.enemies[0], boss: true, hp: 999, maxHp: 999 }];
  state.bonus = true;
  state.board = calm();
  state.phase = 'resolving';
  state.longest = 4;
  assert.equal(finishMove(state).outcome, 'extra');
});

// An enemy's telegraph must be exactly what it then does.
function answer(state) {
  state.phase = 'enemy';
  state.actor = 0;
  const events = [];
  for (let step = enemyStep(state); step; step = enemyStep(state)) events.push(...step.events);
  return events;
}

test('an enemy hits for exactly what its telegraph promised, shield first', () => {
  const state = fresh(2);
  const enemy = state.enemies[0];
  enemy.intent = { n: '测试', k: 'hit', p: 10 };
  const power = intentPower(enemy);
  state.taunt = 1;
  state.party[2].shield = 5;
  const events = answer(state);
  const hurt = events.find((event) => event.kind === 'hurt');
  const dmg = Math.round(power * (1 - QUEST.GUARDIAN_REDUCE));
  assert.equal(hurt.hero, 2);
  assert.equal(hurt.blocked, 5);
  assert.equal(hurt.amount, dmg - 5);
  assert.equal(state.phase, 'player');
  assert.equal(state.taunt, 0);
});

test('piercing ignores shields; aoe hits everyone for half; drain heals the attacker', () => {
  const state = fresh(2);
  const enemy = state.enemies[0];
  state.taunt = 5;
  state.party.forEach((hero) => { hero.shield = 99; });
  enemy.hp = 1;
  enemy.intent = { n: '穿', k: 'pierce', p: 10 };
  const [pierced] = answer(state).filter((event) => event.kind === 'hurt');
  assert.equal(pierced.blocked, 0);
  assert.ok(pierced.amount > 0);

  enemy.intent = { n: '群', k: 'aoe', p: 10 };
  const hurts = answer(state).filter((event) => event.kind === 'hurt');
  assert.equal(hurts.length, 4);
  assert.ok(hurts.every((event) => event.blocked > 0));

  enemy.hp = 1;
  enemy.intent = { n: '吸', k: 'drain', p: 10 };
  state.party.forEach((hero) => { hero.shield = 0; });
  answer(state);
  assert.ok(enemy.hp > 1);
});

test('a frozen enemy skips its action once; the next intent comes from the cycle', () => {
  const state = fresh(2);
  const enemy = state.enemies[0];
  enemy.frozen = 1;
  const before = hp(state);
  const events = answer(state);
  assert.deepEqual(events.map((event) => event.kind), ['frozen']);
  assert.deepEqual(hp(state), before);
  assert.equal(enemy.frozen, 0);
  assert.equal(enemy.intent, enemy.moves[enemy.turn % enemy.moves.length]);
});

test('the quest is lost when every hero falls', () => {
  const state = fresh(2);
  state.party.forEach((hero, i) => { if (i) hero.hp = 0; });
  state.party[0].hp = 1;
  state.enemies[0].intent = { n: '杀', k: 'hit', p: 50 };
  const events = answer(state);
  assert.ok(events.some((event) => event.kind === 'fall'));
  assert.equal(state.phase, 'lost');
  assert.equal(enemyStep(state), null);
});

test('choosing a reward starts the next stage, heals the party and revives the fallen', () => {
  const state = fresh(4);
  state.enemies[0].hp = 0;
  state.phase = 'resolving';
  finishMove(state);
  state.party[1].hp = 0;
  state.party[0].hp = 10;
  const pick = state.offers[0];
  assert.equal(chooseReward(state, 'nope'), false);
  assert.ok(chooseReward(state, pick));
  assert.equal(state.stage, 2);
  assert.equal(state.phase, 'player');
  assert.equal(state.perks[pick], 1);
  assert.ok(state.party[1].hp > 0);
  assert.ok(state.party[0].hp > 10);
  assert.equal(state.enemies[0].name, '洞穴蝠');
  assert.equal(chooseReward(state, pick), false);
});

test('perks make their hero stronger and vigor raises max HP', () => {
  const state = fresh(4);
  state.perks.warrior = 2;
  state.enemies[0].def = 0;
  line(state, W, 3);
  resolveStep(state);
  assert.equal(state.enemies[0].maxHp - state.enemies[0].hp, Math.round(18 * 1.5));

  const vig = fresh(4);
  vig.phase = 'build';
  vig.offers = ['vigor'];
  chooseReward(vig, 'vigor');
  assert.deepEqual(vig.party.map((hero) => hero.maxHp), [108, 78, 138, 88]);
  assert.ok(PERKS.every((perk) => typeof perk.name === 'string'));
});

test('the second boss wave is the last: clearing it wins', () => {
  const state = fresh(5);
  state.stage = QUEST.STAGES;
  state.enemies.forEach((enemy) => { enemy.hp = 0; });
  state.phase = 'resolving';
  const before = state.score;
  assert.deepEqual(finishMove(state), { outcome: 'won' });
  assert.equal(state.phase, 'won');
  assert.ok(state.score >= before + 1000);
});

test('targeting only lands on a living enemy, and the target moves on when it dies', () => {
  const state = fresh(1);
  const second = { ...state.enemies[0], uid: 1 };
  state.enemies.push(second);
  setTarget(state, 1);
  assert.equal(state.target, 1);
  state.enemies[1].hp = 0;
  setTarget(state, 1);
  assert.equal(state.target, 1);
  const before = state.enemies[0].hp;
  line(state, W, 3);
  resolveStep(state);
  assert.ok(state.enemies[0].hp < before);
  assert.equal(state.target, 0);
});

// A full game played by a bot always ends, and ends the same way for the same seed.
function botGame(seed) {
  const state = createQuest(seed);
  let rng = seed;
  const roll = (n) => { rng = (Math.imul(rng, 1103515245) + 12345) >>> 0; return rng % n; };
  for (let guard = 0; guard < 4000 && state.phase !== 'won' && state.phase !== 'lost'; guard += 1) {
    if (state.phase === 'build') chooseReward(state, state.offers[roll(state.offers.length)]);
    else if (state.phase === 'player') {
      const moves = validSwaps(state.board), move = moves[roll(moves.length)];
      assert.ok(swapTiles(state, ...move.a, ...move.b));
      while (resolveStep(state));
      finishMove(state);
    } else while (enemyStep(state));
  }
  return state;
}

test('a bot can play whole games to the end, deterministically', () => {
  for (const seed of [11, 12, 13]) {
    const state = botGame(seed);
    assert.ok(['won', 'lost'].includes(state.phase), `seed ${seed} ended in ${state.phase}`);
    assert.ok(state.score > 0);
    assert.deepEqual(botGame(seed), state);
  }
});

test('every event of a step names the hero who caused it, and an enemy cast names its move kind', () => {
  const state = fresh(1);
  line(state, M, 3);
  state.board[2][0] = state.board[2][1] = state.board[2][2] = W;
  cap(state.board, W, 3, 2);
  const step = resolveStep(state);
  assert.ok(step.events.length >= 2);
  assert.deepEqual([...new Set(step.events.map((event) => event.by))].sort(), step.groups.map((group) => group.type).sort());
  for (const event of step.events) assert.ok(step.groups.some((group) => group.type === event.by));

  const foe = fresh(1);
  foe.phase = 'enemy';
  foe.actor = 0;
  foe.enemies[0].intent = { n: '撞击', k: 'aoe', p: 4 };
  const act = enemyStep(foe);
  assert.equal(act.events.find((event) => event.kind === 'cast').k, 'aoe');
});
