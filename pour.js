// 倒水排序: the view. One 2D canvas: the shelf of finished colours on top, the tubes in the middle,
// the props along the bottom. pour-core.js decides what a tap does; this module draws the tubes and
// plays the events back: the chosen tube swings over its target and tips, the liquid runs across, and a
// tube that fills with one colour is sealed and flies up to the shelf.
// The core state is always up to date; `vis` is what is currently shown, one event behind.
import { addTube, createState, findHint, outcome, pour, POUR, shuffle, stageScore, STAGES, stars, undo } from './pour-core.js';
import { LEVEL_DEFS } from './pour-levels.js';

const LW = 360;
const LH = 640;
const STORE = { best: 'pao-pour-best', save: 'pao-pour-save' };
const readJson = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const writeJson = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ } };
const calm = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

// base, light, dark — in COLORS order.
const PAL = [
  ['#f04b4b', '#ff8d8d', '#a82626'], ['#3d8bff', '#8dbbff', '#1f55b3'], ['#38c26b', '#86e3a8', '#1d8444'], ['#ffcf3d', '#ffe58a', '#b88c0a'],
  ['#9b6bff', '#c6aaff', '#6038c4'], ['#ff8f2e', '#ffbb7a', '#b3560a'], ['#ff77c0', '#ffb0dc', '#b83d86'], ['#2fcfd6', '#8ceef2', '#17878d'],
  ['#a6683a', '#d29a6a', '#6b3f1d'], ['#a9e03a', '#d3f27f', '#6c9210'], ['#14806f', '#4fc1ae', '#0a4d42'], ['#d12fcb', '#ee82ea', '#8a1486']
];
const FIELD = { x: 10, y: 80, w: 340, h: 452 };
const SHELF = { x: 6, y: 6, w: LW - 12, h: 60 };
const BAR = { y: 548, h: 76 };
const BUTTONS = [
  { id: 'undo', icon: '↶', label: '回退' },
  { id: 'add', icon: '＋', label: '空瓶' },
  { id: 'shuffle', icon: '⇄', label: '打乱' },
  { id: 'hint', icon: '💡', label: '提示' },
  { id: 'redo', icon: '↻', label: '重来' }
];
const BTN = { w: 60, h: 56, gap: 8 };
const btnX = (index) => (LW - (BUTTONS.length * BTN.w + (BUTTONS.length - 1) * BTN.gap)) / 2 + index * (BTN.w + BTN.gap);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}

