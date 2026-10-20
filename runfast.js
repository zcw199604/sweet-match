// 跑得快（ARCADE 26）的画面：你对两个电脑，上面两个座位，中间是桌面，下面是你的 16 张手牌。
// 点牌选中（再点放下），点「出牌」；有大必压，所以压得过时「不要」是灰的。规则都在 runfast-core.js。
import { NAMES, SUIT, aiMove, canPass, classify, createRound, hintMove, labelOf, legalMoves, pass, play, rankOf, suitOf } from './runfast-core.js';
import { button, canvasGame, inRect, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const CW = 46;
const CH = 66;
const HAND_Y = 452;
const BTN = { hint: { x: 22, y: 566, w: 96, h: 44 }, pass: { x: 132, y: 566, w: 96, h: 44 }, play: { x: 242, y: 566, w: 96, h: 44 } };
const SEAT = { 1: { x: 196, y: 12 }, 2: { x: 14, y: 12 } };
const SAVE = store('pao-runfast');
const red = (id) => suitOf(id) === 1 || suitOf(id) === 3;

function drawCard(ctx, id, x, y, w = CW, h = CH, { lift = false, dim = false } = {}) {
  ctx.save();
  roundRect(ctx, x, y + 2, w, h, 6); ctx.fillStyle = '#00000033'; ctx.fill();
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = lift ? '#fff6c8' : dim ? '#ddd7ea' : '#fffdf8'; ctx.fill();
  ctx.lineWidth = lift ? 2 : 1; ctx.strokeStyle = lift ? '#ffb000' : '#c9c2dc'; ctx.stroke();
  const color = red(id) ? '#e0344f' : '#232946', s = w / CW;
  text(ctx, labelOf(id), x + 4 * s, y + 12 * s, { size: (labelOf(id) === '10' ? 13 : 16) * s, align: 'left', color, weight: 900 });
  text(ctx, SUIT[suitOf(id)], x + 5 * s, y + 28 * s, { size: 13 * s, align: 'left', color });
  if (w >= 40) text(ctx, SUIT[suitOf(id)], x + w - 12 * s, y + h - 14 * s, { size: 20 * s, color });
  ctx.restore();
}
function drawBack(ctx, x, y, w = 22, h = 30) {
  roundRect(ctx, x, y, w, h, 4);
  const g = ctx.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#9b6bff'); g.addColorStop(1, '#5b3cc4');
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
}

export function mountRunfast(wrap, { onHud = () => {} } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '跑得快游戏画布', game: 'runfast' });
  const saved = SAVE.get({ scores: [0, 0, 0], round: 0, leader: null });
  let state = null;
  let picked = new Set();
  let message = '';
  let aiTimer = 0;

  const hud = () => onHud(`第 ${state.round} 局 · 你的总分 ${state.scores[0]}`);
  function deal(fresh = false) {
    clearTimeout(aiTimer);
    shell.closeCard();
    const prev = fresh ? { scores: [0, 0, 0], round: 0, leader: null } : (state ? { scores: state.scores, round: state.round, leader: state.winner } : saved);
    state = createRound({ seed: Date.now(), leader: prev.leader, scores: prev.scores, round: prev.round + 1 });
    picked = new Set();
    message = state.current === 0 ? (state.mustSpade3 ? '你有 ♠3，第一手要带上它' : '你先出') : `${NAMES[state.current]}先出`;
    SAVE.set({ scores: state.scores, round: state.round - 1, leader: prev.leader });
    hud();
    shell.poke();
    schedule();
  }
  function schedule() {
    clearTimeout(aiTimer);
    if (state.winner !== null || state.current === 0) return;
    aiTimer = setTimeout(() => {
      if (!shell.alive || state.winner !== null || state.current === 0) return;
      const p = state.current, move = aiMove(state, p);
      const result = move ? play(state, p, move.cards) : pass(state, p);
      message = move ? `${NAMES[p]}出了${move.shape.label}` : `${NAMES[p]}要不起`;
      after(result);
    }, 750);
  }
  function after(result) {
    hud();
    shell.poke(300);
    if (result?.finished) return setTimeout(() => { if (shell.alive) over(); }, 700);
    if (state.current === 0) {
      const leading = !state.table;
      message = leading ? '轮到你领出' : canPass(state, 0) ? '要不起，点「不要」' : `轮到你：要压过${state.table.shape.label}（有大必压）`;
      if (state.hands[1].length === 1) message += ' · 下家报单！';
    }
    schedule();
  }
  function over() {
    const d = state.delta, w = state.winner;
    SAVE.set({ scores: state.scores, round: state.round, leader: w });
    const lines = [w === 0 ? '你先出完了！' : `${NAMES[w]}先出完了`];
    lines.push(NAMES.map((n, p) => `${n} ${d[p] >= 0 ? '+' : ''}${d[p]}`).join(' · '));
    lines.push(`总分：${NAMES.map((n, p) => `${n} ${state.scores[p]}`).join(' · ')}`);
    shell.card({ title: w === 0 ? '这局你赢了' : '这局输了', lines, buttons: [{ label: '下一局', action: () => deal() }], tone: w === 0 ? 'won' : 'lost' });
    hud();
  }

  // ---- 手牌位置 ----
  const handLayout = () => {
    const hand = state.hands[0], n = hand.length;
    const step = n > 1 ? Math.min(CW + 4, (W - 20 - CW) / (n - 1)) : 0;
    const x0 = (W - (step * (n - 1) + CW)) / 2;
    return hand.map((id, i) => ({ id, x: x0 + i * step, y: HAND_Y - (picked.has(id) ? 16 : 0), w: i === n - 1 ? CW : step }));
  };
  function act(key) {
    if (state.winner !== null || shell.cardOpen) return;
    if (state.current !== 0) return shell.toast('还没轮到你', 900, 410);
    if (key === 'hint') {
      const move = hintMove(state, 0);
      picked = new Set(move?.cards ?? []);
      message = move ? `推荐出${move.shape.label}` : '要不起，点「不要」';
      return shell.poke();
    }
    if (key === 'pass') {
      const result = pass(state, 0);
      if (!result.ok) { message = result.reason; return shell.poke(); }
      picked = new Set();
      message = '你不要';
      return after(result);
    }
    const ids = [...picked];
    const result = play(state, 0, ids);
    if (!result.ok) { message = result.reason; return shell.poke(); }
    picked = new Set();
    message = `你出了${result.shape.label}`;
    after(result);
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    if (shell.cardOpen) return;
    const p = shell.point(event);
    for (const key of Object.keys(BTN)) if (inRect(p, BTN[key])) return act(key);
    // 牌是叠着的：从最右边（最上面）那张往左找
    const card = handLayout().reverse().find((c) => p.x >= c.x && p.x <= c.x + CW && p.y >= c.y && p.y <= c.y + CH);
    if (!card) return;
    if (picked.has(card.id)) picked.delete(card.id); else picked.add(card.id);
    shell.poke();
  });

  shell.render = (ctx) => {
    // 两个电脑座位
    for (const p of [2, 1]) {
      const s = SEAT[p], active = state.current === p && state.winner === null;
      roundRect(ctx, s.x, s.y, 150, 78, 14);
      ctx.fillStyle = active ? '#58d4de26' : '#ffffff0d'; ctx.fill();
      ctx.lineWidth = active ? 2 : 1; ctx.strokeStyle = active ? '#58d4de' : '#ffffff1f'; ctx.stroke();
      text(ctx, p === 1 ? '🍬' : '🍭', s.x + 24, s.y + 28, { size: 26, font: 'system-ui, "Apple Color Emoji", sans-serif' });
      text(ctx, NAMES[p], s.x + 48, s.y + 20, { size: 14, align: 'left' });
      text(ctx, `${state.scores[p]} 分`, s.x + 140, s.y + 20, { size: 11, align: 'right', color: '#c9cdf0', weight: 700 });
      drawBack(ctx, s.x + 48, s.y + 36);
      const n = state.hands[p].length;
      text(ctx, `× ${n}`, s.x + 78, s.y + 52, { size: 15, align: 'left', color: n === 1 ? '#ff5d80' : '#fff' });
      if (n === 1) text(ctx, '报单！', s.x + 140, s.y + 52, { size: 12, align: 'right', color: '#ff5d80' });
      const last = state.last[p];
      if (last && !last.cards.length) text(ctx, last.text, s.x + 75, s.y + 98, { size: 14, color: '#ffd543' });
    }
    // 桌面
    roundRect(ctx, 16, 128, W - 32, 196, 60);
    ctx.fillStyle = '#ffffff08'; ctx.fill();
    if (state.table) {
      const { cards, shape, player } = state.table;
      text(ctx, `${NAMES[player]} · ${shape.label}`, W / 2, 152, { size: 13, color: '#ffd543' });
      const w = 36, h = 52, step = Math.min(w + 3, (W - 60 - w) / Math.max(1, cards.length - 1));
      const x0 = (W - (step * (cards.length - 1) + w)) / 2;
      cards.forEach((id, i) => drawCard(ctx, id, x0 + i * step, 186, w, h));
    } else text(ctx, state.winner === null ? `${NAMES[state.current]}领出` : '', W / 2, 220, { size: 14, color: '#b9bde6' });
    if (state.last[0] && !state.last[0].cards.length) text(ctx, state.last[0].text, W / 2, 300, { size: 14, color: '#ffd543' });
    text(ctx, message, W / 2, 352, { size: 13, color: '#e7e9ff', weight: 700 });
    // 选中的牌是什么牌型
    if (picked.size) {
      const shape = classify([...picked], picked.size === state.hands[0].length);
      text(ctx, shape ? `已选：${shape.label}` : '已选的牌凑不成牌型', W / 2, 400, { size: 12, color: shape ? '#44c986' : '#ff8fa3' });
    }
    // 手牌
    for (const c of handLayout()) drawCard(ctx, c.id, c.x, c.y, CW, CH, { lift: picked.has(c.id) });
    const mine = state.current === 0 && state.winner === null;
    button(ctx, BTN.hint, '💡 提示', { off: !mine });
    button(ctx, BTN.pass, '不要', { off: !mine || !canPass(state, 0) });
    button(ctx, BTN.play, '出牌', { off: !mine || !picked.size, color: mine && picked.size ? '#ff5d80' : '#ffffff1c' });
  };

  deal();
  return {
    get state() { return state; },
    restart() {
      if (state.winner === null && state.log.length && !window.confirm('重新开始会清零三家的总分，确定吗？')) return;
      deal(true);
    },
    act,
    pick(ids) { picked = new Set(ids); shell.poke(); },
    moves: () => legalMoves(state, 0),
    rankOf,
    locate(id) { const c = handLayout().find((x) => x.id === id); return shell.page(c.x + 10, c.y + 30); },
    destroy() { clearTimeout(aiTimer); shell.destroy(); }
  };
}
