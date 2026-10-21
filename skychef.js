// 空中大厨: the view. One 2D canvas in the style of a cartoon airliner: we stand at the back of the aisle and
// look up the cabin, the passengers facing us in their seats (nearer rows bigger), the route's city mural on the
// far bulkhead, the stewardess pushing her cart away from us, and the steel galley along the bottom with the
// cart's tray and the six stations. skychef-core.js runs the flight and skychef-art.js holds the drawings; this
// module places them in perspective, turns taps into queued actions, and plays the events back as floating
// coins, moods and toasts. Between flights the intro card opens the upgrade shop; the wallet and the upgrades
// belong to the run, so 重新开始 empties both.
import { addFuel, burnFuel, buy, callAt, createStage, discard, DISHES, flightIn, FUEL, fuelAt, levelOf, nextFuelIn, nextCost, rowOf, SEATS_PER_ROW, SKY, slotPhase, stageConfig, STAGES, STATION_ORDER, STATIONS, tapSeat, tapStation, tick, UPGRADES } from './skychef-core.js';
import { drawBubble, drawBulkhead, drawCabinet, drawCoin, drawDish, drawDispenser, drawNeed, drawPill, drawSeat, drawSlotBase, drawStewardess, lookFor, THEMES } from './skychef-art.js';
import { fitView } from './fit-view.js';

const LW = 360;
const LH = 600;
const STORE = { best: 'pao-skychef-best', save: 'pao-skychef-save', fuel: 'pao-skychef-fuel' };
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
const lerp = (a, b, t) => a + (b - a) * t;
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

