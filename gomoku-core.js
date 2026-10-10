export function createState() { return { board: Array(225).fill(null), turn: 1, status: 'playing', winner: null, moves: 0, last: null }; }
const axes = [[0,1], [1,0], [1,1], [1,-1]];
const inside = (r,c) => r >= 0 && r < 15 && c >= 0 && c < 15;
function lines(board, at, side) {
  const row = Math.floor(at / 15), col = at % 15;
  return axes.map(([dr,dc]) => {
    let count = 1, open = 0;
    for (const sign of [-1,1]) {
      let r = row + dr * sign, c = col + dc * sign;
      while (inside(r,c) && board[r*15+c]?.side === side) { count++; r += dr*sign; c += dc*sign; }
      if (inside(r,c) && !board[r*15+c]) open++;
    }
    return { count, open };
  });
}
export function legalMoves(state) {
  return state.status !== 'playing' ? [] : state.board.flatMap((p,to) => p ? [] : [{to}]);
}
export function applyMove(state, move) {
  const to = move?.to;
  if (state.status !== 'playing' || !Number.isInteger(to) || to < 0 || to >= 225 || state.board[to]) return { ok: false, state, message: '请选择空的交叉点。' };
  const board = state.board.slice(); board[to] = {side:state.turn};
  const won = lines(board,to,state.turn).some(line => line.count >= 5);
  return {ok:true,state:{...state,board,turn:3-state.turn,moves:state.moves+1,last:{to},status:won?'won':board.every(Boolean)?'draw':'playing',winner:won?state.turn:null}};
}
function strength(board, at, side) {
  return lines(board,at,side).reduce((score,{count,open}) => score + (count >= 5 ? 1e8 : open ? [0,2,20,400,20000][count] * open : 0),0);
}
export function chooseAiMove(state) {
  if (state.status !== 'playing') return null;
  if (!state.board.some(Boolean)) return {to:112};
  let best = null, bestScore = -Infinity;
  for (const move of legalMoves(state)) {
    const r = Math.floor(move.to/15), c = move.to%15;
    if (!state.board.some((p,i) => p && Math.abs(Math.floor(i/15)-r)<=2 && Math.abs(i%15-c)<=2)) continue;
    const own = strength(state.board,move.to,state.turn), other = strength(state.board,move.to,3-state.turn);
    const score = own >= 1e8 ? 1e10 + own : other >= 1e8 ? 1e9 + other : own + other*.95 - Math.abs(r-7)-Math.abs(c-7);
    if (score > bestScore) {best=move;bestScore=score;}
  }
  return best;
}
