// Original vector artwork for the three arcade boards.
//
// One visual language across all games: candy-clay volumes lit from the top left,
// a chunky dark outline so shapes stay readable at phone size, a soft contact
// shadow under everything, and a coloured glow on whatever the player must react
// to. Nothing here is loaded from the network — every shape is drawn with canvas
// paths so the boards stay crisp at any device pixel ratio.

export const SHADES = {
  red: { base: '#ff5d6c', light: '#ffb0b8', dark: '#bf2a44', edge: '#7d1528', rim: '#ffd7db', glow: '#ff5d6c' },
  yellow: { base: '#ffd543', light: '#fff2b4', dark: '#d1920d', edge: '#8a5d05', rim: '#fff6cd', glow: '#ffd543' },
  green: { base: '#44c986', light: '#a8f3ce', dark: '#1d8a58', edge: '#0f5437', rim: '#d0fbe6', glow: '#44c986' },
  blue: { base: '#58a8f0', light: '#badcff', dark: '#1f63b6', edge: '#123f74', rim: '#d9edff', glow: '#58a8f0' },
  purple: { base: '#a78bfa', light: '#ded3ff', dark: '#6a46d4', edge: '#3f2889', rim: '#ece4ff', glow: '#a78bfa' },
  slate: { base: '#798093', light: '#c2c8d6', dark: '#454b5c', edge: '#262a37', rim: '#dbe0ea', glow: '#798093' }
};
export const PLAYER_SHADES = [
  { base: '#58d4de', light: '#c4f7fb', dark: '#1b8b98', edge: '#0c525c', rim: '#e0fdff', glow: '#58d4de' },
  { base: '#ff9d5c', light: '#ffdcbb', dark: '#c25a18', edge: '#7d3407', rim: '#ffeedd', glow: '#ff9d5c' }
];
const shade = (color) => SHADES[color] || SHADES.slate;

export function withAlpha(hex, alpha) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const int = parseInt(full, 16);
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

// The device scale the current transform is drawing at (device pixel ratio times
// any board-local zoom), so cached artwork can be rasterised at native resolution.
function deviceScale(ctx) {
  const t = ctx.getTransform();
  return Math.max(1, Math.min(3, Math.hypot(t.a, t.b) || 1));
}

const sprites = new Map();
function sprite(key, w, h, scale, paint) {
  const k = `${key}|${w.toFixed(2)}|${h.toFixed(2)}|${scale.toFixed(2)}`;
  const hit = sprites.get(k);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w * scale));
  canvas.height = Math.max(1, Math.ceil(h * scale));
  const c = canvas.getContext('2d');
  c.scale(scale, scale);
  paint(c, w, h);
  if (sprites.size > 260) sprites.clear();
  sprites.set(k, canvas);
  return canvas;
}
// Paints w×h worth of artwork centred on (x, y) in the caller's coordinate space.
function blit(ctx, key, x, y, w, h, paint) {
  const canvas = sprite(key, w, h, deviceScale(ctx), paint);
  ctx.drawImage(canvas, x - w / 2, y - h / 2, w, h);
}

// Full-board backdrops are smooth gradients and speckles only, so one logical-size
// copy is plenty and costs a fraction of a device-resolution one.
const backdrops = new Map();
export function backdrop(ctx, key, w, h, paint) {
  let canvas = backdrops.get(key);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    paint(canvas.getContext('2d'), w, h);
    if (backdrops.size > 4) backdrops.clear();
    backdrops.set(key, canvas);
  }
  ctx.drawImage(canvas, 0, 0, w, h);
}

export function glow(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, .55 * alpha));
  g.addColorStop(.45, withAlpha(color, .18 * alpha));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

