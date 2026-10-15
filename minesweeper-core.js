export const MINE_LEVELS = {
  easy: { rows: 9, cols: 9, mines: 10, label: '简单' },
  normal: { rows: 12, cols: 10, mines: 20, label: '普通' },
  hard: { rows: 16, cols: 12, mines: 40, label: '困难' }
};

// 无猜模式：布雷后用 solvable 校验，解不开就重布；困难档约 1/4 的随机盘面可解，100 次都失败的概率可忽略，失败则接受最后一盘。
const NO_GUESS_TRIES = 100;

export function createMines(level = 'easy', { noGuess = false } = {}) {
  const config = MINE_LEVELS[level] ?? MINE_LEVELS.easy;
  return { ...config, noGuess, phase: 'playing', started: false, exploded: -1,
    cells: Array.from({ length: config.rows * config.cols }, () => ({ mine: false, adjacent: 0, open: false, flagged: false })) };
}

// Adapted from reed-jones/minesweeper_js exploreNearbyTiles (MIT).
// See third_party/minesweeper/SOURCE.md and LICENSE.
export function neighbours(s, index) {
  const Xaxis = index % s.cols, Yaxis = Math.floor(index / s.cols), result = [];
  for (let x = Xaxis - 1; x <= Xaxis + 1; x++) {
    for (let y = Yaxis - 1; y <= Yaxis + 1; y++) {
      if (x === Xaxis && y === Yaxis) continue;
      if (x < 0 || y < 0 || x >= s.cols || y >= s.rows) continue;
      result.push(y * s.cols + x);
    }
  }
  return result;
}

function layMines(s, first, rng) {
  for (const c of s.cells) { c.mine = false; c.adjacent = 0; }
  const safe = new Set([first, ...neighbours(s, first)]);
  const candidates = s.cells.map((_, i) => i).filter(i => !safe.has(i));
  // Sampling without replacement also terminates for deterministic random sources.
  for (let n = 0; n < s.mines; n++) {
    const k = n + Math.floor(rng() * (candidates.length - n));
    [candidates[n], candidates[k]] = [candidates[k], candidates[n]];
    s.cells[candidates[n]].mine = true;
    for (const i of neighbours(s, candidates[n])) s.cells[i].adjacent++;
  }
}

function plant(s, first, rng) {
  for (let tries = 1; ; tries++) {
    layMines(s, first, rng);
    if (!s.noGuess || tries >= NO_GUESS_TRIES || solvable(s, first)) break;
  }
  s.started = true;
}

// 只凭推理能否从 first 开始翻开所有安全格：先用单格规则，卡住时再对边界做穷举（含剩余雷数约束）。
// 穷举超出 budget 个搜索节点就按「需要猜」处理，让 plant 重布。
export function solvable(s, first, budget = 2e5) {
  const open = new Uint8Array(s.cells.length), mine = new Uint8Array(s.cells.length);
  let left = s.cells.length - s.mines;
  const flood = start => {
    const pending = [start];
    while (pending.length) {
      const i = pending.pop();
      if (open[i]) continue;
      open[i] = 1; left--;
      if (!s.cells[i].adjacent) pending.push(...neighbours(s, i));
    }
  };
  flood(first);
  const meter = { budget };
  while (left > 0) {
    const found = deduce(s, open, mine, meter);
    if (!found) return false;
    found.mines.forEach(i => { mine[i] = 1; });
    found.safe.forEach(flood);
  }
  return true;
}