export function mountPour(wrap, { onHud = () => {}, onResult = null } = {}) {
  let alive = true;
  let epoch = 0; // bumped by every new level, so a half-played move stops touching the next one
  let runScore = 0;
  let best = Number(readJson(STORE.best)) || 0;
  let core = null;
  let vis = null;
  let lay = null;
  let busy = false;
  let selected = null;
  let animUntil = 0;
  let raf = 0;
  const anims = [];
  const hidden = new Set(); // tubes an animation is drawing itself
  const marks = new Map(); // tube -> { kind, until }
  let toast = null;
  let flash = 0; // end of a quick shake of every tube (shuffle)

  const canvas = el('canvas', 'game-canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = LW * dpr;
  canvas.height = LH * dpr;
  canvas.setAttribute('aria-label', '倒水排序游戏画布');
  const overlay = el('div', 'pour-overlay');
  overlay.hidden = true;
  wrap.replaceChildren(canvas, overlay);
  const ctx = canvas.getContext('2d');

  const poke = (ms) => { animUntil = Math.max(animUntil, performance.now() + ms); if (!raf && alive) raf = requestAnimationFrame(frame); };
  const speed = (ms) => (calm() ? ms * 0.2 : ms);
  const tween = (ms, draw) => new Promise((resolve) => {
    anims.push({ t0: performance.now(), ms: speed(ms), draw, resolve });
    poke(speed(ms) + 60);
  });
  const hud = () => onHud(`第 ${core.stage}/${STAGES} 关 · ${runScore} 分 · ${core.moves}/${core.par} 步`);
  const say = (text) => { toast = { text, until: performance.now() + 1500 }; poke(1600); };

  // ---- level ----
  function begin(stage) {
    epoch += 1;
    busy = false;
    selected = null;
    marks.clear();
    hidden.clear();
    toast = null;
    anims.splice(0).forEach((anim) => anim.resolve());
    core = createState(LEVEL_DEFS[stage - 1]);
    sync();
    overlay.hidden = true;
    hud();
    poke(100);
  }
  // Show exactly what the core holds (a new level, an undo, a shuffle, an added tube).
  function sync() {
    vis = { tubes: core.tubes.map((t) => t.slice()), sealed: core.sealed.slice(), shelf: core.collected.slice(), total: core.tubes.reduce((n, t) => n + t.length, 0) / POUR.CAP + core.collected.length };
    layout();
  }
  const save = (stage, score) => writeJson(STORE.save, { stage, score });
  function restart() {
    runScore = 0;
    save(1, 0);
    begin(1);
  }

  // ---- geometry ----
  function layout() {
    const n = vis.tubes.length;
    const rows = n <= 4 ? 1 : n <= 9 ? 2 : 3;
    const cols = Math.ceil(n / rows);
    const gap = 10;
    const tw = Math.min(52, (FIELD.w - (cols - 1) * gap) / cols);
    const rowH = FIELD.h / rows;
    const th = Math.min(rowH - 36, tw * 3.2);
    lay = { rows, cols, tw, th, gap, rowH, ch: (th - 12) / POUR.CAP };
  }
  function tubePos(i) {
    const { rows, cols, tw, th, gap, rowH } = lay;
    const row = Math.floor(i / cols), col = i % cols;
    const count = Math.min(cols, vis.tubes.length - row * cols);
    const x0 = FIELD.x + (FIELD.w - (count * tw + (count - 1) * gap)) / 2;
    return { x: x0 + col * (tw + gap), y: FIELD.y + row * rowH + (rowH - th) / 2 + 12 };
  }
  const tubeAt = (px, py) => {
    for (let i = 0; i < vis.tubes.length; i += 1) {
      if (vis.sealed[i] || hidden.has(i)) continue;
      const { x, y } = tubePos(i);
      if (px >= x - 4 && px <= x + lay.tw + 4 && py >= y - 22 && py <= y + lay.th + 6) return i;
    }
    return -1;
  };
  const shelfSlot = (index) => {
    const slots = Math.max(1, vis.total);
    const size = Math.min(24, (SHELF.w - 24) / slots - 4);
    const step = size + 4;
    return { x: SHELF.x + (SHELF.w - slots * step + 4) / 2 + index * step + size / 2, y: SHELF.y + 38, size };
  };

  // ---- drawing a tube ----
  // layers: [{ color, h }] from the bottom, h in cells. `at` tips the tube about one of its rim corners:
  // { px, py } is where that corner is, `side` which one (1 right, -1 left) and `angle` how far.
  function drawGlass(x, y, layers, { lift = 0, at = null, alpha = 1, glow = '', shake = 0, scale = 1 } = {}) {
    const { tw, th, ch } = lay;
    const local = () => {
      if (at) {
        ctx.translate(at.px, at.py);
        ctx.rotate(at.angle);
        ctx.translate(at.side > 0 ? -tw : 0, 0);
      } else {
        ctx.translate(x + shake + tw / 2, y - lift + th / 2);
        ctx.scale(scale, scale);
        ctx.translate(-tw / 2, -th / 2);
      }
    };
    const bottom = Math.max(tw * 0.42, 6);
    ctx.save();
    ctx.globalAlpha = alpha;
    local();
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 16; }
    roundRect(ctx, 0, 0, tw, th, [4, 4, bottom, bottom]);
    ctx.fillStyle = '#ffffff1c';
    ctx.fill();
    ctx.shadowBlur = 0;
    // the liquid, clipped to the inside of the glass
    ctx.save();
    roundRect(ctx, 3, 3, tw - 6, th - 5, [2, 2, bottom - 3, bottom - 3]);
    ctx.clip();
    if (at) {
      // The tube is tipped, so lay the liquid in level bands from its lowest point instead.
      const cos = Math.cos(at.angle), sin = Math.sin(at.angle);
      const world = (lx, ly) => [at.px + (lx - (at.side > 0 ? tw : 0)) * cos - ly * sin, at.py + (lx - (at.side > 0 ? tw : 0)) * sin + ly * cos];
      const low = Math.max(world(0, 0)[1], world(tw, 0)[1], world(0, th)[1], world(tw, th)[1]);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      let top = low - 3;
      for (const layer of layers) {
        const h = layer.h * ch;
        ctx.fillStyle = PAL[layer.color][0];
        ctx.fillRect(at.px - th * 1.5, top - h, th * 3, h + 0.6);
        top -= h;
      }
    } else {
      let top = th - 5;
      for (const layer of layers) {
        const h = layer.h * ch;
        ctx.fillStyle = PAL[layer.color][0];
        ctx.fillRect(2, top - h, tw - 4, h + 0.6);
        ctx.fillStyle = PAL[layer.color][1];
        ctx.fillRect(2, top - h, tw - 4, 1.6);
        top -= h;
      }
    }
    ctx.restore();
    // glass: rim, outline, and a soft streak down the left
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = glow || '#ffffffb8';
    roundRect(ctx, 0, 0, tw, th, [4, 4, bottom, bottom]);
    ctx.stroke();
    roundRect(ctx, tw * 0.17, 8, tw * 0.1, th * 0.62, tw * 0.05);
    ctx.fillStyle = '#ffffff40';
    ctx.fill();
    ctx.restore();
  }
  // Runs of one colour as single layers; `cells` is bottom to top.
  function runsOf(cells, tail = null) {
    const layers = [];
    for (const color of cells) {
      const last = layers[layers.length - 1];
      if (last && last.color === color) last.h += 1;
      else layers.push({ color, h: 1 });
    }
    if (tail && tail.h > 0.001) {
      const last = layers[layers.length - 1];
      if (last && last.color === tail.color) last.h += tail.h;
      else layers.push({ color: tail.color, h: tail.h });
    }
    return layers;
  }

  // ---- playback ----
  // `from` swings over `to` and tips; the top `count` cells run across.
  async function playPour(event, mine) {
    const { from, to, count, color } = event;
    const a = tubePos(from), b = tubePos(to);
    const { tw, th, ch } = lay;
    // The tipped tube lies back toward the middle of the board, so it never runs off the edge.
    const side = b.x + tw / 2 > LW / 2 ? 1 : -1;
    const pivotAt = { px: b.x + tw / 2 - side * tw * 0.15, py: b.y - 14 };
    const rest = { px: a.x + (side > 0 ? tw : 0), py: a.y - 16 }; // it starts where the selected tube hangs, lifted
    const srcBase = vis.tubes[from].slice(0, vis.tubes[from].length - count);
    const dstBase = vis.tubes[to].slice();
    const surface = b.y + th - 5 - dstBase.length * ch; // where the stream lands
    hidden.add(from);
    hidden.add(to);
    await tween(560, (g, t) => {
      const swing = t < 0.25 ? ease(t / 0.25) : t > 0.85 ? 1 - ease((t - 0.85) / 0.15) : 1;
      const flow = ease(clamp01((t - 0.25) / 0.55));
      const at = { px: mix(rest.px, pivotAt.px, swing), py: mix(rest.py, pivotAt.py, swing), side, angle: side * swing * 1.9 };
      drawGlass(b.x, b.y, runsOf(dstBase, { color, h: count * flow }));
      drawGlass(a.x, a.y, runsOf(srcBase, { color, h: count * (1 - flow) }), { at });
      if (flow > 0 && flow < 1 && swing > 0.9) {
        g.save();
        g.strokeStyle = PAL[color][0];
        g.lineWidth = 4;
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(at.px, at.py + 3);
        g.lineTo(at.px - side * 1, surface - count * flow * ch);
        g.stroke();
        g.restore();
      }
    });
    hidden.delete(from);
    hidden.delete(to);
    if (mine !== epoch || !alive) return;
    vis.tubes[from] = core.tubes[from].slice();
    vis.tubes[to] = event.sealedCells ? event.sealedCells : vis.tubes[to].concat(Array(count).fill(color));
  }
  // The full tube of one colour lifts off and flies to its place on the shelf.
  async function playSeal(event, mine) {
    const { tube, color } = event;
    const p = tubePos(tube);
    const slot = shelfSlot(vis.shelf.length);
    hidden.add(tube);
    const cells = Array(POUR.CAP).fill(color);
    await tween(520, (g, t) => {
      const lift = ease(clamp01(t / 0.35));
      const fly = ease(clamp01((t - 0.3) / 0.7));
      const scale = mix(1, 0.2, fly);
      drawGlass(mix(p.x, slot.x - lay.tw / 2, fly), mix(p.y - lift * 16, slot.y - lay.th / 2, fly), runsOf(cells), { scale, alpha: 1 - fly * 0.3, glow: '#ffffff' });
    });
    hidden.delete(tube);
    if (mine !== epoch || !alive) return;
    vis.sealed[tube] = true;
    vis.tubes[tube] = [];
    vis.shelf.push(color);
    poke(300);
  }

  async function move(from, to) {
    const mine = epoch;
    const result = pour(core, from, to);
    if (!result.ok) return false;
    busy = true;
    selected = null;
    const pourEvent = result.events[0];
    const seal = result.events[1];
    // when this pour fills the tube, show it filled before it lifts off
    await playPour(seal ? { ...pourEvent, sealedCells: Array(POUR.CAP).fill(pourEvent.color) } : pourEvent, mine);
    if (mine !== epoch || !alive) return true;
    hud();
    if (seal) await playSeal(seal, mine);
    if (mine !== epoch || !alive) return true;
    busy = false;
    finish();
    return true;
  }
  function finish() {
    const state = outcome(core);
    if (state === 'won') return won();
    if (state === 'lost') return lost();
    if (state === 'stuck') say('没有能倒的了：试试回退、加空瓶或打乱');
  }

  // ---- taps ----
  const canPour = (from, to) => {
    const source = core.tubes[from], target = core.tubes[to];
    if (!source.length || core.sealed[to] || target.length >= core.cap) return false;
    return !target.length || target[target.length - 1] === source[source.length - 1];
  };
  function tapTube(i) {
    if (selected === null) {
      if (vis.tubes[i].length) selected = i;
    } else if (selected === i) {
      selected = null;
    } else if (canPour(selected, i)) {
      move(selected, i);
    } else {
      // A pour that is not allowed just moves the choice to the tube that was tapped.
      selected = vis.tubes[i].length ? i : null;
    }
    poke(250);
  }
  function props(id) {
    if (!alive || busy || !overlay.hidden) return;
    let result = null;
    if (id === 'undo') {
      result = undo(core);
      if (result.ok) { selected = null; sync(); poke(300); hud(); } else say(result.reason === 'none-left' ? '回退次数用完了' : '还没有可以回退的一步');
    } else if (id === 'add') {
      result = addTube(core);
      if (result.ok) { sync(); poke(300); } else say('这一关的空瓶已经加过了');
    } else if (id === 'shuffle') {
      result = shuffle(core);
      if (result.ok) { selected = null; sync(); flash = performance.now() + speed(420); poke(500); } else say(result.reason === 'none-left' ? '这一关已经打乱过了' : '现在没法打乱');
    } else if (id === 'hint') {
      hint();
    } else if (id === 'redo') {
      begin(core.stage);
    }
    if (result?.ok) finish();
  }
  function hint() {
    if (!alive || busy || !overlay.hidden) return;
    const move = findHint(core);
    if (!move) return say('这一步很难，先试试回退或打乱');
    marks.set(move.from, { kind: 'from', until: performance.now() + 2000 });
    marks.set(move.to, { kind: 'to', until: performance.now() + 2000 });
    poke(2100);
  }
  function onPointer(event) {
    if (!alive || !overlay.hidden) return;
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) * LW / rect.width, py = (event.clientY - rect.top) * LH / rect.height;
    event.preventDefault();
    if (py >= BAR.y) {
      const index = BUTTONS.findIndex((_, k) => px >= btnX(k) && px <= btnX(k) + BTN.w);
      if (index >= 0) props(BUTTONS[index].id);
      return;
    }
    if (busy) return;
    const i = tubeAt(px, py);
    if (i >= 0) tapTube(i);
    else { selected = null; poke(150); }
  }
  canvas.addEventListener('pointerdown', onPointer);

  // ---- end of a level ----
  function card(title, lines, label, action, cls = '') {
    overlay.replaceChildren();
    overlay.className = `pour-overlay ${cls}`;
    const box = el('div', 'pour-card');
    box.append(el('strong', '', title));
    for (const line of lines) box.append(el('p', '', line));
    const button = el('button', 'pour-again', label);
    button.addEventListener('click', action);
    box.append(button);
    overlay.append(box);
    overlay.hidden = false;
    return box;
  }
  function won() {
    const stage = core.stage;
    const earned = stageScore(core), got = stars(core);
    runScore += earned;
    hud();
    if (runScore > best) { best = runScore; writeJson(STORE.best, best); }
    const last = stage >= STAGES;
    save(last ? 1 : stage + 1, last ? 0 : runScore);
    const box = card(last ? '全部通关！' : `第 ${stage} 关完成`, [
      `${'★'.repeat(got)}${'☆'.repeat(3 - got)}  ${core.moves} 步（最少 ${core.par} 步）`,
      `本关 +${earned} · 总分 ${runScore} · 本机最佳 ${best}`
    ], last ? '再来一局' : '下一关', last ? restart : () => begin(stage + 1), 'won');
    const note = el('p', 'pour-note');
    box.insertBefore(note, box.lastChild);
    onResult?.('pour', runScore).then((text) => { if (text && note.isConnected) note.textContent = text; });
  }
  function lost() {
    const stage = core.stage;
    card('倒不动了', ['没有能倒的了，道具也都用完了。', '这一关的瓶子不会变，换个倒法再试一次。'], '重试本关', () => begin(stage));
  }

  // ---- drawing the scene ----
  function drawShelf(now) {
    roundRect(ctx, SHELF.x, SHELF.y, SHELF.w, SHELF.h, 12);
    ctx.fillStyle = '#ffffff1f';
    ctx.fill();
    ctx.fillStyle = '#e8ebff';
    ctx.font = '700 12px system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText('收集架', SHELF.x + 12, SHELF.y + 14);
    ctx.textAlign = 'right';
    ctx.fillText(`${vis.shelf.length}/${vis.total} 瓶`, SHELF.x + SHELF.w - 12, SHELF.y + 14);
    for (let i = 0; i < vis.total; i += 1) {
      const { x, y, size } = shelfSlot(i);
      roundRect(ctx, x - size / 2, y - size / 2, size, size, size * 0.3);
      if (i < vis.shelf.length) {
        ctx.fillStyle = PAL[vis.shelf[i]][0];
        ctx.fill();
        ctx.strokeStyle = PAL[vis.shelf[i]][1];
      } else {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#ffffff40';
      }
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  function drawTubes(now) {
    for (let i = 0; i < vis.tubes.length; i += 1) {
      if (vis.sealed[i] || hidden.has(i)) continue;
      const { x, y } = tubePos(i);
      const mark = marks.get(i);
      let glow = '';
      if (mark && mark.until > now) glow = Math.sin(now / 130) > 0 ? (mark.kind === 'from' ? '#ffffff' : '#ffd543') : '';
      const shake = flash > now ? Math.sin(now / 22 + i * 1.7) * 3 : 0;
      drawGlass(x, y, runsOf(vis.tubes[i]), { lift: selected === i ? 16 : 0, glow: selected === i ? '#ffd543' : glow, shake });
    }
  }
  function drawBar() {
    BUTTONS.forEach((button, k) => {
      const x = btnX(k), y = BAR.y + 6;
      const left = button.id === 'undo' ? core.left.undo : button.id === 'add' ? core.left.add : button.id === 'shuffle' ? core.left.shuffle : null;
      const off = left === 0 || (button.id === 'undo' && !core.history.length);
      roundRect(ctx, x, y, BTN.w, BTN.h, 12);
      ctx.fillStyle = off ? '#5b5f7d' : '#3f7bff';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#ffffff55';
      ctx.stroke();
      ctx.fillStyle = off ? '#c4c7d8' : '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '700 20px system-ui, sans-serif';
      ctx.fillText(button.icon, x + BTN.w / 2, y + 20);
      ctx.font = '700 12px system-ui, sans-serif';
      ctx.fillText(button.label, x + BTN.w / 2, y + 43);
      if (left !== null) {
        ctx.beginPath();
        ctx.arc(x + BTN.w - 7, y + 7, 9, 0, Math.PI * 2);
        ctx.fillStyle = off ? '#8a8ea8' : '#ff5d80';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '800 11px system-ui, sans-serif';
        ctx.fillText(String(left), x + BTN.w - 7, y + 7.5);
      }
    });
  }
  function frame(now) {
    raf = 0;
    if (!alive) return;
    for (let i = anims.length - 1; i >= 0; i -= 1) {
      if (now - anims[i].t0 >= anims[i].ms) { const [done] = anims.splice(i, 1); done.resolve(); }
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    drawShelf(now);
    drawTubes(now);
    drawBar();
    for (const anim of anims) anim.draw(ctx, Math.min(1, (now - anim.t0) / anim.ms));
    if (toast && toast.until > now) {
      ctx.font = '800 14px system-ui, sans-serif';
      const width = ctx.measureText(toast.text).width + 28;
      roundRect(ctx, (LW - width) / 2, BAR.y - 34, width, 28, 14);
      ctx.fillStyle = '#000c';
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(toast.text, LW / 2, BAR.y - 20);
    }
    const marking = [...marks.values()].some((mark) => mark.until > now) || (toast && toast.until > now) || flash > now;
    if (anims.length || marking || now < animUntil) raf = requestAnimationFrame(frame);
  }

  // Pick up where the last visit stopped; a finished run starts again from stage 1.
  const saved = readJson(STORE.save);
  if (saved && Number.isInteger(saved.stage) && saved.stage >= 1 && saved.stage <= STAGES) {
    runScore = Math.max(0, Number(saved.score) || 0);
    begin(saved.stage);
  } else {
    restart();
  }
  return {
    get state() { return core; },
    get busy() { return busy; },
    get selected() { return selected; },
    restart,
    // Jump to a stage with a fresh run (used by tests and for trying a level).
    goto(stage) { runScore = 0; begin(stage); },
    hint,
    props,
    tap(i) { if (!busy && overlay.hidden && vis.tubes[i] && !vis.sealed[i]) tapTube(i); },
    // Where a tube sits on the page, for tests that click it.
    locate(i) {
      const rect = canvas.getBoundingClientRect(), p = tubePos(i);
      return { x: rect.left + (p.x + lay.tw / 2) * rect.width / LW, y: rect.top + (p.y + lay.th / 2) * rect.height / LH };
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      anims.splice(0).forEach((anim) => anim.resolve());
      canvas.removeEventListener('pointerdown', onPointer);
      wrap.replaceChildren();
    }
  };
}
