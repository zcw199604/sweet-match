// 空中大厨: the drawings. Everything is drawn with canvas paths in a glossy cartoon style: the dishes, the
// passengers seen from the front in their seats, the stewardess seen from behind with her cart, the order
// bubbles with their patience bars, the far bulkhead with each route's city mural, and the galley's steel
// cabinets. skychef.js decides where things go; nothing here knows about the rules.

// One dish centred on (x, y), about `s` px across.
export function drawDish(ctx, dish, x, y, s, { alpha = 1 } = {}) {
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


// ---- cabin themes: one per route, for the seats, the carpet and the mural on the far bulkhead ----
export const THEMES = [
  { seat: '#d23a46', seatDark: '#93202d', rest: '#f6ead8', carpet: '#7c2234', carpetMark: '#d9a441', curtain: '#b8293a', sky: ['#ffb38a', '#ff7f9a', '#8d5cc8'], city: 'shanghai' },
  { seat: '#3157a8', seatDark: '#1e3672', rest: '#e3ebf8', carpet: '#263f80', carpetMark: '#8fb2ff', curtain: '#2a4a94', sky: ['#ffd8e4', '#f6a7c1', '#8fb8ff'], city: 'tokyo' },
  { seat: '#eaa23a', seatDark: '#b06f17', rest: '#3d5ca8', carpet: '#c4542a', carpetMark: '#ffb35c', curtain: '#e6b84a', sky: ['#7fd3ff', '#3fa2e8', '#1f6fc0'], city: 'sydney' },
  { seat: '#2a9d8f', seatDark: '#196b62', rest: '#eef7f4', carpet: '#1f6964', carpetMark: '#ff9fc6', curtain: '#23857a', sky: ['#ffcf8a', '#ff8f6b', '#5a4fb0'], city: 'singapore' },
  { seat: '#eaa9bb', seatDark: '#b8728a', rest: '#fff2f5', carpet: '#7a3d5e', carpetMark: '#f2c6d6', curtain: '#8e4fa0', sky: ['#5b3f9a', '#2f2a6e', '#151a44'], city: 'paris' }
];

export const SKIN = ['#ffdcc2', '#f3c3a0', '#dca27a', '#a9714c', '#7a4e33'];
export const HAIR = ['#2e2320', '#6b4226', '#e9c46a', '#c4532e', '#1f2340', '#b7b2ae', '#f08ab8', '#8a5a34'];
export const SHIRT = ['#4f7cff', '#ff8a5b', '#4cc59b', '#c48bff', '#ffcf4d', '#ff6f91', '#3b4a6b', '#f4f1ea', '#e0533f', '#2fa6c9'];
export const PANTS = ['#2d3b5e', '#5a4636', '#2b2b33', '#6d7c99', '#7a2f45'];
const EYES = ['#3a7bd5', '#5a3a22', '#2f9e6e', '#6b4a2b'];

// A soft shine and outline make flat shapes read as the glossy cartoon 3D of the reference.
function shade(ctx, x, y, w, h, top, bottom) {
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  return g;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
}
const mix = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const c = (sh) => Math.round(((pa >> sh) & 255) * (1 - t) + ((pb >> sh) & 255) * t);
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`;
};

// ---- the far bulkhead: a framed mural of the route's city around a curtained doorway ----
function skyline(ctx, city, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  const base = y + h;
  const box = (bx, bw, bh) => ctx.fillRect(x + bx * w, base - bh * h, bw * w, bh * h);
  ctx.globalAlpha = 0.9;
  switch (city) {
    case 'shanghai': // a needle tower with two spheres, and blocks around it
      ctx.fillStyle = '#5b2a5e';
      box(0.05, 0.12, 0.35); box(0.2, 0.08, 0.5); box(0.7, 0.1, 0.45); box(0.82, 0.12, 0.6);
      ctx.fillRect(x + w * 0.47, base - h * 0.95, w * 0.03, h * 0.95);
      for (const [cy, r] of [[0.32, 0.09], [0.62, 0.06]]) { ctx.beginPath(); ctx.arc(x + w * 0.485, base - h * cy, w * r * 0.55, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#ff6f91'; ctx.beginPath(); ctx.arc(x + w * 0.485, base - h * 0.32, w * 0.03, 0, Math.PI * 2); ctx.fill();
      break;
    case 'tokyo': // a snowy mountain and a lattice tower among cherry trees
      ctx.fillStyle = '#6d7fc4';
      ctx.beginPath(); ctx.moveTo(x + w * 0.05, base); ctx.lineTo(x + w * 0.35, base - h * 0.7); ctx.lineTo(x + w * 0.65, base); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(x + w * 0.27, base - h * 0.52); ctx.lineTo(x + w * 0.35, base - h * 0.7); ctx.lineTo(x + w * 0.43, base - h * 0.52); ctx.lineTo(x + w * 0.38, base - h * 0.56); ctx.lineTo(x + w * 0.35, base - h * 0.5); ctx.lineTo(x + w * 0.31, base - h * 0.56); ctx.fill();
      ctx.strokeStyle = '#e8533f'; ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.moveTo(x + w * 0.72, base); ctx.lineTo(x + w * 0.8, base - h * 0.85); ctx.lineTo(x + w * 0.88, base); ctx.moveTo(x + w * 0.75, base - h * 0.3); ctx.lineTo(x + w * 0.85, base - h * 0.3); ctx.moveTo(x + w * 0.77, base - h * 0.55); ctx.lineTo(x + w * 0.83, base - h * 0.55); ctx.stroke();
      ctx.fillStyle = '#ffb3cc';
      for (const [cx, cy, r] of [[0.08, 0.2, 0.07], [0.6, 0.15, 0.06], [0.95, 0.25, 0.08]]) { ctx.beginPath(); ctx.arc(x + w * cx, base - h * cy, w * r, 0, Math.PI * 2); ctx.fill(); }
      break;
    case 'sydney': // the sail shells on the harbour, and a bridge arch
      ctx.strokeStyle = '#ffffffcc'; ctx.lineWidth = Math.max(1, w * 0.012);
      ctx.beginPath(); ctx.arc(x + w * 0.78, base + h * 0.1, w * 0.2, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.fillStyle = '#ffffff';
      for (const [sx, sw, sh] of [[0.12, 0.12, 0.45], [0.22, 0.14, 0.6], [0.34, 0.12, 0.5], [0.44, 0.09, 0.35]]) {
        ctx.beginPath(); ctx.moveTo(x + w * sx, base); ctx.quadraticCurveTo(x + w * (sx + sw * 0.1), base - h * sh, x + w * (sx + sw), base - h * sh * 0.9); ctx.lineTo(x + w * (sx + sw * 0.8), base); ctx.fill();
      }
      ctx.fillStyle = '#1b5fa8'; ctx.fillRect(x, base - h * 0.06, w, h * 0.06);
      break;
    case 'singapore': // three towers carrying a long deck, a wheel and orchids
      ctx.fillStyle = '#3c3478';
      for (const sx of [0.3, 0.42, 0.54]) ctx.fillRect(x + w * sx, base - h * 0.6, w * 0.07, h * 0.6);
      ctx.fillRect(x + w * 0.27, base - h * 0.68, w * 0.38, h * 0.06);
      ctx.strokeStyle = '#3c3478'; ctx.lineWidth = Math.max(1, w * 0.01);
      ctx.beginPath(); ctx.arc(x + w * 0.82, base - h * 0.4, w * 0.1, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ff9fc6';
      for (const [cx, cy] of [[0.06, 0.3], [0.12, 0.18], [0.94, 0.15]]) { ctx.beginPath(); ctx.arc(x + w * cx, base - h * cy, w * 0.035, 0, Math.PI * 2); ctx.fill(); }
      break;
    default: // paris and new york: a lattice tower and a torch-bearing statue under the night sky
      ctx.fillStyle = '#ffd36b';
      for (let i = 0; i < 18; i += 1) { const sx = (i * 37 % 100) / 100, sy = (i * 53 % 60) / 100; ctx.fillRect(x + w * sx, y + h * sy * 0.6, 1.4, 1.4); }
      ctx.fillStyle = '#c48bd8';
      ctx.beginPath(); ctx.moveTo(x + w * 0.16, base); ctx.lineTo(x + w * 0.27, base - h * 0.95); ctx.lineTo(x + w * 0.38, base); ctx.lineTo(x + w * 0.33, base); ctx.quadraticCurveTo(x + w * 0.27, base - h * 0.25, x + w * 0.21, base); ctx.fill();
      ctx.fillStyle = '#7fc8b8';
      ctx.fillRect(x + w * 0.72, base - h * 0.55, w * 0.06, h * 0.55);
      ctx.beginPath(); ctx.arc(x + w * 0.75, base - h * 0.6, w * 0.035, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(x + w * 0.77, base - h * 0.85, w * 0.015, h * 0.25);
      ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(x + w * 0.778, base - h * 0.87, w * 0.02, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawBulkhead(ctx, theme, x0, x1, top, bottom) {
  const w = x1 - x0, h = bottom - top;
  ctx.fillStyle = shade(ctx, x0, top, w, h, '#f4f1ec', '#d9d4cc');
  ctx.fillRect(x0, top, w, h);
  // the mural, split by the doorway
  const door = Math.min(w * 0.26, 70), dx = (x0 + x1) / 2 - door / 2;
  const my = top + h * 0.08, mh = h * 0.8;
  for (const [mx, mw] of [[x0 + w * 0.04, dx - x0 - w * 0.06], [dx + door + w * 0.02, x1 - (dx + door) - w * 0.06]]) {
    if (mw < 8) continue;
    rr(ctx, mx, my, mw, mh, 6);
    const g = ctx.createLinearGradient(0, my, 0, my + mh);
    theme.sky.forEach((c, i) => g.addColorStop(i / (theme.sky.length - 1), c));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); rr(ctx, mx, my, mw, mh, 6); ctx.clip();
    skyline(ctx, theme.city, mx, my, mw, mh);
    ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffffffaa'; rr(ctx, mx, my, mw, mh, 6); ctx.stroke();
  }
  // the doorway with its pleated curtain
  rr(ctx, dx - 3, top + h * 0.02, door + 6, h * 0.98, [8, 8, 0, 0]);
  ctx.fillStyle = '#bfc6d2'; ctx.fill();
  ctx.fillStyle = shade(ctx, dx, top, door, h, mix(theme.curtain, '#ffffff', 0.15), mix(theme.curtain, '#000000', 0.25));
  ctx.fillRect(dx, top + h * 0.06, door, h * 0.94);
  ctx.fillStyle = '#00000022';
  for (let px = dx + door / 8; px < dx + door; px += door / 4) ctx.fillRect(px, top + h * 0.06, door / 10, h * 0.94);
  ctx.fillStyle = '#3ad16b'; rr(ctx, dx + door / 2 - 9, top + h * 0.06 - 9, 18, 7, 2); ctx.fill();
}

// ---- one seat with its passenger, seen from the front; (x, y) is the floor under the front of the cushion ----
export function drawSeat(ctx, x, y, s, theme, look, mood, calling, now) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#00000026';
  ctx.beginPath(); ctx.ellipse(0, 2, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
  // seat back and headrest cover
  rr(ctx, -27, -84, 54, 78, 12);
  ctx.fillStyle = shade(ctx, 0, -84, 0, 78, mix(theme.seat, '#ffffff', 0.18), theme.seatDark); ctx.fill();
  rr(ctx, -19, -80, 38, 16, 6);
  ctx.fillStyle = theme.rest; ctx.fill();
  if (calling) {
    ctx.fillStyle = `rgba(255, 214, 64, ${0.6 + 0.4 * Math.sin(now / 150)})`;
    ctx.beginPath(); ctx.arc(20, -88, 4.5, 0, Math.PI * 2); ctx.fill();
  }
  drawPerson(ctx, { ...look, cushion: theme.seatDark }, mood, now);
  // armrests in front of the arms
  for (const side of [-1, 1]) {
    rr(ctx, side * 29 - 4, -38, 8, 30, 3);
    ctx.fillStyle = '#8f9ab0'; ctx.fill();
    rr(ctx, side * 29 - 5, -40, 10, 6, 3);
    ctx.fillStyle = '#5d677d'; ctx.fill();
  }
  ctx.restore();
}

// A seated cartoon passenger: big head, big eyes, a hairdo, a top, trousers or a skirt, shoes.
function drawPerson(ctx, look, mood, now) {
  const { skin, hair, style, shirt, pants, eye, skirt } = look;
  const shake = mood === 'angry' && now % 300 < 150 ? 1 : 0;
  ctx.save();
  ctx.translate(shake, 0);
  // long hair falls behind the shoulders
  if (style === 2 || style === 4) {
    ctx.fillStyle = mix(hair, '#000000', 0.15);
    rr(ctx, -17, -70, 34, 40, 12); ctx.fill();
  }
  // torso and arms
  rr(ctx, -15, -46, 30, 36, 11);
  ctx.fillStyle = shade(ctx, 0, -46, 0, 36, mix(shirt, '#ffffff', 0.15), mix(shirt, '#000000', 0.15)); ctx.fill();
  ctx.fillStyle = mix(shirt, '#000000', 0.1);
  for (const side of [-1, 1]) { rr(ctx, side * 16 - 4, -43, 8, 28, 4); ctx.fill(); }
  ctx.fillStyle = skin;
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * 13, -14, 4.2, 0, Math.PI * 2); ctx.fill(); }
  // collar
  ctx.fillStyle = mix(shirt, '#ffffff', 0.45);
  ctx.beginPath(); ctx.moveTo(-6, -46); ctx.lineTo(0, -39); ctx.lineTo(6, -46); ctx.closePath(); ctx.fill();
  // cushion, then the lap and legs coming toward us
  rr(ctx, -27, -16, 54, 15, 6);
  ctx.fillStyle = mix(look.cushion, '#000000', 0.05); ctx.fill();
  ctx.fillStyle = skirt ? mix(shirt, '#000000', 0.25) : pants;
  rr(ctx, -13, -18, 26, 12, 5); ctx.fill();
  for (const side of [-1, 1]) {
    ctx.fillStyle = skirt ? skin : pants;
    rr(ctx, side * 6.5 - 4.5, -8, 9, 22, 4); ctx.fill();
    ctx.fillStyle = look.shoes;
    ctx.beginPath(); ctx.ellipse(side * 6.5, 15, 6, 3.6, 0, 0, Math.PI * 2); ctx.fill();
  }
  // neck and head
  ctx.fillStyle = mix(skin, '#000000', 0.08);
  ctx.fillRect(-4, -52, 8, 8);
  ctx.fillStyle = skin;
  ctx.beginPath(); ctx.ellipse(0, -63, 15, 16, 0, 0, Math.PI * 2); ctx.fill();
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * 14.5, -61, 3, 0, Math.PI * 2); ctx.fill(); }
  if (mood === 'angry') {
    ctx.fillStyle = '#ff3b3b33';
    ctx.beginPath(); ctx.ellipse(0, -63, 15, 16, 0, 0, Math.PI * 2); ctx.fill();
  }
  // hair on top
  ctx.fillStyle = hair;
  ctx.beginPath();
  switch (style) {
    case 0: // short and swept
      ctx.ellipse(0, -72, 16, 10, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-15, -70); ctx.quadraticCurveTo(-4, -82, 12, -70); ctx.quadraticCurveTo(2, -74, -15, -66); ctx.fill();
      break;
    case 1: // a bun
      ctx.ellipse(0, -71, 16, 11, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(0, -84, 7, 0, Math.PI * 2); ctx.fill();
      break;
    case 2: // long with a fringe
      ctx.ellipse(0, -71, 17, 12, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillRect(-17, -71, 5, 22); ctx.fillRect(12, -71, 5, 22);
      ctx.beginPath(); ctx.moveTo(-13, -72); ctx.lineTo(13, -72); ctx.lineTo(10, -66); ctx.lineTo(-10, -66); ctx.fill();
      break;
    case 3: // curly
      for (const [cx, cy] of [[-11, -72], [-4, -78], [4, -78], [11, -72], [-14, -64], [14, -64]]) { ctx.beginPath(); ctx.arc(cx, cy, 6.5, 0, Math.PI * 2); ctx.fill(); }
      break;
    default: // bob with a beret
      ctx.ellipse(0, -70, 17, 12, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillRect(-17, -70, 6, 13); ctx.fillRect(11, -70, 6, 13);
      ctx.fillStyle = look.hat;
      ctx.beginPath(); ctx.ellipse(-2, -79, 15, 6, -0.15, 0, Math.PI * 2); ctx.fill();
  }
  // face
  const ey = -62;
  if (mood === 'happy') {
    ctx.strokeStyle = '#2a1a1a'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * 6, ey + 1, 3, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
    ctx.fillStyle = '#b8323f';
    ctx.beginPath(); ctx.arc(0, -55, 4.6, 0, Math.PI); ctx.fill();
  } else {
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(side * 6, ey, 4, 4.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = eye;
      ctx.beginPath(); ctx.arc(side * 6, ey + 0.6, 2.9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#16121c';
      ctx.beginPath(); ctx.arc(side * 6, ey + 0.8, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(side * 6 + 1.2, ey - 1, 1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.strokeStyle = mix(hair, '#000000', 0.2); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const cross = mood === 'cross' || mood === 'angry';
    for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 9, ey - (cross ? 8 : 7.5)); ctx.lineTo(side * 3, ey - (cross ? 5.5 : 8)); ctx.stroke(); }
    ctx.strokeStyle = '#8a3a3a'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (cross) ctx.arc(0, -51, 3.5, Math.PI * 1.15, Math.PI * 1.85);
    else ctx.arc(0, -56.5, 3.4, 0.2, Math.PI - 0.2);
    ctx.stroke();
  }
  ctx.fillStyle = mood === 'angry' ? '#ff4d4d66' : '#ff8a9a55';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.ellipse(side * 10, -56, 3, 2, 0, 0, Math.PI * 2); ctx.fill(); }
  if (mood === 'angry') {
    ctx.fillStyle = '#ffffffcc';
    for (const side of [-1, 1]) {
      const rise = (now / 12) % 14;
      ctx.beginPath(); ctx.arc(side * 18, -78 - rise, 3 + rise * 0.15, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
}

// ---- the stewardess, seen from behind, pushing the cart up the aisle; (x, y) is under her feet ----
export function drawStewardess(ctx, x, y, s, cart, walking, now, drawItem) {
  const step = walking ? Math.sin(now / 90) : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = '#00000030';
  ctx.beginPath(); ctx.ellipse(0, 0, 26, 6, 0, 0, Math.PI * 2); ctx.fill();
  // the cart ahead of her: a steel trolley, its top laid with what it carries
  ctx.fillStyle = '#00000022';
  ctx.beginPath(); ctx.ellipse(0, -40, 30, 6, 0, 0, Math.PI * 2); ctx.fill();
  rr(ctx, -28, -100, 56, 62, 6);
  ctx.fillStyle = shade(ctx, 0, -100, 0, 62, '#4a5f8c', '#24345a'); ctx.fill();
  ctx.fillStyle = '#ffffff22';
  for (let i = 0; i < 3; i += 1) { rr(ctx, -24, -92 + i * 17, 48, 13, 3); ctx.fill(); }
  ctx.fillStyle = '#3ad16b'; rr(ctx, -24, -92, 14, 13, 3); ctx.fill();
  // tray top
  ctx.beginPath(); ctx.moveTo(-31, -100); ctx.lineTo(31, -100); ctx.lineTo(26, -116); ctx.lineTo(-26, -116); ctx.closePath();
  ctx.fillStyle = '#dfe5ef'; ctx.fill();
  ctx.strokeStyle = '#9aa6bd'; ctx.lineWidth = 1.5; ctx.stroke();
  const n = cart.length;
  cart.forEach((dish, i) => drawItem(ctx, dish, (i - (n - 1) / 2) * Math.min(14, 50 / Math.max(1, n)), -110, 15));
  // legs and shoes
  for (const side of [-1, 1]) {
    const lift = side * step * 2;
    ctx.fillStyle = '#f0c8a8';
    rr(ctx, side * 6 - 3.5, -24 - lift, 7, 22, 3); ctx.fill();
    ctx.fillStyle = '#1d2a4d';
    ctx.beginPath(); ctx.ellipse(side * 6, -2 - lift, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
  }
  // navy skirt, white blouse, arms reaching for the cart handle
  ctx.beginPath(); ctx.moveTo(-14, -46); ctx.lineTo(14, -46); ctx.lineTo(16, -22); ctx.lineTo(-16, -22); ctx.closePath();
  ctx.fillStyle = '#22356b'; ctx.fill();
  rr(ctx, -15, -72, 30, 30, 10);
  ctx.fillStyle = shade(ctx, 0, -72, 0, 30, '#ffffff', '#dce3ee'); ctx.fill();
  ctx.fillStyle = '#c0283a'; rr(ctx, -16, -48, 32, 4, 2); ctx.fill();
  // arms reaching forward along her sides to the handle on the near end of the cart
  ctx.fillStyle = '#c3cde0';
  rr(ctx, -26, -64, 52, 4, 2); ctx.fill();
  ctx.strokeStyle = '#eef2f8'; ctx.lineWidth = 6.5; ctx.lineCap = 'round';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.moveTo(side * 15, -68); ctx.quadraticCurveTo(side * 21, -62, side * 20, -58); ctx.stroke(); }
  ctx.fillStyle = '#f0c8a8';
  for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(side * 20, -60, 3.6, 0, Math.PI * 2); ctx.fill(); }
  // red scarf knot, blonde hair in a bun, navy cap
  ctx.fillStyle = '#d43145';
  ctx.beginPath(); ctx.moveTo(-6, -73); ctx.lineTo(6, -73); ctx.lineTo(9, -66); ctx.lineTo(-9, -66); ctx.fill();
  ctx.fillStyle = '#ecc56e';
  ctx.beginPath(); ctx.ellipse(0, -84, 13, 14, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d9ab4f';
  ctx.beginPath(); ctx.arc(0, -78, 7, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ecc56e';
  ctx.beginPath(); ctx.arc(0, -79, 5.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#1f3570';
  ctx.beginPath(); ctx.ellipse(2, -96, 11, 5.5, -0.25, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(-7, -96, 16, 1.5);
  ctx.restore();
}

// ---- an order bubble: pale blue card, the patience bar on top, the dishes inside ----
// Dishes the cart already carries get a green dot, so it is plain on a phone what can be handed over now.
// The card stays between `left` and `right`; its pointer still points at the passenger.
export function drawBubble(ctx, cx, bottom, k, call, drawItem, now, { cart = [], left: minX = -Infinity, right: maxX = Infinity } = {}) {
  const n = call.items.length;
  const w = (n * 31 + 10) * k, h = 40 * k;
  const x = Math.max(minX, Math.min(maxX - w, cx - w / 2)), y = bottom - h - 6 * k;
  const share = Math.max(0, Math.min(1, call.patience / call.max));
  ctx.save();
  ctx.shadowColor = '#00000040'; ctx.shadowBlur = 6 * k; ctx.shadowOffsetY = 2 * k;
  const px = Math.max(x + 9 * k, Math.min(x + w - 9 * k, cx));
  ctx.beginPath(); ctx.moveTo(px - 7 * k, y + h - 1); ctx.lineTo(px, bottom); ctx.lineTo(px + 7 * k, y + h - 1); ctx.closePath();
  ctx.fillStyle = '#1f3c74'; ctx.fill();
  rr(ctx, x, y, w, h, 8 * k);
  ctx.fillStyle = '#1f3c74'; ctx.fill();
  ctx.shadowColor = 'transparent';
  rr(ctx, x + 2 * k, y + 2 * k, w - 4 * k, h - 4 * k, 6.5 * k);
  ctx.fillStyle = '#e3f4ff'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(px - 5 * k, y + h - 3 * k); ctx.lineTo(px, bottom - 3 * k); ctx.lineTo(px + 5 * k, y + h - 3 * k); ctx.closePath();
  ctx.fill();
  // what is still owed is drawn bright (with a green dot when the cart has it), what was handed over is faded with a tick
  const left = [...call.left], onCart = [...cart];
  call.items.forEach((dish, i) => {
    const at = left.indexOf(dish), owed = at >= 0;
    if (owed) left.splice(at, 1);
    const ix = x + (5 + 15.5 + i * 31) * k, iy = y + h / 2;
    drawItem(ctx, dish, ix, iy, 29 * k, { alpha: owed ? 1 : 0.28 });
    if (!owed) { ctx.fillStyle = '#21a85a'; ctx.font = `900 ${18 * k}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✓', ix, iy); return; }
    const has = onCart.indexOf(dish);
    if (has < 0) return;
    onCart.splice(has, 1);
    ctx.beginPath(); ctx.arc(ix + 11 * k, iy - 11 * k, 5 * k, 0, Math.PI * 2);
    ctx.fillStyle = '#2fcf6a'; ctx.fill();
    ctx.lineWidth = 1.5 * k; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  });
  // patience: red underneath, green for what is left; it blinks when nearly gone
  const by = y - 9 * k, bh = 6 * k;
  rr(ctx, x + 2 * k, by, w - 4 * k, bh, bh / 2);
  ctx.fillStyle = '#e8323c'; ctx.fill();
  if (share > 0) {
    rr(ctx, x + 2 * k, by, (w - 4 * k) * share, bh, bh / 2);
    ctx.fillStyle = share < 0.3 && Math.sin(now / 90) > 0 ? '#ffe066' : '#5fd147'; ctx.fill();
  }
  ctx.lineWidth = 1; ctx.strokeStyle = '#1c2a4a88'; rr(ctx, x + 2 * k, by, w - 4 * k, bh, bh / 2); ctx.stroke();
  ctx.restore();
  return { x, y: by, w, h: bottom - by };
}
// How many more of a dish the waiting passengers need, as a badge on its station's name plate.
export function drawNeed(ctx, rightX, cy, count) {
  const text = `缺 ${count}`;
  ctx.font = '900 10px system-ui, sans-serif';
  const w = ctx.measureText(text).width + 10;
  rr(ctx, rightX - w, cy - 7, w, 14, 7);
  ctx.fillStyle = '#ff4f5e'; ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, rightX - w / 2, cy + 0.5);
}

