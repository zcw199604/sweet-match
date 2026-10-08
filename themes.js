// Skins for 泡噗 2.
//
// A theme swaps four things and nothing else: the backdrop, the arena the balls
// drift over, the base the player is defending, and the craft they steer. The
// balls only change palette — they are the game's pieces, so their silhouette
// stays the same and a clear still reads instantly. The rules in game-core.js
// know nothing about any of this, and the choice is stored per device, so the
// two sides of a co-op round may each watch a different one.

import { SHADES, backdrop, deviceScale as deviceRatio, drawArena, drawPlanet, drawShip, drawSpaceBackdrop, glow, paintBall, paintFace, withAlpha, roundRect } from './art.js';

// --- Theme table --------------------------------------------------------------

// `base` picks the defended object, `craft` the vehicle, `backdrop`/`arena` the
// scenery. Keys are looked up in the painters below.
export const THEMES = [
  {
    id: 'space', name: '星海航路', base: 'sphere', craft: 'saucer', backdrop: 'space', arena: 'well',
    craftName: '飞船', pieceName: '彩球', baseName: '星球',
    help: '糖果彩球与带环行星。'
  },
  {
    id: 'reef', name: '深海珊瑚', base: 'coral', craft: 'sub', backdrop: 'reef', arena: 'seabed',
    craftName: '潜水球', pieceName: '珍珠', baseName: '珊瑚礁',
    help: '海玻璃珍珠与珊瑚礁。'
  },
  {
    id: 'tribe', name: '远古部落', base: 'totem', craft: 'glider', backdrop: 'tribe', arena: 'dirt',
    craftName: '滑翔伞', pieceName: '陶珠', baseName: '图腾圣坛',
    help: '彩绘陶珠与图腾圣坛。'
  }
];
const THEME_IDS = THEMES.map(theme => theme.id);
export const DEFAULT_THEME = THEME_IDS[0];
export const isTheme = (id) => THEME_IDS.includes(id);
export const themeById = (id) => THEMES.find(theme => theme.id === id) || THEMES[0];

// --- Ball palettes ------------------------------------------------------------
//
// Candy spheres stay glossy; pearls turn iridescent and cool, clay beads pick up
// the grit of fired earth. Each palette keeps the light/mid/dark/edge/rim order
// the shared sphere shading expects.

const BALL_PALETTES = {
  reef: {
    red: { base: '#ff6d94', light: '#ffc2d6', dark: '#b62a58', edge: '#6d0f31', rim: '#ffe4ef', glow: '#ff6d94' },
    yellow: { base: '#ffd35c', light: '#fff0bd', dark: '#c38a10', edge: '#7c5504', rim: '#fff8d6', glow: '#ffd35c' },
    green: { base: '#3fd6bb', light: '#b4f6ea', dark: '#128a78', edge: '#08544a', rim: '#d8fff8', glow: '#3fd6bb' },
    blue: { base: '#4fb6e8', light: '#bfeaff', dark: '#1568a2', edge: '#0a4066', rim: '#d6f3ff', glow: '#4fb6e8' },
    purple: { base: '#8fa6f5', light: '#d6e0ff', dark: '#4154bd', edge: '#232f78', rim: '#e8edff', glow: '#8fa6f5' }
  },
  tribe: {
    red: { base: '#ea6238', light: '#ffc6a0', dark: '#a8331a', edge: '#66200f', rim: '#ffe0c9', glow: '#ea6238' },
    yellow: { base: '#f4c257', light: '#ffe9b0', dark: '#b07d16', edge: '#704d06', rim: '#fff5d8', glow: '#f4c257' },
    green: { base: '#8fb04a', light: '#dbeaa5', dark: '#4f6d1e', edge: '#2f430f', rim: '#edf6c9', glow: '#8fb04a' },
    blue: { base: '#3f8f96', light: '#a9e0e4', dark: '#1a555c', edge: '#0d363b', rim: '#d2f2f5', glow: '#3f8f96' },
    purple: { base: '#a86a90', light: '#e6bed4', dark: '#6b3357', edge: '#421d36', rim: '#f7dcec', glow: '#a86a90' }
  }
};
export const ballShades = (theme) => BALL_PALETTES[theme] || SHADES;

// Materials. The silhouette stays the game's candy sphere in every theme — the
// pieces are what a player matches, so they must never change shape — but the
// surface does: glossed candy in space, a pearl in a film of bubble underwater,
// matte painted clay in the tribe.

// A pearl floating inside a soap bubble: the film catches a bright rim while the
// nacre inside stays soft, and two micro-bubbles ride along with it.
function paintPearl(c, w, h, s, r) {
  const cx = w / 2, cy = h / 2;
  contactShadow(c, cx, cy + r * .58, r * .92, .45);

  const nacre = c.createRadialGradient(cx - r * .34, cy - r * .42, r * .05, cx + r * .1, cy + r * .18, r * 1.2);
  nacre.addColorStop(0, s.light); nacre.addColorStop(.46, s.base); nacre.addColorStop(1, s.dark);
  c.fillStyle = nacre; c.beginPath(); c.arc(cx, cy, r * .74, 0, Math.PI * 2); c.fill();
  c.save(); c.beginPath(); c.arc(cx, cy, r * .74, 0, Math.PI * 2); c.clip();
  // Iridescence: two arcs in opposite hues, the way a shell turns colour.
  c.strokeStyle = withAlpha(s.rim, .55); c.lineWidth = r * .2;
  c.beginPath(); c.arc(cx - r * .3, cy + r * .18, r * .5, -1.1, .9); c.stroke();
  c.strokeStyle = 'rgba(190,240,255,.45)'; c.lineWidth = r * .14;
  c.beginPath(); c.arc(cx + r * .3, cy - r * .12, r * .46, 2.1, 4.3); c.stroke();
  c.restore();
  c.strokeStyle = withAlpha(s.edge, .45); c.lineWidth = Math.max(.8, r * .07);
  c.beginPath(); c.arc(cx, cy, r * .74, 0, Math.PI * 2); c.stroke();

  // The bubble skin: nearly invisible through the middle, bright at the rim.
  const film = c.createRadialGradient(cx, cy, r * .5, cx, cy, r * .99);
  film.addColorStop(0, 'rgba(226,252,255,0)');
  film.addColorStop(.72, 'rgba(226,252,255,.1)');
  film.addColorStop(1, 'rgba(236,255,255,.62)');
  c.fillStyle = film; c.beginPath(); c.arc(cx, cy, r * .99, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(240,255,255,.7)'; c.lineWidth = Math.max(.8, r * .06);
  c.beginPath(); c.arc(cx, cy, r * .99, 0, Math.PI * 2); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.85)';
  c.beginPath(); c.ellipse(cx - r * .46, cy - r * .52, r * .14, r * .09, -.6, 0, Math.PI * 2); c.fill();
  for (const [ox, oy, br] of [[.68, -.5, .11], [.78, .34, .07]]) {
    c.strokeStyle = 'rgba(226,252,255,.8)'; c.lineWidth = Math.max(.7, r * .05);
    c.beginPath(); c.arc(cx + ox * r, cy + oy * r, br * r, 0, Math.PI * 2); c.stroke();
  }

  paintFace(c, cx, cy, r * .78, s.edge);
}

