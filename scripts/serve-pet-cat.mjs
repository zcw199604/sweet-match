#!/usr/bin/env node
/**
 * 给 pet-the-cat 用的零依赖静态服务器。
 *
 * 为什么必须起服务：本地游戏要读 canvas 像素做毛发/手部形变，
 * file:// 下 AVIF 图片属于不透明来源，getImageData 会抛 SecurityError；
 * 另外 .avif 需要正确的 Content-Type 浏览器才会解码。
 *
 * 用法：node scripts/serve-pet-cat.mjs [port]
 *       npm run pet
 */
import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../pet-the-cat');
const port = Number(process.argv[2] || process.env.PORT || 8801);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

createServer((request, response) => {
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  // 目录穿越防守：normalize 之后必须仍在 root 内
  const target = normalize(join(root, path.endsWith('/') ? path + 'index.html' : path));
  if (!target.startsWith(root)) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let file = target;
  try {
    if (statSync(file).isDirectory()) file = join(file, 'index.html');
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': types[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'cache-control': 'no-cache',
  });
  createReadStream(file).pipe(response);
}).listen(port, '0.0.0.0', () => {
  console.log(`猫撫でシミュレーター: http://localhost:${port}/`);
  for (const item of Object.values(networkInterfaces()).flat()) {
    if (item && item.family === 'IPv4' && !item.internal) console.log(`局域网: http://${item.address}:${port}/`);
  }
});
