const ROWS = 9;
const COLS = 7;
const SIZE = ROWS * COLS;
const inBounds = p => Number.isInteger(p) && p >= 0 && p < SIZE;
const row = p => Math.floor(p / COLS);
const col = p => p % COLS;
const pos = (r, c) => r * COLS + c;
const validRC = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;

const riverCells = new Set();
for (let r = 3; r <= 5; r++) for (const c of [1, 2, 4, 5]) riverCells.add(pos(r, c));
const dens = new Map([[pos(0, 3), 2], [pos(8, 3), 1]]);
const trapOwners = new Map([[pos(0, 2), 2], [pos(0, 4), 2], [pos(1, 3), 2], [pos(8, 2), 1], [pos(8, 4), 1], [pos(7, 3), 1]]);

export function terrain(at) {
  if (dens.has(at)) return 'den';
  if (trapOwners.has(at)) return 'trap';
  if (riverCells.has(at)) return 'river';
  return 'land';
}
export function owner(at) { return dens.get(at) ?? trapOwners.get(at) ?? null; }
const clonePiece = p => p ? { side: p.side, rank: p.rank } : null;
const cloneBoard = board => board.map(clonePiece);
const stateKey = state => `${state.turn}|${state.board.map(p => p ? `${p.side}${p.rank}` : '0').join('')}`;
const attachHistory = (state, history) => Object.defineProperty(state, 'history', { value: history, writable: true, configurable: true, enumerable: false });

export function createState() {
  const board = Array(SIZE).fill(null);
  const put = (r, c, side, rank) => { board[pos(r, c)] = { side, rank }; };
  put(0, 0, 2, 7); put(0, 6, 2, 6); put(1, 1, 2, 3); put(1, 5, 2, 2);
  put(2, 0, 2, 1); put(2, 2, 2, 5); put(2, 4, 2, 4); put(2, 6, 2, 8);
  put(6, 0, 1, 8); put(6, 2, 1, 4); put(6, 4, 1, 5); put(6, 6, 1, 1);
  put(7, 1, 1, 2); put(7, 5, 1, 3); put(8, 0, 1, 6); put(8, 6, 1, 7);
  const state = { board, turn: 1, status: 'playing', winner: null, moves: 0, last: null };
  attachHistory(state, new Map([[stateKey(state), 1]]));
  return state;
}

