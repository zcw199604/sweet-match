import { chord, createMines, MINE_LEVELS, reveal, toggleFlag } from './minesweeper-core.js';

const node = (tag, cls, text) => {
  const n = document.createElement(tag); n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
// 联机竞速：两人同一块雷区，各扫各的。盘面和对手进度都来自服务端的 view（未翻开的格子里没有雷的信息），
// 本地只负责画和把点击发出去；难度在创建房间时就定了。
const boardFromView = (view, online) => ({
  rows: view.rows, cols: view.cols, mines: view.mines, cells: view.cells, exploded: view.exploded, started: true,
  phase: !online.result.over ? 'playing' : online.result.winner === online.seat ? 'won' : 'lost'
});
export function mountMinesweeper(wrap, { onHud = () => {}, online = null } = {}) {
  let alive = true, level = online ? online.view.level : 'easy', state, flagMode = false, startAt = 0, elapsed = 0;
  const root = node('div', 'classic-game minesweeper-game');
  const tools = node('div', 'classic-tools');
  const difficulty = node('select', 'mine-level');
  difficulty.setAttribute('aria-label', '扫雷难度');
  for (const [id, config] of Object.entries(MINE_LEVELS)) {
    const o = node('option', '', `${config.label} · ${config.mines} 雷`); o.value = id; difficulty.append(o);
  }
  const flag = node('button', 'mine-flag', '⚑ 插旗：关'); flag.type = 'button';
  tools.append(difficulty, flag);
  difficulty.hidden = Boolean(online);
  const stats = node('div', 'mine-stats');
  const board = node('div', 'mine-board'); board.setAttribute('role', 'group'); board.setAttribute('aria-label', '扫雷棋盘');
  const status = node('div', 'classic-status'); status.setAttribute('aria-live', 'polite');
  const rival = node('div', 'race-rival'), rivalText = node('div', ''), meter = node('div', 'rival-meter'), meterFill = node('i', '');
  meter.append(meterFill); rival.append(rivalText, meter); rival.hidden = !online;
  root.append(tools, stats, board, rival, status); wrap.replaceChildren(root);
  let buttons = [];
  function render() {
    if (!alive) return;
    const seconds = Math.floor(elapsed / 1000), flags = state.cells.filter(c => c.flagged).length;
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (online) {
      const mine = online.view.me, other = online.view.rival;
      stats.textContent = `⚑ 剩余 ${state.mines - flags}　 ·　 我 ${mine.opened}/${mine.total}`;
      rivalText.textContent = `对手进度 ${other.opened}/${other.total}`;
      meterFill.style.width = `${Math.round(100 * other.opened / other.total)}%`;
      onHud(`${MINE_LEVELS[level].label} · 我 ${mine.opened}/${mine.total} · 对手 ${other.opened}/${other.total}`);
    } else {
      stats.textContent = `⚑ 剩余 ${state.mines - flags}　 ·　 ⏱ ${time}`;
      onHud(`${MINE_LEVELS[level].label} · ${flags}/${state.mines} 旗`);
    }
    flag.classList.toggle('selected', flagMode); flag.textContent = `⚑ 插旗：${flagMode ? '开' : '关'}`;
    const onlineStatus = () => {
      const forfeit = online.result.reason === 'forfeit', reason = online.view.reason;
      if (state.phase === 'won') return forfeit ? '对手已离开 · 你获胜！' : reason === 'mine' ? '✦ 对手踩雷了，你获胜！' : '✦ 你先扫完了雷区，获胜！';
      if (state.phase === 'lost') return forfeit ? '你已离开本局 · 对手获胜' : reason === 'mine' ? '碰到地雷了，对手获胜。' : '对手先扫完了，这局你输了。';
      return flagMode ? '插旗模式：点格子标记 / 取消地雷' : '抢在对手前扫完所有安全格 · 别踩雷';
    };
    status.textContent = online ? onlineStatus() : state.phase === 'won' ? '✦ 雷区清空！点「重新开始」再开一局。' : state.phase === 'lost' ? '碰到地雷了！点「重新开始」再试试。' : flagMode ? '插旗模式：点格子标记 / 取消地雷' : '点格子探索 · 点已揭开的数字快开周围';
    state.cells.forEach((c, i) => {
      const b = buttons[i], mineVisible = c.mine && state.phase !== 'playing';
      b.className = `mine-cell${c.open ? ' open' : ''}${c.flagged ? ' flagged' : ''}${i === state.exploded ? ' exploded' : ''}`;
      b.dataset.number = c.adjacent;
      b.textContent = mineVisible ? '✹' : c.flagged ? '⚑' : c.open ? (c.adjacent || '') : '';
      b.disabled = state.phase !== 'playing';
      b.setAttribute('aria-label', `${Math.floor(i / state.cols) + 1}行${i % state.cols + 1}列 ${mineVisible ? '地雷' : c.flagged ? '旗子' : c.open ? `${c.adjacent}雷相邻` : '未探索'}`);
    });
  }
  function action(i, mark = flagMode) {
    if (!alive) return;
    if (online) {
      if (state.phase === 'playing') online.send({ type: mark ? 'flag' : state.cells[i].open ? 'chord' : 'reveal', index: i });
      return;
    }
    const started = state.started;
    if (mark) toggleFlag(state, i);
    else if (state.cells[i].open) chord(state, i);
    else reveal(state, i);
    if (!started && state.started) startAt = performance.now();
    if (state.started) elapsed = performance.now() - startAt;
    render();
  }
  function build() {
    if (!alive) return;
    state = online ? boardFromView(online.view, online) : createMines(level); startAt = 0; elapsed = 0;
    board.style.setProperty('--mine-cols', state.cols);
    root.dataset.level = level;
    buttons = state.cells.map((_, i) => {
      const b = node('button', 'mine-cell'); b.type = 'button'; b.dataset.cell = i;
      b.addEventListener('click', () => action(i));
      b.addEventListener('contextmenu', e => { e.preventDefault(); action(i, true); });
      return b;
    }); board.replaceChildren(...buttons); render();
  }
  difficulty.addEventListener('change', () => { level = difficulty.value; build(); });
  flag.addEventListener('click', () => { flagMode = !flagMode; render(); });
  const timer = setInterval(() => {
    if (!online && state.started && state.phase === 'playing') { elapsed = performance.now() - startAt; render(); }
  }, 1000);
  const off = online?.on('state', (payload) => { state = boardFromView(payload.view, online); render(); });
  build();
  return { restart() { if (!online) build(); }, destroy() { alive = false; off?.(); clearInterval(timer); wrap.replaceChildren(); }, get state() { return state; } };
}