// A fired clay bead: matte body, grit in the surface, and a painted band with
// chevrons and a row of dots.
function paintClay(c, w, h, s, r) {
  const cx = w / 2, cy = h / 2;
  contactShadow(c, cx, cy + r * .58, r * .95, .42);

  // Deliberately flat-shaded: a matte bead has no window highlight.
  const body = c.createRadialGradient(cx - r * .3, cy - r * .36, r * .08, cx + r * .16, cy + r * .24, r * 1.3);
  body.addColorStop(0, s.light); body.addColorStop(.5, s.base); body.addColorStop(1, s.dark);
  c.fillStyle = body; c.beginPath(); c.arc(cx, cy, r * .95, 0, Math.PI * 2); c.fill();

  c.save(); c.beginPath(); c.arc(cx, cy, r * .95, 0, Math.PI * 2); c.clip();
  // Grit, then the painted band.
  let seed = 3301;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * .9;
    c.fillStyle = rand() > .5 ? 'rgba(255,236,200,.16)' : 'rgba(48,26,10,.2)';
    c.beginPath(); c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, .5 + rand() * 1.1, 0, Math.PI * 2); c.fill();
  }
  c.fillStyle = 'rgba(248,228,186,.92)';
  c.fillRect(cx - r, cy - r * .12, r * 2, r * .34);
  c.strokeStyle = 'rgba(46,26,10,.55)'; c.lineWidth = Math.max(.7, r * .05);
  c.beginPath(); c.moveTo(cx - r, cy - r * .12); c.lineTo(cx + r, cy - r * .12); c.stroke();
  c.beginPath(); c.moveTo(cx - r, cy + r * .22); c.lineTo(cx + r, cy + r * .22); c.stroke();
  // Chevrons inside the band.
  c.strokeStyle = withAlpha(s.edge, .85); c.lineWidth = Math.max(1, r * .09); c.lineCap = 'round';
  for (let i = -1; i <= 1; i++) {
    c.beginPath();
    c.moveTo(cx + i * r * .42 - r * .16, cy + r * .14);
    c.lineTo(cx + i * r * .42, cy - r * .04);
    c.lineTo(cx + i * r * .42 + r * .16, cy + r * .14);
    c.stroke();
  }
  // A row of stamped dots around the crown.
  c.fillStyle = withAlpha(s.edge, .7);
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * 1.08 + i / 6 * Math.PI * .84;
    c.beginPath(); c.arc(cx + Math.cos(a) * r * .62, cy + Math.sin(a) * r * .62, r * .07, 0, Math.PI * 2); c.fill();
  }
  // Chipped edge where the glaze broke.
  c.fillStyle = 'rgba(255,240,210,.5)';
  c.beginPath(); c.ellipse(cx + r * .5, cy + r * .56, r * .16, r * .09, .5, 0, Math.PI * 2); c.fill();
  c.restore();

  c.strokeStyle = 'rgba(46,26,10,.85)'; c.lineWidth = Math.max(1, r * .1);
  c.beginPath(); c.arc(cx, cy, r * .95, 0, Math.PI * 2); c.stroke();

  paintFace(c, cx, cy - r * .12, r * .9, '#3a2110');
}

const BALL_PAINTERS = { reef: paintPearl, tribe: paintClay };
export const ballPainter = (theme) => BALL_PAINTERS[theme] || paintBall;

// --- Painting helpers ---------------------------------------------------------

function contactShadow(c, cx, cy, r, alpha = .44) {
  const g = c.createRadialGradient(cx, cy, r * .1, cx, cy, r);
  g.addColorStop(0, `rgba(3,6,14,${alpha})`); g.addColorStop(1, 'rgba(3,6,14,0)');
  c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
}

// Paints a lit sphere from a 5-colour shade record, with the rim light and gloss
// every rounded object in this game uses.
function sphereShade(c, cx, cy, r, s, strength = .5) {
  const body = c.createRadialGradient(cx - r * .36, cy - r * .44, r * .06, cx + r * .1, cy + r * .22, r * 1.32);
  body.addColorStop(0, s.light); body.addColorStop(.45, s.base); body.addColorStop(1, s.dark);
  c.fillStyle = body; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();

  const bounce = c.createRadialGradient(cx + r * .36, cy + r * .56, r * .04, cx + r * .36, cy + r * .56, r * .8);
  bounce.addColorStop(0, withAlpha(s.rim || '#ffffff', strength)); bounce.addColorStop(1, withAlpha(s.rim || '#ffffff', 0));
  c.fillStyle = bounce; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();

  c.strokeStyle = withAlpha(s.edge, .9); c.lineWidth = Math.max(1, r * .1);
  c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.5)';
  c.beginPath(); c.ellipse(cx - r * .38, cy - r * .44, r * .24, r * .15, -.6, 0, Math.PI * 2); c.fill();
}

const hexToRgb = (hex) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const mixHex = (from, to, k) => {
  const a = hexToRgb(from), b = hexToRgb(to);
  return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;
};

// --- Backdrops ----------------------------------------------------------------

// Life support for the arena: the rocks, dunes and reefs that define the theme,
// painted once per board size and reused. Same trick drawSpaceBackdrop uses.

