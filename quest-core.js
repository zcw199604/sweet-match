// 三消勇者团: the rules, kept free of the DOM so Node can test them. The view
// (quest.js) owns timing and drawing; this module owns what a match does.
//
// Four heroes, one tile colour each. Clearing a colour makes that hero act:
//   战士 ⚔ physical damage · 法师 ✦ piercing damage (splash / freeze on long runs)
//   盾卫 ⛨ shield + taunt · 牧师 ✚ heal (all / revive on long runs)
// A fallen hero's tiles do nothing, so keeping the priest and guardian alive matters.
//
// A turn is: swapTiles → resolveStep until it returns null → finishMove →
// (enemyStep until it returns null). Every step mutates the state and returns the
// events it caused, so a view can replay them one at a time.
export const QUEST = {
  COLS: 6,
  ROWS: 6,
  STAGES: 50,
  ACT_LEN: 10,
  BOSS_STAGES: [10, 20, 30, 40, 50],
  COMBO_STEP: 0.25,
  PERK_CAP: 12,
  VIGOR_CAP: 12,
  RALLY_CAP: 4,
  PERK_STEP: 0.25,
  GUARDIAN_REDUCE: 0.3,
  TAUNT_TURNS: 2,
  REVIVE_RATIO: 0.35,
  CLEAR_HEAL: 0.25,
  CLEAR_REVIVE: 0.3,
  HP_START: 1.5,
  HP_GROWTH: 0.10,
  ATK_BASE: 2.2,
  ATK_GROWTH: 0.05,
  SCORE_GROWTH: 0.08
};

export const HEROES = [
  { id: 'warrior', name: '战士', glyph: '⚔', skill: '劈砍', blurb: '物理伤害，会被护甲抵掉一部分', maxHp: 90 },
  { id: 'mage', name: '法师', glyph: '✦', skill: '奥术', blurb: '穿透伤害，4 连溅射全场，5 连冻结', maxHp: 60 },
  { id: 'guardian', name: '盾卫', glyph: '⛨', skill: '壁垒', blurb: '加护盾并嘲讽，4 连全队护盾', maxHp: 120 },
  { id: 'priest', name: '牧师', glyph: '✚', skill: '圣愈', blurb: '治疗最虚弱的人，4 连全队，5 连复活', maxHp: 70 }
];
const TYPES = HEROES.length;

