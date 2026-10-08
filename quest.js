// 三消勇者团: the view. Plain DOM — a row of enemies, the four heroes, and a 6×6 board.
// quest-core.js decides what every match does; this module plays its events back
// one beat at a time (flash, numbers, the enemies' answer) and handles taps / swipes.
// Everything is built with textContent, never innerHTML, so no text can inject markup.
import { chooseReward, createQuest, enemyStep, finishMove, HEROES, intentText, PERKS, QUEST, resolveStep, setTarget, swapTiles, validSwaps } from './quest-core.js';

const STORE = { best: 'pao-quest-best' };
const readCount = (key) => { try { return Math.max(0, Number(localStorage.getItem(key)) || 0); } catch { return 0; } };
const writeCount = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* private mode */ } };
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

export function mountQuest(wrap, { onHud = () => {}, onResult = null } = {}) {
  let alive = true;
  let epoch = 0; // bumped by restart, so a half-played turn stops touching the new game
  let state = createQuest();
  let busy = false;
  let selected = null;
  let drag = null;
  let hintTimer = 0;
  let best = readCount(STORE.best);

  const field = el('div', 'quest-field');
  const enemiesRow = el('div', 'quest-enemies');
  const bar = el('div', 'quest-bar');
  const turn = el('span', 'quest-turn', '你的回合');
  const msg = el('span', 'quest-msg');
  msg.setAttribute('aria-live', 'polite');
  bar.append(turn, msg);
  const partyRow = el('div', 'quest-party');
  const boardEl = el('div', 'quest-board');
  const overlay = el('div', 'quest-overlay');
  overlay.hidden = true;
  field.append(enemiesRow, bar, partyRow, boardEl);
  wrap.replaceChildren(field, overlay);

  // ---- build ----
  const heroCards = HEROES.map((hero, index) => {
    const card = el('div', 'qh');
    card.dataset.hero = String(index);
    card.title = `${hero.name} · ${hero.skill}：${hero.blurb}`;
    const glyph = el('b', 'qh-glyph', hero.glyph);
    const name = el('span', 'qh-name', `${hero.name}`);
    const skill = el('span', 'qh-skill', hero.skill);
    const hp = el('span', 'qh-hp');
    const fill = el('i');
    hp.append(fill);
    const num = el('span', 'qh-num');
    const shield = el('span', 'qh-shield');
    // Only the guardian taunts.
    const taunt = index === 2 ? el('span', 'qh-taunt', '嘲讽') : null;
    card.append(glyph, name, skill, hp, num, shield);
    if (taunt) { taunt.hidden = true; card.append(taunt); }
    partyRow.append(card);
    return { card, fill, num, shield, taunt };
  });

  const tiles = [];
  for (let r = 0; r < QUEST.ROWS; r += 1) {
    for (let c = 0; c < QUEST.COLS; c += 1) {
      const tile = el('button', 'qt');
      tile.type = 'button';
      tile.dataset.r = String(r);
      tile.dataset.c = String(c);
      boardEl.append(tile);
      tiles.push(tile);
    }
  }
  const tileAt = (r, c) => tiles[r * QUEST.COLS + c];

  let enemyCards = [];
  function buildEnemies() {
    enemiesRow.replaceChildren();
    enemiesRow.dataset.count = String(state.enemies.length);
    enemyCards = state.enemies.map((enemy, index) => {
      const card = el('button', 'qe');
      card.type = 'button';
      card.dataset.uid = String(enemy.uid);
      const glyph = el('b', 'qe-glyph', enemy.glyph);
      const name = el('span', 'qe-name', enemy.boss ? `${enemy.name} · BOSS` : enemy.name);
      const hp = el('span', 'qe-hp');
      const fill = el('i');
      hp.append(fill);
      const num = el('span', 'qe-num');
      const intent = el('span', 'qe-intent');
      card.append(glyph, name, hp, num, intent);
      card.classList.toggle('boss', enemy.boss);
      card.addEventListener('click', () => { if (busy) return; setTarget(state, index); paintEnemies(); });
      enemiesRow.append(card);
      return { card, fill, num, intent };
    });
  }

  // ---- paint ----
  const say = (text) => { msg.textContent = text; };
  const setTurnLabel = (label, enemy = false) => { turn.textContent = label; turn.classList.toggle('foe', enemy); };
  function paintEnemies() {
    state.enemies.forEach((enemy, index) => {
      const view = enemyCards[index];
      if (!view) return;
      view.fill.style.width = `${Math.max(0, enemy.hp / enemy.maxHp) * 100}%`;
      view.num.textContent = `${Math.max(0, enemy.hp)} / ${enemy.maxHp}`;
      view.intent.textContent = enemy.hp > 0 ? (enemy.frozen > 0 ? '❄ 冻结中，跳过行动' : `预告：${intentText(enemy)}`) : '已击败';
      view.card.classList.toggle('dead', enemy.hp <= 0);
      view.card.classList.toggle('target', enemy.hp > 0 && state.target === index && state.enemies.filter((other) => other.hp > 0).length > 1);
      view.card.classList.toggle('frozen', enemy.frozen > 0 && enemy.hp > 0);
      view.card.setAttribute('aria-label', `${enemy.name} 生命 ${enemy.hp}/${enemy.maxHp}`);
    });
  }
  function paintParty() {
    state.party.forEach((hero, index) => {
      const view = heroCards[index];
      view.fill.style.width = `${Math.max(0, hero.hp / hero.maxHp) * 100}%`;
      view.num.textContent = hero.hp > 0 ? `${hero.hp}/${hero.maxHp}` : '倒下';
      view.shield.textContent = hero.shield > 0 ? `🛡${hero.shield}` : '';
      view.card.classList.toggle('down', hero.hp <= 0);
      view.card.classList.toggle('low', hero.hp > 0 && hero.hp / hero.maxHp < 0.35);
    });
    heroCards[2].taunt.hidden = !(state.taunt > 0 && state.party[2].hp > 0);
  }
  function paintBoard() {
    for (let r = 0; r < QUEST.ROWS; r += 1) {
      for (let c = 0; c < QUEST.COLS; c += 1) {
        const type = state.board[r][c], tile = tileAt(r, c);
        tile.className = `qt t${type}`;
        tile.textContent = HEROES[type].glyph;
        tile.setAttribute('aria-label', `第 ${r + 1} 行第 ${c + 1} 列 ${HEROES[type].name}`);
        if (selected && selected[0] === r && selected[1] === c) tile.classList.add('sel');
      }
    }
  }
  function paintHud() {
    onHud(`第 ${state.stage}/${QUEST.STAGES} 关 · ${state.score} 分`);
  }
  function paintAll() { paintEnemies(); paintParty(); paintBoard(); paintHud(); }

  // ---- feedback ----
  function float(target, text, kind) {
    if (!target) return;
    const node = el('span', `qfloat ${kind}`, text);
    target.append(node);
    setTimeout(() => node.remove(), 1000);
  }
  const enemyCard = (uid) => enemyCards[state.enemies.findIndex((enemy) => enemy.uid === uid)]?.card;
  function showEvents(events) {
    for (const ev of events) {
      if (ev.kind === 'damage') float(enemyCard(ev.enemy), `-${ev.amount}`, ev.pierce ? 'mag' : 'dmg');
      else if (ev.kind === 'kill') enemyCard(ev.enemy)?.classList.add('dead');
      else if (ev.kind === 'freeze') float(enemyCard(ev.enemy), '冻结', 'ice');
      else if (ev.kind === 'frozen') float(enemyCard(ev.enemy), '被冻住', 'ice');
      else if (ev.kind === 'enemyHeal' && ev.amount) float(enemyCard(ev.enemy), `+${ev.amount}`, 'heal');
      else if (ev.kind === 'heal' && ev.amount) float(heroCards[ev.hero].card, `+${ev.amount}`, 'heal');
      else if (ev.kind === 'revive') float(heroCards[ev.hero].card, '复活！', 'heal');
      else if (ev.kind === 'shield') float(heroCards[ev.hero].card, `🛡+${ev.amount}`, 'shield');
      else if (ev.kind === 'fizzle') float(heroCards[ev.hero].card, '已倒下', 'dmg');
      else if (ev.kind === 'hurt') {
        const card = heroCards[ev.hero].card;
        float(card, ev.amount ? `-${ev.amount}` : '挡住', ev.amount ? 'dmg' : 'shield');
        if (ev.amount) { card.classList.remove('hit'); void card.offsetWidth; card.classList.add('hit'); }
      }
    }
  }
  const castLine = (step) => {
    const parts = step.groups.map((g) => {
      const hero = HEROES[g.type];
      if (state.party[g.type].hp <= 0) return `${hero.name}已倒下`;
      return `${hero.name} ${hero.skill}${g.run >= 4 ? ` ${g.run} 连` : ''}`;
    });
    return `${step.combo > 1 ? `连锁 ×${step.combo} · ` : ''}${parts.join(' · ')}`;
  };

  // ---- turns ----
  const live = (my) => alive && my === epoch;
  const wait = (ms, my) => new Promise((resolve) => setTimeout(() => resolve(live(my)), ms));

  async function playSwap(a, b) {
    if (busy || state.phase !== 'player') return;
    const my = epoch;
    busy = true;
    selected = null;
    clearHint();
    if (!swapTiles(state, a[0], a[1], b[0], b[1])) {
      for (const [r, c] of [a, b]) { const tile = tileAt(r, c); tile.classList.remove('nope'); void tile.offsetWidth; tile.classList.add('nope'); }
      paintBoard();
      say('这一步连不成三个，换个位置试试。');
      busy = false;
      return;
    }
    paintBoard();
    if (!await wait(110, my)) return;
    for (let step = resolveStep(state); step; step = resolveStep(state)) {
      for (const [r, c] of step.cells) tileAt(r, c).classList.add('pop');
      say(castLine(step));
      if (!await wait(230, my)) return;
      showEvents(step.events);
      paintAll();
      if (!await wait(190, my)) return;
    }
    const result = finishMove(state);
    paintAll();
    if (result.reshuffled) say('没有可走的步了，棋盘已重排。');
    if (result.outcome === 'cleared') {
      say('本关胜利！');
      if (await wait(750, my)) showRewards();
    } else if (result.outcome === 'won') {
      if (await wait(900, my)) finish(true);
    } else if (result.outcome === 'extra') {
      say(`${state.longest} 连！额外回合，敌人还没动。`);
      setTurnLabel('额外回合');
      busy = false;
    } else {
      await enemyPhase(my);
    }
  }

  async function enemyPhase(my) {
    setTurnLabel('敌人行动', true);
    if (!await wait(380, my)) return;
    for (let act = enemyStep(state); act; act = enemyStep(state)) {
      const card = enemyCard(act.enemy);
      card?.classList.add('acting');
      const cast = act.events.find((ev) => ev.kind === 'cast' || ev.kind === 'enemyHeal');
      if (cast) say(`${state.enemies.find((e) => e.uid === act.enemy).name}：${cast.move}`);
      if (!await wait(260, my)) return;
      showEvents(act.events);
      paintParty();
      paintEnemies();
      if (!await wait(480, my)) return;
      card?.classList.remove('acting');
    }
    paintAll();
    if (state.phase === 'lost') {
      say('全军覆没……');
      if (await wait(800, my)) finish(false);
      return;
    }
    setTurnLabel('你的回合');
    say(state.taunt > 0 ? '盾卫的嘲讽还在，敌人会盯着他打。' : '轮到你了。');
    busy = false;
  }

  function showRewards() {
    overlay.replaceChildren();
    overlay.className = 'quest-overlay';
    const card = el('div', 'quest-card');
    card.append(el('strong', '', `第 ${state.stage} 关胜利`), el('p', '', '全队恢复了一些生命，倒下的伙伴也站了起来。选一项强化：'));
    const list = el('div', 'quest-perks');
    for (const id of state.offers) {
      const perk = PERKS.find((entry) => entry.id === id);
      const level = state.perks[id] || 0;
      const button = el('button', 'quest-perk');
      button.type = 'button';
      button.dataset.perk = id;
      if (perk.hero >= 0) button.classList.add(`t${perk.hero}`);
      button.append(el('b', '', perk.name), el('span', '', perk.desc), el('small', '', level ? `已 ${level} 级 → ${level + 1} 级` : '新强化'));
      button.addEventListener('click', () => pickReward(id));
      list.append(button);
    }
    card.append(list);
    overlay.append(card);
    overlay.hidden = false;
  }
  function pickReward(id) {
    if (!chooseReward(state, id)) return;
    overlay.hidden = true;
    buildEnemies();
    paintAll();
    setTurnLabel('你的回合');
    const names = state.enemies.map((enemy) => enemy.name).join('、');
    say(`第 ${state.stage} 关：${names}${QUEST.BOSS_STAGES.includes(state.stage) ? '——首领！' : ''}`);
    busy = false;
  }

  function finish(won) {
    busy = true;
    const isRecord = state.score > best;
    if (isRecord) { best = state.score; writeCount(STORE.best, best); }
    overlay.replaceChildren();
    overlay.className = `quest-overlay${won ? ' won' : ''}`;
    const card = el('div', 'quest-card');
    const note = el('p', '', `${won ? `通关！共击败 ${state.kills} 个敌人` : `倒在第 ${state.stage} 关，击败 ${state.kills} 个敌人`} · 最高连锁 ×${state.bestCombo} · ${isRecord ? '新纪录！' : `最高 ${best} 分`}`);
    const button = el('button', 'quest-again', '再来一局');
    button.type = 'button';
    button.addEventListener('click', restart);
    card.append(el('strong', '', won ? '勇者团凯旋' : '全军覆没'), el('b', 'quest-final', `${state.score} 分`), note, button);
    overlay.append(card);
    overlay.hidden = false;
    paintHud();
    // 榜单：整局结束（通关或全军覆没）才提交；onResult 给出名次那一行字。
    if (onResult && state.score > 0) {
      onResult('quest', state.score).then((text) => { if (text && note.isConnected && !overlay.hidden) note.textContent += ` · ${text}`; });
    }
  }

  function restart() {
    epoch += 1;
    state = createQuest();
    busy = false;
    selected = null;
    drag = null;
    clearHint();
    overlay.hidden = true;
    buildEnemies();
    paintAll();
    setTurnLabel('你的回合');
    say(`第 1 关：${state.enemies.map((enemy) => enemy.name).join('、')}。点选两格相邻方块交换，也可以直接滑动。`);
  }

  // ---- input ----
  function clearHint() {
    clearTimeout(hintTimer);
    for (const tile of tiles) tile.classList.remove('hint');
  }
  function hint() {
    if (busy || state.phase !== 'player') return;
    clearHint();
    const moves = validSwaps(state.board);
    if (!moves.length) return;
    // Math.random, not the game's seeded stream: asking for a hint must not change what falls.
    const move = moves[Math.floor(Math.random() * moves.length)];
    tileAt(...move.a).classList.add('hint');
    tileAt(...move.b).classList.add('hint');
    hintTimer = setTimeout(clearHint, 2200);
  }
  function tap(r, c) {
    if (busy) return;
    if (!selected) selected = [r, c];
    else if (selected[0] === r && selected[1] === c) selected = null;
    else if (Math.abs(selected[0] - r) + Math.abs(selected[1] - c) === 1) { void playSwap(selected, [r, c]); return; }
    else selected = [r, c];
    paintBoard();
  }
  const cellOf = (event) => {
    const tile = event.target.closest?.('.qt');
    return tile ? [Number(tile.dataset.r), Number(tile.dataset.c)] : null;
  };
  boardEl.addEventListener('pointerdown', (event) => {
    const cell = cellOf(event);
    if (!cell) return;
    drag = { cell, x: event.clientX, y: event.clientY, swiped: false };
  });
  boardEl.addEventListener('pointermove', (event) => {
    if (!drag || drag.swiped || busy) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    const reach = tiles[0].getBoundingClientRect().width * 0.4;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < reach) return;
    drag.swiped = true;
    const [r, c] = drag.cell;
    const to = Math.abs(dx) > Math.abs(dy) ? [r, c + Math.sign(dx)] : [r + Math.sign(dy), c];
    if (to[0] < 0 || to[1] < 0 || to[0] >= QUEST.ROWS || to[1] >= QUEST.COLS) return;
    selected = null;
    void playSwap(drag.cell, to);
  });
  const endDrag = (event) => {
    if (drag && !drag.swiped && event.type === 'pointerup') tap(...drag.cell);
    drag = null;
  };
  boardEl.addEventListener('pointerup', endDrag);
  boardEl.addEventListener('pointercancel', endDrag);
  boardEl.addEventListener('contextmenu', (event) => event.preventDefault());
  // A keyboard activation arrives as a click with no pointer (detail 0); pointer taps are handled above.
  boardEl.addEventListener('click', (event) => {
    const cell = cellOf(event);
    if (cell && event.detail === 0) tap(...cell);
  });

  buildEnemies();
  paintAll();
  say(`第 1 关：${state.enemies.map((enemy) => enemy.name).join('、')}。点选两格相邻方块交换，也可以直接滑动。`);

  return {
    get state() { return state; },
    restart,
    hint,
    destroy() {
      alive = false;
      clearHint();
      wrap.replaceChildren();
    },
    debug: { cell: tileAt, best: () => best }
  };
}
