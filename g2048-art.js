// 2048: the looks. Three themes share one layout (g2048.js owns where things go and when they move);
// a theme only decides how the backdrop, the well, a tile, the plaques and the undo button are painted.
//   candy   — the house style: glossy candy tiles on deep indigo.
//   classic — the original 2048 palette: beige well, flat tiles, brown digits, magenta past 2048.
//   neon    — dark glass with glowing outlines, and every merge sets off sparks, rings and a shake (createFx).
// Nothing here keeps state except createFx; painters take the context and logical pixels.

export const G2048_THEMES = [
  { id: 'candy', name: '糖果' },
  { id: 'classic', name: '经典' },
  { id: 'neon', name: '霓虹' }
];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}
const digitsSize = (v, sizes) => sizes[Math.min(sizes.length - 1, Math.max(0, String(v).length - 2))];
const log2 = (v) => Math.round(Math.log2(v));

// ---- candy ----
// base, light, dark. The ramp walks the house palette: cool and gentle for small tiles, hot for big ones.
const CANDY = {
  2: ['#58d4de', '#a8f0f6', '#1f93a3'], 4: ['#44c986', '#8fe8b8', '#1c8a55'], 8: ['#ffd543', '#ffeb9a', '#c29a0c'],
  16: ['#ffa23c', '#ffcb8a', '#c0680a'], 32: ['#ff6f61', '#ffaaa0', '#b8382c'], 64: ['#ff5d80', '#ffa0b6', '#b92a52'],
  128: ['#e46bff', '#f2aaff', '#9a2cc0'], 256: ['#8e7bff', '#c3b8ff', '#5238c4'], 512: ['#4f8bff', '#9dc0ff', '#2457b8'],
  1024: ['#f04b4b', '#ff9a9a', '#a52222'], 2048: ['#ffcf3d', '#fff0a8', '#c78a00']
};
const CANDY_BEYOND = ['#6a3fd0', '#a98cff', '#3c1d8a']; // 4096 and up: royal violet with a gold rim
const candyPaint = (v) => CANDY[v] ?? CANDY_BEYOND;

