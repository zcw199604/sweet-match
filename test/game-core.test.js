import test from 'node:test';
import assert from 'node:assert/strict';
import { act, attachToCluster, cellCentre, createGame, hexOffset, pieceCentre, POP2, POP3, pop3Multiplier, pop3Speed, pop3Stage, pop3Width, SURGE, tickGame } from '../game-core.js';

const HEX = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const run = (state, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) tickGame(state, 1 / 60); };
const quiet = (state) => { state.balls = []; state.spawnIn = 1e9; return state; };
// Just inside the lattice spot, so the ball is touching rather than merely adjacent.
const ballAt = (state, p, q, r, color) => { const o = hexOffset(q, r); state.balls.push({ id: state.nextId++, x: p.x + o.x * 0.97, y: p.y + o.y * 0.97, vx: 0, vy: 0, color }); };

test('all four modes start playable, reproducible and for one or two players', () => {
  for (const mode of ['pop2', 'pop3', 'surge', 'blast']) {
    const a = createGame(mode, 42), b = createGame(mode, 42);
    assert.equal(a.phase, 'playing'); assert.deepEqual(a, b); assert.equal(a.players.length, 2);
    assert.equal(createGame(mode, 42, { players: 1 }).players.length, 1);
  }
  assert.throws(() => createGame('nope'));
});
test('a snapshot sent over the network keeps ticking exactly like the original', () => {
  for (const mode of ['pop2', 'pop3', 'surge', 'blast']) {
    const host = createGame(mode, 7); run(host, 3);
    const guest = JSON.parse(JSON.stringify(host));
    run(host, 2); run(guest, 2);
    assert.deepEqual(guest, JSON.parse(JSON.stringify(host)));
  }
});
test('three of a colour clear and take whatever hung on them', () => {
  const cells = { '1,0': 'red', '2,0': 'red', '3,0': 'blue', '0,1': 'green' };
  assert.deepEqual(attachToCluster(cells, 0, -1, 'blue', HEX), []);
  const cleared = attachToCluster(cells, 2, -1, 'red', HEX);
  assert.deepEqual(cleared.filter(item => !item.dropped).map(item => item.cell).sort(), ['1,0', '2,-1', '2,0']);
  assert.deepEqual(cleared.filter(item => item.dropped).map(item => item.cell), ['3,0']);
  assert.deepEqual(Object.keys(cells).sort(), ['0,-1', '0,1']);
});

test('泡噗2: balls stick to the ship and a third matching ball clears the chain', () => {
  const state = quiet(createGame('pop2', 1, { players: 1 })), p = state.players[0];
  ballAt(state, p, 1, 0, 'red'); tickGame(state);
  ballAt(state, p, 2, 0, 'red'); tickGame(state);
  ballAt(state, p, 3, 0, 'blue'); tickGame(state);
  assert.deepEqual(p.cells, { '1,0': 'red', '2,0': 'red', '3,0': 'blue' }); assert.equal(state.score, 0);
  ballAt(state, p, 1, 1, 'red'); tickGame(state);
  // Three reds plus the blue they carried: 4 balls, worth 100 × 4 × (4 − 2).
  assert.deepEqual(p.cells, {}); assert.equal(state.cleared, 4); assert.equal(state.score, 800);
});
test('泡噗2: the ship follows its target, stays inside the arena and flies over the planet', () => {
  const state = quiet(createGame('pop2', 2, { players: 1 })), p = state.players[0];
  assert.equal(act(state, 0, { type: 'move', x: 5000, y: POP2.CY }), true); run(state, 3);
  assert.ok(Math.abs(Math.hypot(p.x - POP2.CX, p.y - POP2.CY) - POP2.ARENA_R) < 1);
  // The planet is no longer solid: an empty ship crosses it instead of going around.
  act(state, 0, { type: 'move', x: POP2.CX, y: POP2.CY }); run(state, 3);
  assert.ok(Math.hypot(p.x - POP2.CX, p.y - POP2.CY) < 1);
  assert.equal(state.phase, 'playing');
});
test('泡噗2: a ball stuck to the ship that touches the planet ends the round', () => {
  const state = quiet(createGame('pop2', 4, { players: 1 })), p = state.players[0];
  ballAt(state, p, 1, 0, 'red'); tickGame(state);
  assert.deepEqual(p.cells, { '1,0': 'red' });
  act(state, 0, { type: 'move', x: POP2.CX, y: POP2.CY }); run(state, 3);
  assert.equal(state.phase, 'lost');
});
test('泡噗2: any ball reaching the planet ends the round', () => {
  const state = quiet(createGame('pop2', 3));
  state.balls.push({ id: 99, x: POP2.CX + 60, y: POP2.CY, vx: -60, vy: 0, color: 'green' });
  run(state, 1); assert.equal(state.phase, 'lost');
  assert.equal(act(state, 0, { type: 'move', x: 100, y: 100 }), false);
});

