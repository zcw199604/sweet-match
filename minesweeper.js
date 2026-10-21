import { chord, createMines, MINE_LEVELS, reveal, toggleFlag } from './minesweeper-core.js';

const node = (tag, cls, text) => {
  const n = document.createElement(tag); n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
// 联机：竞速是两人同一块雷区各扫各的；合作是两人轮流点同一块雷区，一起赢一起输。难度、玩法在创建房间时就定了。
// 合作：盘面来自服务端的 view（未翻开的格子里没有雷的信息），本地只负责画和把点击发出去。
// 竞速：服务端把自己整块雷区（含雷）都发来，每一下先在本地算出来再发出去，不等回包；服务端追上后对一次。
const onlinePhase = (view, online) => {
  if (!online.result.over) return 'playing';
  if (view.mode === 'coop') return view.reason === 'cleared' ? 'won' : 'lost';   // 有人离开（作废）也停在这里
  return online.result.winner === online.seat ? 'won' : 'lost';
};
const boardFromView = (view, online) => ({
  rows: view.rows, cols: view.cols, mines: view.mines, cells: view.cells.map((c) => ({ ...c })), exploded: view.exploded, started: true,
  phase: onlinePhase(view, online)
});
const sameCells = (a, b) => a.every((c, i) => c.open === b[i].open && c.flagged === b[i].flagged);
export function mountMinesweeper(wrap, { onHud = () => {}, online = null, noGuess: savedNoGuess = false, onNoGuess = () => {} } = {}) {
  let alive = true, level = online ? online.view.level : 'easy', state, flagMode = false, noGuess = !online && savedNoGuess, startAt = 0, elapsed = 0;
  const root = node('div', 'classic-game minesweeper-game');
  const tools = node('div', 'classic-tools');
  const difficulty = node('select', 'mine-level');
  difficulty.setAttribute('aria-label', '扫雷难度');
  for (const [id, config] of Object.entries(MINE_LEVELS)) {
    const o = node('option', '', `${config.label} · ${config.mines} 雷`); o.value = id; difficulty.append(o);
  }
  const flag = node('button', 'mine-flag', '⚑ 插旗：关'); flag.type = 'button';
  // 无猜：只靠推理就能扫完，不会遇到二选一；只管单机，联机盘面由服务端生成。
  const guessless = node('button', 'mine-noguess', '无猜：关'); guessless.type = 'button';
  tools.append(difficulty, flag, guessless);
  difficulty.hidden = guessless.hidden = Boolean(online);
  const stats = node('div', 'mine-stats');
  const board = node('div', 'mine-board'); board.setAttribute('role', 'group'); board.setAttribute('aria-label', '扫雷棋盘');
  const status = node('div', 'classic-status'); status.setAttribute('aria-live', 'polite');
  const rival = node('div', 'race-rival'), rivalText = node('div', ''), meter = node('div', 'rival-meter'), meterFill = node('i', '');
  const coop = online?.view.mode === 'coop';
  // 旧服务端不发雷也不发 acts，那就还是等回包（本地拿不到雷，没法算）。
  const local = Boolean(online) && !coop && online.view.me?.acts !== undefined;
  let acts = online?.view.me?.acts ?? 0, round = online?.round ?? 0;   // acts：本地已经算过并发出去的操作数
  meter.append(meterFill); rival.append(rivalText, meter); rival.hidden = !online || coop;
  root.append(tools, stats, board, rival, status); wrap.replaceChildren(root);
  let buttons = [];
  function render() {
    if (!alive) return;
    const seconds = Math.floor(elapsed / 1000), flags = state.cells.filter(c => c.flagged).length;
    const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    const myTurn = coop && online.view.turn === online.seat;
    board.classList.toggle('waiting', coop && state.phase === 'playing' && !myTurn);
    if (coop) {
      const { opened, total } = online.view;
      stats.textContent = `⚑ 剩余 ${state.mines - flags}　 ·　 已开 ${opened}/${total}`;
      onHud(`${MINE_LEVELS[level].label} · 合作 · ${opened}/${total}`);
    } else if (online) {
      const other = online.view.rival, mine = { total: online.view.me.total, opened: state.cells.filter(c => c.open && !c.mine).length };
      stats.textContent = `⚑ 剩余 ${state.mines - flags}　 ·　 我 ${mine.opened}/${mine.total}`;
      rivalText.textContent = `对手进度 ${other.opened}/${other.total}`;
      meterFill.style.width = `${Math.round(100 * other.opened / other.total)}%`;
      onHud(`${MINE_LEVELS[level].label} · 我 ${mine.opened}/${mine.total} · 对手 ${other.opened}/${other.total}`);
    } else {
      stats.textContent = `⚑ 剩余 ${state.mines - flags}　 ·　 ⏱ ${time}`;
      onHud(`${MINE_LEVELS[level].label}${noGuess ? ' · 无猜' : ''} · ${flags}/${state.mines} 旗`);
    }
    flag.classList.toggle('selected', flagMode); flag.textContent = `⚑ 插旗：${flagMode ? '开' : '关'}`;
    guessless.classList.toggle('selected', noGuess); guessless.textContent = `无猜：${noGuess ? '开' : '关'}`;
    const coopStatus = () => {
      const { by } = online.view;
      if (online.result.reason === 'abandoned') return '有人离开了，这一局作废。';
      if (state.phase === 'won') return '✦ 一起扫完了雷区，配合满分！';
      if (state.phase === 'lost') return by === online.seat ? '哎呀，你踩到雷了……再来一局吧。' : 'TA 踩到雷了……再来一局吧。';
      if (!myTurn) return '等 TA 翻格子……插旗不占回合，可以先标出地雷提醒 TA';
      return flagMode ? '插旗模式：点格子标记 / 取消地雷（不占回合）' : '轮到你了 · 翻开一格后换 TA';
    };
    const onlineStatus = () => {
      if (coop) return coopStatus();
      // 本地已经算出输赢、服务端还没确认：踩雷一定是输；扫完了要看服务端那边对手是不是更早扫完。
      if (!online.result.over && state.phase === 'lost') return '碰到地雷了，对手获胜。';
      if (!online.result.over && state.phase === 'won') return '✦ 扫完了！等待确认……';
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
      if (state.phase !== 'playing' || online.result.over) return;
      const type = mark ? 'flag' : state.cells[i].open ? 'chord' : 'reveal';
      if (local) {
        if (!(mark ? toggleFlag(state, i) : type === 'chord' ? chord(state, i) : reveal(state, i))) return;
        acts += 1;
        render();
      }
      online.send({ type, index: i });
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
    state = online ? boardFromView(online.view, online) : createMines(level, { noGuess }); startAt = 0; elapsed = 0;
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
  guessless.addEventListener('click', () => { noGuess = !noGuess; onNoGuess(noGuess); build(); });
  const timer = setInterval(() => {
    if (!online && state.started && state.phase === 'playing') { elapsed = performance.now() - startAt; render(); }
  }, 1000);
  // 以服务端为准：开局/再来一局/结束、重连后服务端走得比本地远、全部确认后对不上、被拒或断线。
  function resync() { state = boardFromView(online.view, online); acts = online.view.me?.acts ?? 0; render(); }
  const rollback = () => { if (local && acts !== online.view.me.acts) resync(); };
  const offs = online ? [
    online.on('state', (payload) => {
      const view = payload.view, server = view.me?.acts;
      const fresh = payload.round !== round;
      round = payload.round;
      // 服务端还在确认本地已经算过的操作，或者只是对手走了：本地盘面不动，只刷新进度。
      if (!local || fresh || online.result.over || server > acts || (server === acts && !sameCells(state.cells, view.cells))) resync();
      else render();
    }),
    online.on('reject', rollback),
    online.on('status', (status) => { if (status !== 'live') rollback(); })
  ] : [];
  build();
  return { restart() { if (!online) build(); }, destroy() { alive = false; for (const off of offs) off(); clearInterval(timer); wrap.replaceChildren(); }, get state() { return state; } };
}
