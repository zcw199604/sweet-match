// 第三方网页游戏：原样用 iframe 嵌入作者自己的站点，本仓库不含它们的任何代码或素材。
// 存档在 iframe 里由浏览器按「本站 + 对方站点」分区保存，和直接打开原站玩的是两份；
// 需要登录的功能（Achroma 的 linux.do 登录）在 iframe 里用不了，所以舞台上一直留着「在原站打开」。
export const EMBED_GAMES = {
  soulforge: { title: 'SOULFORGE 灵魂锻炉', url: 'https://soulforge.glasden.top/' },
  achroma: { title: 'Achroma', url: 'https://game.unsnow.online/ach/' }
};
export const embedHost = (id) => new URL(EMBED_GAMES[id].url).host;

// 不给 allow-top-navigation：嵌进来的页面不能把整个街机厅跳走。allow-orientation-lock：SoulForge 只能横屏，它的「全屏并横屏」要锁方向。
const SANDBOX = 'allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-pointer-lock allow-downloads allow-orientation-lock';
const SLOW_MS = 15000;

// onActive：焦点在游戏里时每秒调一次。iframe 里的点击和按键不会传到本页，游玩计时只能靠这个判断「还在玩」。
export function mountEmbed(wrap, id, { onHud = () => {}, onActive = () => {} } = {}) {
  const game = EMBED_GAMES[id];
  const frame = document.createElement('iframe');
  frame.className = 'embed-frame';
  frame.title = game.title;
  frame.allow = 'fullscreen; autoplay; gamepad';
  frame.allowFullscreen = true;
  frame.setAttribute('sandbox', SANDBOX);
  const cover = document.createElement('div');
  cover.className = 'embed-cover';
  cover.setAttribute('role', 'status');
  wrap.replaceChildren(frame, cover);
  let slow = 0;
  function load() {
    cover.hidden = false;
    cover.textContent = `正在载入 ${game.title}……`;
    onHud(`正在载入 · ${embedHost(id)}`);
    clearTimeout(slow);
    slow = setTimeout(() => { cover.textContent = '载入得有点慢。对方站点可能暂时打不开，可以点「在原站打开」试试。'; }, SLOW_MS);
    frame.src = game.url;
  }
  frame.addEventListener('load', () => {
    if (!frame.src) return;
    clearTimeout(slow);
    cover.hidden = true;
    onHud(`来自 ${embedHost(id)}`);
    frame.focus();   // 两款都要键盘操作，载入后直接把焦点交给游戏
  });
  const timer = setInterval(() => { if (document.activeElement === frame && document.visibilityState !== 'hidden') onActive(); }, 1000);
  load();
  return {
    restart: load,
    destroy() {
      clearTimeout(slow);
      clearInterval(timer);
      frame.removeAttribute('src');   // 先卸掉页面，游戏的音乐才会停
      wrap.replaceChildren();
    }
  };
}