function candyWell(ctx, { x, y, size }, slots, cell) {
  ctx.save();
  ctx.shadowColor = '#58d4de66';
  ctx.shadowBlur = 22;
  roundRect(ctx, x, y, size, size, 20);
  const g = ctx.createLinearGradient(0, y, 0, y + size);
  g.addColorStop(0, '#1a1840');
  g.addColorStop(1, '#0d0c24');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#58d4de99';
  roundRect(ctx, x, y, size, size, 20);
  ctx.stroke();
  for (const p of slots) {
    roundRect(ctx, p.x, p.y, cell, cell, 13);
    const slot = ctx.createLinearGradient(0, p.y, 0, p.y + cell);
    slot.addColorStop(0, '#0a0920');
    slot.addColorStop(1, '#1a1844');
    ctx.fillStyle = slot;
    ctx.fill();
  }
}
// One glossy tile: a drop shadow, a body that darkens toward the bottom, a lit top edge and a soft streak.
function candyTile(ctx, cx, cy, v, cell, scale) {
  const [base, light, dark] = candyPaint(v);
  const s = cell * scale;
  const x = cx - s / 2, y = cy - s / 2;
  if (v >= 128) { ctx.shadowColor = base; ctx.shadowBlur = v >= 2048 ? 26 : 12; }
  roundRect(ctx, x, y + 3 * scale, s, s, 14 * scale);
  ctx.fillStyle = dark;
  ctx.fill();
  ctx.shadowBlur = 0;
  roundRect(ctx, x, y, s, s - 3 * scale, 14 * scale);
  const g = ctx.createLinearGradient(0, y, 0, y + s);
  g.addColorStop(0, light);
  g.addColorStop(0.18, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = v > 2048 ? '#ffd543' : '#ffffff59';
  ctx.stroke();
  roundRect(ctx, x + s * 0.12, y + s * 0.08, s * 0.76, s * 0.12, s * 0.06);
  ctx.fillStyle = '#ffffff40';
  ctx.fill();
  ctx.font = `800 ${digitsSize(v, [34, 29, 24, 19]) * scale}px "Manrope", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4 * scale;
  ctx.strokeStyle = `${dark}cc`;
  ctx.strokeText(String(v), cx, cy - 1 * scale);
  ctx.fillStyle = '#fff';
  ctx.fillText(String(v), cx, cy - 1 * scale);
}

// ---- classic ----
// Tile colour and digit colour, as in the original game; past 2048 it turns magenta, then purple.
const CLASSIC = {
  2: ['#eee4da', '#776e65'], 4: ['#ede0c8', '#776e65'], 8: ['#f2b179', '#f9f6f2'], 16: ['#f59563', '#f9f6f2'],
  32: ['#f67c5f', '#f9f6f2'], 64: ['#f65e3b', '#f9f6f2'], 128: ['#edcf72', '#f9f6f2'], 256: ['#edcc61', '#f9f6f2'],
  512: ['#edc850', '#f9f6f2'], 1024: ['#edc53f', '#f9f6f2'], 2048: ['#edc22e', '#f9f6f2'], 4096: ['#e80bb8', '#f9f6f2'],
  8192: ['#c600a8', '#f9f6f2'], 16384: ['#9c0096', '#f9f6f2']
};
const CLASSIC_BEYOND = ['#6d0083', '#f9f6f2'];
const classicPaint = (v) => CLASSIC[v] ?? CLASSIC_BEYOND;
const CLASSIC_FONT = '"Clear Sans", "Helvetica Neue", Arial, system-ui, sans-serif';

function classicBackdrop(ctx, w, h) {
  ctx.fillStyle = '#faf8ef';
  ctx.fillRect(0, 0, w, h);
}
function classicWell(ctx, { x, y, size }, slots, cell) {
  roundRect(ctx, x, y, size, size, 8);
  ctx.fillStyle = '#bbada0';
  ctx.fill();
  ctx.fillStyle = '#cdc1b4';
  for (const p of slots) {
    roundRect(ctx, p.x, p.y, cell, cell, 5);
    ctx.fill();
  }
}
function classicTile(ctx, cx, cy, v, cell, scale) {
  const [bg, fg] = classicPaint(v);
  const s = cell * scale;
  roundRect(ctx, cx - s / 2, cy - s / 2, s, s, 5 * scale);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.font = `700 ${digitsSize(v, [36, 30, 24, 19]) * scale}px ${CLASSIC_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fg;
  ctx.fillText(String(v), cx, cy + 1 * scale);
}

// ---- neon ----
// One glow colour per tile; 4096 and up get a rainbow rim.
const NEON = {
  2: '#2ef2ff', 4: '#3dffa8', 8: '#b6ff3b', 16: '#ffe23b', 32: '#ffa23b', 64: '#ff4f6d',
  128: '#ff3bd4', 256: '#b44bff', 512: '#5b6bff', 1024: '#00b3ff', 2048: '#ffd84a'
};
const NEON_BEYOND = '#ffffff';
const neonColor = (v) => NEON[v] ?? NEON_BEYOND;
// Little stars behind the grid, fixed so the backdrop does not flicker between frames.
const STARS = Array.from({ length: 40 }, (_, i) => ({ x: (i * 97.3) % 360, y: (i * 151.7) % 540, r: 0.5 + (i % 3) * 0.4, a: 0.2 + ((i * 7) % 5) * 0.1 }));

function neonBackdrop(ctx, w, h) {
  const g = ctx.createRadialGradient(w / 2, 0, 10, w / 2, h * 0.3, h);
  g.addColorStop(0, '#2a0c55');
  g.addColorStop(0.55, '#0d0726');
  g.addColorStop(1, '#04020f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#7b5cff18';
  ctx.beginPath();
  for (let x = 0; x <= w; x += 24) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
  for (let y = 0; y <= h; y += 24) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
  ctx.stroke();
  for (const s of STARS) {
    ctx.globalAlpha = s.a;
    ctx.fillStyle = '#d9d2ff';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function neonWell(ctx, { x, y, size }, slots, cell) {
  ctx.save();
  roundRect(ctx, x, y, size, size, 18);
  ctx.fillStyle = '#08061cdd';
  ctx.fill();
  const rim = ctx.createLinearGradient(x, y, x + size, y + size);
  rim.addColorStop(0, '#2ef2ff');
  rim.addColorStop(1, '#ff3bd4');
  ctx.shadowColor = '#b44bff';
  ctx.shadowBlur = 18;
  ctx.lineWidth = 2;
  ctx.strokeStyle = rim;
  ctx.stroke();
  ctx.restore();
  ctx.lineWidth = 1;
  for (const p of slots) {
    roundRect(ctx, p.x + 0.5, p.y + 0.5, cell - 1, cell - 1, 11);
    ctx.fillStyle = '#ffffff07';
    ctx.fill();
    ctx.strokeStyle = '#7b5cff30';
    ctx.stroke();
  }
}
// Dark glass with a lit tube for an outline and a white-hot digit haloed in the tile's colour.
function neonTile(ctx, cx, cy, v, cell, scale) {
  const col = neonColor(v);
  const s = cell * scale;
  const x = cx - s / 2, y = cy - s / 2, r = 11 * scale;
  const glow = 10 + Math.min(16, log2(v) * 1.4);
  roundRect(ctx, x, y, s, s, r);
  ctx.shadowColor = col;
  ctx.shadowBlur = glow;
  ctx.fillStyle = '#0b0820';
  ctx.fill();
  ctx.shadowBlur = 0;
  const body = ctx.createLinearGradient(0, y, 0, y + s);
  body.addColorStop(0, `${col}40`);
  body.addColorStop(1, `${col}0d`);
  ctx.fillStyle = body;
  ctx.fill();
  let rim = col;
  if (v > 2048) {
    rim = ctx.createLinearGradient(x, y, x + s, y + s);
    ['#ff3b6b', '#ffd84a', '#3dffa8', '#2ef2ff', '#b44bff'].forEach((c, i, all) => rim.addColorStop(i / (all.length - 1), c));
  }
  ctx.shadowColor = v > 2048 ? '#ffffff' : col;
  ctx.shadowBlur = 12;
  ctx.lineWidth = 2.5 * scale;
  ctx.strokeStyle = rim;
  ctx.stroke();
  ctx.shadowBlur = 0;
  roundRect(ctx, x + 4 * scale, y + 4 * scale, s - 8 * scale, s - 8 * scale, r * 0.7);
  ctx.lineWidth = 1;
  ctx.strokeStyle = `${col}55`;
  ctx.stroke();
  ctx.font = `900 ${digitsSize(v, [32, 27, 22, 18]) * scale}px "Manrope", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = col;
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(String(v), cx, cy);
  ctx.fillText(String(v), cx, cy); // twice: a brighter halo
  ctx.shadowBlur = 0;
}

// ---- the table ----
// panel: plaque fill top/bottom, edge, label colour, the two value colours.
// button: [face top, face bottom, base, text] for on and off, the undo-count badge and the face's edge line.
const LOOKS = {
  candy: {
    backdrop: null, // the canvas CSS background shows through
    well: candyWell,
    tile: candyTile,
    swatch: (v) => [candyPaint(v)[0], '#fff'],
    panel: { top: '#ffffff2e', bottom: '#ffffff12', edge: '#ffffff33', label: '#c9cffc', score: '#ffd543', best: '#58d4de', radius: 16, font: 'system-ui, sans-serif' },
    ink: '#c9cffc', faint: '#8f96c9',
    button: { on: ['#6aa4ff', '#3f7bff', '#1e55c4', '#fff'], off: ['#6a6f93', '#555a7c', '#3e4262', '#c4c7d8'], badge: '#ff5d80', badgeOff: '#8a8ea8', badgeInk: '#fff', edge: '#ffffff55', radius: 16 },
    toast: ['#000c', '#fff'],
    pop: 0.2, trail: false, fx: false
  },
  classic: {
    backdrop: classicBackdrop,
    well: classicWell,
    tile: classicTile,
    swatch: classicPaint,
    panel: { top: '#bbada0', bottom: '#bbada0', edge: null, label: '#eee4da', score: '#ffffff', best: '#ffffff', radius: 6, font: CLASSIC_FONT },
    ink: '#776e65', faint: '#9b8f84',
    button: { on: ['#8f7a66', '#8f7a66', '#6f5d4c', '#f9f6f2'], off: ['#d6cdc4', '#d6cdc4', '#c1b5a9', '#a39689'], badge: '#f65e3b', badgeOff: '#bbada0', badgeInk: '#fff', edge: null, radius: 6 },
    toast: ['#776e65ee', '#f9f6f2'],
    pop: 0.2, trail: false, fx: false
  },
  neon: {
    backdrop: neonBackdrop,
    well: neonWell,
    tile: neonTile,
    swatch: (v) => [neonColor(v), '#0b0820'],
    panel: { top: '#2ef2ff1c', bottom: '#ff3bd410', edge: '#b44bff88', label: '#b9a8ff', score: '#ffd84a', best: '#2ef2ff', radius: 14, font: 'system-ui, sans-serif', glow: true },
    ink: '#b9a8ff', faint: '#7a6cc0',
    button: { on: ['#ff3bd4', '#9b2cff', '#5a1499', '#fff'], off: ['#3a3260', '#2c2650', '#1c1838', '#8a83b0'], badge: '#2ef2ff', badgeOff: '#4a4470', badgeInk: '#0b0820', edge: '#ffffff55', radius: 14, glow: true },
    toast: ['#0b0820ee', '#2ef2ff'],
    pop: 0.32, trail: true, fx: true
  }
};
export const themeLook = (id) => LOOKS[id] ?? LOOKS.candy;
export const isG2048Theme = (id) => Object.hasOwn(LOOKS, id);

// ---- merge effects (neon) ----
// burst() is told about a move's merges and the spawn, with the moment the slide lands; draw() paints
// whatever is alive at `now`, and shake() is the board offset for a screen shake.
const rand = (a, b) => a + Math.random() * (b - a);
export function createFx() {
  let items = [];
  let shakes = [];

  function burst({ merges, spawn, at, centre, cell, goal }) {
    for (const m of merges) {
      const p = centre(m.r, m.c), col = neonColor(m.v), tier = log2(m.v);
      const big = m.v >= 256, huge = m.v >= goal;
      items.push({ kind: 'flash', at, life: 240, x: p.x, y: p.y, s: cell, col });
      items.push({ kind: 'ring', at, life: 420 + tier * 18, x: p.x, y: p.y, r0: cell * 0.35, r1: cell * (0.85 + tier * 0.07), col, w: 3 + tier * 0.25 });
      if (m.v >= 64) items.push({ kind: 'ring', at: at + 70, life: 520, x: p.x, y: p.y, r0: cell * 0.2, r1: cell * (1.1 + tier * 0.08), col: '#ffffff', w: 2 });
      if (big) items.push({ kind: 'rays', at, life: 620 + tier * 20, x: p.x, y: p.y, len: cell * (1.1 + tier * 0.06), col, spin: rand(0, Math.PI) });
      const count = Math.min(46, 10 + tier * 3) + (huge ? 50 : 0);
      for (let i = 0; i < count; i += 1) {
        const a = rand(0, Math.PI * 2), speed = rand(110, 280) * (1 + tier * 0.05) * (huge ? 1.4 : 1);
        items.push({
          kind: 'spark', at, life: rand(420, 820) + (huge ? 300 : 0), x: p.x, y: p.y,
          vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, size: rand(1.8, 4.2), col: Math.random() < 0.25 ? '#ffffff' : col
        });
      }
      items.push({ kind: 'text', at: at + 40, life: 760, x: p.x, y: p.y - cell * 0.25, text: `+${m.v}`, col });
      if (m.v >= 64) shakes.push({ at, life: 220 + tier * 14, amp: Math.min(9, 1.2 + (tier - 5) * 1.1) });
      if (huge) items.push({ kind: 'nova', at, life: 700, col });
    }
    if (merges.length >= 3) items.push({ kind: 'combo', at: at + 60, life: 950, text: `COMBO ×${merges.length}` });
    if (spawn) {
      const p = centre(spawn.r, spawn.c);
      items.push({ kind: 'ring', at, life: 360, x: p.x, y: p.y, r0: cell * 0.1, r1: cell * 0.62, col: neonColor(spawn.v), w: 1.5 });
    }
  }
  const alive = (now) => {
    items = items.filter((f) => now < f.at + f.life);
    shakes = shakes.filter((s) => now < s.at + s.life);
    return items.length > 0 || shakes.length > 0;
  };
  function shake(now) {
    let amp = 0;
    for (const s of shakes) {
      const t = (now - s.at) / s.life;
      if (t >= 0 && t < 1) amp = Math.max(amp, s.amp * (1 - t) ** 2);
    }
    return amp ? { x: rand(-amp, amp), y: rand(-amp, amp) } : { x: 0, y: 0 };
  }
  function draw(ctx, now, w, h, board) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of items) {
      const t = (now - f.at) / f.life;
      if (t < 0 || t >= 1) continue;
      const fade = 1 - t;
      if (f.kind === 'flash') {
        const s = f.s * (1 + 0.25 * t);
        ctx.globalAlpha = fade ** 2 * 0.9;
        roundRect(ctx, f.x - s / 2, f.y - s / 2, s, s, 12);
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = f.col;
        ctx.shadowBlur = 30;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else if (f.kind === 'ring') {
        const k = 1 - (1 - t) ** 3;
        ctx.globalAlpha = fade;
        ctx.lineWidth = f.w * fade + 0.5;
        ctx.strokeStyle = f.col;
        ctx.shadowColor = f.col;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r0 + (f.r1 - f.r0) * k, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else if (f.kind === 'rays') {
        ctx.globalAlpha = fade * 0.75;
        ctx.fillStyle = f.col;
        const spin = f.spin + t * 1.2, len = f.len * (0.6 + 0.4 * Math.sin(Math.min(1, t * 2) * Math.PI / 2));
        for (let i = 0; i < 8; i += 1) {
          const a = spin + (i * Math.PI) / 4, wide = 0.09;
          ctx.beginPath();
          ctx.moveTo(f.x, f.y);
          ctx.lineTo(f.x + Math.cos(a - wide) * len, f.y + Math.sin(a - wide) * len);
          ctx.lineTo(f.x + Math.cos(a + wide) * len, f.y + Math.sin(a + wide) * len);
          ctx.closePath();
          ctx.fill();
        }
      } else if (f.kind === 'spark') {
        // Velocity decays exponentially, so the distance travelled is v·(1 − e^(−k·t))/k.
        const sec = (now - f.at) / 1000, k = 3.2, travel = (1 - Math.exp(-k * sec)) / k, speedNow = Math.exp(-k * sec);
        const x = f.x + f.vx * travel, y = f.y + f.vy * travel + 40 * sec * sec;
        const tail = 0.06 * speedNow;
        ctx.globalAlpha = fade;
        ctx.strokeStyle = f.col;
        ctx.lineWidth = f.size * (0.4 + fade * 0.6);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - f.vx * tail, y - f.vy * tail);
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (f.kind === 'nova') {
        ctx.globalAlpha = fade ** 2 * 0.45;
        ctx.fillStyle = f.col;
        ctx.fillRect(0, 0, w, h);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const f of items) {
      const t = (now - f.at) / f.life;
      if (t < 0 || t >= 1 || (f.kind !== 'text' && f.kind !== 'combo')) continue;
      const fade = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.globalAlpha = fade;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (f.kind === 'text') {
        ctx.font = '900 17px system-ui, sans-serif';
        ctx.shadowColor = f.col;
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffffff';
        ctx.fillText(f.text, f.x, f.y - 34 * (1 - (1 - t) ** 2));
      } else {
        const pop = t < 0.15 ? 0.6 + (t / 0.15) * 0.55 : 1.15 - Math.min(0.15, (t - 0.15) * 0.6);
        ctx.save();
        ctx.translate(board.x + board.size / 2, board.y + board.size / 2);
        ctx.scale(pop, pop);
        ctx.font = 'italic 900 34px system-ui, sans-serif';
        const g = ctx.createLinearGradient(-110, 0, 110, 0);
        g.addColorStop(0, '#2ef2ff');
        g.addColorStop(0.5, '#ffffff');
        g.addColorStop(1, '#ff3bd4');
        ctx.shadowColor = '#ff3bd4';
        ctx.shadowBlur = 20;
        ctx.fillStyle = g;
        ctx.fillText(f.text, 0, 0);
        ctx.restore();
      }
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }
  return {
    burst,
    draw,
    shake,
    alive,
    clear() { items = []; shakes = []; },
    get count() { return items.length; }
  };
}