const strength = (piece, at) => trapOwners.has(at) && owner(at) !== piece.side ? 0 : piece.rank;
function canCapture(attacker, defender, from, at) {
  if (!defender || defender.side === attacker.side) return !defender;
  const attackingRank = strength(attacker, from), defendingRank = strength(defender, at);
  if (defendingRank === 0) return true;
  if (attackingRank === 0) return false;
  if (attacker.rank === 8 && defender.rank === 1) return false;
  return attacker.rank === 1 && defender.rank === 8 ? true : attackingRank >= defendingRank;
}
function pathHasRat(state, from, to) {
  const dr = Math.sign(row(to) - row(from)), dc = Math.sign(col(to) - col(from));
  let r = row(from) + dr, c = col(from) + dc;
  while (r !== row(to) || c !== col(to)) { if (state.board[pos(r, c)]?.rank === 1) return true; r += dr; c += dc; }
  return false;
}
function addTarget(state, from, to, result) {
  if (!inBounds(to)) return;
  const piece = state.board[from];
  if (dens.get(to) === piece.side) return;
  const target = state.board[to];
  if (target?.side === piece.side) return;
  if (target && piece.rank === 1 && (terrain(from) === 'river') !== (terrain(to) === 'river')) return;
  if (target && !canCapture(piece, target, from, to)) return;
  result.push({ from, to, captures: target ? [to] : [] });
}
function addStep(state, from, to, result) {
  if (!inBounds(to)) return;
  const p = state.board[from];
  if (terrain(to) === 'river' && p.rank !== 1) return;
  addTarget(state, from, to, result);
}
function addJump(state, from, dr, dc, result) {
  const p = state.board[from];
  if (p.rank !== 6 && p.rank !== 7) return;
  let r = row(from) + dr, c = col(from) + dc;
  if (!validRC(r, c) || terrain(pos(r, c)) !== 'river') return;
  while (validRC(r, c) && terrain(pos(r, c)) === 'river') { r += dr; c += dc; }
  if (!validRC(r, c) || pathHasRat(state, from, pos(r, c))) return;
  addTarget(state, from, pos(r, c), result);
}
export function legalMoves(state, from) {
  if (!state || state.status !== 'playing') return [];
  const starts = from === undefined ? state.board.map((p, i) => p?.side === state.turn ? i : -1).filter(i => i >= 0) : [from];
  const moves = [];
  for (const at of starts) {
    if (!inBounds(at)) continue;
    const piece = state.board[at];
    if (!piece || piece.side !== state.turn || dens.has(at)) continue;
    const r = row(at), c = col(at);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (validRC(r + dr, c + dc)) addStep(state, at, pos(r + dr, c + dc), moves);
    if (piece.rank === 6 || piece.rank === 7) for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) addJump(state, at, dr, dc, moves);
  }
  return moves;
}
function validMove(state, move) {
  if (!inBounds(move?.from) || !inBounds(move?.to)) return null;
  return legalMoves(state, move.from).find(m => m.to === move.to) ?? null;
}
export function applyMove(state, move) {
  if (!state || state.status !== 'playing') return { ok: false, state, message: '这局已经结束。' };
  const selected = validMove(state, move);
  if (!selected) return { ok: false, state, message: '这枚棋子不能走到这里。' };
  const board = cloneBoard(state.board), piece = board[selected.from];
  board[selected.from] = null; board[selected.to] = piece;
  const next = { board, turn: state.turn === 1 ? 2 : 1, status: 'playing', winner: null, moves: state.moves + 1, last: { ...selected } };
  const history = new Map(state.history ?? [[stateKey(state), 1]]); attachHistory(next, history);
  if (dens.has(selected.to) && dens.get(selected.to) !== piece.side) { next.status = 'won'; next.winner = piece.side; }
  else {
    const key = stateKey(next); history.set(key, (history.get(key) ?? 0) + 1);
    if (!board.some(p => p?.side === next.turn) || !legalMoves(next).length) { next.status = 'won'; next.winner = piece.side; }
    else if ((history.get(key) ?? 0) >= 3) next.status = 'draw';
  }
  return { ok: true, state: next, message: next.status === 'won' ? '胜利！' : next.status === 'draw' ? '三次重复，和棋。' : undefined };
}
export function chooseAiMove(state) {
  if (!state || state.status !== 'playing') return null;
  const moves = legalMoves(state);
  if (!moves.length) return null;
  const enemyDen = state.turn === 1 ? pos(0, 3) : pos(8, 3);
  const distance = at => Math.abs(row(at) - row(enemyDen)) + Math.abs(col(at) - col(enemyDen));
  let best = moves[0], bestScore = -Infinity;
  for (const move of moves) {
    const next = applyMove(state, move).state;
    if (next.status === 'won' && next.winner === state.turn) return move;
    const attacker = state.board[move.from], captured = state.board[move.to];
    let score = (distance(move.from) - distance(move.to)) * 3 - distance(move.to) * 0.1;
    if (captured) score += 12 + captured.rank * 3;
    const replies = legalMoves(next);
    if (replies.some(reply => reply.captures.includes(move.to))) score -= 15 + attacker.rank * 4;
    if (replies.some(reply => dens.has(reply.to))) score -= 1000;
    if (state.last?.from === move.to && state.last?.to === move.from) score -= 2;
    if (next.status === 'draw') score -= 1;
    if (score > bestScore) { best = move; bestScore = score; }
  }
  return best;
}
