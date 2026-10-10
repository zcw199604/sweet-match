// Board locations and combat precedence adapted from samuelyuan/online-junqi (MIT).
// See third_party/junqi/SOURCE.md for the pinned source and adaptation scope.
export const CAMPS = [11, 13, 17, 21, 23, 36, 38, 42, 46, 48];
export const HEADQUARTERS = [1, 3, 56, 58];
export const PIECES = {
  commander: { label: '司令', rank: 9, count: 1 }, general: { label: '军长', rank: 8, count: 1 },
  division: { label: '师长', rank: 7, count: 2 }, brigade: { label: '旅长', rank: 6, count: 2 },
  colonel: { label: '团长', rank: 5, count: 2 }, major: { label: '营长', rank: 4, count: 2 },
  captain: { label: '连长', rank: 3, count: 3 }, lieutenant: { label: '排长', rank: 2, count: 3 },
  engineer: { label: '工兵', rank: 1, count: 3 }, bomb: { label: '炸弹', rank: 0, count: 2 },
  mine: { label: '地雷', rank: 0, count: 3 }, flag: { label: '军旗', rank: 0, count: 1 }
};
const row = cell => Math.floor(cell / 5);
const col = cell => cell % 5;
const validCell = cell => Number.isInteger(cell) && cell >= 0 && cell < 60;
const opposite = side => side === 'red' ? 'blue' : 'red';
const movable = piece => piece && piece.revealed && piece.kind !== 'flag' && piece.kind !== 'mine';

export function createState(random = Math.random) {
  const pieces = [];
  for (const side of ['red', 'blue']) for (const [kind, { count }] of Object.entries(PIECES)) {
    for (let i = 0; i < count; i++) pieces.push({ kind, side, revealed: false });
  }
  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }
  return {
    board: Array.from({ length: 60 }, (_, cell) => CAMPS.includes(cell) ? null : pieces.pop()),
    players: [null, null], turn: 0, moves: 0, quiet: 0, status: 'playing', winner: null,
    last: null, message: '先翻一枚棋子，确定你的阵营。'
  };
}

// Roads run between neighboring stations. Camps also have diagonal roads.
export function roadNeighbors(cell) {
  const r = row(cell), c = col(cell), neighbors = [];
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    if (!dr && !dc) continue;
    const nr = r + dr, nc = c + dc, to = nr * 5 + nc;
    if (nr < 0 || nr >= 12 || nc < 0 || nc >= 5) continue;
    if ((r === 5 && nr === 6) || (r === 6 && nr === 5)) {
      if (dc || ![0, 2, 4].includes(c)) continue;
    }
    if (dr && dc && !CAMPS.includes(cell) && !CAMPS.includes(to)) continue;
    neighbors.push(to);
  }
  return neighbors;
}

export function railNeighbors(cell) {
  const r = row(cell), c = col(cell), neighbors = [];
  if ([1, 5, 6, 10].includes(r)) {
    if (c > 0) neighbors.push(cell - 1);
    if (c < 4) neighbors.push(cell + 1);
  }
  if ([0, 4].includes(c) && r >= 1 && r <= 10) {
    if (r > 1) neighbors.push(cell - 5);
    if (r < 10) neighbors.push(cell + 5);
  }
  if (c === 2 && r === 5) neighbors.push(cell + 5);
  if (c === 2 && r === 6) neighbors.push(cell - 5);
  return neighbors;
}

export function legalMoves(state, from) {
  if (state.status !== 'playing' || !validCell(from)) return [];
  const piece = state.board[from];
  if (!movable(piece) || piece.side !== state.players[state.turn] || HEADQUARTERS.includes(from)) return [];
  const targets = new Set();
  const add = to => {
    const occupant = state.board[to];
    if (!occupant || (occupant.revealed && occupant.side !== piece.side && !CAMPS.includes(to))) targets.add(to);
    return !occupant;
  };
  for (const to of roadNeighbors(from)) add(to);
  if (piece.kind === 'engineer') {
    const visited = new Set([from]), queue = [from];
    while (queue.length) {
      const at = queue.shift();
      for (const to of railNeighbors(at)) {
        if (visited.has(to)) continue;
        visited.add(to);
        if (add(to)) queue.push(to);
      }
    }
  } else {
    for (const first of railNeighbors(from)) {
      const step = first - from;
      let at = from, to = first;
      while (railNeighbors(at).includes(to)) {
        if (!add(to)) break;
        at = to;
        to += step;
      }
    }
  }
  return [...targets];
}

