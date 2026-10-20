// 纸牌接龙（ARCADE 30）的画面：上面一排是牌堆、翻牌区和四个收牌区，下面七列牌桌。
// 点一张牌会自动挪到最合适的地方；也可以按住拖到想放的那一列。每张牌有自己的显示位置，挪动时滑过去。
import { RANKS, SUITS, autoStep, bestTarget, canAutoFinish, canMove, cardsAt, deal, drawStock, findHint, isRed, isWon, moveCards, undo } from './solitaire-core.js';
import { button, canvasGame, inRect, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const CW = 46;
const CH = 64;
const STEP = (W - 8) / 7;
const colX = (c) => 4 + c * STEP + (STEP - CW) / 2;
const TOP_Y = 40;
const TAB_Y = 118;
const SAVE = store('pao-solitaire');
const UNDO_BTN = { x: 60, y: 588, w: 110, h: 40 };
const HINT_BTN = { x: 190, y: 588, w: 110, h: 40 };
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const idOf = (card) => card.suit * 13 + card.rank;

function drawCard(ctx, card, x, y, { glow = '', dim = false } = {}) {
  ctx.save();
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
  roundRect(ctx, x, y, CW, CH, 6);
  if (!card.up) {
    const g = ctx.createLinearGradient(x, y, x + CW, y + CH);
    g.addColorStop(0, '#9b6bff'); g.addColorStop(1, '#5b3cc4');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5; ctx.strokeStyle = '#ffffffcc'; ctx.stroke();
    roundRect(ctx, x + 5, y + 5, CW - 10, CH - 10, 4);
    ctx.strokeStyle = '#ffffff55'; ctx.stroke();
    text(ctx, '✦', x + CW / 2, y + CH / 2, { size: 16, color: '#ffffffaa' });
  } else {
    ctx.fillStyle = dim ? '#d9d4e8' : '#fffdf8';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = glow ? 2.5 : 1; ctx.strokeStyle = glow || '#c9c2dc'; ctx.stroke();
    const color = isRed(card) ? '#e0344f' : '#232946';
    text(ctx, RANKS[card.rank], x + 4, y + 11, { size: card.rank === 10 ? 12 : 14, align: 'left', color, weight: 900 });
    text(ctx, SUITS[card.suit], x + CW - 5, y + 11, { size: 12, align: 'right', color });
    text(ctx, SUITS[card.suit], x + CW / 2, y + CH * 0.62, { size: 26, color });
  }
  ctx.restore();
}

export function mountSolitaire(wrap, { onHud = () => {}, onResult = null, onButtons = () => {}, onBoard = () => {} } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '纸牌接龙游戏画布', game: 'solitaire' });
  const saved = SAVE.get(null);
  let draw = saved?.draw === 3 ? 3 : 1;
  let game = null;
  let elapsed = 0;
  let startedAt = 0;
  let shown = new Map();
  let press = null;
  let drag = null;
  let hint = null;
  let finishing = 0;
  let done = false;

  const time = () => elapsed + (startedAt ? (performance.now() - startedAt) / 1000 : 0);
  const hud = () => onHud(`⏱ ${mmss(time())} · ${game.moves} 步`);
  const labels = () => onButtons({ mode: draw === 1 ? '抽一张' : '抽三张' });
  function persist() {
    if (done) return SAVE.set({ draw });
    SAVE.set({ draw, elapsed: time(), game: { ...game, history: [] } });
  }
  function fresh(nextDraw = draw) {
    draw = nextDraw;
    game = deal(draw, Date.now());
    elapsed = 0; startedAt = 0; done = false;
    begin();
  }
  function begin() {
    shell.closeCard();
    clearTimeout(finishing);
    press = null; drag = null; hint = null;
    shown = new Map();
    labels();
    onBoard();
    persist();
    hud();
    shell.poke(400);
  }
  function touch() {
    if (!startedAt && !done) startedAt = performance.now();
    hint = null;
    persist();
    hud();
    shell.poke(500);
    if (isWon(game)) return win();
    if (canAutoFinish(game)) { clearTimeout(finishing); finishing = setTimeout(autoFinish, 260); }
  }
  function autoFinish() {
    if (!shell.alive || isWon(game)) return;
    if (autoStep(game)) { shell.poke(300); hud(); if (isWon(game)) return touch(); finishing = setTimeout(autoFinish, 90); }
  }

  // ---- layout ----
  const foundX = (f) => colX(3 + f);
  function tabOffsets(col) {
    const down = col.filter((c) => !c.up).length, up = col.length - down;
    let fu = 20, fd = 9;
    const room = UNDO_BTN.y - 10 - TAB_Y - CH;
    const need = down * fd + Math.max(0, up - 1) * fu;
    if (need > room) { const k = room / need; fu *= k; fd *= k; }
    return { fu, fd };
  }
  // 每张牌应该在的位置
  function targets() {
    const out = new Map();
    game.stock.forEach((card, i) => out.set(idOf(card), { x: colX(0), y: TOP_Y - Math.min(i, 6) * 0.4, card, z: i }));
    const fan = game.waste.slice(-draw);
    game.waste.forEach((card, i) => {
      const k = fan.indexOf(card);
      out.set(idOf(card), { x: colX(1) + (k > 0 ? k * 16 : 0), y: TOP_Y, card, z: 60 + i });
    });
    game.foundations.forEach((pile, f) => pile.forEach((card, i) => out.set(idOf(card), { x: foundX(f), y: TOP_Y, card, z: 120 + i })));
    game.tableau.forEach((col, c) => {
      const { fu, fd } = tabOffsets(col);
      let y = TAB_Y;
      col.forEach((card, i) => { out.set(idOf(card), { x: colX(c), y, card, z: 200 + c * 30 + i, col: c, index: i }); y += card.up ? fu : fd; });
    });
    return out;
  }

  // ---- input ----
  function hitTest(p) {
    const map = targets();
    let best = null;
    for (const t of map.values()) {
      if (p.x < t.x || p.x > t.x + CW || p.y < t.y || p.y > t.y + CH) continue;
      if (!best || t.z > best.z) best = t;
    }
    if (!best) {
      if (p.y >= TOP_Y && p.y <= TOP_Y + CH && p.x >= colX(0) && p.x <= colX(0) + CW) return { stock: true };
      return null;
    }
    if (game.stock.includes(best.card)) return { stock: true };
    if (game.waste.at(-1) === best.card) return { from: { from: 'waste' } };
    const f = game.foundations.findIndex((pile) => pile.at(-1) === best.card);
    if (f >= 0) return { from: { from: 'found', pile: f } };
    if (best.col !== undefined) return { from: { from: 'tab', pile: best.col, index: best.index } };
    return null;
  }
  function act(from, to) {
    if (!to || !moveCards(game, from, to)) return false;
    touch();
    return true;
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    if (shell.cardOpen) return;
    const p = shell.point(event);
    if (inRect(p, UNDO_BTN)) return api.undo();
    if (inRect(p, HINT_BTN)) return api.hint();
    if (done) return;
    const hit = hitTest(p);
    if (!hit) return;
    if (hit.stock) { if (drawStock(game)) touch(); return; }
    const cards = cardsAt(game, hit.from);
    if (!cards.length) return;
    const first = targets().get(idOf(cards[0]));
    press = { from: hit.from, cards, x: p.x, y: p.y, dx: p.x - first.x, dy: p.y - first.y };
    try { shell.canvas.setPointerCapture(event.pointerId); } catch { /* synthetic */ }
  });
  shell.on('pointermove', (event) => {
    if (!press) return;
    const p = shell.point(event);
    if (!drag && Math.hypot(p.x - press.x, p.y - press.y) < 7) return;
    drag = { ...press, px: p.x, py: p.y };
    shell.poke();
  });
  shell.on('pointerup', (event) => {
    if (!press) return;
    const p = shell.point(event);
    const wasDrag = drag, from = press.from;
    press = null; drag = null;
    if (!wasDrag) { act(from, bestTarget(game, from)); shell.poke(400); return; }
    const cx = p.x - wasDrag.dx + CW / 2, cy = p.y - wasDrag.dy + CH / 2;
    let to = null;
    if (cy < TAB_Y - 8) { const f = [0, 1, 2, 3].find((k) => Math.abs(foundX(k) + CW / 2 - cx) < STEP / 2); if (f !== undefined) to = { to: 'found', pile: f }; }
    else { const c = Math.max(0, Math.min(6, Math.floor((cx - 4) / STEP))); to = { to: 'tab', pile: c }; }
    if (!to || !canMove(game, from, to)) to = null;
    act(from, to);
    shell.poke(400);
  });
  shell.on('pointercancel', () => { press = null; drag = null; shell.poke(300); });

  function win() {
    done = true;
    const t = time();
    elapsed = t; startedAt = 0;
    persist();
    setTimeout(() => {
      if (!shell.alive) return;
      const { note } = shell.card({ title: '全部收齐！', lines: [`抽${draw === 1 ? '一' : '三'}张 · 用时 ${mmss(t)} · ${game.moves} 步`], buttons: [{ label: '再来一局', action: () => fresh() }], tone: 'won' });
      postScore(onResult, `solitaire-${draw}`, Math.round(t * 10), note);
    }, 600);
  }

  // ---- drawing ----
  shell.render = (ctx, now) => {
    text(ctx, `⏱ ${mmss(time())}`, 14, 18, { size: 13, align: 'left', color: '#c9cdf0', font: '"DM Mono", monospace' });
    text(ctx, `${game.moves} 步${game.draw === 3 ? ' · 抽三张' : ''}`, W - 14, 18, { size: 12, align: 'right', color: '#c9cdf0', weight: 700 });
    // 空位
    const slot = (x, y, mark = '') => {
      roundRect(ctx, x, y, CW, CH, 6);
      ctx.strokeStyle = '#ffffff33'; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); ctx.stroke(); ctx.setLineDash([]);
      if (mark) text(ctx, mark, x + CW / 2, y + CH / 2, { size: 18, color: '#ffffff40' });
    };
    slot(colX(0), TOP_Y, game.waste.length ? '↻' : '');
    for (let f = 0; f < 4; f += 1) slot(foundX(f), TOP_Y, 'A');
    for (let c = 0; c < 7; c += 1) slot(colX(c), TAB_Y, 'K');
    const map = targets();
    const dragging = new Set(drag ? drag.cards.map(idOf) : []);
    let moving = false;
    const list = [...map.values()].sort((a, b) => a.z - b.z);
    const hintIds = new Set();
    if (hint && now < hint.until && hint.from) for (const c of cardsAt(game, hint.from)) hintIds.add(idOf(c));
    for (const t of list) {
      const id = idOf(t.card);
      if (dragging.has(id)) continue;
      const cur = shown.get(id) ?? { x: t.x, y: t.y };
      const nx = cur.x + (t.x - cur.x) * 0.35, ny = cur.y + (t.y - cur.y) * 0.35;
      const settle = Math.abs(t.x - nx) + Math.abs(t.y - ny) < 0.6;
      const pos = settle ? { x: t.x, y: t.y } : { x: nx, y: ny };
      if (!settle) moving = true;
      shown.set(id, pos);
      // 牌堆里只画最上面几张
      if (game.stock.includes(t.card) && t.z < game.stock.length - 3) continue;
      drawCard(ctx, t.card, pos.x, pos.y, { glow: hintIds.has(id) && Math.sin(now / 110) > -0.3 ? '#ffd543' : '' });
    }
    if (hint?.draw && now < hint.until && Math.sin(now / 110) > -0.3) { roundRect(ctx, colX(0) - 2, TOP_Y - 2, CW + 4, CH + 4, 8); ctx.strokeStyle = '#ffd543'; ctx.lineWidth = 3; ctx.stroke(); }
    if (drag) {
      drag.cards.forEach((card, i) => {
        const x = drag.px - drag.dx, y = drag.py - drag.dy + i * 20;
        shown.set(idOf(card), { x, y });
        drawCard(ctx, card, x, y, { glow: '#8e7bff' });
      });
    }
    button(ctx, UNDO_BTN, '↶ 撤销', { off: !game.history.length || done });
    button(ctx, HINT_BTN, '💡 提示', { off: done });
    if (moving || (hint && now < hint.until)) shell.poke(16);
  };
  const timer = setInterval(() => { if (startedAt && !done) { hud(); shell.poke(); } }, 1000);

  if (saved?.game?.tableau) { game = saved.game; game.history = []; draw = game.draw; elapsed = saved.elapsed || 0; begin(); } else fresh(draw);
  const api = {
    get state() { return game; },
    get board() { return `solitaire-${draw}`; },
    restart() { fresh(); },
    mode() { fresh(draw === 1 ? 3 : 1); },
    undo() { if (!done && undo(game)) { persist(); hud(); shell.poke(400); } },
    hint() {
      if (done || shell.cardOpen) return;
      const h = findHint(game);
      if (!h) return shell.toast('没有能走的了，点「重新开始」换一局', 1600);
      hint = { ...h, until: performance.now() + 1800 };
      shell.poke(1850);
    },
    // 测试用：直接执行一步、点一张牌的位置
    act: (from, to) => act(from, to ?? bestTarget(game, from)),
    draw: () => { if (drawStock(game)) touch(); },
    load(next) { game = next; elapsed = 0; startedAt = 0; done = false; begin(); },
    locate(id) { const t = targets().get(id); return shell.page(t.x + CW / 2, t.y + 10); },
    destroy() { if (!done) persist(); clearTimeout(finishing); clearInterval(timer); shell.destroy(); }
  };
  return api;
}
