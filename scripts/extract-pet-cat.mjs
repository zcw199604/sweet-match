#!/usr/bin/env node
/**
 * 从 pet-the-cat.pages.dev 的打包页面还原出可本地运行的小游戏。
 *
 * 原页面结构（三层）：
 *   1. 574KB 的 UTF-16LE HTML，内联 <script type="application/octet-stream" id="pack">
 *      里是“每字符 14 bit → 2 个 7 bit 字节”的准 base64 编码。
 *   2. 第一层解出的 3KB 引导脚本自带一个 LZMA 解码器 + 字典解压器，
 *      把 564929 字节压成 { CSS+HTML 串, JS 串, 资源目录 JSON, 资源二进制 }。
 *   3. 资源二进制里是 27 个 AVIF 精灵（背景图、13 只猫本体、13 条尾巴、两只手）。
 *
 * 本脚本在 Node 里用一个假 DOM 跑上述引导脚本，把各层产物直接落盘：
 *   pet-the-cat/index.html   静态骨架（原页面 body 结构 + 外链 css/js）
 *   pet-the-cat/style.css    原页面内联样式
 *   pet-the-cat/game.js      游戏逻辑（仅把资源读取从 Blob 换成 assets/*.avif）
 *   pet-the-cat/sprites.js   精灵清单（offset,count,x,y,w,h,W,H 八元组）
 *   pet-the-cat/assets/*.avif  27 个精灵图
 *
 * 用法：node scripts/extract-pet-cat.mjs [packedHtml] [outDir]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const source = process.argv[2] ?? join(root, 'pet-the-cat/source/pet-the-cat.pages.dev.html');
const outDir = process.argv[3] ?? join(root, 'pet-the-cat');

/* ---------- 1. UTF-16LE 读入，取 <script id="pack"> 的内容 ---------- */

function readPacked(file) {
  const buf = readFileSync(file);
  const units = new Uint16Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 2));
  let text = '';
  for (let i = 0; i < units.length; i += 8192) {
    text += String.fromCharCode.apply(null, units.subarray(i, i + 8192));
  }
  const open = text.indexOf('id="pack">');
  if (open < 0) throw new Error('找不到 <script id="pack">');
  const start = open + 'id="pack">'.length;
  const end = text.indexOf('</script>', start);
  return { text, packed: text.slice(start, end), headStart: text.indexOf('<head>') + 6, styleStart: text.indexOf('<style>') };
}

/* ---------- 2. 解出第一层引导脚本（每字符 14bit → 2 字节） ---------- */

function decodeBootstrap(packed) {
  const count = packed.charCodeAt(0) - 12288;
  let out = '';
  for (let i = 1; i <= count; i++) {
    const k = packed.charCodeAt(i) - 12288;
    out += String.fromCharCode(k >> 7, k & 127);
  }
  return out;
}

/* ---------- 3. 用假 DOM 跑引导脚本，拿三层产物 ---------- */

function unpack(packed, bootstrap) {
  // 去掉外层 try/catch，否则出错会被吞成“読み込み直す”按钮。
  const open = bootstrap.indexOf('try{');
  const body = open === 0 ? bootstrap.slice(4) : bootstrap;
  const cut = body.indexOf('}catch{let b=document.createElement');
  const code = cut > 0 ? body.slice(0, cut) : body;

  let captured = null;
  let insertedHTML = '';
  const doc = {
    getElementById: () => ({ textContent: packed, remove() {} }),
    createElement: () => {
      const el = { textContent: '', append() {}, remove() {}, insertAdjacentHTML() {} };
      captured = el;
      return el;
    },
    head: { insertAdjacentHTML: (_where, html) => { insertedHTML += html; } },
    body: { insertAdjacentHTML: (_where, html) => { insertedHTML += html; }, append() {} },
  };

  new Function('document', 'TextDecoder', 'Uint8Array', 'Uint16Array', 'Math', 'JSON', 'Error', 'console', code)(
    doc, TextDecoder, Uint8Array, Uint16Array, Math, JSON, Error, console,
  );

  if (!captured?.textContent) throw new Error('引导脚本没有产出 JS');
  if (!insertedHTML.includes('</style>')) throw new Error('引导脚本没有产出样式/结构');
  return { markup: insertedHTML, js: captured.textContent, photos: Buffer.from(captured.photos), directory: captured.directory };
}

/* ---------- 4. 落盘 ---------- */

const { text, packed, headStart, styleStart } = readPacked(source);
const bootstrap = decodeBootstrap(packed);
const { markup, js, photos, directory } = unpack(packed, bootstrap);

const names = Object.keys(directory);
mkdirSync(join(outDir, 'assets'), { recursive: true });

let assets = 0;
for (const name of names) {
  const [offset, count] = directory[name];
  writeFileSync(join(outDir, 'assets', `${name}.avif`), photos.subarray(offset, offset + count));
  assets += count;
}

const styleEnd = markup.indexOf('</style>');
writeFileSync(join(outDir, 'style.css'), markup.slice(markup.indexOf('>', 0) + 1, styleEnd).trim() + '\n');
const bodyHTML = markup.slice(styleEnd + 8).trim();

// 资源读取：原版从 document.currentScript.photos 里切 Blob，这里改成直接指向 assets/*.avif
let game = js;
game = game.replace('const {photos, directory}=document.currentScript;', 'const directory=window.PETCAT_DIRECTORY;');
game = game.replace(
  'const [offset,count,x,y,w,h,W,H]=directory[name];\nconst url=URL.createObjectURL(new Blob([photos.subarray(offset,offset+count)],{type:\'image/avif\'}));',
  "const [offset,count,x,y,w,h,W,H]=directory[name];\nconst url='assets/'+name+'.avif';",
);
if (game.includes('photos.subarray')) throw new Error('资源读取处替换失败，原页面结构可能已变');
writeFileSync(join(outDir, 'game.js'), game);
writeFileSync(join(outDir, 'sprites.js'), 'window.PETCAT_DIRECTORY=' + JSON.stringify(directory) + ';\n');

let head = text.slice(headStart, styleStart).trim();
head = head.replace('<meta charset="utf-16le">', '<meta charset="utf-8">');
writeFileSync(
  join(outDir, 'index.html'),
  `<!doctype html>\n<html lang="ja">\n<head>\n${head}\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n${bodyHTML}\n<script src="sprites.js"></script>\n<script src="game.js"></script>\n</body>\n</html>\n`,
);

console.log(`精灵 ${names.length} 个 / ${(assets / 1024).toFixed(0)} KB`);
console.log(`样式 ${markup.length} 字节，逻辑 ${js.length} 字节，结构 ${bodyHTML.length} 字节`);
console.log(`输出目录 ${outDir}`);
