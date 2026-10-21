export { rngFrom } from '../../rng-core.js';   // 浏览器也要用，所以放在仓库根

// 从房主传来的选项里挑出白名单内的值，其余一律回落到默认值。
export const pick = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