function coralReef(c, w, h) {
  const base = c.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, '#062b45'); base.addColorStop(.42, '#0a4664'); base.addColorStop(.74, '#0d5875'); base.addColorStop(1, '#062a43');
  c.fillStyle = base; c.fillRect(0, 0, w, h);

  // Sunlight breaking through the surface in long diagonal bands.
  c.save();
  c.translate(w * .34, -h * .1); c.rotate(.42);
  for (let i = 0; i < 7; i++) {
    const x = -w * .6 + i * w * .26;
    const g = c.createLinearGradient(x, 0, x + w * .16, 0);
    g.addColorStop(0, 'rgba(150,240,255,0)');
    g.addColorStop(.5, `rgba(150,240,255,${Math.max(0, .06 - i * .004).toFixed(3)})`);
    g.addColorStop(1, 'rgba(150,240,255,0)');
    c.fillStyle = g; c.fillRect(x, -h, w * .16, h * 2.4);
  }
  c.restore();

  for (const [x, y, r, color] of [[110, 610, 320, '#0f8f9a'], [620, 560, 300, '#1d6fb0'], [360, 120, 300, '#1fb6b0']]) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, .26)); g.addColorStop(1, withAlpha(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }

  // Coral heads hanging in from the edges, dimmed so they stay behind the arena.
  // Each is a cluster of uneven lobes with a lit rim, not a flat disc.
  c.save(); c.globalAlpha = .3;
  for (const [cx, cy, radius, tint] of [[w * .09, h * .16, 168, '#2ecfb4'], [w * .96, h * .28, 150, '#4a86e0'], [w * .86, h * 1.0, 178, '#c452a8'], [w * .12, h * .96, 150, '#2aa6c2']]) {
    const g = c.createRadialGradient(cx, cy, radius * .1, cx, cy, radius);
    g.addColorStop(0, withAlpha(tint, .3)); g.addColorStop(.55, withAlpha(tint, .16)); g.addColorStop(1, withAlpha(tint, 0));
    c.fillStyle = g;
    for (let i = 0; i < 18; i++) {
      const a = i / 18 * Math.PI * 2 + cx * .01;
      const d = radius * (.14 + .3 * Math.abs(Math.sin(i * 1.7 + cy * .02)));
      c.beginPath();
      c.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, radius * (.1 + .07 * Math.sin(i * 3.1)), 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

// Marine snow, drawn live over the cached reef so it keeps drifting.
const MOTES = (() => {
  let seed = 7717;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: 54 }, () => ({ x: rand() * 720, y: rand() * 720, r: .8 + rand() * 1.7, rise: 6 + rand() * 16, phase: rand() }));
})();

export function drawReefBackdrop(ctx, w, h, t) {
  backdrop(ctx, 'reef', w, h, coralReef);
  for (const mote of MOTES) {
    if (mote.x > w || mote.y > h) continue;
    const y = ((mote.y - t * mote.rise) % h + h) % h;
    const alpha = .16 + .28 * (.5 + .5 * Math.sin(t * 1.4 + mote.phase * 6.3));
    ctx.fillStyle = `rgba(196,246,255,${alpha.toFixed(3)})`;
    ctx.beginPath(); ctx.arc(mote.x + Math.sin(t * .6 + mote.phase * 5) * 8, y, mote.r, 0, Math.PI * 2); ctx.fill();
  }
}

// A sky that walks ochre → crimson → violet → deep navy as it descends, so the
// backdrop alone tells the player this is a place, not a wall.
// The arena covers the middle of the board, so everything a player actually sees
// has to live in the corners: the sunset, the rock art, the rising embers.
const SKY_STOPS = [[0, '#221436'], [.28, '#4d2350'], [.56, '#9c3f45'], [.8, '#d97a3e'], [1, '#f0a24a']];

// A stencilled hand, a spiral and a row of tally marks — the shorthand everyone
// reads as "this place is old".
function rockArt(c, x, y, scale, ink) {
  c.save(); c.translate(x, y); c.scale(scale, scale); c.fillStyle = ink; c.strokeStyle = ink;
  // Palm and fingers.
  c.beginPath(); c.ellipse(0, 0, 11, 13, 0, 0, Math.PI * 2); c.fill();
  for (const [angle, len] of [[-1.5, 15], [-.85, 18], [-.15, 17], [.5, 15], [1.05, 12]]) {
    c.save(); c.rotate(angle);
    c.beginPath(); c.ellipse(0, -17 - len * .2, 3.4, len * .55, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  c.save(); c.translate(46, 6); c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath();
  for (let a = 0; a < Math.PI * 3.4; a += .22) {
    const rad = 2 + a * 2.4;
    a === 0 ? c.moveTo(Math.cos(a) * rad, Math.sin(a) * rad) : c.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  c.stroke(); c.restore();
  c.save(); c.translate(-52, 4); c.lineWidth = 2.6;
  for (let i = 0; i < 4; i++) {
    c.beginPath(); c.moveTo(i * 8, -14); c.lineTo(i * 8 + 3, 14); c.stroke();
  }
  c.restore();
  c.restore();
}

function tribalGround(c, w, h) {
  const base = c.createLinearGradient(0, 0, 0, h);
  for (let i = 0; i <= 24; i++) {
    const k = i / 24;
    let color = SKY_STOPS.at(-1)[1];
    for (let s = 1; s < SKY_STOPS.length; s++) {
      if (k <= SKY_STOPS[s][0]) { color = mixHex(SKY_STOPS[s - 1][1], SKY_STOPS[s][1], (k - SKY_STOPS[s - 1][0]) / (SKY_STOPS[s][0] - SKY_STOPS[s - 1][0])); break; }
    }
    base.addColorStop(k, color);
  }
  c.fillStyle = base; c.fillRect(0, 0, w, h);

  // The sun sits off in one corner so the arena cannot swallow it whole.
  const sunX = w * .1, sunY = h * .88;
  const halo = c.createRadialGradient(sunX, sunY, 10, sunX, sunY, w * .52);
  halo.addColorStop(0, 'rgba(255,208,120,.42)'); halo.addColorStop(1, 'rgba(255,208,120,0)');
  c.fillStyle = halo; c.fillRect(0, 0, w, h);
  c.fillStyle = '#ffcf74'; c.beginPath(); c.arc(sunX, sunY, w * .19, 0, Math.PI * 2); c.fill();
  c.fillStyle = 'rgba(255,246,214,.9)'; c.beginPath(); c.arc(sunX, sunY, w * .15, 0, Math.PI * 2); c.fill();

  // Distant ranges, kept low and thin so nothing cuts across the ring.
  const ridge = (y, height, color, wobble) => {
    c.fillStyle = color;
    c.beginPath(); c.moveTo(-20, h); c.lineTo(-20, y);
    for (let x = -20; x <= w + 20; x += 40) c.lineTo(x, y + Math.sin(x * .012 + wobble) * height * .28);
    c.lineTo(w + 20, h); c.closePath(); c.fill();
  };
  ridge(h * .9, 22, 'rgba(58,32,58,.6)', 1.2);
  ridge(h * .96, 18, 'rgba(30,17,36,.85)', 3.4);

  for (const [x, y, r, color] of [[w * .78, h * .16, 240, '#ff9a5c'], [w * .22, h * .3, 220, '#b0538f']]) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, .2)); g.addColorStop(1, withAlpha(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }

  // Rock art in the corners, where the arena leaves room for it.
  c.save(); c.globalAlpha = .3;
  rockArt(c, w * .17, h * .12, 1.5, '#f2c078');
  rockArt(c, w * .86, h * .13, 1.2, '#e89a6a');
  rockArt(c, w * .93, h * .72, 1.4, '#f2c078');
  c.restore();

  // Grit in the rock.
  let seed = 4409;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 260; i++) {
    const x = rand() * w, y = rand() * h;
    c.fillStyle = rand() > .5 ? 'rgba(255,222,180,.05)' : 'rgba(20,10,26,.09)';
    c.beginPath(); c.arc(x, y, .6 + rand() * 1.6, 0, Math.PI * 2); c.fill();
  }
}

// Embers drifting up off the fires, drawn live over the cached dusk.
const EMBERS = (() => {
  let seed = 5150;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: 34 }, () => ({ x: rand() * 720, y: rand() * 720, rise: 12 + rand() * 26, size: .9 + rand() * 1.8, phase: rand() }));
})();

