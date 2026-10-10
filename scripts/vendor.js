// Copies the 3D engine files 抓大鹅 loads (and the 联机 SDK) in the browser out of node_modules into
// vendor/, so the static site (Pages, `npx serve .`, the LAN server) needs no build
// step and no CDN. Run `npm run vendor` after bumping three or rapier3d-compat.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = [
  ['node_modules/three/build/three.module.min.js', 'vendor/three/three.module.min.js'],
  ['node_modules/three/build/three.core.min.js', 'vendor/three/three.core.min.js'],
  ['node_modules/three/LICENSE', 'vendor/three/LICENSE'],
  ['node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs', 'vendor/rapier/rapier.mjs'],
  ['node_modules/@dimforge/rapier3d-compat/LICENSE', 'vendor/rapier/LICENSE'],
  // 联机客户端 SDK：依赖装在 server/ 里（先 npm --prefix server ci），UMD 单文件，<script> 直接加载。
  ['server/node_modules/@colyseus/sdk/dist/colyseus.js', 'vendor/colyseus/colyseus.js'],
  ['server/node_modules/@colyseus/sdk/LICENSE', 'vendor/colyseus/LICENSE']
];
for (const [from, to] of files) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  copyFileSync(join(root, from), join(root, to));
  console.log(`${from} → ${to}`);
}
