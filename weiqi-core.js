// 围棋（ARCADE 33）的规则和电脑：9 路棋盘，中国规则数子（贴 7.5 目），禁止自杀，
// 不能下回已经出现过的局面（全局同形，顺带挡住打劫）。双方连续停一手就进入数子。
// 电脑是蒙特卡洛树搜索（UCT + RAVE）：从当前局面随机下到底很多次，看哪一步赢得多。
// 棋盘用带一圈边框的一维数组：N = size + 2，格子 (r, c) 在 (r + 1) * N + c + 1；边框记成 WALL。
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const WALL = 3;
export const PASS = -1;
export const LEVELS = { easy: { label: '简单', playouts: 400 }, normal: { label: '普通', playouts: 2500 }, hard: { label: '困难', playouts: 5000 } };
const other = (color) => 3 - color;

export function createGame(size = 9, komi = 7.5) {
  const N = size + 2;
  const board = new Int8Array(N * N).fill(WALL);
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) board[(r + 1) * N + c + 1] = EMPTY;
  return { size, N, komi, board, toPlay: BLACK, passes: 0, captures: { 1: 0, 2: 0 }, history: [], seen: new Set([hashOf(board)]), last: null, over: false, moves: 0 };
}
export const idx = (state, r, c) => (r + 1) * state.N + c + 1;
export const rc = (state, i) => [Math.floor(i / state.N) - 1, (i % state.N) - 1];
const hashOf = (board) => board.join('');
const neighbours = (N, i) => [i - N, i + 1, i + N, i - 1];

// 一块棋和它的气：返回 { stones, liberties }。
export function groupAt(board, N, i) {
  const color = board[i];
  const stones = [i], libs = new Set(), seen = new Set([i]);
  for (let k = 0; k < stones.length; k += 1) {
    for (const n of neighbours(N, stones[k])) {
      if (board[n] === EMPTY) libs.add(n);
      else if (board[n] === color && !seen.has(n)) { seen.add(n); stones.push(n); }
    }
  }
  return { stones, liberties: libs.size };
}
// 在 board 上落子（就地改），返回提掉的子；自杀返回 null（board 不变）。
function place(board, N, i, color) {
  if (board[i] !== EMPTY) return null;
  board[i] = color;
  const dead = [];
  for (const n of neighbours(N, i)) {
    if (board[n] !== other(color)) continue;
    const g = groupAt(board, N, n);
    if (g.liberties === 0) for (const s of g.stones) if (board[s] !== EMPTY) { board[s] = EMPTY; dead.push(s); }
  }
  if (!dead.length && groupAt(board, N, i).liberties === 0) { board[i] = EMPTY; return null; }
  return dead;
}
export function isLegal(state, i) {
  if (state.over || state.board[i] !== EMPTY) return false;
  const board = state.board.slice();
  if (place(board, state.N, i, state.toPlay) === null) return false;
  return !state.seen.has(hashOf(board));
}
export function play(state, i) {
  if (!isLegal(state, i)) return null;
  state.history.push({ board: state.board.slice(), toPlay: state.toPlay, passes: state.passes, captures: { ...state.captures }, last: state.last, moves: state.moves });
  const dead = place(state.board, state.N, i, state.toPlay);
  state.captures[state.toPlay] += dead.length;
  state.seen.add(hashOf(state.board));
  state.last = i;
  state.passes = 0;
  state.moves += 1;
  state.toPlay = other(state.toPlay);
  return dead;
}
export function pass(state) {
  if (state.over) return false;
  state.history.push({ board: state.board.slice(), toPlay: state.toPlay, passes: state.passes, captures: { ...state.captures }, last: state.last, moves: state.moves });
  state.passes += 1;
  state.last = PASS;
  state.moves += 1;
  state.toPlay = other(state.toPlay);
  if (state.passes >= 2) state.over = true;
  return true;
}
export function undo(state) {
  const prev = state.history.pop();
  if (!prev) return false;
  state.seen.delete(hashOf(state.board));
  Object.assign(state, prev, { over: false });
  state.seen.add(hashOf(state.board));
  return true;
}