// moves cycle in order, so the telegraph is exactly what happens next.
// kind: hit (one hero) · aoe (everyone, half) · pierce (one hero, ignores shield) · drain (hit + heal self) · mend (heal self)
const ENEMIES = [
  { id: 'slime', name: '史莱姆', glyph: '🟢', hp: 42, def: 0, score: 40, moves: [{ n: '撞击', k: 'hit', p: 7 }, { n: '黏液', k: 'hit', p: 5 }] },
  { id: 'bat', name: '洞穴蝠', glyph: '🦇', hp: 36, def: 0, score: 45, moves: [{ n: '俯冲', k: 'hit', p: 8 }, { n: '超声波', k: 'aoe', p: 8 }] },
  { id: 'goblin', name: '哥布林', glyph: '👺', hp: 56, def: 2, score: 60, moves: [{ n: '劈砍', k: 'hit', p: 10 }, { n: '投石', k: 'hit', p: 7 }, { n: '偷袭', k: 'pierce', p: 9 }] },
  { id: 'skeleton', name: '骷髅兵', glyph: '💀', hp: 70, def: 4, score: 80, moves: [{ n: '骨刺', k: 'hit', p: 12 }, { n: '盾击', k: 'hit', p: 9 }, { n: '亡灵号令', k: 'aoe', p: 12 }] },
  { id: 'gargoyle', name: '石像魔', glyph: '🗿', hp: 230, def: 4, score: 400, boss: true, moves: [{ n: '碎岩拳', k: 'hit', p: 15 }, { n: '石化吐息', k: 'aoe', p: 14 }, { n: '穿心爪', k: 'pierce', p: 17 }, { n: '岩肤修复', k: 'mend', p: 0 }] },
  { id: 'wraith', name: '幽灵', glyph: '👻', hp: 78, def: 3, score: 100, moves: [{ n: '附身', k: 'drain', p: 12 }, { n: '哀嚎', k: 'aoe', p: 13 }] },
  { id: 'ogre', name: '食人魔', glyph: '👹', hp: 110, def: 6, score: 130, moves: [{ n: '重锤', k: 'hit', p: 18 }, { n: '咆哮', k: 'aoe', p: 11 }, { n: '蛮力', k: 'hit', p: 12 }] },
  { id: 'drake', name: '幼龙', glyph: '🐲', hp: 124, def: 5, score: 160, moves: [{ n: '龙息', k: 'aoe', p: 16 }, { n: '利爪', k: 'hit', p: 16 }, { n: '俯冲', k: 'pierce', p: 15 }] },
  { id: 'lich', name: '巫妖王', glyph: '🧙', hp: 420, def: 6, score: 1000, boss: true, moves: [{ n: '死亡射线', k: 'pierce', p: 22 }, { n: '灵魂风暴', k: 'aoe', p: 20 }, { n: '汲魂', k: 'drain', p: 20 }, { n: '白骨重塑', k: 'mend', p: 0 }, { n: '末日裁决', k: 'hit', p: 28 }] },
  { id: 'mushroom', name: '毒蘑菇', glyph: '🍄', hp: 48, def: 1, score: 50, moves: [{ n: '头槌', k: 'hit', p: 7 }, { n: '孢子云', k: 'aoe', p: 9 }] },
  { id: 'wolf', name: '野狼', glyph: '🐺', hp: 52, def: 1, score: 55, moves: [{ n: '撕咬', k: 'hit', p: 8 }, { n: '嚎叫', k: 'aoe', p: 7 }, { n: '扑杀', k: 'hit', p: 11 }] },
  { id: 'spider', name: '毒蜘蛛', glyph: '🕷', hp: 60, def: 2, score: 70, moves: [{ n: '毒牙', k: 'pierce', p: 8 }, { n: '吐丝', k: 'hit', p: 6 }, { n: '毒液', k: 'hit', p: 11 }] },
  { id: 'assassin', name: '影刃', glyph: '🥷', hp: 58, def: 3, score: 90, moves: [{ n: '飞刀', k: 'hit', p: 8 }, { n: '背刺', k: 'pierce', p: 14 }] },
  { id: 'fire', name: '火精灵', glyph: '🔥', hp: 70, def: 2, score: 110, moves: [{ n: '灼烧', k: 'hit', p: 11 }, { n: '烈焰风暴', k: 'aoe', p: 13 }, { n: '引燃', k: 'drain', p: 10 }] },
  { id: 'knight', name: '黑骑士', glyph: '🛡', hp: 120, def: 7, score: 150, moves: [{ n: '斩击', k: 'hit', p: 16 }, { n: '暗影突刺', k: 'pierce', p: 14 }, { n: '十字斩', k: 'aoe', p: 12 }] },
  { id: 'golem', name: '岩石魔像', glyph: '🗿', hp: 150, def: 8, score: 170, moves: [{ n: '重拳', k: 'hit', p: 20 }, { n: '地震', k: 'aoe', p: 13 }, { n: '岩肤修补', k: 'mend', p: 0 }] },
  { id: 'spiderqueen', name: '蛛后', glyph: '🕸', hp: 320, def: 4, score: 600, boss: true, moves: [{ n: '毒牙', k: 'pierce', p: 18 }, { n: '蛛网缠绕', k: 'aoe', p: 13 }, { n: '啃食', k: 'drain', p: 17 }, { n: '产卵修复', k: 'mend', p: 0 }, { n: '猎杀', k: 'hit', p: 22 }] },
  { id: 'infernal', name: '炎魔', glyph: '😈', hp: 520, def: 7, score: 1500, boss: true, moves: [{ n: '烈焰鞭', k: 'hit', p: 24 }, { n: '地狱火', k: 'aoe', p: 20 }, { n: '熔岩弹', k: 'pierce', p: 22 }, { n: '吸魂', k: 'drain', p: 18 }, { n: '狱火重生', k: 'mend', p: 0 }, { n: '毁灭一击', k: 'hit', p: 32 }] }
];
const byId = (id) => ENEMIES.find((entry) => entry.id === id);

