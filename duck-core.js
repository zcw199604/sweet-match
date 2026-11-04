// 数独鸭（ARCADE 40）的规则：N×N 的池塘切成 N 块颜色，放 N 只鸭——
// 每行、每列、每种颜色都恰好一只，而且两只鸭不能挨着（斜着挨也不行）。
// 题目运行时生成：先摆一组答案，再从每只鸭向外长出颜色区域，用计数器修到只剩唯一解；
// 最后用「人会用的推理」从头解一遍，按用到的最难技巧分难度——只出不用猜就能解开的题。
import { pick, rng, shuffle } from './kit-core.js';

// tier：这一档允许「最难用到第几级技巧」的范围（见 nextStep 的四级）。
export const LEVELS = {
  easy: { label: '简单', size: 6, tier: [1, 2] },
  normal: { label: '普通', size: 8, tier: [3, 3] },
  hard: { label: '困难', size: 10, tier: [4, 4] }
};
export const EMPTY = 0;
export const CROSS = 1;
export const DUCK = 2;

const range = (n) => Array.from({ length: n }, (_, i) => i);
export const touching = (a, b, n) => a !== b && Math.abs(Math.floor(a / n) - Math.floor(b / n)) <= 1 && Math.abs((a % n) - (b % n)) <= 1;

// ---- 盘面结构：每个格子会「看到」哪些格子（同行、同列、同色、四周八格） ----
const shapes = new WeakMap();
export function shapeOf(puzzle) {
  if (shapes.has(puzzle)) return shapes.get(puzzle);
  const { size: n, region } = puzzle;
  const units = [];
  for (let r = 0; r < n; r += 1) units.push({ kind: 'row', id: r, cells: range(n).map((c) => r * n + c) });
  for (let c = 0; c < n; c += 1) units.push({ kind: 'col', id: c, cells: range(n).map((r) => r * n + c) });
  for (let g = 0; g < n; g += 1) units.push({ kind: 'region', id: g, cells: [] });
  region.forEach((g, i) => units[2 * n + g].cells.push(i));
  const sees = range(n * n).map((i) => {
    const out = new Set([...units[Math.floor(i / n)].cells, ...units[n + (i % n)].cells, ...units[2 * n + region[i]].cells]);
    for (let j = 0; j < n * n; j += 1) if (touching(i, j, n)) out.add(j);
    out.delete(i);
    return [...out];
  });
  const shape = { n, units, sees, unitsOf: range(n * n).map((i) => [units[Math.floor(i / n)], units[n + (i % n)], units[2 * n + region[i]]]) };
  shapes.set(puzzle, shape);
  return shape;
}

// ---- 数解：逐行放，列、颜色、相邻都不冲突；用位掩码剪枝——
// 还没放的颜色，在剩下的行里只要没有一格落在空着的列上，这条路就走不通 ----
export function countSolutions(n, region, limit = 2) {
  // reach[r][g]：颜色 g 在第 r 行及以下的格子占了哪些列
  const reach = Array.from({ length: n + 1 }, () => new Int32Array(n));
  for (let r = n - 1; r >= 0; r -= 1) {
    reach[r].set(reach[r + 1]);
    for (let c = 0; c < n; c += 1) reach[r][region[r * n + c]] |= 1 << c;
  }
  const full = (1 << n) - 1, cols = Array(n), found = [];
  const go = (r, usedC, usedG, prev) => {
    if (r === n) { found.push([...cols]); return found.length >= limit; }
    const free = full & ~usedC, at = reach[r];
    for (let g = 0; g < n; g += 1) if (!(usedG & (1 << g)) && !(at[g] & free)) return false;
    for (let c = 0; c < n; c += 1) {
      const g = region[r * n + c];
      if ((usedC >> c) & 1 || (usedG >> g) & 1 || (r && Math.abs(prev - c) <= 1)) continue;
      cols[r] = c;
      if (go(r + 1, usedC | (1 << c), usedG | (1 << g), c)) return true;
    }
    return false;
  };
  go(0, 0, 0, -9);
  return found;
}

// ---- 推理求解器 ----
// st：-1 还不知道，0 肯定没有鸭，1 有鸭。place 放下一只鸭，顺手划掉它看到的格子。
function place(shape, st, i) {
  st[i] = 1;
  for (const j of shape.sees[i]) if (st[j] === -1) st[j] = 0;
}
const open = (st, cells) => cells.filter((i) => st[i] === -1);
const hasDuck = (st, cells) => cells.some((i) => st[i] === 1);
const nameOf = (u) => (u.kind === 'row' ? `第 ${u.id + 1} 行` : u.kind === 'col' ? `第 ${u.id + 1} 列` : '这块颜色');

