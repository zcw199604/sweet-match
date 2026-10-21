import { MINE_LEVELS, createMines, reveal, toggleFlag, chord } from '../../minesweeper-core.js';
import { rngFrom, pick } from './util.js';

const LEVELS = Object.keys(MINE_LEVELS);
const MODES = ['race', 'coop'];
const safeTotal = (s) => s.cells.length - s.mines;
const openedOf = (s) => s.cells.filter((c) => c.open && !c.mine).length;
const flagsOf = (s) => s.cells.filter((c) => c.flagged).length;

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

// 合作：未翻开格子的 mine / adjacent 不发，对局结束后才公开所有雷。
const cellsView = (board, over) => board.cells.map((c) => ({
  open: c.open, flagged: c.flagged,
  adjacent: c.open ? c.adjacent : 0,
  mine: c.open || over ? c.mine : false
}));

// 竞速：两人的雷区完全一样（同一个种子，起手由系统在中心格翻开，开局展开的范围有上限），各扫各的。
// 先扫完所有安全格的人赢；踩雷立刻判负。
// 自己的整块雷区（含雷）都发给自己：客户端在本地先算出每一下的结果，不等回包（朋友间对战，不防看雷）；
// acts 是每人被服务端接受的操作数，客户端拿它判断服务端追上了没有。
const race = {
  apply(next, seat, act) {
    const board = next.players[seat];
    if (!act(board)) return { ok: false, message: '这个操作无效。' };
    next.acts[seat] += 1;
    if (board.phase === 'lost') Object.assign(next, { status: 'over', winner: 1 - seat, reason: 'mine' });
    else if (board.phase === 'won') Object.assign(next, { status: 'over', winner: seat, reason: 'cleared' });
    return { ok: true, state: next };
  },
  // 对手只给进度，不给盘面。
  view(state, seat) {
    const board = state.players[seat], rival = state.players[1 - seat];
    return {
      mode: 'race', level: state.level, rows: board.rows, cols: board.cols, mines: board.mines,
      status: state.status, winner: state.winner, reason: state.reason, exploded: board.exploded,
      cells: board.cells.map(({ open, flagged, adjacent, mine }) => ({ open, flagged, adjacent, mine })),
      me: { opened: openedOf(board), flags: flagsOf(board), total: safeTotal(board), acts: state.acts[seat] },
      rival: { opened: openedOf(rival), flags: flagsOf(rival), total: safeTotal(rival), lost: rival.phase === 'lost' }
    };
  }
};

// 合作（情侣玩法）：两人共用一块雷区，轮流翻格子（翻开或快开都算一步，之后换人）；插旗不占回合，谁都能随时插，
// 用来给对方提个醒。扫完所有安全格两人一起赢，任何一方踩雷两人一起输。先手由种子随机决定。
const coop = {
  apply(next, seat, act, type) {
    const board = next.board;
    if (type !== 'flag' && next.turn !== seat) return { ok: false, message: '还没轮到你，可以先插旗提醒 TA。' };
    if (!act(board)) return { ok: false, message: '这个操作无效。' };
    if (type === 'flag') return { ok: true, state: next };
    if (board.phase === 'lost') Object.assign(next, { status: 'over', reason: 'mine', by: seat });
    else if (board.phase === 'won') Object.assign(next, { status: 'over', reason: 'cleared', by: seat });
    else next.turn = 1 - seat;
    return { ok: true, state: next };
  },
  view(state, seat) {
    const board = state.board;
    return {
      mode: 'coop', level: state.level, rows: board.rows, cols: board.cols, mines: board.mines,
      status: state.status, reason: state.reason, by: state.by, turn: state.turn, exploded: board.exploded,
      cells: cellsView(board, state.status === 'over'),
      opened: openedOf(board), flags: flagsOf(board), total: safeTotal(board)
    };
  }
};

const rules = (state) => (state.mode === 'coop' ? coop : race);

export default {
  id: 'minesweeper',
  seats: 2,
  // 合作局里有人中途离开，没有谁赢谁输 → 本局作废
  teamGame: (state) => state.mode === 'coop',
  init: ({ seed, level, mode } = {}) => {
    const key = pick(level, LEVELS, 'normal'), board = openingBoard(key, seed);
    if (pick(mode, MODES, 'race') === 'coop') {
      return { mode: 'coop', level: key, board, turn: seed % 2, status: 'playing', reason: null, by: null };
    }
    return { mode: 'race', level: key, players: [board, structuredClone(board)], acts: [0, 0], status: 'playing', winner: null, reason: null };
  },
  canAct: (state, seat) => state.status === 'playing',
  apply: (state, seat, action) => {
    const index = action?.index, type = action?.type;
    const cells = (state.board ?? state.players[seat]).cells;
    if (!Number.isInteger(index) || index < 0 || index >= cells.length) return { ok: false, message: '格子不存在。' };
    const act = { reveal: (b) => reveal(b, index), flag: (b) => toggleFlag(b, index), chord: (b) => chord(b, index) }[type];
    if (!act) return { ok: false, message: '这个操作无效。' };
    return rules(state).apply(structuredClone(state), seat, act, type);
  },
  view: (state, seat) => rules(state).view(state, seat),
  // 合作局没有赢家座位：winner 为 null，两人的输赢看 view.reason
  result: (state) => ({ over: state.status === 'over', winner: state.mode === 'coop' ? null : state.winner })
};
