// 抓大鹅's items, modelled from three.js primitives rather than loaded from files.
// Each item's parts are baked into one vertex-coloured geometry, so the whole pile
// costs one draw call per item — it matters on phones, where 99 items cast shadows too.
import * as THREE from './vendor/three/three.module.min.js';

// How big the largest side of an item is in the bowl, in world units (the bowl is 8 across).
export const ITEM_SIZE = 1.55;

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const E = (x, y, z) => new THREE.Euler(x, y, z);
// One primitive of an item: a geometry, a colour (or a function of the vertex
// position, for patterns) and where it sits.
const part = (geometry, color, at = V(0, 0, 0), rotation = E(0, 0, 0), scale = V(1, 1, 1)) => ({ geometry, color, at, rotation, scale });
const sphere = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const lathe = (points, segments = 28) => new THREE.LatheGeometry(new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(28), segments);

function goose() {
  const white = '#fbf8f0', wing = '#e4e0d6', orange = '#ff9a2e', eye = '#2b2333';
  return [
    part(sphere(0.5, 24, 16), white, V(0, 0, 0), E(0, 0, 0.08), V(1.15, 0.72, 0.8)),
    part(new THREE.ConeGeometry(0.2, 0.42, 14), white, V(-0.6, 0.14, 0), E(0, 0, Math.PI / 2 + 0.35)),
    part(sphere(0.4), wing, V(-0.08, 0.12, 0.34), E(0.25, 0, 0.12), V(0.95, 0.38, 0.3)),
    part(sphere(0.4), wing, V(-0.08, 0.12, -0.34), E(-0.25, 0, 0.12), V(0.95, 0.38, 0.3)),
    part(new THREE.CapsuleGeometry(0.13, 0.5, 6, 14), white, V(0.44, 0.42, 0), E(0, 0, -0.35)),
    part(sphere(0.2), white, V(0.56, 0.8, 0)),
    part(new THREE.ConeGeometry(0.085, 0.28, 12), orange, V(0.8, 0.77, 0), E(0, 0, -Math.PI / 2)),
    part(sphere(0.04, 8, 6), eye, V(0.66, 0.86, 0.13)),
    part(sphere(0.04, 8, 6), eye, V(0.66, 0.86, -0.13)),
    part(sphere(0.12, 10, 8), orange, V(0.12, -0.36, 0.16), E(0, 0, 0), V(1.3, 0.3, 0.8)),
    part(sphere(0.12, 10, 8), orange, V(0.12, -0.36, -0.16), E(0, 0, 0), V(1.3, 0.3, 0.8))
  ];
}

function egg() {
  const points = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12, a = Math.PI * t;
    // Wider at the bottom, pointed at the top.
    points.push([Math.max(0.001, Math.sin(a) * 0.36 * (1 + 0.14 * Math.cos(a))), -Math.cos(a) * 0.5]);
  }
  return [part(lathe(points), '#fff0d4')];
}

function apple() {
  const red = (p) => (p.y > 0.25 ? '#ff7a63' : '#ff4757');
  return [
    part(lathe([[0, -0.38], [0.22, -0.44], [0.42, -0.3], [0.5, -0.04], [0.47, 0.2], [0.36, 0.38], [0.18, 0.42], [0.06, 0.34], [0, 0.3]]), red),
    part(new THREE.CylinderGeometry(0.025, 0.035, 0.24, 8), '#7a4a2a', V(0.02, 0.44, 0), E(0, 0, -0.25)),
    part(sphere(0.15, 12, 8), '#4cc46b', V(0.15, 0.48, 0), E(0, 0.3, -0.5), V(1, 0.22, 0.5))
  ];
}