// Who turns up on each stage. Every tenth stage ends an act on a boss; the fifth of each act
// is an elite pair. Ordinary waves are built from a roster that gets tougher every seven stages,
// so the table stays a function instead of fifty hand-written rows.
const ROSTER = ['slime', 'bat', 'mushroom', 'wolf', 'goblin', 'spider', 'skeleton', 'assassin', 'fire', 'wraith', 'knight', 'ogre', 'drake', 'golem'];
const BOSS_WAVES = { 10: ['gargoyle'], 20: ['spiderqueen', 'spider'], 30: ['lich', 'assassin'], 40: ['gargoyle', 'spiderqueen'], 50: ['infernal', 'lich'] };
export function waveOf(stage) {
  if (BOSS_WAVES[stage]) return BOSS_WAVES[stage];
  if (stage === 1) return ['slime'];
  const top = ROSTER.length - 1;
  const lead = Math.min(top, Math.floor(((stage - 1) * ROSTER.length) / QUEST.STAGES));
  if (stage % QUEST.ACT_LEN === 5) return [ROSTER[Math.min(top, lead + 1)], ROSTER[lead]];
  // The partner is one of the ranks around the lead, never a copy of it; stepping by 7 walks the whole window.
  const window = [];
  for (let rank = Math.max(0, lead - 3); rank <= Math.min(top, lead + 2); rank += 1) if (rank !== lead) window.push(rank);
  const partner = window[(stage * 7) % window.length];
  return [ROSTER[lead], ROSTER[partner]];
}
export const actOf = (stage) => Math.ceil(stage / QUEST.ACT_LEN);
// Later stages are worth more, but gently: a flawless 50-stage run must stay under the board's 100k cap.
export const stageValue = (stage) => 1 + (stage - 1) * QUEST.SCORE_GROWTH;

export const PERKS = [
  { id: 'warrior', name: '战士 · 精锐', desc: '战士的方块效果 +25%', hero: 0 },
  { id: 'mage', name: '法师 · 精锐', desc: '法师的方块效果 +25%', hero: 1 },
  { id: 'guardian', name: '盾卫 · 精锐', desc: '盾卫的方块效果 +25%', hero: 2 },
  { id: 'priest', name: '牧师 · 精锐', desc: '牧师的方块效果 +25%', hero: 3 },
  { id: 'vigor', name: '全队强健', desc: '全员最大生命 +18，并立刻回复 18', hero: -1 },
  { id: 'rally', name: '战场鼓舞', desc: '连击加成再多 +10%', hero: -1 }
];
const perkCap = (perk) => (perk.id === 'vigor' ? QUEST.VIGOR_CAP : perk.id === 'rally' ? QUEST.RALLY_CAP : QUEST.PERK_CAP);

function random(state) {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 4294967296;
}
const pick = (state, count) => Math.floor(random(state) * count);

// ---- board ----
export function findMatches(board) {
  // runs[type] = longest straight line; cells[type] = every distinct cell cleared.
  const cells = new Map(), run = {};
  const mark = (r, c, type) => { cells.set(`${r},${c}`, type); };
  for (let r = 0; r < QUEST.ROWS; r += 1) {
    for (let c = 0; c < QUEST.COLS;) {
      const type = board[r][c];
      let end = c + 1;
      while (type !== null && end < QUEST.COLS && board[r][end] === type) end += 1;
      if (type !== null && end - c >= 3) { for (let k = c; k < end; k += 1) mark(r, k, type); run[type] = Math.max(run[type] || 0, end - c); }
      c = end;
    }
  }
  for (let c = 0; c < QUEST.COLS; c += 1) {
    for (let r = 0; r < QUEST.ROWS;) {
      const type = board[r][c];
      let end = r + 1;
      while (type !== null && end < QUEST.ROWS && board[end][c] === type) end += 1;
      if (type !== null && end - r >= 3) { for (let k = r; k < end; k += 1) mark(k, c, type); run[type] = Math.max(run[type] || 0, end - r); }
      r = end;
    }
  }
  const byType = {};
  for (const [key, type] of cells) {
    const [r, c] = key.split(',').map(Number);
    (byType[type] ||= { type, count: 0, run: run[type], cells: [] }).count += 1;
    byType[type].cells.push([r, c]);
  }
  return Object.values(byType);
}
const anyMatch = (board) => findMatches(board).length > 0;

