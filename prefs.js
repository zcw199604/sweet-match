// 游戏设置的浏览器端：按登录身份（pid）同步到服务端，换浏览器输入同一个密码设置也跟着回来；
// 没网时先记在本机，下次同步时补报。未登录时只存在本机。数据结构和同步规则见 prefs-core.js。
import { cleanPrefs, hasPref, parsePrefs, prefsFor, prefValue, setPrefValue, settlePrefs } from './prefs-core.js';
import { playerId } from './leaderboard.js';

const KEY = 'pao-prefs';
const ENDPOINT = '/api/prefs';
let syncing = null;
// 旧版本直接存在本机 localStorage 的设置（每台设备各一份），迁移完就删掉。
const LEGACY = { sudokuLevel: 'pao-sudoku-level', gooseMode: 'pao-goose-mode' };

function load() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch { /* private mode */ }
  return prefsFor(parsePrefs(raw), playerId());
}
function save(state) { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode：本次访问内不保留 */ } }

function legacyValue(key) {
  if (!LEGACY[key]) return undefined;
  try { return cleanPrefs({ [key]: localStorage.getItem(LEGACY[key]) })[key]; } catch { return undefined; }
}
// 这个身份还没有这项设置时，先沿用本机旧版本留下的值。
export function getPref(key) {
  const state = load();
  return hasPref(state, key) ? prefValue(state, key) : legacyValue(key) ?? prefValue(state, key);
}
export function setPref(key, value) {
  save(setPrefValue(load(), key, value));
  syncPrefs();
}

// 有本机改动就报上去（服务端返回合并后的全部设置），没有就只拉取。返回这次是否同步成功。
export function syncPrefs() {
  const pid = playerId();
  if (!pid) return Promise.resolve(false);
  if (syncing) return syncing;
  const sent = { ...load().pending }, push = Object.keys(sent).length > 0;
  syncing = (async () => {
    let ok = false;
    try {
      const response = await (push
        ? fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid, prefs: sent }), cache: 'no-store' })
        : fetch(`${ENDPOINT}?pid=${encodeURIComponent(pid)}`, { cache: 'no-store' }));
      if (!response.ok) throw new Error(String(response.status));
      const { prefs } = await response.json();
      const current = load();
      if (current.owner === pid) save(settlePrefs(current, sent, prefs)); // 期间换了身份就丢弃这次结果
      ok = true;
    } catch {
      // 连不上就留在本机，下次再报。
    } finally {
      syncing = null;
      // 请求期间又改了设置：成功之后接着报。失败时不重试，免得连不上时空转。
      if (ok && Object.keys(load().pending).length) syncPrefs();
    }
    return ok;
  })();
  return syncing;
}

// 拉到这个身份的设置之后：服务端还没有的项用本机旧值补上并报上去，然后删掉旧值。
// 没登录或连不上时什么都不动，下次再迁。
async function syncAndMigrate() {
  if (!(await syncPrefs())) return;
  for (const [key, storageKey] of Object.entries(LEGACY)) {
    const old = legacyValue(key);
    if (old !== undefined && !hasPref(load(), key)) setPref(key, old);
    try { localStorage.removeItem(storageKey); } catch { /* private mode */ }
  }
}

export function initPrefs() {
  document.addEventListener('pao-login', syncAndMigrate); // 登录（含换身份）后拉取这个身份的设置
  syncAndMigrate();
}
