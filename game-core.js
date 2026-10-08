// Deterministic, host-authoritative rules shared by browser and tests.
import { BLAST_SHAPES } from './blast-shapes.js';
export const WIDTH = 720;
export const HEIGHT = 720;
export const MODES = ['pop2', 'pop3', 'surge', 'blast'];
export const COLORS = ['red', 'yellow', 'green', 'blue'];
export const POP2_COLORS = [...COLORS, 'purple'];

// 泡噗 2: ships tow hex-packed balls around a planet in the middle of a round arena.
export const POP2 = { R: 15, D: 30, SHIP_R: 16, HOME_R: 30, CX: 360, CY: 360, ARENA_R: 332, SPEED: 320 };
// 泡噗 3: one vertical well per player, measured in well-local pixels.
export const POP3 = {
  COLS: 11, ROWS: 20, CELL: 30, W: 330, H: 600, SPEED: 360, BASE: 54,
  STAGES: [
    { name: '摇摇晃舞池', bpm: 96, fall: 70, gap: 1.25, time: 80 },
    { name: '熙熙攘桃园', bpm: 112, fall: 86, gap: 1.05, time: 80 },
    { name: '喧喧哗空间', bpm: 128, fall: 104, gap: 0.9, time: 80 }
  ]
};
export const RANKS = ['C', 'B', 'A', 'S', 'SS'];
// 山山兔队长大作战: conveyor on top, 12×6 field below, enemies walk in from the right.
export const SURGE = {
  COLS: 12, ROWS: 6, CELL: 54, LEFT: 36, TOP: 252, BELT_Y: 140, BELT_TOP: 96, BELT_BOTTOM: 232, BELT_CELL: 44,
  BELT_SPEED: 46, BELT_GAP: 140, SPEED: 440, SHOT_SPEED: 600, MAX_ENERGY: 30, AXE_COST: 3, LIVES: 3,
  ENEMIES: {
    bug: { hp: 1, speed: 24, gnaw: 2.4, score: 100 },
    sheep: { hp: 3, speed: 14, gnaw: 3.2, score: 300 },
    hound: { hp: 1, speed: 46, gnaw: 1.4, score: 200 }
  },
  STAGES: [
    { name: '启航嘟嘟', total: 29, gap: 5.2, mix: { bug: 10, sheep: 1, hound: 1 } },
    { name: '色彩砰砰', total: 32, gap: 4.6, mix: { bug: 7, sheep: 2, hound: 1 } },
    { name: '第 3 关', total: 36, gap: 4.1, mix: { bug: 6, sheep: 2, hound: 2 } },
    { name: '活力轰轰', total: 40, gap: 3.6, mix: { bug: 5, sheep: 2, hound: 3 } },
    { name: '纵横扑扑', total: 45, gap: 3.2, mix: { bug: 4, sheep: 3, hound: 3 } }
  ],
  // total 0 means the wave never ends.
  ENDLESS: { name: '无尽嘉年华', total: 0, gap: 3, mix: { bug: 4, sheep: 3, hound: 3 } }
};
// 方块爆破: an 8×8 well, three pieces in the tray, a full row or column clears.
export const BLAST = {
  COLS: 8, ROWS: 8, CELL: 60,
  LEFT: 120, TOP: 104,                 // the board spans 120..600 × 104..584
  TRAY_Y: 648, TRAY_CELL: 36,          // the tray band is 584..720
  TRAY_SLOT_X: [168, 360, 552], TRAY_SLOT_W: 176, TRAY_SLOT_H: 116,
  STREAK_STEP: 0.05,
  // The drop cell is tried first, then its eight neighbours, as [dcol, drow].
  SNAP: [[0, 0], [0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]
};
// Bound separately from POP2_COLORS: if pop2 ever gains a sixth colour, blast's
// random stream must not shift.
export const BLAST_COLORS = ['coral', 'amber', 'lime', 'cyan', 'violet', 'azure'];

const HEX_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
const SQUARE_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const HEX_H = Math.sqrt(3) / 2;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const key = (a, b) => `${a},${b}`;
const unkey = (text) => text.split(',').map(Number);
function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}
const pick = (state, list) => list[Math.floor(random(state) * list.length)];
function effect(state, data) {
  state.effects.push({ ...data, time: state.elapsed });
  if (state.effects.length > 90) state.effects.splice(0, state.effects.length - 90);
}

