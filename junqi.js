import { applyAction, CAMPS, chooseAiAction, createState, HEADQUARTERS, legalMoves, PIECES, railNeighbors, roadNeighbors } from './junqi-core.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const colorName = side => side === 'red' ? '红方' : '蓝方';

// online：联机时的 Session。状态以服务端推来的 view 为准（暗棋的身份服务端不发），走子只是发给服务端。
export function mountJunqi(wrap, { onHud = () => {}, online = null } = {}) {
  let state = online?.view ?? createState(), mode = online ? 'online' : 'ai', selected = -1, alive = true, timer = 0;
  const root = el('div', 'classic-game junqi-game');
  const top = el('div', 'junqi-toolbar');
  const modes = el('div', 'junqi-modes');
  const aiButton = el('button', 'junqi-control', '单人对电脑');
  const duoButton = el('button', 'junqi-control', '同屏双人');
  const restartButton = el('button', 'junqi-control', '↻ 新一局');
  modes.append(aiButton, duoButton);
  top.append(modes, restartButton);
  top.hidden = Boolean(online);
  const players = el('div', 'junqi-players');
  const playerLabels = [el('span', 'junqi-player'), el('span', 'junqi-player')];
  players.append(...playerLabels);
  const status = el('p', 'junqi-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const board = el('div', 'junqi-board');
  board.setAttribute('role', 'group');
  board.setAttribute('aria-label', '军棋翻棋版，十二行五列');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 500 720');
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('junqi-paths');
  const point = cell => [50 + cell % 5 * 100, 30 + Math.floor(cell / 5) * 60];
  function path(from, to, kind) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const [x1, y1] = point(from), [x2, y2] = point(to);
    for (const [key, value] of Object.entries({ x1, y1, x2, y2 })) line.setAttribute(key, value);
    line.setAttribute('class', kind);
    svg.append(line);
  }
  for (let cell = 0; cell < 60; cell++) for (const to of roadNeighbors(cell)) if (to > cell) path(cell, to, 'junqi-road');
  for (let cell = 0; cell < 60; cell++) for (const to of railNeighbors(cell)) if (to > cell) path(cell, to, 'junqi-rail');
  board.append(svg);
  const cells = Array.from({ length: 60 }, (_, cell) => {
    const button = el('button', 'junqi-cell');
    button.type = 'button';
    button.dataset.cell = cell;
    button.style.gridRow = Math.floor(cell / 5) + 1;
    button.style.gridColumn = cell % 5 + 1;
    button.addEventListener('click', () => clickCell(cell));
    board.append(button);
    return button;
  });
  const message = el('p', 'junqi-message');
  const legend = el('p', 'junqi-legend', '◇ 行营安全 · ▣ 大本营禁出 · 金色虚线为铁路');
  const rules = el('details', 'junqi-rules');
  rules.append(el('summary', '', '翻棋版怎么玩？'));
  rules.append(el('p', '', '首枚翻开的棋子决定先手阵营。每回合翻一枚暗棋，或点击己方明棋再点亮起的位置移动。50 枚棋子随机分布，双人共用屏幕轮流操作。'));
  rules.append(el('p', '', '司令 > 军长 > 师长 > 旅长 > 团长 > 营长 > 连长 > 排长 > 工兵；同级同归于尽。炸弹与任意棋子同归于尽。地雷、军旗不能移动，工兵可排雷。任意可动棋子夺旗即可获胜。'));
  rules.append(el('p', '', '普通棋子铁路直行，工兵可沿铁路转弯，沿途不能跳子；公路走一格，行营有斜路。行营里的棋子免受攻击，进入大本营后不可离开。暗棋不能被攻击。司令阵亡时军旗亮出。'));
  rules.append(el('p', '', '对方无暗棋可翻且无棋可走时获胜；连续 80 手无战斗、无翻棋则和棋。电脑只根据明棋决策。'));
  root.append(top, players, status, board, message, legend, rules);
  wrap.replaceChildren(root);

  function name(seat) { return online ? seat === online.seat ? '你' : '对手' : mode === 'ai' ? seat === 0 ? '你' : '电脑' : `玩家 ${seat + 1}`; }
  function clearTimer() { clearTimeout(timer); timer = 0; }
  function blocked() { return !alive || state.status !== 'playing' || (mode === 'ai' && state.turn === 1) || Boolean(online && (online.result.over || state.turn !== online.seat)); }
  function render() {
    if (!alive) return;
    aiButton.classList.toggle('active', mode === 'ai');
    duoButton.classList.toggle('active', mode === 'duo');
    aiButton.setAttribute('aria-pressed', String(mode === 'ai'));
    duoButton.setAttribute('aria-pressed', String(mode === 'duo'));
    for (let seat = 0; seat < 2; seat++) {
      const side = state.players[seat];
      playerLabels[seat].textContent = `${name(seat)} · ${side ? colorName(side) : '待定阵营'}`;
      playerLabels[seat].className = `junqi-player ${side ?? ''}${state.status === 'playing' && state.turn === seat ? ' current' : ''}`;
    }
    const turnText = state.status === 'won' ? `${name(state.winner)}获胜！` : state.status === 'draw' ? '本局和棋' : `${name(state.turn)}${state.players[state.turn] ? ` · ${colorName(state.players[state.turn])}` : ''}${mode === 'ai' && state.turn === 1 ? '思考中…' : selected >= 0 ? '：选择亮起的目标' : '：翻棋或移动'}`;
    let text = turnText;
    if (online && state.status === 'playing') {
      const { over, winner } = online.result;
      text = over ? (winner === online.seat ? '对手已离开 · 你获胜！' : '你已离开本局 · 对手获胜') : state.turn === online.seat ? `轮到你${selected >= 0 ? '：选择亮起的目标' : '：翻棋或移动'}` : '等待对手……';
    }
    status.textContent = text;
    message.textContent = state.message;
    onHud(`军棋翻棋版 · ${text} · ${state.moves} 手`);
    const targets = selected >= 0 ? legalMoves(state, selected) : [];
    const inputBlocked = blocked();
    for (let at = 0; at < 60; at++) {
      const cell = cells[at], piece = state.board[at];
      const camp = CAMPS.includes(at), headquarters = HEADQUARTERS.includes(at);
      cell.className = `junqi-cell${camp ? ' camp' : ''}${headquarters ? ' headquarters' : ''}${piece ? piece.revealed ? ` face-up ${piece.side}` : ' face-down' : ' empty'}${selected === at ? ' selected' : ''}${targets.includes(at) ? ' target' : ''}${state.last?.at === at || state.last?.to === at ? ' last' : ''}`;
      cell.textContent = piece ? piece.revealed ? PIECES[piece.kind].label : '★' : camp ? '◇' : headquarters ? '▣' : '·';
      const location = `${Math.floor(at / 5) + 1} 行 ${at % 5 + 1} 列`;
      cell.setAttribute('aria-label', `${location}，${piece ? piece.revealed ? colorName(piece.side) + PIECES[piece.kind].label : '未翻开的棋子' : camp ? '空行营' : headquarters ? '空大本营' : '空兵站'}${targets.includes(at) ? '，可移动目标' : ''}`);
      cell.setAttribute('aria-pressed', String(selected === at));
      cell.disabled = inputBlocked;
    }
    scheduleAi();
  }
  function scheduleAi() {
    if (timer || !alive || state.status !== 'playing' || mode !== 'ai' || state.turn !== 1) return;
    timer = setTimeout(() => {
      timer = 0;
      if (!alive || mode !== 'ai' || state.status !== 'playing' || state.turn !== 1) return;
      const action = chooseAiAction(state);
      if (action) play(action);
    }, 550);
  }
  function play(action) {
    if (online) { online.send(action); selected = -1; render(); return; }
    const result = applyAction(state, action);
    if (result.ok) { state = result.state; selected = -1; }
    else state = { ...state, message: result.message };
    render();
  }
  function clickCell(at) {
    if (blocked()) return;
    const piece = state.board[at];
    if (selected >= 0 && legalMoves(state, selected).includes(at)) return play({ type: 'move', from: selected, to: at });
    if (piece && !piece.revealed) return play({ type: 'flip', at });
    if (piece?.side === state.players[state.turn]) {
      if (selected === at) selected = -1;
      else if (legalMoves(state, at).length) selected = at;
      else state = { ...state, message: piece.kind === 'flag' || piece.kind === 'mine' ? '军旗和地雷不能移动。' : HEADQUARTERS.includes(at) ? '大本营里的棋子不能离开。' : '这枚棋子暂无合法目标。' };
      render();
    } else {
      selected = -1;
      state = { ...state, message: piece ? '轮到你时只能移动自己的明棋。' : '先选择自己的棋子，再点击亮起的目标。' };
      render();
    }
  }
  function restart() {
    if (!alive || online) return;
    clearTimer(); state = createState(); selected = -1; render();
  }
  aiButton.addEventListener('click', () => { if (alive && mode !== 'ai') { mode = 'ai'; restart(); } });
  duoButton.addEventListener('click', () => { if (alive && mode !== 'duo') { mode = 'duo'; restart(); } });
  restartButton.addEventListener('click', restart);
  const off = online?.on('state', (payload) => { state = payload.view; selected = -1; render(); });
  render();
  return { restart, destroy() { alive = false; off?.(); clearTimer(); root.remove(); }, get state() { return state; } };
}