export function battleOutcome(attacker, defender) {
  if (attacker === 'bomb' || defender === 'bomb') return 0;
  if (defender === 'flag') return 1;
  if (defender === 'mine') return attacker === 'engineer' ? 1 : -1;
  return Math.sign(PIECES[attacker].rank - PIECES[defender].rank);
}

export function applyAction(state, action) {
  const invalid = message => ({ ok: false, state, message });
  if (state.status !== 'playing') return invalid('这局已经结束。');
  if (!action) return invalid('请选择翻棋或移动。');
  if (action.type === 'flip') {
    if (!validCell(action.at) || !state.board[action.at] || state.board[action.at].revealed) return invalid('请选择一枚未翻开的棋子。');
  } else if (action.type === 'move') {
    if (!legalMoves(state, action.from).includes(action.to)) return invalid('这枚棋子不能走到这里。');
  } else return invalid('未知操作。');
  const next = { ...state, board: state.board.map(piece => piece ? { ...piece } : null), players: [...state.players], moves: state.moves + 1, last: { ...action } };
  let capturedFlag = false;
  if (action.type === 'flip') {
    const piece = next.board[action.at];
    piece.revealed = true;
    if (!next.players[0]) {
      next.players[next.turn] = piece.side;
      next.players[1 - next.turn] = opposite(piece.side);
    }
    next.message = `翻出${piece.side === 'red' ? '红方' : '蓝方'}${PIECES[piece.kind].label}。`;
    next.quiet = 0;
  } else {
    const attacker = next.board[action.from], defender = next.board[action.to];
    const outcome = defender ? battleOutcome(attacker.kind, defender.kind) : 1;
    next.board[action.from] = null;
    if (outcome >= 0) next.board[action.to] = outcome === 0 ? null : attacker;
    capturedFlag = defender?.kind === 'flag';
    const removed = [outcome <= 0 ? attacker : null, outcome >= 0 ? defender : null];
    for (const piece of removed) if (piece?.kind === 'commander') {
      for (const flag of next.board) if (flag?.side === piece.side && flag.kind === 'flag') flag.revealed = true;
    }
    next.message = defender ? `${PIECES[attacker.kind].label}对阵${PIECES[defender.kind].label}：${outcome === 0 ? '双方同归于尽' : outcome === 1 ? '进攻方获胜' : '防守方获胜'}。` : `${PIECES[attacker.kind].label}已移动。`;
    next.quiet = defender ? 0 : state.quiet + 1;
  }
  next.turn = 1 - state.turn;
  const hidden = next.board.some(piece => piece && !piece.revealed);
  const nextCanMove = next.board.some((piece, at) => piece?.side === next.players[next.turn] && legalMoves(next, at).length > 0);
  if (capturedFlag || (!hidden && !nextCanMove)) {
    next.status = 'won'; next.winner = state.turn;
    next.message += capturedFlag ? ' 已夺取军旗！' : ' 对方已无合法行动。';
  } else if (next.quiet >= 80) {
    next.status = 'draw'; next.message = '连续 80 手没有翻棋或战斗，本局和棋。';
  }
  return { ok: true, state: next, message: next.message };
}

// The AI reads only face-up pieces. Hidden identities never influence its decision.
export function chooseAiAction(state, random = Math.random) {
  if (state.status !== 'playing') return null;
  const hidden = [], moves = [];
  for (let from = 0; from < 60; from++) {
    const piece = state.board[from];
    if (piece && !piece.revealed) hidden.push({ type: 'flip', at: from });
    for (const to of legalMoves(state, from)) {
      const defender = state.board[to];
      let score = random() * 2;
      if (defender) {
        const outcome = battleOutcome(piece.kind, defender.kind);
        score += defender.kind === 'flag' ? 100 : outcome === 1 ? 12 + PIECES[defender.kind].rank : outcome === 0 ? 4 + PIECES[defender.kind].rank - PIECES[piece.kind].rank : -20;
      }
      if (state.last?.type === 'move' && state.last.from === to && state.last.to === from) score -= 1;
      moves.push({ action: { type: 'move', from, to }, score });
    }
  }
  moves.sort((a, b) => b.score - a.score);
  if (moves[0]?.score > 4 || (!hidden.length && moves.length)) return moves[0].action;
  if (hidden.length && (!moves.length || random() < 0.7)) return hidden[Math.floor(random() * hidden.length)];
  return moves[0]?.action ?? null;
}
