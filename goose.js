// 抓大鹅: the 3D view. A wooden funnel-bowl full of items under a top-down camera,
// real rigid-body physics (Rapier) for the pile, and a seven-slot tray below it.
// The rules live in goose-core.js; this module decides where things are and when
// an item has visibly arrived, and tells the rules about it.
import * as THREE from './vendor/three/three.module.min.js';
import * as RAPIER from './vendor/rapier/rapier.mjs';
import { clearGoose, createGoose, GOOSE, gooseCanPick, landGoose, pickGoose, tickGoose } from './goose-core.js';
import { disposeTemplates, GOOSE_ITEMS, itemTemplate } from './goose-art.js';

// The bowl is an upside-down cone: wide at the top (y = TOP), nearly a point at the bottom.
// Shallow enough that the pile spreads across most of the bowl, deep enough to bury things.
const CONE = { TOP: 6, BOTTOM: -2.5, TOP_R: 4, BOTTOM_R: 1.3, LID: 0.6, ITEM_R: 0.3 };
// SCALE shrinks an item to fit its slot, so it tracks ITEM_SIZE in goose-art.js.
const TRAY = { Y: 6.9, Z: 5.2, GAP: 1.24, SLOT: 1.08, SCALE: 0.7, LIFT: 0.42 };
// The part of the world the camera must always show: the bowl's rim and the whole tray.
const VIEW = { HALF_W: 4.46, TOP: -4.42, BOTTOM: 5.95 };
const CAMERA_Y = 20;
const GRAVITY = -15;
const STEP = 1 / 60;
const FLY_TIME = 0.34;
const POP_TIME = 0.5;
// The tray shows every item turned three-quarters towards the player.
const DISPLAY = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.05, -0.45, 0));
const SPARKS = ['#ffd543', '#ff5d80', '#58d4de', '#ffffff', '#8e7bff', '#44c986'];
const STORE = { wins: 'pao-goose-wins', best: 'pao-goose-best' };

const easeOutCubic = (t) => 1 - (1 - t) ** 3;
const radiusAt = (y) => THREE.MathUtils.lerp(CONE.BOTTOM_R, CONE.TOP_R, THREE.MathUtils.clamp((y - CONE.BOTTOM) / (CONE.TOP - CONE.BOTTOM), 0, 1));
const readCount = (key) => { try { return Math.max(0, Number(localStorage.getItem(key)) || 0); } catch { return 0; } };
const writeCount = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* private mode */ } };

let physicsReady = null;
// The wasm module is inlined in rapier.mjs and only needs compiling once per page.
export const loadPhysics = () => (physicsReady ||= RAPIER.init());