// 数子：死子先拿掉，然后棋子 + 只被一方围住的空点。dead 是死子格子的集合。
export function score(state, dead = new Set()) {
  const { board: original, N, size } = state;
  const board = original.slice();
  for (const i of dead) board[i] = EMPTY;
  const owner = new Int8Array(board.length);
  const seen = new Uint8Array(board.length);
  let black = 0, white = 0;
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) {
    const i = (r + 1) * N + c + 1;
    if (board[i] === BLACK) { black += 1; owner[i] = BLACK; continue; }
    if (board[i] === WHITE) { white += 1; owner[i] = WHITE; continue; }
    if (seen[i]) continue;
    const area = [i], touch = new Set();
    seen[i] = 1;
    for (let k = 0; k < area.length; k += 1) for (const n of neighbours(N, area[k])) {
      if (board[n] === EMPTY && !seen[n]) { seen[n] = 1; area.push(n); } else if (board[n] === BLACK || board[n] === WHITE) touch.add(board[n]);
    }
    if (touch.size === 1) {
      const who = [...touch][0];
      for (const a of area) owner[a] = who;
      if (who === BLACK) black += area.length; else white += area.length;
    }
  }
  return { black, white: white + state.komi, owner, winner: black > white + state.komi ? BLACK : WHITE, margin: Math.abs(black - white - state.komi) };
}

// ---- 电脑：随机下到底 ----
function isEye(board, N, i, color) {
  for (const n of neighbours(N, i)) if (board[n] !== color && board[n] !== WALL) return false;
  let bad = 0, edge = false;
  for (const d of [i - N - 1, i - N + 1, i + N - 1, i + N + 1]) {
    if (board[d] === WALL) edge = true;
    else if (board[d] === other(color)) bad += 1;
  }
  return edge ? bad === 0 : bad < 2;
}
// 从 board 出发随机下完，返回最后的盘面和这局里每个颜色先下过的点（RAVE 用）。
function playout(board, N, size, toPlay, rand, firstMove) {
  const empties = [];
  for (let i = 0; i < board.length; i += 1) if (board[i] === EMPTY) empties.push(i);
  let passes = 0, color = toPlay;
  const limit = size * size * 3;
  for (let step = 0; step < limit && passes < 2; step += 1) {
    let moved = false;
    for (let tries = empties.length; tries > 0; tries -= 1) {
      const k = Math.floor(rand() * tries);
      const i = empties[k];
      // 试过的挪到末尾，不再重复抽
      empties[k] = empties[tries - 1]; empties[tries - 1] = i;
      if (board[i] !== EMPTY || isEye(board, N, i, color)) continue;
      const dead = place(board, N, i, color);
      if (dead === null) continue;
      if (!firstMove[i]) firstMove[i] = color;
      for (const d of dead) empties.push(d);
      const at = empties.indexOf(i);
      empties[at] = empties[empties.length - 1]; empties.pop();
      moved = true;
      break;
    }
    passes = moved ? 0 : passes + 1;
    color = other(color);
  }
  return board;
}
function quickScore(board, N, size, komi) {
  let black = 0, white = 0;
  for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) {
    const i = (r + 1) * N + c + 1, v = board[i];
    if (v === BLACK) black += 1;
    else if (v === WHITE) white += 1;
    else {
      let b = false, w = false;
      for (const n of neighbours(N, i)) { if (board[n] === BLACK) b = true; else if (board[n] === WHITE) w = true; }
      if (b && !w) black += 1; else if (w && !b) white += 1;
    }
  }
  return black - white - komi;
}