export function validSwaps(board) {
  const out = [];
  for (let r = 0; r < QUEST.ROWS; r += 1) {
    for (let c = 0; c < QUEST.COLS; c += 1) {
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        const nr = r + dr, nc = c + dc;
        if (nr >= QUEST.ROWS || nc >= QUEST.COLS || board[r][c] === board[nr][nc]) continue;
        [board[r][c], board[nr][nc]] = [board[nr][nc], board[r][c]];
        const hit = anyMatch(board);
        [board[r][c], board[nr][nc]] = [board[nr][nc], board[r][c]];
        if (hit) out.push({ a: [r, c], b: [nr, nc] });
      }
    }
  }
  return out;
}

function makeBoard(state) {
  for (;;) {
    const board = Array.from({ length: QUEST.ROWS }, () => Array(QUEST.COLS).fill(null));
    for (let r = 0; r < QUEST.ROWS; r += 1) {
      for (let c = 0; c < QUEST.COLS; c += 1) {
        const bad = new Set();
        if (c > 1 && board[r][c - 1] === board[r][c - 2]) bad.add(board[r][c - 1]);
        if (r > 1 && board[r - 1][c] === board[r - 2][c]) bad.add(board[r - 1][c]);
        const allowed = [...Array(TYPES).keys()].filter((type) => !bad.has(type));
        board[r][c] = allowed[pick(state, allowed.length)];
      }
    }
    if (validSwaps(board).length) return board;
  }
}
function gravity(state) {
  for (let c = 0; c < QUEST.COLS; c += 1) {
    const column = [];
    for (let r = QUEST.ROWS - 1; r >= 0; r -= 1) if (state.board[r][c] !== null) column.push(state.board[r][c]);
    while (column.length < QUEST.ROWS) column.push(pick(state, TYPES));
    for (let r = 0; r < QUEST.ROWS; r += 1) state.board[QUEST.ROWS - 1 - r][c] = column[r];
  }
}

// ---- stages ----
// Enemies hit harder faster than they grow tougher, so late waves punish a neglected priest.
const hpScale = (stage) => QUEST.HP_START + (stage - 1) * QUEST.HP_GROWTH;
const atkScale = (stage) => QUEST.ATK_BASE * (1 + (stage - 1) * QUEST.ATK_GROWTH);
function spawn(stage) {
  return waveOf(stage).map((id, index) => {
    const base = byId(id), hp = Math.round(base.hp * hpScale(stage));
    return {
      id: base.id, name: base.name, glyph: base.glyph, boss: Boolean(base.boss), uid: index,
      hp, maxHp: hp, def: base.def, score: base.score, scale: atkScale(stage), moves: base.moves,
      turn: 0, frozen: 0, intent: base.moves[0]
    };
  });
}
export const intentPower = (enemy, move = enemy.intent) => Math.round(move.p * enemy.scale);
export function intentText(enemy) {
  const m = enemy.intent, p = intentPower(enemy);
  const effect = { hit: `攻击 ${p}`, aoe: `全体 ${Math.ceil(p / 2)}`, pierce: `穿透 ${p}`, drain: `吸血 ${p}`, mend: '自我修复' }[m.k];
  return `${m.n} · ${effect}`;
}

function newStage(state) {
  state.enemies = spawn(state.stage);
  state.target = 0;
  state.board = makeBoard(state);
  state.taunt = 0;
  state.bonus = false;
  state.combo = 0;
  state.longest = 0;
  state.actor = 0;
  state.turns = 0;
  for (const hero of state.party) hero.shield = 0;
  state.phase = 'player';
}