const calmWell = (seed = 5) => { const state = createGame('pop3', seed, { players: 1 }); state.players[0].spawnIn = 1e9; state.notes = []; return state; };
const noteAbove = (state, p, col, color) => state.notes.push({ id: state.nextId++, well: p.id, x: p.x + col * POP3.CELL, y: p.y - POP3.CELL * 2, color });
test('泡噗3: caught notes stack on the ship, three clear, and the combo multiplies the score', () => {
  const state = calmWell(), p = state.players[0];
  p.combo = 8; p.lastBeat = 1e9; p.monster = p.monsterTo = 120;
  for (let i = 0; i < 3; i++) { noteAbove(state, p, 0, 'yellow'); run(state, 0.6); }
  assert.equal(pop3Multiplier(8), 1.2);
  assert.deepEqual(p.cells, {}); assert.equal(state.score, 360); assert.equal(state.stageScore, 360);
  assert.ok(p.monsterTo < 120, 'clearing pushes the monster back');
});
test('泡噗3: missed notes raise the monster until it knocks the player out', () => {
  const state = calmWell(), p = state.players[0];
  state.notes.push({ id: 1, well: 0, x: 15, y: POP3.H - 120, color: 'red' }); run(state, 2);
  assert.ok(p.monsterTo > POP3.BASE); assert.equal(p.out, false);
  // Steering cannot push the ship into the spikes...
  act(state, 0, { type: 'move', x: p.x, y: POP3.H }); run(state, 3);
  assert.equal(p.out, false); assert.ok(p.y + POP3.CELL / 2 < POP3.H - p.monster);
  // ...but a monster that keeps climbing reaches it.
  p.monsterTo = POP3.H; run(state, 20);
  assert.equal(p.out, true); assert.equal(state.phase, 'lost');
});
test('泡噗3: taps are judged against the beat, once per beat', () => {
  const state = calmWell(), p = state.players[0], beat = 60 / pop3Stage(state).bpm;
  run(state, beat); assert.equal(act(state, 0, { type: 'beat' }), true);
  assert.equal(p.judge, 'PERFECT'); assert.equal(p.combo, 1);
  assert.equal(act(state, 0, { type: 'beat' }), false, 'second tap on the same beat is ignored');
  run(state, beat * 1.5); act(state, 0, { type: 'beat' });
  assert.equal(p.judge, 'MISS'); assert.equal(p.combo, 0);
});
test('泡噗3: a stage ends on the clock, advancing on an S rank and finishing otherwise', () => {
  const low = calmWell(); low.timeLeft = 0.01; run(low, 0.1);
  assert.equal(low.phase, 'won'); assert.equal(low.rank, 'C');
  const high = calmWell(); high.stageScore = 9000; high.timeLeft = 0.01; run(high, 0.1);
  assert.equal(high.phase, 'playing'); assert.equal(high.level, 2); assert.equal(high.stageScore, 0);
});