// ---- galley stations: a steel cabinet with a dark name plate and the appliance in front ----
export function drawCabinet(ctx, b, name, accent, open) {
  rr(ctx, b.x, b.y, b.w, b.h, 9);
  ctx.fillStyle = open ? shade(ctx, 0, b.y, 0, b.h, '#f5f7fb', '#c3ccd9') : '#7f8aa033';
  ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = open ? '#8a96ab' : '#ffffff22'; ctx.stroke();
  if (!open) return;
  rr(ctx, b.x + 4, b.y + 4, b.w - 8, 15, 5);
  ctx.fillStyle = '#2c3a55'; ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(b.x + 8, b.y + 9, 4, 5);
  ctx.fillStyle = '#ffffff'; ctx.font = '800 10px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(name, b.x + 16, b.y + 12);
}
// A dispenser: a glass jug of juice on a tap, or a little glass-door fridge of cakes.
export function drawDispenser(ctx, id, cx, cy, drawItem) {
  if (id === 'juice') {
    rr(ctx, cx - 16, cy - 18, 32, 30, 6);
    ctx.fillStyle = '#ffffffaa'; ctx.fill();
    rr(ctx, cx - 14, cy - 8, 28, 18, 5);
    ctx.fillStyle = shade(ctx, 0, cy - 8, 0, 18, '#ffb347', '#f57c1f'); ctx.fill();
    ctx.fillStyle = '#ffffff66'; ctx.fillRect(cx - 10, cy - 14, 3, 22);
    ctx.fillStyle = '#5d677d'; rr(ctx, cx - 4, cy + 12, 8, 6, 2); ctx.fill();
    ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(cx + 9, cy - 4, 4, 0, Math.PI * 2); ctx.fill();
    return;
  }
  rr(ctx, cx - 26, cy - 18, 52, 38, 5);
  ctx.fillStyle = '#5d677d'; ctx.fill();
  rr(ctx, cx - 23, cy - 15, 46, 32, 4);
  ctx.fillStyle = '#d9f1ff'; ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.fillRect(cx - 23, cy + 1, 46, 2);
  drawItem(ctx, 'cake', cx - 11, cy - 6, 16); drawItem(ctx, 'cake', cx + 11, cy - 6, 16);
  drawItem(ctx, 'cake', cx - 11, cy + 10, 14); drawItem(ctx, 'cake', cx + 11, cy + 10, 14);
  ctx.fillStyle = '#ffffff55'; ctx.fillRect(cx + 15, cy - 15, 3, 32);
}
// The holder a cooker slot sits on: a hob ring for the pot, a plate for the rest.
export function drawSlotBase(ctx, id, cx, cy, r) {
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = id === 'noodle' ? '#2f3646' : '#d5dce8'; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = id === 'noodle' ? '#ff6b4a66' : '#9aa6bd'; ctx.stroke();
}

