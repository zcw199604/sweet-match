#!/usr/bin/env node
/**
 * 从原站打包页还原「猫撫でシミュレーター」，并适配成街机厅的一个源码模块。
 *
 * 原页面是三层自解压壳：
 *   1. 整页 UTF-16LE，body 里只有一个 <script type="application/octet-stream" id="pack">，
 *      内容是「每字符 14 bit → 两个 7 bit 字节」的准 base64。
 *   2. 解出 3KB 引导脚本，自带 LZMA range coder + 字典解压，
 *      摊成 { CSS+HTML 串 / JS 串 / 资源目录 JSON / 资源二进制 }。
 *   3. 资源里是 27 张 AVIF 精灵（房间背景、13 只猫本体、13 条尾巴、两只手），
 *      每张只存裁剪块，靠目录里的 x,y,w,h,W,H 贴回 1517×935 的画布坐标。
 *
 * 产出（都是生成物，不要手改，改这个脚本再跑）：
 *   petcat/assets/*.avif        27 张精灵
 *   petcat/atlas.js             精灵目录
 *   petcat/room.js              原页面 body 结构（SVG 图标 + 毛色条 + 面板）
 *   petcat/style.css            原页面样式，:root 换成 :host 以便放进 Shadow DOM
 *   petcat/petcat-engine.js     原页面逻辑，套上 bootPetcat(ctx) 外壳，
 *                               document/window 换成注入的 doc/page 门面，数学部分改用 petcat-core.js
 *
 * 用法：node scripts/sync-petcat.mjs [packedHtml] [outDir]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const source = process.argv[2] ?? join(root, 'third_party/petcat/pet-the-cat.pages.dev.html');
const outDir = process.argv[3] ?? join(root, 'petcat');

/* ---------- 1. 读 UTF-16LE 页面，取打包内容 ---------- */

function readPacked(file) {
  const buf = readFileSync(file);
  const units = new Uint16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
  let text = '';
  for (let i = 0; i < units.length; i += 8192) text += String.fromCharCode.apply(null, units.subarray(i, i + 8192));
  const open = text.indexOf('id="pack">');
  if (open < 0) throw new Error('找不到 <script id="pack">');
  const start = open + 'id="pack">'.length;
  const end = text.indexOf('</script>', start);
  return { text, packed: text.slice(start, end), headStart: text.indexOf('<head>') + 6, styleStart: text.indexOf('<style>') };
}

/* ---------- 2. 第一层：每字符 14bit → 两个字节，得到引导脚本 ---------- */

function decodeBootstrap(packed) {
  const count = packed.charCodeAt(0) - 12288;
  let out = '';
  for (let i = 1; i <= count; i++) {
    const k = packed.charCodeAt(i) - 12288;
    out += String.fromCharCode(k >> 7, k & 127);
  }
  return out;
}

/* ---------- 3. 用假 DOM 跑引导脚本，拿二层产物 ---------- */

function unpack(packed, bootstrap) {
  const opened = bootstrap.indexOf('try{');
  const body = opened === 0 ? bootstrap.slice(4) : bootstrap;
  const cut = body.indexOf('}catch{let b=document.createElement');
  const code = cut > 0 ? body.slice(0, cut) : body;

  let captured = null;
  let markup = '';
  const doc = {
    getElementById: () => ({ textContent: packed, remove() {} }),
    createElement: () => {
      const el = { textContent: '', append() {}, remove() {}, insertAdjacentHTML() {} };
      captured = el;
      return el;
    },
    head: { insertAdjacentHTML: (_where, html) => { markup += html; } },
    body: { insertAdjacentHTML: (_where, html) => { markup += html; }, append() {} }
  };
  new Function('document', 'TextDecoder', 'Uint8Array', 'Uint16Array', 'Math', 'JSON', 'Error', 'console', code)(
    doc, TextDecoder, Uint8Array, Uint16Array, Math, JSON, Error, console
  );
  if (!captured?.textContent) throw new Error('引导脚本没有产出 JS');
  if (!markup.includes('</style>')) throw new Error('引导脚本没有产出样式/结构');
  return { markup, js: captured.textContent, photos: Buffer.from(captured.photos), directory: captured.directory };
}

/* ---------- 4. 逐条改写原页面逻辑 ---------- */

// 每条替换都必须命中，否则说明原站结构变了，直接报错而不是写出一份坏模块。
function swap(code, from, to, label) {
  if (!code.includes(from)) throw new Error(`没找到要替换的片段：${label}`);
  return code.split(from).join(to);
}