// 找下一步能确定的东西（从简单到难）。返回 { tier, place } 或 { tier, cross: [...] }，
// 还带 focus（推理涉及的格子）和 why（给玩家看的一句话）；矛盾时返回 { broken: true }，推不动返回 null。
//   1 级 唯一格：某行 / 列 / 颜色只剩一格能放。
//   2 级 挤在一条线：某块颜色的空位全在同一行（列），这一行（列）别的格子不能放；反过来也一样。
//   3 级 看穿一整片：放在这格会让某行 / 列 / 颜色没地方放；或者 k 块颜色正好挤满 k 行（列）。
//   4 级 试一步：假设放在这里，往下推会走不通。
export function nextStep(shape, st, maxTier = 4) {
  const { n, units } = shape;
  const live = units.filter((u) => !hasDuck(st, u.cells));
  for (const u of live) {
    const cand = open(st, u.cells);
    if (!cand.length) return { broken: true };
    if (cand.length === 1) return { tier: 1, place: cand[0], focus: u.cells, why: `${nameOf(u)}只剩这一格能放鸭` };
  }
  if (maxTier < 2) return null;
  const lines = live.filter((u) => u.kind !== 'region');
  const regions = live.filter((u) => u.kind === 'region');
  const rowOf = (i) => Math.floor(i / n), colOf = (i) => i % n;
  for (const g of regions) {
    const cand = open(st, g.cells);
    for (const [axis, key, base] of [['行', rowOf, 0], ['列', colOf, n]]) {
      const at = new Set(cand.map(key));
      if (at.size !== 1) continue;
      const line = units[base + [...at][0]];
      const cross = open(st, line.cells).filter((i) => !g.cells.includes(i));
      if (cross.length) return { tier: 2, cross, focus: g.cells, why: `这块颜色的空位都在第 ${line.id + 1} ${axis}，这一${axis}别的格子都不能放` };
    }
  }
  for (const line of lines) {
    const cand = open(st, line.cells);
    const gs = new Set(cand.map((i) => shape.unitsOf[i][2]));
    if (gs.size !== 1) continue;
    const g = [...gs][0];
    const cross = open(st, g.cells).filter((i) => !line.cells.includes(i));
    if (cross.length) return { tier: 2, cross, focus: line.cells, why: `${nameOf(line)}的空位都在同一块颜色里，这块颜色别处都不能放` };
  }
  if (maxTier < 3) return null;
  // 看穿一整片：这格看到的格子盖住了某个单元剩下的全部空位
  for (let i = 0; i < n * n; i += 1) {
    if (st[i] !== -1) continue;
    const seen = new Set(shape.sees[i]);
    const hit = live.find((u) => !u.cells.includes(i) && open(st, u.cells).every((j) => seen.has(j)));
    if (hit) return { tier: 3, cross: [i], focus: hit.cells, why: `鸭放在这里，${hit.kind === 'region' ? '有一块颜色' : nameOf(hit)}就没地方放了` };
  }
  // k 块颜色挤满 k 行（列），或者 k 行（列）只用到 k 块颜色
  // 每个单元的空位落在哪些行（列 / 颜色）记成位掩码，子集的并集按最低位递推，k ≤ 10 时最多 1024 个子集
  const bits = (group, key) => group.map((u) => ({ u, keys: open(st, u.cells).reduce((m, i) => m | (1 << key(i)), 0) }));
  const regionId = (i) => shape.unitsOf[i][2].id;
  const tries = [
    [bits(regions, rowOf), (k) => units[k], '行', true],
    [bits(regions, colOf), (k) => units[n + k], '列', true],
    [bits(lines.filter((u) => u.kind === 'row'), regionId), (k) => units[2 * n + k], '行', false],
    [bits(lines.filter((u) => u.kind === 'col'), regionId), (k) => units[2 * n + k], '列', false]
  ];
  for (const [items, unitAt, axis, regionFirst] of tries) {
    const m = items.length;
    const union = new Int32Array(1 << m);
    for (let mask = 1; mask < (1 << m); mask += 1) {
      const low = mask & -mask;
      union[mask] = union[mask ^ low] | items[31 - Math.clz32(low)].keys;
      const k = popcount(mask);
      if (k < 2 || k >= m || popcount(union[mask]) !== k) continue;
      const inside = new Set();
      for (let b = 0; b < m; b += 1) if (mask & (1 << b)) items[b].u.cells.forEach((x) => inside.add(x));
      const cross = [];
      for (let key = 0; key < n; key += 1) if (union[mask] & (1 << key)) for (const i of open(st, unitAt(key).cells)) if (!inside.has(i)) cross.push(i);
      if (!cross.length) continue;
      const why = regionFirst ? `这 ${k} 块颜色正好挤满 ${k} ${axis}，这几${axis}别的格子都不能放` : `这 ${k} ${axis}只用到 ${k} 块颜色，这几块颜色在别处都不能放`;
      return { tier: 3, cross, focus: [...inside], why };
    }
  }
  if (maxTier < 4) return null;
  // 试一步：假设放下，只用 1、2 级往下推，推出矛盾就说明这格不能放
  for (let i = 0; i < n * n; i += 1) {
    if (st[i] !== -1) continue;
    const t = Int8Array.from(st);
    place(shape, t, i);
    if (propagate(shape, t, 2) === 'broken') return { tier: 4, cross: [i], focus: [i], why: '试着在这里放鸭，往下推会走不通，所以这格不能放' };
  }
  return null;
}
const popcount = (x) => { let c = 0; while (x) { x &= x - 1; c += 1; } return c; };
export function applyStep(shape, st, step) {
  if (step.place !== undefined) place(shape, st, step.place);
  else for (const i of step.cross) st[i] = 0;
}
function propagate(shape, st, maxTier) {
  for (;;) {
    const step = nextStep(shape, st, maxTier);
    if (!step) return 'stuck';
    if (step.broken) return 'broken';
    applyStep(shape, st, step);
    if (!st.includes(-1)) return 'done';
  }
}
// 从空盘解到底：solved 是否完全靠推理解开，tier 是用到的最难一级。
export function logicSolve(puzzle) {
  const shape = shapeOf(puzzle);
  const st = new Int8Array(puzzle.size ** 2).fill(-1);
  let tier = 0;
  for (;;) {
    const step = nextStep(shape, st);
    if (!step || step.broken) break;
    tier = Math.max(tier, step.tier);
    applyStep(shape, st, step);
  }
  const ducks = [...st.keys()].filter((i) => st[i] === 1);
  return { solved: ducks.length === puzzle.size, tier, ducks };
}