// ---- HUD pill in the reference's style: a slanted navy plaque with a white rim ----
export function drawPill(ctx, x, y, w, h) {
  const k = h * 0.35;
  ctx.beginPath();
  ctx.moveTo(x + k, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - k, y + h); ctx.lineTo(x, y + h); ctx.closePath();
  ctx.fillStyle = shade(ctx, 0, y, 0, h, '#3c6bc4', '#1d3c7c'); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = '#ffffffcc'; ctx.stroke();
}
export function drawCoin(ctx, x, y, r) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = shade(ctx, 0, y - r, 0, 2 * r, '#ffe680', '#e8a417'); ctx.fill();
  ctx.lineWidth = Math.max(1, r * 0.18); ctx.strokeStyle = '#b77a0c'; ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, r * 0.55, 0, Math.PI * 2); ctx.strokeStyle = '#c98d12aa'; ctx.stroke();
}

export function lookFor(seat, stage) {
  const h = (seat * 2654435761 + stage * 40503) >>> 0;
  const pick = (list, shift) => list[(h >>> shift) % list.length];
  const style = (h >>> 3) % 5;
  return {
    skin: pick(SKIN, 0), hair: pick(HAIR, 5), style, shirt: pick(SHIRT, 9), pants: pick(PANTS, 13), eye: pick(EYES, 17),
    shoes: pick(['#2b2b33', '#6b3f2a', '#e9e9ef', '#3b4a6b'], 19), hat: pick(['#e0533f', '#2fa6c9', '#ffcf4d'], 21),
    skirt: (style === 2 || style === 4) && ((h >>> 23) & 1) === 1
  };
}