function buildEngine(js) {
  // 原文件形如 (()=>{'use strict'; ...body... })()
  const open = js.indexOf("(()=>{'use strict';");
  if (open < 0) throw new Error('不是预期的 IIFE 形状');
  let body = js.slice(open + "(()=>{'use strict';".length, js.lastIndexOf('})()'));

  // 资源：从 currentScript.photos 切 Blob → 直接指到 petcat/assets/
  body = swap(body, 'const {photos, directory}=document.currentScript;', '', '资源取自 currentScript');
  body = swap(
    body,
    "const [offset,count,x,y,w,h,W,H]=directory[name];\nconst url=URL.createObjectURL(new Blob([photos.subarray(offset,offset+count)],{type:'image/avif'}));",
    "const [offset,count,x,y,w,h,W,H]=directory[name];\nconst url=new URL('assets/'+name+'.avif',import.meta.url).href;",
    '资源改为文件 URL'
  );

  // 页面级的 meta / history 副作用在街机厅里不该发生
  body = swap(body, "document.querySelector('meta[name=\"theme-color\"]').content=moonlit?'#101722':'#fbf5ec';", "page.setThemeColor(moonlit?'#101722':'#fbf5ec');", 'theme-color meta');
  body = swap(body, "const url=new URL(location.href);\nif(url.searchParams.has('theme')){\nurl.searchParams.set('theme',theme);\ntry{history.replaceState(null,'',url);}catch{}\n}\n", '', '改地址栏的 theme 参数');

  // 把 document / window 换成门面：查询落在 Shadow DOM 里，监听登记下来好在 destroy 时摘掉
  body = swap(body, 'window.addEventListener', 'page.addEventListener', 'window 监听');
  body = body.split('document.').join('doc.');
  body = swap(body, "doc.documentElement.classList.toggle('is-full-page',on);", 'page.setFullPage(on);', '整页滚动锁');

  // 纯数学抽到 petcat-core.js
  body = swap(
    body,
    'const napFactor=new Float64Array(512);\nfor(let i=0;i<256;i++){\nconst fibre=i/127.5-1;\nnapFactor[i]=-6.885+3.06+8.16*fibre;\nnapFactor[256+i]=-6.885-3.06-8.16*fibre-3.825*Math.max(fibre,0);\n}\n',
    'const napFactor=buildNapFactor();\n',
    '毛发法线表'
  );
  body = swap(
    body,
    "const framedHeight=r.height/(1-topCrop);\nconst zoom=Math.max(r.width/1517,framedHeight/935);\nconst roomW=1517*zoom,roomH=935*zoom,roomX=(r.width-roomW)/2;\nconst roomY=(framedHeight-roomH)/2-(framedHeight-r.height);\nconst baseW=roomW*.831,baseH=roomH*.831;\nconst w=baseW*catScale,h=baseH*catScale;\nconst x=roomX+roomW*.006+(baseW-w)*.46;\nconst y=roomY+(roomH-baseH)*.49+(baseH-h)*.51;\nconst kittenAmount=clamp((.86-catScale)/(.86-.65));\nconst upperNeckExtra=kittenAmount*clamp(baseW*.062,24,44)/w;\nview={width:r.width,height:r.height,dpr,x,y,w,h,roomX,roomY,roomW,roomH,baseW,kitten:catScale<=.79,\nupperNeckExtra,handWidth:baseW*.895,touchLift:Math.min(62,framedHeight*.215)+40};",
    'view=computeView({width:r.width,height:r.height,dpr,catScale,topCrop});',
    '画布布局换算'
  );
  body = swap(
    body,
    "const r=stage.getBoundingClientRect();\nconst rotated=turned();\nconst x=rotated?e.clientY-r.top:e.clientX-r.left;\nconst y=rotated?r.right-e.clientX:e.clientY-r.top;\nconst lift=e.pointerType==='touch'?view.touchLift:0;\nreturn {u:(x-view.x)/view.w,v:(y-view.y-lift)/view.h};",
    'return pointerToStage({rect:stage.getBoundingClientRect(),rotated:turned(),clientX:e.clientX,clientY:e.clientY,lift:e.pointerType===\'touch\'?view.touchLift:0,view});',
    '指针映射'
  );

  // 离开舞台要能停下来：rAF 循环加闸门，ResizeObserver 拿在手里
  body = swap(body, 'function frame(ms){\nrequestAnimationFrame(frame);', 'function frame(ms){\nif(!alive)return;\nrequestAnimationFrame(frame);', '动画循环闸门');
  body = swap(body, 'new ResizeObserver(layout).observe(stage);', 'const observer=new ResizeObserver(layout);observer.observe(stage);', 'ResizeObserver 句柄');
  body = swap(body, "portrait.addEventListener('change',syncFull);\ntouchDisplay.addEventListener('change',syncFull);", "page.watchQuery(portrait,'change',syncFull);\npage.watchQuery(touchDisplay,'change',syncFull);", '媒体查询监听');

  return `// 生成物：node scripts/sync-petcat.mjs 从原站打包页还原并适配。不要手改，改脚本再跑。
import { buildNapFactor, computeView, pointerToStage } from './petcat-core.js';

/**
 * 把整只猫装进一个 Shadow DOM 里跑。
 * env.doc / env.page 是门面：所有 DOM 查询落在 Shadow DOM，事件监听记在 page 上，卸载时统一摘掉。
 * 参数叫 env 而不是 ctx，因为原页面正文里已经有一个 ctx（canvas 2d context）。
 */
export function bootPetcat(env) {
'use strict';
const { directory, doc, page } = env;
let alive = true;
${body.trim()}

function restart() {
  if (ready) choose(selected); else init();
}
function destroy() {
  if (!alive) return;
  alive = false;
  try { observer.disconnect(); } catch { /* 还没开始观察 */ }
  page.setFullPage(false);
  page.release();
  try { if (doc.fullscreenElement) doc.exitFullscreen(); } catch { /* 不在全屏 */ }
  try { purr.dispose?.(); } catch { /* 声音已经关了 */ }
}
return { restart, destroy, get ready() { return ready; }, get coat() { return selected; } };
}
`;
}

