// Copies the 3D engine files 抓大鹅 loads in the browser out of node_modules into
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
  ['node_modules/@dimforge/rapier3d-compat/LICENSE', 'vendor/rapier/LICENSE']
];
for (const [from, to] of files) {
  mkdirSync(dirname(join(root, to)), { recursive: true });
  copyFileSync(join(root, from), join(root, to));
  console.log(`${from} → ${to}`);
}
