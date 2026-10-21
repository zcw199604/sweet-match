// 全屏时的「分区合成」：画布游戏都按固定的竖版逻辑尺寸（如 360×640）画，信息栏、棋盘、按钮写死在里面。
// 全屏后画布铺满可用区域，游戏照常往一块离屏画布画一帧，这里再把它切成几块重新摆：
//   main（棋盘 / 游戏区）尽量放大；top / bottom（信息栏、按钮栏）保持原来的大小，
//   竖屏摆在上下；横屏时游戏区在左、信息栏按顺序叠成一列放在右边（挨着舞台的按钮栏），个别栏可用 land: 'left' 放到左边。
// 不在全屏时什么都不做：游戏直接画在画布上，和以前一样。
// regions() 每帧调用，返回逻辑坐标里的矩形 [{ x, y, w, h, role: 'main' | 'top' | 'bottom', land?: 'left' | 'right' }]，
// 不给或只给 main 以外的也行（没有 main 就把整张画布当 main）。
const BAR = 0.9; // 信息栏的缩放上限：不比平时手机上看到的大
const BAR_MIN = 0.72; // 横屏时为了让游戏区更大，信息栏最多缩到这么小（再小字就看不清了）
const GAP = 8;
const MAX_SIDE = 4096; // 离屏画布单边上限

const isFull = () => document.body.classList.contains('game-full');

// 纯计算：把各块摆进 cw × ch（CSS 像素）。返回 [{ src: 逻辑矩形, x, y, s }]，s 是逻辑像素 → CSS 像素的倍数。
export function placeRegions(list, cw, ch) {
  const main = list.find((r) => r.role === 'main');
  const bars = list.filter((r) => r !== main);
  const out = [];
  if (cw >= ch) {
    const left = bars.filter((r) => r.land === 'left');
    const right = bars.filter((r) => !left.includes(r));
    const gaps = GAP * ((left.length ? 1 : 0) + (right.length ? 1 : 0));
    const widest = (col) => (col.length ? Math.max(...col.map((r) => r.w)) : 0);
    const fitH = (col) => (col.length ? (ch - GAP * (col.length - 1)) / col.reduce((sum, r) => sum + r.h, 0) : BAR);
    const wl = widest(left), wr = widest(right);
    let sl = Math.min(BAR, fitH(left)), sr = Math.min(BAR, fitH(right));
    // 两侧太宽、游戏区被宽度卡住时，信息栏缩小一点让出位置（不小于 BAR_MIN）
    const room = cw - gaps - main.w * (ch / main.h);
    if (wl * sl + wr * sr > room) { const k = Math.max(BAR_MIN, room / Math.max(1, wl + wr)); sl = Math.min(sl, k); sr = Math.min(sr, k); }
    const sm = Math.max(0.1, Math.min(ch / main.h, (cw - gaps - wl * sl - wr * sr) / main.w));
    let x = (cw - (gaps + wl * sl + wr * sr + main.w * sm)) / 2;
    const column = (col, s, colW) => {
      if (!col.length) return;
      let y = (ch - col.reduce((sum, r) => sum + r.h * s, 0) - GAP * (col.length - 1)) / 2;
      for (const r of col) { out.push({ src: r, x: x + (colW - r.w * s) / 2, y, s }); y += r.h * s + GAP; }
      x += colW + GAP;
    };
    column(left, sl, wl * sl);
    out.push({ src: main, x, y: (ch - main.h * sm) / 2, s: sm });
    x += main.w * sm + GAP;
    column(right, sr, wr * sr);
    return out;
  }
  const top = bars.filter((r) => r.role === 'top'), bottom = bars.filter((r) => r.role !== 'top');
  const sb = bars.length ? Math.min(BAR, ...bars.map((r) => cw / r.w)) : 1;
  const stack = (col) => col.reduce((sum, r) => sum + r.h * sb + GAP, 0);
  const topEnd = stack(top), bottomStart = ch - stack(bottom);
  const sm = Math.max(0.1, Math.min(cw / main.w, (bottomStart - topEnd) / main.h));
  let y = 0;
  for (const r of top) { out.push({ src: r, x: (cw - r.w * sb) / 2, y, s: sb }); y += r.h * sb + GAP; }
  out.push({ src: main, x: (cw - main.w * sm) / 2, y: topEnd + (bottomStart - topEnd - main.h * sm) / 2, s: sm });
  y = bottomStart + GAP;
  for (const r of bottom) { out.push({ src: r, x: (cw - r.w * sb) / 2, y, s: sb }); y += r.h * sb + GAP; }
  return out;
}

