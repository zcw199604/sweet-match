// 隔墙狙击（ARCADE 41）的规则层：两个木头人轮流，一个躲在墙后，一个隔着墙打三枪。
// 子弹能打穿墙，没打中也会在墙上留个洞，洞越多躲的人越容易被看见；打中身体扣血并立刻换边，爆头直接赢。
// 浏览器（单机对电脑）和服务端适配器（联机，服务端权威）共用这一份。不碰 DOM，时间一律由调用方传入（毫秒）。
// 世界坐标：x 从墙的左端往右，y 从地面往上。墙宽 WALL.W、高 WALL.H。
import { rngFrom } from './rng-core.js';

export const WALL = { W: 360, H: 170 };
export const RULES = {
  HP: 100, BULLETS: 3, TURNS: 20,
  HIDE_MS: 5000, AIM_MS: 12000, REVEAL_MS: 1800,
  HOLE_R: 8, BULLET_R: 2,
  POSE_COOLDOWN: 700, EDGE: 30, SLACK: 12
};
export const DAMAGE = { head: 100, body: 30, limb: 10 };
export const POSES = ['stand', 'crouch', 'prone'];
export const POSE_NAMES = { stand: '站', crouch: '蹲', prone: '趴' };
// 站着跑得快但目标大，趴下最安全但只能慢慢爬。
export const SPEED = { stand: 110, crouch: 70, prone: 36 };

// 地图：windows 是墙上本来就有的窗口（看得穿、子弹直接过、不留洞），steel 是打不穿的钢板，holes 是开局就有的小洞。
export const MAPS = [
  { id: 'brick', name: '红砖墙', style: 'brick', windows: [], steel: [], holes: [] },
  { id: 'barn', name: '旧仓库', style: 'plank', windows: [{ x: 58, y: 98, w: 56, h: 40 }, { x: 246, y: 98, w: 56, h: 40 }], steel: [], holes: [] },
  { id: 'site', name: '工地', style: 'concrete', windows: [{ x: 152, y: 112, w: 56, h: 34 }], steel: [{ x: 36, y: 0, w: 46, h: 62 }, { x: 278, y: 0, w: 46, h: 62 }], holes: [] },
  { id: 'fence', name: '竹篱笆', style: 'bamboo', windows: [], steel: [], holes: [{ x: 70, y: 84, r: 6 }, { x: 150, y: 40, r: 6 }, { x: 214, y: 112, r: 6 }, { x: 296, y: 64, r: 6 }] }
];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const num = (v) => typeof v === 'number' && Number.isFinite(v);

// ---- 身体 ----
// 每个姿势的部位，按判定顺序排（头 → 身体 → 四肢）。趴下时头朝 face 那一边。
const SHAPES = {
  stand: [
    { part: 'head', c: [0, 106, 13] },
    { part: 'body', r: [-15, 54, 30, 39] },
    { part: 'limb', r: [-24, 58, 9, 34] }, { part: 'limb', r: [15, 58, 9, 34] },
    { part: 'limb', r: [-13, 0, 11, 54] }, { part: 'limb', r: [2, 0, 11, 54] }
  ],
  crouch: [
    { part: 'head', c: [0, 72, 13] },
    { part: 'body', r: [-16, 28, 32, 31] },
    { part: 'limb', r: [-25, 30, 9, 28] }, { part: 'limb', r: [16, 30, 9, 28] },
    { part: 'limb', r: [-19, 0, 16, 28] }, { part: 'limb', r: [3, 0, 16, 28] }
  ],
  prone: [
    { part: 'head', c: [36, 13, 12] },
    { part: 'body', r: [-8, 2, 32, 22] },
    { part: 'limb', r: [24, 0, 22, 7] },
    { part: 'limb', r: [-50, 2, 42, 10] }, { part: 'limb', r: [-50, 13, 42, 10] }
  ]
};
// 某个位置、姿势下各部位的世界坐标：{ part, kind: 'circle', x, y, r } 或 { part, kind: 'rect', x, y, w, h }。
export function bodyParts({ x, pose, face = 1 }) {
  return (SHAPES[pose] ?? SHAPES.stand).map((s) => {
    if (s.c) return { part: s.part, kind: 'circle', x: x + s.c[0] * face, y: s.c[1], r: s.c[2] };
    const [rx, ry, w, h] = s.r;
    return { part: s.part, kind: 'rect', x: face === 1 ? x + rx : x - rx - w, y: ry, w, h };
  });
}
const pointIn = (p, px, py, pad) => (p.kind === 'circle'
  ? Math.hypot(px - p.x, py - p.y) <= p.r + pad
  : px >= p.x - pad && px <= p.x + p.w + pad && py >= p.y - pad && py <= p.y + p.h + pad);
