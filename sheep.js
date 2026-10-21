// 羊了个羊（ARCADE 34）的画面：一摞摞奶油色图案牌、底下两摞盲牌、移出区、7 格槽和三个道具。
// 规则都在 sheep-core.js；画面上每张牌有自己的「显示位置」，每帧往目标位置靠，飞进槽里就是这么来的。
import { BOARD_COLS, SLOT, createLevel, findHint, isFree, onBoard, outcome, pickTile, useOut, useShuffle, useUndo } from './sheep-core.js';
import { CANDY, button, canvasGame, inRect, postScore, roundRect, store, text } from './kit.js';

const W = 360;
const H = 640;
const T = 42;
const BX = (W - BOARD_COLS * T) / 2;
const BY = 52;
const HELD_Y = 452;
const SLOT_Y = 506;
const SLOT_W = 44;
const SLOT_X = (W - SLOT * SLOT_W) / 2;
const ICONS = ['🥕', '🌽', '🍄', '🌸', '🧶', '🔔', '🍀', '🍎', '🧀', '🥚', '🍇', '🐟', '🌰', '🍓', '🍋', '🥛'];
const SAVE = store('pao-sheep');

export function mountSheep(wrap, { onHud = () => {}, onResult = null } = {}) {
  const shell = canvasGame(wrap, { width: W, height: H, label: '羊了个羊游戏画布', game: 'sheep' });
  let state = null;
  let show = new Map(); // id → { x, y }
  let pops = [];
  let hintId = null, hintUntil = 0;
  let progress = SAVE.get({ level: 1, best: 0 });
  const PROP_BTN = [
    { key: 'out', label: '移出', rect: { x: 24, y: 584, w: 96, h: 40 } },
    { key: 'undo', label: '撤回', rect: { x: 132, y: 584, w: 96, h: 40 } },
    { key: 'shuffle', label: '洗牌', rect: { x: 240, y: 584, w: 96, h: 40 } }
  ];

  const hud = () => onHud(`第 ${state.level} 关 · 桌上还剩 ${onBoard(state)} 张`);
  function begin(level, seed) {
    shell.closeCard();
    state = createLevel(level, seed);
    show = new Map(state.tiles.map((t) => [t.id, target(t)]));
    pops = [];
    hud();
    shell.poke(100);
  }

  // ---- geometry ----
  function target(tile) {
    if (tile.where === 'slot') return { x: SLOT_X + state.slot.indexOf(tile.id) * SLOT_W + (SLOT_W - T) / 2, y: SLOT_Y + 3 };
    if (tile.where === 'held') return { x: W / 2 - 1.5 * (T + 6) + state.held.indexOf(tile.id) * (T + 6) + 3, y: HELD_Y };
    return { x: BX + tile.x * T, y: BY + tile.y * T };
  }
  const order = (a, b) => a.z - b.z || a.y - b.y || a.x - b.x;

  function drawTile(ctx, tile, pos, { dim = false, back = false, glow = '' } = {}) {
    const tone = CANDY[tile.type % CANDY.length];
    ctx.save();
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 16; }
    roundRect(ctx, pos.x + 1, pos.y + 5, T - 2, T - 2, 8);
    ctx.fillStyle = '#7a9a4a';
    ctx.fill();
    ctx.shadowBlur = 0;
    roundRect(ctx, pos.x + 1, pos.y + 1, T - 2, T - 3, 8);
    ctx.fillStyle = back ? '#8fc463' : '#fffbea';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = glow || '#c9dca0';
    ctx.stroke();
    if (back) {
      ctx.fillStyle = '#ffffff55';
      for (let i = 0; i < 3; i += 1) { ctx.beginPath(); ctx.arc(pos.x + 11 + i * 10, pos.y + T / 2, 3, 0, Math.PI * 2); ctx.fill(); }
    } else {
      roundRect(ctx, pos.x + 6, pos.y + T - 9, T - 12, 4, 2);
      ctx.fillStyle = tone[0];
      ctx.fill();
      text(ctx, ICONS[tile.type], pos.x + T / 2, pos.y + T / 2 - 1, { size: 24, font: 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif' });
    }
    if (dim) { roundRect(ctx, pos.x + 1, pos.y + 1, T - 2, T - 3, 8); ctx.fillStyle = '#1d2a1499'; ctx.fill(); }
    ctx.restore();
  }

  // ---- input ----
  function tap(id) {
    if (shell.cardOpen || outcome(state) !== 'playing') return false;
    const before = state.slot.length;
    const result = pickTile(state, id);
    if (!result.ok) return false;
    if (result.cleared) {
      const at = result.cleared.map((cid) => show.get(cid));
      pops.push({ at, t0: performance.now(), type: state.tiles[id].type });
    }
    void before;
    hintId = null;
    after();
    return true;
  }
  function after() {
    hud();
    shell.poke(600);
    const end = outcome(state);
    if (end !== 'playing') setTimeout(() => { if (shell.alive && outcome(state) === end && !shell.cardOpen) finish(end); }, 450);
  }
  function prop(key) {
    if (shell.cardOpen && key !== 'out' && key !== 'undo') return;
    const ok = key === 'out' ? useOut(state) : key === 'undo' ? useUndo(state) : useShuffle(state);
    if (!ok) return shell.toast(state.props[key] <= 0 ? '这个道具本关用完了' : '现在用不了', 1200, 470);
    shell.closeCard();
    after();
  }
  shell.on('pointerdown', (event) => {
    event.preventDefault();
    const p = shell.point(event);
    for (const b of PROP_BTN) if (inRect(p, b.rect)) return prop(b.key);
    const live = state.tiles.filter((t) => t.where === 'board' || t.where === 'held').sort(order).reverse();
    for (const tile of live) {
      const pos = show.get(tile.id);
      if (p.x < pos.x || p.x > pos.x + T || p.y < pos.y || p.y > pos.y + T) continue;
      if (tile.where === 'held' || isFree(state, tile.id)) tap(tile.id);
      return;
    }
  });

  function finish(end) {
    if (end === 'won') {
      const level = state.level;
      progress = { level: level + 1, best: Math.max(progress.best, level) };
      SAVE.set(progress);
      const { note } = shell.card({ title: `第 ${level} 关通过！`, lines: [`用了 ${state.moves} 步`, `最高通关 第 ${progress.best} 关`], buttons: [{ label: '下一关', action: () => begin(level + 1) }], tone: 'won' });
      postScore(onResult, 'sheep', level, note);
    } else {
      const { level, seed } = state;
      const buttons = [{ label: '重试本关', action: () => begin(level, seed) }];
      if (state.props.out > 0) buttons.push({ label: '用「移出」继续', action: () => prop('out'), ghost: true });
      else if (state.props.undo > 0 && state.last) buttons.push({ label: '用「撤回」继续', action: () => prop('undo'), ghost: true });
      shell.card({ title: '槽满了', lines: ['7 格槽塞满就输。先拿能凑成三张的牌，别让太多种类挤在槽里。'], buttons, tone: 'lost' });
    }
  }

  // ---- drawing ----
  shell.render = (ctx, now) => {
    ctx.fillStyle = '#c7e59a';
    roundRect(ctx, 8, 40, W - 16, 412, 18);
    ctx.fill();
    text(ctx, `第 ${state.level} 关`, 18, 22, { size: 18, align: 'left' });
    text(ctx, `剩 ${onBoard(state)} 张`, W - 18, 22, { size: 13, align: 'right', color: '#c9cdf0', weight: 700 });
    let moving = false;
    const step = (tile) => {
      const goal = target(tile), cur = show.get(tile.id);
      const nx = cur.x + (goal.x - cur.x) * 0.3, ny = cur.y + (goal.y - cur.y) * 0.3;
      if (Math.abs(goal.x - nx) + Math.abs(goal.y - ny) > 0.5) moving = true; else { show.set(tile.id, goal); return goal; }
      const pos = { x: nx, y: ny };
      show.set(tile.id, pos);
      return pos;
    };
    // 桌面：从底层画到顶层
    const board = state.tiles.filter((t) => t.where === 'board').sort(order);
    const topOfStack = new Map();
    for (const t of board) if (t.stack >= 0 && (!topOfStack.has(t.stack) || t.z > topOfStack.get(t.stack).z)) topOfStack.set(t.stack, t);
    for (const t of board) {
      const pos = step(t);
      const free = isFree(state, t.id);
      const back = t.blind && topOfStack.get(t.stack) !== t;
      drawTile(ctx, t, pos, { dim: !free && !back, back, glow: t.id === hintId && now < hintUntil && Math.sin(now / 110) > 0 ? '#ff5d80' : '' });
    }
    // 移出区
    for (let i = 0; i < 3; i += 1) {
      roundRect(ctx, W / 2 - 1.5 * (T + 6) + i * (T + 6) + 3, HELD_Y, T, T, 8);
      ctx.strokeStyle = '#ffffff22';
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // 槽
    roundRect(ctx, SLOT_X - 6, SLOT_Y - 4, SLOT * SLOT_W + 12, T + 14, 12);
    ctx.fillStyle = '#5b3d22';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#8a6136';
    ctx.stroke();
    for (let i = 0; i < SLOT; i += 1) { roundRect(ctx, SLOT_X + i * SLOT_W + 2, SLOT_Y + 1, SLOT_W - 4, T + 4, 6); ctx.fillStyle = '#ffffff12'; ctx.fill(); }
    for (const t of state.tiles.filter((x) => x.where === 'held' || x.where === 'slot')) drawTile(ctx, t, step(t));
    // 消掉的三张：放大淡出
    pops = pops.filter((pop) => now - pop.t0 < 380);
    for (const pop of pops) {
      const k = (now - pop.t0) / 380;
      ctx.save();
      ctx.globalAlpha = 1 - k;
      for (const pos of pop.at) drawTile(ctx, { type: pop.type }, { x: pos.x, y: pos.y - k * 20 });
      ctx.restore();
      moving = true;
    }
    for (const b of PROP_BTN) button(ctx, b.rect, b.label, { off: state.props[b.key] <= 0, badge: state.props[b.key], color: '#ffffff22' });
    if (moving || now < hintUntil) shell.poke(16);
  };

  begin(progress.level || 1);
  // 全屏：牌堆按本关一开始的范围放大（消牌时不跟着缩放），上面的关卡、下面的移出区 / 槽 / 道具保持原大小
  let pile = null, pileOf = null;
  shell.regions = () => {
    if (pileOf !== state) {
      const spots = state.tiles.filter((t) => t.where === 'board').map(target);
      const x0 = Math.min(...spots.map((p) => p.x)), y0 = Math.min(...spots.map((p) => p.y));
      const x1 = Math.max(...spots.map((p) => p.x)) + T, y1 = Math.max(...spots.map((p) => p.y)) + T;
      pile = spots.length ? { x: Math.max(8, x0 - 14), y: Math.max(40, y0 - 14), w: 0, h: 0 } : { x: 8, y: 40, w: W - 16, h: 412 };
      if (spots.length) { pile.w = Math.min(W - 8, x1 + 14) - pile.x; pile.h = Math.min(452, y1 + 18) - pile.y; }
      pileOf = state;
    }
    return [{ x: 0, y: 0, w: W, h: 38, role: 'top' }, { ...pile, role: 'main' }, { x: 0, y: HELD_Y - 6, w: W, h: H - HELD_Y + 6, role: 'bottom' }];
  };

  return {
    get state() { return state; },
    board: 'sheep',
    restart() { begin(state.level, state.seed); },
    hint() {
      if (shell.cardOpen) return;
      hintId = findHint(state);
      hintUntil = performance.now() + 1600;
      shell.poke(1650);
    },
    tap,
    prop,
    goto(level, seed) { begin(level, seed); },
    locate(id) { const pos = target(state.tiles[id]); return shell.page(pos.x + T / 2, pos.y + T / 2); },
    destroy() { shell.destroy(); }
  };
}
