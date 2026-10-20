// 毛线三消（ARCADE 35）的规则：一幅用毛线球拼成的像素画，只能从外圈往里拆——
// 上下左右至少有一边空着（或者挨着画边）的毛线球才拿得到。拿到的球飞进上面同色的线轴（每轴 3 个，同时摆三轴），
// 没有同色线轴就挂到暂存杆上（7 个位置）；线轴绕满就收走，下一轴顶上来，杆上同色的球自动绕过去。
// 杆子挂满、又没有能直接绕上线轴的球就输；整幅画拆完过关。
// 线轴的出场顺序是生成时模拟一遍拆画定下来的（模拟里杆子从没挂满），所以一定有解。
import { levelSeed, randInt, rng } from './kit-core.js';

export const ROD = 7;
export const SPOOLS = 3;
const LETTERS = { R: 0, B: 1, G: 2, Y: 3, V: 4, O: 5, P: 6, C: 7, L: 8, N: 9, W: 10, K: 11 };
export const PICTURES = [
  { name: '爱心', rows: ['.PP...PP.', 'PRRP.PRRP', 'RWWRPRRRR', 'RWRRRRRRR', 'RRRRRRRRR', 'PRRRRRRRP', '.PRRRRRP.', '..PRRRP..', '...PRP...', '....P....'] },
  { name: '蘑菇', rows: ['...RRR...', '.RRWRRRR.', 'RRWRRRWRR', 'RRRRRRWWR', 'RWRRRRRRR', '.YYYYYYY.', '..YKYKY..', '..YYKYY..', '..YYYYY..', '..YYYYY..'] },
  { name: '小鱼', rows: ['...BBB...', '..BBBBB..', '.BKBBBBYY', 'BKKBCBBYY', 'BBBBCBBYY', '.BBBBBBYY', '..BBBBB.Y', '...BBB...', '..C.C.C..', '.C.C.C.C.'] },
  { name: '猫咪', rows: ['O.......O', 'OO.....OO', 'OOOOOOOOO', 'OKOOOOOKO', 'OOOOOOOOO', 'OPOWPWOPO', 'OOWWKWWOO', '.OOWWWOO.', '..OOOOO..', '...OOO...'] },
  { name: '小花', rows: ['..PPPP...', '..PPPPP..', '.PPYYYPP.', '.PPYYYPP.', '..PPPPP..', '...PGP...', '.G..G....', '..GGG.GG.', '....GGG..', '....G....'] },
  { name: '星星', rows: ['....Y....', '...YYY...', '...YOY...', 'YYYYOYYYY', '.YYOOOYY.', '..YYOYY..', '..YYYYY..', '.YYY.YYY.', '.YY...YY.', 'YY.....YY'] },
  { name: '苹果树', rows: ['...GGG...', '..GGRGG..', '.GGGGGGG.', '.GRGGGRG.', 'GGGGGGGGG', '.GGGGGGG.', '..GGGGG..', '....N....', '...NNN...', '..NNNNN..'] },
  { name: '冰淇淋', rows: ['..PPPP...', '..PPWPP..', '.PPPPPPP.', '.PWPPPWP.', '.PPPPPPP.', '.YYYYYYY.', '..YNYNY..', '..YYYYY..', '...YNY...', '....Y....'] }
];