// ---- layout (logical px) ----
// The cabin is a one-point perspective: depth d counts rows from the nearest (0), each row a fixed step up the
// screen and 7.5% smaller. Seats and walls close in on the aisle as they shrink.
const AISLE = 180;
const FLOOR = 398; // the floor under the nearest row
const GALLEY_Y = 412;
const SEAT_BASE = [46, 110, 250, 314]; // seat centres at full size, left window to right window
const SHRINK = 0.075;
const depthAt = (rows, d) => {
  const pitch = Math.min(76, 300 / rows);
  return { y: FLOOR - pitch * d, s: 1 - SHRINK * d };
};
const seatX = (col, s) => AISLE + (SEAT_BASE[col] - AISLE) * s;
const wallX = (s) => AISLE - 166 * s; // inner edge of the left wall; the right one mirrors it
// Where the stewardess stands: pos 0 is the galley door (her legs behind the counter), pos i + 1 is row i.
function chefAt(rows, pos) {
  if (pos >= 1) return depthAt(rows, pos - 1);
  const first = depthAt(rows, 0);
  return { y: lerp(GALLEY_Y + 26, first.y, pos), s: lerp(1.06, first.s, pos) };
}
const CART = { x: 70, span: 222, y: 418, gap: 6, h: 32 }; // the slots share the span, however many the cart has
const STATION_BOX = STATION_ORDER.map((id, i) => ({ id, x: 10 + (i % 3) * 115, y: 458 + Math.floor(i / 3) * 71, w: 110, h: 66 }));
function cartSlots(n) {
  const w = (CART.span - CART.gap * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ x: CART.x + i * (w + CART.gap), w }));
}
// Cooker slots inside a station box: two big ones, or three smaller once upgraded.
const cookerSlots = (n) => (n >= 3 ? { left: 21, step: 34, r: 15 } : { left: 30, step: 50, r: 17 });
const seconds = (t) => `${Number(t.toFixed(1))}`;
const clock = (ms) => { const t = Math.ceil(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const unlockRoute = (id) => [0, 0, 1, 2, 3, 4][STATION_ORDER.indexOf(id)] + 1;
const ACCENT = { juice: '#ff9f2e', coffee: '#9c6a46', toast: '#e9b65a', cake: '#ff7fae', noodle: '#3fa6ff', meal: '#e0663c' };

export function mountSkychef(wrap, { onHud = () => {}, onResult = null } = {}) {
  let alive = true;
  let core = null;
  let runScore = 0;
  let wallet = 0; // coins to spend: everything earned this run, cleared or not, less what the shop took
  let owned = {}; // upgrade id -> level bought this run
  // The fuel tank belongs to the device, not the run: 重新开始 does not fill it.
  let tank = fuelAt(readJson(STORE.fuel), Date.now());
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
  let ctx = canvas.getContext('2d');
  // 全屏：机舱（连同叠在上面的关卡 / 金币）是游戏区，下面的厨房是信息栏（fit-view.js）
  const fit = fitView(canvas, { width: LW, height: LH, onChange: () => poke(), regions: () => [
    { x: 0, y: 0, w: LW, h: GALLEY_Y, role: 'main' },
    { x: 0, y: GALLEY_Y, w: LW, h: LH - GALLEY_Y, role: 'bottom' }
  ] });

  const poke = () => { if (!raf && alive) { last = 0; raf = requestAnimationFrame(frame); } };
  const say = (text) => { toast = { text, until: performance.now() + 1500 }; poke(); };
  const hud = () => {
    const text = `第 ${core.stage} 关 · ${core.coins} 金币 · 总分 ${runScore}`;
    if (text !== lastHud) { lastHud = text; onHud(text); }
  };
  const save = (stage) => writeJson(STORE.save, { stage, score: runScore, wallet, owned });
  const saveTank = () => writeJson(STORE.fuel, tank);
  const fuelText = (now) => `燃油 ${tank.fuel}/${FUEL.max}${tank.fuel >= FUEL.max ? ' · 已加满' : ` · ${clock(nextFuelIn(tank, now))} 后 +1`}`;
  // Keeps the fuel line and the take-off button of whatever card is up in step with the clock.
  function refreshFuel() {
    const now = Date.now();
    tank = fuelAt(tank, now);
    const line = overlay.querySelector('.skychef-fuel');
    if (line) line.textContent = fuelText(now);
    const go = overlay.querySelector('.skychef-go');
    if (go) {
      const wait = flightIn(tank, now);
      go.disabled = wait > 0;
      go.textContent = wait > 0 ? `燃油不够 · 还要 ${clock(wait)}` : `起飞 ✈ · 耗油 ${FUEL.cost}`;
    }
  }

  function begin(stage) {
    core = createStage(stage, owned);
    looks = Array.from({ length: core.config.rows * SEATS_PER_ROW }, (_, seat) => lookFor(seat, core.stage));
    moods.clear();
    floaters.length = 0;
    flashes.clear();
    toast = null;
    playing = false;
    lastHud = '';
    save(core.stage);
    hud();
    intro();
    poke();
  }
  function restart() {
    runScore = 0;
    wallet = 0;
    owned = {};
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
    for (const { label, action, ghost, extra } of buttons) {
      const button = el('button', `skychef-again${ghost ? ' ghost' : ''}${extra ? ` ${extra}` : ''}`, label);
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
      const st = STATIONS[dish], kit = core.kit.stations[dish];
      lines.push(st.cook === 0 ? `新菜：${DISHES[dish].name}，${st.name}点一下就能装上餐车` : `新菜：${DISHES[dish].name}，${st.name}要做 ${seconds(kit.cook)} 秒${kit.burn ? `，做好后 ${seconds(kit.burn)} 秒不拿就会糊` : ''}`);
    }
    const note = card(`第 ${core.stage} 关`, lines, [{ label: '起飞 ✈', action: start, extra: 'skychef-go' }, { label: `升级厨房 · 钱包 ${wallet}`, action: shop, ghost: true }]);
    note.before(el('p', 'skychef-fuel'));
    refreshFuel();
  }
  // The shop: every upgrade with its level, what the next level does and what it costs. Buying rebuilds the
  // stage (it has not started yet) so the flight runs on the new numbers.
  function shop() {
    overlay.replaceChildren();
    overlay.className = 'skychef-overlay';
    const box = el('div', 'skychef-card skychef-shop');
    box.append(el('strong', '', '升级厨房'), el('p', 'skychef-purse', `钱包 ${wallet} 金币 · 升级只在这一轮有效`));
    const list = el('div', 'skychef-list');
    // fuel bought with coins, as often as the wallet and the tank allow
    const now = Date.now();
    tank = fuelAt(tank, now);
    const fuelRow = el('div', 'skychef-item');
    const fuelInfo = el('div', 'skychef-item-text');
    fuelInfo.append(el('b', '', `加油 +${FUEL.buy}`), el('span', '', tank.fuel >= FUEL.max ? `燃油 ${tank.fuel}/${FUEL.max} · 已加满` : `燃油 ${tank.fuel}/${FUEL.max}`));
    const fill = el('button', 'skychef-buy', `${FUEL.price} 金币`);
    fill.dataset.upgrade = 'fuel';
    fill.disabled = wallet < FUEL.price || tank.fuel >= FUEL.max;
    fill.addEventListener('click', () => {
      if (wallet < FUEL.price) return;
      wallet -= FUEL.price;
      tank = addFuel(tank, Date.now(), FUEL.buy);
      saveTank();
      save(core.stage);
      shop();
    });
    fuelRow.append(fuelInfo, fill);
    list.append(fuelRow);
    for (const u of UPGRADES) {
      const level = levelOf(owned, u.id), cost = nextCost(owned, u.id);
      const locked = Boolean(u.need) && !core.config.dishes.includes(u.need);
      const row = el('div', `skychef-item${locked ? ' locked' : ''}`);
      const text = el('div', 'skychef-item-text');
      text.append(el('b', '', `${u.name} ${'●'.repeat(level)}${'○'.repeat(u.costs.length - level)}`));
      text.append(el('span', '', locked ? `第 ${unlockRoute(u.need)} 条航线解锁` : cost === null ? '已经升满' : u.says[level]));
      const button = el('button', 'skychef-buy', cost === null ? '满级' : `${cost} 金币`);
      button.dataset.upgrade = u.id;
      button.disabled = locked || cost === null || wallet < cost;
      button.addEventListener('click', () => {
        const r = buy(owned, wallet, u.id, core.config.dishes);
        if (!r.ok) return;
        owned = r.owned;
        wallet = r.wallet;
        begin(core.stage);
        shop();
      });
      row.append(text, button);
      list.append(row);
    }
    const back = el('button', 'skychef-again', '返回');
    back.addEventListener('click', intro);
    box.append(list, back);
    overlay.append(box);
    overlay.hidden = false;
  }
  function start() {
    if (core.done || playing) return false;
    const r = burnFuel(tank, Date.now());
    tank = r.tank;
    if (!r.ok) { refreshFuel(); return false; }
    saveTank();
    overlay.hidden = true;
    playing = true;
    poke();
    return true;
  }
  function landed(result) {
    playing = false;
    const stage = core.stage;
    const starLine = `${'★'.repeat(result.stars)}${'☆'.repeat(3 - result.stars)}  ${result.coins} 金币（目标 ${core.goals[0]}）`;
    const tally = `送达 ${result.served} 份 · 等不及的 ${result.missed} 位`;
    wallet += result.coins; // the coins are earned either way; only a cleared stage counts toward the score
    if (result.stars === 3) { tank = addFuel(tank, Date.now(), FUEL.stars3); saveTank(); }
    if (!result.passed) {
      save(stage);
      card('金币不够', [starLine, tally, `赚到的 ${result.coins} 金币进了钱包，可以先升级再飞。这趟航班的订单不会变。`], [{ label: '重试本关', action: () => begin(stage) }]);
      return;
    }
    runScore += result.coins;
    if (runScore > best) { best = runScore; writeJson(STORE.best, best); }
    const lastStage = stage >= STAGES;
    if (lastStage) writeJson(STORE.save, { stage: 1, score: 0, wallet: 0, owned: {} });
    else save(stage + 1);
    hud();
    const note = card(lastStage ? '全部航线飞完！' : '平稳落地', [starLine, tally, `总分 ${runScore} · 本机最佳 ${best}`, ...(result.stars === 3 ? [`三星奖励 +${FUEL.stars3} 燃油`] : [])], lastStage
      ? [{ label: '再飞一轮', action: restart }]
      : [{ label: '下一关', action: () => begin(stage + 1) }, { label: '重玩本关', action: () => { runScore -= result.coins; wallet -= result.coins; begin(stage); }, ghost: true }], 'won');
    onResult?.('skychef', runScore).then((text) => { if (text && note.isConnected) note.textContent = text; });
  }

  // ---- events ----
  function float(x, y, text, color) { floaters.push({ x, y, text, color, t0: performance.now() }); }
  const seatXY = (seat) => { const { y, s } = depthAt(core.config.rows, rowOf(seat)); return [seatX(seat % SEATS_PER_ROW, s), y - 60 * s]; };
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
        say(`${STATIONS[e.station].name}的格子都在用`);
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
  const toLogical = (event) => fit.point(event.clientX, event.clientY);
  function hit(x, y) {
    for (const b of STATION_BOX) if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { station: b.id };
    for (const [i, slot] of cartSlots(core.kit.cart).entries()) {
      if (x >= slot.x && x <= slot.x + slot.w && y >= CART.y && y <= CART.y + CART.h) return { cart: i };
    }
    if (y >= GALLEY_Y) return null;
    // an order bubble serves its seat (the nearest drawn last, so it wins)
    for (let i = bubbleHits.length - 1; i >= 0; i -= 1) {
      const b = bubbleHits[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { seat: b.seat };
    }
    // otherwise the passenger: nearest rows first, as they are drawn over the ones behind
    const rows = core.config.rows;
    for (let row = 0; row < rows; row += 1) {
      const { y: fy, s } = depthAt(rows, row);
      if (y < fy - 92 * s || y > fy + 18 * s) continue;
      for (let col = 0; col < SEATS_PER_ROW; col += 1) if (Math.abs(x - seatX(col, s)) <= 30 * s) return { seat: row * SEATS_PER_ROW + col };
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
  let bubbleHits = []; // where each order bubble was drawn this frame, nearest last, so taps on it serve that seat
  const theme = () => THEMES[core.config.route] ?? THEMES[0];
  function drawTop() {
    // stage and route
    drawPill(ctx, 4, 6, 118, 32);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.font = '900 13px system-ui, sans-serif';
    ctx.fillText(`第 ${core.stage} 关`, 18, 16);
    ctx.fillStyle = '#cfe0ff'; ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillText(core.config.name, 18, 30);
    // coins against the three goals
    const x = 116, w = 152;
    drawPill(ctx, x, 6, w, 32);
    drawCoin(ctx, x + 20, 22, 10);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 13px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(String(core.coins), x + 34, 16);
    const bx = x + 34, bw = w - 52, by = 26, top = core.goals[2] * 1.08;
    roundRect(ctx, bx, by, bw, 6, 3); ctx.fillStyle = '#0b1a3a'; ctx.fill();
    roundRect(ctx, bx, by, bw * clamp(core.coins / top, 0, 1), 6, 3); ctx.fillStyle = '#ffd23f'; ctx.fill();
    core.goals.forEach((goal) => {
      const gx = bx + bw * goal / top;
      ctx.fillStyle = core.coins >= goal ? '#ffd23f' : '#8fa3c8';
      ctx.font = '900 12px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('★', gx, by - 6);
    });
    // happy passengers and the orders still to come
    drawPill(ctx, x + w - 6, 6, LW - 4 - (x + w - 6), 32);
    roundRect(ctx, x + w + 10, 13, 18, 18, 5); ctx.fillStyle = '#ffd23f'; ctx.fill();
    ctx.fillStyle = '#3a2a00';
    ctx.beginPath(); ctx.arc(x + w + 15.5, 20, 1.6, 0, Math.PI * 2); ctx.arc(x + w + 22.5, 20, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a2a00'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x + w + 19, 23, 4, 0.3, Math.PI - 0.3); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.font = '900 13px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(String(core.served), x + w + 33, 16);
    ctx.fillStyle = '#cfe0ff'; ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillText(`还有 ${core.orders.length - core.served - core.missed} 单`, x + w + 33, 30);
  }
  function drawShell() {
    const t = theme(), rows = core.config.rows;
    const back = depthAt(rows, rows - 0.35), near = depthAt(rows, -0.25);
    const bx = wallX(back.s), nx = wallX(near.s);
    // floor
    ctx.fillStyle = '#b4bccb';
    ctx.fillRect(0, 0, LW, GALLEY_Y);
    // the far bulkhead with the route's mural
    drawBulkhead(ctx, t, bx, LW - bx, 0, back.y);
    // side walls closing in toward the bulkhead, with a window by every row
    for (const side of [-1, 1]) {
      const X = (v) => (side < 0 ? v : LW - v);
      ctx.beginPath();
      ctx.moveTo(X(0), 0); ctx.lineTo(X(bx), 0); ctx.lineTo(X(bx), back.y); ctx.lineTo(X(nx), GALLEY_Y); ctx.lineTo(X(0), GALLEY_Y); ctx.closePath();
      const g = ctx.createLinearGradient(X(0), 0, X(bx), 0);
      g.addColorStop(0, '#d9dde6'); g.addColorStop(1, '#f7f8fb');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#aab3c4'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(X(bx), back.y); ctx.lineTo(X(nx), GALLEY_Y); ctx.stroke();
      for (let i = 0; i < rows; i += 1) {
        const { y, s } = depthAt(rows, i + 0.15);
        const wx = X(wallX(s) * 0.5);
        roundRect(ctx, wx - 5 * s, y - 92 * s, 10 * s, 24 * s, 5 * s);
        ctx.fillStyle = '#ffffff'; ctx.fill();
        roundRect(ctx, wx - 3.5 * s, y - 90 * s, 7 * s, 20 * s, 3.5 * s);
        ctx.fillStyle = '#8fd0ff'; ctx.fill();
      }
    }
    // the aisle carpet, its pattern shrinking with the distance
    const half = (s) => 30 * s;
    ctx.beginPath();
    ctx.moveTo(AISLE - half(near.s), GALLEY_Y); ctx.lineTo(AISLE - half(back.s), back.y); ctx.lineTo(AISLE + half(back.s), back.y); ctx.lineTo(AISLE + half(near.s), GALLEY_Y); ctx.closePath();
    ctx.fillStyle = t.carpet; ctx.fill();
    ctx.fillStyle = t.carpetMark;
    for (let d = rows - 0.6; d > -0.3; d -= 0.5) {
      const { y, s } = depthAt(rows, d);
      ctx.beginPath(); ctx.moveTo(AISLE, y - 5 * s); ctx.lineTo(AISLE + 9 * s, y); ctx.lineTo(AISLE, y + 5 * s); ctx.lineTo(AISLE - 9 * s, y); ctx.closePath(); ctx.fill();
    }
  }
  function moodOf(seat, now) {
    const shown = moods.get(seat);
    if (shown && shown.until > now) return shown.mood;
    if (shown) moods.delete(seat);
    const waiting = callAt(core, seat);
    return waiting && waiting.patience / waiting.max < 0.35 ? 'cross' : 'calm';
  }
  function drawRow(row, now) {
    const { y, s } = depthAt(core.config.rows, row);
    for (const col of [0, 3, 1, 2]) { // window seats first, so the aisle seats overlap them
      const seat = row * SEATS_PER_ROW + col;
      drawSeat(ctx, seatX(col, s), y, s, theme(), looks[seat], moodOf(seat, now), Boolean(callAt(core, seat)), now);
    }
  }
  function drawCabin(now, walking) {
    const rows = core.config.rows, here = core.pos - 1;
    drawShell();
    let chefDrawn = false;
    const chef = () => { const { y, s } = chefAt(rows, core.pos); drawStewardess(ctx, AISLE, y, s, core.cart, walking, now, drawDish); chefDrawn = true; };
    for (let row = rows - 1; row >= 0; row -= 1) {
      if (!chefDrawn && row < here - 0.01) chef();
      drawRow(row, now);
    }
    if (!chefDrawn) chef();
  }
  function drawBubbles(now) {
    bubbleHits = [];
    const rows = core.config.rows;
    const calls = [...core.calls].sort((a, b) => rowOf(b.seat) - rowOf(a.seat)); // far ones first, near ones on top
    for (const call of calls) {
      const { y, s } = depthAt(rows, rowOf(call.seat));
      const k = Math.max(0.92, s * 1.08);
      const rect = drawBubble(ctx, seatX(call.seat % SEATS_PER_ROW, s), y - 100 * s, k, call, drawDish, now, { cart: core.cart, left: 3, right: LW - 3 });
      bubbleHits.push({ seat: call.seat, ...rect });
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
      if (action.kind === 'serve') {
        const { y: fy, s } = depthAt(rows, rowOf(action.seat));
        x = seatX(action.seat % SEATS_PER_ROW, s) - 20 * s + n * 13; y = fy - 30 * s;
      } else { const b = STATION_BOX.find((box) => box.id === action.id); x = b.x + 12 + n * 15; y = b.y + b.h - 10; }
      ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4f7b'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y + 0.5);
    });
  }
  function drawGalley(now) {
    // steel cabinets under a blue speckled countertop
    const g = ctx.createLinearGradient(0, GALLEY_Y, 0, LH);
    g.addColorStop(0, '#e6ebf2'); g.addColorStop(1, '#a9b4c6');
    ctx.fillStyle = g;
    ctx.fillRect(0, GALLEY_Y, LW, LH - GALLEY_Y);
    ctx.fillStyle = '#34548a';
    ctx.fillRect(0, GALLEY_Y, LW, 42);
    ctx.fillStyle = '#ffffff1f';
    for (let i = 0; i < 70; i += 1) ctx.fillRect((i * 97) % LW, GALLEY_Y + 3 + ((i * 31) % 36), 2, 1.5);
    ctx.fillStyle = '#23406f'; ctx.fillRect(0, GALLEY_Y + 40, LW, 4);
    // the cart's tray
    ctx.fillStyle = '#ffffff'; ctx.font = '900 12px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText('餐车', 14, CART.y + CART.h / 2 - 6);
    ctx.fillStyle = '#b9cdf0'; ctx.font = '700 9px system-ui, sans-serif';
    ctx.fillText('点菜可扔', 14, CART.y + CART.h / 2 + 9);
    for (const [i, { x, w }] of cartSlots(core.kit.cart).entries()) {
      const flash = flashes.get(`cart${i}`);
      const pop = flash && !calm() ? Math.max(0, 1 - (now - flash) / 220) : 0;
      roundRect(ctx, x, CART.y, w, CART.h, 7);
      ctx.fillStyle = core.cart[i] ? '#f4f7fc' : '#ffffff26'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = core.cart[i] ? '#c3cde0' : '#ffffff40'; ctx.stroke();
      if (core.cart[i]) drawDish(ctx, core.cart[i], x + w / 2, CART.y + CART.h / 2, 24 * (1 + pop * 0.25));
    }
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffffff'; ctx.font = '800 10px system-ui, sans-serif';
    ctx.fillText(`待办 ${core.queue.length}/${SKY.queue}`, LW - 10, CART.y + CART.h / 2);
    // what the waiting passengers still need of each dish, beyond what the cart and the cookers already hold
    const need = new Map();
    for (const call of core.calls) for (const dish of call.left) need.set(dish, (need.get(dish) ?? 0) + 1);
    for (const dish of core.cart) need.set(dish, (need.get(dish) ?? 0) - 1);
    for (const [id, slots] of Object.entries(core.cookers)) for (const slot of slots) if (slot && slotPhase(id, slot) !== 'burnt') need.set(id, (need.get(id) ?? 0) - 1);
    // stations
    for (const b of STATION_BOX) {
      const open = core.config.dishes.includes(b.id);
      const st = STATIONS[b.id];
      const flash = flashes.get(b.id);
      const pop = open && flash && !calm() ? Math.max(0, 1 - (now - flash) / 220) : 0;
      ctx.save();
      ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
      ctx.scale(1 + pop * 0.04, 1 + pop * 0.04);
      ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2));
      drawCabinet(ctx, b, st.name, ACCENT[b.id], open);
      ctx.restore();
      if (!open) {
        ctx.globalAlpha = 0.45;
        drawDish(ctx, b.id, b.x + 24, b.y + b.h / 2, 26);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#4a5670'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(`第 ${unlockRoute(b.id)} 条航线`, b.x + 44, b.y + b.h / 2);
        continue;
      }
      ctx.fillStyle = '#9fb0cf'; ctx.font = '800 9px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`${STATION_ORDER.indexOf(b.id) + 1}`, b.x + b.w - 9, b.y + 12);
      if ((need.get(b.id) ?? 0) > 0) drawNeed(ctx, b.x + b.w - 16, b.y + 11.5, need.get(b.id));
      if (st.cook === 0) { drawDispenser(ctx, b.id, b.x + b.w / 2, b.y + 42, drawDish); continue; }
      const { left, step, r } = cookerSlots(core.cookers[b.id].length);
      core.cookers[b.id].forEach((slot, i) => {
        const cx = b.x + left + i * step, cy = b.y + 43;
        const phase = slotPhase(b.id, slot);
        drawSlotBase(ctx, b.id, cx, cy, r);
        if (phase === 'empty') {
          ctx.fillStyle = b.id === 'noodle' ? '#ffffff66' : '#8d99b2'; ctx.font = '800 16px system-ui, sans-serif'; ctx.textAlign = 'center';
          ctx.fillText('+', cx, cy + 1);
          return;
        }
        if (phase === 'cooking') {
          drawDish(ctx, b.id, cx, cy, r * 1.3, { alpha: 0.45 });
          ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (slot.t / slot.cook));
          ctx.lineWidth = 4; ctx.strokeStyle = ACCENT[b.id]; ctx.stroke();
          return;
        }
        if (phase === 'burnt') { drawDish(ctx, 'burnt', cx, cy, r * 1.4); return; }
        // ready: glow, and blink red once it is close to burning
        const danger = slot.burn > 0 && slot.t > slot.cook + slot.burn * 0.55;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.lineWidth = 3;
        ctx.strokeStyle = danger ? `rgba(255, 70, 70, ${0.5 + 0.5 * Math.sin(now / 80)})` : '#36c96a';
        ctx.stroke();
        drawDish(ctx, b.id, cx, cy, r * 1.5);
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
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = '#1b2a57dd';
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
    ctx = fit.begin();
    drawCabin(now, core.pos !== before);
    drawGalley(now);
    drawBubbles(now);
    drawQueueMarks();
    drawTop();
    drawFloaters(now);
    if (toast && toast.until > now) {
      ctx.font = '800 13px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const width = ctx.measureText(toast.text).width + 28;
      roundRect(ctx, (LW - width) / 2, GALLEY_Y - 36, width, 26, 13);
      ctx.fillStyle = '#000c'; ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(toast.text, LW / 2, GALLEY_Y - 23);
    }
    fit.end();
    const busy = playing || floaters.length || (toast && toast.until > now);
    if (busy && alive) raf = requestAnimationFrame(frame);
  }

  const fuelTimer = setInterval(() => { if (alive && !overlay.hidden) refreshFuel(); }, 1000);
  // Pick up the run where it was left: the stage to fly next and the score so far.
  const saved = readJson(STORE.save);
  if (saved && Number.isInteger(saved.stage) && saved.stage >= 1 && saved.stage <= STAGES) {
    runScore = Math.max(0, Number(saved.score) || 0);
    // A run saved before the shop existed has no wallet: its score is what it earned.
    wallet = Math.max(0, Math.floor(Number(saved.wallet ?? saved.score) || 0));
    owned = Object.fromEntries(UPGRADES.map((u) => [u.id, levelOf(saved.owned, u.id)]).filter(([, level]) => level > 0));
  }
  begin(saved?.stage >= 1 && saved?.stage <= STAGES ? saved.stage : 1);
  return {
    get state() { return core; },
    get playing() { return playing; },
    get runScore() { return runScore; },
    get wallet() { return wallet; },
    get owned() { return { ...owned }; },
    get fuel() { return fuelAt(tank, Date.now()).fuel; },
    shop,
    restart,
    start,
    tapStation: (id) => act({ station: id }),
    tapSeat: (seat) => act({ seat }),
    // Where a seat's passenger is on the canvas, in logical px (tests tap there).
    pointOf(seat) { const { y, s } = depthAt(core.config.rows, rowOf(seat)); return { x: seatX(seat % SEATS_PER_ROW, s), y: y - 40 * s }; },
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
      fit.destroy();
      cancelAnimationFrame(raf);
      clearInterval(fuelTimer);
      window.removeEventListener('keydown', onKey);
      wrap.replaceChildren();
    }
  };
}
