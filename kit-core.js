// 新一批街机（ARCADE 23 起）共用的纯工具：可复现的随机数、洗牌和小数组操作。
// 规则核心（*-core.js）只从这里取东西，不碰 DOM，Node 测试可以直接 import。

// mulberry32：给同一个种子永远发同一串数，关卡「重试本关」就靠它原样重来。
export function rng(seed = Date.now()) {
  let a = (Number(seed) >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const randInt = (rand, n) => Math.floor(rand() * n);
export const pick = (rand, list) => list[randInt(rand, list.length)];
export function shuffle(list, rand = Math.random) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = randInt(rand, i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
// 关卡号 + 盐 → 固定种子：同一关每次打开都是同一个布局。
export const levelSeed = (game, level) => {
  let h = 2166136261;
  for (const ch of `${game}:${level}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
};
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const clone = (value) => JSON.parse(JSON.stringify(value));