export function levelShape(level) {
  const n = Math.max(1, level);
  // 杆子越往后越短：前 8 关（第一轮八幅画）7 格，第二轮 6 格，之后 5 格
  return { picture: (n - 1) % PICTURES.length, kindness: Math.max(0.15, 0.9 - n * 0.06), rod: n <= 8 ? ROD : n <= 16 ? ROD - 1 : ROD - 2 };
}
// 把每种颜色的球数凑成 3 的倍数：以最多的那种颜色为底色，别的颜色差一个就从底色借一个挨着的，
// 多一个就还给底色；最后底色自己多出来的一两个从画的边上去掉。
function balance(cells, cols) {
  const count = (color) => cells.filter((c) => c === color).length;
  const near = (i, color) => {
    const r = Math.floor(i / cols), c = i % cols;
    return [[0, 1], [0, -1], [1, 0], [-1, 0]].some(([dr, dc]) => {
      const cc = c + dc, j = (r + dr) * cols + cc;
      return cc >= 0 && cc < cols && j >= 0 && j < cells.length && cells[j] === color;
    });
  };
  const colors = [...new Set(cells.filter((c) => c >= 0))];
  const base = colors.sort((a, b) => count(b) - count(a))[0];
  for (const color of colors.slice(1)) {
    const rem = count(color) % 3;
    if (rem === 0) continue;
    if (rem === 2) {
      // 从底色借一个挨着这种颜色的
      const i = cells.findIndex((c, k) => c === base && near(k, color));
      if (i >= 0) { cells[i] = color; continue; }
    }
    // 把多出来的还给底色（挑挨着底色的）
    for (let n = 0; n < rem; n += 1) {
      const i = cells.findIndex((c, k) => c === color && near(k, base));
      cells[i >= 0 ? i : cells.indexOf(color)] = base;
    }
  }
  // 底色多出来的从最下面一行往上去掉
  for (let n = count(base) % 3; n > 0; n -= 1) cells[cells.lastIndexOf(base)] = -1;
  return cells;
}

const DIRS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
export function isExposed(state, i) {
  if (state.balls[i] < 0 || state.taken[i]) return false;
  const r = Math.floor(i / state.cols), c = i % state.cols;
  return DIRS.some(([dr, dc]) => {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= state.rows || cc >= state.cols) return true;
    const j = rr * state.cols + cc;
    return state.balls[j] < 0 || state.taken[j];
  });
}
// 模拟拆一遍，顺便定下线轴的出场顺序；杆子挂满就换个随机数重来。
function plan(state, rand, kindness, rodSize) {
  const sim = { ...state, taken: state.taken.slice() };
  const need = new Map();
  sim.balls.forEach((c) => { if (c >= 0) need.set(c, (need.get(c) ?? 0) + 1); });
  for (const [c, n] of need) need.set(c, n / 3); // 每种颜色还要几轴
  const queue = [];
  const active = [];
  let rod = [];
  const exposedColors = () => sim.balls.map((c, i) => (isExposed(sim, i) ? c : -1)).filter((c) => c >= 0);
  const nextSpool = () => {
    const left = [...need].filter(([, n]) => n > 0).map(([c]) => c);
    if (!left.length) return null;
    let pick;
    if (rand() < kindness) {
      const onRod = left.find((c) => rod.filter((x) => x === c).length >= 2) ?? left.find((c) => rod.includes(c));
      const visible = exposedColors();
      pick = onRod ?? left.sort((a, b) => visible.filter((x) => x === b).length - visible.filter((x) => x === a).length)[0];
    } else pick = left[randInt(rand, left.length)];
    need.set(pick, need.get(pick) - 1);
    queue.push(pick);
    return { color: pick, n: 0 };
  };
  for (let i = 0; i < SPOOLS; i += 1) { const s = nextSpool(); if (s) active.push(s); }
  const absorb = () => {
    for (let moved = true; moved;) {
      moved = false;
      active.forEach((s, k) => {
        if (s && s.n === 3) { active[k] = nextSpool(); moved = true; }
      });
      for (const c of [...rod]) {
        const s = active.find((x) => x && x.color === c && x.n < 3);
        if (s) { s.n += 1; rod.splice(rod.indexOf(c), 1); moved = true; }
      }
    }
  };
  const total = sim.balls.filter((c) => c >= 0).length;
  for (let step = 0; step < total; step += 1) {
    const exposed = sim.balls.map((c, i) => (isExposed(sim, i) ? i : -1)).filter((i) => i >= 0);
    const direct = exposed.filter((i) => active.some((s) => s && s.color === sim.balls[i] && s.n < 3));
    const i = direct.length ? direct[randInt(rand, direct.length)] : exposed[randInt(rand, exposed.length)];
    sim.taken[i] = true;
    const s = active.find((x) => x && x.color === sim.balls[i] && x.n < 3);
    if (s) s.n += 1; else rod.push(sim.balls[i]);
    if (rod.length > rodSize - 2) return null; // 给玩家留两格余量
    absorb();
  }
  return queue;
}