const emptyField = (seed = 11, players = 1) => { const state = createGame('surge', seed, { players }); state.pause = 1e9; return state; };
const give = (p, ...cells) => { p.held = { cells: cells.map(([dx, dy, color]) => ({ dx, dy, color })) }; };
test('山山兔: a rabbit fetches a belt piece, carries it and sets it down on the grid', () => {
  const state = emptyField(), p = state.players[0], piece = state.belt[2], cells = piece.cells;
  assert.equal(act(state, 0, { type: 'put', col: 0, row: 0 }), false, 'nothing to put down yet');
  assert.equal(act(state, 0, { type: 'pick', piece: piece.id, col: 4, row: 2 }), true);
  run(state, 4);
  assert.equal(p.held, null); assert.ok(!state.belt.some(other => other.id === piece.id));
  for (const cell of cells) assert.equal(state.board[2 + cell.dy][4 + cell.dx], cell.color);
});
test('山山兔: pieces rotate, and cannot overlap blocks or leave the field', () => {
  const state = emptyField(), p = state.players[0];
  give(p, [0, 0, 'red'], [1, 0, 'blue']);
  assert.equal(act(state, 0, { type: 'rotate' }), true);
  assert.deepEqual(p.held.cells.map(cell => [cell.dx, cell.dy]), [[0, 0], [0, 1]]);
  act(state, 0, { type: 'put', col: 3, row: SURGE.ROWS - 1 }); run(state, 3);
  assert.ok(p.held, 'the lower half would fall outside the field');
  state.board[1][3] = 'green'; act(state, 0, { type: 'put', col: 3, row: 0 }); run(state, 3);
  assert.ok(p.held, 'the lower half would overlap a block');
});
test('山山兔: three of a colour fire along their rows, hit enemies and charge energy', () => {
  const state = emptyField(), p = state.players[0];
  state.board[2][3] = state.board[2][4] = 'green';
  state.enemies.push({ id: 900, type: 'sheep', row: 2, x: cellCentre(9, 2).x, hp: 3, gnaw: 0 }, { id: 901, type: 'bug', row: 3, x: cellCentre(9, 3).x, hp: 1, gnaw: 0 });
  give(p, [0, 0, 'green']); act(state, 0, { type: 'put', col: 5, row: 2 }); run(state, 3);
  assert.deepEqual(state.board[2].slice(3, 6), [null, null, null]);
  assert.equal(state.energy, 3); assert.equal(state.defeated, 1, 'three shots take down the three-hit sheep');
  assert.deepEqual(state.enemies.map(enemy => enemy.id), [901], 'other rows are untouched');
  assert.equal(state.score, 300 + SURGE.ENEMIES.sheep.score);
});
test('山山兔: the axe spends energy to fire a single block', () => {
  const state = emptyField(), p = state.players[0];
  state.board[4][2] = 'red'; state.energy = 2;
  act(state, 0, { type: 'axe', col: 2, row: 4 }); run(state, 3);
  assert.equal(state.board[4][2], 'red', 'not enough energy');
  state.energy = 5; act(state, 0, { type: 'axe', col: 2, row: 4 }); run(state, 0.2);
  assert.equal(state.board[4][2], null); assert.equal(state.energy, 2); assert.equal(state.shots.length, 1);
});
test('山山兔: blocks stall enemies until chewed through, and a breach costs a life', () => {
  const state = emptyField();
  state.board[0][1] = 'blue';
  state.enemies.push({ id: 900, type: 'hound', row: 0, x: cellCentre(3, 0).x, hp: 1, gnaw: 0 });
  run(state, 2);
  assert.equal(state.board[0][1], 'blue'); assert.ok(state.enemies[0].gnaw > 0);
  run(state, 6);
  assert.equal(state.board[0][1], null); assert.equal(state.lives, SURGE.LIVES - 1); assert.equal(state.enemies.length, 0);
  state.lives = 1; state.enemies.push({ id: 901, type: 'hound', row: 1, x: SURGE.LEFT, hp: 1, gnaw: 0 }); run(state, 1);
  assert.equal(state.phase, 'lost');
});
test('山山兔: clearing a wave moves on to the next stage, and after the last one it never ends', () => {
  const state = emptyField(); state.pause = 0; state.spawned = SURGE.STAGES[0].total; state.board[0][0] = 'red';
  tickGame(state);
  assert.equal(state.level, 2); assert.equal(state.lives, SURGE.LIVES); assert.equal(state.board[0][0], null);
  assert.equal(state.score, SURGE.LIVES * 500);
  state.level = SURGE.STAGES.length + 1; state.pause = 0; state.spawned = 999; state.spawnIn = 0; tickGame(state);
  assert.equal(state.enemies.length, 1, 'the endless wave keeps spawning');
});
test('山山兔: the grab key picks up the nearest piece and drops it where the rabbit stands', () => {
  const state = emptyField(), p = state.players[0], piece = state.belt[1], spot = pieceCentre(piece);
  assert.equal(act(state, 0, { type: 'grab' }), false, 'too far from the belt');
  p.x = p.tx = spot.x; p.y = p.ty = spot.y;
  assert.equal(act(state, 0, { type: 'grab' }), true); assert.ok(p.held);
  ({ x: p.x, y: p.y } = cellCentre(6, 3)); p.tx = p.x; p.ty = p.y;
  assert.equal(act(state, 0, { type: 'grab' }), true); assert.equal(p.held, null); assert.ok(state.board[3][6]);
});