function deduce(s, open, mine, meter) {
  const cons = [];
  for (let i = 0; i < s.cells.length; i++) {
    if (!open[i] || !s.cells[i].adjacent) continue;
    const near = neighbours(s, i), vars = near.filter(j => !open[j] && !mine[j]);
    if (vars.length) cons.push({ vars, need: s.cells[i].adjacent - near.filter(j => mine[j]).length });
  }
  const safe = new Set(), mines = new Set();
  for (const c of cons) {
    if (!c.need) c.vars.forEach(v => safe.add(v));
    else if (c.need === c.vars.length) c.vars.forEach(v => mines.add(v));
  }
  if (safe.size || mines.size) return { safe, mines };

  // 按共享约束把边界格分成互不相干的连通块，逐块回溯出所有合法布雷，按块内雷数 k 记录每格「可能是雷 / 可能安全」。
  const root = new Map();
  const find = v => { while (root.get(v) !== v) v = root.get(v); return v; };
  for (const c of cons) for (const v of c.vars) if (!root.has(v)) root.set(v, v);
  for (const c of cons) for (const v of c.vars) root.set(find(v), find(c.vars[0]));
  const groups = new Map();
  for (const v of root.keys()) { const r = find(v); groups.set(r, [...(groups.get(r) ?? []), v]); }
  const comps = [];
  for (const vars of groups.values()) {
    const at = new Map(vars.map((v, k) => [v, k])), own = cons.filter(c => at.has(c.vars[0]));
    const byVar = vars.map(v => own.filter(c => c.vars.includes(v)));
    own.forEach(c => { c.set = 0; c.free = c.vars.length; });
    const byK = new Map(), assign = new Uint8Array(vars.length);
    const walk = (k, count) => {
      if (--meter.budget < 0) return false;
      if (k === vars.length) {
        if (!byK.has(count)) byK.set(count, { mine: new Uint8Array(vars.length), safe: new Uint8Array(vars.length) });
        const seen = byK.get(count);
        assign.forEach((m, j) => { (m ? seen.mine : seen.safe)[j] = 1; });
        return true;
      }
      for (const m of [0, 1]) {
        assign[k] = m;
        byVar[k].forEach(c => { c.free--; c.set += m; });
        const ok = byVar[k].every(c => c.set <= c.need && c.set + c.free >= c.need);
        const done = !ok || walk(k + 1, count + m);
        byVar[k].forEach(c => { c.free++; c.set -= m; });
        if (!done) return false;
      }
      return true;
    };
    if (!walk(0, 0)) return null;
    comps.push({ vars, byK });
  }

  let rest = s.mines;
  const interior = [];
  for (let i = 0; i < s.cells.length; i++) {
    if (mine[i]) rest--;
    else if (!open[i] && !root.has(i)) interior.push(i);
  }
  const fits = total => rest - total >= 0 && rest - total <= interior.length;
  const sums = skip => comps.reduce((acc, c, j) => j === skip ? acc
    : new Set([...acc].flatMap(a => [...c.byK.keys()].map(k => a + k))), new Set([0]));
  comps.forEach((c, j) => {
    const others = [...sums(j)], canMine = new Uint8Array(c.vars.length), canSafe = new Uint8Array(c.vars.length);
    for (const [k, seen] of c.byK) {
      if (!others.some(o => fits(k + o))) continue;
      seen.mine.forEach((m, v) => { canMine[v] |= m; });
      seen.safe.forEach((m, v) => { canSafe[v] |= m; });
    }
    c.vars.forEach((v, k) => { if (!canMine[k]) safe.add(v); else if (!canSafe[k]) mines.add(v); });
  });
  if (interior.length) {
    const inside = [...sums(-1)].filter(fits).map(t => rest - t);
    if (inside.every(r => r === 0)) interior.forEach(v => safe.add(v));
    else if (inside.every(r => r === interior.length)) interior.forEach(v => mines.add(v));
  }
  return safe.size || mines.size ? { safe, mines } : null;
}

export function toggleFlag(s, index) {
  const c = s.cells[index];
  if (!c || c.open || s.phase !== 'playing') return false;
  if (!c.flagged && s.cells.filter(c => c.flagged).length >= s.mines) return false;
  c.flagged = !c.flagged;
  return true;
}

export function reveal(s, index, rng = Math.random) {
  const c = s.cells[index];
  if (!c || c.flagged || c.open || s.phase !== 'playing') return false;
  if (!s.started) plant(s, index, rng);
  if (c.mine) { c.open = true; s.exploded = index; s.phase = 'lost'; return true; }
  const pending = [index];
  while (pending.length) {
    const i = pending.pop(), cell = s.cells[i];
    if (cell.open || cell.flagged || cell.mine) continue;
    cell.open = true;
    if (!cell.adjacent) pending.push(...neighbours(s, i));
  }
  if (s.cells.every(c => c.mine || c.open)) s.phase = 'won';
  return true;
}

export function chord(s, index) {
  const c = s.cells[index];
  if (!c?.open || !c.adjacent || s.phase !== 'playing') return false;
  const near = neighbours(s, index);
  if (near.filter(i => s.cells[i].flagged).length !== c.adjacent) return false;
  let changed = false;
  for (const i of near) changed = reveal(s, i) || changed;
  return changed;
}
