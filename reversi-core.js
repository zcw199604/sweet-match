export function createState() {
  const board = Array(64).fill(null);
  board[27] = board[36] = { side: 2 }; board[28] = board[35] = { side: 1 };
  return { board, turn: 1, status: 'playing', winner: null, moves: 0, last: null, passed: null };
}
const directions = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const inside = (r,c) => r>=0 && r<8 && c>=0 && c<8;
function flips(board, at, side) {
  if (board[at]) return [];
  const captures=[];
  for (const [dr,dc] of directions) {
    let r=Math.floor(at/8)+dr,c=at%8+dc;
    const line=[];
    while(inside(r,c) && board[r*8+c]?.side===3-side) {line.push(r*8+c);r+=dr;c+=dc;}
    if(line.length && inside(r,c) && board[r*8+c]?.side===side) captures.push(...line);
  }
  return captures;
}
export function legalMoves(state) {
  if(state.status!=='playing') return [];
  return state.board.flatMap((piece,to) => {const captures=piece?[]:flips(state.board,to,state.turn);return captures.length?[{to,captures}]:[];});
}
export function applyMove(state, action) {
  const move=legalMoves(state).find(m=>m.to===action?.to);
  if(!move) return {ok:false,state,message:'只能落在可以夹住对方棋子的位置。'};
  const board=state.board.slice();
  for(const at of [move.to,...move.captures]) board[at]={side:state.turn};
  const next={...state,board,turn:3-state.turn,moves:state.moves+1,last:move,passed:null};
  if(!legalMoves(next).length) {
    next.passed=next.turn;next.turn=state.turn;
    if(!legalMoves(next).length) {
      const difference=board.reduce((n,p)=>n+(p?(p.side===1?1:-1):0),0);
      next.status=difference?'won':'draw';next.winner=difference?difference>0?1:2:null;
    }
  }
  return {ok:true,state:next};
}
const corners=[0,7,56,63];
function value(state, side) {
  return state.board.reduce((n,p,at)=>{
    if(!p) return n;
    const r=Math.floor(at/8),c=at%8;
    let weight=corners.includes(at)?120:r===0||r===7||c===0||c===7?8:2;
    for(const corner of corners) if(!state.board[corner] && Math.abs(Math.floor(corner/8)-r)<=1 && Math.abs(corner%8-c)<=1) weight=-25;
    return n+(p.side===side?weight:-weight);
  },0);
}
export function chooseAiMove(state) {
  let best=null,bestScore=-Infinity;
  for(const move of legalMoves(state)) {
    const next=applyMove(state,move).state;
    let score=value(next,state.turn);
    if(next.status==='won') score=next.winner===state.turn?1e6:-1e6;
    else if(next.turn!==state.turn) {
      const responses=legalMoves(next);
      if(responses.length) score=Math.min(...responses.map(m=>value(applyMove(next,m).state,state.turn)))-responses.length;
    }
    if(score>bestScore){bestScore=score;best=move;}
  }
  return best;
}