// 搜索树。用法：const s = new Search(state); s.run(n) 多次；s.best() 给出落点（或 PASS）。
export class Search {
  constructor(state, rand = Math.random) {
    this.state = state;
    this.rand = rand;
    this.root = this.node(null, PASS, state.toPlay);
    this.expand(this.root, state.board);
    this.playouts = 0;
    this.owner = new Float32Array(state.board.length);
  }
  node(parent, move, toPlay) { return { parent, move, toPlay, n: 0, w: 0, rn: 0, rw: 0, kids: null }; }
  expand(node, board) {
    const { N, size } = this.state;
    node.kids = [];
    for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) {
      const i = (r + 1) * N + c + 1;
      if (board[i] !== EMPTY || isEye(board, N, i, node.toPlay)) continue;
      const test = board.slice();
      if (place(test, N, i, node.toPlay) === null) continue;
      if (node === this.root && this.state.seen.has(hashOf(test))) continue;
      node.kids.push(this.node(node, i, other(node.toPlay)));
    }
  }
  pick(node) {
    let best = null, value = -Infinity;
    const logN = Math.log(node.n + 1);
    for (const kid of node.kids) {
      const q = kid.n ? kid.w / kid.n : 0.5;
      const rq = kid.rn ? kid.rw / kid.rn : 0.5;
      const beta = kid.rn / (kid.n + kid.rn + 4 * kid.n * kid.rn / 3000 + 1e-9);
      const v = (1 - beta) * q + beta * rq + 0.35 * Math.sqrt(logN / (kid.n + 1)) + this.rand() * 1e-6;
      if (v > value) { value = v; best = kid; }
    }
    return best;
  }
  run(count) {
    const { N, size, komi } = this.state;
    for (let k = 0; k < count; k += 1) {
      const board = this.state.board.slice();
      let node = this.root;
      const path = [node];
      // 选择：沿着树往下走；第一次到的叶子直接模拟，第二次到就展开
      while (node.kids?.length) {
        const kid = this.pick(node);
        place(board, N, kid.move, node.toPlay);
        node = kid;
        path.push(node);
        if (node.n === 0) break;
        if (!node.kids) this.expand(node, board);
      }
      const first = new Int8Array(board.length);
      for (const p of path.slice(1)) first[p.move] ||= p.parent.toPlay;
      const end = playout(board, N, size, node.toPlay, this.rand, first);
      const result = quickScore(end, N, size, komi);
      const winner = result > 0 ? BLACK : WHITE;
      for (let i = 0; i < end.length; i += 1) if (end[i] === BLACK) this.owner[i] += 1; else if (end[i] === WHITE) this.owner[i] -= 1;
      for (const p of path) {
        p.n += 1;
        // 这个节点的「走法」是 parent.toPlay 下的，赢了就给它记一分
        if (p.parent && winner === p.parent.toPlay) p.w += 1;
        if (p.kids) for (const kid of p.kids) {
          if (first[kid.move] !== p.toPlay) continue;
          kid.rn += 1;
          if (winner === p.toPlay) kid.rw += 1;
        }
      }
      this.playouts += 1;
    }
  }
  // 访问最多的点；胜率太低或者没地方下就停一手。
  best() {
    const kids = this.root.kids ?? [];
    if (!kids.length) return { move: PASS, rate: 0 };
    const top = kids.reduce((a, b) => (b.n > a.n ? b : a));
    const rate = top.n ? top.w / top.n : 0;
    // 对手刚停了一手、自己已经赢定：也停，进入数子
    const state = this.state;
    if (state.passes === 1) {
      const est = this.estimate();
      if (est.winner === state.toPlay) return { move: PASS, rate };
    }
    return { move: top.move, rate };
  }
  // 按随机对局里每个点最后归谁，猜死子和形势。
  estimate() {
    const { board } = this.state;
    const dead = new Set();
    const n = Math.max(1, this.playouts);
    for (let i = 0; i < board.length; i += 1) {
      if (board[i] === BLACK && this.owner[i] / n < -0.4) dead.add(i);
      if (board[i] === WHITE && this.owner[i] / n > 0.4) dead.add(i);
    }
    return { dead, ...score(this.state, dead) };
  }
}
// 一次性算完（测试和简单场景用）。
export function think(state, playouts = LEVELS.normal.playouts, rand = Math.random) {
  const search = new Search(state, rand);
  search.run(playouts);
  return search.best();
}
// 数子前猜死子：从当前局面再随机下几百盘。
export function guessDead(state, playouts = 600, rand = Math.random) {
  const search = new Search(state, rand);
  search.run(playouts);
  return search.estimate().dead;
}
