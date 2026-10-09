// 首页「最近常玩」的浏览器端：默认显示最近打开的三个游戏，点「更多」展开全部；每张卡片右上角是累计游玩时长。
// 数据按登录身份（pid）同步到服务端，换浏览器输入同一个密码就能看到；没网时用本机缓存，恢复后补报。
// 数据结构和同步规则见 recent-core.js。
import { addPlayed, forOwner, formatAgo, formatPlayed, markOpened, parseState, pendingItems, recentList, RECENT_VISIBLE, restorePending, takePending, viewOf, withServer } from './recent-core.js';
import { playerId } from './leaderboard.js';

const KEY = 'pao-recent';
const ENDPOINT = '/api/recent';
const FLUSH_MS = 60_000;
let expanded = false;
let syncing = null;

// 每次都从 localStorage 读：同一个浏览器的多个标签页共用一份，不会各记各的。
function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { /* private mode */ }
  return forOwner(parseState(raw), playerId());
}
function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode：本次访问内不保留 */ } }

export function noteOpened(game) {
  save(markOpened(load(), game, Date.now()));
  syncRecent(); // 马上报上去，别的设备刷新就能看到
}
// 由游玩计时器每秒调用一次（只在真实操作时才会走到这里），game 是游戏 id 而不是榜单 id。
export function notePlayed(game, ms) {
  const state = load(), next = addPlayed(state, game, ms);
  if (next !== state) save(next);
}

const post = (body, keepalive = false) => fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive, cache: 'no-store' });

// 把本机还没上报的增量报上去，再用服务端的汇总结果刷新缓存；没有增量时只拉取（pull = false 则什么都不做）。
export function syncRecent({ pull = true } = {}) {
  const pid = playerId();
  if (!pid) return Promise.resolve();
  if (syncing) return syncing;
  const state = load(), items = pendingItems(state);
  if (!items.length && !pull) return Promise.resolve();
  // 先把增量拿走再发，避免另一个标签页同时上报同一份造成重复累计。
  if (items.length) save(takePending(state));
  syncing = (async () => {
    let ok = false;
    try {
      const response = await (items.length ? post({ pid, items }) : fetch(`${ENDPOINT}?pid=${encodeURIComponent(pid)}`, { cache: 'no-store' }));
      if (!response.ok) throw new Error(String(response.status));
      const { games } = await response.json();
      const current = load();
      if (current.owner === pid) save(withServer(current, games)); // 期间换了身份就丢弃这次结果
      ok = true;
    } catch {
      // 连不上就留在本机，下次再报。
      if (items.length && load().owner === pid) save(restorePending(load(), items));
    } finally {
      syncing = null;
      renderRecent();
      // 这次请求期间又有新的打开记录 / 时长：成功之后接着报。失败时不重试，免得连不上时空转。
      if (ok && pendingItems(load()).length) syncRecent();
    }
  })();
  return syncing;
}

// 页面要关闭 / 切到后台时：普通 fetch 可能被取消，用 beacon 发；发不出去就放回去。
function flushOnLeave() {
  const pid = playerId(), state = load(), items = pendingItems(state);
  if (!pid || !items.length) return;
  save(takePending(state));
  let sent = false;
  try { sent = navigator.sendBeacon?.(ENDPOINT, JSON.stringify({ pid, items })) ?? false; } catch { /* 放回去 */ }
  if (!sent) save(restorePending(load(), items));
}

const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

export function renderRecent() {
  const section = document.querySelector('#recent');
  if (!section) return;
  const list = recentList(viewOf(load()));
  section.hidden = !list.length;
  if (!list.length) return;
  const shown = expanded ? list : list.slice(0, RECENT_VISIBLE);
  const now = Date.now();
  document.querySelector('#recent-list').replaceChildren(...shown.map((item) => {
    const card = node('button', 'recent-card');
    card.type = 'button';
    card.dataset.game = item.game;
    card.append(node('span', 'recent-time', formatPlayed(item.ms)), node('b', 'recent-title', item.title), node('small', 'recent-ago', `上次打开 ${formatAgo(item.last, now)}`));
    return card;
  }));
  const more = document.querySelector('#recent-more');
  more.hidden = list.length <= RECENT_VISIBLE;
  more.textContent = expanded ? '收起' : `更多（${list.length}）`;
  more.setAttribute('aria-expanded', String(expanded));
}

// 回到首页时：先用本机数据画出来，再同步一次（顺便把刚玩的时长报上去），同步完会再画一遍。
export function showRecent() { renderRecent(); syncRecent(); }

export function initRecent(onOpen) {
  document.querySelector('#recent-more').addEventListener('click', () => { expanded = !expanded; renderRecent(); });
  document.querySelector('#recent-list').addEventListener('click', (event) => {
    const card = event.target.closest('.recent-card');
    if (card) onOpen(card.dataset.game);
  });
  // 登录（含换身份）后立刻拉取这个身份的记录；退出登录后缓存不再属于当前身份，列表随之清空。
  document.addEventListener('pao-login', showRecent);
  document.addEventListener('pao-logout', renderRecent);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushOnLeave(); });
  window.addEventListener('pagehide', flushOnLeave);
  setInterval(() => syncRecent({ pull: false }), FLUSH_MS);
}
