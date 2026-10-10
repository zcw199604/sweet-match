import { aiStep, bid, classify, comparePlays, createGame, labelOf, pass, playCards, suggestedMove, suitOf } from './doudizhu-core.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const button = (text, action, handler) => {
  const node = el('button', '', text); node.type = 'button'; node.dataset.action = action;
  node.addEventListener('click', handler); return node;
};

export function mountDoudizhu(wrap, { onHud = () => {} } = {}) {
  let alive = true, timer = null, epoch = 0, state = createGame(), selected = new Set();
  const root = el('div', 'classic-game doudizhu-game');
  const head = el('div', 'dd-head'), title = el('b', '', '🃏 糖果牌桌'), bottom = el('div', 'dd-bottom');
  head.append(title, bottom);
  const opponents = el('div', 'dd-opponents');
  const seats = [1, 2].map((index) => {
    const seat = el('div', 'dd-seat'), avatar = el('span', `dd-avatar dd-avatar-${index}`, index === 1 ? '🍬' : '🍭');
    const name = el('b', 'dd-seat-name'), meta = el('span', 'dd-seat-meta'), last = el('span', 'dd-seat-last');
    const info = el('div', 'dd-seat-info'); info.append(name, meta, last); seat.append(avatar, info); opponents.append(seat);
    return { seat, name, meta, last };
  });
  const table = el('div', 'dd-table'), tableLabel = el('span', 'dd-table-label'), tableCards = el('div', 'dd-table-cards');
  table.append(tableLabel, tableCards);
  const message = el('div', 'dd-message'); message.setAttribute('role', 'status'); message.setAttribute('aria-live', 'polite');
  const myLabel = el('div', 'dd-my-label'), hand = el('div', 'dd-hand'); hand.setAttribute('aria-label', '你的手牌');
  const actions = el('div', 'classic-tools dd-actions');
  const bidButtons = [0, 1, 2, 3].map((score) => button(score ? `${score} 分` : '不叫', `bid-${score}`, () => {
    if (!alive) return;
    act(bid(state, 0, score));
  }));
  const hint = button('💡 提示', 'hint', () => {
    if (!alive || state.current !== 0 || state.phase !== 'playing') return;
    const move = suggestedMove(state, 0);
    selected = new Set(move?.cards ?? []);
    render(); message.textContent = move ? `推荐${move.shape.label}，点击出牌。` : '没有更大的同型牌，可以点「不要」。';
  });
  const submit = button('出牌', 'play', () => { if (alive) act(playCards(state, 0, [...selected])); });
  submit.className = 'dd-primary';
  const skip = button('不要', 'pass', () => { if (alive) act(pass(state, 0)); });
  const clear = button('清空', 'clear', () => { if (!alive) return; selected.clear(); render(); });
  const again = button('再来一局', 'restart', restart);
  actions.append(...bidButtons, hint, clear, skip, submit, again);
  const guide = el('details', 'dd-guide'), summary = el('summary', '', '玩法与牌型');
  guide.append(summary, el('p', '', '点手牌选中，再点出牌。叫分最高者拿 3 张底牌成为地主，地主先出；农民两人合作。两家都不要后，最后出牌的人重新领出。任一农民出完，农民一起赢。'), el('p', '', '支持单张、对子、三带一/二、顺子（至少 5 张）、连对（至少 3 对）、飞机及带单/带对、四带二/两对、炸弹和王炸。2 与王不能进顺子或飞机。飞机单翅可带对子，不能使用机身点数。'));
  root.append(head, opponents, table, message, myLabel, hand, actions, guide); wrap.replaceChildren(root);

  function showCard(id, className, interactive = false) {
    const node = el(interactive ? 'button' : 'span', `dd-card ${className}`);
    if (interactive) node.type = 'button';
    node.classList.toggle('red', id < 52 && id % 4 >= 2 || id === 53);
    node.classList.toggle('joker', id >= 52);
    node.append(el('b', 'dd-rank', labelOf(id)), el('span', 'dd-suit', suitOf(id)));
    node.setAttribute('aria-label', `${suitOf(id)}${labelOf(id)}`);
    return node;
  }
  function render() {
    if (!alive) return;
    const bidding = state.phase === 'bidding', finished = state.phase === 'finished', myTurn = state.current === 0 && !finished;
    root.dataset.phase = state.phase;
    bottom.replaceChildren();
    const bottomText = el('span', 'dd-bottom-label', '底牌'); bottom.append(bottomText);
    state.bottom.forEach((id) => bottom.append(bidding ? el('span', 'dd-card-back', '✦') : showCard(id, 'mini')));
    seats.forEach((view, i) => {
      const index = i + 1, seat = state.players[index], role = state.landlord === null ? '等待叫分' : state.landlord === index ? '👑 地主' : '🌾 农民';
      view.name.textContent = `${seat.name} · ${role}`;
      view.meta.textContent = `${seat.cards.length} 张手牌${state.current === index && !finished ? ' · 思考中…' : ''}`;
      view.last.textContent = seat.last?.text ?? '准备好了';
      view.seat.classList.toggle('active', state.current === index && !finished);
      view.seat.classList.toggle('landlord', state.landlord === index);
    });
    tableCards.replaceChildren();
    if (finished) {
      const won = state.landlord === 0 ? state.winner === 0 : state.winner !== state.landlord;
      tableLabel.textContent = won ? '🎉 你赢了！' : '🍀 下局再来！';
      tableCards.append(el('b', 'dd-result', `${state.winner === state.landlord ? '地主' : '农民'}胜利 · ${state.highBid} 分 × ${state.multiplier}`));
    } else if (state.table) {
      tableLabel.textContent = `${state.players[state.table.player].name} · ${state.table.shape.label}`;
      state.table.cards.forEach((id) => tableCards.append(showCard(id, 'mini')));
    } else {
      tableLabel.textContent = bidding ? '叫分最高者成为地主' : `${state.players[state.current].name}领出`;
      tableCards.append(el('span', 'dd-table-empty', bidding ? '17 张手牌 + 3 张底牌' : '单张、顺子、飞机…选好就出！'));
    }
    message.textContent = state.message;
    myLabel.textContent = `你 · ${state.landlord === null ? '等待叫分' : state.landlord === 0 ? '👑 地主' : '🌾 农民'} · ${state.players[0].cards.length} 张${myTurn ? ' · 轮到你' : ''}`;
    hand.replaceChildren();
    state.players[0].cards.slice().reverse().forEach((id) => {
      const node = showCard(id, 'hand-card', true); node.dataset.card = String(id);
      node.classList.toggle('selected', selected.has(id)); node.setAttribute('aria-pressed', String(selected.has(id)));
      node.disabled = !myTurn || bidding;
      node.addEventListener('click', () => {
        if (!alive || state.current !== 0 || state.phase !== 'playing') return;
        if (selected.has(id)) selected.delete(id); else selected.add(id);
        render();
        const shape = classify([...selected]);
        message.textContent = selected.size ? shape ? `已选${shape.label}${comparePlays(shape, state.table?.shape) ? '，可以出牌。' : '，还压不过上家。'}` : '已选牌暂不组成合法牌型。' : state.message;
      });
      hand.append(node);
    });
    bidButtons.forEach((node, score) => { node.hidden = !bidding; node.disabled = !myTurn || score > 0 && score <= state.highBid; });
    [hint, clear, skip, submit].forEach((node) => { node.hidden = bidding || finished; node.disabled = !myTurn; });
    clear.disabled = !myTurn || !selected.size;
    skip.disabled = !myTurn || !state.table;
    submit.disabled = !myTurn || !selected.size;
    again.hidden = !finished;
    onHud(finished ? state.message : bidding ? '叫分选地主' : `${state.players[state.current].name}的回合 · ${state.highBid} 分 × ${state.multiplier}`);
  }
  function schedule() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (!alive || state.current === 0 || state.phase === 'finished') return;
    const atEpoch = epoch;
    timer = setTimeout(() => {
      timer = null;
      if (!alive || atEpoch !== epoch) return;
      aiStep(state); selected.clear(); render(); schedule();
    }, 650);
  }
  function act(result) {
    if (!result.ok) { message.textContent = result.reason; return; }
    selected.clear(); render(); schedule();
  }
  function restart() {
    if (!alive) return;
    epoch += 1; if (timer !== null) clearTimeout(timer); timer = null;
    state = createGame(); selected.clear(); render(); schedule();
  }
  render();
  return {
    restart,
    destroy() { alive = false; epoch += 1; if (timer !== null) clearTimeout(timer); timer = null; root.remove(); },
    get state() { return state; }
  };
}