export async function mountGoose(wrap, { mode = 'classic', onHud = () => {} } = {}) {
  await loadPhysics();

  const canvas = document.createElement('canvas');
  canvas.className = 'goose-canvas';
  canvas.setAttribute('aria-label', '抓大鹅游戏画面');
  const hud = document.createElement('div');
  hud.className = 'goose-hud';
  hud.innerHTML = '<span class="goose-count"></span><span class="goose-clock"></span>';
  const card = document.createElement('div');
  card.className = 'goose-end';
  card.hidden = true;
  wrap.replaceChildren(canvas, hud, card);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;

  const scene = new THREE.Scene();
  // Items deeper in the bowl fade into its shadowy wood, so the top layer — the
  // one you can actually reach — always reads first. `near` follows the pile down.
  scene.fog = new THREE.Fog('#4b2c1b', 14, 24);
  const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 1, 40);
  camera.up.set(0, 0, -1);

  scene.add(new THREE.HemisphereLight('#fffaf0', '#8a6f5a', 1.9));
  const sun = new THREE.DirectionalLight('#ffffff', 2.1);
  sun.position.set(2.5, 30, 3.5);
  sun.target.position.set(0, 0, 0.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1536, 1536);
  // The sun is nearly overhead, so the shadow camera needs its own up or its frame spins.
  sun.shadow.camera.up.set(0, 0, -1);
  Object.assign(sun.shadow.camera, { left: -6.5, right: 6.5, top: 5.5, bottom: -7, near: 1, far: 60 });
  sun.shadow.bias = -0.0008;
  scene.add(sun, sun.target);

  const disposables = [];
  const keep = (thing) => { disposables.push(thing); return thing; };
  buildBowl();
  const slots = buildTray();

  const items = new Map();
  const pileMeshes = [];
  let state = null;
  let world = null;
  let spawnQueue = [];
  let pops = [];
  let sparks = [];
  let confetti = [];
  let pressed = null;
  let hovered = null;
  let trayShake = 0;
  let accumulator = 0;
  let last = 0;
  let frame = 0;
  let hudText = '';
  let endTimer = 0;
  let destroyed = false;
  // World z of the screen's top and bottom edges (the camera looks down, screen-up is -z).
  let screenTop = VIEW.TOP;
  let screenBottom = VIEW.BOTTOM;
  let wins = readCount(STORE.wins);
  let best = readCount(STORE.best);

  function buildBowl() {
    const height = CONE.TOP - CONE.BOTTOM;
    const wall = new THREE.CylinderGeometry(CONE.TOP_R, CONE.BOTTOM_R, height, 72, 12, true);
    // Turned-wood rings down the inside of the bowl.
    const pos = wall.attributes.position, colors = [], c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 1) { c.set(Math.floor((pos.getY(i) + 8) / 1) % 2 ? '#d99c62' : '#cf9257'); colors.push(c.r, c.g, c.b); }
    wall.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const bowl = new THREE.Mesh(keep(wall), keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide })));
    bowl.position.y = (CONE.TOP + CONE.BOTTOM) / 2;
    bowl.receiveShadow = true;
    const rim = new THREE.Mesh(keep(new THREE.TorusGeometry(CONE.TOP_R + 0.12, 0.24, 14, 96)), keep(new THREE.MeshStandardMaterial({ color: '#a8673a', roughness: 0.6 })));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = CONE.TOP;
    rim.castShadow = true;
    // The cone is open-ended; this is the flat floor at its narrow end.
    const floor = new THREE.Mesh(keep(new THREE.CircleGeometry(CONE.BOTTOM_R + 0.02, 48)), keep(new THREE.MeshStandardMaterial({ color: '#9a6136', roughness: 0.85 })));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = CONE.BOTTOM;
    floor.receiveShadow = true;
    scene.add(bowl, rim, floor);
  }

  function buildTray() {
    const width = TRAY.GAP * (GOOSE.TRAY - 1) + TRAY.SLOT + 0.34;
    const board = new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.42, width - 0.84, 6, 24)), keep(new THREE.MeshStandardMaterial({ color: '#b5713f', roughness: 0.65 })));
    board.rotation.z = Math.PI / 2;
    board.scale.set(1, 1, 1.72);
    board.position.set(0, TRAY.Y - 0.42, TRAY.Z);
    board.receiveShadow = true;
    scene.add(board);
    const slotGeometry = keep(new THREE.CylinderGeometry(TRAY.SLOT * 0.5, TRAY.SLOT * 0.5, 0.08, 32));
    return Array.from({ length: GOOSE.TRAY }, (_, index) => {
      const material = keep(new THREE.MeshStandardMaterial({ color: '#fbecd0', roughness: 0.8 }));
      const slot = new THREE.Mesh(slotGeometry, material);
      slot.position.copy(slotPosition(index)).setY(TRAY.Y - 0.02);
      slot.scale.z = 0.92;
      slot.receiveShadow = true;
      scene.add(slot);
      return slot;
    });
  }

  function slotPosition(index) {
    return new THREE.Vector3((index - (GOOSE.TRAY - 1) / 2) * TRAY.GAP, TRAY.Y + TRAY.LIFT, TRAY.Z);
  }

  function createWorld() {
    const next = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    next.timestep = STEP;
    // The cone's wall as a closed ring of triangles, a floor at its tip and a lid
    // over the top so a hard shake cannot fling anything out.
    const segments = 64, vertices = [], indices = [];
    for (let i = 0; i < segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      vertices.push(Math.cos(a) * CONE.TOP_R, CONE.TOP, Math.sin(a) * CONE.TOP_R, Math.cos(a) * CONE.BOTTOM_R, CONE.BOTTOM, Math.sin(a) * CONE.BOTTOM_R);
    }
    for (let i = 0; i < segments; i += 1) {
      const j = (i + 1) % segments;
      indices.push(i * 2, j * 2, i * 2 + 1, j * 2, j * 2 + 1, i * 2 + 1);
    }
    next.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices)).setFriction(0.9).setRestitution(0.05));
    next.createCollider(RAPIER.ColliderDesc.cylinder(0.2, CONE.BOTTOM_R + 0.4).setTranslation(0, CONE.BOTTOM - 0.2, 0).setFriction(1));
    next.createCollider(RAPIER.ColliderDesc.cylinder(0.2, CONE.TOP_R + 0.3).setTranslation(0, CONE.TOP + CONE.LID, 0));
    return next;
  }

  function spawn(entry, x, y, z) {
    const { geometry, hull } = itemTemplate(entry.type);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, emissive: '#ffc93a', emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.set(x, y, z);
    mesh.quaternion.setFromEuler(new THREE.Euler(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2));
    mesh.userData.id = entry.id;
    scene.add(mesh);
    const q = mesh.quaternion;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y, z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }).setLinearDamping(0.4).setAngularDamping(0.5));
    const shape = RAPIER.ColliderDesc.convexHull(hull) || RAPIER.ColliderDesc.ball(CONE.ITEM_R);
    world.createCollider(shape.setFriction(0.9).setRestitution(0.06), body);
    items.set(entry.id, { id: entry.id, type: entry.type, mesh, body, fly: null, pop: 0 });
    pileMeshes.push(mesh);
  }

  function removeItem(item) {
    scene.remove(item.mesh);
    item.mesh.material.dispose();
    if (item.body) world.removeRigidBody(item.body);
    const at = pileMeshes.indexOf(item.mesh);
    if (at >= 0) pileMeshes.splice(at, 1);
    items.delete(item.id);
  }

  // `options` (item and type counts) is only for tests that need a short round.
  function restart(nextMode = state?.mode || mode, options = {}) {
    for (const item of [...items.values()]) removeItem(item);
    for (const fx of [...sparks, ...confetti]) scene.remove(fx.mesh);
    sparks = []; confetti = []; pops = []; spawnQueue = [];
    world?.free();
    world = createWorld();
    state = createGoose(nextMode, (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0, options);
    // The opening pile is dropped in one go, stacked up the cone, and settles as you watch.
    state.pile.forEach((entry, index) => {
      const y = CONE.BOTTOM + 0.8 + index * ((CONE.TOP - CONE.BOTTOM - 1.4) / state.pile.length), r = Math.max(0, radiusAt(y) - 0.75) * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      spawn(entry, Math.cos(a) * r, y, Math.sin(a) * r);
    });
    setHover(null); pressed = null;
    card.hidden = true; endTimer = 0; trayShake = 0;
    accumulator = 0;
    updateHud(true);
  }

  // Refills for 无尽模式 are tipped in from above the rim, a few per frame.
  function dropQueued() {
    for (let n = 0; n < 3 && spawnQueue.length; n += 1) {
      const entry = spawnQueue.shift(), y = CONE.TOP - 0.3, r = (radiusAt(y) - 0.9) * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      spawn(entry, Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }

  // The physics engine's walls are exact, but a body squeezed hard enough can still
  // tunnel; this puts it back inside and cancels the outward part of its velocity.
  function keepInside(body) {
    const p = body.translation();
    let { x, z } = p;
    const y = THREE.MathUtils.clamp(p.y, CONE.BOTTOM + CONE.ITEM_R, CONE.TOP + CONE.LID - CONE.ITEM_R);
    const limit = Math.max(radiusAt(y) - CONE.ITEM_R, 0.1), radial = Math.hypot(x, z);
    if (radial <= limit && y === p.y) return;
    const v = body.linvel();
    if (radial > limit) {
      const nx = x / radial, nz = z / radial, out = v.x * nx + v.z * nz;
      x = nx * limit; z = nz * limit;
      if (out > 0) { v.x -= out * nx * 1.5; v.z -= out * nz * 1.5; }
    }
    if (y !== p.y) v.y = p.y > y ? Math.min(v.y, 0) : Math.max(v.y, 0);
    body.setTranslation({ x, y, z }, true);
    body.setLinvel(v, true);
  }

  function shake() {
    if (state.phase !== 'playing') return;
    for (const item of items.values()) {
      if (!item.body) continue;
      const p = item.body.translation(), m = item.body.mass(), radial = Math.hypot(p.x, p.z);
      // Inwards and upwards, with a swirl, so the pile turns over rather than just bouncing.
      const nx = radial > 0.01 ? -p.x / radial : Math.random() - 0.5, nz = radial > 0.01 ? -p.z / radial : Math.random() - 0.5;
      const swirl = (Math.random() - 0.5) * 3.6, push = 1 + Math.random() * 1.4;
      item.body.applyImpulse({ x: (nx * push - nz * swirl) * m, y: (2 + Math.random() * 2.2) * m, z: (nz * push + nx * swirl) * m }, true);
      item.body.applyTorqueImpulse({ x: (Math.random() - 0.5) * m * 0.6, y: (Math.random() - 0.5) * m * 0.6, z: (Math.random() - 0.5) * m * 0.6 }, true);
    }
  }

  function pick(item) {
    if (!gooseCanPick(state)) { trayShake = 0.3; return; }
    const { slot, added } = pickGoose(state, item.id);
    if (slot < 0) return;
    setHover(null);
    world.removeRigidBody(item.body);
    item.body = null;
    pileMeshes.splice(pileMeshes.indexOf(item.mesh), 1);
    item.fly = { from: item.mesh.position.clone(), quat: item.mesh.quaternion.clone(), t: 0 };
    spawnQueue.push(...added);
    navigator.vibrate?.(8);
    updateHud();
  }

  // Tray items follow their slot every frame, so an item that is shuffled along
  // by a newcomer of its own kind slides over rather than jumping.
  function updateTray(dt) {
    const finished = [];
    state.tray.forEach((entry, index) => {
      const item = items.get(entry.id);
      if (!item) return;
      const target = slotPosition(index);
      if (entry.status === 'flying') {
        item.fly.t = Math.min(1, item.fly.t + dt / FLY_TIME);
        const e = easeOutCubic(item.fly.t);
        item.mesh.position.lerpVectors(item.fly.from, target, e);
        item.mesh.position.y += Math.sin(Math.PI * e) * 1.4;
        item.mesh.quaternion.slerpQuaternions(item.fly.quat, DISPLAY, e);
        item.mesh.scale.setScalar(THREE.MathUtils.lerp(1, TRAY.SCALE, e));
        if (item.fly.t >= 1) {
          const triple = landGoose(state, entry.id);
          if (triple.length) pops.push({ ids: triple, t: 0 });
        }
      } else {
        item.mesh.position.lerp(target, 1 - Math.exp(-dt * 16));
        if (entry.status === 'resting') item.mesh.quaternion.slerp(DISPLAY, 1 - Math.exp(-dt * 12));
      }
    });
    for (const pop of pops) {
      pop.t += dt / POP_TIME;
      const group = pop.ids.map(id => items.get(id)).filter(Boolean);
      for (const item of group) {
        const swell = pop.t < 0.35 ? THREE.MathUtils.lerp(1, 1.25, pop.t / 0.35) : THREE.MathUtils.lerp(1.25, 0.01, (pop.t - 0.35) / 0.65);
        item.mesh.scale.setScalar(TRAY.SCALE * Math.max(0.01, swell));
        item.mesh.rotateY(dt * 9);
        item.mesh.material.emissiveIntensity = Math.min(0.6, pop.t);
      }
      if (pop.t >= 1) {
        const centre = new THREE.Vector3();
        group.forEach(item => centre.add(item.mesh.position));
        if (group.length) burst(centre.divideScalar(group.length));
        group.forEach(removeItem);
        finished.push(pop);
        clearGoose(state, pop.ids);
        navigator.vibrate?.(14);
      }
    }
    if (finished.length) { pops = pops.filter(pop => !finished.includes(pop)); updateHud(); }
    // The last free slots warn the player as the tray fills.
    const filled = state.tray.length;
    slots.forEach((slot, index) => slot.material.color.set(index >= filled && filled >= GOOSE.TRAY - 2 ? '#ffc6bd' : '#fbecd0'));
  }

  const sparkGeometry = keep(new THREE.OctahedronGeometry(0.1));
  const confettiGeometry = keep(new THREE.PlaneGeometry(0.2, 0.12));
  const sparkMaterials = SPARKS.map(color => keep(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: false })));
  function burst(at) {
    for (let i = 0; i < 16; i += 1) {
      const mesh = new THREE.Mesh(sparkGeometry, sparkMaterials[i % sparkMaterials.length]), a = (i / 16) * Math.PI * 2, speed = 3 + Math.random() * 2.5;
      mesh.position.copy(at);
      scene.add(mesh);
      sparks.push({ mesh, v: new THREE.Vector3(Math.cos(a) * speed, 2 + Math.random() * 2, Math.sin(a) * speed), life: 0 });
    }
  }
  function celebrate() {
    const width = camera.right - camera.left;
    for (let i = 0; i < 150; i += 1) {
      const mesh = new THREE.Mesh(confettiGeometry, sparkMaterials[i % sparkMaterials.length]);
      mesh.position.set(camera.left + Math.random() * width, 12 + Math.random() * 3, screenTop - 0.3 - Math.random() * 7);
      mesh.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      scene.add(mesh);
      confetti.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, 3 + Math.random() * 3), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), life: 0 });
    }
  }
  function updateEffects(dt) {
    sparks = sparks.filter(fx => {
      fx.life += dt / 0.6;
      fx.v.y -= 9 * dt;
      fx.mesh.position.addScaledVector(fx.v, dt);
      fx.mesh.scale.setScalar(Math.max(0.01, 1 - fx.life));
      fx.mesh.rotation.x += dt * 8;
      if (fx.life < 1) return true;
      scene.remove(fx.mesh);
      return false;
    });
    confetti = confetti.filter(fx => {
      fx.life += dt / 3.2;
      fx.mesh.position.addScaledVector(fx.v, dt);
      fx.mesh.rotation.x += fx.spin.x * dt; fx.mesh.rotation.y += fx.spin.y * dt; fx.mesh.rotation.z += fx.spin.z * dt;
      if (fx.life < 1 && fx.mesh.position.z < screenBottom + 0.5) return true;
      scene.remove(fx.mesh);
      return false;
    });
  }

  function hitItem(event) {
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pileMeshes, false)[0];
    return hit ? items.get(hit.object.userData.id) : null;
  }
  function setHover(item) {
    if (hovered === item) return;
    if (hovered?.mesh) { hovered.mesh.material.emissiveIntensity = 0; hovered.mesh.scale.setScalar(1); }
    hovered = item;
    if (hovered) { hovered.mesh.material.emissiveIntensity = 0.5; hovered.mesh.scale.setScalar(1.08); }
  }
  function onDown(event) {
    if (state.phase !== 'playing') return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    pressed = hitItem(event);
    setHover(pressed);
  }
  function onMove(event) {
    if (state.phase !== 'playing') return;
    if (event.pointerType === 'mouse' && !pressed) setHover(hitItem(event));
  }
  function onUp(event) {
    canvas.releasePointerCapture?.(event.pointerId);
    const was = pressed;
    pressed = null;
    if (!was || state.phase !== 'playing' || !items.has(was.id) || !was.body) { setHover(null); return; }
    // Releasing on the item you pressed — or on empty space, after the pile shifted
    // under your finger — takes it; sliding onto a different item cancels.
    const released = hitItem(event);
    if (!released || released === was) pick(was);
    else setHover(event.pointerType === 'mouse' ? released : null);
  }
  function onLeave() { if (!pressed) setHover(null); }
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', () => { pressed = null; setHover(null); });
  canvas.addEventListener('pointerleave', onLeave);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function updateHud(force = false) {
    const endless = state.mode === 'endless';
    const count = endless ? `消除 <b>${state.cleared}</b>` : `剩余 <b>${state.pile.length}</b>`;
    const seconds = endless ? Math.ceil(state.timeLeft) : Math.floor(state.elapsed);
    const html = `${count}|⏱ <b>${seconds}</b>s`;
    if (!force && html === hudText) return;
    hudText = html;
    const [left, right] = html.split('|');
    hud.querySelector('.goose-count').innerHTML = left;
    const clock = hud.querySelector('.goose-clock');
    clock.innerHTML = right;
    clock.classList.toggle('urgent', endless && seconds <= 10);
    onHud(endless ? `无尽模式 · 最高 ${Math.max(best, state.cleared)}` : `经典模式 · 已通关 ${wins} 次`);
  }

  function showEnd() {
    const endless = state.mode === 'endless';
    let title, line;
    if (state.phase === 'won') {
      wins += 1; writeCount(STORE.wins, wins);
      title = '通关！';
      line = `用时 ${Math.floor(state.elapsed)} 秒 · 累计通关 ${wins} 次`;
    } else if (endless) {
      const record = state.cleared > best;
      if (record) { best = state.cleared; writeCount(STORE.best, best); }
      title = state.timeLeft <= 0 ? '时间到' : '暂存栏满了';
      line = `消除 ${state.cleared} 件 · ${record ? '新纪录！' : `最高 ${best}`}`;
    } else {
      title = '暂存栏满了';
      line = `碗里还剩 ${state.pile.length} 件`;
    }
    card.classList.toggle('won', state.phase === 'won');
    card.innerHTML = `<div><strong>${title}</strong><p>${line}</p><button type="button">再来一局</button></div>`;
    card.querySelector('button').addEventListener('click', () => restart());
    card.hidden = false;
    updateHud(true);
  }

  function fit() {
    const width = Math.max(1, wrap.clientWidth), height = Math.max(1, wrap.clientHeight);
    renderer.setSize(width, height, false);
    const needW = VIEW.HALF_W * 2, needH = VIEW.BOTTOM - VIEW.TOP, aspect = width / height;
    const viewW = Math.max(needW, needH * aspect), viewH = viewW / aspect, mid = (VIEW.TOP + VIEW.BOTTOM) / 2;
    Object.assign(camera, { left: -viewW / 2, right: viewW / 2, top: viewH / 2, bottom: -viewH / 2 });
    camera.position.set(0, CAMERA_Y, mid);
    camera.lookAt(0, 0, mid);
    camera.updateProjectionMatrix();
    screenTop = mid - viewH / 2; screenBottom = mid + viewH / 2;
    // The bowl's shadow on the tablecloth is drawn by the stylesheet, under the canvas.
    const scale = width / viewW;
    wrap.style.setProperty('--bowl-x', `${width / 2}px`);
    wrap.style.setProperty('--bowl-y', `${(camera.top - mid) * scale}px`);
    wrap.style.setProperty('--bowl-r', `${(CONE.TOP_R + 0.36) * scale}px`);
  }
  const resizer = new ResizeObserver(fit);
  resizer.observe(wrap);

  function tick(time) {
    if (destroyed) return;
    const dt = last ? Math.min(0.05, (time - last) / 1000) : STEP;
    last = time;
    const playing = state.phase === 'playing';
    tickGoose(state, dt);
    dropQueued();
    accumulator = Math.min(accumulator + dt, STEP * 4);
    while (accumulator >= STEP) { world.step(); accumulator -= STEP; }
    let top = CONE.BOTTOM;
    for (const item of items.values()) {
      if (!item.body) continue;
      keepInside(item.body);
      const p = item.body.translation(), r = item.body.rotation();
      item.mesh.position.set(p.x, p.y, p.z);
      item.mesh.quaternion.set(r.x, r.y, r.z, r.w);
      top = Math.max(top, p.y);
    }
    scene.fog.near = THREE.MathUtils.lerp(scene.fog.near, CAMERA_Y - Math.min(CONE.TOP, top) - 0.4, 0.1);
    scene.fog.far = scene.fog.near + 11;
    updateTray(dt);
    updateEffects(dt);
    if (trayShake > 0) { trayShake = Math.max(0, trayShake - dt); camera.position.x = Math.sin(trayShake * 60) * trayShake * 0.4; } else camera.position.x = 0;
    if (playing) updateHud();
    // The round has just ended: let the last item land in view before the card covers it.
    if (state.phase !== 'playing' && card.hidden && !endTimer) {
      endTimer = time + (state.phase === 'won' ? 1200 : 700);
      if (state.phase === 'won') celebrate();
    }
    if (endTimer && time >= endTimer && card.hidden) { endTimer = 0; showEnd(); }
    renderer.render(scene, camera);
    frame = requestAnimationFrame(tick);
  }

  restart(mode);
  fit();
  frame = requestAnimationFrame(tick);

  return {
    get state() { return state; },
    restart,
    shake,
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      resizer.disconnect();
      for (const item of [...items.values()]) removeItem(item);
      for (const fx of [...sparks, ...confetti]) scene.remove(fx.mesh);
      world?.free();
      world = null;
      disposables.forEach(thing => thing.dispose());
      disposeTemplates();
      renderer.dispose();
      renderer.forceContextLoss();
      wrap.replaceChildren();
    },
    // For end-to-end tests: where a pile item sits on screen, and which ones a tap
    // at their centre would actually reach (the rest are hidden under others).
    debug: {
      screenOf(id) {
        const item = items.get(id), rect = canvas.getBoundingClientRect();
        if (!item) return null;
        const p = item.mesh.position.clone().project(camera);
        return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height };
      },
      tappable() {
        const still = (body) => { const v = body.linvel(); return Math.hypot(v.x, v.y, v.z) < 0.05; };
        return [...items.values()].filter(item => item.body && still(item.body)).filter(item => {
          const at = this.screenOf(item.id);
          return hitItem({ clientX: at.x, clientY: at.y }) === item;
        }).map(item => ({ id: item.id, type: item.type }));
      },
      names: GOOSE_ITEMS.map(spec => spec.name)
    }
  };
}