export function createLevel(level, seed = levelSeed('yarn', level)) {
  const shape = levelShape(level);
  const pic = PICTURES[shape.picture];
  const cols = pic.rows[0].length, rows = pic.rows.length;
  const balls = balance(pic.rows.join('').split('').map((ch) => (ch === '.' ? -1 : LETTERS[ch])), cols);
  const state = { level, seed, name: pic.name, rows, cols, balls, taken: balls.map(() => false), rod: [], rodSize: shape.rod, spools: [], queue: [], extra: 1, moves: 0 };
  const rand = rng(seed);
  let queue = null;
  for (let tries = 0; !queue && tries < 200; tries += 1) queue = plan(state, rand, tries > 100 ? 1 : shape.kindness, shape.rod);
  state.queue = queue ?? [];
  state.spools = state.queue.splice(0, SPOOLS).map((color) => ({ color, filled: 0 }));
  return state;
}

export const left = (state) => state.balls.filter((c, i) => c >= 0 && !state.taken[i]).length;
const fits = (state, color) => state.spools.findIndex((s) => s && s.color === color && s.filled < 3);
export const outcome = (state) => {
  if (left(state) === 0 && !state.rod.length) return 'won';
  if (state.rod.length >= state.rodSize && !state.balls.some((c, i) => isExposed(state, i) && fits(state, c) >= 0)) return 'lost';
  return 'playing';
};
function settle(state, events) {
  for (let changed = true; changed;) {
    changed = false;
    state.spools.forEach((s, k) => {
      if (s && s.filled === 3) {
        events.push({ type: 'spool-done', slot: k, color: s.color });
        state.spools[k] = state.queue.length ? { color: state.queue.shift(), filled: 0 } : null;
        if (state.spools[k]) events.push({ type: 'spool-new', slot: k, color: state.spools[k].color });
        changed = true;
      }
    });
    for (let r = 0; r < state.rod.length; r += 1) {
      const slot = fits(state, state.rod[r]);
      if (slot < 0) continue;
      const color = state.rod[r];
      state.rod.splice(r, 1);
      state.spools[slot].filled += 1;
      events.push({ type: 'rod-to-spool', from: r, slot, color, index: state.spools[slot].filled - 1 });
      changed = true;
      break;
    }
  }
}
export function takeBall(state, i) {
  if (outcome(state) !== 'playing' || !isExposed(state, i)) return null;
  const color = state.balls[i];
  const slot = fits(state, color);
  if (slot < 0 && state.rod.length >= state.rodSize) return null;
  state.taken[i] = true;
  state.moves += 1;
  const events = [];
  if (slot >= 0) {
    state.spools[slot].filled += 1;
    events.push({ type: 'to-spool', cell: i, slot, color, index: state.spools[slot].filled - 1 });
  } else {
    state.rod.push(color);
    events.push({ type: 'to-rod', cell: i, color, index: state.rod.length - 1 });
  }
  settle(state, events);
  return events;
}
export function addPeg(state) {
  if (state.extra <= 0 || outcome(state) === 'won') return false;
  state.extra -= 1;
  state.rodSize += 1;
  return true;
}
export function findHint(state) {
  const exposed = state.balls.map((c, i) => (isExposed(state, i) ? i : -1)).filter((i) => i >= 0);
  return exposed.find((i) => fits(state, state.balls[i]) >= 0) ?? exposed[0] ?? null;
}