test('ended games and malformed input are ignored', () => {
  for (const mode of ['pop2', 'pop3', 'surge', 'blast']) {
    const state = createGame(mode, 1);
    assert.equal(act(state, 99, { type: 'move', x: 1, y: 1 }), false);
    assert.equal(act(state, 0, { type: 'move', x: NaN, y: 0 }), false);
    assert.equal(act(state, 0, null), false); assert.equal(act(state, 0, { type: 'nonsense' }), false);
    assert.equal(act(state, 1, { type: 'move', x: 300, y: 300 }), true);
    state.phase = 'lost'; const before = structuredClone(state);
    assert.equal(act(state, 0, { type: 'move', x: 1, y: 1 }), false); tickGame(state, 0.1); assert.deepEqual(state, before);
  }
});

test('泡噗3: a lone player can widen the well, shared play always gets the standard one', () => {
  const wide = createGame('pop3', 3, { players: 1, cols: POP3.WIDE_COLS }), p = wide.players[0];
  assert.equal(pop3Width(wide), POP3.WIDE_COLS * POP3.CELL);
  assert.equal(p.x, pop3Width(wide) / 2);
  // The ship reaches the far wall of the wider well and no further.
  act(wide, 0, { type: 'move', x: 1e4, y: p.y }); wide.notes = []; p.spawnIn = 1e9; run(wide, 2);
  assert.equal(p.x, pop3Width(wide) - POP3.CELL / 2);
  // Notes land in every column of the wide well, including the new ones.
  const seen = new Set();
  for (let seed = 1; seed < 400; seed++) { const s = createGame('pop3', seed * 2654435761, { players: 1, cols: POP3.WIDE_COLS }); s.players[0].spawnIn = 0; tickGame(s, 1 / 60); for (const n of s.notes) seen.add(Math.floor(n.x / POP3.CELL)); }
  assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: POP3.WIDE_COLS }, (_, i) => i));
  assert.equal(createGame('pop3', 3, { players: 2, cols: POP3.WIDE_COLS }).cols, POP3.COLS);
  assert.equal(createGame('pop3', 3, { players: 1, cols: 99 }).cols, POP3.WIDE_COLS);
  assert.equal(createGame('pop3', 3, { players: 1 }).cols, POP3.COLS);
});

test('泡噗3 无尽模式: the notes fall faster the longer you survive, up to a cap, and the round has no clock', () => {
  const state = createGame('pop3', 9, { players: 1, endless: true }), p = state.players[0];
  assert.equal(state.endless, true);
  assert.equal(pop3Stage(state).fall, POP3.ENDLESS.fall);
  p.spawnIn = 1e9; // keep the well empty so nothing can reach the spikes
  run(state, 30);
  const early = pop3Stage(state).fall;
  assert.ok(Math.abs(early - (POP3.ENDLESS.fall + POP3.ENDLESS.RAMP * 30)) < 1);
  run(state, 60);
  assert.ok(pop3Stage(state).fall > early);
  // Far past the three classic stages (80 s each) the game is still on stage one and still running.
  run(state, 300);
  assert.equal(state.phase, 'playing'); assert.equal(state.level, 1);
  assert.equal(pop3Stage(state).fall, POP3.ENDLESS.MAX_FALL);
  assert.equal(pop3Speed(state), POP3.ENDLESS.MAX_FALL / POP3.ENDLESS.fall);
  // Everything a guest needs survives a JSON snapshot (no Infinity in the clock).
  assert.deepEqual(JSON.parse(JSON.stringify(state)).timeLeft, state.timeLeft);
});