// --- Clusters: cells keyed "a,b" on a lattice whose origin is the ship. ---
export function clusterGroup(cells, start, dirs) {
  const color = cells[start];
  if (!color) return [];
  const seen = new Set([start]), stack = [start];
  while (stack.length) {
    const [a, b] = unkey(stack.pop());
    for (const [da, db] of dirs) {
      const next = key(a + da, b + db);
      if (cells[next] === color && !seen.has(next)) { seen.add(next); stack.push(next); }
    }
  }
  return [...seen];
}
function detached(cells, dirs) {
  const seen = new Set(), stack = [[0, 0]];
  while (stack.length) {
    const [a, b] = stack.pop();
    for (const [da, db] of dirs) {
      const next = key(a + da, b + db);
      if (cells[next] && !seen.has(next)) { seen.add(next); stack.push([a + da, b + db]); }
    }
  }
  return Object.keys(cells).filter(cell => !seen.has(cell));
}
// Nearest free cell that touches the ship or something already attached.
function dockingCell(cells, dirs, distance) {
  let best = null, bestDistance = Infinity;
  for (const cell of ['0,0', ...Object.keys(cells)]) {
    const [a, b] = unkey(cell);
    for (const [da, db] of dirs) {
      const na = a + da, nb = b + db;
      if ((!na && !nb) || cells[key(na, nb)]) continue;
      const d = distance(na, nb);
      if (d < bestDistance) { bestDistance = d; best = [na, nb]; }
    }
  }
  return best;
}
// Three of a colour pop, and whatever only hung on through them goes too.
export function attachToCluster(cells, a, b, color, dirs) {
  cells[key(a, b)] = color;
  const group = clusterGroup(cells, key(a, b), dirs);
  if (group.length < 3) return [];
  const cleared = group.map(cell => ({ cell, color: cells[cell], dropped: false }));
  for (const cell of group) delete cells[cell];
  for (const cell of detached(cells, dirs)) { cleared.push({ cell, color: cells[cell], dropped: true }); delete cells[cell]; }
  return cleared;
}

// --- 泡噗 2 ---
export const hexOffset = (q, r) => ({ x: POP2.D * (q + r / 2), y: POP2.D * HEX_H * r });
const fromHome = (x, y) => Math.hypot(x - POP2.CX, y - POP2.CY);
function spawnBall(state, radius = 560) {
  const from = random(state) * Math.PI * 2, aim = random(state) * Math.PI * 2, off = random(state) * POP2.HOME_R * 2.4;
  const x = POP2.CX + Math.cos(from) * radius, y = POP2.CY + Math.sin(from) * radius;
  const tx = POP2.CX + Math.cos(aim) * off, ty = POP2.CY + Math.sin(aim) * off;
  const distance = Math.hypot(tx - x, ty - y), speed = 26 + Math.min(50, state.elapsed * 0.22);
  state.balls.push({ id: state.nextId++, x, y, vx: (tx - x) / distance * speed, vy: (ty - y) / distance * speed, color: pick(state, POP2_COLORS) });
}
function createPop2(state, count) {
  state.balls = []; state.spawnIn = 0.8; state.cleared = 0;
  const spots = count === 1 ? [[POP2.CX, POP2.CY + 120]] : [[POP2.CX - 120, POP2.CY], [POP2.CX + 120, POP2.CY]];
  state.players = spots.map(([x, y], id) => ({ id, x, y, tx: x, ty: y, cells: {} }));
  for (let i = 0; i < 3; i++) spawnBall(state, 430 + i * 70);
}
function movePop2Ship(p, dt) {
  const dx = p.tx - p.x, dy = p.ty - p.y, distance = Math.hypot(dx, dy);
  if (distance < 0.5) return;
  const step = Math.min(distance, POP2.SPEED * dt), nx = p.x + dx / distance * step, ny = p.y + dy / distance * step;
  // The planet is not solid for the ship itself, so the ship flies straight over
  // the base instead of swinging around it. Whatever is stuck to the hull is a
  // different matter: touching the base with it ends the round — see tickPop2.
  const fits = (x, y) => fromHome(x, y) <= POP2.ARENA_R;
  if (fits(nx, ny)) { p.x = nx; p.y = ny; return; }
  // Held back by the arena rim: slide along it on whichever side ends up nearer the target.
  const heading = Math.atan2(dy, dx);
  for (const turn of [0.9, 1.5]) {
    const sides = [turn, -turn].map(angle => ({ x: p.x + Math.cos(heading + angle) * step, y: p.y + Math.sin(heading + angle) * step }))
      .filter(spot => fits(spot.x, spot.y)).sort((a, b) => Math.hypot(p.tx - a.x, p.ty - a.y) - Math.hypot(p.tx - b.x, p.ty - b.y));
    if (sides.length) { p.x = sides[0].x; p.y = sides[0].y; return; }
  }
}
function touchesPop2(p, ball) {
  const dx = ball.x - p.x, dy = ball.y - p.y;
  if (Math.hypot(dx, dy) < POP2.SHIP_R + POP2.R) return true;
  for (const cell of Object.keys(p.cells)) {
    const o = hexOffset(...unkey(cell));
    if (Math.hypot(dx - o.x, dy - o.y) < POP2.D - 1) return true;
  }
  return false;
}
function dockPop2(state, p, ball) {
  const [q, r] = dockingCell(p.cells, HEX_DIRS, (a, b) => { const o = hexOffset(a, b); return Math.hypot(ball.x - p.x - o.x, ball.y - p.y - o.y); });
  const spot = hexOffset(q, r), cleared = attachToCluster(p.cells, q, r, ball.color, HEX_DIRS);
  if (!cleared.length) return;
  // Big clears are worth far more than the same balls popped three at a time.
  const count = cleared.length, gain = 100 * count * Math.max(1, count - 2);
  state.score += gain; state.cleared += count;
  for (const item of cleared) { const o = hexOffset(...unkey(item.cell)); effect(state, { type: 'pop', x: p.x + o.x, y: p.y + o.y, color: item.color }); }
  effect(state, { type: 'text', x: p.x + spot.x, y: p.y + spot.y, text: `+${gain}` });
}
function tickPop2(state, dt) {
  state.spawnIn -= dt;
  // A lone ship has the whole circle to cover, so its balls come a little further apart.
  if (state.spawnIn <= 0) { spawnBall(state); state.spawnIn = Math.max(0.6, 2.2 - state.elapsed * 0.012) * (state.players.length === 1 ? 1.4 : 1); }
  for (const p of state.players) movePop2Ship(p, dt);
  const kept = [];
  for (const ball of state.balls) {
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    const home = fromHome(ball.x, ball.y);
    if (home < POP2.HOME_R + POP2.R * 0.8) { state.phase = 'lost'; effect(state, { type: 'pop', x: ball.x, y: ball.y, color: ball.color }); kept.push(ball); continue; }
    const owner = state.phase === 'playing' && state.players.find(p => touchesPop2(p, ball));
    if (owner) { dockPop2(state, owner, ball); continue; }
    if (home < 640 || ball.vx * (POP2.CX - ball.x) + ball.vy * (POP2.CY - ball.y) > 0) kept.push(ball);
  }
  state.balls = kept;
  // The ship may cross the base, but nothing stuck to it may: a ball on the hull
  // that touches the planet still ends the round.
  for (const p of state.players) {
    for (const cell of Object.keys(p.cells)) {
      const o = hexOffset(...unkey(cell));
      if (fromHome(p.x + o.x, p.y + o.y) < POP2.HOME_R + POP2.R * 0.8) {
        state.phase = 'lost';
        effect(state, { type: 'pop', x: p.x + o.x, y: p.y + o.y, color: p.cells[cell] });
        return;
      }
    }
  }
}