function carrot() {
  // Ridges across the root; a cone's own axis is y.
  const orange = (p) => (Math.abs(Math.sin(p.y * 26)) < 0.26 ? '#e8701a' : '#ff8a2a');
  const leaf = '#4cc46b';
  return [
    part(new THREE.ConeGeometry(0.25, 1.05, 18, 12), orange, V(-0.1, 0, 0), E(0, 0, Math.PI / 2)),
    part(sphere(0.25, 18, 10), '#ff8a2a', V(0.42, 0, 0), E(0, 0, 0), V(0.35, 1, 1)),
    part(new THREE.CapsuleGeometry(0.045, 0.38, 4, 8), leaf, V(0.66, 0.06, 0), E(0, 0, -Math.PI / 2 + 0.3)),
    part(new THREE.CapsuleGeometry(0.045, 0.34, 4, 8), leaf, V(0.62, 0.02, 0.12), E(0.5, 0, -Math.PI / 2 + 0.1)),
    part(new THREE.CapsuleGeometry(0.045, 0.34, 4, 8), leaf, V(0.62, 0.02, -0.12), E(-0.5, 0, -Math.PI / 2 + 0.1))
  ];
}

function corn() {
  // Alternating kernels around and along the cob (the capsule's own axis is y).
  const kernel = (p) => {
    const around = Math.floor((Math.atan2(p.z, p.x) + Math.PI) / (Math.PI * 2) * 14), along = Math.floor((p.y + 2) / 0.09);
    return (around + along) % 2 ? '#ffd447' : '#f4b323';
  };
  const husk = '#9edb6a';
  return [
    part(new THREE.CapsuleGeometry(0.2, 0.62, 8, 22, 12), kernel, V(0.08, 0, 0), E(0, 0, Math.PI / 2)),
    part(sphere(0.3, 12, 8), husk, V(-0.28, 0.1, 0.13), E(0.4, 0, 0.18), V(1.4, 0.18, 0.45)),
    part(sphere(0.3, 12, 8), husk, V(-0.28, 0.1, -0.13), E(-0.4, 0, 0.18), V(1.4, 0.18, 0.45)),
    part(sphere(0.3, 12, 8), '#82c653', V(-0.28, -0.14, 0), E(0, 0, -0.15), V(1.4, 0.18, 0.5)),
    part(new THREE.CylinderGeometry(0.06, 0.08, 0.2, 8), '#6aa743', V(-0.6, 0, 0), E(0, 0, Math.PI / 2))
  ];
}

function pumpkin() {
  const parts = [];
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    parts.push(part(sphere(0.32, 16, 12), k % 2 ? '#ff9124' : '#ff8017', V(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2), E(0, -a, 0), V(1, 0.78, 0.62)));
  }
  parts.push(part(new THREE.CylinderGeometry(0.04, 0.07, 0.24, 8), '#5e8a3a', V(0.03, 0.3, 0), E(0, 0, -0.3)));
  parts.push(part(sphere(0.14, 10, 8), '#6fb04a', V(-0.14, 0.26, 0.04), E(0, 0.4, 0.3), V(1, 0.2, 0.6)));
  return parts;
}