// canvas：游戏画布；width / height：逻辑尺寸；regions：见上；onChange：进出全屏、尺寸变化后要重画一帧。
export function fitView(canvas, { width, height, regions = null, onChange = () => {} }) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const visible = canvas.getContext('2d');
  let active = false, cssW = width, cssH = height;
  let placed = [], scale = 1;
  let off = null, offCtx = null;
  // 全屏样式按这个标记把容器撑满可用区域（style.css 的全屏段）
  if (regions && canvas.parentElement) canvas.parentElement.dataset.fit = '';

  function sync() {
    if (regions && canvas.parentElement && !('fit' in canvas.parentElement.dataset)) canvas.parentElement.dataset.fit = '';
    const want = Boolean(regions) && isFull();
    const box = canvas.getBoundingClientRect();
    const changed = want !== active || (want && (Math.round(box.width) !== cssW || Math.round(box.height) !== cssH));
    if (!changed) return;
    active = want;
    canvas.classList.toggle('fit-active', active);
    canvas.parentElement?.classList.toggle('fit-active', active);
    if (active) {
      cssW = Math.max(1, Math.round(box.width)); cssH = Math.max(1, Math.round(box.height));
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
    } else {
      cssW = width; cssH = height;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    onChange();
  }
  // 全屏切换时样式先变、尺寸后变：两种都盯着
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => sync()) : null;
  observer?.observe(canvas);
  const classWatch = typeof MutationObserver === 'function' ? new MutationObserver(() => requestAnimationFrame(sync)) : null;
  classWatch?.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  function layout() {
    let list = [];
    try { list = regions() ?? []; } catch { /* 游戏还没准备好（state 为空等）：整张画布一起放大 */ }
    if (!list.some((r) => r.role === 'main')) list.push({ x: 0, y: 0, w: width, h: height, role: 'main' });
    placed = placeRegions(list.filter((r) => r.w > 0 && r.h > 0), cssW, cssH);
    scale = Math.min(Math.max(...placed.map((p) => p.s)) * dpr, MAX_SIDE / Math.max(width, height));
  }

  return {
    dpr,
    get active() { return active; },
    // 「逻辑坐标」的变换倍数：画到一半要 setTransform 回逻辑坐标时用它代替 dpr
    get unit() { return active ? scale : dpr; },
    sync,
    // 开始画一帧：返回要画进去的 ctx，已经设好「逻辑坐标」的变换并清空。
    begin() {
      if (!active) {
        visible.setTransform(dpr, 0, 0, dpr, 0, 0);
        visible.clearRect(0, 0, width, height);
        return visible;
      }
      layout();
      const w = Math.ceil(width * scale), h = Math.ceil(height * scale);
      if (!off || off.width !== w || off.height !== h) {
        off = document.createElement('canvas');
        off.width = w; off.height = h;
        offCtx = off.getContext('2d');
      }
      offCtx.setTransform(scale, 0, 0, scale, 0, 0);
      offCtx.clearRect(0, 0, width, height);
      return offCtx;
    },
    // 画完：全屏时把离屏画布按分区贴到可见画布上。
    end() {
      if (!active) return;
      visible.setTransform(1, 0, 0, 1, 0, 0);
      visible.clearRect(0, 0, canvas.width, canvas.height);
      visible.imageSmoothingQuality = 'high';
      for (const { src, x, y, s } of placed) {
        visible.drawImage(off, src.x * scale, src.y * scale, src.w * scale, src.h * scale, x * dpr, y * dpr, src.w * s * dpr, src.h * s * dpr);
      }
    },
    // 页面坐标 → 逻辑坐标：落在哪块就按哪块换算，都不在就按最近的一块；role 指定时（拖动瞄准之类）一律按那块换算。
    point(clientX, clientY, role = '') {
      const rect = canvas.getBoundingClientRect();
      if (!active) return { x: (clientX - rect.left) * width / rect.width, y: (clientY - rect.top) * height / rect.height };
      if (!placed.length) layout();
      const px = clientX - rect.left, py = clientY - rect.top;
      let best = role ? placed.find((p) => p.src.role === role) : null, bestD = best ? -1 : Infinity;
      for (const p of best ? [] : placed) {
        const dx = Math.max(p.x - px, 0, px - (p.x + p.src.w * p.s)), dy = Math.max(p.y - py, 0, py - (p.y + p.src.h * p.s));
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = p; }
      }
      return { x: best.src.x + (px - best.x) / best.s, y: best.src.y + (py - best.y) / best.s };
    },
    // 逻辑坐标 → 页面坐标（给测试点击用）。
    page(x, y) {
      const rect = canvas.getBoundingClientRect();
      if (!active) return { x: rect.left + x * rect.width / width, y: rect.top + y * rect.height / height };
      if (!placed.length) layout();
      const hit = placed.find((p) => x >= p.src.x && x <= p.src.x + p.src.w && y >= p.src.y && y <= p.src.y + p.src.h) ?? placed.find((p) => p.src.role === 'main');
      return { x: rect.left + hit.x + (x - hit.src.x) * hit.s, y: rect.top + hit.y + (y - hit.src.y) * hit.s };
    },
    destroy() { observer?.disconnect(); classWatch?.disconnect(); }
  };
}
