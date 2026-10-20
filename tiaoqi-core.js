// 中国跳棋（ARCADE 32）的规则：六角星形棋盘共 121 个孔，每人 10 颗棋子从自己的角出发，全部走进对面的角就赢。
// 一步可以走到相邻的空孔；也可以隔着紧挨的一颗棋子（谁的都行）跳到正对面的空孔，能连着跳就一直跳，但走和跳不能混着用。
// 防堵角：对面的角已经被棋子占满，只要里面有你的棋子也算你赢。
// 坐标用立方坐标 (x, y, z)，x + y + z = 0；星形 = 两个大三角形的并集。
export const DIRS = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [-1, 1, 0], [-1, 0, 1], [0, -1, 1]];
// 六个角：axis 这一维乘以 sign 不小于 5。玩家 0 永远在下面（z ≥ 5）。
export const CORNERS = { bottom: ['z', 1], lowerLeft: ['x', -1], upperLeft: ['y', 1], top: ['z', -1], upperRight: ['x', 1], lowerRight: ['y', -1] };
const OPP = { bottom: 'top', top: 'bottom', lowerLeft: 'upperRight', upperRight: 'lowerLeft', upperLeft: 'lowerRight', lowerRight: 'upperLeft' };
export const SETUPS = { 2: ['bottom', 'top'], 3: ['bottom', 'upperLeft', 'upperRight'] };

export const key = (c) => `${c[0]},${c[1]},${c[2]}`;
export const parse = (k) => k.split(',').map(Number);
const coord = (c, axis) => c['xyz'.indexOf(axis)];
export const inCorner = (c, corner) => { const [axis, sign] = CORNERS[corner]; return sign * coord(c, axis) >= 5; };
export const CELLS = (() => {
  const out = [];
  for (let x = -8; x <= 8; x += 1) for (let y = -8; y <= 8; y += 1) {
    const z = -x - y;
    if (Math.abs(z) > 8) continue;
    if ((x >= -4 && y >= -4 && z >= -4) || (x <= 4 && y <= 4 && z <= 4)) out.push([x, y, z]);
  }
  return out;
})();
const CELLSET = new Set(CELLS.map(key));
export const onBoard = (c) => CELLSET.has(key(c));
const add = (a, d, k = 1) => [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k];
export const dist = (a, b) => (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 2;
// 一个角最尖的那个孔
export function apex(corner) {
  const cells = CELLS.filter((c) => inCorner(c, corner));
  const [axis, sign] = CORNERS[corner];
  return cells.reduce((best, c) => (sign * coord(c, axis) > sign * coord(best, axis) ? c : best));
}

export function createGame(players = 2, { bots = [false, true, true] } = {}) {
  const corners = SETUPS[players];
  const board = {};
  corners.forEach((corner, p) => { for (const c of CELLS) if (inCorner(c, corner)) board[key(c)] = p; });
  return { players, corners, targets: corners.map((c) => OPP[c]), board, current: 0, winner: null, moves: 0, bots: bots.slice(0, players), last: null, history: [] };
}
// 一颗棋子能到的所有地方：{ to, path }，path 是经过的孔（跳的话是每一跳落点）。
export function destinations(state, from) {
  const start = parse(from);
  const out = new Map();
  for (const d of DIRS) {
    const n = add(start, d);
    if (onBoard(n) && state.board[key(n)] === undefined) out.set(key(n), [from, key(n)]);
  }
  // 连跳：BFS
  const queue = [[from]];
  const seen = new Set([from]);
  while (queue.length) {
    const path = queue.shift();
    const at = parse(path.at(-1));
    for (const d of DIRS) {
      const over = add(at, d), land = add(at, d, 2);
      if (!onBoard(land) || state.board[key(over)] === undefined || (state.board[key(land)] !== undefined && key(land) !== from)) continue;
      const k = key(land);
      if (seen.has(k)) continue;
      seen.add(k);
      const next = [...path, k];
      if (!out.has(k)) out.set(k, next);
      queue.push(next);
    }
  }
  out.delete(from);
  return out;
}
export function hasWon(state, p) {
  const target = state.targets[p];
  const cells = CELLS.filter((c) => inCorner(c, target));
  const mine = Object.entries(state.board).filter(([, v]) => v === p).map(([k]) => parse(k));
  if (mine.every((c) => inCorner(c, target))) return true;
  return cells.every((c) => state.board[key(c)] !== undefined) && cells.some((c) => state.board[key(c)] === p);
}
export function move(state, from, to) {
  if (state.winner !== null || state.board[from] !== state.current) return null;
  const path = destinations(state, from).get(to);
  if (!path) return null;
  state.history.push({ board: { ...state.board }, current: state.current, last: state.last, moves: state.moves });
  delete state.board[from];
  state.board[to] = state.current;
  state.last = { player: state.current, path };
  state.moves += 1;
  if (hasWon(state, state.current)) state.winner = state.current;
  else state.current = (state.current + 1) % state.players;
  return path;
}
export function undo(state) {
  const prev = state.history.pop();
  if (!prev) return false;
  Object.assign(state, prev, { winner: null });
  return true;
}
// 电脑：每颗棋子到目标角尖的距离总和越小越好；再加一点「别把落后的棋子扔下」和「进了角就别出来」。
export function score(state, p, board = state.board) {
  const tip = apex(state.targets[p]);
  let sum = 0, worst = 0;
  for (const [k, v] of Object.entries(board)) {
    if (v !== p) continue;
    const c = parse(k), d = dist(c, tip);
    sum += d;
    worst = Math.max(worst, d);
  }
  return sum + worst * 0.6;
}
export function aiMove(state, p = state.current, rand = Math.random) {
  let best = null;
  const before = score(state, p);
  for (const [from, v] of Object.entries(state.board)) {
    if (v !== p) continue;
    const fromIn = inCorner(parse(from), state.targets[p]);
    for (const [to, path] of destinations(state, from)) {
      if (fromIn && !inCorner(parse(to), state.targets[p])) continue;
      const board = { ...state.board };
      delete board[from];
      board[to] = p;
      const gain = before - score(state, p, board) + rand() * 0.05;
      if (!best || gain > best.gain) best = { from, to, path, gain };
    }
  }
  return best;
}
