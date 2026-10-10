import { Xiangqi } from './third_party/xiangqi/xiangqi.js';

export const PIECE_LABELS = {
  r: { r: '车', n: '马', b: '相', a: '仕', k: '帅', c: '炮', p: '兵' },
  b: { r: '车', n: '马', b: '象', a: '士', k: '将', c: '炮', p: '卒' }
};
const engines = new WeakMap();
const other = color => color === 'r' ? 'b' : 'r';
const values = { k: 10000, r: 900, c: 450, n: 420, b: 200, a: 200, p: 100 };
export const squareAt = (row, col) => `${String.fromCharCode(97 + col)}${9 - row}`;

function sync(state, engine) {
  state.board = engine.board();
  state.turn = engine.turn();
  state.fen = engine.fen();
  state.history = engine.history({ verbose: true });
  state.lastMove = state.history.at(-1) ?? null;
  state.check = engine.in_check();
  state.phase = 'playing';
  state.winner = null;
  state.reason = null;
  if (engine.in_checkmate() || engine.in_stalemate()) {
    state.phase = 'over';
    state.winner = other(state.turn);
    state.reason = state.check ? 'checkmate' : 'stalemate';
  } else if (engine.in_draw()) {
    state.phase = 'over';
    state.reason = 'draw';
  }
  return state;
}

export function createXiangqi({ fen } = {}) {
  const engine = new Xiangqi();
  if (fen && !engine.load(fen)) throw new Error('Invalid Xiangqi FEN');
  const state = {};
  engines.set(state, engine);
  return sync(state, engine);
}

export function legalMoves(state, from) {
  if (state.phase !== 'playing') return [];
  return engines.get(state).moves({ verbose: true, ...(from ? { square: from } : {}) });
}

export function moveXiangqi(state, from, to) {
  if (state.phase !== 'playing') return { ok: false, reason: 'over' };
  const engine = engines.get(state);
  const move = engine.move({ from, to });
  if (!move) return { ok: false, reason: 'illegal' };
  sync(state, engine);
  return { ok: true, move };
}

export function undoXiangqi(state, count = 1) {
  const engine = engines.get(state);
  let changed = false;
  for (let i = 0; i < count; i++) {
    if (!engine.undo()) break;
    changed = true;
  }
  if (changed) sync(state, engine);
  return changed;
}

function material(engine, color) {
  let score = 0;
  engine.board().forEach((row, r) => row.forEach(piece => {
    if (!piece) return;
    const advance = piece.color === 'r' ? 9 - r : r;
    const value = values[piece.type] + (piece.type === 'p' ? advance * 12 : 0);
    score += piece.color === color ? value : -value;
  }));
  return score;
}

// A shallow, deterministic reply search: enough for casual play, bounded for mobile.
export function* xiangqiSearch(state) {
  if (state.phase !== 'playing') return null;
  const engine = engines.get(state);
  const color = engine.turn();
  const moves = engine.moves({ verbose: true });
  let best = null, bestScore = -Infinity;
  for (const move of moves) {
    engine.move(move);
    let score;
    if (engine.in_checkmate() || engine.in_stalemate()) score = 100000;
    else {
      score = material(engine, color) + (engine.in_check() ? 25 : 0);
      const replies = engine.moves({ verbose: true });
      let worst = Infinity;
      for (const reply of replies) {
        engine.move(reply);
        const result = engine.in_checkmate() || engine.in_stalemate() ? -100000 : material(engine, color);
        worst = Math.min(worst, result);
        engine.undo();
      }
      if (replies.length) score = Math.min(score, worst);
    }
    engine.undo();
    if (score > bestScore) { bestScore = score; best = move; }
    yield best;
  }
  return best;
}

export function chooseXiangqiMove(state) {
  const search = xiangqiSearch(state);
  let step = search.next();
  while (!step.done) step = search.next();
  return step.value;
}