// ---- 出题 ----
function placeDucks(rand, n) {
  const cols = Array(n), used = Array(n).fill(false);
  const go = (r) => {
    if (r === n) return true;
    for (const c of shuffle(range(n), rand)) {
      if (used[c] || (r && Math.abs(cols[r - 1] - c) <= 1)) continue;
      used[c] = true;
      cols[r] = c;
      if (go(r + 1)) return true;
      used[c] = false;
    }
    return false;
  };
  go(0);
  return cols;
}
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const NEAR = new Map();
const around = (i, n) => {
  if (!NEAR.has(n)) NEAR.set(n, range(n * n).map((j) => ORTHO.map(([dr, dc]) => [Math.floor(j / n) + dr, (j % n) + dc]).filter(([r, c]) => r >= 0 && c >= 0 && r < n && c < n).map(([r, c]) => r * n + c)));
  return NEAR.get(n)[i];
};
// 每只鸭当一颗种子轮流往外长；胃口大小随机，有的颜色长成一大片，有的只有两三格。
function growRegions(rand, n, cols) {
  const region = Array(n * n).fill(-1);
  const appetite = range(n).map(() => 0.5 + rand() * 1.5);
  cols.forEach((c, r) => { region[r * n + c] = r; });
  let left = n * n - n;
  while (left) {
    const frontier = range(n).map(() => []);
    region.forEach((g, i) => { if (g >= 0) for (const j of around(i, n)) if (region[j] < 0) frontier[g].push(j); });
    const ready = range(n).filter((g) => frontier[g].length);
    let roll = rand() * ready.reduce((s, g) => s + appetite[g], 0), g = ready[0];
    for (const k of ready) { roll -= appetite[k]; if (roll <= 0) { g = k; break; } }
    region[pick(rand, frontier[g])] = g;
    left -= 1;
  }
  return region;
}
// 去掉 i 之后，这块颜色还连成一片吗（从答案鸭那一格开始数）。
function stillWhole(region, n, i, root) {
  const g = region[i], seen = new Set([root]), todo = [root];
  while (todo.length) for (const j of around(todo.pop(), n)) if (j !== i && region[j] === g && !seen.has(j)) { seen.add(j); todo.push(j); }
  return seen.size === region.filter((x) => x === g).length - 1;
}
// 多解时：另一组解里放鸭、答案里不放的格子，划给隔壁颜色——那组解就有一块颜色两只鸭、一块没有，作废。
function makeUnique(rand, n, region, cols) {
  for (let step = 0; step < n * 8; step += 1) {
    const found = countSolutions(n, region, 2);
    if (found.length === 1) return true;
    const other = found.find((s) => s.some((c, r) => c !== cols[r]));
    const cells = shuffle(other.map((c, r) => (c !== cols[r] ? r * n + c : -1)).filter((i) => i >= 0), rand);
    let moved = false;
    for (const i of cells) {
      const g = region[i];
      const next = [...new Set(around(i, n).map((j) => region[j]).filter((h) => h !== g))];
      const root = cols.findIndex((c, r) => region[r * n + c] === g);
      if (!next.length || !stillWhole(region, n, i, root * n + cols[root])) continue;
      region[i] = pick(rand, next);
      moved = true;
      break;
    }
    if (!moved) return false;
  }
  return false;
}
export function generate(level, seed = Date.now()) {
  const { size: n, tier: [lo, hi] } = LEVELS[level];
  const rand = rng(seed);
  let fallback = null;
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const cols = placeDucks(rand, n);
    const raw = growRegions(rand, n, cols);
    if (!makeUnique(rand, n, raw, cols)) continue;
    // 颜色编号洗一下，免得颜色和行号挂钩
    const perm = shuffle(range(n), rand);
    const region = raw.map((g) => perm[g]);
    const puzzle = { level, seed, size: n, region, solution: cols };
    const { solved, tier } = logicSolve(puzzle);
    if (!solved) continue;
    puzzle.tier = tier;
    if (tier >= lo && tier <= hi) return puzzle;
    // 一直碰不到目标难度时，退而求其次：取离目标最近的那道
    const gap = tier < lo ? lo - tier : tier - hi;
    if (!fallback || gap < fallback.gap) fallback = { puzzle, gap };
  }
  return fallback.puzzle;
}