/* ---------- 5. 样式：:root → :host，并补上嵌进舞台后的尺寸覆盖 ---------- */

function buildStyle(markup) {
  const end = markup.indexOf('</style>');
  let css = markup.slice(markup.indexOf('>') + 1, end);
  css = swap(css, ':root[data-theme=dark] #theme .moon,:root:not([data-theme=dark]) #theme .sun', ':host([data-theme=dark]) #theme .moon,:host(:not([data-theme=dark])) #theme .sun', '主题图标显隐');
  css = swap(css, ':root[data-theme=dark]', ':host([data-theme=dark])', '深色主题变量');
  css = swap(css, ':root{', ':host{', '根变量');
  css = swap(css, 'body{margin:0;-webkit-tap-highlight-color:transparent}', '', 'body 基础样式');
  css = swap(css, '.is-full-page{overflow:hidden}', '', '整页滚动锁');
  return `${css.trim()}

/* ---- 嵌进街机厅舞台后的尺寸：不再按整页视口算 ----
   --petcat-h 是「留给画面的高度」，街机厅按自己的顶栏高度改写它（全屏时会改大）。 */
:host{display:block;--petcat-h:calc(100svh - 400px);background:var(--cloth)}
main{padding:0}
#viewer{max-width:min(100%,calc(max(300px,var(--petcat-h)) * 1.62246));margin:0 auto}
/* 画面按高度收窄时两侧留出来的空白，用垫子的布料色接上，别露出纸白 */
main{min-height:100%;background:var(--cloth)}
#stage{max-height:none;border-radius:14px}
`;
}

/* ---------- 6. 落盘 ---------- */

const { text, packed, headStart, styleStart } = readPacked(source);
const { markup, js, photos, directory } = unpack(packed, decodeBootstrap(packed));

mkdirSync(join(outDir, 'assets'), { recursive: true });
const names = Object.keys(directory);
let bytes = 0;
for (const name of names) {
  const [offset, count] = directory[name];
  writeFileSync(join(outDir, 'assets', `${name}.avif`), photos.subarray(offset, offset + count));
  bytes += count;
}

writeFileSync(join(outDir, 'atlas.js'), `// 生成物：精灵八元组 [字节偏移, 字节数, x, y, w, h, W, H]。\nexport const ATLAS = ${JSON.stringify(directory)};\n`);

const roomHTML = markup.slice(markup.indexOf('</style>') + '</style>'.length).trim();
writeFileSync(join(outDir, 'room.js'), `// 生成物：原页面 body 结构（SVG 图标 + 舞台 + 毛色条 + 面板）。\nexport const ROOM_HTML = ${JSON.stringify(roomHTML)};\n`);

writeFileSync(join(outDir, 'style.css'), buildStyle(markup));
writeFileSync(join(outDir, 'petcat-engine.js'), buildEngine(js));

console.log(`精灵 ${names.length} 个 / ${(bytes / 1024).toFixed(0)} KB`);
console.log(`逻辑 ${js.length} 字节 → ${(readFileSync(join(outDir, 'petcat-engine.js')).length / 1024).toFixed(0)} KB`);
console.log(`结构 ${roomHTML.length} 字节，样式 ${markup.length} 字节`);
console.log(`输出目录 ${outDir}`);