// A rounded translucent plate for HUD clusters and banners.
export function panel(ctx, x, y, w, h, r, { fill = 'rgba(13,19,32,.72)', stroke = 'rgba(255,255,255,.14)', shadow = 0 } = {}) {
  ctx.save();
  if (shadow) { ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = shadow; ctx.shadowOffsetY = shadow * .35; }
  roundRect(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill();
  ctx.restore();
  if (stroke) { roundRect(ctx, x, y, w, h, r); ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
}

// --- Candy spheres and tiles -------------------------------------------------

function paintBall(c, w, h, color, r) {
  const s = shade(color), cx = w / 2, cy = h / 2;
  const drop = c.createRadialGradient(cx, cy + r * .62, r * .1, cx, cy + r * .62, r * .9);
  drop.addColorStop(0, 'rgba(3,6,14,.5)'); drop.addColorStop(1, 'rgba(3,6,14,0)');
  c.fillStyle = drop; c.beginPath(); c.arc(cx, cy + r * .55, r * .9, 0, Math.PI * 2); c.fill();

  const body = c.createRadialGradient(cx - r * .36, cy - r * .44, r * .05, cx + r * .12, cy + r * .2, r * 1.34);
  body.addColorStop(0, s.light); body.addColorStop(.42, s.base); body.addColorStop(1, s.dark);
  c.fillStyle = body; c.beginPath(); c.arc(cx, cy, r * .95, 0, Math.PI * 2); c.fill();

  c.save(); c.beginPath(); c.arc(cx, cy, r * .95, 0, Math.PI * 2); c.clip();
  // Bounce light rising from the lower right keeps the sphere from reading flat.
  const bounce = c.createRadialGradient(cx + r * .34, cy + r * .6, r * .04, cx + r * .34, cy + r * .6, r * .78);
  bounce.addColorStop(0, withAlpha(s.rim, .8)); bounce.addColorStop(1, withAlpha(s.rim, 0));
  c.fillStyle = bounce; c.fillRect(0, 0, w, h);
  // Glossy window highlight.
  c.translate(cx - r * .34, cy - r * .42); c.rotate(-.62);
  const spec = c.createRadialGradient(0, 0, 0, 0, 0, r * .46);
  spec.addColorStop(0, 'rgba(255,255,255,.95)'); spec.addColorStop(.55, 'rgba(255,255,255,.35)'); spec.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = spec; c.beginPath(); c.ellipse(0, 0, r * .44, r * .3, 0, 0, Math.PI * 2); c.fill();
  c.restore();

  c.strokeStyle = withAlpha(s.edge, .85); c.lineWidth = Math.max(.9, r * .085);
  c.beginPath(); c.arc(cx, cy, r * .95, 0, Math.PI * 2); c.stroke();

  if (r >= 11) {
    const eye = r * .13, ex = r * .3, ey = -r * .02;
    c.fillStyle = s.edge;
    c.beginPath(); c.arc(cx - ex, cy + ey, eye, 0, Math.PI * 2); c.arc(cx + ex, cy + ey, eye, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,.9)';
    c.beginPath(); c.arc(cx - ex + eye * .35, cy + ey - eye * .4, eye * .38, 0, Math.PI * 2); c.arc(cx + ex + eye * .35, cy + ey - eye * .4, eye * .38, 0, Math.PI * 2); c.fill();
    c.strokeStyle = withAlpha(s.edge, .8); c.lineWidth = Math.max(.8, r * .07);
    c.beginPath(); c.arc(cx, cy + r * .3, r * .2, .25, Math.PI - .25); c.stroke();
  }
}

export function drawBall(ctx, x, y, color, radius, alpha = 1) {
  const box = radius * 3;
  ctx.save(); ctx.globalAlpha *= alpha;
  blit(ctx, `ball:${color}`, x, y, box, box, (c, w, h) => paintBall(c, w, h, color, radius));
  ctx.restore();
}

function paintBlock(c, w, h, color, size) {
  const s = shade(color), r = size * .26;
  const x = (w - size) / 2, y = (h - size) / 2;

  roundRect(c, x, y + size * .09, size, size, r);
  c.fillStyle = 'rgba(3,6,14,.42)'; c.fill();

  const body = c.createLinearGradient(x, y, x, y + size);
  body.addColorStop(0, s.light); body.addColorStop(.5, s.base); body.addColorStop(1, s.dark);
  roundRect(c, x, y, size, size, r); c.fillStyle = body; c.fill();

  c.save(); roundRect(c, x, y, size, size, r); c.clip();
  const sheen = c.createLinearGradient(x, y, x + size * .5, y + size * .75);
  sheen.addColorStop(0, 'rgba(255,255,255,.42)'); sheen.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = sheen; c.fillRect(x, y, size, size);
  const floor = c.createLinearGradient(x, y + size * .55, x, y + size);
  floor.addColorStop(0, 'rgba(0,0,0,0)'); floor.addColorStop(1, 'rgba(0,0,0,.24)');
  c.fillStyle = floor; c.fillRect(x, y, size, size);
  c.restore();

  roundRect(c, x, y, size, size, r);
  c.strokeStyle = withAlpha(s.edge, .9); c.lineWidth = Math.max(1, size * .055); c.stroke();

  const eye = size * .075, ex = size * .17, ey = size * .06;
  c.fillStyle = s.edge;
  c.beginPath(); c.arc(x + size / 2 - ex, y + size / 2 + ey, eye, 0, Math.PI * 2); c.arc(x + size / 2 + ex, y + size / 2 + ey, eye, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.85)';
  c.beginPath(); c.arc(x + size / 2 - ex + eye * .3, y + size / 2 + ey - eye * .45, eye * .34, 0, Math.PI * 2); c.arc(x + size / 2 + ex + eye * .3, y + size / 2 + ey - eye * .45, eye * .34, 0, Math.PI * 2); c.fill();
  c.strokeStyle = withAlpha(s.edge, .75); c.lineWidth = Math.max(.8, size * .05);
  c.beginPath(); c.arc(x + size / 2, y + size / 2 + size * .2, size * .1, .3, Math.PI - .3); c.stroke();
}

export function drawBlock(ctx, x, y, size, color, alpha = 1) {
  if (alpha <= 0) return;
  const box = size * 1.2;
  ctx.save(); ctx.globalAlpha *= alpha;
  blit(ctx, `block:${color}`, x, y, box, box, (c, w, h) => paintBlock(c, w, h, color, size));
  ctx.restore();
}

// --- The ship every mode is steered with -------------------------------------

function paintShip(c, w, h, index, r) {
  const s = PLAYER_SHADES[index] || PLAYER_SHADES[0];
  const cx = w / 2, cy = h / 2 + r * .08;
  const drop = c.createRadialGradient(cx, cy + r * .8, r * .1, cx, cy + r * .8, r * 1.1);
  drop.addColorStop(0, 'rgba(3,6,14,.45)'); drop.addColorStop(1, 'rgba(3,6,14,0)');
  c.fillStyle = drop; c.beginPath(); c.arc(cx, cy + r * .7, r * 1.1, 0, Math.PI * 2); c.fill();

  // Two little fins behind the hull.
  c.fillStyle = s.dark;
  c.beginPath(); c.ellipse(cx - r * 1.05, cy + r * .3, r * .42, r * .26, -.5, 0, Math.PI * 2); c.fill();
  c.beginPath(); c.ellipse(cx + r * 1.05, cy + r * .3, r * .42, r * .26, .5, 0, Math.PI * 2); c.fill();
  c.strokeStyle = withAlpha(s.edge, .9); c.lineWidth = Math.max(1, r * .1);
  c.beginPath(); c.ellipse(cx - r * 1.05, cy + r * .3, r * .42, r * .26, -.5, 0, Math.PI * 2); c.stroke();
  c.beginPath(); c.ellipse(cx + r * 1.05, cy + r * .3, r * .42, r * .26, .5, 0, Math.PI * 2); c.stroke();

  // Antenna with a glowing bead.
  c.strokeStyle = s.dark; c.lineWidth = Math.max(1.2, r * .16);
  c.beginPath(); c.moveTo(cx, cy - r * .85); c.lineTo(cx, cy - r * 1.5); c.stroke();
  c.fillStyle = s.light; c.beginPath(); c.arc(cx, cy - r * 1.62, r * .2, 0, Math.PI * 2); c.fill();
  c.strokeStyle = withAlpha(s.edge, .9); c.lineWidth = Math.max(.8, r * .08); c.stroke();

  const hull = c.createRadialGradient(cx - r * .4, cy - r * .5, r * .1, cx, cy, r * 1.25);
  hull.addColorStop(0, s.light); hull.addColorStop(.45, s.base); hull.addColorStop(1, s.dark);
  c.fillStyle = hull; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = withAlpha(s.edge, .95); c.lineWidth = Math.max(1.1, r * .12); c.stroke();

  // Visor: a wide lens across the upper half of the hull.
  c.save(); c.beginPath(); c.arc(cx, cy, r * .84, 0, Math.PI * 2); c.clip();
  const visor = c.createLinearGradient(cx - r * .7, cy - r * .6, cx + r * .7, cy + r * .3);
  visor.addColorStop(0, '#eafcff'); visor.addColorStop(.5, '#9fd8ef'); visor.addColorStop(1, '#4e8fc0');
  roundRect(c, cx - r * .72, cy - r * .52, r * 1.44, r * .78, r * .3);
  c.fillStyle = visor; c.fill();
  c.strokeStyle = withAlpha(s.edge, .55); c.lineWidth = Math.max(.8, r * .07); c.stroke();
  c.fillStyle = '#1b2130';
  c.beginPath(); c.arc(cx - r * .28, cy - r * .13, r * .13, 0, Math.PI * 2); c.arc(cx + r * .28, cy - r * .13, r * .13, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.9)';
  c.beginPath(); c.arc(cx - r * .28 + r * .04, cy - r * .18, r * .05, 0, Math.PI * 2); c.arc(cx + r * .28 + r * .04, cy - r * .18, r * .05, 0, Math.PI * 2); c.fill();
  c.restore();

  // Cheek highlight so the hull reads round rather than flat.
  c.fillStyle = withAlpha(s.rim, .5);
  c.beginPath(); c.ellipse(cx - r * .42, cy - r * .48, r * .22, r * .13, -.6, 0, Math.PI * 2); c.fill();
}

export function drawShip(ctx, x, y, radius, index, alpha = 1) {
  const box = radius * 4.4;
  ctx.save(); ctx.globalAlpha *= alpha;
  glow(ctx, x, y + radius * .2, radius * 2.1, (PLAYER_SHADES[index] || PLAYER_SHADES[0]).glow, .5);
  blit(ctx, `ship:${index}`, x, y, box, box, (c, w, h) => paintShip(c, w, h, index, radius));
  ctx.restore();
}

// A ring of thruster sparks under a ship, animated from state time so host and
// guest see the same flicker.
export function drawThruster(ctx, x, y, radius, index, t) {
  const s = PLAYER_SHADES[index] || PLAYER_SHADES[0];
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const flicker = .55 + .45 * Math.sin(t * 18 + i * 2.1 + index);
    const ox = (i - 1) * radius * .5;
    const len = radius * (.7 + .5 * flicker);
    const g = ctx.createLinearGradient(x + ox, y + radius * .7, x + ox, y + radius * .7 + len);
    g.addColorStop(0, withAlpha(s.light, .85 * flicker));
    g.addColorStop(.5, withAlpha(s.glow, .5 * flicker));
    g.addColorStop(1, withAlpha(s.glow, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + ox - radius * .22, y + radius * .68);
    ctx.quadraticCurveTo(x + ox, y + radius * .68 + len, x + ox + radius * .22, y + radius * .68);
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// --- 泡噗 2: the planet at the middle of the arena ---------------------------

export function drawPlanet(ctx, cx, cy, r, t) {
  ctx.save();
  glow(ctx, cx, cy, r * 2.4, '#ffb347', .75 + .1 * Math.sin(t * 2));

  // Back half of the ring, then the sphere, then the front half.
  const drawRing = (from, to) => {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy + r * .18, r * 1.85, r * .52, -.36, from, to);
    ctx.strokeStyle = 'rgba(255,225,180,.72)'; ctx.lineWidth = r * .17; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = r * .05; ctx.stroke();
    ctx.restore();
  };
  drawRing(Math.PI, Math.PI * 2);
  drawRing(0, Math.PI);

  const body = ctx.createRadialGradient(cx - r * .38, cy - r * .42, r * .06, cx + r * .1, cy + r * .22, r * 1.3);
  body.addColorStop(0, '#fff6c9'); body.addColorStop(.42, '#ffb347'); body.addColorStop(.82, '#e0713a'); body.addColorStop(1, '#a8431f');
  ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  // Latitude bands, darker below the equator.
  for (let i = 0; i < 4; i++) {
    const y = cy - r * .5 + i * r * .34;
    ctx.fillStyle = i % 2 ? 'rgba(190,80,40,.28)' : 'rgba(255,220,150,.2)';
    ctx.beginPath();
    ctx.moveTo(cx - r, y);
    ctx.quadraticCurveTo(cx, y + r * .16, cx + r, y - r * .04);
    ctx.lineTo(cx + r, y + r * .2);
    ctx.quadraticCurveTo(cx, y + r * .36, cx - r, y + r * .2);
    ctx.closePath(); ctx.fill();
  }
  for (const [ox, oy, cr] of [[-.34, -.3, .16], [.3, -.05, .12], [-.12, .38, .14], [.42, .34, .08]]) {
    ctx.fillStyle = 'rgba(150,60,30,.32)';
    ctx.beginPath(); ctx.ellipse(cx + ox * r, cy + oy * r, cr * r, cr * r * .8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,215,160,.4)'; ctx.lineWidth = r * .04; ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,235,190,.5)'; ctx.lineWidth = r * .07;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.ellipse(cx - r * .4, cy - r * .46, r * .24, r * .15, -.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

const STARS = (() => {
  let seed = 20261008;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: 130 }, () => ({ x: rand() * 720, y: rand() * 720, r: .6 + rand() * 1.6, phase: rand() * Math.PI * 2, speed: .6 + rand() * 1.6 }));
})();

export function drawSpaceBackdrop(ctx, w, h, t) {
  backdrop(ctx, 'space', w, h, (c) => {
    const base = c.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#101a33'); base.addColorStop(.5, '#0b1226'); base.addColorStop(1, '#140f2c');
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (const [x, y, r, color] of [[110, 120, 300, '#3e5cc4'], [620, 240, 280, '#8b4fc0'], [420, 690, 320, '#2f7fa8']]) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, withAlpha(color, .3)); g.addColorStop(1, withAlpha(color, 0));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
  });
  // Twinkling on top of the cached backdrop.
  for (const star of STARS) {
    if (star.x > w || star.y > h) continue;
    const twinkle = .35 + .5 * (.5 + .5 * Math.sin(t * star.speed + star.phase));
    ctx.fillStyle = `rgba(226,236,255,${twinkle.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(star.x, star.y, star.r, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawArena(ctx, cx, cy, r, t, threat) {
  ctx.save();
  // A gravity well, not a plate: the floor fades into the starfield instead of
  // ending on a hard rim, so the planet sits inside a dip rather than on a disc.
  const floor = ctx.createRadialGradient(cx, cy, r * .04, cx, cy, r);
  floor.addColorStop(0, 'rgba(48,82,122,.96)');
  floor.addColorStop(.32, 'rgba(32,54,86,.92)');
  floor.addColorStop(.62, 'rgba(22,35,60,.76)');
  floor.addColorStop(.84, 'rgba(16,25,45,.4)');
  floor.addColorStop(1, 'rgba(13,19,36,0)');
  ctx.fillStyle = floor; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  // A slow sweep of light orbiting the well, so the floor never reads as flat.
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(t * .11);
  const sweep = ctx.createLinearGradient(-r, -r, r, r);
  sweep.addColorStop(0, 'rgba(130,195,255,0)');
  sweep.addColorStop(.5, 'rgba(130,195,255,.06)');
  sweep.addColorStop(1, 'rgba(130,195,255,0)');
  ctx.fillStyle = sweep; ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
  // Concentric guide grooves.
  for (const [radius, width, dash, alpha] of [[r * .38, 1.4, [4, 12], .18], [r * .63, 1.4, [4, 12], .15], [r * .87, 1.6, [7, 14], .22]]) {
    ctx.setLineDash(dash); ctx.strokeStyle = `rgba(155,205,255,${alpha})`; ctx.lineWidth = width;
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Rim ticks every 15°, brighter near the gate the balls drift in from.
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2;
    const long = i % 4 === 0;
    ctx.strokeStyle = long ? 'rgba(120,200,255,.26)' : 'rgba(120,200,255,.1)';
    ctx.lineWidth = long ? 2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - (long ? 13 : 8)), cy + Math.sin(a) * (r - (long ? 13 : 8)));
    ctx.lineTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
    ctx.stroke();
  }
  ctx.restore();

  // The containment ring the balls orbit inside; soft, so it reads as a field.
  ctx.strokeStyle = 'rgba(96,186,240,.26)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(140,210,255,.06)'; ctx.lineWidth = 9;
  ctx.beginPath(); ctx.arc(cx, cy, r - 5, 0, Math.PI * 2); ctx.stroke();

  if (threat) {
    const pulse = .4 + .6 * (.5 + .5 * Math.sin(t * 11));
    ctx.strokeStyle = `rgba(255,93,108,${(.35 * pulse).toFixed(3)})`; ctx.lineWidth = 16;
    ctx.beginPath(); ctx.arc(cx, cy, r - 8, 0, Math.PI * 2); ctx.stroke();
    glow(ctx, cx, cy, r, '#ff5d6c', .16 * pulse);
  }
  ctx.restore();
}

// --- 泡噗 3: the night club, the well, the monster ---------------------------

export function drawClubBackdrop(ctx, w, h, t) {
  backdrop(ctx, 'club', w, h, (c) => {
    const base = c.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#191430'); base.addColorStop(.55, '#1c1738'); base.addColorStop(1, '#241a3d');
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (const [x, y, r, color] of [[120, 90, 250, '#7b4fd8'], [610, 160, 240, '#c14bb0'], [360, 660, 300, '#4b3ad8']]) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, withAlpha(color, .3)); g.addColorStop(1, withAlpha(color, 0));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
  });
  // A floor of equaliser bars pulsing on the beat, plus a soft sweep of stage light.
  const beat = .5 + .5 * Math.sin(t * 2.1);
  for (let i = 0; i < 24; i++) {
    const x = (i + .5) * (w / 24);
    const bar = 16 + 60 * (.5 + .5 * Math.sin(t * 2.4 + i * .7)) * (.4 + .6 * beat);
    const g = ctx.createLinearGradient(0, h, 0, h - bar);
    g.addColorStop(0, 'rgba(167,139,250,.34)'); g.addColorStop(1, 'rgba(167,139,250,0)');
    ctx.fillStyle = g; ctx.fillRect(x - w / 48, h - bar, w / 24 - 3, bar);
  }
}

export function drawWell(ctx, x, y, w, h, scale, { color, spike, t, alive }) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(scale, scale);

  // Cabinet around the tube.
  roundRect(ctx, -8, -8, w + 16, h + 16, 18);
  ctx.fillStyle = '#0a0e1c'; ctx.fill();
  roundRect(ctx, -8, -8, w + 16, h + 16, 18);
  ctx.strokeStyle = withAlpha(color, .3); ctx.lineWidth = 2; ctx.stroke();

  roundRect(ctx, 0, 0, w, h, 12); ctx.fillStyle = '#0c1322'; ctx.fill();
  ctx.save(); roundRect(ctx, 0, 0, w, h, 12); ctx.clip();

  const air = ctx.createLinearGradient(0, 0, 0, h);
  air.addColorStop(0, '#0a1020'); air.addColorStop(.45, '#131c33'); air.addColorStop(1, '#182338');
  ctx.fillStyle = air; ctx.fillRect(0, 0, w, h);

  for (let c = 1; c < 11; c++) {
    ctx.fillStyle = 'rgba(140,180,255,.05)';
    ctx.fillRect(c * (w / 11) - .5, 0, 1, h);
  }
  // Tube walls catch the light from the top.
  const left = ctx.createLinearGradient(0, 0, 26, 0);
  left.addColorStop(0, 'rgba(0,0,0,.5)'); left.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = left; ctx.fillRect(0, 0, 26, h);
  const right = ctx.createLinearGradient(w, 0, w - 26, 0);
  right.addColorStop(0, 'rgba(0,0,0,.5)'); right.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = right; ctx.fillRect(w - 26, 0, 26, h);
  const lip = ctx.createLinearGradient(0, 0, 0, 90);
  lip.addColorStop(0, 'rgba(0,0,0,.55)'); lip.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lip; ctx.fillRect(0, 0, w, 90);

  // A single narrow highlight down the left wall reads as glass without smearing
  // the whole tube.
  const sheen = ctx.createLinearGradient(0, 0, 22, 0);
  sheen.addColorStop(0, 'rgba(210,235,255,.16)'); sheen.addColorStop(.35, 'rgba(210,235,255,.05)'); sheen.addColorStop(1, 'rgba(210,235,255,0)');
  ctx.fillStyle = sheen; ctx.fillRect(0, 96, 22, h - 96);

  drawMonster(ctx, w, h, spike, t, alive);
  ctx.restore();

  roundRect(ctx, 0, 0, w, h, 12);
  ctx.strokeStyle = withAlpha(color, .75); ctx.lineWidth = 2; ctx.stroke();
  roundRect(ctx, -4, -4, w + 8, h + 8, 15);
  ctx.strokeStyle = withAlpha(color, .2); ctx.lineWidth = 5; ctx.stroke();
  ctx.restore();
}

// The monster the missed notes feed: a dark bulk behind a barred gate, with eyes
// and a grin riding on the mass, and the spike line drawn last so it sits in front.
function drawMonster(ctx, w, h, spike, t, alive) {
  const crown = spike - 4;
  const body = ctx.createLinearGradient(0, crown, 0, h);
  body.addColorStop(0, '#5e2c66'); body.addColorStop(.26, '#3f1d48'); body.addColorStop(1, '#1b0b21');
  ctx.fillStyle = body; ctx.fillRect(0, crown, w, h - crown);

  // Bulges pushing up behind the gate so the mass looks alive.
  for (let i = 0; i < 6; i++) {
    const x = (i + .5) * (w / 6);
    const rise = 8 + 4 * Math.sin(t * 3 + i * 1.3);
    ctx.fillStyle = 'rgba(150,70,164,.42)';
    ctx.beginPath(); ctx.ellipse(x, crown + rise, w / 11, rise + 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Tendrils break up the flat slab the way a body of sludge would sag.
  ctx.save(); ctx.beginPath(); ctx.rect(0, crown, w, h - crown); ctx.clip();
  ctx.strokeStyle = 'rgba(18,6,24,.22)'; ctx.lineWidth = 2.5;
  for (let i = 0; i < 5; i++) {
    const x = (i + .5) * (w / 5);
    ctx.beginPath(); ctx.moveTo(x, crown + 30);
    ctx.quadraticCurveTo(x + 13, crown + 62, x - 8, crown + 104); ctx.stroke();
  }
  ctx.restore();
  // Rim light along the crown so the mass has a top edge, not just a seam.
  ctx.fillStyle = 'rgba(232,158,246,.3)'; ctx.fillRect(0, crown, w, 2.5);

  if (alive) {
    // A dark snout behind the grin, so the teeth read as a mouth and not a second
    // row of spikes.
    ctx.fillStyle = '#1d0819';
    ctx.beginPath(); ctx.ellipse(w / 2, spike + 40, 72, 16, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,150,170,.22)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#f6ecf8';
    for (let i = 0; i < 9; i++) {
      const tx = w / 2 - 56 + i * 14;
      ctx.beginPath();
      ctx.moveTo(tx - 5.5, spike + 26); ctx.lineTo(tx + 5.5, spike + 26); ctx.lineTo(tx, spike + 40);
      ctx.closePath(); ctx.fill();
    }
    for (const side of [-1, 1]) {
      const ex = w / 2 + side * 37, ey = spike + 19;
      glow(ctx, ex, ey, 26, '#ff5d6c', .55);
      ctx.fillStyle = '#fff6c2';
      ctx.beginPath(); ctx.ellipse(ex, ey, 11, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(60,12,30,.85)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#3a0d1c';
      ctx.beginPath(); ctx.ellipse(ex + side * 2.4, ey + 1, 4.6, 5.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath(); ctx.arc(ex - side * 1, ey - 3.2, 1.8, 0, Math.PI * 2); ctx.fill();
      // A brow angled inward keeps the face cross rather than blank.
      ctx.strokeStyle = '#2a0f22'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ex - side * 13, ey - 15); ctx.lineTo(ex + side * 9, ey - 8); ctx.stroke();
    }
  }

  const spikeH = 16;
  ctx.beginPath();
  for (let x = -6; x < w + 12; x += 18) { ctx.moveTo(x, spike + 6); ctx.lineTo(x + 9, spike - spikeH); ctx.lineTo(x + 18, spike + 6); }
  ctx.closePath();
  const steel = ctx.createLinearGradient(0, spike - spikeH, 0, spike + 8);
  steel.addColorStop(0, '#f4f7ff'); steel.addColorStop(.55, '#b7c0d6'); steel.addColorStop(1, '#5c6479');
  ctx.fillStyle = steel; ctx.fill();
  ctx.strokeStyle = 'rgba(18,24,38,.6)'; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(0, spike + 6, w, 2);
}

// --- 山山兔队长大作战: meadow board, conveyor, barrier ------------------------

export function drawMeadowBackdrop(ctx, w, h) {
  backdrop(ctx, 'meadow', w, h, (c) => {
    const base = c.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#2a1f3d'); base.addColorStop(.32, '#18203a'); base.addColorStop(1, '#0d1424');
    c.fillStyle = base; c.fillRect(0, 0, w, h);
    for (const [x, y, r, color] of [[360, 250, 330, '#3f6fd8'], [90, 560, 240, '#2f9a86'], [660, 600, 240, '#8a4fc0']]) {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, withAlpha(color, .28)); g.addColorStop(1, withAlpha(color, 0));
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
  });
}

export function drawBelt(ctx, x, y, w, h, t) {
  ctx.save();
  // Bleeds past both edges so the rounded ends never show the backdrop through.
  roundRect(ctx, x - 30, y, w + 60, h, 14);
  const rail = ctx.createLinearGradient(0, y, 0, y + h);
  rail.addColorStop(0, '#101827'); rail.addColorStop(.5, '#1a2439'); rail.addColorStop(1, '#0d1421');
  ctx.fillStyle = rail; ctx.fill();
  ctx.save(); roundRect(ctx, x - 30, y, w + 60, h, 14); ctx.clip();
  // Treads scrolling right, matching the direction pieces travel.
  const offset = (t * 46) % 44;
  for (let i = -1; i * 44 + offset < w + 60; i++) {
    const tx = x - 30 + i * 44 + offset;
    ctx.fillStyle = 'rgba(150,190,255,.1)';
    ctx.beginPath();
    ctx.moveTo(tx, y + 8); ctx.lineTo(tx + 24, y + h / 2); ctx.lineTo(tx, y + h - 8);
    ctx.lineTo(tx + 11, y + h - 8); ctx.lineTo(tx + 35, y + h / 2); ctx.lineTo(tx + 11, y + 8);
    ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x - 30, y, w + 60, 3);
  ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(x - 30, y + h - 6, w + 60, 6);
  ctx.restore();
  roundRect(ctx, x - 30, y, w + 60, h, 14);
  ctx.strokeStyle = 'rgba(150,190,255,.22)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

export function drawField(ctx, x, y, w, h, cell, cols, rows) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 12);
  const turf = ctx.createLinearGradient(0, y, 0, y + h);
  turf.addColorStop(0, '#2b6b5c'); turf.addColorStop(.45, '#20564f'); turf.addColorStop(1, '#173f3f');
  ctx.fillStyle = turf; ctx.fill();
  ctx.save(); roundRect(ctx, x, y, w, h, 12); ctx.clip();
  const sun = ctx.createRadialGradient(x + w * .5, y - h * .1, 10, x + w * .5, y - h * .1, h * 1.1);
  sun.addColorStop(0, 'rgba(180,255,220,.16)'); sun.addColorStop(1, 'rgba(180,255,220,0)');
  ctx.fillStyle = sun; ctx.fillRect(x, y, w, h);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    if ((r + c) % 2) continue;
    ctx.fillStyle = 'rgba(255,255,255,.022)';
    ctx.fillRect(x + c * cell, y + r * cell, cell, cell);
  }
  ctx.strokeStyle = 'rgba(190,255,225,.11)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < cols; c++) { ctx.moveTo(x + c * cell, y); ctx.lineTo(x + c * cell, y + h); }
  for (let r = 1; r < rows; r++) { ctx.moveTo(x, y + r * cell); ctx.lineTo(x + w, y + r * cell); }
  ctx.stroke();
  const lip = ctx.createLinearGradient(0, y, 0, y + 46);
  lip.addColorStop(0, 'rgba(0,0,0,.42)'); lip.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lip; ctx.fillRect(x, y, w, 46);
  ctx.restore();
  roundRect(ctx, x, y, w, h, 12);
  ctx.strokeStyle = 'rgba(120,230,190,.35)'; ctx.lineWidth = 2; ctx.stroke();
  ctx.restore();
}

export function drawDefence(ctx, x, y, w, h, alarm) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 7);
  ctx.fillStyle = '#141c2c'; ctx.fill();
  ctx.save(); roundRect(ctx, x, y, w, h, 7); ctx.clip();
  for (let i = -2; i * 16 < h + 32; i++) {
    ctx.fillStyle = i % 2 ? (alarm ? '#ff5d6c' : '#ffd543') : '#232c40';
    ctx.save(); ctx.translate(x, y + i * 16); ctx.rotate(-.4);
    ctx.fillRect(-10, 0, w + 20, 8);
    ctx.restore();
  }
  if (alarm) { ctx.fillStyle = 'rgba(255,93,108,.22)'; ctx.fillRect(x, y, w, h); }
  ctx.restore();
  roundRect(ctx, x, y, w, h, 7);
  ctx.strokeStyle = alarm ? 'rgba(255,140,150,.9)' : 'rgba(255,213,67,.55)';
  ctx.lineWidth = 2; ctx.stroke();
  if (alarm) glow(ctx, x + w / 2, y + h / 2, w * 3, '#ff5d6c', .5);
  ctx.restore();
}

export function drawPortal(ctx, x, y, w, h, t) {
  ctx.save();
  const g = ctx.createLinearGradient(x + w, 0, x, 0);
  g.addColorStop(0, 'rgba(255,93,108,.3)'); g.addColorStop(1, 'rgba(255,93,108,0)');
  ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,140,150,.75)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  for (const column of [0, 1]) {
    const cx = x + w * (.35 + column * .38);
    for (let i = 0; i < 3; i++) {
      const phase = (t * 1.6 + i * .33 + column * .5) % 1;
      ctx.globalAlpha = .85 * (1 - phase);
      ctx.beginPath();
      ctx.moveTo(cx + 9, y + h * phase + 6);
      ctx.lineTo(cx - 5, y + h * phase + 18);
      ctx.lineTo(cx + 9, y + h * phase + 30);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// --- Characters ---------------------------------------------------------------

function paintRabbit(c, w, h, index) {
  const s = PLAYER_SHADES[index] || PLAYER_SHADES[0];
  const size = Math.min(w, h), cx = w / 2, cy = h / 2 + size * .08, r = size * .26;

  const drop = c.createRadialGradient(cx, cy + r * 1.1, r * .2, cx, cy + r * 1.1, r * 1.3);
  drop.addColorStop(0, 'rgba(3,6,14,.42)'); drop.addColorStop(1, 'rgba(3,6,14,0)');
  c.fillStyle = drop; c.beginPath(); c.arc(cx, cy + r * 1.1, r * 1.3, 0, Math.PI * 2); c.fill();

  // Ears, tilted outward, with a pink inner cup.
  for (const side of [-1, 1]) {
    c.save(); c.translate(cx + side * r * .42, cy - r * 1.35); c.rotate(side * .26);
    c.fillStyle = s.base;
    c.beginPath(); c.ellipse(0, 0, r * .3, r * .78, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = withAlpha(s.edge, .9); c.lineWidth = Math.max(1, r * .1); c.stroke();
    c.fillStyle = withAlpha('#ff9d5c', .55);
    c.beginPath(); c.ellipse(0, r * .06, r * .14, r * .5, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // Feet.
  c.fillStyle = s.dark;
  for (const side of [-1, 1]) {
    c.beginPath(); c.ellipse(cx + side * r * .56, cy + r * .88, r * .34, r * .22, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = withAlpha(s.edge, .8); c.lineWidth = Math.max(.8, r * .07); c.stroke();
  }

  const body = c.createRadialGradient(cx - r * .38, cy - r * .5, r * .1, cx, cy, r * 1.3);
  body.addColorStop(0, s.light); body.addColorStop(.45, s.base); body.addColorStop(1, s.dark);
  c.fillStyle = body; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
  c.strokeStyle = withAlpha(s.edge, .95); c.lineWidth = Math.max(1.1, r * .11); c.stroke();

  c.fillStyle = withAlpha(s.rim, .85);
  c.beginPath(); c.ellipse(cx, cy + r * .34, r * .45, r * .3, 0, 0, Math.PI * 2); c.fill();

  c.fillStyle = '#22162a';
  c.beginPath(); c.arc(cx - r * .3, cy - r * .12, r * .12, 0, Math.PI * 2); c.arc(cx + r * .3, cy - r * .12, r * .12, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,255,255,.9)';
  c.beginPath(); c.arc(cx - r * .3 + r * .04, cy - r * .17, r * .045, 0, Math.PI * 2); c.arc(cx + r * .3 + r * .04, cy - r * .17, r * .045, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ff8fa6';
  c.beginPath(); c.moveTo(cx, cy + r * .06); c.lineTo(cx - r * .11, cy + r * .19); c.lineTo(cx + r * .11, cy + r * .19); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(34,22,42,.7)'; c.lineWidth = Math.max(.8, r * .07);
  c.beginPath(); c.arc(cx, cy + r * .19, r * .17, .3, Math.PI - .3); c.stroke();
}

export function drawRabbit(ctx, x, y, index, alpha = 1) {
  const size = 56;
  ctx.save(); ctx.globalAlpha *= alpha;
  blit(ctx, `rabbit:${index}`, x, y, size, size, (c, w, h) => paintRabbit(c, w, h, index));
  ctx.restore();
}

function paintBug(c, w, h) {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * .28;
  c.strokeStyle = '#5d2436'; c.lineWidth = Math.max(1.4, r * .16); c.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(cx + side * r * .55, cy + i * r * .42);
      c.lineTo(cx + side * r * 1.35, cy + i * r * .42 + r * .3);
      c.stroke();
    }
  }
  c.beginPath(); c.moveTo(cx - r * .4, cy - r * .7); c.lineTo(cx - r * .9, cy - r * 1.5); c.stroke();
  c.beginPath(); c.moveTo(cx + r * .4, cy - r * .7); c.lineTo(cx + r * .9, cy - r * 1.5); c.stroke();
  c.fillStyle = '#ffd543';
  c.beginPath(); c.arc(cx - r * .9, cy - r * 1.6, r * .16, 0, Math.PI * 2); c.arc(cx + r * .9, cy - r * 1.6, r * .16, 0, Math.PI * 2); c.fill();

  const shell = c.createRadialGradient(cx - r * .4, cy - r * .5, r * .1, cx, cy, r * 1.25);
  shell.addColorStop(0, '#ff8b95'); shell.addColorStop(.45, '#d94a63'); shell.addColorStop(1, '#8d1f3c');
  c.fillStyle = shell; c.beginPath(); c.ellipse(cx, cy, r * 1.15, r, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#5d1428'; c.lineWidth = Math.max(1.2, r * .13); c.stroke();
  c.strokeStyle = 'rgba(93,20,40,.6)'; c.lineWidth = Math.max(1, r * .1);
  c.beginPath(); c.moveTo(cx, cy - r * .95); c.lineTo(cx, cy + r * .95); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.4)';
  c.beginPath(); c.ellipse(cx - r * .45, cy - r * .48, r * .3, r * .18, -.5, 0, Math.PI * 2); c.fill();

  c.fillStyle = '#fff';
  c.beginPath(); c.arc(cx - r * .34, cy + r * .05, r * .26, 0, Math.PI * 2); c.arc(cx + r * .34, cy + r * .05, r * .26, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#241019';
  c.beginPath(); c.arc(cx - r * .3, cy + r * .07, r * .13, 0, Math.PI * 2); c.arc(cx + r * .38, cy + r * .07, r * .13, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#5d1428'; c.lineWidth = Math.max(1.2, r * .14);
  c.beginPath(); c.moveTo(cx - r * .5, cy - r * .38); c.lineTo(cx - r * .16, cy - r * .16); c.stroke();
  c.beginPath(); c.moveTo(cx + r * .5, cy - r * .38); c.lineTo(cx + r * .16, cy - r * .16); c.stroke();
}

function paintSheep(c, w, h) {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * .2;
  c.strokeStyle = '#6b6478'; c.lineWidth = Math.max(2, r * .22); c.lineCap = 'round';
  for (const ox of [-.6, -.2, .3, .7]) {
    c.beginPath(); c.moveTo(cx + ox * r, cy + r * .5); c.lineTo(cx + ox * r, cy + r * 1.35); c.stroke();
  }
  const wool = c.createRadialGradient(cx - r * .5, cy - r * .6, r * .1, cx, cy, r * 2);
  wool.addColorStop(0, '#ffffff'); wool.addColorStop(.6, '#efe9df'); wool.addColorStop(1, '#c9c2b8');
  c.fillStyle = wool;
  for (const [ox, oy, rr] of [[-.9, -.2, .62], [.9, -.15, .6], [-.5, -.75, .6], [.55, -.7, .58], [0, -.2, .95], [-.75, .5, .52], [.8, .5, .5], [0, -.85, .5]]) {
    c.beginPath(); c.arc(cx + ox * r, cy + oy * r, rr * r * 1.25, 0, Math.PI * 2); c.fill();
  }
  c.strokeStyle = 'rgba(150,143,132,.55)'; c.lineWidth = 1.4;
  c.beginPath(); c.arc(cx, cy, r * 1.5, 0, Math.PI * 2); c.stroke();

  c.fillStyle = '#3b3340';
  c.beginPath(); c.ellipse(cx, cy - r * .05, r * .62, r * .58, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#fff';
  c.beginPath(); c.arc(cx - r * .26, cy - r * .12, r * .17, 0, Math.PI * 2); c.arc(cx + r * .26, cy - r * .12, r * .17, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#241019';
  c.beginPath(); c.arc(cx - r * .26, cy - r * .1, r * .085, 0, Math.PI * 2); c.arc(cx + r * .26, cy - r * .1, r * .085, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#ffd0d6';
  c.beginPath(); c.ellipse(cx, cy + r * .16, r * .17, r * .12, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#f4f1ea'; c.lineWidth = Math.max(2, r * .18);
  c.beginPath(); c.arc(cx - r * .6, cy - r * .42, r * .28, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.beginPath(); c.arc(cx + r * .6, cy - r * .42, r * .28, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
}

function paintHound(c, w, h) {
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * .24;
  c.strokeStyle = '#4c5470'; c.lineWidth = Math.max(2, r * .22); c.lineCap = 'round';
  for (const ox of [-.95, -.35, .25, .85]) {
    c.beginPath(); c.moveTo(cx + ox * r, cy + r * .5); c.lineTo(cx + ox * r, cy + r * 1.25); c.stroke();
  }
  c.beginPath(); c.moveTo(cx + r * 1.05, cy - r * .1); c.quadraticCurveTo(cx + r * 1.7, cy - r * .5, cx + r * 1.5, cy - r * 1.1); c.stroke();

  const body = c.createLinearGradient(0, cy - r, 0, cy + r);
  body.addColorStop(0, '#b9c2da'); body.addColorStop(.5, '#828cae'); body.addColorStop(1, '#565f7e');
  c.fillStyle = body;
  roundRect(c, cx - r * 1.1, cy - r * .62, r * 2.2, r * 1.24, r * .5); c.fill();
  c.strokeStyle = '#3a4258'; c.lineWidth = Math.max(1.2, r * .13); c.stroke();

  c.save(); c.translate(cx - r * .85, cy - r * .55); c.rotate(-.5);
  c.fillStyle = '#5f6a8b';
  c.beginPath(); c.ellipse(0, 0, r * .3, r * .52, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a4258'; c.lineWidth = Math.max(1, r * .11); c.stroke();
  c.restore();

  const head = c.createRadialGradient(cx - r * 1.6, cy - r * .6, r * .08, cx - r * 1.3, cy - r * .3, r * .95);
  head.addColorStop(0, '#cdd5ea'); head.addColorStop(.6, '#8f99bb'); head.addColorStop(1, '#5a6484');
  c.fillStyle = head; c.beginPath(); c.arc(cx - r * 1.3, cy - r * .3, r * .68, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a4258'; c.lineWidth = Math.max(1.2, r * .13); c.stroke();
  c.fillStyle = '#6d7796';
  c.beginPath(); c.ellipse(cx - r * 1.95, cy - r * .12, r * .34, r * .26, -.2, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a4258'; c.lineWidth = Math.max(1, r * .1); c.stroke();
  c.fillStyle = '#20263a';
  c.beginPath(); c.arc(cx - r * 2.16, cy - r * .2, r * .12, 0, Math.PI * 2); c.fill();

  c.fillStyle = '#fff3a8';
  c.beginPath(); c.ellipse(cx - r * 1.5, cy - r * .48, r * .16, r * .14, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#241019';
  c.beginPath(); c.arc(cx - r * 1.53, cy - r * .47, r * .075, 0, Math.PI * 2); c.fill();
  c.strokeStyle = '#3a4258'; c.lineWidth = Math.max(1.4, r * .15);
  c.beginPath(); c.moveTo(cx - r * 1.72, cy - r * .74); c.lineTo(cx - r * 1.22, cy - r * .6); c.stroke();

  c.fillStyle = '#f4f1ea';
  for (const ox of [-1.36, -1.22, -1.08]) {
    c.beginPath();
    c.moveTo(cx + ox * r, cy + r * .06); c.lineTo(cx + ox * r + r * .1, cy + r * .22); c.lineTo(cx + ox * r - r * .1, cy + r * .22);
    c.closePath(); c.fill();
  }
}

export function drawEnemy(ctx, x, y, type, hp, maxHp, gnaw, gnawMax, t) {
  const size = type === 'sheep' ? 66 : type === 'hound' ? 76 : 54;
  const walk = Math.sin(t * (type === 'hound' ? 9 : type === 'sheep' ? 4 : 7)) * 1.6;
  ctx.save();
  glow(ctx, x, y, size * .7, type === 'hound' ? '#8a93b0' : type === 'sheep' ? '#f4f1ea' : '#b0566a', .28);
  blit(ctx, `enemy:${type}`, x, y + walk * .4, size, size, (c, w, h) => {
    if (type === 'sheep') paintSheep(c, w, h);
    else if (type === 'hound') paintHound(c, w, h);
    else paintBug(c, w, h);
  });
  ctx.restore();

  if (maxHp > 1) {
    const w = 30, x0 = x - w / 2, y0 = y - size * .52;
    panel(ctx, x0, y0, w, 6, 3, { fill: 'rgba(8,12,22,.7)', stroke: 'rgba(255,255,255,.2)' });
    roundRect(ctx, x0 + 1, y0 + 1, (w - 2) * Math.max(0, hp / maxHp), 4, 2);
    ctx.fillStyle = hp / maxHp > .5 ? '#44c986' : '#ff5d6c'; ctx.fill();
  }
  if (gnaw > 0) {
    const w = 34, x0 = x - w / 2, y0 = y + size * .45;
    panel(ctx, x0, y0, w, 6, 3, { fill: 'rgba(8,12,22,.7)', stroke: 'rgba(255,255,255,.18)' });
    roundRect(ctx, x0 + 1, y0 + 1, (w - 2) * Math.min(1, gnaw / gnawMax), 4, 2);
    ctx.fillStyle = '#ffb347'; ctx.fill();
  }
}

// --- Effects ------------------------------------------------------------------

// Stateless bursts driven by the effect's own timestamp, so the host and the
// guest animate every clear identically.
export function drawBurst(ctx, x, y, color, age) {
  const s = shade(color);
  const fade = Math.max(0, 1 - age);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = withAlpha(s.light, .9); ctx.lineWidth = 4 * fade + 1;
  ctx.beginPath(); ctx.arc(x, y, 8 + age * 34, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = withAlpha(s.base, .5); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(x, y, 5 + age * 22, 0, Math.PI * 2); ctx.stroke();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + age * 1.2;
    const dist = 6 + age * 46;
    const px = x + Math.cos(a) * dist, py = y + Math.sin(a) * dist + age * age * 26;
    ctx.fillStyle = withAlpha(i % 2 ? s.light : s.base, .95);
    ctx.beginPath(); ctx.arc(px, py, Math.max(1, 4.2 * fade), 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawFloatingText(ctx, text, x, y, age, color = '#ffffff') {
  const fade = Math.max(0, 1 - age * .85);
  const rise = age * 42;
  const pop = 1 + .3 * Math.max(0, 1 - age * 5);
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.translate(x, y - 20 - rise); ctx.scale(pop, pop);
  ctx.font = '800 19px Manrope, sans-serif'; ctx.textAlign = 'center';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(6,10,20,.85)';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = color; ctx.fillText(text, 0, 0);
  ctx.restore();
}

export function drawSparkle(ctx, x, y, r, color, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill(); ctx.restore();
}

// Score, timer and combo cluster used by all three boards.
export function drawStat(ctx, text, x, y, { size = 20, color = '#ffffff', align = 'center', font = 'Manrope, sans-serif', weight = 800, outline = 4, letter = 0 } = {}) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  if (letter) ctx.letterSpacing = `${letter}px`;
  if (outline) { ctx.lineWidth = outline; ctx.strokeStyle = 'rgba(6,10,20,.8)'; ctx.strokeText(text, x, y); }
  ctx.fillStyle = color; ctx.fillText(text, x, y);
  ctx.restore();
}