// ---- 一局 ----
export function createGame(level, seed) {
  const puzzle = generate(level, seed);
  return { ...puzzle, marks: Array(puzzle.size ** 2).fill(EMPTY), elapsed: 0, hinted: false, done: false };
}
export const ducksOf = (game) => game.marks.flatMap((v, i) => (v === DUCK ? [i] : []));
// 打架的鸭：同行、同列、同色，或者挨着。
export function conflicts(game) {
  const n = game.size, ducks = ducksOf(game), bad = new Set();
  for (let a = 0; a < ducks.length; a += 1) for (let b = a + 1; b < ducks.length; b += 1) {
    const i = ducks[a], j = ducks[b];
    if (Math.floor(i / n) === Math.floor(j / n) || i % n === j % n || game.region[i] === game.region[j] || touching(i, j, n)) { bad.add(i); bad.add(j); }
  }
  return bad;
}
// 被已放的鸭「看到」的格子：自动标记就画在这些空格上。
export function covered(game) {
  const shape = shapeOf(game), out = new Set();
  for (const i of ducksOf(game)) for (const j of shape.sees[i]) out.add(j);
  return out;
}
export const isSolved = (game) => ducksOf(game).length === game.size && conflicts(game).size === 0;
export function setMark(game, index, value) {
  if (game.done || game.marks[index] === value) return false;
  game.marks[index] = value;
  if (isSolved(game)) game.done = true;
  return true;
}
// 点一下：空 → ✕ → 鸭 → 空。
export const cycle = (v) => (v === EMPTY ? CROSS : v === CROSS ? DUCK : EMPTY);

// 提示：先纠正放错的鸭、划错的叉；都对的话，按当前盘面推出下一步并替玩家做掉。
// 返回 { cells, why, focus }，cells 是这次改动的格子。
export function hintStep(game) {
  if (game.done) return null;
  const n = game.size, answer = new Set(game.solution.map((c, r) => r * n + c));
  const wrongDuck = game.marks.findIndex((v, i) => v === DUCK && !answer.has(i));
  game.hinted = true;
  if (wrongDuck >= 0) { setMark(game, wrongDuck, EMPTY); return { cells: [wrongDuck], focus: [wrongDuck], why: '这只鸭放错了，先拿掉' }; }
  const wrongCross = game.marks.findIndex((v, i) => v === CROSS && answer.has(i));
  if (wrongCross >= 0) { setMark(game, wrongCross, EMPTY); return { cells: [wrongCross], focus: [wrongCross], why: '这一格其实能放鸭，叉先擦掉' }; }
  const shape = shapeOf(game);
  const st = new Int8Array(n * n).fill(-1);
  game.marks.forEach((v, i) => { if (v === CROSS) st[i] = 0; });
  game.marks.forEach((v, i) => { if (v === DUCK) place(shape, st, i); });
  const step = nextStep(shape, st);
  if (step && !step.broken) {
    if (step.place !== undefined) { setMark(game, step.place, DUCK); return { cells: [step.place], focus: step.focus, why: step.why }; }
    const cells = step.cross.filter((i) => game.marks[i] === EMPTY);
    for (const i of cells) setMark(game, i, CROSS);
    return { cells, focus: step.focus, why: step.why };
  }
  // 推不动（理论上不会）：直接放一只答案鸭
  const i = [...answer].find((x) => game.marks[x] !== DUCK);
  setMark(game, i, DUCK);
  return { cells: [i], focus: [i], why: '这里有一只鸭' };
}