test('泡噗3 无尽模式: classic play is unchanged and a missed note still ends the round', () => {
  const classic = createGame('pop3', 9, { players: 1 });
  assert.equal(classic.endless, false);
  assert.equal(pop3Stage(classic), POP3.STAGES[0]);
  const state = createGame('pop3', 9, { players: 1, endless: true }), p = state.players[0];
  p.spawnIn = 1e9; p.monsterTo = POP3.H; run(state, 20);
  assert.equal(p.out, true); assert.equal(state.phase, 'lost');
});
// A column of alternating colours hanging off the ship (rows from..to), so nothing ever matches.
const column = (p, from, to) => { for (let r = from; r <= to; r++) if (r) p.cells[`0,${r}`] = r % 2 ? 'red' : 'blue'; };
test('泡噗3: the higher the stack reaches, the lower the ship\'s ceiling', () => {
  const state = calmWell(), p = state.players[0];
  column(p, -10, -1); // the top of the stack sits 10 rows above the ship
  act(state, 0, { type: 'move', x: p.x, y: 0 }); run(state, 3);
  assert.equal(p.out, false); assert.equal(p.y, 10.5 * POP3.CELL, 'the stack just fits under the top edge');
  assert.ok(p.y - 10.5 * POP3.CELL >= 0);
});
test('泡噗3: a stack that grows past the ceiling pushes a parked ship down, and with no room left the ship is out', () => {
  const state = calmWell(), p = state.players[0];
  act(state, 0, { type: 'move', x: p.x, y: 0 }); run(state, 2);
  assert.equal(p.y, POP3.CELL / 2);
  column(p, -5, -1); run(state, 1);
  assert.equal(p.y, 5.5 * POP3.CELL, 'dragged down by the stack even though the player did not steer');
  // 19 rows fill the well from the top edge down to the spikes at their lowest: no room left.
  column(p, -5, 13); run(state, 2);
  assert.equal(p.out, true); assert.equal(state.phase, 'lost');
});
test('泡噗3: a full row at the top of the well no longer makes the ship untouchable', () => {
  const state = calmWell(), p = state.players[0];
  for (let c = -5; c <= 5; c++) if (c) p.cells[`${c},0`] = c % 2 ? 'red' : 'blue';
  column(p, -17, -1); // 18 rows with the full row at the bottom
  p.x = p.tx = 165; act(state, 0, { type: 'move', x: 165, y: 0 }); run(state, 3);
  assert.equal(p.y, 17.5 * POP3.CELL); assert.equal(p.out, false);
  column(p, -18, -1); run(state, 1); // one more row and the stack no longer fits above the spikes
  assert.equal(p.out, true);
});
test('泡噗3: a stack hanging below the ship is what limits it, and 18 rows reach the spikes even at the top', () => {
  const fits = calmWell(), a = fits.players[0];
  column(a, 1, 17); a.x = a.tx = 165; a.y = a.ty = POP3.CELL / 2;
  run(fits, 1); assert.equal(a.out, false);
  act(fits, 0, { type: 'move', x: a.x, y: POP3.H }); run(fits, 2);
  assert.equal(a.out, false); assert.ok(a.y < POP3.H - a.monster - (17.5 * POP3.CELL), 'steering stops above the spikes');
  const tooTall = calmWell(), b = tooTall.players[0];
  column(b, 1, 18); b.x = b.tx = 165; b.y = b.ty = POP3.CELL / 2;
  run(tooTall, 0.1);
  assert.equal(b.out, true); assert.equal(tooTall.phase, 'lost');
});
