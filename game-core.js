// Deterministic, host-authoritative rules shared by browser and tests.
export const COLORS = ['pink', 'cyan', 'yellow', 'violet'];
export const WIDTH = 720;
export const HEIGHT = 720;
export const MODES = ['pop2', 'pop3', 'surge'];
export const ROWS = 14;
export const COLS = 15;
export const RADIUS = 21;
export const SURGE_ROWS = 12;
export const SURGE_COLS = 10;
export const CANNON_Y = 648;
const emptyBoard = (rows, cols) => Array.from({ length: rows }, () => Array(cols).fill(null));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}
function availableColors(state) {
  const used = COLORS.filter(color => state.board.some(row => row.includes(color)));
  return used.length ? used : COLORS;
}
function ammo(state) { const colors = availableColors(state); return colors[Math.floor(random(state) * colors.length)]; }
export function cellCenter(row, col) {
  return { x: 40 + col * 44 + (row % 2 ? 22 : 0), y: 36 + row * 38 };
}
export function neighbours(row, col, rows = ROWS, cols = COLS, hex = true) {
  const adjacent = [[row, col - 1], [row, col + 1], [row - 1, col], [row + 1, col]];
  if (hex) adjacent.push([row - 1, col + (row % 2 ? 1 : -1)], [row + 1, col + (row % 2 ? 1 : -1)]);
  return adjacent.filter(([r, c]) => r >= 0 && r < rows && c >= 0 && c < cols);
}
export function matchAt(board, row, col, hex = true) {
  const color = board[row]?.[col];
  if (!COLORS.includes(color)) return [];
  const group = [], queue = [[row, col]], visited = new Set([`${row}:${col}`]);
  while (queue.length) {
    const [r, c] = queue.pop(); group.push([r, c]);
    for (const [nr, nc] of neighbours(r, c, board.length, board[0].length, hex)) {
      if (board[nr][nc] === color && !visited.has(`${nr}:${nc}`)) {
        visited.add(`${nr}:${nc}`); queue.push([nr, nc]);
      }
    }
  }
  return group;
}
function recordClear(state, cells, multiplier = 1, drop = false) {
  for (const [r, c] of cells) {
    const color = state.board[r][c];
    if (!color) continue;
    state.effects.push({ r, c, color, time: state.elapsed, drop });
    state.board[r][c] = null;
  }
  state.effects = state.effects.slice(-50);
  state.score += cells.length * 100 * multiplier;
  state.cleared += cells.length;
}
function removeFloating(state) {
  const anchored = new Set(), queue = [];
  // Steel fixtures anchor adjacent bubbles as well as blocking shots.
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (state.board[r][c] && (r === 0 || state.board[r][c] === 'stone')) {
      anchored.add(`${r}:${c}`); queue.push([r, c]);
    }
  }
  while (queue.length) {
    const [r, c] = queue.pop();
    for (const [nr, nc] of neighbours(r, c)) if (state.board[nr][nc] && !anchored.has(`${nr}:${nc}`)) {
      anchored.add(`${nr}:${nc}`); queue.push([nr, nc]);
    }
  }
  const fallen = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    if (state.board[r][c] && !anchored.has(`${r}:${c}`)) fallen.push([r, c]);
  }
  recordClear(state, fallen, 2, true);
  return fallen.length;
}
function populate(state) {
  if (state.mode === 'surge') {
    state.board = emptyBoard(SURGE_ROWS, SURGE_COLS);
    const offset = Math.floor(random(state) * 4);
    for (let r = 8; r < SURGE_ROWS; r++) for (let c = 0; c < SURGE_COLS; c++) {
      state.board[r][c] = COLORS[(Math.floor(c / 2) + Math.floor(r / 2) + offset) % 4];
    }
  } else {
    state.board = emptyBoard(ROWS, COLS);
    const depth = state.mode === 'pop3' ? 4 + state.level : Math.min(7, 4 + Math.floor(state.level / 2));
    for (let r = 0; r < depth; r++) for (let c = 0; c < COLS; c++) {
      state.board[r][c] = COLORS[(Math.floor(c / 2) + Math.floor(r / 2) + Math.floor(random(state) * 2)) % 4];
    }
    if (state.mode === 'pop3') for (let r = 2; r < depth; r += 2) for (let c = 2; c < COLS - 1; c += 4) {
      state.board[r][c] = 'stone';
    }
  }
  state.riseIn = riseInterval(state);
}
export function riseInterval(state) {
  if (state.mode === 'surge') return Math.max(3, 9 - Math.floor(state.score / 4000));
  return state.mode === 'pop3' ? 24 : Math.max(8, 18 - state.level);
}
export function createGame(mode = 'pop2', seed = Date.now()) {
  if (!MODES.includes(mode)) throw new Error('未知游戏');
  const state = { mode, rng: seed >>> 0, phase: 'playing', score: 0, cleared: 0, combo: 0,
    elapsed: 0, level: 1, shots: 0, misses: 0, riseIn: 18, projectiles: [], effects: [], nextId: 1, board: [] };
  populate(state);
  state.players = [0, 1].map(id => ({ id, x: id === 0 ? 285 : 435, y: CANNON_Y,
    aimX: id === 0 ? 285 : 435, aimY: 100, current: ammo(state), next: ammo(state), cooldown: 0,
    column: id === 0 ? 3 : 6, held: [] }));
  return state;
}
function compact(board) {
  for (let c = 0; c < board[0].length; c++) {
    const column = board.map(row => row[c]).filter(Boolean);
    for (let r = 0; r < board.length; r++) board[r][c] = column[r - (board.length - column.length)] || null;
  }
}
function allRisingMatches(board) {
  const visited = new Set(), cells = [];
  for (let r = 0; r < board.length; r++) for (let c = 0; c < board[r].length; c++) {
    if (!board[r][c] || visited.has(`${r}:${c}`)) continue;
    const group = matchAt(board, r, c, false);
    for (const [gr, gc] of group) visited.add(`${gr}:${gc}`);
    if (group.length >= 3) cells.push(...group);
  }
  return cells;
}
export function settleRising(state, seeds) {
  const groups = seeds.flatMap(([r, c]) => { const group = matchAt(state.board, r, c, false); return group.length >= 3 ? group : []; });
  let cells = [...new Map(groups.map(cell => [cell.join(':'), cell])).values()], removed = 0, combo = 0;
  while (cells.length) {
    combo++; removed += cells.length;
    recordClear(state, cells, combo); compact(state.board);
    cells = allRisingMatches(state.board);
  }
  state.combo = combo;
  if (combo) state.riseIn = Math.min(riseInterval(state), state.riseIn + combo);
  return removed;
}
function lift(state) {
  const board = state.board;
  if (state.mode === 'surge') {
    if (board[0].some(Boolean)) { state.phase = 'lost'; return; }
    board.shift(); board.push(Array.from({ length: SURGE_COLS }, () => COLORS[Math.floor(random(state) * 4)]));
  } else {
    if (board.at(-1).some(Boolean)) { state.phase = 'lost'; return; }
    board.pop(); board.unshift(Array.from({ length: COLS }, () => ammo(state)));
  }
  state.riseIn = riseInterval(state);
}
function refreshAmmo(state) {
  const colors = availableColors(state);
  for (const p of state.players) {
    if (!colors.includes(p.current)) p.current = ammo(state);
    if (!colors.includes(p.next)) p.next = ammo(state);
  }
}
function attach(state, shot, collision) {
  let options;
  if (collision) options = neighbours(collision[0], collision[1]).filter(([r, c]) => !state.board[r][c]);
  else options = state.board[0].map((_, c) => [0, c]).filter(([r, c]) => !state.board[r][c]);
  options.sort((a, b) => {
    const aa = cellCenter(...a), bb = cellCenter(...b);
    return Math.hypot(aa.x - shot.x, aa.y - shot.y) - Math.hypot(bb.x - shot.x, bb.y - shot.y);
  });
  if (!options.length) { state.phase = 'lost'; return; }
  const [r, c] = options[0]; state.board[r][c] = shot.color;
  const matched = matchAt(state.board, r, c);
  state.combo = 0;
  if (matched.length >= 3) {
    recordClear(state, matched); const fallen = removeFloating(state); state.combo = fallen ? 2 : 1; state.misses = 0;
  } else state.misses++;
  if (state.mode === 'pop3' && state.misses >= 6) { state.misses = 0; lift(state); }
  if (state.board.at(-1).some(Boolean)) state.phase = 'lost';
  refreshAmmo(state);
}
export function act(state, player, action = {}) {
  if (!state || state.phase !== 'playing' || !Number.isInteger(player) || player < 0 || player > 1 || !action || typeof action !== 'object') return false;
  const p = state.players[player];
  if (action.type === 'aim') {
    if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return false;
    p.aimX = clamp(action.x, 0, WIDTH); p.aimY = clamp(action.y, 0, CANNON_Y - 70); return true;
  }
  if (action.type === 'column' && state.mode === 'surge') {
    if (!Number.isInteger(action.col) || action.col < 0 || action.col >= SURGE_COLS) return false;
    p.column = action.col; return true;
  }
  if (action.type === 'select' && state.mode !== 'surge' && COLORS.includes(action.color)) {
    if (p.current === action.color) return true;
    if (p.next === action.color) { [p.current, p.next] = [p.next, p.current]; return true; }
    return false;
  }
  if (action.type === 'swap' && state.mode !== 'surge') { [p.current, p.next] = [p.next, p.current]; return true; }
  if (p.cooldown > 0) return false;
  if (state.mode === 'surge') {
    const col = p.column;
    if (action.type === 'grab') {
      const color = state.board[SURGE_ROWS - 1][col];
      if (!color || (p.held.length && p.held[0] !== color) || p.held.length >= 4) return false;
      for (let r = SURGE_ROWS - 1; r >= 0 && state.board[r][col] === color && p.held.length < 4; r--) {
        p.held.push(color); state.board[r][col] = null;
      }
      compact(state.board); p.cooldown = 0.12; return true;
    }
    if (action.type === 'fire' && p.held.length) {
      const count = state.board.filter(row => row[col]).length;
      if (count + p.held.length > SURGE_ROWS) { state.phase = 'lost'; return false; }
      const seeds = [];
      for (let i = 0; i < p.held.length; i++) {
        const row = SURGE_ROWS - count - i - 1; state.board[row][col] = p.held[i]; seeds.push([row, col]);
      }
      p.held = []; p.cooldown = 0.18; state.shots++;
      settleRising(state, seeds); return true;
    }
    return false;
  }
  if (action.type === 'fire' && !state.projectiles.some(shot => shot.player === player)) {
    const angle = clamp(Math.atan2(p.aimY - p.y, p.aimX - p.x), -Math.PI + 0.18, -0.18);
    state.projectiles.push({ id: state.nextId++, player, color: p.current, x: p.x, y: p.y, vx: Math.cos(angle) * 720, vy: Math.sin(angle) * 720 });
    p.current = p.next; p.next = ammo(state); p.cooldown = 0.24; state.shots++; return true;
  }
  return false;
}
export function tickGame(state, dt = 1 / 60) {
  if (!state || state.phase !== 'playing' || !Number.isFinite(dt) || dt <= 0) return;
  dt = Math.min(dt, 0.05); state.elapsed += dt; state.riseIn -= dt;
  for (const player of state.players) player.cooldown = Math.max(0, player.cooldown - dt);
  state.effects = state.effects.filter(effect => state.elapsed - effect.time < 0.7);
  if (state.riseIn <= 0) lift(state);
  if (state.phase !== 'playing' || state.mode === 'surge') return;
  // Small substeps prevent fast shots tunnelling through a bubble.
  for (const shot of [...state.projectiles]) {
    let finished = false;
    const steps = Math.ceil(dt * 720 / 8), subDt = dt / steps;
    for (let step = 0; step < steps && !finished; step++) {
      shot.x += shot.vx * subDt; shot.y += shot.vy * subDt;
      if (shot.x < RADIUS) { shot.x = 2 * RADIUS - shot.x; shot.vx = Math.abs(shot.vx); }
      if (shot.x > WIDTH - RADIUS) { shot.x = 2 * (WIDTH - RADIUS) - shot.x; shot.vx = -Math.abs(shot.vx); }
      let collision = null, nearest = Infinity;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.board[r][c]) {
        const point = cellCenter(r, c), distance = Math.hypot(point.x - shot.x, point.y - shot.y);
        if (distance < RADIUS * 2 - 1 && distance < nearest) { collision = [r, c]; nearest = distance; }
      }
      if (collision || shot.y <= 36) { attach(state, shot, collision); finished = true; }
    }
    if (finished) state.projectiles = state.projectiles.filter(other => other.id !== shot.id);
    if (state.phase !== 'playing') break;
  }
  if (state.phase === 'playing' && !state.projectiles.length && !state.board.flat().some(color => COLORS.includes(color))) {
    if (state.mode === 'pop3' && state.level >= 3) state.phase = 'won';
    else { state.level++; state.misses = 0; populate(state); refreshAmmo(state); }
  }
}