// Torches stand just outside the ring of play, so they read as the boundary of
// the ritual ground rather than as obstacles.
const TORCHES = Array.from({ length: 10 }, (_, i) => {
  const a = i / 10 * Math.PI * 2 - Math.PI / 2;
  return { x: 360 + Math.cos(a) * 350, y: 360 + Math.sin(a) * 350, phase: i * 1.7 };
});

export function drawTribalBackdrop(ctx, w, h, t) {
  backdrop(ctx, 'tribe', w, h, tribalGround);
  for (const ember of EMBERS) {
    if (ember.x > w || ember.y > h) continue;
    const y = ((ember.y - t * ember.rise) % h + h) % h;
    const fade = .3 + .7 * (.5 + .5 * Math.sin(t * 2.4 + ember.phase * 6.3));
    ctx.fillStyle = `rgba(255,${Math.round(170 + 50 * fade)},110,${(.5 * fade).toFixed(3)})`;
    ctx.beginPath(); ctx.arc(ember.x + Math.sin(t * .8 + ember.phase * 5) * 9, y, ember.size, 0, Math.PI * 2); ctx.fill();
  }
  for (const torch of TORCHES) {
    if (torch.x < -20 || torch.x > w + 20 || torch.y < -20 || torch.y > h + 20) continue;
    const k = .7 + .3 * (.5 + .5 * Math.sin(t * 6 + torch.phase));
    const flicker = .74 + .26 * Math.sin(t * 17 + torch.phase * 2.3);
    const g = ctx.createRadialGradient(torch.x, torch.y - 10, 2, torch.x, torch.y - 10, 78 * k);
    g.addColorStop(0, `rgba(255,183,90,${(.4 * flicker).toFixed(3)})`);
    g.addColorStop(.5, `rgba(255,124,60,${(.15 * flicker).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,124,60,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(torch.x, torch.y - 10, 78 * k, 0, Math.PI * 2); ctx.fill();
    // Post, so the flame reads as a torch and not as a drifting spark.
    ctx.fillStyle = '#4a2c15';
    ctx.beginPath(); ctx.moveTo(torch.x - 3.4, torch.y + 14); ctx.lineTo(torch.x + 3.4, torch.y + 14);
    ctx.lineTo(torch.x + 2.2, torch.y - 8); ctx.lineTo(torch.x - 2.2, torch.y - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2c1809'; ctx.fillRect(torch.x - 5, torch.y - 9, 10, 4);
    ctx.fillStyle = `rgba(255,214,140,${(.85 * flicker).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(torch.x, torch.y - 30 * k);
    ctx.quadraticCurveTo(torch.x + 9, torch.y - 12, torch.x, torch.y - 5);
    ctx.quadraticCurveTo(torch.x - 9, torch.y - 12, torch.x, torch.y - 30 * k);
    ctx.fill();
    ctx.fillStyle = `rgba(255,250,220,${(.7 * flicker).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(torch.x, torch.y - 19 * k);
    ctx.quadraticCurveTo(torch.x + 4.4, torch.y - 11, torch.x, torch.y - 6);
    ctx.quadraticCurveTo(torch.x - 4.4, torch.y - 11, torch.x, torch.y - 19 * k);
    ctx.fill();
  }
}

// --- Bases --------------------------------------------------------------------

// Coral head: lobes of living rock with a polyp garden on the crest, breathing
// slowly. Branching sprigs break the outline so it reads as a reef rather than a
// boulder, while the mass stays near-circular — it is still the thing the balls
// must not touch.
function paintCoralBase(c, cx, cy, r, t) {
  const breath = 1 + .022 * Math.sin(t * 1.1);
  c.save(); c.translate(cx, cy);

  // Sprigs first, so the lobes overlap their bases. Thick, tapered and forked —
  // thin strokes here read as whiskers rather than coral.
  for (const [angle, len, color] of [[-2.45, .92, '#ff9fb5'], [-.62, 1.0, '#ffb46a'], [1.95, .8, '#b9a2ff']]) {
    c.save(); c.rotate(angle + Math.sin(t * .9 + angle) * .06);
    const stem = (x0, y0, x1, y1, width) => {
      c.strokeStyle = color; c.lineCap = 'round'; c.lineWidth = width;
      c.beginPath(); c.moveTo(x0, y0); c.quadraticCurveTo((x0 + x1) / 2 + width * .3, (y0 + y1) / 2, x1, y1); c.stroke();
    };
    const tipX = r * .12, tipY = -r * len;
    stem(0, r * .1, tipX, tipY, Math.max(2, r * .19));
    stem(tipX * .5, tipY * .5, tipX + r * .3, tipY * .86, Math.max(1.6, r * .14));
    stem(tipX * .5, tipY * .55, tipX - r * .3, tipY * .98, Math.max(1.6, r * .14));
    stem(tipX * .7, tipY * .78, tipX + r * .16, tipY * .58, Math.max(1.4, r * .11));
    c.restore();
  }

  const lobes = [[-.52, .12, .52], [.5, .06, .5], [-.16, -.42, .5], [.22, .38, .46], [.02, -.02, .62], [-.66, -.3, .34], [.64, -.32, .32]];
  for (const [ox, oy, base] of lobes) {
    const rr = base * r * breath;
    const g = c.createRadialGradient(ox * r - rr * .4, oy * r - rr * .45, rr * .08, ox * r, oy * r, rr * 1.2);
    g.addColorStop(0, '#ff9fb5'); g.addColorStop(.42, '#e0557f'); g.addColorStop(.78, '#a62d5f'); g.addColorStop(1, '#6b1740');
    c.fillStyle = g;
    c.beginPath(); c.arc(ox * r, oy * r, rr, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(74,12,40,.9)'; c.lineWidth = Math.max(1, r * .055); c.stroke();
  }
  // Polyp garden: rounded bumps rather than strokes, which at this size would
  // read as whiskers.
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * .95 + i / 8 * Math.PI * .9;
    const breathe = 1 + .1 * Math.sin(t * 1.8 + i);
    const px = Math.cos(a) * r * .66, py = Math.sin(a) * r * .66 - r * .06;
    const pr = r * .15 * breathe;
    c.fillStyle = i % 2 ? '#ffd9a0' : '#b6f7e4';
    c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(74,12,40,.75)'; c.lineWidth = Math.max(.8, r * .045); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.beginPath(); c.arc(px - pr * .3, py - pr * .32, pr * .3, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

// Carved posts crossed behind an altar stone, ringed with painted bands and a
// A carved totem on an earthen mound, with a fire at its foot. Stacked blocks
// read as a pole rather than a badge, and the face still sits at the top where
// the eye lands first.
const TOTEM_WOOD = ['#c79a5e', '#a5743c', '#7c5124', '#4a2c12'];

function totemFace(c, cx, cy, w, h, pulse) {
  // Brow.
  c.fillStyle = TOTEM_WOOD[3];
  roundRect(c, cx - w * .52, cy - h * .52, w * 1.04, h * .2, h * .09); c.fill();
  // Eyes: wide painted ovals with a coal behind them, sized to still read at
  // phone scale.
  for (const side of [-1, 1]) {
    c.fillStyle = '#f6e6c4';
    c.beginPath(); c.ellipse(cx + side * w * .26, cy - h * .13, w * .21, h * .17, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(46,28,12,.9)'; c.lineWidth = Math.max(1, h * .055); c.stroke();
    c.fillStyle = `rgba(255,124,54,${(.7 + .3 * pulse).toFixed(3)})`;
    c.beginPath(); c.arc(cx + side * w * .26, cy - h * .13, w * .1, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(40,18,6,.85)';
    c.beginPath(); c.arc(cx + side * w * .26, cy - h * .13, w * .042, 0, Math.PI * 2); c.fill();
  }
  // Beak nose between the eyes.
  c.fillStyle = '#e0563a';
  c.beginPath();
  c.moveTo(cx, cy + h * .02); c.lineTo(cx + w * .17, cy + h * .24); c.lineTo(cx - w * .17, cy + h * .24);
  c.closePath(); c.fill();
  c.strokeStyle = 'rgba(46,28,12,.9)'; c.lineWidth = Math.max(1, h * .045); c.stroke();
  // Mouth band with teeth.
  c.fillStyle = '#f6e6c4';
  roundRect(c, cx - w * .38, cy + h * .3, w * .76, h * .24, h * .07); c.fill();
  c.strokeStyle = 'rgba(46,28,12,.9)'; c.lineWidth = Math.max(1, h * .045); c.stroke();
  c.fillStyle = TOTEM_WOOD[3];
  for (let i = -1; i <= 1; i++) c.fillRect(cx + i * w * .19 - w * .03, cy + h * .3, w * .06, h * .24);
}

function paintTotemBase(c, cx, cy, r, t) {
  const pulse = .5 + .5 * Math.sin(t * 1.6);
  c.save(); c.translate(cx, cy); c.rotate(Math.sin(t * .9) * .014);

  // Mound, with a pair of standing stones flanking it.
  c.fillStyle = '#3d2a16';
  c.beginPath(); c.ellipse(0, r * 1.04, r * 1.72, r * .48, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(26,15,6,.9)'; c.lineWidth = Math.max(1, r * .06); c.stroke();
  for (const side of [-1, 1]) {
    c.save(); c.translate(side * r * 1.46, r * .96); c.rotate(side * .14);
    const slab = c.createLinearGradient(-r * .18, 0, r * .18, 0);
    slab.addColorStop(0, '#8a8175'); slab.addColorStop(.5, '#6b6257'); slab.addColorStop(1, '#3f3a33');
    c.fillStyle = slab;
    roundRect(c, -r * .17, -r * .78, r * .34, r * .84, r * .12); c.fill();
    c.strokeStyle = 'rgba(30,24,18,.9)'; c.lineWidth = Math.max(1, r * .05); c.stroke();
    c.restore();
  }

  // Three stacked blocks, tapering as they rise.
  const blocks = [
    { y: r * .6, h: r * .82, w: r * 1.36 },
    { y: -r * .22, h: r * .86, w: r * 1.26 },
    { y: -r * 1.1, h: r * .98, w: r * 1.16 }
  ];
  for (const [i, block] of blocks.entries()) {
    const top = block.y - block.h / 2;
    const wood = c.createLinearGradient(-block.w / 2, 0, block.w / 2, 0);
    wood.addColorStop(0, TOTEM_WOOD[0]); wood.addColorStop(.42, TOTEM_WOOD[1]); wood.addColorStop(1, TOTEM_WOOD[3]);
    c.fillStyle = wood;
    roundRect(c, -block.w / 2, top, block.w, block.h, r * .13); c.fill();
    c.strokeStyle = 'rgba(38,22,10,.94)'; c.lineWidth = Math.max(1.2, r * .08); c.stroke();
    c.strokeStyle = 'rgba(38,22,10,.5)'; c.lineWidth = Math.max(1, r * .05);
    c.beginPath(); c.moveTo(-block.w * .38, block.y + block.h * .38); c.lineTo(block.w * .38, block.y + block.h * .38); c.stroke();
    if (i === 0) {
      // Chevrons climbing the bottom block.
      c.strokeStyle = 'rgba(240,217,168,.9)'; c.lineWidth = Math.max(1.6, r * .085); c.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        const y = block.y + k * r * .22;
        c.beginPath(); c.moveTo(-block.w * .3, y + r * .08); c.lineTo(0, y - r * .07); c.lineTo(block.w * .3, y + r * .08); c.stroke();
      }
    } else if (i === 1) {
      // A band of painted dots.
      c.fillStyle = 'rgba(224,86,52,.92)';
      for (let k = -2; k <= 2; k++) { c.beginPath(); c.arc(k * block.w * .16, block.y, r * .08, 0, Math.PI * 2); c.fill(); }
    } else {
      totemFace(c, 0, block.y, block.w * .82, block.h * .78, pulse);
    }
  }

  // Feather crest, fanned wide so it reads as plumage rather than ears.
  for (const [i, spread] of [-1.1, -.55, 0, .55, 1.1].entries()) {
    c.save(); c.translate(spread * r * .3, -r * 1.52); c.rotate(spread * .5 + Math.sin(t * 1.4 + i) * .05);
    c.fillStyle = [0, 4].includes(i) ? '#e0563a' : '#ffd27a';
    c.beginPath(); c.ellipse(0, -r * .12, r * .075, r * .22, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(38,22,10,.85)'; c.lineWidth = Math.max(1, r * .045); c.stroke();
    c.restore();
  }

  // The brazier at the foot, drawn last so it lights the front of the pole.
  const flare = .82 + .18 * Math.sin(t * 7.3);
  glow(c, 0, r * 1.06, r * 1.6, '#ff9a3c', .55 * flare);
  c.fillStyle = '#4a3a28';
  c.beginPath(); c.ellipse(0, r * 1.14, r * .42, r * .17, 0, 0, Math.PI * 2); c.fill();
  c.strokeStyle = 'rgba(26,15,6,.9)'; c.lineWidth = Math.max(1, r * .05); c.stroke();
  for (let i = -1; i <= 1; i++) {
    const hgt = r * (.5 + .2 * Math.sin(t * 9 + i * 2.1)) * flare;
    c.fillStyle = i === 0 ? 'rgba(255,222,150,.96)' : 'rgba(255,138,54,.9)';
    c.beginPath();
    c.moveTo(i * r * .2, r * 1.12);
    c.quadraticCurveTo(i * r * .2 + r * .17, r * 1.12 - hgt * .62, i * r * .2, r * 1.12 - hgt);
    c.quadraticCurveTo(i * r * .2 - r * .17, r * 1.12 - hgt * .62, i * r * .2, r * 1.12);
    c.fill();
  }
  c.restore();
}

// The ringed garden world — art.js draws it, so there is one implementation.
function paintSphereBase(c, cx, cy, r, t) {
  drawPlanet(c, cx, cy, r, t);
}

// Bases animate, so they are painted straight to the board rather than cached;
// it is one object per frame, the same budget drawPlanet always spent. The
// sphere carries its own halo inside drawPlanet, hence the null.
const BASE_PAINTERS = {
  sphere: { paint: paintSphereBase, halo: null },
  coral: { paint: paintCoralBase, halo: 'rgba(255,120,170,.72)' },
  totem: { paint: paintTotemBase, halo: 'rgba(255,196,120,.72)' }
};

export function drawThemeBase(ctx, key, cx, cy, r, t) {
  const entry = BASE_PAINTERS[key] || BASE_PAINTERS.sphere;
  ctx.save();
  if (entry.halo) glow(ctx, cx, cy, r * 2.4, entry.halo, .75 + .1 * Math.sin(t * 2));
  // A generous box: the planet's ring reaches r×1.85 on the long axis.
  const box = r * 4;
  ctx.translate(cx - box / 2, cy - box / 2);
  ctx.beginPath(); ctx.rect(0, 0, box, box); ctx.clip();
  entry.paint(ctx, box / 2, box / 2, r, t);
  ctx.restore();
}

// --- Arenas -------------------------------------------------------------------

export function drawSeabed(ctx, cx, cy, r, t, threat) {
  ctx.save();
  const floor = ctx.createRadialGradient(cx, cy, r * .05, cx, cy, r);
  floor.addColorStop(0, 'rgba(58,116,132,.9)');
  floor.addColorStop(.3, 'rgba(34,84,110,.86)');
  floor.addColorStop(.62, 'rgba(18,52,84,.64)');
  floor.addColorStop(.86, 'rgba(10,30,58,.3)');
  floor.addColorStop(1, 'rgba(6,20,42,0)');
  ctx.fillStyle = floor; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  // Caustics: two nets of light crossing each other, each band at its own
  // wavelength so the pattern never settles into stripes.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const freq = .03 + i * .009, amp = 7 + (i % 3) * 5, phase = i * 2.3;
    ctx.strokeStyle = `rgba(160,240,255,${(.055 + (i % 2) * .02).toFixed(3)})`;
    ctx.beginPath();
    for (let x = -r; x <= r; x += 16) {
      const y = -r * .72 + i * (r * 1.5 / 6) + Math.sin(x * freq + t * (1.1 + i * .2) + phase) * amp;
      if (x === -r) ctx.moveTo(cx + x, cy + y); else ctx.lineTo(cx + x, cy + y);
    }
    ctx.stroke();
  }
  ctx.save();
  ctx.rotate(.9);
  ctx.strokeStyle = 'rgba(150,235,255,.045)';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    for (let x = -r; x <= r; x += 16) {
      const y = -r * .6 + i * (r * 1.2 / 5) + Math.sin(x * .026 - t * 1.4 + i * 1.7) * 11;
      if (x === -r) ctx.moveTo(cx + x, cy + y); else ctx.lineTo(cx + x, cy + y);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  // Sand ripples, faint enough to sit under the caustics.
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = `rgba(214,244,255,${Math.max(0, .07 - i * .011).toFixed(3)})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, r * (.32 + i * .18), 0, Math.PI * 2); ctx.stroke();
  }
  // A shoal crossing the floor, well below the play space.
  const drift = ((t * 26) % (r * 2.6)) - r * 1.3;
  ctx.globalAlpha = .45;
  for (let i = 0; i < 6; i++) {
    const fx = cx + drift - i * 26 - r * .3, fy = cy + r * .5 + Math.sin(t * 2 + i * .8) * 7 + i * 3;
    ctx.fillStyle = 'rgba(12,42,68,.8)';
    ctx.beginPath(); ctx.ellipse(fx, fy, 6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(fx + 5, fy); ctx.lineTo(fx + 9, fy - 3); ctx.lineTo(fx + 9, fy + 3); ctx.closePath(); ctx.fill();
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(126,228,232,.24)'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke();
  drawThreat(ctx, cx, cy, r, t, threat);
  ctx.restore();
}

export function drawDirtRing(ctx, cx, cy, r, t, threat) {
  ctx.save();
  const ground = ctx.createRadialGradient(cx, cy, r * .05, cx, cy, r);
  ground.addColorStop(0, 'rgba(150,108,66,.94)');
  ground.addColorStop(.32, 'rgba(120,82,50,.9)');
  ground.addColorStop(.64, 'rgba(84,54,34,.7)');
  ground.addColorStop(.86, 'rgba(56,34,24,.34)');
  ground.addColorStop(1, 'rgba(40,24,18,0)');
  ctx.fillStyle = ground; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  for (let i = 0; i < 5; i++) {
    ctx.strokeStyle = `rgba(255,222,170,${Math.max(0, .14 - i * .014).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(cx, cy, r * (.3 + i * .15), 0, Math.PI * 2); ctx.stroke();
  }
  let seed = 991;
  const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * r * .95;
    ctx.fillStyle = rand() > .5 ? 'rgba(255,224,178,.14)' : 'rgba(48,28,16,.22)';
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 1.4 + rand() * 2.6, 1 + rand() * 1.8, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Painted tally bands, turning slowly. Lengths and weights vary so the ring
  // reads as hand-painted marks rather than a clock face.
  ctx.save();
  ctx.translate(cx, cy); ctx.rotate(t * .06);
  for (let i = 0; i < 24; i++) {
    const long = i % 3 === 0;
    ctx.fillStyle = long ? 'rgba(228,92,54,.3)' : 'rgba(240,196,140,.2)';
    ctx.save(); ctx.rotate(i / 24 * Math.PI * 2);
    ctx.fillRect(-1.6 - (long ? .7 : 0), -r * (long ? .78 : .72), 3.2 + (long ? 1.4 : 0), r * (long ? .14 : .075));
    ctx.restore();
  }
  ctx.restore();
  ctx.restore();

  ctx.strokeStyle = 'rgba(255,206,140,.26)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r - 2, 0, Math.PI * 2); ctx.stroke();
  drawThreat(ctx, cx, cy, r, t, threat);
  ctx.restore();
}

function drawThreat(ctx, cx, cy, r, t, threat) {
  if (!threat) return;
  const pulse = .4 + .6 * (.5 + .5 * Math.sin(t * 11));
  ctx.strokeStyle = `rgba(255,93,108,${(.35 * pulse).toFixed(3)})`; ctx.lineWidth = 16;
  ctx.beginPath(); ctx.arc(cx, cy, r - 8, 0, Math.PI * 2); ctx.stroke();
  glow(ctx, cx, cy, r, '#ff5d6c', .16 * pulse);
}

// --- Craft --------------------------------------------------------------------
//
// Vehicles never animate, so they are cached sprites keyed by theme, seat and
// size — the per-frame cost is one drawImage.

const CRAFT_COLORS = [
  { hull: ['#d8fbff', '#58d4de', '#1b7f8c'], trim: '#0c525c', lamp: ['#fff3c4', '#ffb347'] },
  { hull: ['#ffe6cf', '#ff9d5c', '#b8541a'], trim: '#7d3407', lamp: ['#e6f6ff', '#7cc6f0'] }
];

function paintSub(c, w, h, index, r) {
  const s = CRAFT_COLORS[index] || CRAFT_COLORS[0];
  const cx = w / 2, cy = h / 2 + r * .12;
  contactShadow(c, cx, cy + r * .7, r * 1.1);

  // Propeller and rudder at the stern.
  c.save(); c.translate(cx + r * 1.15, cy + r * .34); c.rotate(-.35);
  c.fillStyle = s.trim;
  c.beginPath(); c.ellipse(0, 0, r * .3, r * .46, 0, 0, Math.PI * 2); c.fill();
  c.fillStyle = withAlpha(s.hull[1], .9);
  c.beginPath(); c.ellipse(0, 0, r * .16, r * .3, 0, 0, Math.PI * 2); c.fill();
  c.restore();

  for (const side of [-1, 1]) {
    c.save(); c.translate(cx + side * r * .95, cy + r * .1); c.rotate(side * .5);
    c.fillStyle = s.hull[2];
    c.beginPath(); c.ellipse(0, 0, r * .4, r * .24, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = withAlpha(s.trim, .9); c.lineWidth = Math.max(1, r * .09); c.stroke();
    c.restore();
  }

  c.strokeStyle = s.trim; c.lineWidth = Math.max(1.2, r * .14);
  c.beginPath(); c.moveTo(cx - r * .1, cy - r * .8); c.lineTo(cx - r * .24, cy - r * 1.42); c.stroke();
  c.fillStyle = s.lamp[1];
  c.beginPath(); c.arc(cx - r * .26, cy - r * 1.54, r * .2, 0, Math.PI * 2); c.fill();
  c.strokeStyle = withAlpha(s.trim, .9); c.lineWidth = Math.max(.8, r * .08); c.stroke();

  sphereShade(c, cx, cy, r, { light: s.hull[0], base: s.hull[1], dark: s.hull[2], edge: s.trim, rim: '#ffffff' }, .55);

  // Porthole with the pilot behind it. Like the saucer's visor, this is the face
  // the player reads, so the glass stays light enough to see through.
  const px = cx, py = cy - r * .06, pr = r * .66;
  const glass = c.createRadialGradient(px - r * .2, py - r * .34, r * .04, px, py, pr * 1.1);
  glass.addColorStop(0, '#f2feff'); glass.addColorStop(.5, '#a8dcef'); glass.addColorStop(1, '#3f7fa8');
  c.fillStyle = glass; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
  paintFace(c, px, py, r * .82, '#16202e');
  c.save(); c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.clip();
  c.fillStyle = 'rgba(255,255,255,.4)';
  c.beginPath(); c.ellipse(px - pr * .46, py - pr * .48, pr * .34, pr * .16, -.6, 0, Math.PI * 2); c.fill();
  c.restore();
  c.strokeStyle = '#e0bf7c'; c.lineWidth = Math.max(1.4, r * .15);
  c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.stroke();
  c.strokeStyle = withAlpha(s.trim, .9); c.lineWidth = Math.max(.9, r * .06);
  c.beginPath(); c.arc(px, py, pr + r * .1, 0, Math.PI * 2); c.stroke();

  c.fillStyle = withAlpha(s.trim, .55);
  for (const a of [.5, .9, 1.5, 2.1, 2.7]) {
    c.beginPath(); c.arc(cx + Math.cos(a) * r * .9, cy + Math.sin(a) * r * .9, r * .06, 0, Math.PI * 2); c.fill();
  }
}

function paintGlider(c, w, h, index, r) {
  const s = CRAFT_COLORS[index] || CRAFT_COLORS[0];
  const cx = w / 2, cy = h / 2 + r * .16;
  contactShadow(c, cx, cy + r * .8, r * 1.15, .4);

  const wing = (side) => {
    c.save(); c.translate(cx, cy - r * .1); c.rotate(side * .22);
    const g = c.createLinearGradient(0, -r * .5, 0, r * .5);
    g.addColorStop(0, side > 0 ? '#f0c489' : '#c99a5c'); g.addColorStop(.55, '#a8683a'); g.addColorStop(1, '#6c3d1c');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(0, 0);
    c.quadraticCurveTo(side * r * .7, -r * .62, side * r * 1.5, -r * .18);
    c.quadraticCurveTo(side * r * .96, r * .3, 0, r * .34);
    c.closePath(); c.fill();
    c.strokeStyle = 'rgba(58,28,10,.92)'; c.lineWidth = Math.max(1, r * .1); c.stroke();
    c.strokeStyle = 'rgba(70,36,14,.55)'; c.lineWidth = Math.max(.8, r * .06);
    for (let i = 1; i <= 3; i++) {
      c.beginPath(); c.moveTo(side * r * .16 * i, r * .04); c.lineTo(side * r * (.5 + .18 * i), -r * .3 + i * r * .1); c.stroke();
    }
    c.restore();
  };
  wing(-1);

  // Pilot pod: a hide drum slung under the wing, with the pilot's face on it and
  // lashings running down either side rather than across the middle.
  sphereShade(c, cx, cy, r * .8, { light: s.hull[0], base: s.hull[1], dark: s.hull[2], edge: s.trim, rim: '#fff2dc' }, .5);
  c.strokeStyle = 'rgba(92,48,20,.85)'; c.lineWidth = Math.max(1.6, r * .11);
  for (const side of [-1, 1]) {
    c.beginPath(); c.moveTo(cx + side * r * .74, cy - r * .3); c.lineTo(cx + side * r * .5, cy + r * .5); c.stroke();
  }
  paintFace(c, cx, cy - r * .06, r * .8, '#3a2410');
  for (let i = -1; i <= 1; i++) {
    c.save(); c.translate(cx + i * r * .3, cy - r * .78); c.rotate(i * .3);
    c.fillStyle = i === 0 ? '#ffd27a' : '#e0563a';
    c.beginPath(); c.ellipse(0, 0, r * .1, r * .32, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(58,28,10,.8)'; c.lineWidth = Math.max(.8, r * .06); c.stroke();
    c.restore();
  }

  wing(1);
}

// The craft the game shipped with: the shared saucer from art.js.
function paintSaucer(c, w, h, index, r) {
  drawShip(c, w / 2, h / 2 - r * .08, r, index);
}
const CRAFT_PAINTERS = { saucer: paintSaucer, sub: paintSub, glider: paintGlider };

// Vehicles never animate, so each one is rasterised once per theme, seat and
// size, then a theme change throws the whole cache away in app.js.
const craftSprites = new Map();
function craftSprite(key, box, ratio) {
  const k = `${key}|${box.toFixed(2)}|${ratio.toFixed(2)}`;
  let canvas = craftSprites.get(k);
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(box * ratio));
    canvas.height = Math.max(1, Math.ceil(box * ratio));
    const c = canvas.getContext('2d');
    c.scale(ratio, ratio);
    const [theme, seat] = key.split(':').slice(1);
    (CRAFT_PAINTERS[theme] || paintSaucer)(c, box, box, Number(seat), box / 4.4);
    craftSprites.set(k, canvas);
  }
  return canvas;
}
export function resetThemeCaches() { craftSprites.clear(); }

export function drawThemeCraft(ctx, key, index, x, y, r) {
  const box = r * 4.4;
  const canvas = craftSprite(`craft:${key}:${index}`, box, deviceRatio(ctx));
  // Oversized boxes keep every fin and antenna clear of the clip.
  ctx.save();
  ctx.beginPath(); ctx.rect(x - box / 2, y - box / 2, box, box); ctx.clip();
  ctx.drawImage(canvas, x - box / 2, y - box / 2, box, box);
  ctx.restore();
}

// Thruster: bubbles behind a sub, dust and embers behind a glider, plasma behind
// a saucer. Same call site, one look per theme.
export function drawThemeThruster(ctx, key, x, y, radius, index, t) {
  const tint = index ? '#ff9d5c' : '#58d4de';
  ctx.save();
  if (key === 'sub') {
    for (let i = 0; i < 5; i++) {
      const phase = (t * 1.5 + i * .2 + index * .5) % 1;
      const bx = x + Math.sin(phase * 9 + i * 2) * radius * .5 + (i - 2) * radius * .22;
      const by = y + radius * .6 + phase * radius * 2.6;
      const size = radius * (.1 + phase * .22) * (1 - phase * .3);
      ctx.strokeStyle = `rgba(226,250,255,${(.7 * (1 - phase)).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, size * .35);
      ctx.beginPath(); ctx.arc(bx, by, size, 0, Math.PI * 2); ctx.stroke();
    }
  } else if (key === 'glider') {
    for (let i = 0; i < 4; i++) {
      const phase = (t * 3.4 + i * .25 + index * .4) % 1;
      const dx = x + (i - 1.5) * radius * .34 + Math.sin(phase * 6 + i) * radius * .3;
      const dy = y + radius * .7 + phase * radius * 1.9;
      ctx.fillStyle = `rgba(255,214,150,${(.6 * (1 - phase)).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(dx, dy, radius * (.09 + phase * .1), 0, Math.PI * 2); ctx.fill();
    }
  } else {
    for (let i = 0; i < 3; i++) {
      const flicker = .55 + .45 * Math.sin(t * 18 + i * 2.1 + index);
      const ox = (i - 1) * radius * .5;
      const len = radius * (.7 + .5 * flicker);
      const g = ctx.createLinearGradient(x + ox, y + radius * .7, x + ox, y + radius * .7 + len);
      g.addColorStop(0, withAlpha(tint, .85 * flicker));
      g.addColorStop(.5, withAlpha(tint, .5 * flicker));
      g.addColorStop(1, withAlpha(tint, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x + ox - radius * .22, y + radius * .68);
      ctx.quadraticCurveTo(x + ox, y + radius * .68 + len, x + ox + radius * .22, y + radius * .68);
      ctx.closePath(); ctx.fill();
    }
  }
  ctx.restore();
}

// --- Picker -------------------------------------------------------------------

// One chip per theme: the skin's own backdrop, base and craft painted small, so
// the choice is legible before it is applied. app.js calls this on a 72×54
// canvas at 2× device scale.
export function paintThemeChip(ctx, skin, w, h, t) {
  ctx.save();
  roundRect(ctx, 0, 0, w, h, 8); ctx.clip();
  // Chips are not board-sized, so the landscapes are painted directly instead of
  // going through the size-keyed backdrop cache.
  if (skin.backdrop === 'reef') {
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#0d5875'); base.addColorStop(1, '#062a43');
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(150,240,255,.12)';
    ctx.beginPath(); ctx.moveTo(w * .1, 0); ctx.lineTo(w * .34, 0); ctx.lineTo(w * .58, h); ctx.lineTo(w * .2, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,110,160,.55)';
    ctx.beginPath(); ctx.arc(w * .12, h * .84, h * .12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,225,220,.5)';
    ctx.beginPath(); ctx.arc(w * .88, h * .16, h * .1, 0, Math.PI * 2); ctx.fill();
  } else if (skin.backdrop === 'tribe') {
    const base = ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, '#8a3b5c'); base.addColorStop(.58, '#cf6046'); base.addColorStop(1, '#2a1a3c');
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,210,122,.92)';
    ctx.beginPath(); ctx.arc(w * .5, h * .74, h * .3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(40,22,40,.75)';
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(0, h * .82); ctx.quadraticCurveTo(w * .3, h * .7, w * .6, h * .84); ctx.quadraticCurveTo(w * .82, h * .94, w, h * .8); ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
  } else {
    const base = ctx.createLinearGradient(0, 0, w, h);
    base.addColorStop(0, '#101a33'); base.addColorStop(1, '#140f2c');
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(226,236,255,.75)';
    for (const [x, y, r] of [[.16, .22, 1], [.34, .66, .8], [.72, .3, 1.1], [.86, .72, .8], [.5, .12, .7]]) {
      ctx.beginPath(); ctx.arc(w * x, h * y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  const s = h / 54;
  const cx = w * .5, cy = h * .6;
  drawThemeBase(ctx, skin.base, cx, cy, 12 * s, t);
  drawThemeCraft(ctx, skin.craft, 0, cx + w * .29, cy - h * .18, 5.5 * s);
  ctx.restore();
}

// Backdrops and arenas are looked up rather than switched on, so adding a skin is
// a table entry plus its painters and nothing else.
const BACKDROPS = { space: drawSpaceBackdrop, reef: drawReefBackdrop, tribe: drawTribalBackdrop };
const ARENAS = { well: drawArena, seabed: drawSeabed, dirt: drawDirtRing };

export function drawThemeBackdrop(ctx, key, w, h, t) {
  (BACKDROPS[key] || drawSpaceBackdrop)(ctx, w, h, t);
}

export function drawThemeArena(ctx, key, cx, cy, r, t, threat) {
  (ARENAS[key] || drawArena)(ctx, cx, cy, r, t, threat);
}
