// 空中大厨: the view. One 2D canvas seen from above: the score plaques on top, the cabin with its rows of
// passengers and their order bubbles, the aisle the chef walks along, and the galley at the bottom with the
// cart and the six stations. skychef-core.js runs the flight; this module draws it, turns taps into queued
// actions, and plays the events back as floating coins, moods and toasts.
import { callAt, createStage, discard, DISHES, outcome, rowOf, SEATS_PER_ROW, SKY, slotPhase, stageConfig, STAGES, STATION_ORDER, STATIONS, tapSeat, tapStation, tick } from './skychef-core.js';

const LW = 360;
const LH = 600;
const STORE = { best: 'pao-skychef-best', save: 'pao-skychef-save' };
const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const calm = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// ---- layout (logical px) ----
const CABIN = { x: 10, y: 50, w: 340, h: 356, top: 72, bottom: 396 };
const AISLE = 180;
const COLX = [52, 114, 246, 308]; // seat centres, left window to right window
const SEAT_W = 58;
const GALLEY_Y = 412;
const CART = { x: 82, y: 418, slot: 44, gap: 6, h: 34 };
const STATION_BOX = STATION_ORDER.map((id, i) => ({ id, x: 12 + (i % 3) * 114, y: 460 + Math.floor(i / 3) * 70, w: 108, h: 64 }));
const pitchOf = (rows) => Math.min(66, (CABIN.bottom - CABIN.top) / rows);
const rowY = (rows, row) => CABIN.bottom - pitchOf(rows) * (row + 0.5);
function chefY(rows, pos) {
  const first = rowY(rows, 0);
  return pos <= 1 ? GALLEY_Y - 6 + (first - GALLEY_Y + 6) * pos : first - (pos - 1) * pitchOf(rows);
}
const unlockRoute = (id) => [0, 0, 1, 2, 3, 4][STATION_ORDER.indexOf(id)] + 1;

// ---- art ----
const ACCENT = { juice: '#ff9f2e', coffee: '#9c6a46', toast: '#e9b65a', cake: '#ff7fae', noodle: '#3fa6ff', meal: '#e0663c' };
const SKIN = ['#ffd9b8', '#f1c09a', '#d99e72', '#a8704a', '#ffe6d2'];
const HAIR = ['#3a2a22', '#6b4226', '#e8c15a', '#c2502e', '#2b2f4a', '#9a9aa8', '#f08ab8', '#5b8cff'];

