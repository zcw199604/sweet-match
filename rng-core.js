// 可存进状态里的伪随机数（mulberry32）。box.s 是唯一的状态，所以 apply 可以做到：同样的 状态+动作 → 同样的结果。
// 服务端适配器和浏览器共用这一份（2048 竞速在本地预测新块，必须和服务端算得一模一样）。
export function rngFrom(box) {
  return () => {
    box.s = (box.s + 0x6D2B79F5) | 0;
    let t = Math.imul(box.s ^ (box.s >>> 15), 1 | box.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
