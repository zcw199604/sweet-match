// 俄罗斯方块: the rules. A 10-wide well with two hidden rows on top, the seven tetrominoes with Super Rotation
// System turns and wall kicks, a 7-bag randomizer, hold, a ghost, lock delay, and guideline scoring (line clears,
// T-spins, back-to-back, combos, perfect clears). Nothing here touches the DOM, so test/tetris.test.js drives it
// directly; randomness is injected (`rng`) so tests can pin the order of the pieces. Time only enters through
// `tick(state, seconds)`: gravity and the lock delay.
//
// Difficulty changes how fast the pieces fall, how often the level goes up, how long a landed piece may still be
// slid around, and how much help the player gets (how many next pieces are shown, whether there is a ghost).

export const COLS = 10;
export const ROWS = 22;
export const HIDDEN = 2; // the top two rows are above the well: pieces are born there
export const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
export const DIFF_IDS = ['easy', 'normal', 'hard'];
export const DIFFS = {
  easy: { name: '简单', start: 1, perLevel: 12, speed: 0.75, lock: 0.6, preview: 3, ghost: true },
  normal: { name: '普通', start: 1, perLevel: 10, speed: 1, lock: 0.5, preview: 3, ghost: true },
  hard: { name: '困难', start: 8, perLevel: 8, speed: 1.2, lock: 0.4, preview: 1, ghost: false }
};
export const TETRIS = { softFactor: 20, softMin: 0.03, maxResets: 15, queue: 14, maxLevel: 30 };

// Shapes are cell lists inside an n×n box; rotating clockwise maps (x, y) to (n-1-y, x).
const BASE = {
  I: { n: 4, cells: [[0, 1], [1, 1], [2, 1], [3, 1]] },
  O: { n: 4, cells: [[1, 0], [2, 0], [1, 1], [2, 1]] },
  T: { n: 3, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
  S: { n: 3, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
  Z: { n: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  J: { n: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  L: { n: 3, cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }
};
export const SHAPES = Object.fromEntries(TYPES.map((type) => {
  const { n, cells } = BASE[type];
  const turns = [cells];
  for (let i = 1; i < 4; i += 1) turns.push(type === 'O' ? cells : turns[i - 1].map(([x, y]) => [n - 1 - y, x]));
  return [type, turns];
}));

// Wall kicks as (x right, y up) offsets, keyed by "from→to" rotation state.
const KICKS = {
  JLSTZ: {
    '01': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]], '10': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
    '12': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]], '21': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
    '23': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]], '32': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
    '30': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]], '03': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]]
  },
  I: {
    '01': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]], '10': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]],
    '12': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]], '21': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]],
    '23': [[0, 0], [2, 0], [-1, 0], [2, 1], [-1, -2]], '32': [[0, 0], [-2, 0], [1, 0], [-2, -1], [1, 2]],
    '30': [[0, 0], [1, 0], [-2, 0], [1, -2], [-2, 1]], '03': [[0, 0], [-1, 0], [2, 0], [-1, 2], [2, -1]]
  }
};

const LINE_SCORE = [0, 100, 300, 500, 800];
const TSPIN_SCORE = [400, 800, 1200, 1600];
const MINI_SCORE = [100, 200, 400];
const PERFECT_SCORE = [0, 800, 1200, 1800, 2000];

export const cellsOf = (type, rot, x, y) => SHAPES[type][rot].map(([cx, cy]) => [x + cx, y + cy]);
const free = (board, col, row) => col >= 0 && col < COLS && row >= 0 && row < ROWS && !board[row][col];
const fits = (board, type, rot, x, y) => cellsOf(type, rot, x, y).every(([c, r]) => free(board, c, r));
const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(0));

export function gravityInterval(level, diff) {
  const L = Math.min(level, TETRIS.maxLevel);
  return Math.max(0.0005, (0.8 - (L - 1) * 0.007) ** (L - 1) / DIFFS[diff].speed);
}