// --- 泡噗 3 ---
export const pop3Stage = (state) => POP3.STAGES[state.level - 1];
export const pop3Multiplier = (combo) => Math.min(9.9, 1 + Math.floor(combo / 4) / 10);
export function pop3Rank(state) {
  const reached = [2500, 5000, 8000, 12000].filter(score => state.stageScore >= score * state.players.length).length;
  return RANKS[reached];
}
// 0 on the beat, climbing to 1 just before the next one.
export function beatPhase(state) {
  const beats = (state.elapsed - state.stageStart) * pop3Stage(state).bpm / 60;
  return beats - Math.floor(beats);
}
function startPop3Stage(state) {
  state.notes = []; state.stageScore = 0; state.stageStart = state.elapsed; state.timeLeft = pop3Stage(state).time;
  state.banner = { text: pop3Stage(state).name, time: state.elapsed };
  for (const p of state.players) {
    Object.assign(p, { x: POP3.W / 2, y: POP3.H * 0.6, tx: POP3.W / 2, ty: POP3.H * 0.6, cells: {}, out: false,
      monster: POP3.BASE, monsterTo: POP3.BASE, spawnIn: 0.6 + p.id * 0.3, lastBeat: -1 });
  }
}
function createPop3(state, count) {
  state.players = Array.from({ length: count }, (_, id) => ({ id, combo: 0, judge: '', judgeAt: -9 }));
  startPop3Stage(state);
}
function spawnNotes(state, well) {
  const col = Math.floor(random(state) * POP3.COLS), x = (col + 0.5) * POP3.CELL, y = -POP3.CELL / 2;
  state.notes.push({ id: state.nextId++, well, x, y, color: pick(state, COLORS) });
  if (random(state) < 0.35) {
    const side = random(state) < 0.5, next = col + (col === POP3.COLS - 1 ? -1 : 1);
    state.notes.push({ id: state.nextId++, well, x: side ? (next + 0.5) * POP3.CELL : x, y: side ? y : y - POP3.CELL, color: pick(state, COLORS) });
  }
}
function pop3Extent(p) {
  const extent = { minC: 0, maxC: 0, minR: 0, maxR: 0 };
  for (const cell of Object.keys(p.cells)) {
    const [c, r] = unkey(cell);
    extent.minC = Math.min(extent.minC, c); extent.maxC = Math.max(extent.maxC, c);
    extent.minR = Math.min(extent.minR, r); extent.maxR = Math.max(extent.maxR, r);
  }
  return extent;
}
function movePop3Ship(p, dt) {
  const dx = p.tx - p.x, dy = p.ty - p.y, distance = Math.hypot(dx, dy);
  if (distance < 0.5) return;
  const step = Math.min(distance, POP3.SPEED * dt), extent = pop3Extent(p), half = POP3.CELL / 2;
  p.x = clamp(p.x + dx / distance * step, half - extent.minC * POP3.CELL, POP3.W - half - extent.maxC * POP3.CELL);
  // Steering stops just above the spikes. A tall stack may poke out of the top of the well.
  p.y = clamp(p.y + dy / distance * step, half, POP3.H - p.monster - 1 - (extent.maxR + 0.5) * POP3.CELL);
}
function dockPop3(state, p, note) {
  const fx = (note.x - p.x) / POP3.CELL, fy = (note.y - p.y) / POP3.CELL;
  const [c, r] = dockingCell(p.cells, SQUARE_DIRS, (a, b) => Math.hypot(fx - a, fy - b));
  const cleared = attachToCluster(p.cells, c, r, note.color, SQUARE_DIRS);
  if (!cleared.length) return;
  const each = Math.round(100 * pop3Multiplier(p.combo)), gain = each * cleared.length;
  state.score += gain; state.stageScore += gain;
  // Clearing notes drives the monster back down.
  p.monsterTo = Math.max(POP3.BASE, p.monsterTo - cleared.length * POP3.CELL * 0.3);
  for (const item of cleared) { const [a, b] = unkey(item.cell); effect(state, { type: 'pop', well: p.id, x: p.x + a * POP3.CELL, y: p.y + b * POP3.CELL, color: item.color }); }
  effect(state, { type: 'text', well: p.id, x: p.x + c * POP3.CELL, y: p.y + r * POP3.CELL, text: `+${gain}` });
}
function finishPop3Stage(state) {
  state.rank = pop3Rank(state);
  if (state.level < POP3.STAGES.length && RANKS.indexOf(state.rank) >= RANKS.indexOf('S')) { state.level++; startPop3Stage(state); }
  else state.phase = 'won';
}
function tickPop3(state, dt) {
  const stage = pop3Stage(state), beats = (state.elapsed - state.stageStart) * stage.bpm / 60;
  state.timeLeft -= dt;
  for (const p of state.players) {
    if (p.out) continue;
    p.spawnIn -= dt;
    if (p.spawnIn <= 0) { spawnNotes(state, p.id); p.spawnIn = stage.gap * (0.8 + random(state) * 0.4); }
    p.monster += clamp(p.monsterTo - p.monster, -60 * dt, 30 * dt);
    if (p.combo && beats - p.lastBeat > 4.5) p.combo = 0;
    movePop3Ship(p, dt);
  }
  const kept = [];
  for (const note of state.notes) {
    note.y += stage.fall * dt;
    const p = state.players[note.well];
    if (p.out) { if (note.y < POP3.H + POP3.CELL) kept.push(note); continue; }
    const fx = (note.x - p.x) / POP3.CELL, fy = (note.y - p.y) / POP3.CELL;
    if (['0,0', ...Object.keys(p.cells)].some(cell => { const [c, r] = unkey(cell); return Math.abs(fx - c) < 0.9 && Math.abs(fy - r) < 0.9; })) { dockPop3(state, p, note); continue; }
    // A note that slips past feeds the monster, which climbs.
    if (note.y + POP3.CELL / 2 >= POP3.H - p.monster) {
      p.monsterTo = Math.min(POP3.H, p.monsterTo + POP3.CELL * 0.34);
      effect(state, { type: 'pop', well: p.id, x: note.x, y: note.y, color: note.color });
      continue;
    }
    kept.push(note);
  }
  state.notes = kept;
  for (const p of state.players) {
    if (!p.out && p.y + (pop3Extent(p).maxR + 0.5) * POP3.CELL > POP3.H - p.monster) {
      p.out = true; p.cells = {};
      effect(state, { type: 'text', well: p.id, x: p.x, y: p.y, text: 'LOST' });
    }
  }
  state.rank = pop3Rank(state);
  if (state.players.every(p => p.out)) state.phase = 'lost';
  else if (state.timeLeft <= 0) finishPop3Stage(state);
}
function tapBeat(state, p) {
  if (p.out) return false;
  const beats = (state.elapsed - state.stageStart) * pop3Stage(state).bpm / 60, index = Math.round(beats);
  if (index === p.lastBeat) return false;
  const off = Math.abs(beats - index);
  p.lastBeat = index; p.judgeAt = state.elapsed;
  if (off <= 0.14) { p.judge = 'PERFECT'; p.combo++; } else if (off <= 0.28) { p.judge = 'GOOD'; p.combo++; } else { p.judge = 'MISS'; p.combo = 0; }
  return true;
}

