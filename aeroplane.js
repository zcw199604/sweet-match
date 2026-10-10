import {
  AEROPLANE_TEAMS, AEROPLANE_RING, AEROPLANE_HOME, createAeroplane,
  aeroplaneCell, rollAeroplane, moveAeroplane, previewAeroplane
} from './aeroplane-core.js';

const COLORS = ['#ff7396', '#ffcf60', '#54d9a0', '#6bcfff'];
const AIRPORTS = [[2.5, 2.5], [11.5, 2.5], [11.5, 11.5], [2.5, 11.5]];
const OFFSETS = [[-.64, -.64], [.64, -.64], [-.64, .64], [.64, .64]];
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const coordinate = (player, progress, plane = 0) => {
  if (progress < 0) return AIRPORTS[player].map((value, axis) => value + OFFSETS[plane][axis]);
  return [...(progress < 52 ? AEROPLANE_RING[aeroplaneCell(player, progress)] : AEROPLANE_HOME[player][progress - 52])];
};
const place = (node, [x, y]) => { node.style.left = `${(x + .5) / 15 * 100}%`; node.style.top = `${(y + .5) / 15 * 100}%`; };
const svg = (name, attributes) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
};

// online：联机时的 Session。状态是服务端推来的 view（掷骰在服务端，电脑队也由服务端代打），点击只是把「掷骰 / 走哪架」发出去。
export function mountAeroplane(wrap, { onHud = () => {}, random = Math.random, online = null } = {}) {
  let alive = true, state = online?.view ?? createAeroplane(), mode = online ? 'online' : 'ai', selected = null, timer = 0, waiting = false;
  const root = el('section', 'classic-game aeroplane-game');
  const toolbar = el('div', 'classic-tools');
  const label = el('label', 'aero-mode', '玩法 ');
  const modeSelect = el('select', 'aero-mode-select');
  modeSelect.setAttribute('aria-label', '飞行棋对局模式');
  modeSelect.append(new Option('人机 · 你是红队', 'ai'), new Option('同屏四人', 'local'));
  label.append(modeSelect);
  const restartButton = el('button', '', '↻ 重开');
  toolbar.append(label, restartButton);
  toolbar.hidden = Boolean(online);
  const teams = el('div', 'aero-teams');
  const board = el('div', 'aero-board aeroplane-board');
  board.setAttribute('aria-label', '飞行棋棋盘，顺时针飞行');
  const scenery = el('div', 'aero-scenery');
  AEROPLANE_RING.forEach((point, index) => {
    const tile = el('span', `aero-tile aero-color-${index % 4}`);
    tile.dataset.cell = index;
    if (index % 13 === 0) { tile.classList.add('aero-start'); tile.textContent = '↗'; }
    if (index % 13 === 3) { tile.classList.add('aero-flight'); tile.textContent = '✈'; }
    place(tile, point); scenery.append(tile);
  });
  AEROPLANE_HOME.forEach((lane, player) => lane.forEach((point, index) => {
    const tile = el('span', `aero-tile aero-home aero-color-${player}`, index === 5 ? '★' : '›');
    tile.style.setProperty('--rotation', `${player * 90}deg`);
    place(tile, point); scenery.append(tile);
  }));
  AIRPORTS.forEach((point, player) => {
    const airport = el('div', `aero-airport aero-color-${player}`);
    airport.append(el('span', 'aero-airport-name', AEROPLANE_TEAMS[player]));
    place(airport, point); scenery.append(airport);
  });
  const center = el('div', 'aero-center', '✦'); place(center, [7, 7]); scenery.append(center);
  const route = svg('svg', { viewBox: '0 0 15 15', class: 'aero-route', 'aria-hidden': 'true' });
  const pieces = el('div', 'aero-pieces');
  board.append(scenery, route, pieces);
  const controls = el('div', 'aero-controls');
  const dice = el('button', 'aero-dice', '掷骰子'); dice.dataset.action = 'roll';
  const next = el('div', 'aero-next');
  const turnLabel = el('strong', 'aero-turn');
  const guidance = el('span', 'aero-guidance');
  next.append(turnLabel, guidance); controls.append(dice, next);
  const choices = el('div', 'aero-choices');
  const status = el('p', 'classic-status aero-status'); status.setAttribute('aria-live', 'polite');
  const rules = el('details', 'aero-rules');
  rules.append(el('summary', '', '规则与本局变体'));
  rules.append(el('p', '', '掷 6 可起飞到起点并继续；连续三个 6 仅取消第三次行动，保留前两步。顺时针走完 52 格公共道后进入自己的 6 格终点道，超过终点会反弹。四架全部到达即获胜。'));
  rules.append(el('p', '', '普通落点为同色时跳 4 格；落在 ✈ 格直接飞 12 格。先判断飞格，再判断跳跃；跳后落在飞格再飞，每步最多跳一次、飞一次。起飞不跳，跳跃不得越进终点道。仅最终公共道落点撞回敌机，同色可叠机。'));
  rules.append(el('p', '', '掷骰后点飞机查看路线，再点“确认飞行”；虚线为跳跃或飞越，亮圈为最终落点。'));
  root.append(toolbar, teams, board, controls, choices, status, rules);
  wrap.replaceChildren(root);

  const over = () => Boolean(online?.result.over) && state.phase !== 'won';   // 联机时有人离开，本局提前结束
  const mine = () => state.turn === state.team && !over() && !waiting;
  const human = () => online ? mine() : mode === 'local' || state.turn === 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  const drawRoute = move => {
    route.replaceChildren();
    if (!move) return;
    let from = move.from;
    for (const progress of move.path) {
      const a = coordinate(move.player, from, move.plane), b = coordinate(move.player, progress, move.plane);
      const attributes = { x1: a[0] + .5, y1: a[1] + .5, x2: b[0] + .5, y2: b[1] + .5, stroke: COLORS[move.player], 'stroke-width': '.11', 'stroke-linecap': 'round' };
      if (from < 0 || Math.abs(progress - from) > 1) attributes['stroke-dasharray'] = '.18 .16';
      route.append(svg('line', attributes)); from = progress;
    }
    const target = coordinate(move.player, move.to, move.plane);
    route.append(svg('circle', { cx: target[0] + .5, cy: target[1] + .5, r: '.42', fill: 'none', stroke: '#fff', 'stroke-width': '.09' }));
  };
  const render = () => {
    teams.replaceChildren(); pieces.replaceChildren(); choices.replaceChildren();
    const preview = selected === null ? null : previewAeroplane(state, selected);
    drawRoute(preview || state.lastMove);
    state.planes.forEach((planes, player) => {
      const arrived = planes.filter(progress => progress === 57).length;
      const team = el('div', `aero-team aero-color-${player}${state.turn === player && state.phase !== 'won' ? ' active' : ''}`, `${AEROPLANE_TEAMS[player]} ${arrived}/4`);
      teams.append(team);
      planes.forEach((progress, plane) => {
        const legal = player === state.turn && state.legal.includes(plane) && human();
        const chip = el('button', `aero-plane aero-color-${player}${legal ? ' can-move' : ''}${selected === plane && player === state.turn ? ' selected' : ''}${progress === 57 ? ' arrived' : ''}`);
        chip.type = 'button'; chip.disabled = !legal;
        chip.dataset.player = player; chip.dataset.plane = plane;
        chip.setAttribute('aria-label', `${AEROPLANE_TEAMS[player]} ${plane + 1} 号飞机${progress === 57 ? '已到达' : progress < 0 ? '在机场' : progress >= 52 ? '终点道' : '公共道'}${legal ? '，可选择' : ''}`);
        const icon = svg('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' });
        icon.append(svg('path', { d: 'M21 3 15 21 11 14 3 10Z M11 14 21 3', fill: 'currentColor', stroke: 'currentColor', 'stroke-width': '1.5', 'stroke-linejoin': 'round' }));
        chip.append(icon, el('span', '', plane + 1));
        const point = coordinate(player, progress, plane);
        // Same-team stacks stay individually tappable without shifting their logical cell.
        const stack = planes.flatMap((value, index) => value === progress ? [index] : []);
        if (progress >= 0 && stack.length > 1) {
          const offset = OFFSETS[stack.indexOf(plane)];
          point[0] += offset[0] * .33; point[1] += offset[1] * .33;
          chip.classList.add('stacked');
        }
        place(chip, point);
        chip.addEventListener('click', () => { if (!alive) return; selected = plane; render(); });
        pieces.append(chip);
      });
    });
    if (state.phase === 'move' && human()) {
      state.legal.forEach(plane => {
        const choose = el('button', selected === plane ? 'selected' : '', `${plane + 1} 号${state.planes[state.turn][plane] < 0 ? '起飞' : '飞机'}`);
        choose.dataset.choose = plane;
        choose.addEventListener('click', () => { if (!alive) return; selected = plane; render(); });
        choices.append(choose);
      });
      const confirm = el('button', 'aero-confirm', '确认飞行 →');
      confirm.dataset.action = 'move'; confirm.disabled = !preview;
      confirm.addEventListener('click', () => {
        if (!alive || !human() || selected === null) return;
        if (online) { online.send({ type: 'move', plane: selected }); waiting = true; return render(); }
        if (moveAeroplane(state, selected)) { selected = null; render(); scheduleAi(); }
      });
      choices.append(confirm);
    }
    dice.disabled = !alive || state.phase !== 'roll' || !human();
    dice.textContent = state.dice === null ? '⚄' : ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][state.dice - 1];
    dice.setAttribute('aria-label', state.phase === 'roll' && human() ? '掷骰子' : `骰子 ${state.dice || '未掷'} 点`);
    turnLabel.textContent = state.phase === 'won' ? `${AEROPLANE_TEAMS[state.winner]}获胜！` : over() ? '本局已结束' : online ? `${AEROPLANE_TEAMS[state.turn]}${state.turn === state.team ? ' · 你的回合' : state.teams[state.turn] === null ? ' · 电脑思考中' : ' · 对手回合'}` : `${AEROPLANE_TEAMS[state.turn]}${human() ? '回合' : '思考中'}`;
    guidance.textContent = state.phase === 'won' ? '四架飞机全部到达终点' : preview ? `${selected + 1} 号 → ${preview.to === 57 ? '终点' : preview.to >= 52 ? `终点道 ${preview.to - 51}` : `公共道 ${aeroplaneCell(state.turn, preview.to) + 1}`}${preview.bonuses.includes('jump') ? ' · 跳 4' : ''}${preview.bonuses.includes('fly') ? ' · 飞 12' : ''}` : state.phase === 'move' ? '选择飞机，亮圈预览终点' : human() ? '点骰子开始飞行' : online ? '等待其他队伍……' : '稍等，电脑正在飞行';
    status.textContent = over() ? '有人离开了，这一局结束。' : state.message;
    onHud(`飞行棋 · ${turnLabel.textContent} · ${state.moves} 步`);
  };
  const scheduleAi = () => {
    cancel();
    if (online || !alive || human() || state.phase === 'won') return;
    timer = setTimeout(() => {
      timer = 0;
      if (!alive || human() || state.phase === 'won') return;
      if (state.phase === 'roll') rollAeroplane(state, random);
      else {
        const candidate = state.legal.map(plane => previewAeroplane(state, plane)).sort((a, b) =>
          (b.to === 57 ? 1000 : 0) + b.captured.length * 100 + (b.from < 0 ? 30 : b.to) -
          ((a.to === 57 ? 1000 : 0) + a.captured.length * 100 + (a.from < 0 ? 30 : a.to)))[0];
        if (candidate) moveAeroplane(state, candidate.plane);
      }
      selected = null; render(); scheduleAi();
    }, state.phase === 'roll' ? 650 : 800);
  };
  const reset = () => {
    if (!alive || online) return;
    cancel(); state = createAeroplane(); selected = null; render();
  };
  dice.addEventListener('click', () => {
    if (!alive || !human()) return;
    if (online) { online.send({ type: 'roll' }); waiting = true; return render(); }
    if (rollAeroplane(state, random)) { selected = null; render(); scheduleAi(); }
  });
  restartButton.addEventListener('click', reset);
  modeSelect.addEventListener('change', () => { mode = modeSelect.value; reset(); });
  // 等服务端确认前不再接受第二次点击（连点会白白吃一条「还没轮到你」）；被拒绝时也要放开。
  const offs = online ? [online.on('state', (payload) => { state = payload.view; selected = null; waiting = false; render(); }), online.on('reject', () => { waiting = false; render(); })] : [];
  render();
  return { restart: reset, destroy() { alive = false; offs.forEach((off) => off()); cancel(); root.remove(); }, get state() { return state; } };
}
