import { MINE_LEVELS, createMines, reveal, toggleFlag, chord } from '../../minesweeper-core.js';
import { rngFrom, pick } from './util.js';

const LEVELS = Object.keys(MINE_LEVELS);
const safeTotal = (s) => s.cells.length - s.mines;
const openedOf = (s) => s.cells.filter((c) => c.open && !c.mine).length;

// 首个翻开的格子周围必无雷，至少会连锁展开 3×3；运气不好时一下翻开大半张图，竞速就没悬念了。
// 所以用 seed、seed+1… 依次尝试，挑第一块开局展开不超过安全格 OPENING_CAP 的雷区（两位玩家用同一块）。
const OPENING_CAP = 0.25;
function openingBoard(level, seed) {
  let best = null;
  for (let k = 0; k < 400; k++) {
    const board = createMines(level);
    reveal(board, Math.floor(board.rows / 2) * board.cols + Math.floor(board.cols / 2), rngFrom({ s: seed + k }));
    const ratio = openedOf(board) / safeTotal(board);
    if (ratio <= OPENING_CAP) return board;
    if (!best || ratio < best.ratio) best = { board, ratio };
  }
  return best.board;
}

// 扫雷双人竞速：两人的雷区完全一样（同一个种子，起手由系统在中心格翻开，开局展开的范围有上限），各扫各的。
// 先扫完所有安全格的人赢；踩雷立刻判负。
export default {
  id: 'minesweeper',
  seats: 2,
  init: ({ seed, level } = {}) => {
    const key = pick(level, LEVELS, 'normal');
    const board = openingBoard(key, seed);
    const players = [board, structuredClone(board)];
    return { level: key, players, status: 'playing', winner: null, reason: null };
  },
  canAct: (state, seat) => state.status === 'playing',
  apply: (state, seat, action) => {
    const next = structuredClone(state), board = next.players[seat];
    const index = action?.index;
    if (!Number.isInteger(index) || index < 0 || index >= board.cells.length) return { ok: false, message: '格子不存在。' };
    const act = { reveal: () => reveal(board, index), flag: () => toggleFlag(board, index), chord: () => chord(board, index) }[action.type];
    if (!act || !act()) return { ok: false, message: '这个操作无效。' };
    if (board.phase === 'lost') Object.assign(next, { status: 'over', winner: 1 - seat, reason: 'mine' });
    else if (board.phase === 'won') Object.assign(next, { status: 'over', winner: seat, reason: 'cleared' });
    return { ok: true, state: next };
  },
  // 未翻开格子的 mine / adjacent 绝不能发出去，否则等于明牌；对手只给进度，不给盘面。
  view: (state, seat) => {
    const over = state.status === 'over', board = state.players[seat], rival = state.players[1 - seat];
    return {
      level: state.level, rows: board.rows, cols: board.cols, mines: board.mines,
      status: state.status, winner: state.winner, reason: state.reason, exploded: board.exploded,
      cells: board.cells.map((c) => ({
        open: c.open, flagged: c.flagged,
        adjacent: c.open ? c.adjacent : 0,
        mine: c.open || over ? c.mine : false
      })),
      me: { opened: openedOf(board), flags: board.cells.filter((c) => c.flagged).length, total: safeTotal(board) },
      rival: { opened: openedOf(rival), flags: rival.cells.filter((c) => c.flagged).length, total: safeTotal(rival), lost: rival.phase === 'lost' }
    };
  },
  result: (state) => ({ over: state.status === 'over', winner: state.winner })
};
