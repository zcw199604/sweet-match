// 猫撫でシミュレーター（ARCADE 42）——街机厅里的源码版。
//
// 原站 pet-the-cat.pages.dev 是整页应用：自己的 <html>/<body>、自己的 :root 变量、自己的
// document 级监听。直接塞进街机厅的舞台会污染整页样式，也没法离开游戏时停下来。
//
// 这里用 Shadow DOM 把它整个关起来：样式不外泄、#stage/#viewer 这些 id 不会和街机厅撞，
// 再用 doc / page 两个门面把 DOM 查询限在影子树里、把监听登记下来，卸载时一次摘干净。
// 真正的画面逻辑在 petcat-engine.js（由 scripts/sync-petcat.mjs 从原站还原），
// 这里只负责挂载、门面、HUD 文案和退出。
import { ATLAS } from './atlas.js';
import { ROOM_HTML } from './room.js';
import { COAT_IDS, coatName, missingSprites } from './petcat-core.js';
import { bootPetcat } from './petcat-engine.js';

const STYLE_URL = new URL('./style.css', import.meta.url).href;
const THEME_KEY = 'pet-the-cat-theme';

const readTheme = () => {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

export function mountPetcat(wrap, { onHud = () => {} } = {}) {
  const missing = missingSprites(ATLAS);
  if (missing.length) throw new Error(`精灵不全：${missing.join(', ')}`);

  // 街机厅给的容器宽度是按棋盘游戏定的（全屏时被限到 720px），猫是横构图，打个记号好放开
  wrap.classList.add('petcat-wrap');
  const host = document.createElement('div');
  host.className = 'petcat-room';
  host.dataset.theme = readTheme();
  const shadow = host.attachShadow({ mode: 'open' });
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_URL;
  const slot = document.createElement('div');
  slot.className = 'petcat-slot';
  slot.innerHTML = ROOM_HTML;
  shadow.append(link, slot);
  wrap.replaceChildren(host);

  // ---- 门面：DOM 查询留在影子树里，监听登记下来好摘 ----
  const listeners = [];
  const queries = [];
  const listen = (target, type, fn, options) => {
    target.addEventListener(type, fn, options);
    listeners.push([target, type, fn, options]);
  };
  let locked = false;
  const setFullPage = (on) => {
    document.documentElement.classList.toggle('is-full-page', on);
    locked = on;
  };

  const doc = {
    get documentElement() { return host; },
    get hidden() { return document.hidden; },
    get fullscreenElement() { return document.fullscreenElement; },
    get fullscreenEnabled() { return document.fullscreenEnabled; },
    get body() { return document.body; },
    createElement: (tag) => document.createElement(tag),
    querySelector: (selector) => shadow.querySelector(selector),
    querySelectorAll: (selector) => shadow.querySelectorAll(selector),
    getElementById: (id) => shadow.getElementById(id),
    addEventListener: (type, fn, options) => listen(document, type, fn, options),
    removeEventListener: (type, fn, options) => document.removeEventListener(type, fn, options),
    exitFullscreen: () => document.exitFullscreen()
  };

  const page = {
    addEventListener: (type, fn, options) => listen(window, type, fn, options),
    watchQuery: (list, type, fn) => {
      list.addEventListener(type, fn);
      queries.push([list, type, fn]);
    },
    // 街机厅有自己的主题，不去改页面的 theme-color meta
    setThemeColor: () => {},
    setFullPage,
    release() {
      for (const [target, type, fn, options] of listeners) target.removeEventListener(type, fn, options);
      listeners.length = 0;
      for (const [list, type, fn] of queries) list.removeEventListener(type, fn);
      queries.length = 0;
      if (locked) setFullPage(false);
    }
  };

  const game = bootPetcat({ directory: ATLAS, doc, page });

  // ---- HUD：顶栏显示当前毛色，毛色条换了就跟着换 ----
  const stage = shadow.getElementById('stage');
  const say = () => onHud(`${coatName(game.coat)} · ${COAT_IDS.length} 种毛色`);
  const painted = new MutationObserver(say);
  if (stage) painted.observe(stage, { attributes: true, attributeFilter: ['data-selected', 'data-ready'] });
  say();

  let gone = false;
  return {
    restart: () => game.restart(),
    destroy() {
      if (gone) return;
      gone = true;
      painted.disconnect();
      try { game.destroy(); } catch { /* 已经卸过 */ }
      page.release();
      host.remove();
      wrap.classList.remove('petcat-wrap');
    }
  };
}