export function createQuest(seed = Date.now()) {
  const state = {
    rng: seed >>> 0 || 1,
    phase: 'player',
    stage: 1,
    party: HEROES.map((hero) => ({ id: hero.id, hp: hero.maxHp, maxHp: hero.maxHp, shield: 0 })),
    perks: {},
    enemies: [],
    target: 0,
    board: [],
    taunt: 0,
    bonus: false,
    combo: 0,
    longest: 0,
    actor: 0,
    turns: 0,
    score: 0,
    kills: 0,
    bestCombo: 0,
    offers: [],
    clearBonus: 0
  };
  newStage(state);
  return state;
}

export const living = (state) => state.party.filter((hero) => hero.hp > 0);
export const isBoss = (state) => state.enemies.some((enemy) => enemy.boss);
const perkLevel = (state, id) => state.perks[id] || 0;
// Hero i's strength: its own perk levels stack linearly.
const heroPower = (state, index) => 1 + QUEST.PERK_STEP * perkLevel(state, HEROES[index].id);
const comboStep = (state) => QUEST.COMBO_STEP + 0.1 * perkLevel(state, 'rally');
const tierOf = (run) => (run >= 5 ? 3 : run === 4 ? 2 : 1);

export function setTarget(state, index) {
  if (state.enemies[index]?.hp > 0) state.target = index;
}
function liveTarget(state) {
  if (state.enemies[state.target]?.hp > 0) return state.enemies[state.target];
  const index = state.enemies.findIndex((enemy) => enemy.hp > 0);
  if (index >= 0) state.target = index;
  return state.enemies[index] ?? null;
}

// ---- player move ----
export function swapTiles(state, r1, c1, r2, c2) {
  if (state.phase !== 'player') return false;
  if (Math.abs(r1 - r2) + Math.abs(c1 - c2) !== 1) return false;
  const { board } = state;
  if (board[r1]?.[c1] == null || board[r2]?.[c2] == null || board[r1][c1] === board[r2][c2]) return false;
  [board[r1][c1], board[r2][c2]] = [board[r2][c2], board[r1][c1]];
  if (!anyMatch(board)) {
    [board[r1][c1], board[r2][c2]] = [board[r2][c2], board[r1][c1]];
    return false;
  }
  state.phase = 'resolving';
  state.combo = 0;
  state.longest = 0;
  return true;
}

function hurtEnemy(state, enemy, amount, events, hero, pierce) {
  const dealt = Math.min(enemy.hp, Math.max(1, Math.round(pierce ? amount : amount - enemy.def)));
  enemy.hp -= dealt;
  events.push({ kind: 'damage', enemy: enemy.uid, amount: dealt, hero, pierce });
  if (enemy.hp <= 0) {
    state.kills += 1;
    state.score += Math.round(enemy.score * stageValue(state.stage));
    events.push({ kind: 'kill', enemy: enemy.uid });
  }
}
function healHero(hero, index, amount, events) {
  if (hero.hp <= 0) return;
  const healed = Math.min(hero.maxHp - hero.hp, amount);
  hero.hp += healed;
  events.push({ kind: 'heal', hero: index, amount: healed });
}