// --- 山山兔队长大作战 ---
export const surgeStage = (state) => SURGE.STAGES[state.level - 1] || SURGE.ENDLESS;
export const cellCentre = (col, row) => ({ x: SURGE.LEFT + (col + 0.5) * SURGE.CELL, y: SURGE.TOP + (row + 0.5) * SURGE.CELL });
export const cellAt = (x, y) => ({ col: Math.floor((x - SURGE.LEFT) / SURGE.CELL), row: Math.floor((y - SURGE.TOP) / SURGE.CELL) });
const inField = (col, row) => Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < SURGE.COLS && row >= 0 && row < SURGE.ROWS;
export function pieceCentre(piece) {
  const dx = piece.cells.reduce((sum, cell) => sum + cell.dx, 0) / piece.cells.length, dy = piece.cells.reduce((sum, cell) => sum + cell.dy, 0) / piece.cells.length;
  return { x: piece.x + dx * SURGE.BELT_CELL, y: SURGE.BELT_Y + dy * SURGE.BELT_CELL };
}
export function canPlace(state, cells, col, row) {
  return cells.every(cell => inField(col + cell.dx, row + cell.dy) && !state.board[row + cell.dy][col + cell.dx]);
}
function spawnPiece(state, x) {
  const shape = pick(state, [[[0, 0]], [[0, 0], [1, 0]], [[0, 0], [1, 0]], [[0, 0], [0, 1]], [[0, 0], [1, 0], [0, 1]], [[0, 0], [1, 0], [1, 1]], [[0, 0], [0, 1], [1, 1]]]);
  state.belt.push({ id: state.nextId++, x, cells: shape.map(([dx, dy]) => ({ dx, dy, color: pick(state, COLORS) })) });
}
function startSurgeStage(state) {
  const stage = surgeStage(state);
  state.board = Array.from({ length: SURGE.ROWS }, () => Array(SURGE.COLS).fill(null));
  state.enemies = []; state.shots = []; state.lives = SURGE.LIVES; state.energy = 0; state.spawned = 0; state.defeated = 0;
  state.pause = 2; state.spawnIn = 1;
  state.banner = { text: stage.name, time: state.elapsed };
}
function createSurge(state, count) {
  state.belt = [];
  let x = 60;
  for (; x < WIDTH + 60; x += SURGE.BELT_GAP) spawnPiece(state, x);
  // The next piece enters one full gap behind the last one already on the belt.
  state.beltIn = (x - WIDTH - 60) / SURGE.BELT_SPEED;
  state.players = Array.from({ length: count }, (_, id) => {
    const x = SURGE.LEFT + (count === 1 ? 6 : 3 + id * 6) * SURGE.CELL, y = SURGE.TOP + SURGE.CELL * 1.5;
    return { id, x, y, tx: x, ty: y, held: null, cmd: null };
  });
  startSurgeStage(state);
}
function boardGroup(board, row, col) {
  const color = board[row][col], seen = new Set([key(row, col)]), stack = [[row, col]], group = [];
  while (stack.length) {
    const [r, c] = stack.pop(); group.push([r, c]);
    for (const [dr, dc] of SQUARE_DIRS) {
      const nr = r + dr, nc = c + dc;
      if (inField(nc, nr) && board[nr][nc] === color && !seen.has(key(nr, nc))) { seen.add(key(nr, nc)); stack.push([nr, nc]); }
    }
  }
  return group;
}
// A cleared block turns into a shot that flies right along its own row.
function fireCell(state, row, col) {
  const color = state.board[row][col], centre = cellCentre(col, row);
  state.board[row][col] = null;
  state.shots.push({ id: state.nextId++, row, x: centre.x, color });
  effect(state, { type: 'pop', x: centre.x, y: centre.y, color });
}
function placeHeld(state, p, col, row) {
  if (!p.held || !canPlace(state, p.held.cells, col, row)) return false;
  const placed = p.held.cells.map(cell => [row + cell.dy, col + cell.dx, cell.color]);
  for (const [r, c, color] of placed) state.board[r][c] = color;
  p.held = null;
  let fired = 0;
  for (const [r, c] of placed) {
    if (!state.board[r][c]) continue;
    const group = boardGroup(state.board, r, c);
    if (group.length < 3) continue;
    for (const [gr, gc] of group) fireCell(state, gr, gc);
    fired += group.length;
  }
  if (fired) {
    state.energy = Math.min(SURGE.MAX_ENERGY, state.energy + fired); state.score += fired * 100;
    effect(state, { type: 'text', x: cellCentre(col, row).x, y: cellCentre(col, row).y, text: `⚡+${fired}` });
  }
  return true;
}
function useAxe(state, col, row) {
  if (state.energy < SURGE.AXE_COST || !inField(col, row) || !state.board[row][col]) return false;
  state.energy -= SURGE.AXE_COST; fireCell(state, row, col);
  return true;
}
function takePiece(state, p, piece) {
  p.held = { cells: piece.cells };
  state.belt = state.belt.filter(other => other.id !== piece.id);
}
function tickRabbit(state, p, dt) {
  if (p.cmd?.type === 'pick') {
    const piece = state.belt.find(other => other.id === p.cmd.piece);
    if (!piece || p.held) p.cmd = null; else ({ x: p.tx, y: p.ty } = pieceCentre(piece));
  }
  const dx = p.tx - p.x, dy = p.ty - p.y, distance = Math.hypot(dx, dy);
  if (distance > 0.5) { const step = Math.min(distance, SURGE.SPEED * dt); p.x += dx / distance * step; p.y += dy / distance * step; }
  if (!p.cmd || Math.hypot(p.tx - p.x, p.ty - p.y) > 24) return;
  const cmd = p.cmd; p.cmd = null;
  if (cmd.type === 'pick') {
    takePiece(state, p, state.belt.find(other => other.id === cmd.piece));
    if (inField(cmd.col, cmd.row)) { p.cmd = { type: 'put', col: cmd.col, row: cmd.row }; ({ x: p.tx, y: p.ty } = cellCentre(cmd.col, cmd.row)); }
  } else if (Math.hypot(p.tx - p.x, p.ty - p.y) > 2) p.cmd = cmd;
  else if (cmd.type === 'put') placeHeld(state, p, cmd.col, cmd.row);
  else if (cmd.type === 'axe') useAxe(state, cmd.col, cmd.row);
}
function spawnEnemy(state) {
  const mix = surgeStage(state).mix, pool = Object.keys(mix).flatMap(type => Array(mix[type]).fill(type)), type = pick(state, pool);
  state.enemies.push({ id: state.nextId++, type, row: Math.floor(random(state) * SURGE.ROWS), x: SURGE.LEFT + SURGE.COLS * SURGE.CELL + 30, hp: SURGE.ENEMIES[type].hp, gnaw: 0 });
  state.spawned++;
}
function tickSurge(state, dt) {
  const stage = surgeStage(state), right = SURGE.LEFT + SURGE.COLS * SURGE.CELL;
  for (const piece of state.belt) piece.x -= SURGE.BELT_SPEED * dt;
  state.belt = state.belt.filter(piece => piece.x > -SURGE.BELT_CELL * 2);
  state.beltIn -= dt;
  if (state.beltIn <= 0) { spawnPiece(state, WIDTH + 60); state.beltIn += SURGE.BELT_GAP / SURGE.BELT_SPEED; }
  for (const p of state.players) tickRabbit(state, p, dt);
  if (state.pause > 0) state.pause -= dt;
  else if (!stage.total || state.spawned < stage.total) {
    state.spawnIn -= dt;
    if (state.spawnIn <= 0) {
      spawnEnemy(state);
      // One rabbit cannot haul as fast as two; the endless wave keeps tightening.
      const pace = stage.total ? stage.gap : Math.max(1.4, stage.gap - state.defeated * 0.01);
      state.spawnIn = pace * (state.players.length === 1 ? 1.5 : 1) * (0.75 + random(state) * 0.5);
    }
  }
  for (const shot of state.shots) {
    shot.x += SURGE.SHOT_SPEED * dt;
    const target = state.enemies.filter(e => e.row === shot.row && e.hp > 0 && Math.abs(e.x - shot.x) < 24).sort((a, b) => a.x - b.x)[0];
    if (!target) continue;
    shot.hit = true; target.hp--;
    effect(state, { type: 'pop', x: target.x, y: cellCentre(0, target.row).y, color: shot.color });
    if (target.hp <= 0) { state.defeated++; state.score += SURGE.ENEMIES[target.type].score; }
  }
  state.shots = state.shots.filter(shot => !shot.hit && shot.x < right + 40);
  for (const enemy of state.enemies) {
    if (enemy.hp <= 0) continue;
    const spec = SURGE.ENEMIES[enemy.type], col = Math.floor((enemy.x - 22 - SURGE.LEFT) / SURGE.CELL);
    // Blocks hold the line until they are chewed through.
    if (col >= 0 && col < SURGE.COLS && state.board[enemy.row][col]) {
      enemy.gnaw += dt;
      if (enemy.gnaw >= spec.gnaw) {
        effect(state, { type: 'pop', ...cellCentre(col, enemy.row), color: state.board[enemy.row][col] });
        state.board[enemy.row][col] = null; enemy.gnaw = 0;
      }
    } else { enemy.gnaw = 0; enemy.x -= spec.speed * dt; }
    if (enemy.x < SURGE.LEFT - 6) {
      enemy.hp = 0; state.lives--;
      effect(state, { type: 'text', x: SURGE.LEFT + 30, y: cellCentre(0, enemy.row).y, text: '防线 -1' });
    }
  }
  state.enemies = state.enemies.filter(enemy => enemy.hp > 0);
  if (state.lives <= 0) { state.phase = 'lost'; return; }
  if (stage.total && state.spawned >= stage.total && !state.enemies.length) {
    state.score += state.lives * 500; state.stars = state.lives; state.level++;
    startSurgeStage(state);
  }
}
function actSurge(state, p, action) {
  if (action.type === 'pick') {
    if (p.held || !state.belt.some(piece => piece.id === action.piece)) return false;
    p.cmd = { type: 'pick', piece: action.piece, col: action.col, row: action.row }; return true;
  }
  if (action.type === 'put' || action.type === 'axe') {
    if (!inField(action.col, action.row) || (action.type === 'put' && !p.held)) return false;
    p.cmd = { type: action.type, col: action.col, row: action.row }; ({ x: p.tx, y: p.ty } = cellCentre(action.col, action.row)); return true;
  }
  if (action.type === 'rotate') {
    if (!p.held) return false;
    p.held = { cells: p.held.cells.map(cell => ({ dx: -cell.dy || 0, dy: cell.dx, color: cell.color })) }; return true;
  }
  const here = cellAt(p.x, p.y);
  if (action.type === 'skill') return useAxe(state, here.col, here.row);
  if (action.type === 'grab') {
    if (p.held) return placeHeld(state, p, here.col, here.row);
    const near = state.belt.map(piece => ({ piece, d: Math.hypot(pieceCentre(piece).x - p.x, pieceCentre(piece).y - p.y) })).sort((a, b) => a.d - b.d)[0];
    if (!near || near.d > 80) return false;
    p.cmd = null; takePiece(state, p, near.piece); return true;
  }
  return false;
}

