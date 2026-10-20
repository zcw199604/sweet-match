// 生成推箱子的 50 关：npm run gen:sokoban。结果写进 sokoban-levels.js（提交到仓库，运行时不再生成）。
// 每关：随机拼一间屋子 → 随机放目标 → 从全部归位倒着拉箱子（必须搜完），拉得最远的那层局面的层数就是最少推数。
// 同一关试很多间屋子，挑最少推数最大、而且大多数箱子不在目标上的那一个。
import { writeFileSync } from 'node:fs';
import { farthestPull, format } from '../sokoban-core.js';
import { rng, randInt, shuffle } from '../kit-core.js';

const TOTAL = Number(process.env.TOTAL ?? 50);
const out = new URL('../sokoban-levels.js', import.meta.url);

function room(rand, w, h) {
  const cols = w + 2, rows = h + 2;
  const floor = new Set();
  const rects = 3 + randInt(rand, 3);
  for (let k = 0; k < rects * 4 && k < 60; k += 1) {
    const rw = 2 + randInt(rand, 3), rh = 2 + randInt(rand, 3);
    const r0 = 1 + randInt(rand, Math.max(1, h - rh + 1)), c0 = 1 + randInt(rand, Math.max(1, w - rw + 1));
    const cells = [];
    for (let r = r0; r < Math.min(rows - 1, r0 + rh); r += 1) for (let c = c0; c < Math.min(cols - 1, c0 + rw); c += 1) cells.push(r * cols + c);
    // 新的矩形要和已有地板挨着，保证连通
    const touches = !floor.size || cells.some((i) => [i - 1, i + 1, i - cols, i + cols].some((n) => floor.has(n)) || floor.has(i));
    if (!touches) continue;
    for (const i of cells) floor.add(i);
    if (floor.size >= w * h * 0.7) break;
  }
  // 零星的柱子：去掉一格地板后还连通才留下
  const list = shuffle([...floor], rand);
  for (const i of list.slice(0, Math.floor(floor.size * 0.08))) {
    floor.delete(i);
    const start = [...floor][0], seen = new Set([start]), stack = [start];
    while (stack.length) { const x = stack.pop(); for (const n of [x - 1, x + 1, x - cols, x + cols]) if (floor.has(n) && !seen.has(n)) { seen.add(n); stack.push(n); } }
    if (seen.size !== floor.size) floor.add(i);
  }
  const walls = new Set();
  for (const i of floor) for (const n of [i - 1, i + 1, i - cols, i + cols, i - cols - 1, i - cols + 1, i + cols - 1, i + cols + 1]) if (!floor.has(n)) walls.add(n);
  return { rows, cols, floor, walls };
}

function candidate(rand, spec) {
  const base = room(rand, spec.w, spec.h);
  if (base.floor.size < spec.boxes * 3 + 6) return null;
  const goals = new Set(shuffle([...base.floor], rand).slice(0, spec.boxes));
  const level = { ...base, goals };
  const { states, depth, complete } = farthestPull(level, spec.limit);
  if (!complete || !states.length || depth < 2) return null;
  // 挑一个箱子离目标最多的局面
  let pick = null, off = -1;
  for (const s of states.slice(0, 200)) {
    const n = [...s.boxes].filter((b) => !goals.has(b)).length;
    if (n > off) { off = n; pick = s; }
  }
  return { map: format({ ...level, boxes: pick.boxes, player: pick.player }), depth, off };
}

const levels = [];
for (let i = 0; i < TOTAL; i += 1) {
  const spec = {
    boxes: i < 12 ? 2 : i < 32 ? 3 : 4,
    w: Math.min(8, 5 + Math.floor(i / 10)),
    h: Math.min(8, 5 + Math.floor(i / 12)),
    limit: 250_000,
    tries: 20 + Math.floor(i / 2)
  };
  const rand = rng(9001 + i * 7919);
  let best = null;
  for (let t = 0; t < spec.tries; t += 1) {
    const c = candidate(rand, spec);
    if (!c || c.off < spec.boxes - 1) continue;
    if (!best || c.depth > best.depth) best = c;
  }
  if (!best) { i -= 1; continue; }
  levels.push({ map: best.map, par: best.depth });
  console.log(`level ${i + 1}: ${spec.boxes} boxes, par ${best.depth}`);
}
// 按最少推数排一下，难度更平滑（同样推数时箱子少的在前）
levels.sort((a, b) => a.par - b.par || (a.map.split('$').length - b.map.split('$').length));
const body = levels.map((l) => `  { par: ${l.par}, map: ${JSON.stringify(l.map)} }`).join(',\n');
writeFileSync(out, `// 由 scripts/gen-sokoban.js 生成，别手改；改生成规则后跑 npm run gen:sokoban。\n// par 是最少推箱次数（倒拉搜索搜完整个局面空间得出，测试里再用正向 BFS 抽查）。\nexport const LEVELS = [\n${body}\n];\n`);
console.log(`wrote ${levels.length} levels`);
