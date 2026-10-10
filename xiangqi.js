import {
  PIECE_LABELS, createXiangqi, legalMoves, moveXiangqi,
  squareAt, undoXiangqi, xiangqiSearch
} from './xiangqi-core.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function mountXiangqi(wrap, { onHud = () => {} } = {}) {
  let alive = true;
  let state = createXiangqi();
  let selected = null;
  let targets = [];
  let mode = 'ai';
  let searchTimer = 0;
  let search = null;

  const root = el('section', 'classic-game xiangqi-game');
  const toolbar = el('div', 'classic-tools xiangqi-tools');
  const modeLabel = el('label', 'xiangqi-mode', '对弈');
  const modeSelect = el('select', 'xiangqi-mode-select');
  modeSelect.dataset.action = 'mode';
  modeSelect.append(new Option('人机（红方）', 'ai'), new Option('同屏双人', 'local'));
  modeLabel.append(modeSelect);
  const undo = el('button', 'classic-button', '↶ 悔棋');
  undo.dataset.action = 'undo';
  const restart = el('button', 'classic-button', '↻ 重开');
  restart.dataset.action = 'restart';
  toolbar.append(modeLabel, undo, restart);
  const status = el('p', 'classic-status xiangqi-status');
  const board = el('div', 'xiangqi-board');
  board.setAttribute('role', 'grid');
  board.setAttribute('aria-label', '中国象棋棋盘');
  const note = el('p', 'xiangqi-note', '点选棋子，再点亮色落点。红方先行。');
  root.append(toolbar, status, board, note);
  wrap.replaceChildren(root);

  const cancelSearch = () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = 0;
    search = null;
  };

  const hud = () => {
    const phase = state.phase === 'over'
      ? (state.reason === 'checkmate' ? `${state.winner === 'r' ? '红' : '黑'}方将死` : state.reason === 'stalemate' ? `${state.turn === 'r' ? '红' : '黑'}方困毙 · ${state.winner === 'r' ? '红' : '黑'}方获胜` : '和棋')
      : `${state.turn === 'r' ? '红' : '黑'}方${state.check ? ' · 将军' : ''}走棋`;
    status.textContent = phase;
    onHud(phase);
  };

  const render = () => {
    board.replaceChildren();
    const moves = new Set(targets);
    for (let r = 0; r < 10; r += 1) for (let c = 0; c < 9; c += 1) {
      const square = squareAt(r, c);
      const piece = state.board[r][c];
      const cell = el('button', 'xiangqi-cell');
      cell.type = 'button';
      cell.dataset.square = square;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-label', piece ? `${piece.color === 'r' ? '红' : '黑'}${PIECE_LABELS[piece.color][piece.type]} ${square}` : `空位 ${square}`);
      if (r === 4) cell.classList.add('river-top');
      if (r === 5) cell.classList.add('river-bottom');
      if (selected === square) cell.classList.add('selected');
      if (moves.has(square)) cell.classList.add(piece ? 'capture-target' : 'move-target');
      if (piece) {
        const chip = el('span', `xiangqi-piece ${piece.color === 'r' ? 'red' : 'black'}`, PIECE_LABELS[piece.color][piece.type]);
        chip.setAttribute('aria-hidden', 'true');
        cell.append(chip);
      }
      cell.addEventListener('click', () => clickSquare(square));
      board.append(cell);
    }
    hud();
  };

  const runAi = () => {
    if (!alive || mode !== 'ai' || state.phase !== 'playing' || state.turn !== 'b') return;
    cancelSearch();
    search = xiangqiSearch(state);
    const step = () => {
      if (!alive || !search || mode !== 'ai' || state.turn !== 'b') return cancelSearch();
      const result = search.next();
      if (result.done) {
        const move = result.value;
        cancelSearch();
        if (move) moveXiangqi(state, move.from, move.to);
        selected = null; targets = [];
        render();
        return;
      }
      searchTimer = setTimeout(step, 0);
    };
    searchTimer = setTimeout(step, 0);
  };

  const clickSquare = square => {
    if (!alive || state.phase !== 'playing' || (mode === 'ai' && state.turn === 'b')) return;
    if (selected && targets.includes(square)) {
      moveXiangqi(state, selected, square);
      selected = null; targets = [];
      render();
      runAi();
      return;
    }
    const piece = state.board[9 - Number(square[1])][square.charCodeAt(0) - 97];
    if (piece?.color === state.turn) {
      selected = square;
      targets = legalMoves(state, square).map(move => move.to);
    } else {
      selected = null; targets = [];
    }
    render();
  };

  const reset = () => {
    cancelSearch();
    state = createXiangqi();
    selected = null; targets = [];
    render();
  };
  modeSelect.addEventListener('change', () => { mode = modeSelect.value; reset(); });
  restart.addEventListener('click', reset);
  undo.addEventListener('click', () => {
    const thinking = Boolean(search);
    cancelSearch();
    undoXiangqi(state, mode === 'ai' ? (thinking ? 1 : 2) : 1);
    selected = null; targets = [];
    render();
  });
  render();

  return {
    restart: reset,
    destroy() {
      alive = false;
      cancelSearch();
      root.remove();
    },
    get state() { return state; }
  };
}
