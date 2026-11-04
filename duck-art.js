// 数独鸭的角色：正脸的白色鸭头，大眼睛、橙色扁嘴，头上一顶学士帽（解谜要动脑），粗黑描边外面再一圈白边，像贴纸。
// 只管「画一帧」：眼睛往哪看、眨不眨眼、嘴张多大、帽子偏多少都由调用方按时间算好传进来，
// 这样同一个函数既能画静止的小图标，也能拼出放鸭 / 拿鸭 / 发呆 / 通关这些动画。
//
// drawDuckHead(ctx, x, y, s, opts)：(x, y) 是格子中心，s 是格子边长。opts：
//   lift 往上抬多少像素；sx / sy 压扁拉长；tilt 整只歪头（弧度）；alpha 透明度；
//   look {x, y} 眼珠朝向，各在 -1..1；blink 闭眼；happy 眯眼笑（^ ^）；angry 皱眉；
//   open 嘴张开 0..1；hat { dy, tilt, alpha } 帽子单独的偏移（向上为负，按 s 的比例）；
//   tassel 流苏摆角（弧度）；shadow 脚下影子；sticker 外面那圈白边。
const OUTLINE = '#2a2233';

export function drawDuckHead(ctx, x, y, s, {
  lift = 0, sx = 1, sy = 1, tilt = 0, alpha = 1, look = null, blink = false, happy = false, angry = false,
  open = 0, hat = null, tassel = 0, shadow = true, sticker = true
} = {}) {
  if (alpha <= 0) return;
  const u = (v) => v * s;
  ctx.save();
  ctx.globalAlpha *= alpha;
  if (shadow) {
    const k = Math.max(0.4, 1 - lift / s);
    ctx.beginPath();
    ctx.ellipse(x, y + u(0.37), u(0.25) * k * sx, u(0.05) * k, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#2b2f452e';
    ctx.fill();
  }
  // 以下巴为原点压扁 / 拉长，再整体抬高
  ctx.translate(x, y + u(0.36) - lift);
  ctx.rotate(tilt);
  ctx.scale(sx, sy);
  ctx.translate(0, -u(0.36));
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const hatDy = hat ? u(hat.dy ?? 0) : 0, hatTilt = hat ? hat.tilt ?? 0 : 0, hatAlpha = hat ? hat.alpha ?? 1 : 1;
  const headPath = () => { ctx.beginPath(); ctx.ellipse(0, u(0.06), u(0.34), u(0.31), 0, 0, Math.PI * 2); };
  const beakPath = () => {
    ctx.beginPath();
    ctx.moveTo(u(-0.18), u(0.12));
    ctx.quadraticCurveTo(0, u(0.04), u(0.18), u(0.12));
    ctx.quadraticCurveTo(u(0.17), u(0.2), u(0.11), u(0.205));
    ctx.quadraticCurveTo(0, u(0.225), u(-0.11), u(0.205));
    ctx.quadraticCurveTo(u(-0.17), u(0.2), u(-0.18), u(0.12));
    ctx.closePath();
  };
  const lowerPath = () => {
    const drop = u(0.03 + open * 0.08);
    ctx.beginPath();
    ctx.moveTo(u(-0.11), u(0.2));
    ctx.quadraticCurveTo(0, u(0.21) + drop * 2.1, u(0.11), u(0.2));
    ctx.closePath();
  };
  const withHat = (fn) => {
    ctx.save();
    ctx.translate(0, u(-0.27) + hatDy);
    ctx.rotate(hatTilt);
    ctx.translate(0, u(0.27));
    fn();
    ctx.restore();
  };
  const boardPath = () => {
    ctx.beginPath();
    ctx.moveTo(u(-0.37), u(-0.31)); ctx.lineTo(0, u(-0.41)); ctx.lineTo(u(0.37), u(-0.31)); ctx.lineTo(0, u(-0.21));
    ctx.closePath();
  };
  const capPath = () => {
    ctx.beginPath();
    ctx.moveTo(u(-0.21), u(-0.27));
    ctx.lineTo(u(-0.19), u(-0.15));
    ctx.quadraticCurveTo(0, u(-0.1), u(0.19), u(-0.15));
    ctx.lineTo(u(0.21), u(-0.27));
    ctx.closePath();
  };

  // 白边：头、嘴、帽子一起描粗白线，放在任何颜色的格子上都清楚
  if (sticker) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = u(0.13);
    headPath(); ctx.stroke();
    beakPath(); ctx.stroke();
    lowerPath(); ctx.stroke();
    if (hatAlpha > 0) withHat(() => { ctx.globalAlpha *= hatAlpha; capPath(); ctx.stroke(); boardPath(); ctx.stroke(); });
  }

  // 头
  const g = ctx.createLinearGradient(0, u(-0.25), 0, u(0.37));
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.65, '#fbf8f2');
  g.addColorStop(1, '#e6e0ec');
  headPath();
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = u(0.045);
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  // 腮红
  ctx.fillStyle = '#ff9fb2b0';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * u(0.235), u(0.12), u(0.05), u(0.03), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 眼睛
  const lx = look ? Math.max(-1, Math.min(1, look.x)) : 0, ly = look ? Math.max(-1, Math.min(1, look.y)) : 0;
  for (const side of [-1, 1]) {
    const ex = side * u(0.12), ey = u(-0.01);
    if (happy) {
      ctx.beginPath();
      ctx.arc(ex, ey + u(0.03), u(0.06), Math.PI * 1.1, Math.PI * 1.9);
      ctx.lineWidth = u(0.04);
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    ctx.ellipse(ex, ey, u(0.1), u(0.122), side * -0.12, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = u(0.035);
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    if (blink) {
      ctx.beginPath();
      ctx.ellipse(ex, ey, u(0.1), u(0.122), side * -0.12, 0, Math.PI * 2);
      ctx.fillStyle = '#f4f0f6';
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex - u(0.075), ey + u(0.01));
      ctx.quadraticCurveTo(ex, ey + u(0.05), ex + u(0.075), ey + u(0.01));
      ctx.stroke();
    } else {
      const px = ex + lx * u(0.04), py = ey + ly * u(0.055);
      ctx.beginPath();
      ctx.arc(px, py, u(0.05), 0, Math.PI * 2);
      ctx.fillStyle = OUTLINE;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(px - u(0.017), py - u(0.02), u(0.017), 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
  }
  // 生气：两道往中间压下来的粗眉毛，压在眼睛上沿（再往上会被帽檐挡住）
  if (angry) {
    ctx.lineWidth = u(0.05);
    ctx.strokeStyle = OUTLINE;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(side * u(0.215), u(-0.115));
      ctx.lineTo(side * u(0.04), u(-0.06));
      ctx.stroke();
    }
  }

  // 嘴：张开时先画里面的暗红，再画下嘴、上嘴
  if (open > 0.05) {
    ctx.beginPath();
    ctx.ellipse(0, u(0.215), u(0.1), u(0.02 + open * 0.05), 0, 0, Math.PI * 2);
    ctx.fillStyle = '#7a2a1a';
    ctx.fill();
  }
  lowerPath();
  ctx.fillStyle = '#e8691a';
  ctx.fill();
  ctx.lineWidth = u(0.035);
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  beakPath();
  const bg = ctx.createLinearGradient(0, u(0.05), 0, u(0.22));
  bg.addColorStop(0, '#ffb347');
  bg.addColorStop(1, '#ff8a1f');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#c45a10';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(side * u(0.045), u(0.11), u(0.014), u(0.009), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 学士帽：帽身、帽板、顶上的扣子和一条会晃的金色流苏
  if (hatAlpha > 0) {
    withHat(() => {
      ctx.globalAlpha *= hatAlpha;
      capPath();
      ctx.fillStyle = '#3a4170';
      ctx.fill();
      ctx.lineWidth = u(0.035);
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
      // 帽板下沿的厚度
      ctx.beginPath();
      ctx.moveTo(u(-0.37), u(-0.31)); ctx.lineTo(0, u(-0.21)); ctx.lineTo(u(0.37), u(-0.31));
      ctx.lineTo(u(0.37), u(-0.285)); ctx.lineTo(0, u(-0.185)); ctx.lineTo(u(-0.37), u(-0.285));
      ctx.closePath();
      ctx.fillStyle = '#1f2440';
      ctx.fill();
      ctx.stroke();
      boardPath();
      ctx.fillStyle = '#2d3352';
      ctx.fill();
      ctx.stroke();
      // 帽板上的高光
      ctx.beginPath();
      ctx.moveTo(u(-0.24), u(-0.33)); ctx.lineTo(u(-0.05), u(-0.385));
      ctx.lineWidth = u(0.025);
      ctx.strokeStyle = '#5a6496';
      ctx.stroke();
      // 流苏：从扣子拉到右角，再垂下来摆
      const hx = u(0.3), hy = u(-0.3);
      const ex = hx + Math.sin(tassel) * u(0.17), ey = hy + Math.cos(tassel) * u(0.17);
      ctx.beginPath();
      ctx.moveTo(0, u(-0.31));
      ctx.quadraticCurveTo(u(0.16), u(-0.33), hx, hy);
      ctx.lineTo(ex, ey);
      ctx.lineWidth = u(0.028);
      ctx.strokeStyle = '#ffc83d';
      ctx.stroke();
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(-tassel);
      ctx.beginPath();
      ctx.moveTo(-u(0.035), 0); ctx.lineTo(u(0.035), 0); ctx.lineTo(u(0.045), u(0.08)); ctx.lineTo(-u(0.045), u(0.08));
      ctx.closePath();
      ctx.fillStyle = '#ffc83d';
      ctx.fill();
      ctx.lineWidth = u(0.02);
      ctx.strokeStyle = '#c98a10';
      ctx.stroke();
      ctx.restore();
      ctx.beginPath();
      ctx.arc(0, u(-0.31), u(0.028), 0, Math.PI * 2);
      ctx.fillStyle = '#ffc83d';
      ctx.fill();
      ctx.lineWidth = u(0.02);
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    });
  }
  ctx.restore();
}

// 每只鸭子「发呆」时的样子：眼珠隔一会儿瞟向一个新方向、隔几秒眨一下眼、头一呼一吸地起伏、流苏来回晃。
// seed 让每只鸭的节奏错开；toward 给了就盯着那个方向看（指针 / 手指）。
const hash = (a, b) => {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
};
export function idlePose(seed, now, toward = null) {
  const t = now / 1000 + hash(seed, 7) * 10;
  const breathe = Math.sin(t * 2.4);
  let look;
  if (toward) look = toward;
  else {
    // 每 1.1–2 秒换一个方向；换的时候 0.12 秒滑过去，像眼珠一下子瞟过去
    const span = 1.1 + hash(seed, 3) * 0.9, k = Math.floor(t / span), q = Math.min(1, (t / span - k) * span / 0.12);
    const from = { x: hash(seed, k - 1) * 2 - 1, y: hash(seed + 99, k - 1) * 1.6 - 0.8 };
    const to = { x: hash(seed, k) * 2 - 1, y: hash(seed + 99, k) * 1.6 - 0.8 };
    look = { x: from.x + (to.x - from.x) * q, y: from.y + (to.y - from.y) * q };
  }
  const blink = (t * 0.27 + hash(seed, 11)) % 1 < 0.045;
  return { look, blink, sy: 1 + breathe * 0.018, sx: 1 - breathe * 0.012, tassel: Math.sin(t * 2.9) * 0.28, hat: { tilt: Math.sin(t * 1.3) * 0.03 } };
}