function castHero(state, group, mult, events) {
  const index = group.type, hero = state.party[index], tier = tierOf(group.run), cells = group.count;
  if (hero.hp <= 0) { events.push({ kind: 'fizzle', hero: index }); return; }
  const power = heroPower(state, index) * mult;
  const alive = state.enemies.filter((enemy) => enemy.hp > 0);
  if (!alive.length) return;
  if (index === 0) {
    // 战士: 6 per tile; the longer the line, the harder the blow.
    const target = liveTarget(state), amount = cells * 6 * power * [1, 1.4, 2][tier - 1];
    hurtEnemy(state, target, amount, events, index, false);
  } else if (index === 1) {
    const target = liveTarget(state), amount = cells * 5 * power;
    // 4 in a row splashes the rest of the wave at 60%; 5 hits everyone hard.
    for (const enemy of alive) {
      if (tier === 1 && enemy !== target) continue;
      const share = tier === 3 ? 1.3 : enemy === target ? 1 : 0.6;
      hurtEnemy(state, enemy, amount * share, events, index, true);
    }
    if (tier === 3) for (const enemy of alive) if (enemy.hp > 0) { enemy.frozen = 1; events.push({ kind: 'freeze', enemy: enemy.uid }); }
  } else if (index === 2) {
    const shield = Math.round(cells * 5 * power);
    hero.shield += shield;
    events.push({ kind: 'shield', hero: index, amount: shield });
    state.taunt = QUEST.TAUNT_TURNS;
    events.push({ kind: 'taunt' });
    if (tier >= 2) {
      state.party.forEach((ally, i) => {
        if (i === index || ally.hp <= 0) return;
        const share = Math.round(shield * (tier === 3 ? 1 : 0.6));
        ally.shield += share;
        events.push({ kind: 'shield', hero: i, amount: share });
      });
    }
  } else {
    const amount = Math.round(cells * 5 * power + 4);
    if (tier === 1) {
      const weakest = living(state).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      healHero(weakest, state.party.indexOf(weakest), amount, events);
    } else {
      state.party.forEach((ally, i) => healHero(ally, i, Math.round(amount * (tier === 3 ? 1 : 0.6)), events));
    }
    if (tier === 3) {
      const fallen = state.party.findIndex((ally) => ally.hp <= 0);
      if (fallen >= 0) {
        state.party[fallen].hp = Math.max(1, Math.round(state.party[fallen].maxHp * QUEST.REVIVE_RATIO));
        events.push({ kind: 'revive', hero: fallen, amount: state.party[fallen].hp });
      }
    }
  }
}

// One cascade step. Returns null once the board holds no match (or the wave is dead).
export function resolveStep(state) {
  if (state.phase !== 'resolving' || !state.enemies.some((enemy) => enemy.hp > 0)) return null;
  const groups = findMatches(state.board);
  if (!groups.length) return null;
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const mult = 1 + (state.combo - 1) * comboStep(state);
  const events = [], cells = [];
  for (const group of groups) state.longest = Math.max(state.longest, group.run);
  // Warrior first, priest last, so a revive lands after the damage is counted.
  for (const group of groups.sort((a, b) => a.type - b.type)) {
    cells.push(...group.cells);
    const start = events.length;
    castHero(state, group, mult, events);
    // Tag who caused each event, so a view can animate one hero's action at a time.
    for (let k = start; k < events.length; k += 1) events[k].by = group.type;
  }
  for (const [r, c] of cells) state.board[r][c] = null;
  gravity(state);
  return { combo: state.combo, mult, groups: groups.map(({ type, count, run, cells: list }) => ({ type, count, run, cells: list })), cells, events, cleared: !state.enemies.some((enemy) => enemy.hp > 0) };
}

function ensurePlayable(state) {
  if (validSwaps(state.board).length) return false;
  state.board = makeBoard(state);
  return true;
}

function offerPerks(state) {
  const open = PERKS.filter((perk) => perkLevel(state, perk.id) < perkCap(perk));
  const pool = open.length ? [...open] : [...PERKS], offers = [];
  while (offers.length < 3 && pool.length) offers.push(pool.splice(pick(state, pool.length), 1)[0].id);
  return offers;
}

// Called when resolveStep has run dry. Returns what happens next.
//   { outcome: 'cleared' | 'won' }  the wave is dead (won = last stage)
//   { outcome: 'extra' }            a line of 4+: move again
//   { outcome: 'enemy' }            the enemies answer
export function finishMove(state) {
  if (state.phase !== 'resolving') return { outcome: 'none' };
  if (!state.enemies.some((enemy) => enemy.hp > 0)) {
    state.score += Math.round(100 * stageValue(state.stage)) + 60 * living(state).length + Math.max(0, 10 - state.turns) * 15;
    if (state.stage >= QUEST.STAGES) {
      state.score += 3000;
      state.phase = 'won';
      return { outcome: 'won' };
    }
    state.offers = offerPerks(state);
    state.phase = 'build';
    return { outcome: 'cleared' };
  }
  const reshuffled = ensurePlayable(state);
  // Ordinary enemies grant one bonus move; against a boss the bonus can chain.
  if (state.longest >= 4 && (!state.bonus || isBoss(state))) {
    state.bonus = true;
    state.phase = 'player';
    return { outcome: 'extra', reshuffled };
  }
  state.bonus = false;
  state.phase = 'enemy';
  state.actor = 0;
  return { outcome: 'enemy', reshuffled };
}