function mushroom() {
  const parts = [
    part(new THREE.SphereGeometry(0.5, 26, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#ff5363', V(0, 0.02, 0), E(0, 0, 0), V(1, 0.72, 1)),
    part(new THREE.CylinderGeometry(0.48, 0.42, 0.06, 26), '#f5e3c8', V(0, 0, 0)),
    part(new THREE.CylinderGeometry(0.15, 0.2, 0.48, 16), '#fbf1df', V(0, -0.25, 0))
  ];
  // White spots sitting on the dome.
  for (const [a, b] of [[0, 0.2], [1.2, 0.85], [2.6, 0.9], [3.9, 0.8], [5.1, 0.9], [0.4, 0.95]]) {
    const r = Math.sin(b) * 0.5, y = Math.cos(b) * 0.36 + 0.02;
    parts.push(part(sphere(0.07, 10, 6), '#fff8ec', V(Math.cos(a) * r, y, Math.sin(a) * r), E(Math.sin(a) * b, 0, -Math.cos(a) * b), V(1, 0.35, 1)));
  }
  return parts;
}

function bread() {
  // The loaf lies on its side, so the capsule's own +x ends up on top.
  const crust = (p) => (p.x > 0.05 ? '#d4853a' : '#f0c27a');
  // Scale applies before the turn, so flattening the capsule's own x lowers the loaf.
  const parts = [part(new THREE.CapsuleGeometry(0.32, 0.5, 8, 20), crust, V(0, 0, 0), E(0, 0, Math.PI / 2), V(0.82, 1, 1))];
  for (const x of [-0.26, 0, 0.26]) parts.push(part(new THREE.CapsuleGeometry(0.04, 0.32, 4, 8), '#f6d9a2', V(x, 0.255, 0), E(Math.PI / 2, 0, 0)));
  return parts;
}

function milkBottle() {
  const glass = (p) => (p.y < 0.12 ? '#ffffff' : '#dbeef8');
  return [
    part(lathe([[0, -0.5], [0.26, -0.5], [0.3, -0.42], [0.3, 0.06], [0.22, 0.22], [0.14, 0.32], [0.14, 0.42], [0, 0.42]]), glass),
    part(new THREE.CylinderGeometry(0.165, 0.165, 0.1, 18), '#3d8bfd', V(0, 0.46, 0)),
    part(new THREE.CylinderGeometry(0.306, 0.306, 0.24, 26, 1, true), '#8fd0ff', V(0, -0.18, 0)),
    part(sphere(0.07, 10, 6), '#3d8bfd', V(0.29, -0.18, 0), E(0, 0, Math.PI / 2), V(1, 0.3, 1))
  ];
}

function eggplant() {
  // Glossy purple, darker towards the stalk.
  const skin = (p) => (p.y > 0.15 ? '#5e2b88' : '#7c3aa8');
  return [
    part(lathe([[0, -0.55], [0.22, -0.52], [0.31, -0.32], [0.29, -0.06], [0.21, 0.18], [0.15, 0.36], [0.1, 0.44], [0, 0.46]]), skin),
    part(new THREE.ConeGeometry(0.17, 0.16, 6), '#5fa83a', V(0, 0.44, 0), E(Math.PI, 0, 0)),
    part(new THREE.CylinderGeometry(0.035, 0.05, 0.2, 8), '#4d8a2f', V(0.02, 0.58, 0), E(0, 0, -0.25))
  ];
}

function broccoli() {
  const parts = [part(new THREE.CylinderGeometry(0.11, 0.15, 0.5, 12), '#a6d672', V(0, -0.28, 0))];
  // Florets: a dome of small balls in two shades.
  for (const [x, y, z, r] of [[0, 0.2, 0, 0.24], [0.22, 0.08, 0.05, 0.19], [-0.2, 0.08, 0.1, 0.19], [0.05, 0.08, -0.22, 0.19], [-0.08, 0.06, 0.24, 0.17], [0.16, 0.12, -0.15, 0.17], [-0.18, 0.12, -0.14, 0.17]]) {
    parts.push(part(sphere(r, 14, 10), r > 0.2 ? '#3f9a3a' : '#4cae44', V(x, y, z)));
  }
  return parts;
}

function cheese() {
  // A wedge cut from a wheel, with a few holes on its faces.
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.28); shape.lineTo(0.5, -0.28); shape.lineTo(-0.5, 0.3); shape.closePath();
  const wedge = new THREE.ExtrudeGeometry(shape, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  wedge.translate(0, 0, -0.18);
  const parts = [part(wedge, '#ffd65a')];
  for (const [x, y, z, r] of [[-0.25, -0.1, 0.22, 0.09], [0.12, -0.16, 0.22, 0.07], [-0.36, 0.12, 0.22, 0.06], [-0.2, 0.0, -0.22, 0.08], [0.2, -0.2, -0.22, 0.06]]) {
    parts.push(part(sphere(r, 10, 8), '#e9a92c', V(x, y, z), E(0, 0, 0), V(1, 1, 0.35)));
  }
  return parts;
}

// Every item type, in deal order; `scale` evens out how big each looks next to the others.
export const GOOSE_ITEMS = [
  { id: 'goose', name: '大鹅', build: goose, scale: 1.05 },
  { id: 'egg', name: '鸡蛋', build: egg, scale: 0.75 },
  { id: 'apple', name: '苹果', build: apple, scale: 0.82 },
  { id: 'carrot', name: '胡萝卜', build: carrot, scale: 1 },
  { id: 'corn', name: '玉米', build: corn, scale: 1 },
  { id: 'pumpkin', name: '南瓜', build: pumpkin, scale: 0.9 },
  { id: 'mushroom', name: '蘑菇', build: mushroom, scale: 0.85 },
  { id: 'bread', name: '面包', build: bread, scale: 0.95 },
  { id: 'milk', name: '牛奶瓶', build: milkBottle, scale: 0.9 },
  { id: 'eggplant', name: '茄子', build: eggplant, scale: 0.95 },
  { id: 'broccoli', name: '西兰花', build: broccoli, scale: 0.85 },
  { id: 'cheese', name: '奶酪', build: cheese, scale: 0.85 }
];

// Bakes parts into one geometry: positions, normals and per-vertex colours, with
// the result centred on its bounding box and scaled to `size` along its longest side.
function bake(parts, size) {
  const positions = [], normals = [], colors = [], indices = [];
  const color = new THREE.Color(), matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), local = new THREE.Vector3();
  for (const { geometry, color: paint, at, rotation, scale } of parts) {
    const offset = positions.length / 3;
    const g = geometry.clone().applyMatrix4(matrix.compose(at, q.setFromEuler(rotation), scale));
    const pos = g.attributes.position, nor = g.attributes.normal, src = geometry.attributes.position;
    for (let i = 0; i < pos.count; i += 1) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
      normals.push(nor.getX(i), nor.getY(i), nor.getZ(i));
      // Patterns read the part's own coordinates, so they follow the part when it is placed.
      color.set(typeof paint === 'function' ? paint(local.fromBufferAttribute(src, i)) : paint);
      colors.push(color.r, color.g, color.b);
    }
    if (g.index) for (let i = 0; i < g.index.count; i += 1) indices.push(g.index.getX(i) + offset);
    else for (let i = 0; i < pos.count; i += 1) indices.push(i + offset);
    g.dispose(); geometry.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setIndex(indices);
  merged.computeBoundingBox();
  const box = merged.boundingBox, centre = box.getCenter(new THREE.Vector3()), extent = box.getSize(new THREE.Vector3());
  merged.translate(-centre.x, -centre.y, -centre.z);
  merged.scale(...Array(3).fill(size / Math.max(extent.x, extent.y, extent.z)));
  merged.computeBoundingBox(); merged.computeBoundingSphere();
  return merged;
}

// A coarse point cloud for the physics hull: vertices snapped to a grid and
// de-duplicated, which keeps the outline and drops the thousands of inner points.
function hullPoints(geometry) {
  const pos = geometry.attributes.position, seen = new Set(), out = [];
  for (let i = 0; i < pos.count; i += 1) {
    const x = Math.round(pos.getX(i) / 0.09), y = Math.round(pos.getY(i) / 0.09), z = Math.round(pos.getZ(i) / 0.09), key = `${x},${y},${z}`;
    if (seen.has(key)) continue;
    seen.add(key); out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  return new Float32Array(out);
}

// Built once per type and shared by every copy of it in the bowl.
const cache = new Map();
export function itemTemplate(index) {
  if (!cache.has(index)) {
    const spec = GOOSE_ITEMS[index], geometry = bake(spec.build(), ITEM_SIZE * spec.scale);
    cache.set(index, { spec, geometry, hull: hullPoints(geometry) });
  }
  return cache.get(index);
}
export function disposeTemplates() {
  for (const entry of cache.values()) entry.geometry.dispose();
  cache.clear();
}