// --- 方块爆破 ---
export const blastCellCentre = (col, row) => ({ x: BLAST.LEFT + (col + 0.5) * BLAST.CELL, y: BLAST.TOP + (row + 0.5) * BLAST.CELL });
export const blastCellAt = (x, y) => ({ col: Math.floor((x - BLAST.LEFT) / BLAST.CELL), row: Math.floor((y - BLAST.TOP) / BLAST.CELL) });
const blastInField = (col, row) => Number.isInteger(col) && Number.isInteger(row) && col >= 0 && col < BLAST.COLS && row >= 0 && row < BLAST.ROWS;
export const blastMultiplier = (streak) => 1 + (streak - 1) * BLAST.STREAK_STEP;
export function blastCanPlace(state, cells, col, row) {
  return cells.every(cell => blastInField(col + cell.dx, row + cell.dy) && !state.board[row + cell.dy][col + cell.dx]);
}
// The single source of truth for the nine-cell drop search: the model places with
// it and the view previews with it, so the ghost always shows where the piece lands.
export function blastSnap(state, cells, col, row) {
  for (const [dc, dr] of BLAST.SNAP) if (blastCanPlace(state, cells, col + dc, row + dr)) return { col: col + dc, row: row + dr };
  return null;
}
export function blastHasValidPlacement(state, cells) {
  for (let row = 0; row < BLAST.ROWS; row += 1) for (let col = 0; col < BLAST.COLS; col += 1) if (blastCanPlace(state, cells, col, row)) return true;
  return false;
}
// Draw order is a contract: shape then colour, slots 0→1→2. Changing it later is
// not a determinism bug, but it silently re-deals every seed.
function refillTray(state) {
  state.tray = Array.from({ length: 3 }, () => {
    const shape = pick(state, BLAST_SHAPES), color = pick(state, BLAST_COLORS);
    return { id: state.nextId++, name: shape.name, cells: shape.cells.map(cell => ({ dx: cell.dx, dy: cell.dy, color })) };
  });
}
const COMBO_BONUS = { 1: 20, 2: 30, 3: 40, 4: 50, 5: 60, 6: 70, 7: 80, 8: 90, 9: 100 };
function clearBlastLines(state) {
  const rows = [], cols = [];
  for (let row = 0; row < BLAST.ROWS; row += 1) if (state.board[row].every(Boolean)) rows.push(row);
  for (let col = 0; col < BLAST.COLS; col += 1) {
    let full = true;
    for (let row = 0; row < BLAST.ROWS; row += 1) if (!state.board[row][col]) { full = false; break; }
    if (full) cols.push(col);
  }
  const lines = rows.length + cols.length;
  if (!lines) { state.streak = 0; return 0; }
  // Scoring counts lines, but the cells must be deduped: the cell where a cleared
  // row and a cleared column cross belongs to both.
  const hit = new Set();
  for (const row of rows) for (let col = 0; col < BLAST.COLS; col += 1) hit.add(row * BLAST.COLS + col);
  for (const col of cols) for (let row = 0; row < BLAST.ROWS; row += 1) hit.add(row * BLAST.COLS + col);
  for (const index of hit) {
    const row = Math.floor(index / BLAST.COLS), col = index % BLAST.COLS, centre = blastCellCentre(col, row);
    effect(state, { type: 'pop', x: centre.x, y: centre.y, color: state.board[row][col] });
    state.board[row][col] = null;
  }
  state.streak += 1; state.cleared += lines;
  const gain = Math.floor((lines * BLAST.COLS * 10 + (COMBO_BONUS[Math.min(lines, 9)] || 100)) * blastMultiplier(state.streak));
  state.score += gain;
  effect(state, { type: 'text', x: WIDTH / 2, y: BLAST.TOP + BLAST.ROWS * BLAST.CELL / 2, text: `+${gain}` });
  return lines;
}
function blastIsOver(state) {
  const live = state.tray.filter(Boolean);
  // .every on an empty tray is true, which would report an instant loss.
  return live.length > 0 && live.every(piece => !blastHasValidPlacement(state, piece.cells));
}
function placeBlastPiece(state, slot, col, row) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= state.tray.length) return false;
  const piece = state.tray[slot];
  if (!piece) return false;
  const at = blastSnap(state, piece.cells, col, row);
  if (!at) return false;
  for (const cell of piece.cells) state.board[at.row + cell.dy][at.col + cell.dx] = cell.color;
  state.tray[slot] = null;
  // Clear before refilling and refill before the game-over check, so the verdict is
  // made against the post-clear board and a full tray.
  clearBlastLines(state);
  if (state.tray.every(item => !item)) refillTray(state);
  if (blastIsOver(state)) state.phase = 'lost';
  return true;
}
function createBlast(state, count) {
  state.board = Array.from({ length: BLAST.ROWS }, () => Array(BLAST.COLS).fill(null));
  state.tray = [null, null, null]; state.streak = 0; state.cleared = 0;
  state.players = Array.from({ length: count }, (_, id) => ({ id, x: 0, y: 0, tx: 0, ty: 0 }));
  refillTray(state);
}
function actBlast(state, action) {
  return action.type === 'place' && placeBlastPiece(state, action.slot, action.col, action.row);
}
// Blast is turn-based: nothing moves between placements. tickGame still advances
// state.elapsed and expires effects, which is all the clear animation needs.
function tickBlast() {}