function shuffled(rng) {
  const bag = TYPES.slice();
  for (let i = bag.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}
function refill(state) { while (state.queue.length < TETRIS.queue) state.queue.push(...shuffled(state.rng)); }
const takeNext = (state) => { refill(state); return state.queue.shift(); };

function spawn(state, type) {
  state.piece = { type, rot: 0, x: 3, y: 0 };
  state.fall = 0; state.lock = 0; state.lockResets = 0; state.lastMove = null; state.lastKick = 0;
  if (!fits(state.board, type, 0, 3, 0)) { state.over = true; state.overReason = 'block'; return false; }
  if (fits(state.board, type, 0, 3, 1)) state.piece.y = 1; // born in the hidden rows, then straight down one
  return true;
}

export function createState(diff = 'normal', rng = Math.random) {
  if (!DIFFS[diff]) diff = 'normal';
  const state = {
    diff, rng, board: emptyBoard(), piece: null, hold: null, holdUsed: false, queue: [],
    score: 0, lines: 0, level: DIFFS[diff].start, combo: -1, b2b: false, over: false, overReason: null,
    fall: 0, lock: 0, lockResets: 0, soft: false, lastMove: null, lastKick: 0, pieces: 0, time: 0
  };
  refill(state);
  spawn(state, takeNext(state));
  state.pieces = 1;
  return state;
}

// ---- saving: rows as strings ('.' empty, else the piece letter), so a save is small and readable ----
export function snapshot(state) {
  return {
    diff: state.diff, board: state.board.map((row) => row.map((c) => c || '.').join('')),
    piece: state.piece ? { ...state.piece } : null, hold: state.hold, holdUsed: state.holdUsed, queue: state.queue.join(''),
    score: state.score, lines: state.lines, combo: state.combo, b2b: state.b2b, pieces: state.pieces, time: Math.round(state.time)
  };
}
export function restoreState(saved, rng = Math.random) {
  if (!saved || !DIFFS[saved.diff] || !Array.isArray(saved.board) || saved.board.length !== ROWS) return null;
  const board = [];
  for (const line of saved.board) {
    if (typeof line !== 'string' || line.length !== COLS) return null;
    const row = [];
    for (const ch of line) {
      if (ch !== '.' && !TYPES.includes(ch)) return null;
      row.push(ch === '.' ? 0 : ch);
    }
    board.push(row);
  }
  const state = createState(saved.diff, rng);
  state.board = board;
  const int = (v) => Math.max(0, Math.floor(Number(v)) || 0);
  state.score = int(saved.score);
  state.lines = int(saved.lines);
  state.level = Math.min(TETRIS.maxLevel, DIFFS[saved.diff].start + Math.floor(state.lines / DIFFS[saved.diff].perLevel));
  state.combo = Number.isInteger(saved.combo) ? Math.max(-1, saved.combo) : -1;
  state.b2b = Boolean(saved.b2b);
  state.pieces = int(saved.pieces);
  state.time = int(saved.time);
  state.hold = TYPES.includes(saved.hold) ? saved.hold : null;
  state.holdUsed = Boolean(saved.holdUsed) && state.hold !== null;
  state.queue = typeof saved.queue === 'string' ? [...saved.queue].filter((t) => TYPES.includes(t)) : [];
  refill(state);
  const p = saved.piece;
  if (p && TYPES.includes(p.type) && Number.isInteger(p.rot) && p.rot >= 0 && p.rot < 4 && Number.isInteger(p.x) && Number.isInteger(p.y) && fits(board, p.type, p.rot, p.x, p.y)) {
    state.piece = { type: p.type, rot: p.rot, x: p.x, y: p.y };
  } else {
    state.piece = null;
    spawn(state, takeNext(state));
  }
  return state;
}

// ---- moving the piece ----
const grounded = (state) => !fits(state.board, state.piece.type, state.piece.rot, state.piece.x, state.piece.y + 1);
// A move that works while the piece is resting on something gives it more time, but only so many times.
function touched(state) {
  if (!grounded(state)) { state.lock = 0; return; }
  if (state.lockResets < TETRIS.maxResets) { state.lock = 0; state.lockResets += 1; }
}
export function move(state, dx) {
  const p = state.piece;
  if (!p || state.over || !fits(state.board, p.type, p.rot, p.x + dx, p.y)) return false;
  p.x += dx;
  state.lastMove = 'move';
  touched(state);
  return true;
}
// dir: 1 clockwise, -1 counter-clockwise. Tries the five SRS kicks in order.
export function rotate(state, dir) {
  const p = state.piece;
  if (!p || state.over || p.type === 'O') return false;
  const to = (p.rot + (dir > 0 ? 1 : 3)) % 4;
  const table = KICKS[p.type === 'I' ? 'I' : 'JLSTZ'][`${p.rot}${to}`];
  for (let k = 0; k < table.length; k += 1) {
    const x = p.x + table[k][0], y = p.y - table[k][1];
    if (!fits(state.board, p.type, to, x, y)) continue;
    p.rot = to; p.x = x; p.y = y;
    state.lastMove = 'rotate';
    state.lastKick = k;
    touched(state);
    return true;
  }
  return false;
}
export function ghostY(state) {
  const p = state.piece;
  if (!p) return 0;
  let y = p.y;
  while (fits(state.board, p.type, p.rot, p.x, y + 1)) y += 1;
  return y;
}
function stepDown(state) {
  const p = state.piece;
  if (!fits(state.board, p.type, p.rot, p.x, p.y + 1)) return false;
  p.y += 1;
  state.lastMove = 'move';
  return true;
}

export function hold(state) {
  if (!state.piece || state.over || state.holdUsed) return [];
  const swap = state.hold;
  state.hold = state.piece.type;
  state.holdUsed = true;
  const events = [{ type: 'hold' }];
  if (!spawn(state, swap ?? takeNext(state))) events.push({ type: 'over', reason: 'block' });
  else if (!swap) state.pieces += 1;
  return events;
}

// ---- locking and scoring ----
function tspinKind(state) {
  const p = state.piece;
  if (p.type !== 'T' || state.lastMove !== 'rotate') return null;
  const corner = (dx, dy) => !free(state.board, p.x + dx, p.y + dy);
  const front = [[[0, 0], [2, 0]], [[2, 0], [2, 2]], [[0, 2], [2, 2]], [[0, 0], [0, 2]]][p.rot];
  const all = [[0, 0], [2, 0], [0, 2], [2, 2]];
  if (all.filter(([dx, dy]) => corner(dx, dy)).length < 3) return null;
  return front.every(([dx, dy]) => corner(dx, dy)) || state.lastKick === 4 ? 'full' : 'mini';
}
function lockPiece(state) {
  const p = state.piece;
  const events = [];
  const tspin = tspinKind(state);
  const cells = cellsOf(p.type, p.rot, p.x, p.y);
  for (const [c, r] of cells) state.board[r][c] = p.type;
  state.piece = null;
  if (cells.every(([, r]) => r < HIDDEN)) {
    state.over = true; state.overReason = 'lockout';
    events.push({ type: 'over', reason: 'lockout' });
    return events;
  }
  const rows = [];
  for (let r = 0; r < ROWS; r += 1) if (state.board[r].every(Boolean)) rows.push({ row: r, cells: state.board[r].slice() });
  const n = rows.length;
  if (n) {
    state.board = state.board.filter((_, r) => !rows.some((x) => x.row === r));
    while (state.board.length < ROWS) state.board.unshift(Array(COLS).fill(0));
  }
  const perfect = n > 0 && state.board.every((row) => row.every((c) => !c));
  const hard = n === 4 || (Boolean(tspin) && n > 0);
  const level = state.level;
  let base = tspin === 'full' ? TSPIN_SCORE[n] : tspin === 'mini' ? MINI_SCORE[Math.min(n, 2)] : LINE_SCORE[n];
  const b2b = hard && state.b2b;
  if (b2b) base = Math.floor(base * 1.5);
  if (n > 0) state.b2b = hard;
  state.combo = n > 0 ? state.combo + 1 : -1;
  let gained = base * level;
  if (state.combo > 0) gained += 50 * state.combo * level;
  if (perfect) gained += PERFECT_SCORE[n] * level;
  state.score += gained;
  state.lines += n;
  events.push({ type: 'lock', cells, rows, lines: n, tspin, b2b, combo: state.combo, perfect, gained, level });
  const next = Math.min(TETRIS.maxLevel, DIFFS[state.diff].start + Math.floor(state.lines / DIFFS[state.diff].perLevel));
  if (next > state.level) { state.level = next; events.push({ type: 'level', level: next }); }
  state.holdUsed = false;
  state.pieces += 1;
  if (!spawn(state, takeNext(state))) events.push({ type: 'over', reason: 'block' });
  return events;
}

export function hardDrop(state) {
  if (!state.piece || state.over) return [];
  let rows = 0;
  while (stepDown(state)) rows += 1;
  state.score += 2 * rows;
  return lockPiece(state);
}

// Gravity and the lock delay. While `state.soft` is set the piece falls faster and each row it falls pays a point.
export function tick(state, seconds) {
  const events = [];
  if (state.over || !state.piece) return events;
  let left = Math.min(seconds, 0.25);
  state.time += left;
  const rule = DIFFS[state.diff];
  for (let guard = 0; left > 0 && !state.over && state.piece && guard < 400; guard += 1) {
    if (grounded(state)) {
      state.fall = 0;
      const need = rule.lock - state.lock;
      if (left < need) { state.lock += left; break; }
      left -= Math.max(0, need);
      events.push(...lockPiece(state));
      continue;
    }
    const base = gravityInterval(state.level, state.diff);
    const interval = state.soft ? Math.min(base, Math.max(base / TETRIS.softFactor, TETRIS.softMin)) : base;
    const need = interval - state.fall;
    if (left < need) { state.fall += left; break; }
    left -= need;
    state.fall = 0;
    if (stepDown(state) && state.soft) state.score += 1;
  }
  return events;
}
export const previews = (state, count) => { refill(state); return state.queue.slice(0, count); };
