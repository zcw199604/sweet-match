// 全屏的「模拟横竖屏」：浏览器锁不了屏幕方向（iPhone Safari、桌面）时，app.js 把舞台用 CSS 转 90°（body.full-rot，
// translateX(视口宽) rotate(90deg)）。舞台里的东西在页面上的坐标也跟着转了：换算点击、量尺寸时先用这里的函数
// 转回「舞台自己的方向」再算。没转的时候原样返回，所以平时调用没有任何区别。
const rotated = () => document.body.classList.contains('full-rot');
const span = () => window.innerWidth;

// 页面坐标 → 舞台方向的坐标
export function framePoint(x, y) { return rotated() ? { x: y, y: span() - x } : { x, y }; }
// 元素在舞台方向下的位置和大小（getBoundingClientRect 量到的是转过之后的外框）
export function frameRect(node) {
  const r = node.getBoundingClientRect();
  return rotated() ? { left: r.top, top: span() - r.left - r.width, width: r.height, height: r.width } : { left: r.left, top: r.top, width: r.width, height: r.height };
}
// 舞台方向的坐标 → 页面坐标（测试要点哪儿）
export function toClient(x, y) { return rotated() ? { x: span() - y, y: x } : { x, y }; }