export function createGame(mode = 'pop2', seed = Date.now(), options = {}) {
  if (!MODES.includes(mode)) throw new Error('未知游戏');
  const state = { mode, rng: seed >>> 0, phase: 'playing', score: 0, elapsed: 0, level: 1, effects: [], nextId: 1 };
  const count = options.players === 1 ? 1 : 2;
  if (mode === 'pop2') createPop2(state, count); else if (mode === 'pop3') createPop3(state, count); else if (mode === 'surge') createSurge(state, count); else createBlast(state, count);
  return state;
}
export function act(state, player, action = {}) {
  if (!state || state.phase !== 'playing' || !Number.isInteger(player) || !state.players[player] || !action || typeof action !== 'object') return false;
  const p = state.players[player];
  if (action.type === 'move') {
    if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return false;
    if (state.mode === 'pop2') {
      const dx = action.x - POP2.CX, dy = action.y - POP2.CY, scale = Math.min(1, POP2.ARENA_R / (Math.hypot(dx, dy) || 1));
      p.tx = POP2.CX + dx * scale; p.ty = POP2.CY + dy * scale;
    } else if (state.mode === 'pop3') {
      if (p.out) return false;
      p.tx = clamp(action.x, 0, POP3.W); p.ty = clamp(action.y, 0, POP3.H);
    } else if (state.mode === 'surge') {
      p.cmd = null; p.tx = clamp(action.x, 14, WIDTH - 14); p.ty = clamp(action.y, SURGE.BELT_TOP, SURGE.TOP + SURGE.ROWS * SURGE.CELL);
    } else {
      p.tx = clamp(action.x, 0, WIDTH); p.ty = clamp(action.y, 0, HEIGHT);
    }
    return true;
  }
  if (state.mode === 'pop3') return action.type === 'beat' && tapBeat(state, p);
  if (state.mode === 'surge') return actSurge(state, p, action);
  if (state.mode === 'blast') return actBlast(state, action);
  return false;
}
export function tickGame(state, dt = 1 / 60) {
  if (!state || state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.05); state.elapsed += dt;
  state.effects = state.effects.filter(item => state.elapsed - item.time < 0.9);
  if (state.mode === 'pop2') tickPop2(state, dt); else if (state.mode === 'pop3') tickPop3(state, dt); else if (state.mode === 'surge') tickSurge(state, dt); else tickBlast();
}
