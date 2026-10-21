// 首页的管理员视图：同一个浏览器在 /ops.html 登录过（令牌存在 localStorage），首页就多一个「游玩记录」按钮，
// 每张游戏卡片上显示近 7 天所有玩家的总时长。没有令牌的普通玩家什么都看不到，也不会发请求；令牌失效（401）就清掉。
import { cnDayStart, formatDuration, gameOf } from './activity-core.js';

export const OPS_TOKEN_KEY = 'pao-ops-token';
const DAYS = 7, DAY = 86400000;
const REFRESH_MS = 60_000; // 来回切首页时不必每次都拉
let loadedAt = 0, loading = null;

function readToken() { try { return localStorage.getItem(OPS_TOKEN_KEY) ?? ''; } catch { return ''; } }

function render(byGame) {
  const button = document.querySelector('#open-ops');
  if (button) button.hidden = !byGame;
  for (const card of document.querySelectorAll('.arcade-card[data-mode]')) {
    let badge = card.querySelector('.ops-time');
    if (!byGame) { badge?.remove(); continue; }
    if (!badge) { badge = document.createElement('em'); badge.className = 'ops-time'; card.querySelector('.card-top').lastElementChild.before(badge); }
    badge.textContent = `${DAYS} 天 ${formatDuration(byGame[card.dataset.mode] ?? 0)}`;
  }
  if (button && byGame) {
    const total = Object.values(byGame).reduce((sum, ms) => sum + ms, 0);
    button.querySelector('span').textContent = `游玩记录 · ${DAYS} 天共 ${formatDuration(total)}`;
  }
}

async function load(token) {
  const today = cnDayStart(Date.now());
  const response = await fetch(`/api/admin/activity?from=${today - (DAYS - 1) * DAY}&to=${today + DAY}`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
  if (response.status === 401) { try { localStorage.removeItem(OPS_TOKEN_KEY); } catch { /* 隐私模式 */ } return null; }
  if (!response.ok) throw new Error(String(response.status));
  const byGame = {};
  for (const s of (await response.json()).sessions) byGame[gameOf(s.board)] = (byGame[gameOf(s.board)] ?? 0) + s.active_ms;
  return byGame;
}

// 回到首页时调用；force 用于令牌刚变（另一个标签页登录 / 退出）。
export function showOpsHome(force = false) {
  const token = readToken();
  if (!token) { loadedAt = 0; render(null); return Promise.resolve(); }
  if (loading || (!force && Date.now() - loadedAt < REFRESH_MS)) return loading ?? Promise.resolve();
  loading = load(token)
    .then((byGame) => { loadedAt = Date.now(); render(byGame); })
    .catch(() => { /* 接口暂时不可用：保持上次的显示，下次回首页再试 */ })
    .finally(() => { loading = null; });
  return loading;
}

export function initOpsHome() {
  window.addEventListener('storage', (event) => { if (event.key === OPS_TOKEN_KEY || event.key === null) showOpsHome(true); });
  showOpsHome();
}
