// 推箱子（ARCADE 31）的规则：人只能推箱子、不能拉，一次推一个；所有箱子都推到目标点上过关。
// 关卡是离线生成的（scripts/gen-sokoban.js → sokoban-levels.js）：从「全部归位」开始倒着拉箱子，
// 拉得最远的那个局面就是开局，倒拉的步数正好是最少推箱次数（par）。
// 地图用常见的 XSB 字符：# 墙、空格 地板、. 目标、$ 箱子、* 在目标上的箱子、@ 人、+ 站在目标上的人。

export const DIRS = [[-1, 0], [0, 1], [1, 0], [0, -1]]; // 上 右 下 左

export function parse(map) {
  const lines = map.split('\n');
  const rows = lines.length, cols = Math.max(...lines.map((l) => l.length));
  const walls = new Set(), goals = new Set(), boxes = new Set();
  let player = -1;
  lines.forEach((line, r) => {
    for (let c = 0; c < cols; c += 1) {
      const ch = line[c] ?? ' ', i = r * cols + c;
      if (ch === '#') walls.add(i);
      if (ch === '.' || ch === '*' || ch === '+') goals.add(i);
      if (ch === '$' || ch === '*') boxes.add(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  // 墙外面的空格不是地板：从人出发能走到的才是
  const floor = new Set();
  const stack = [player];
  while (stack.length) {
    const i = stack.pop();
    if (floor.has(i) || walls.has(i) || i < 0 || i >= rows * cols) continue;
    floor.add(i);
    const r = Math.floor(i / cols), c = i % cols;
    for (const [dr, dc] of DIRS) { const nr = r + dr, nc = c + dc; if (nr >= 0 && nc >= 0 && nr < rows && nc < cols) stack.push(nr * cols + nc); }
  }
  return { rows, cols, walls, goals, floor, boxes, player };
}
export function format(level) {
  const { rows, cols, walls, goals, boxes, player } = level;
  const out = [];
  for (let r = 0; r < rows; r += 1) {
    let line = '';
    for (let c = 0; c < cols; c += 1) {
      const i = r * cols + c, g = goals.has(i);
      line += walls.has(i) ? '#' : boxes.has(i) ? (g ? '*' : '$') : i === player ? (g ? '+' : '@') : g ? '.' : ' ';
    }
    out.push(line.replace(/\s+$/, ''));
  }
  while (out.length && !out.at(-1)) out.pop();
  while (out.length && !out[0]) out.shift();
  return out.join('\n');
}

export function createGame(map, index = 0) {
  const level = parse(map);
  return { index, ...level, boxes: new Set(level.boxes), moves: 0, pushes: 0, history: [] };
}
const step = (game, i, d) => {
  const r = Math.floor(i / game.cols) + DIRS[d][0], c = (i % game.cols) + DIRS[d][1];
  return r < 0 || c < 0 || r >= game.rows || c >= game.cols ? -1 : r * game.cols + c;
};
const free = (game, i) => i >= 0 && game.floor.has(i) && !game.boxes.has(i);
export const isSolved = (game) => [...game.boxes].every((b) => game.goals.has(b));

// 往一个方向走一步；前面是箱子且箱子后面空着就推过去。返回 null 表示走不动。
export function move(game, d) {
  if (isSolved(game)) return null;
  const next = step(game, game.player, d);
  if (next < 0 || !game.floor.has(next)) return null;
  let pushed = -1;
  if (game.boxes.has(next)) {
    const beyond = step(game, next, d);
    if (!free(game, beyond)) return null;
    game.boxes.delete(next);
    game.boxes.add(beyond);
    pushed = beyond;
    game.pushes += 1;
  }
  game.history.push({ player: game.player, from: pushed >= 0 ? next : -1, to: pushed });
  game.player = next;
  game.moves += 1;
  return { pushed: pushed >= 0, box: pushed };
}
export function undo(game) {
  const last = game.history.pop();
  if (!last) return false;
  game.player = last.player;
  if (last.from >= 0) { game.boxes.delete(last.to); game.boxes.add(last.from); game.pushes -= 1; }
  game.moves -= 1;
  return true;
}
// 不推箱子能走到的路：返回走到 target 的方向序列（找不到返回 null）。
export function walkPath(game, target) {
  if (!free(game, target) && target !== game.player) return null;
  const prev = new Map([[game.player, null]]);
  const queue = [game.player];
  while (queue.length) {
    const i = queue.shift();
    if (i === target) {
      const dirs = [];
      for (let at = i; prev.get(at); at = prev.get(at).from) dirs.unshift(prev.get(at).d);
      return dirs;
    }
    for (let d = 0; d < 4; d += 1) {
      const n = step(game, i, d);
      if (free(game, n) && !prev.has(n)) { prev.set(n, { from: i, d }); queue.push(n); }
    }
  }
  return null;
}

// ---- 求解 / 生成用的局面搜索（关卡脚本和测试用） ----
// 局面 = 排好序的箱子位置 + 人能走到的最小格子编号；格子编号小于 128，所以整个局面能编码成一个数字。
function searcher(level) {
  const size = level.rows * level.cols;
  const floor = new Uint8Array(size);
  for (const i of level.floor) floor[i] = 1;
  const nb = Array.from({ length: size }, (_, i) => DIRS.map((_, d) => step(level, i, d)));
  const mark = new Uint32Array(size);
  const box = new Uint32Array(size);
  let stamp = 0;
  const stack = new Int32Array(size);
  // 人从 start 出发能走到的格子（mark === stamp），返回最小编号
  function flood(boxes, start) {
    stamp += 1;
    for (const b of boxes) box[b] = stamp;
    let top = 0, min = start;
    stack[top++] = start; mark[start] = stamp;
    while (top) {
      const i = stack[--top];
      if (i < min) min = i;
      for (const n of nb[i]) if (n >= 0 && floor[n] && box[n] !== stamp && mark[n] !== stamp) { mark[n] = stamp; stack[top++] = n; }
    }
    return min;
  }
  const encode = (boxes, min) => boxes.reduce((acc, b) => acc * 128 + b, 0) * 128 + min;
  return { floor, nb, mark, box, flood, encode, get stamp() { return stamp; } };
}
// 推箱子的最少推数（BFS，按推一次算一步）。limit 是最多展开多少个局面；超了返回 -1。
export function solvePushes(map, limit = 400_000) {
  const level = parse(map);
  const goals = level.goals;
  const done = (boxes) => boxes.every((b) => goals.has(b));
  const s = searcher(level);
  const start = [...level.boxes].sort((a, b) => a - b);
  if (done(start)) return 0;
  const seen = new Set([s.encode(start, s.flood(start, level.player))]);
  let frontier = [{ boxes: start, player: level.player }];
  for (let depth = 1; frontier.length && seen.size < limit; depth += 1) {
    const next = [];
    for (const node of frontier) {
      s.flood(node.boxes, node.player);
      let reach = s.stamp;
      for (let k = 0; k < node.boxes.length; k += 1) {
        const b = node.boxes[k];
        for (let d = 0; d < 4; d += 1) {
          const from = s.nb[b][(d + 2) % 4], to = s.nb[b][d];
          if (from < 0 || s.mark[from] !== reach || to < 0 || !s.floor[to] || node.boxes.includes(to)) continue;
          const boxes = node.boxes.slice();
          boxes[k] = to;
          boxes.sort((x, y) => x - y);
          if (done(boxes)) return depth;
          const key = s.encode(boxes, s.flood(boxes, b));
          s.flood(node.boxes, node.player); // flood 会覆盖标记，恢复本局面的可达区
          reach = s.stamp;
          if (seen.has(key)) continue;
          seen.add(key);
          next.push({ boxes, player: b });
        }
      }
    }
    frontier = next;
  }
  return -1;
}
// 从全部归位倒着拉：返回拉得最远的那一层局面、层数，以及是否搜完了（complete 时层数就是最少推数）。
export function farthestPull(level, limit = 300_000) {
  const s = searcher(level);
  const goals = [...level.goals].sort((a, b) => a - b);
  const starts = [];
  const taken = new Set();
  for (const i of level.floor) {
    if (level.goals.has(i) || taken.has(i)) continue;
    const min = s.flood(goals, i);
    for (const x of level.floor) if (s.mark[x] === s.stamp) taken.add(x);
    starts.push({ boxes: goals, player: i, key: s.encode(goals, min) });
  }
  const seen = new Set(starts.map((x) => x.key));
  let frontier = starts, best = [], depth = 0;
  while (frontier.length) {
    if (seen.size >= limit) return { states: best.map((x) => ({ boxes: new Set(x.boxes), player: x.player })), depth, complete: false };
    const next = [];
    for (const node of frontier) {
      s.flood(node.boxes, node.player);
      let reach = s.stamp;
      for (let k = 0; k < node.boxes.length; k += 1) {
        const b = node.boxes[k];
        for (let d = 0; d < 4; d += 1) {
          // 人站在箱子 d 方向一侧，往 d 方向退一步，把箱子拉到自己原来的位置
          const p = s.nb[b][d], back = p >= 0 ? s.nb[p][d] : -1;
          if (p < 0 || s.mark[p] !== reach || back < 0 || !s.floor[back] || node.boxes.includes(back)) continue;
          const boxes = node.boxes.slice();
          boxes[k] = p;
          boxes.sort((x, y) => x - y);
          const key = s.encode(boxes, s.flood(boxes, back));
          s.flood(node.boxes, node.player);
          reach = s.stamp;
          if (seen.has(key)) continue;
          seen.add(key);
          next.push({ boxes, player: back });
        }
      }
    }
    if (!next.length) break;
    frontier = next;
    depth += 1;
    best = frontier;
  }
  return { states: best.map((x) => ({ boxes: new Set(x.boxes), player: x.player })), depth, complete: true };
}