// One dish centred on (x, y), about `s` px across.
function drawDish(ctx, dish, x, y, s, { alpha = 1 } = {}) {
  const u = s / 24;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(u, u);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const blob = (fill, path) => { ctx.beginPath(); path(); ctx.fillStyle = fill; ctx.fill(); };
  switch (dish) {
    case 'juice':
      blob('#ffffffaa', () => { ctx.moveTo(-7, -10); ctx.lineTo(7, -10); ctx.lineTo(5, 11); ctx.lineTo(-5, 11); ctx.closePath(); });
      blob('#ff9f2e', () => { ctx.moveTo(-6.3, -5); ctx.lineTo(6.3, -5); ctx.lineTo(4.5, 10); ctx.lineTo(-4.5, 10); ctx.closePath(); });
      blob('#ffd08a', () => { ctx.ellipse(-2, 0, 1.4, 4, 0, 0, Math.PI * 2); });
      ctx.strokeStyle = '#ff4f7b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(2, 4); ctx.lineTo(4, -13); ctx.lineTo(8, -13); ctx.stroke();
      blob('#ffe066', () => { ctx.arc(-6, -10, 4, 0, Math.PI * 2); });
      break;
    case 'coffee':
      blob('#b8c2dc', () => { ctx.ellipse(0, 8, 11, 3.5, 0, 0, Math.PI * 2); });
      blob('#2fb7bf', () => { ctx.moveTo(-8, -3); ctx.lineTo(8, -3); ctx.quadraticCurveTo(8, 8, 0, 8); ctx.quadraticCurveTo(-8, 8, -8, -3); });
      ctx.strokeStyle = '#2fb7bf'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(9, 1.5, 3.2, -1.3, 1.3); ctx.stroke();
      blob('#ffffff', () => { ctx.ellipse(0, -3, 8, 2.6, 0, 0, Math.PI * 2); });
      blob('#7a4a2c', () => { ctx.ellipse(0, -3, 6.6, 1.9, 0, 0, Math.PI * 2); });
      ctx.strokeStyle = '#b8c2dc'; ctx.lineWidth = 1.6;
      for (const dx of [-3, 2]) { ctx.beginPath(); ctx.moveTo(dx, -7); ctx.quadraticCurveTo(dx + 3, -10, dx, -13); ctx.stroke(); }
      break;
    case 'toast':
      blob('#e9b65a', () => { ctx.moveTo(-11, 9); ctx.lineTo(11, 9); ctx.lineTo(0, -11); ctx.closePath(); });
      blob('#57c25a', () => { ctx.moveTo(-9, 5); ctx.lineTo(9, 5); ctx.lineTo(7.6, 7.4); ctx.lineTo(-7.6, 7.4); ctx.closePath(); });
      blob('#ff5d5d', () => { ctx.moveTo(-8, 2.5); ctx.lineTo(8, 2.5); ctx.lineTo(7.2, 4.6); ctx.lineTo(-7.2, 4.6); ctx.closePath(); });
      blob('#fff2c9', () => { ctx.moveTo(-6, 0.5); ctx.lineTo(6, 0.5); ctx.lineTo(0, -8); ctx.closePath(); });
      break;
    case 'cake':
      blob('#ffd6a8', () => { ctx.moveTo(-10, 9); ctx.lineTo(10, 9); ctx.lineTo(10, -2); ctx.lineTo(-10, 2); ctx.closePath(); });
      blob('#ff7fae', () => { ctx.moveTo(-10, 4); ctx.lineTo(10, 1); ctx.lineTo(10, 4); ctx.lineTo(-10, 7); ctx.closePath(); });
      blob('#ffffff', () => { ctx.moveTo(-11, 2); ctx.lineTo(11, -3); ctx.quadraticCurveTo(11, -8, 4, -7); ctx.lineTo(-11, -1); ctx.closePath(); });
      blob('#e8174a', () => { ctx.arc(4, -10, 3.6, 0, Math.PI * 2); });
      blob('#ffffffaa', () => { ctx.arc(3, -11, 1, 0, Math.PI * 2); });
      break;
    case 'noodle':
      blob('#3fa6ff', () => { ctx.moveTo(-12, -1); ctx.lineTo(12, -1); ctx.quadraticCurveTo(11, 11, 0, 11); ctx.quadraticCurveTo(-11, 11, -12, -1); });
      blob('#ffffff', () => { ctx.ellipse(0, -1, 12, 4, 0, 0, Math.PI * 2); });
      blob('#f4c95a', () => { ctx.ellipse(0, -1, 10, 3, 0, 0, Math.PI * 2); });
      ctx.strokeStyle = '#d9a43a'; ctx.lineWidth = 1.2;
      for (const dx of [-6, -2, 2]) { ctx.beginPath(); ctx.moveTo(dx, -3); ctx.quadraticCurveTo(dx + 2, 0, dx + 4, -2.5); ctx.stroke(); }
      blob('#ffffff', () => { ctx.arc(6, -2, 2.6, 0, Math.PI * 2); });
      blob('#ffc23d', () => { ctx.arc(6, -2, 1.2, 0, Math.PI * 2); });
      blob('#3fbf5a', () => { ctx.ellipse(-7, -2.5, 2, 1.1, 0.4, 0, Math.PI * 2); });
      ctx.strokeStyle = '#ffffff99'; ctx.lineWidth = 1.5;
      for (const dx of [-3, 3]) { ctx.beginPath(); ctx.moveTo(dx, -7); ctx.quadraticCurveTo(dx + 3, -10, dx, -13); ctx.stroke(); }
      break;
    case 'meal':
      blob('#e9eef7', () => { ctx.ellipse(0, 1, 13, 10, 0, 0, Math.PI * 2); });
      blob('#ffffff', () => { ctx.ellipse(0, 0, 11.5, 8.6, 0, 0, Math.PI * 2); });
      blob('#a8542c', () => { ctx.ellipse(-2, 0.5, 6.5, 4.6, -0.3, 0, Math.PI * 2); });
      ctx.strokeStyle = '#6e3418'; ctx.lineWidth = 1.2;
      for (const dx of [-5, -2, 1]) { ctx.beginPath(); ctx.moveTo(dx, -2.5); ctx.lineTo(dx + 2.5, 3.5); ctx.stroke(); }
      blob('#fff7e8', () => { ctx.arc(6.5, -3, 3.2, 0, Math.PI * 2); });
      blob('#3fbf5a', () => { ctx.arc(6.5, 4, 2.6, 0, Math.PI * 2); ctx.arc(8.5, 2.8, 2, 0, Math.PI * 2); });
      break;
    default: // charcoal
      blob('#2b2228', () => { ctx.ellipse(0, 3, 10, 7, 0, 0, Math.PI * 2); });
      blob('#4a3a40', () => { ctx.ellipse(-3, 1, 4, 2.5, 0, 0, Math.PI * 2); });
      ctx.strokeStyle = '#8a8a9a99'; ctx.lineWidth = 2;
      for (const dx of [-4, 3]) { ctx.beginPath(); ctx.moveTo(dx, -4); ctx.quadraticCurveTo(dx + 4, -8, dx, -13); ctx.stroke(); }
  }
  ctx.restore();
}

