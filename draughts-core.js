const DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const inside = (row, col) => row >= 0 && row < 10 && col >= 0 && col < 10;
const rowAt = index => Math.floor(index / 10);
const other = side => side === 1 ? 2 : 1;

function positionKey(state) {
  return `${state.turn}:${state.board.map(piece => piece ? `${piece.side}${piece.king ? 'k' : 'm'}` : '.').join('')}`;
}

export function createState() {
  const board = Array(100).fill(null);
  for (let row = 0; row < 10; row++) {
    for (let col = 0; col < 10; col++) {
      if ((row + col) % 2 === 1 && (row < 4 || row > 5)) {
        board[row * 10 + col] = { side: row < 4 ? 2 : 1, king: false };
      }
    }
  }
  const state = { board, turn: 1, status: 'playing', winner: null, moves: 0, last: null, quietKingPlies: 0, repetition: {} };
  state.repetition[positionKey(state)] = 1;
  return state;
}

function captureMoves(board, from, piece) {
  const routes = [];
  // Captured pieces remain blockers until the turn ends (international rules).
  function visit(at, path, captures) {
    let continued = false;
    for (const [dr, dc] of DIRECTIONS) {
      let row = rowAt(at) + dr;
      let col = at % 10 + dc;
      let victim = null;
      while (inside(row, col)) {
        const square = row * 10 + col;
        const target = square === from || path.includes(square) ? null : board[square];
        if (target) {
          if (victim !== null || target.side === piece.side || captures.includes(square)) break;
          victim = square;
        } else if (victim !== null) {
          continued = true;
          visit(square, [...path, square], [...captures, victim]);
          if (!piece.king) break;
        } else if (!piece.king) break;
        row += dr;
        col += dc;
      }
    }
    if (!continued && captures.length) routes.push({ from, to: at, path, captures });
  }
  visit(from, [], []);
  return routes;
}

export function legalMoves(state, from) {
  if (state.status !== 'playing') return [];
  const captures = [];
  const quiet = [];
  state.board.forEach((piece, index) => {
    if (piece?.side !== state.turn) return;
    captures.push(...captureMoves(state.board, index, piece));
    for (const [dr, dc] of DIRECTIONS) {
      if (!piece.king && dr !== (piece.side === 1 ? -1 : 1)) continue;
      let row = rowAt(index) + dr;
      let col = index % 10 + dc;
      while (inside(row, col) && !state.board[row * 10 + col]) {
        const to = row * 10 + col;
        quiet.push({ from: index, to, path: [to], captures: [] });
        if (!piece.king) break;
        row += dr;
        col += dc;
      }
    }
  });
  const max = captures.reduce((count, move) => Math.max(count, move.captures.length), 0);
  const moves = max ? captures.filter(move => move.captures.length === max) : quiet;
  return from === undefined ? moves : moves.filter(move => move.from === from);
}

function sameRoute(a, b) {
  return a.from === b.from && a.to === b.to &&
    Array.isArray(b.path) && a.path.length === b.path.length && a.path.every((at, i) => at === b.path[i]) &&
    Array.isArray(b.captures) && a.captures.length === b.captures.length && a.captures.every((at, i) => at === b.captures[i]);
}

function finishMove(state, move) {
  const board = state.board.map(piece => piece ? { ...piece } : null);
  const piece = board[move.from];
  const wasKing = piece.king;
  board[move.from] = null;
  for (const square of move.captures) board[square] = null;
  piece.king ||= rowAt(move.to) === (piece.side === 1 ? 0 : 9);
  board[move.to] = piece;
  const next = {
    ...state, board, turn: other(state.turn), moves: state.moves + 1,
    last: { ...move, path: [...move.path], captures: [...move.captures] },
    quietKingPlies: wasKing && !move.captures.length ? (state.quietKingPlies || 0) + 1 : 0,
    repetition: { ...(state.repetition || {}) }
  };
  const before = positionKey(state);
  if (!next.repetition[before]) next.repetition[before] = 1;
  const key = positionKey(next);
  next.repetition[key] = (next.repetition[key] || 0) + 1;
  if (!legalMoves(next).length) {
    next.status = 'won';
    next.winner = state.turn;
  } else if (next.repetition[key] >= 3 || next.quietKingPlies >= 50) {
    next.status = 'draw';
    next.winner = null;
  }
  return next;
}

export function applyMove(state, move) {
  const legal = move && legalMoves(state).find(candidate => sameRoute(candidate, move));
  if (!legal) return { ok: false, state, message: 'Illegal move' };
  return { ok: true, state: finishMove(state, legal) };
}

function evaluate(state, side) {
  if (state.status === 'won') return state.winner === side ? 100000 : -100000;
  if (state.status === 'draw') return 0;
  return state.board.reduce((score, piece, index) => {
    if (!piece) return score;
    const advance = piece.side === 1 ? 9 - rowAt(index) : rowAt(index);
    const value = piece.king ? 330 : 100 + advance * 5;
    return score + (piece.side === side ? value : -value);
  }, 0);
}

export function chooseAiMove(state) {
  const moves = legalMoves(state);
  let best = null;
  let bestScore = -Infinity;
  for (const move of moves) {
    const next = finishMove(state, move);
    const replies = legalMoves(next);
    let score = evaluate(next, state.turn);
    if (replies.length) {
      score = Infinity;
      for (const reply of replies) score = Math.min(score, evaluate(finishMove(next, reply), state.turn));
    }
    if (score > bestScore) { best = move; bestScore = score; }
  }
  return best;
}