// ---- enemy phase ----
function damageHero(state, index, amount, events, enemy, pierce) {
  const hero = state.party[index];
  let dmg = amount;
  if (index === 2) dmg = Math.round(dmg * (1 - QUEST.GUARDIAN_REDUCE));
  const blocked = pierce ? 0 : Math.min(hero.shield, dmg);
  hero.shield -= blocked;
  const taken = Math.min(hero.hp, dmg - blocked);
  hero.hp -= taken;
  events.push({ kind: 'hurt', hero: index, amount: taken, blocked, enemy: enemy.uid });
  if (hero.hp <= 0) events.push({ kind: 'fall', hero: index });
  return taken;
}
function pickVictim(state) {
  const guardian = state.party[2];
  if (state.taunt > 0 && guardian.hp > 0) return 2;
  const alive = state.party.map((hero, i) => (hero.hp > 0 ? i : -1)).filter((i) => i >= 0);
  return alive[pick(state, alive.length)];
}

// One enemy acts per call; null when every enemy has acted (control returns to the player)
// or the party is wiped out (phase becomes 'lost').
export function enemyStep(state) {
  if (state.phase !== 'enemy') return null;
  while (state.actor < state.enemies.length && state.enemies[state.actor].hp <= 0) state.actor += 1;
  if (state.actor >= state.enemies.length) {
    state.turns += 1;
    if (state.taunt > 0) state.taunt -= 1;
    for (const enemy of state.enemies) enemy.intent = enemy.moves[enemy.turn % enemy.moves.length];
    liveTarget(state);
    state.phase = 'player';
    return null;
  }
  const enemy = state.enemies[state.actor];
  state.actor += 1;
  const events = [], move = enemy.intent, p = intentPower(enemy, move);
  enemy.turn += 1;
  if (enemy.frozen > 0) {
    enemy.frozen -= 1;
    events.push({ kind: 'frozen', enemy: enemy.uid });
  } else if (move.k === 'mend') {
    const healed = Math.min(enemy.maxHp - enemy.hp, Math.round(enemy.maxHp * 0.12));
    enemy.hp += healed;
    events.push({ kind: 'enemyHeal', enemy: enemy.uid, amount: healed, move: move.n });
  } else if (move.k === 'aoe') {
    events.push({ kind: 'cast', enemy: enemy.uid, move: move.n, k: move.k });
    state.party.forEach((hero, i) => { if (hero.hp > 0) damageHero(state, i, Math.ceil(p / 2), events, enemy, false); });
  } else {
    events.push({ kind: 'cast', enemy: enemy.uid, move: move.n, k: move.k });
    const taken = damageHero(state, pickVictim(state), p, events, enemy, move.k === 'pierce');
    if (move.k === 'drain') {
      const healed = Math.min(enemy.maxHp - enemy.hp, Math.round(taken * 0.6));
      enemy.hp += healed;
      if (healed) events.push({ kind: 'enemyHeal', enemy: enemy.uid, amount: healed, move: move.n });
    }
  }
  // Intent for the move after this one is shown as soon as it is chosen.
  enemy.intent = enemy.moves[enemy.turn % enemy.moves.length];
  if (!living(state).length) state.phase = 'lost';
  return { enemy: enemy.uid, events };
}

// ---- between stages ----
export function chooseReward(state, id) {
  if (state.phase !== 'build' || !state.offers.includes(id)) return false;
  const perk = PERKS.find((entry) => entry.id === id);
  state.perks[id] = perkLevel(state, id) + 1;
  if (id === 'vigor') for (const hero of state.party) { hero.maxHp += 18; if (hero.hp > 0) hero.hp = Math.min(hero.maxHp, hero.hp + 18); }
  state.party.forEach((hero) => {
    if (hero.hp <= 0) hero.hp = Math.max(1, Math.round(hero.maxHp * QUEST.CLEAR_REVIVE));
    else hero.hp = Math.min(hero.maxHp, hero.hp + Math.round(hero.maxHp * QUEST.CLEAR_HEAL));
  });
  state.offers = [];
  state.stage += 1;
  newStage(state);
  return perk;
}