// 子弹打在 (px, py)：命中的部位，没打中返回 null。
export function hitPart(hider, px, py) {
  return bodyParts(hider).find((p) => pointIn(p, px, py, RULES.BULLET_R))?.part ?? null;
}
const circleHits = (p, cx, cy, r) => {
  if (p.kind === 'circle') return Math.hypot(cx - p.x, cy - p.y) < p.r + r - 1;
  const nx = clamp(cx, p.x, p.x + p.w), ny = clamp(cy, p.y, p.y + p.h);
  return Math.hypot(cx - nx, cy - ny) < r - 1;
};
const rectHits = (p, w) => (p.kind === 'circle'
  ? circleHits({ kind: 'rect', ...w }, p.x, p.y, p.r)
  : p.x < w.x + w.w - 1 && p.x + p.w > w.x + 1 && p.y < w.y + w.h - 1 && p.y + p.h > w.y + 1);
// 从墙这边看得见的部位（透过洞或窗口）。
export function exposedParts(hider, holes, map) {
  return bodyParts(hider).filter((p) => holes.some((h) => circleHits(p, h.x, h.y, h.r)) || map.windows.some((w) => rectHits(p, w)));
}
export const inSteel = (map, x, y) => map.steel.some((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
export const inWindow = (map, x, y) => map.windows.some((w) => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h);
export const mapOf = (state) => MAPS[state.map] ?? MAPS[0];

// ---- 对局 ----
// mapIndex 不给就按种子随机挑；先狙击的一方也按种子定。scale 把各阶段时长按比例缩放（只给测试用）。
export function createMatch(seed = 1, { mapIndex = null, first = null, scale = 1 } = {}) {
  const rng = { s: seed | 0 }, rand = rngFrom(rng);
  const map = Number.isInteger(mapIndex) && MAPS[mapIndex] ? mapIndex : Math.floor(rand() * MAPS.length);
  const sniper = first === 0 || first === 1 ? first : (rand() < 0.5 ? 0 : 1);
  const holes = () => MAPS[map].holes.map((h) => ({ ...h, pre: true }));
  // 开局站的位置：挑一个站着也不会从窗口、小洞露出来的地方
  const spot = (prefs, face) => {
    for (const pose of ['stand', 'crouch', 'prone']) {
      const x = prefs.find((px) => !exposedParts({ x: px, pose, face }, holes(), MAPS[map]).length);
      if (x !== undefined) return { x, pose, face };
    }
    return { x: prefs[0], pose: 'prone', face };
  };
  return {
    map, rng, sniper,
    ms: { hide: RULES.HIDE_MS * scale, aim: RULES.AIM_MS * scale, reveal: RULES.REVEAL_MS * scale },
    walls: [{ holes: holes() }, { holes: holes() }],
    spots: [spot([0.3, 0.5, 0.2, 0.4].map((k) => WALL.W * k), 1), spot([0.7, 0.5, 0.8, 0.6].map((k) => WALL.W * k), -1)],
    hp: [RULES.HP, RULES.HP],
    ready: [false, false],
    turn: 0,
    phase: 'ready', phaseAt: 0, phaseEnds: 0,
    bullets: RULES.BULLETS,
    hider: null,
    aim: { x: WALL.W / 2, y: 60 },
    shots: [],
    last: null,             // 上一个回合怎么结束的：{ sniper, reason: 'hit' | 'miss' | 'timeout' | 'head' | 'hp', part, damage }
    shotCount: 0,           // 整局开过几枪（客户端靠它发现新的一枪、播特效）
    status: 'playing', winner: null, reason: null
  };
}
export const hiderOf = (state) => 1 - state.sniper;

function startTurn(state, now) {
  const seat = hiderOf(state), spot = state.spots[seat];
  state.turn += 1;
  state.phase = 'hide';
  state.phaseAt = now;
  state.phaseEnds = now + state.ms.hide;
  state.bullets = RULES.BULLETS;
  state.shots = [];
  state.aim = { x: WALL.W / 2, y: 60 };
  state.hider = { x: spot.x, pose: spot.pose, face: spot.face, at: now, poseAt: now - RULES.POSE_COOLDOWN };
}
function endTurn(state, now, reason, part = null, damage = 0) {
  state.last = { sniper: state.sniper, reason, part, damage };
  const seat = hiderOf(state);
  state.spots[seat] = { x: state.hider.x, pose: state.hider.pose, face: state.hider.face };
  if (reason === 'head' || reason === 'hp') {
    Object.assign(state, { phase: 'over', status: 'over', winner: state.sniper, reason, phaseAt: now, phaseEnds: now });
    return;
  }
  state.phase = 'reveal';
  state.phaseAt = now;
  state.phaseEnds = now + state.ms.reveal;
}
function finishByTurns(state, now) {
  const [a, b] = state.hp;
  Object.assign(state, { phase: 'over', status: 'over', winner: a === b ? null : a > b ? 0 : 1, reason: a === b ? 'draw' : 'turns', phaseAt: now, phaseEnds: now });
}

// 双方都点了准备（客户端进对局就会自动发）才开第一回合：联机时第二个人可能过好久才进房间。
export function markReady(state, seat, now) {
  if (state.phase !== 'ready' || state.ready[seat]) return false;
  state.ready[seat] = true;
  if (state.ready.every(Boolean)) startTurn(state, now);
  return true;
}

// 推进计时：躲藏 → 瞄准 → 揭晓 → 换边。返回有没有变化。时间一下跳很远（标签页在后台）也能一口气追上。
export function tick(state, now) {
  let changed = false;
  for (let guard = 0; guard < 8 && state.status === 'playing' && state.phase !== 'ready' && now >= state.phaseEnds; guard += 1) {
    changed = true;
    if (state.phase === 'hide') {
      state.phase = 'aim';
      state.phaseAt = state.phaseEnds;
      state.phaseEnds = state.phaseAt + state.ms.aim;
    } else if (state.phase === 'aim') {
      endTurn(state, state.phaseEnds, state.bullets < RULES.BULLETS ? 'miss' : 'timeout');
    } else if (state.phase === 'reveal') {
      if (state.turn >= RULES.TURNS) finishByTurns(state, state.phaseEnds);
      else { state.sniper = hiderOf(state); startTurn(state, state.phaseEnds); }
    }
  }
  return changed;
}
// 离下一次计时变化还有多少毫秒；没有计时（等准备、已结束）返回 null。
export function nextTimer(state, now) {
  if (state.status !== 'playing' || state.phase === 'ready') return null;
  return Math.max(0, state.phaseEnds - now);
}

// 躲的人移动 / 换姿势。x 是想去的位置：按上次上报以来的时间和当前姿势的速度截断，防止瞬移。
// 换姿势有冷却。返回有没有变化。
export function moveHider(state, seat, { x, pose } = {}, now) {
  if (state.status !== 'playing' || seat !== hiderOf(state) || !['hide', 'aim'].includes(state.phase)) return false;
  const h = state.hider;
  let changed = false;
  if (num(x)) {
    const reach = SPEED[h.pose] * Math.max(0, now - h.at) / 1000 + RULES.SLACK;
    const nx = clamp(clamp(x, h.x - reach, h.x + reach), RULES.EDGE, WALL.W - RULES.EDGE);
    if (Math.abs(nx - h.x) > 0.01) {
      if (Math.abs(nx - h.x) > 0.5) h.face = nx > h.x ? 1 : -1;
      h.x = Math.round(nx * 10) / 10;
      changed = true;
    }
  }
  h.at = now;
  if (POSES.includes(pose) && pose !== h.pose && now - h.poseAt >= RULES.POSE_COOLDOWN) {
    h.pose = pose;
    h.poseAt = now;
    changed = true;
  }
  return changed;
}

// 狙击的人移动准星（躲的人能看到一道红光大概在哪一列）。
export function aimAt(state, seat, { x, y } = {}) {
  if (state.status !== 'playing' || seat !== state.sniper || !['hide', 'aim'].includes(state.phase) || !num(x) || !num(y)) return false;
  state.aim = { x: Math.round(clamp(x, 0, WALL.W) * 10) / 10, y: Math.round(clamp(y, 0, WALL.H) * 10) / 10 };
  return true;
}

// 开枪。返回这一枪 { x, y, part, steel, damage }，不能开枪返回 null。
export function shoot(state, seat, { x, y } = {}, now) {
  if (state.status !== 'playing' || seat !== state.sniper || state.phase !== 'aim' || state.bullets <= 0 || !num(x) || !num(y)) return null;
  const map = mapOf(state);
  const px = Math.round(clamp(x, 0, WALL.W) * 10) / 10, py = Math.round(clamp(y, 0, WALL.H) * 10) / 10;
  state.aim = { x: px, y: py };
  state.bullets -= 1;
  state.shotCount += 1;
  const shot = { x: px, y: py, part: null, steel: false, damage: 0, n: state.shotCount };
  if (inSteel(map, px, py)) shot.steel = true;
  else {
    shot.part = hitPart(state.hider, px, py);
    if (!inWindow(map, px, py)) state.walls[hiderOf(state)].holes.push({ x: px, y: py, r: RULES.HOLE_R });
  }
  state.shots.push(shot);
  if (shot.part) {
    const seatHit = hiderOf(state);
    shot.damage = Math.min(state.hp[seatHit], DAMAGE[shot.part]);
    state.hp[seatHit] -= shot.damage;
    const reason = shot.part === 'head' ? 'head' : state.hp[seatHit] <= 0 ? 'hp' : 'hit';
    endTurn(state, now, reason, shot.part, shot.damage);
  } else if (state.bullets === 0) endTurn(state, now, 'miss');
  return shot;
}

// 统一入口（服务端适配器和单机都走这里）：先把计时追到 now，再执行动作。返回有没有变化。
export function act(state, seat, action, now) {
  tick(state, now);
  switch (action?.type) {
    case 'ready': return markReady(state, seat, now);
    case 'move': return moveHider(state, seat, action, now);
    case 'aim': return aimAt(state, seat, action);
    case 'shoot': return Boolean(shoot(state, seat, action, now));
    default: return false;
  }
}

// 按座位裁剪：躲的人的位置只在「自己就是躲的人」「透过洞或窗口看得见」「揭晓 / 结束」时才给。
// 躲的人只知道准星在哪一列（红光），不知道高低。left 是这一阶段还剩多少毫秒（不发绝对时间，免得两边时钟对不上）。
export function viewFor(state, seat, now) {
  const hider = hiderOf(state), map = mapOf(state), h = state.hider;
  const reveal = state.phase === 'reveal' || state.phase === 'over';
  const wall = state.walls[hider];
  const seen = Boolean(h) && (seat === hider || reveal || exposedParts(h, wall.holes, map).length > 0);
  return {
    map: state.map, seat, sniper: state.sniper, hider,
    phase: state.phase, left: state.phase === 'ready' || state.phase === 'over' ? 0 : Math.max(0, state.phaseEnds - now),
    turn: state.turn, turns: RULES.TURNS, bullets: state.bullets,
    hp: [...state.hp], ready: [...state.ready],
    holes: wall.holes.map(({ x, y, r, pre }) => (pre ? { x, y, r, pre: true } : { x, y, r })),
    shots: state.shots.map((s) => ({ ...s })), shotCount: state.shotCount,
    body: seen ? { x: h.x, pose: h.pose, face: h.face, cool: seat === hider ? Math.max(0, RULES.POSE_COOLDOWN - (now - h.poseAt)) : 0 } : null,
    aim: seat === state.sniper ? { ...state.aim } : state.phase === 'aim' ? { x: state.aim.x } : null,
    last: state.last ? { ...state.last } : null,
    status: state.status, winner: state.winner, reason: state.reason
  };
}

// ---- 电脑 ----
// 只用它「应该知道」的东西：狙击时只看得见洞和窗口后面露出来的部位，躲的时候只看得见红光在哪一列。
export const BOT_LEVELS = {
  easy: { label: '简单', spread: 20, headChance: 0.1, aimSpeed: 240, settle: 600, react: 900, dodge: 0.45, pick: 0.35 },
  normal: { label: '普通', spread: 11, headChance: 0.35, aimSpeed: 360, settle: 380, react: 520, dodge: 0.7, pick: 0.7 },
  hard: { label: '困难', spread: 5, headChance: 0.65, aimSpeed: 520, settle: 220, react: 320, dodge: 0.9, pick: 1 }
};
const POSE_GUESS = [['stand', 0.3], ['crouch', 0.45], ['prone', 0.25]];
const centerOf = (p) => (p.kind === 'circle' ? { x: p.x, y: p.y } : { x: p.x + p.w / 2, y: p.y + p.h / 2 });

export function createBot(level = 'normal', seed = 7) {
  const cfg = BOT_LEVELS[level] ?? BOT_LEVELS.normal;
  const rand = rngFrom({ s: seed | 0 });
  const gauss = () => (rand() + rand() + rand() - 1.5) * 1.15;
  const pickPose = () => { let r = rand(); for (const [pose, w] of POSE_GUESS) { r -= w; if (r <= 0) return pose; } return 'crouch'; };
  let mem = { turn: -1 };

  function freshTurn(state) {
    mem = { turn: state.turn, target: null, settleAt: 0, seen: null, nextShotAt: 0, goal: null, pose: null, laserSince: 0, wanderAt: 0 };
  }

  // 躲：在若干候选位置里挑露得最少的（越难越会挑），趴着最安全但爬得慢，所以也会站着或蹲着。
  function chooseSpot(state, avoidX = null) {
    const map = mapOf(state), holes = state.walls[hiderOf(state)].holes;
    let best = null;
    for (let i = 0; i < 14; i += 1) {
      const x = RULES.EDGE + rand() * (WALL.W - RULES.EDGE * 2), pose = pickPose();
      const shown = exposedParts({ x, pose, face: rand() < 0.5 ? 1 : -1 }, holes, map).length;
      const away = avoidX === null ? 0 : Math.min(1, Math.abs(x - avoidX) / 120);
      const score = -shown * 3 + away * 2 + (rand() - 0.5) * (1 - cfg.pick) * 8;
      if (!best || score > best.score) best = { x, pose, score };
    }
    return best;
  }
  function hide(state, now) {
    const h = state.hider, out = [];
    if (!mem.goal) { const s = chooseSpot(state); mem.goal = s.x; mem.pose = s.pose; mem.wanderAt = now + 2500 + rand() * 3000; }
    if (state.phase === 'aim') {
      const near = Math.abs(state.aim.x - h.x) < 42;
      if (near && !mem.laserSince) mem.laserSince = now;
      if (!near) mem.laserSince = 0;
      if (mem.laserSince && now - mem.laserSince > cfg.react) {
        mem.laserSince = 0;
        if (rand() < cfg.dodge) { const s = chooseSpot(state, state.aim.x); mem.goal = s.x; if (rand() < 0.6) mem.pose = s.pose; }
      }
      if (now > mem.wanderAt) { mem.wanderAt = now + 2500 + rand() * 3500; if (rand() < 0.5) { const s = chooseSpot(state, state.aim.x); mem.goal = s.x; mem.pose = s.pose; } }
    }
    const dt = Math.max(0, now - h.at) / 1000, step = SPEED[h.pose] * dt;
    const x = Math.abs(mem.goal - h.x) <= step ? mem.goal : h.x + Math.sign(mem.goal - h.x) * step;
    out.push({ type: 'move', x, pose: mem.pose });
    return out;
  }

  // 狙：看得见就照着打（有误差，越难越准、越爱打头）；看不见就按记忆或乱猜一个高度打。
  function snipe(state, now) {
    const map = mapOf(state), holes = state.walls[hiderOf(state)].holes;
    const shown = exposedParts(state.hider, holes, map);
    if (shown.length) mem.seen = { x: state.hider.x, pose: state.hider.pose, face: state.hider.face };
    if (state.phase !== 'aim') return [];
    if (!mem.nextShotAt) mem.nextShotAt = now + 900 + rand() * 1500;
    if (!mem.target) {
      let tx, ty;
      if (shown.length) {
        const head = shown.find((p) => p.part === 'head'), body = shown.find((p) => p.part === 'body');
        const p = (head && rand() < cfg.headChance + 0.25) ? head : body ?? head ?? shown[0];
        ({ x: tx, y: ty } = centerOf(p));
      } else if (mem.seen) {
        const parts = bodyParts({ ...mem.seen, x: mem.seen.x + gauss() * 35 });
        const p = rand() < cfg.headChance ? parts[0] : parts[1];
        ({ x: tx, y: ty } = centerOf(p));
      } else {
        const p = bodyParts({ x: RULES.EDGE + rand() * (WALL.W - RULES.EDGE * 2), pose: pickPose(), face: rand() < 0.5 ? 1 : -1 })[1];
        ({ x: tx, y: ty } = centerOf(p));
      }
      mem.target = { x: clamp(tx + gauss() * cfg.spread, 0, WALL.W), y: clamp(ty + gauss() * cfg.spread, 0, WALL.H) };
      mem.settleAt = 0;
    }
    const a = state.aim, dx = mem.target.x - a.x, dy = mem.target.y - a.y, d = Math.hypot(dx, dy);
    const step = cfg.aimSpeed * Math.min(0.1, Math.max(0, now - (mem.aimAt || now)) / 1000);
    mem.aimAt = now;
    if (d > 1.5) {
      const k = Math.min(1, step / d);
      return [{ type: 'aim', x: a.x + dx * k, y: a.y + dy * k }];
    }
    if (!mem.settleAt) mem.settleAt = now + cfg.settle;
    const late = state.phaseEnds - now < 1500 + state.bullets * 400;
    if (now >= mem.settleAt && (now >= mem.nextShotAt || late)) {
      mem.target = null;
      mem.nextShotAt = now + 1200 + rand() * 1800;
      return [{ type: 'shoot', x: a.x, y: a.y }];
    }
    return [];
  }

  return {
    level,
    // 这一刻电脑想做的动作（可能为空）。调用方负责按 act(state, seat, action, now) 执行。
    step(state, seat, now) {
      if (state.status !== 'playing') return [];
      if (state.phase === 'ready') return state.ready[seat] ? [] : [{ type: 'ready' }];
      if (mem.turn !== state.turn) freshTurn(state);
      if (state.phase === 'reveal') return [];
      return seat === state.sniper ? snipe(state, now) : hide(state, now);
    }
  };
}