// A passenger in a seat, nose of the plane up: a round head with a face and hair, shoulders, maybe a hat.
function drawPassenger(ctx, x, y, look, mood, now) {
  const { skin, hair, style } = look;
  const shake = mood === 'angry' ? Math.sin(now / 40) * 1.5 : 0;
  ctx.save();
  ctx.translate(x + shake, y);
  // shoulders
  ctx.fillStyle = look.shirt;
  roundRect(ctx, -15, 6, 30, 16, 8);
  ctx.fill();
  // head
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.arc(0, -2, 11, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = hair;
  ctx.beginPath();
  if (style === 0) { ctx.arc(0, -4, 11.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); }
  else if (style === 1) { ctx.arc(0, -4, 11.5, Math.PI * 1.05, Math.PI * 1.95); ctx.fill(); ctx.beginPath(); ctx.arc(0, -15, 5, 0, Math.PI * 2); ctx.fill(); }
  else if (style === 2) { ctx.arc(0, -3, 12.5, Math.PI * 0.95, Math.PI * 2.05); ctx.lineTo(12.5, 6); ctx.lineTo(9, 6); ctx.lineTo(9, -2); ctx.lineTo(-9, -2); ctx.lineTo(-9, 6); ctx.lineTo(-12.5, 6); ctx.closePath(); ctx.fill(); }
  else { ctx.arc(0, -5, 11.5, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(-13, -6, 26, 3); }
  // face
  ctx.fillStyle = '#2a1636';
  const eyeY = -1;
  if (mood === 'happy') {
    ctx.strokeStyle = '#2a1636'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * 4, eyeY + 1, 2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    ctx.beginPath(); ctx.arc(0, 3, 3.4, 0.15, Math.PI - 0.15); ctx.stroke();
  } else {
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * 4, eyeY, 1.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = '#2a1636'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath();
    if (mood === 'angry' || mood === 'cross') {
      ctx.arc(0, 7, 3, Math.PI * 1.2, Math.PI * 1.8);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-6.5, eyeY - 4.5); ctx.lineTo(-2, eyeY - 3); ctx.moveTo(6.5, eyeY - 4.5); ctx.lineTo(2, eyeY - 3);
    } else {
      ctx.moveTo(-2, 4.5); ctx.lineTo(2, 4.5);
    }
    ctx.stroke();
  }
  if (mood !== 'angry') {
    ctx.fillStyle = '#ff6d8a44';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 7, 2.5, 2.4, 1.5, 0, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

// The chef seen from above, pushing the cart up the aisle (the cart is on the nose side).
function drawChef(ctx, x, y, cart, walking, now) {
  const bob = walking && !calm() ? Math.sin(now / 70) * 1.4 : 0;
  ctx.save();
  ctx.translate(x, y + bob);
  // cart
  ctx.fillStyle = '#c9d2e6';
  roundRect(ctx, -15, -40, 30, 24, 5); ctx.fill();
  ctx.fillStyle = '#eef2fb';
  roundRect(ctx, -13, -38, 26, 20, 4); ctx.fill();
  ctx.strokeStyle = '#8f9bb8'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-15, -15); ctx.lineTo(15, -15); ctx.stroke();
  cart.slice(0, 4).forEach((dish, i) => drawDish(ctx, dish, -6.5 + (i % 2) * 13, -33 + Math.floor(i / 2) * 10, 11));
  // body and arms
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.ellipse(0, 2, 14, 11, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d7deec'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.fillStyle = '#ffd9b8';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * 11, -12, 3.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 5;
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 12, -2); ctx.lineTo(side * 11, -11); ctx.stroke(); }
  // scarf
  ctx.fillStyle = '#ff5d8f';
  ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(6, -6); ctx.lineTo(0, 1); ctx.closePath(); ctx.fill();
  // head and hat
  ctx.fillStyle = '#ffd9b8';
  ctx.beginPath(); ctx.arc(0, -4, 8.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(-4, -1, 5.5, 0, Math.PI * 2); ctx.arc(4, -1, 5.5, 0, Math.PI * 2); ctx.arc(0, 2, 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#d7deec'; ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
}

export function mountSkychef(wrap, { onHud = () => {}, onResult = null } = {}) {
  let alive = true;
  let core = null;
  let runScore = 0;
  let best = Number(readJson(STORE.best)) || 0;
  let raf = 0;
  let last = 0;
  let playing = false; // false while a card is up: the flight is paused
  let toast = null;
  let looks = [];
  const moods = new Map(); // seat -> { mood, until }
  const floaters = [];
  const flashes = new Map(); // station / cart index -> when it last changed, for a little pop
  let lastHud = '';

  const canvas = el('canvas', 'game-canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = LW * dpr;
  canvas.height = LH * dpr;
  canvas.setAttribute('aria-label', '空中大厨游戏画布');
  const overlay = el('div', 'skychef-overlay');
  overlay.hidden = true;
  wrap.replaceChildren(canvas, overlay);
  const ctx = canvas.getContext('2d');

  const poke = () => { if (!raf && alive) { last = 0; raf = requestAnimationFrame(frame); } };
  const say = (text) => { toast = { text, until: performance.now() + 1500 }; poke(); };
  const hud = () => {
    const text = `第 ${core.stage} 关 · ${core.coins} 金币 · 总分 ${runScore}`;
    if (text !== lastHud) { lastHud = text; onHud(text); }
  };
  const save = (stage, score) => writeJson(STORE.save, { stage, score });

  function begin(stage) {
    core = createStage(stage);
    looks = Array.from({ length: core.config.rows * SEATS_PER_ROW }, (_, seat) => {
      const h = (seat * 7 + core.stage * 13) >>> 0;
      return { skin: SKIN[h % SKIN.length], hair: HAIR[(h >> 1) % HAIR.length], style: (h >> 2) % 4, shirt: ['#7a8cff', '#ff9f6b', '#5cc9a7', '#c792ff', '#ffcf5a', '#ff7f9e'][(seat * 5 + core.stage) % 6] };
    });
    moods.clear();
    floaters.length = 0;
    flashes.clear();
    toast = null;
    playing = false;
    lastHud = '';
    save(core.stage, runScore);
    hud();
    intro();
    poke();
  }
  function restart() {
    runScore = 0;
    begin(1);
  }

  // ---- cards ----
  function card(title, lines, buttons, cls = '') {
    overlay.replaceChildren();
    overlay.className = `skychef-overlay ${cls}`;
    const box = el('div', 'skychef-card');
    box.append(el('strong', '', title));
    for (const line of lines) box.append(el('p', '', line));
    const note = el('p', 'skychef-note');
    box.append(note);
    for (const { label, action, ghost } of buttons) {
      const button = el('button', `skychef-again${ghost ? ' ghost' : ''}`, label);
      button.addEventListener('click', action);
      box.append(button);
    }
    overlay.append(box);
    overlay.hidden = false;
    return note;
  }
  function intro() {
    const c = core.config;
    const lines = [`${c.name} · ${core.orders.length} 份订单 · ${c.rows} 排乘客`, `目标金币 ★${core.goals[0]} · ★★${core.goals[1]} · ★★★${core.goals[2]}`];
    for (const dish of c.fresh) {
      const st = STATIONS[dish];
      lines.push(st.cook === 0 ? `新菜：${DISHES[dish].name}，${st.name}点一下就能装上餐车` : `新菜：${DISHES[dish].name}，${st.name}要做 ${st.cook} 秒${st.burn ? `，做好后 ${st.burn} 秒不拿就会糊` : ''}`);
    }
    card(`第 ${core.stage} 关`, lines, [{ label: '起飞 ✈', action: start }]);
  }
  function start() {
    if (core.done) return;
    overlay.hidden = true;
    playing = true;
    poke();
  }
  function landed(result) {
    playing = false;
    const stage = core.stage;
    const starLine = `${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}  ${result.coins} 金币（目标 ${core.goals[0]}）`;
    const tally = `送达 ${result.served} 份 · 等不及的 ${result.missed} 位`;
    if (!result.passed) {
      card('金币不够', [starLine, tally, '这趟航班的订单不会变，换个顺序再飞一次。'], [{ label: '重试本关', action: () => begin(stage) }]);
      return;
    }
    runScore += result.coins;
    if (runScore > best) { best = runScore; writeJson(STORE.best, best); }
    const lastStage = stage >= STAGES;
    save(lastStage ? 1 : stage + 1, lastStage ? 0 : runScore);
    hud();
    const note = card(lastStage ? '全部航线飞完！' : '平稳落地', [starLine, tally, `总分 ${runScore} · 本机最佳 ${best}`], lastStage
      ? [{ label: '再飞一轮', action: restart }]
      : [{ label: '下一关', action: () => begin(stage + 1) }, { label: '重玩本关', action: () => { runScore -= result.coins; begin(stage); }, ghost: true }], 'won');
    onResult?.('skychef', runScore).then((text) => { if (text && note.isConnected) note.textContent = text; });
  }

  // ---- events ----
  function float(x, y, text, color) { floaters.push({ x, y, text, color, t0: performance.now() }); }
  const seatXY = (seat) => [COLX[seat % SEATS_PER_ROW], rowY(core.config.rows, rowOf(seat))];
  const stationXY = (id) => { const b = STATION_BOX.find((box) => box.id === id); return [b.x + b.w / 2, b.y + 14]; };
  function handle(events) {
    const now = performance.now();
    for (const e of events) {
      if (e.type === 'pay') {
        const [x, y] = seatXY(e.seat);
        moods.set(e.seat, { mood: 'happy', until: now + 1400 });
        float(x, y - 30, `+${e.coins}`, '#ffd543');
        if (e.tip >= 3) float(x, y - 46, `小费 ${e.tip}`, '#8ff0c8');
      } else if (e.type === 'hand') {
        const [x, y] = seatXY(e.seat);
        float(x, y - 30, '✓', '#8ff0c8');
      } else if (e.type === 'leave') {
        const [x, y] = seatXY(e.seat);
        moods.set(e.seat, { mood: 'angry', until: now + 1800 });
        float(x, y - 30, '等不及了', '#ff8a8a');
      } else if (e.type === 'nomatch') {
        say('餐车上没有他要的');
      } else if (e.type === 'full') {
        say('餐车满了，点餐车上的菜可以扔掉');
      } else if (e.type === 'busy') {
        say(`${STATIONS[e.station].name}两格都在用`);
      } else if (e.type === 'burnt') {
        const [x, y] = stationXY(e.station);
        float(x, y, '糊了！', '#ff8a8a');
      } else if (e.type === 'trash') {
        const [x, y] = stationXY(e.station);
        float(x, y, '倒掉', '#c3c9d6');
      } else if (e.type === 'load' || e.type === 'cook' || e.type === 'ready') {
        flashes.set(e.station, now);
        if (e.type === 'load') flashes.set(`cart${core.cart.length - 1}`, now);
      } else if (e.type === 'land') {
        landed(e);
      }
    }
    if (events.length) hud();
  }

  // ---- input ----
  const toLogical = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * LW / rect.width, y: (event.clientY - rect.top) * LH / rect.height };
  };
  function hit(x, y) {
    for (const b of STATION_BOX) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { station: b.id };
    for (let i = 0; i < SKY.cart; i += 1) {
      const cx = CART.x + i * (CART.slot + CART.gap);
      if (x >= cx && x <= cx + CART.slot && y >= CART.y && y <= CART.y + CART.h) return { cart: i };
    }
    const rows = core.config.rows, pitch = pitchOf(rows);
    if (y < CABIN.bottom && y > CABIN.bottom - pitch * rows) {
      const row = Math.floor((CABIN.bottom - y) / pitch);
      let col = -1, nearest = Infinity;
      COLX.forEach((cx, i) => { const d = Math.abs(cx - x); if (d < nearest) { nearest = d; col = i; } });
      if (nearest <= SEAT_W / 2 + 8) return { seat: row * SEATS_PER_ROW + col };
    }
    return null;
  }
  function act(target) {
    if (!alive || !playing || !target) return false;
    if (target.station) {
      if (!core.config.dishes.includes(target.station)) { say(`第 ${unlockRoute(target.station)} 条航线解锁`); return false; }
      const r = tapStation(core, target.station);
      if (!r.ok && r.reason === 'queue') say(`最多排 ${SKY.queue} 件事`);
      poke();
      return r.ok;
    }
    if (target.cart !== undefined) {
      const dish = discard(core, target.cart);
      if (dish) say(`扔掉了${DISHES[dish].name}`);
      return Boolean(dish);
    }
    if (target.seat !== undefined) {
      if (!callAt(core, target.seat)) return false;
      const r = tapSeat(core, target.seat);
      if (!r.ok && r.reason === 'queue') say(`最多排 ${SKY.queue} 件事`);
      return r.ok;
    }
    return false;
  }
  function onDown(event) {
    if (!alive || !overlay.hidden) return;
    event.preventDefault();
    const { x, y } = toLogical(event);
    act(hit(x, y));
  }
  function onKey(event) {
    if (event.metaKey || event.ctrlKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    const n = Number(event.key);
    if (!(n >= 1 && n <= 6)) return;
    event.preventDefault();
    act({ station: STATION_ORDER[n - 1] });
  }
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('keydown', onKey);

  // ---- drawing ----
  function drawTop() {
    roundRect(ctx, 12, 6, 132, 38, 12);
    ctx.fillStyle = '#ffffff22'; ctx.fill();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.font = '800 14px system-ui, sans-serif';
    ctx.fillText(`第 ${core.stage} 关`, 22, 18);
    ctx.fillStyle = '#c9d6ff'; ctx.font = '700 10px system-ui, sans-serif';
    ctx.fillText(core.config.name, 22, 34);
    // coins against the goals
    const x = 152, w = 196;
    roundRect(ctx, x, 6, w, 38, 12);
    ctx.fillStyle = '#ffffff22'; ctx.fill();
    ctx.fillStyle = '#ffd543'; ctx.font = '800 14px system-ui, sans-serif';
    ctx.fillText(`${core.coins} 金币`, x + 10, 18);
    ctx.textAlign = 'right'; ctx.fillStyle = '#c9d6ff'; ctx.font = '700 10px system-ui, sans-serif';
    ctx.fillText(`订单 ${core.served + core.missed}/${core.orders.length}`, x + w - 10, 18);
    const bx = x + 10, bw = w - 20, by = 33, top = core.goals[2] * 1.08;
    roundRect(ctx, bx, by, bw, 7, 4); ctx.fillStyle = '#0006'; ctx.fill();
    roundRect(ctx, bx, by, bw * clamp(core.coins / top, 0, 1), 7, 4); ctx.fillStyle = '#ffd543'; ctx.fill();
    core.goals.forEach((goal) => {
      const gx = bx + bw * goal / top;
      ctx.fillStyle = core.coins >= goal ? '#ffd543' : '#ffffff88';
      ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('★', gx, by - 3);
      ctx.fillStyle = '#ffffffaa'; ctx.fillRect(gx - 0.5, by, 1, 7);
    });
  }
  function drawCabin(now) {
    const rows = core.config.rows, pitch = pitchOf(rows);
    // fuselage
    roundRect(ctx, CABIN.x, CABIN.y, CABIN.w, CABIN.h, [60, 60, 14, 14]);
    const g = ctx.createLinearGradient(CABIN.x, 0, CABIN.x + CABIN.w, 0);
    g.addColorStop(0, '#dfe7fb'); g.addColorStop(0.5, '#f6f8ff'); g.addColorStop(1, '#dfe7fb');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#9fb0e0'; ctx.stroke();
    // aisle carpet, from the first row in use down to the galley
    const used = CABIN.bottom - pitch * rows;
    const front = used - CABIN.top > 30 ? used - 4 : CABIN.top - 10;
    ctx.fillStyle = '#5b6fd6';
    ctx.fillRect(AISLE - 26, front, 52, CABIN.bottom - front + 6);
    ctx.fillStyle = '#ffffff22';
    for (let y = front + 4; y < CABIN.bottom; y += 18) ctx.fillRect(AISLE - 2, y, 4, 8);
    // the first-class curtain above the rows in use
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (used - CABIN.top > 30) {
      ctx.fillStyle = '#ff9fc0';
      for (let x = CABIN.x + 20; x < CABIN.x + CABIN.w - 20; x += 10) { ctx.beginPath(); ctx.ellipse(x, used - 10, 5, 8, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#7a86b8';
      ctx.fillText('头等舱 · 敬请期待', AISLE, (CABIN.top + used - 20) / 2);
    }
    // rows: windows, seats, passengers
    for (let row = 0; row < rows; row += 1) {
      const y = rowY(rows, row);
      ctx.fillStyle = '#a9d8ff';
      for (const wx of [CABIN.x + 6, CABIN.x + CABIN.w - 6]) { roundRect(ctx, wx - 3, y - 10, 6, 18, 3); ctx.fill(); }
      for (let col = 0; col < SEATS_PER_ROW; col += 1) {
        const seat = row * SEATS_PER_ROW + col, x = COLX[col];
        const waiting = callAt(core, seat);
        roundRect(ctx, x - SEAT_W / 2, y - pitch / 2 + 6, SEAT_W, pitch - 10, 10);
        ctx.fillStyle = waiting ? '#3d4fae' : '#4c5fc4'; ctx.fill();
        // seat back behind the passenger (toward the galley)
        roundRect(ctx, x - SEAT_W / 2 + 2, y + pitch / 2 - 14, SEAT_W - 4, 10, 5);
        ctx.fillStyle = '#2f3d8e'; ctx.fill();
        roundRect(ctx, x - 12, y + pitch / 2 - 13, 24, 6, 3);
        ctx.fillStyle = '#ff9fc0'; ctx.fill();
        const shown = moods.get(seat);
        let mood = 'calm';
        if (shown && shown.until > now) mood = shown.mood;
        else if (shown) moods.delete(seat);
        if (mood === 'calm' && waiting && waiting.patience / waiting.max < 0.35) mood = 'cross';
        drawPassenger(ctx, x, y + 6, looks[seat], mood, now);
        if (waiting) {
          ctx.fillStyle = `rgba(255, 213, 67, ${0.65 + 0.35 * Math.sin(now / 160)})`;
          ctx.beginPath(); ctx.arc(x + SEAT_W / 2 - 8, y - pitch / 2 + 14, 3.5, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
  function drawBubbles() {
    const rows = core.config.rows;
    for (const call of core.calls) {
      const x0 = COLX[call.seat % SEATS_PER_ROW], y = rowY(rows, rowOf(call.seat));
      const w = call.items.length * 20 + 10, h = 22;
      const x = clamp(x0 - w / 2, CABIN.x + 4, CABIN.x + CABIN.w - 4 - w);
      const top = y - 32;
      const share = call.patience / call.max;
      roundRect(ctx, x, top, w, h, 9);
      ctx.fillStyle = '#ffffff'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = share < 0.35 ? '#ff6f6f' : '#c7d0ea'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x0 - 4, top + h); ctx.lineTo(x0, top + h + 5); ctx.lineTo(x0 + 4, top + h); ctx.fill();
      const left = [...call.left];
      call.items.forEach((dish, i) => {
        const at = left.indexOf(dish);
        const owed = at >= 0;
        if (owed) left.splice(at, 1);
        const ix = x + 15 + i * 20;
        drawDish(ctx, dish, ix, top + h / 2, 17, { alpha: owed ? 1 : 0.3 });
        if (!owed) { ctx.fillStyle = '#2fb86a'; ctx.font = '900 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('✓', ix, top + h / 2 + 1); }
      });
      // patience
      roundRect(ctx, x + 3, top + h + 1 - 5, w - 6, 3, 2);
      ctx.fillStyle = '#0002'; ctx.fill();
      roundRect(ctx, x + 3, top + h + 1 - 5, (w - 6) * clamp(share, 0, 1), 3, 2);
      ctx.fillStyle = share > 0.6 ? '#3fcf7a' : share > 0.35 ? '#ffc23d' : '#ff5f5f'; ctx.fill();
    }
  }
  function drawQueueMarks() {
    const rows = core.config.rows;
    const count = new Map();
    core.queue.forEach((action, i) => {
      const key = action.kind === 'serve' ? `s${action.seat}` : action.id;
      const n = count.get(key) ?? 0;
      count.set(key, n + 1);
      let x, y;
      if (action.kind === 'serve') { x = COLX[action.seat % SEATS_PER_ROW] - SEAT_W / 2 + 9 + n * 13; y = rowY(rows, rowOf(action.seat)) + 10; }
      else { const b = STATION_BOX.find((box) => box.id === action.id); x = b.x + b.w - 10 - n * 15; y = b.y + 10; }
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#ff5d8f'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y + 0.5);
    });
  }
  function drawGalley(now) {
    const g = ctx.createLinearGradient(0, GALLEY_Y, 0, LH);
    g.addColorStop(0, '#2c3a7a'); g.addColorStop(1, '#1b2357');
    roundRect(ctx, 6, GALLEY_Y, LW - 12, LH - GALLEY_Y - 2, 14);
    ctx.fillStyle = g; ctx.fill();
    // cart strip
    ctx.fillStyle = '#c9d6ff'; ctx.font = '800 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('餐车', 22, CART.y + CART.h / 2 - 6);
    ctx.fillStyle = '#8f9bd0'; ctx.font = '600 9px system-ui, sans-serif';
    ctx.fillText('点菜可扔', 22, CART.y + CART.h / 2 + 9);
    for (let i = 0; i < SKY.cart; i += 1) {
      const x = CART.x + i * (CART.slot + CART.gap);
      const flash = flashes.get(`cart${i}`);
      const pop = flash && !calm() ? Math.max(0, 1 - (now - flash) / 220) : 0;
      roundRect(ctx, x, CART.y, CART.slot, CART.h, 9);
      ctx.fillStyle = core.cart[i] ? '#ffffff' : '#ffffff1c'; ctx.fill();
      if (core.cart[i]) drawDish(ctx, core.cart[i], x + CART.slot / 2, CART.y + CART.h / 2, 24 * (1 + pop * 0.25));
    }
    ctx.textAlign = 'right'; ctx.fillStyle = '#c9d6ff'; ctx.font = '700 10px system-ui, sans-serif';
    ctx.fillText(`待办 ${core.queue.length}/${SKY.queue}`, LW - 16, CART.y + CART.h / 2);
    // stations
    for (const b of STATION_BOX) {
      const open = core.config.dishes.includes(b.id);
      const st = STATIONS[b.id];
      const flash = flashes.get(b.id);
      const pop = open && flash && !calm() ? Math.max(0, 1 - (now - flash) / 220) : 0;
      ctx.save();
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
      ctx.scale(1 + pop * 0.04, 1 + pop * 0.04);
      roundRect(ctx, -b.w / 2, -b.h / 2, b.w, b.h, 12);
      if (open) {
        const sg = ctx.createLinearGradient(0, -b.h / 2, 0, b.h / 2);
        sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#e3e9fa');
        ctx.fillStyle = sg;
      } else ctx.fillStyle = '#ffffff14';
      ctx.fill();
      ctx.lineWidth = 2.5; ctx.strokeStyle = open ? ACCENT[b.id] : '#ffffff22'; ctx.stroke();
      ctx.restore();
      if (!open) {
        ctx.globalAlpha = 0.35;
        drawDish(ctx, b.id, b.x + 24, b.y + b.h / 2, 26);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#c9d6ff'; ctx.font = '700 10px system-ui, sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(`第 ${unlockRoute(b.id)} 条航线`, b.x + 44, b.y + b.h / 2);
        continue;
      }
      ctx.fillStyle = '#2a2f55'; ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(st.name, b.x + 8, b.y + 12);
      ctx.fillStyle = '#8a92b8'; ctx.font = '700 9px system-ui, sans-serif';
      ctx.fillText(`${STATION_ORDER.indexOf(b.id) + 1}`, b.x + b.w - 12, b.y + b.h - 9);
      if (st.cook === 0) {
        drawDish(ctx, b.id, b.x + b.w / 2, b.y + 40, 30);
        continue;
      }
      core.cookers[b.id].forEach((slot, i) => {
        const cx = b.x + 28 + i * 50, cy = b.y + 40;
        const phase = slotPhase(b.id, slot);
        ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2);
        ctx.fillStyle = '#d9e0f2'; ctx.fill();
        if (phase === 'empty') {
          ctx.fillStyle = '#9aa3c6'; ctx.font = '800 16px system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('+', cx, cy + 1);
          return;
        }
        if (phase === 'cooking') {
          drawDish(ctx, b.id, cx, cy, 22, { alpha: 0.4 });
          ctx.beginPath(); ctx.arc(cx, cy, 17, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (slot.t / st.cook));
          ctx.lineWidth = 4; ctx.strokeStyle = ACCENT[b.id]; ctx.stroke();
          return;
        }
        if (phase === 'burnt') { drawDish(ctx, 'burnt', cx, cy, 24); return; }
        // ready: glow, and blink red once it is close to burning
        const danger = st.burn > 0 && slot.t > st.cook + st.burn * 0.55;
        ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = danger ? `rgba(255, 80, 80, ${0.5 + 0.5 * Math.sin(now / 80)})` : '#3fcf7a';
        ctx.stroke();
        drawDish(ctx, b.id, cx, cy, 26);
      });
    }
  }
  function drawFloaters(now) {
    for (let i = floaters.length - 1; i >= 0; i -= 1) {
      const f = floaters[i];
      const t = (now - f.t0) / 1000;
      if (t >= 1) { floaters.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = 1 - t * t;
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = '#1b2357cc';
      ctx.strokeText(f.text, f.x, f.y - t * 28);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y - t * 28);
      ctx.restore();
    }
  }
  function frame(now) {
    raf = 0;
    if (!alive) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    const before = core.pos;
    if (playing && !core.done && dt > 0) handle(tick(core, dt));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    drawTop();
    drawCabin(now);
    drawGalley(now);
    drawChef(ctx, AISLE, chefY(core.config.rows, core.pos), core.cart, core.pos !== before, now);
    drawBubbles();
    drawQueueMarks();
    drawFloaters(now);
    if (toast && toast.until > now) {
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const width = ctx.measureText(toast.text).width + 28;
      roundRect(ctx, (LW - width) / 2, GALLEY_Y - 40, width, 26, 13);
      ctx.fillStyle = '#000c'; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(toast.text, LW / 2, GALLEY_Y - 27);
    }
    const busy = playing || floaters.length || (toast && toast.until > now);
    if (busy && alive) raf = requestAnimationFrame(frame);
  }

  // Pick up the run where it was left: the stage to fly next and the score so far.
  const saved = readJson(STORE.save);
  if (saved && Number.isInteger(saved.stage) && saved.stage >= 1 && saved.stage <= STAGES) runScore = Math.max(0, Number(saved.score) || 0);
  begin(saved?.stage >= 1 && saved?.stage <= STAGES ? saved.stage : 1);
  return {
    get state() { return core; },
    get playing() { return playing; },
    get runScore() { return runScore; },
    restart,
    start,
    tapStation: (id) => act({ station: id }),
    tapSeat: (seat) => act({ seat }),
    discard: (index) => act({ cart: index }),
    // Fly ahead by `seconds` without waiting for frames (tests).
    advance(seconds) {
      for (let t = 0; t < seconds && playing && !core.done; t += 0.05) handle(tick(core, Math.min(0.05, seconds - t)));
      poke();
    },
    // Jump to a stage (tests): shows its intro card.
    load(stage) { begin(stageConfig(stage).stage); },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      wrap.replaceChildren();
    }
  };
}
