export const MINE_LEVELS = {
  easy: { rows: 9, cols: 9, mines: 10, label: '简单' },
  normal: { rows: 12, cols: 10, mines: 20, label: '普通' },
  hard: { rows: 16, cols: 12, mines: 40, label: '困难' }
};

export function createMines(level = 'easy') {
  const config = MINE_LEVELS[level] ?? MINE_LEVELS.easy;
  return { ...config, phase: 'playing', started: false, exploded: -1,
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

function plant(s, first, rng) {
  const safe = new Set([first, ...neighbours(s, first)]);
  const candidates = s.cells.map((_, i) => i).filter(i => !safe.has(i));
  // Sampling without replacement also terminates for deterministic random sources.
  for (let n = 0; n < s.mines; n++) {
    const k = n + Math.floor(rng() * (candidates.length - n));
    [candidates[n], candidates[k]] = [candidates[k], candidates[n]];
    s.cells[candidates[n]].mine = true;
    for (const i of neighbours(s, candidates[n])) s.cells[i].adjacent++;
  }
  s.started = true;
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
