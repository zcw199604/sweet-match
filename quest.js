// 三消勇者团: the view. Plain DOM — a side-on battlefield (the party on the left, the
// wave on the right, a parallax landscape behind them) above a 6×6 board.
// quest-core.js decides what every match does; this module plays its events back
// as little scenes: the cleared tiles fly to their hero, the hero acts (the warrior
// dashes in, the mage throws a bolt, …), and the enemies answer the same way.
// Everything is built with textContent, never innerHTML, so no text can inject markup;
// the figures come from quest-art.js, static SVG parsed once and cloned.
import { chooseReward, createQuest, enemyStep, finishMove, HEROES, intentText, PERKS, QUEST, resolveStep, setTarget, swapTiles, validSwaps } from './quest-core.js';
import { foeSprite, heroSprite } from './quest-art.js';

const STORE = { best: 'pao-quest-best' };
const readCount = (key) => { try { return Math.max(0, Number(localStorage.getItem(key)) || 0); } catch { return 0; } };
const writeCount = (key, value) => { try { localStorage.setItem(key, String(value)); } catch { /* private mode */ } };
const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const MOVE_ICON = { hit: '🗡', aoe: '💥', pierce: '🎯', drain: '🩸', mend: '💚' };
// The road changes as the party travels: meadow, the gargoyle's canyon, a dusk forest, the lich's night.
const zoneOf = (stage) => (stage <= 5 ? 'meadow' : stage === 6 ? 'canyon' : stage <= 11 ? 'dusk' : 'castle');
const calm = () => Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

export function mountQuest(wrap, { onHud = () => {}, onResult = null } = {}) {
  let alive = true;
  let epoch = 0; // bumped by restart, so a half-played turn stops touching the new game
  let state = createQuest();
  let busy = false;
  let selected = null;
  let drag = null;
  let hintTimer = 0;
  let travelled = 0; // how far the landscape has scrolled, in px
  let best = readCount(STORE.best);

  const field = el('div', 'quest-field');
  const scene = el('div', 'quest-scene');
  const layers = ['far', 'near', 'ground'].map((name) => el('i', `qs-${name}`));
  const route = el('div', 'quest-route');
  const partyRow = el('div', 'quest-party');
  const enemiesRow = el('div', 'quest-enemies');
  scene.append(...layers, route, enemiesRow, partyRow);
  const bar = el('div', 'quest-bar');
  const turn = el('span', 'quest-turn', '你的回合');
  const msg = el('span', 'quest-msg');
  msg.setAttribute('aria-live', 'polite');
  bar.append(turn, msg);
  const boardEl = el('div', 'quest-board');
  const fx = el('div', 'quest-fx');
  const overlay = el('div', 'quest-overlay');
  overlay.hidden = true;
  field.append(scene, bar, boardEl);
  wrap.replaceChildren(field, fx, overlay);

  // ---- build ----
  const stops = Array.from({ length: QUEST.STAGES }, (_, index) => {
    const stop = el('i');
    if (QUEST.BOSS_STAGES.includes(index + 1)) stop.className = 'boss';
    route.append(stop);
    return stop;
  });

  const heroCards = HEROES.map((hero, index) => {
    const card = el('div', 'qh');
    card.dataset.hero = String(index);
    card.title = `${hero.name} · ${hero.skill}：${hero.blurb}`;
    const shield = el('span', 'qh-shield');
    const hp = el('span', 'qh-hp');
    const fill = el('i');
    hp.append(fill);
    const num = el('span', 'qh-num');
    const fig = el('span', 'qh-fig');
    const art = heroSprite(index);
    fig.append(art ?? el('b', 'qh-fallback', hero.glyph));
    // The badge in the name tag matches this hero's tile, so the board and the party read as one.
    const glyph = el('b', 'qh-glyph', hero.glyph);
    const name = el('span', 'qh-name');
    name.append(glyph, hero.name);
    card.append(shield, hp, num, fig, name);
    // Only the guardian taunts.
    const taunt = index === 2 ? el('span', 'qh-taunt', '嘲讽') : null;
    if (taunt) { taunt.hidden = true; card.append(taunt); }
    partyRow.append(card);
    // arm: the weapon arm that swings on its own; tip: where a spell leaves from.
    return { card, fill, num, shield, taunt, fig, glyph, arm: art?.querySelector('.qa-arm'), tip: art?.querySelector('.qa-tip') ?? fig };
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
      card.dataset.id = enemy.id;
      const intent = el('span', 'qe-intent');
      const hp = el('span', 'qe-hp');
      const fill = el('i');
      hp.append(fill);
      const num = el('span', 'qe-num');
      const body = el('span', 'qe-body');
      const art = foeSprite(enemy.id);
      const glyph = el('b', 'qe-glyph', art ? undefined : enemy.glyph);
      if (art) glyph.append(art);
      body.append(glyph);
      const name = el('span', 'qe-name', enemy.name);
      card.append(intent, hp, num, body, name);
      card.classList.toggle('boss', enemy.boss);
      card.addEventListener('click', () => { if (busy) return; setTarget(state, index); paintEnemies(); });
      enemiesRow.append(card);
      return { card, fill, num, intent, body, glyph, arm: art?.querySelector('.qa-arm') };
    });
  }

  // ---- paint ----
  const say = (text) => { msg.textContent = text; };
  const setTurnLabel = (label, enemy = false) => { turn.textContent = label; turn.classList.toggle('foe', enemy); };
  const setFoeBar = (view, enemy, hp) => {
    view.fill.style.width = `${Math.max(0, hp / enemy.maxHp) * 100}%`;
    view.num.textContent = `${Math.max(0, hp)} / ${enemy.maxHp}`;
  };
  function paintEnemies() {
    const several = state.enemies.filter((other) => other.hp > 0).length > 1;
    state.enemies.forEach((enemy, index) => {
      const view = enemyCards[index];
      if (!view) return;
      setFoeBar(view, enemy, enemy.hp);
      view.intent.textContent = enemy.hp <= 0 ? '' : enemy.frozen > 0 ? '❄ 冻结中，跳过行动' : `${MOVE_ICON[enemy.intent.k]} ${intentText(enemy)}`;
      view.intent.dataset.k = enemy.frozen > 0 ? 'ice' : enemy.intent.k;
      view.card.classList.toggle('dead', enemy.hp <= 0);
      view.card.classList.toggle('target', enemy.hp > 0 && state.target === index && several);
      view.card.classList.toggle('frozen', enemy.frozen > 0 && enemy.hp > 0);
      view.card.setAttribute('aria-label', `${enemy.name} 生命 ${enemy.hp}/${enemy.maxHp}，下一招 ${intentText(enemy)}`);
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
  function paintRoute() {
    scene.dataset.zone = zoneOf(state.stage);
    stops.forEach((stop, index) => {
      stop.classList.toggle('done', index + 1 < state.stage);
      stop.classList.toggle('now', index + 1 === state.stage);
    });
  }
  function paintHud() {
    onHud(`第 ${state.stage}/${QUEST.STAGES} 关 · ${state.score} 分`);
  }
  function paintAll() { paintEnemies(); paintParty(); paintBoard(); paintRoute(); paintHud(); }

  // ---- motion helpers ----
  // Web Animations for anything whose path depends on where things are on screen;
  // with reduced motion every one of them is skipped and the numbers simply appear.
  const animate = (node, frames, options) => (node?.animate && !calm() ? node.animate(frames, options) : null);
  const done = (animation) => (animation ? animation.finished.then(() => {}, () => {}) : Promise.resolve());
  const play = (node, frames, options) => done(animate(node, frames, options));
  // Centre of a node in the wrap's coordinates (the fx layer covers the wrap).
  const at = (node) => {
    const a = node.getBoundingClientRect(), b = wrap.getBoundingClientRect();
    return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2, w: a.width, h: a.height };
  };
  const unit = () => wrap.getBoundingClientRect().width / 100;
  function spawn(className, point, text) {
    const node = el('span', `qfx ${className}`, text);
    node.style.left = `${point.x}px`;
    node.style.top = `${point.y}px`;
    fx.append(node);
    return node;
  }
  // A short-lived effect: spawn it, play it, remove it.
  function flash(className, point, frames, options, text) {
    const node = spawn(className, point, text);
    return play(node, frames, options).then(() => node.remove());
  }
  function float(target, text, kind) {
    if (!target) return;
    const point = at(target);
    const node = spawn(`qfloat ${kind}`, { x: point.x, y: point.y - point.h * 0.25 }, text);
    setTimeout(() => node.remove(), 1000);
  }
  function burst(point, className, count, reach) {
    for (let k = 0; k < count; k += 1) {
      const angle = (k / count) * Math.PI * 2 + Math.random() * 0.6, far = reach * (0.6 + Math.random() * 0.6);
      flash(`qpart ${className}`, point, [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * far}px,${Math.sin(angle) * far}px) scale(.2)`, opacity: 0 }
      ], { duration: 420 + Math.random() * 160, easing: 'cubic-bezier(.2,.7,.3,1)' });
    }
  }
  // Something flies from a to b along a shallow arc.
  function shoot(className, a, b, duration, lift = 0) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return flash(className, a, [
      { transform: 'translate(0,0) scale(.6)' },
      { transform: `translate(${dx * 0.5}px,${dy * 0.5 - lift}px) scale(1.1)` },
      { transform: `translate(${dx}px,${dy}px) scale(.9)` }
    ], { duration, easing: 'cubic-bezier(.45,0,.75,1)' });
  }
  // A weapon arm swinging through a list of [offset, degrees] keys about its own pivot.
  const swing = (arm, keys, duration) => play(arm, keys.map(([offset, deg]) => ({ offset, transform: `rotate(${deg}deg)` })), { duration, easing: 'ease-in-out' });
  const ring = (className, point, size = 1.6, duration = 420) => flash(`qring ${className}`, point, [
    { transform: 'scale(.2)', opacity: 1 },
    { transform: `scale(${size})`, opacity: 0 }
  ], { duration, easing: 'ease-out' });
  function banner(text, className, over) {
    const node = spawn(`qbanner ${className}`, at(over), text);
    const show = animate(node, [
      { transform: 'scale(.3)', opacity: 0 },
      { transform: 'scale(1.15)', opacity: 1, offset: 0.25 },
      { transform: 'scale(1)', opacity: 1, offset: 0.7 },
      { transform: 'scale(1.05) translateY(-20%)', opacity: 0 }
    ], { duration: 900, easing: 'ease-out' });
    if (show) done(show).then(() => node.remove());
    else setTimeout(() => node.remove(), 700);
  }
  function stopMotion() {
    for (const animation of wrap.getAnimations?.({ subtree: true }) ?? []) {
      if (typeof CSSAnimation === 'undefined' || !(animation instanceof CSSAnimation)) animation.cancel();
    }
    fx.replaceChildren();
  }

  const foeView = (uid) => enemyCards[state.enemies.findIndex((enemy) => enemy.uid === uid)];
  const foeOf = (uid) => state.enemies.find((enemy) => enemy.uid === uid);

  // ---- the party's actions ----
  // hp the bars show while a step plays out; the state already holds the step's end result.
  let shownHp = new Map();
  function hitFoe(ev) {
    const view = foeView(ev.enemy), enemy = foeOf(ev.enemy);
    if (!view) return;
    const hp = (shownHp.has(ev.enemy) ? shownHp.get(ev.enemy) : enemy.hp + ev.amount) - ev.amount;
    shownHp.set(ev.enemy, hp);
    setFoeBar(view, enemy, hp);
    float(view.body, `-${ev.amount}`, ev.pierce ? 'mag' : 'dmg');
    play(view.glyph, [{ filter: 'brightness(1)' }, { filter: 'brightness(2.8) saturate(.2)' }, { filter: 'brightness(1)' }], { duration: 280 });
    play(view.body, [{ transform: 'translateX(0)' }, { transform: 'translateX(10%) rotate(6deg)' }, { transform: 'translateX(-2%)' }, { transform: 'translateX(0)' }], { duration: 340, easing: 'ease-out' });
  }
  function killFoe(uid) {
    const view = foeView(uid);
    if (!view) return;
    burst(at(view.body), 'smoke', 10, unit() * 9);
    view.card.classList.add('dead');
    view.intent.textContent = '';
  }
  // The rest of a hero's events that are not hits: kills, freezes.
  function aftermath(events) {
    for (const ev of events) {
      if (ev.kind === 'kill') killFoe(ev.enemy);
      else if (ev.kind === 'freeze') {
        const view = foeView(ev.enemy);
        if (view && foeOf(ev.enemy).hp > 0) { float(view.body, '冻结', 'ice'); ring('ice', at(view.body), 2.2, 520); burst(at(view.body), 'ice', 8, unit() * 8); }
      }
    }
  }

  async function warrior(events, run, my) {
    const hero = heroCards[0], hits = events.filter((ev) => ev.kind === 'damage');
    const view = hits[0] && foeView(hits[0].enemy);
    if (!view) return;
    const a = at(hero.card), b = at(view.body);
    const dx = b.x - a.x - b.w * 0.45, dy = b.y - a.y + a.h * 0.1;
    const dash = animate(hero.card, [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-unit() * 2}px,0) scale(.95)`, offset: 0.12 },
      { transform: `translate(${dx}px,${dy}px)`, offset: 0.4 },
      { transform: `translate(${dx}px,${dy}px)`, offset: 0.62 },
      { transform: 'translate(0,0)' }
    ], { duration: 640, easing: 'ease-in-out' });
    // Wind up behind the shoulder, then bring the sword down through the enemy.
    swing(hero.arm, [[0, 0], [0.3, -55], [0.46, 80], [0.68, 64], [1, 0]], 640);
    play(hero.fig, [{ transform: 'rotate(0)' }, { transform: 'rotate(-6deg)', offset: 0.3 }, { transform: 'rotate(8deg)', offset: 0.48 }, { transform: 'rotate(0)' }], { duration: 640 });
    if (!await waitMs(290, my)) return;
    const point = at(view.body);
    const slash = (angle) => flash('qslash', point, [
      { transform: `rotate(${angle}deg) scale(.4)`, opacity: 1 },
      { transform: `rotate(${angle + 50}deg) scale(1.15)`, opacity: 0 }
    ], { duration: 320, easing: 'ease-out' });
    slash(-70);
    if (run >= 4) setTimeout(() => slash(20), 90);
    burst(point, 't0', 7, unit() * 7);
    for (const ev of hits) hitFoe(ev);
    aftermath(events);
    await done(dash);
  }

  async function mage(events, run, my) {
    const hero = heroCards[1], hits = events.filter((ev) => ev.kind === 'damage');
    play(hero.fig, [{ transform: 'translateY(0)' }, { transform: 'translateY(-14%) scale(1.06)', offset: 0.4 }, { transform: 'translateY(0)' }], { duration: 520, easing: 'ease-out' });
    swing(hero.arm, [[0, 0], [0.3, -22], [0.5, 30], [1, 0]], 560);
    ring('t1', at(hero.tip), 1.4, 360);
    if (!await waitMs(200, my)) return;
    const from = at(hero.tip);
    await Promise.all(hits.map((ev, k) => {
      const view = foeView(ev.enemy);
      if (!view) return null;
      return waitMs(k * 70, my).then((ok) => ok && shoot(`qbolt${run >= 5 ? ' big' : ''}`, from, at(view.body), 300, unit() * 6)).then(() => {
        if (!live(my)) return;
        ring('t1', at(view.body), 2, 380);
        burst(at(view.body), 't1', 8, unit() * 7);
        hitFoe(ev);
      });
    }));
    if (!live(my)) return;
    aftermath(events);
    await waitMs(120, my);
  }

  async function guardian(events, run, my) {
    const hero = heroCards[2];
    play(hero.card, [{ transform: 'translateX(0)' }, { transform: `translateX(${unit() * 3}px)`, offset: 0.35 }, { transform: 'translateX(0)' }], { duration: 520, easing: 'ease-out' });
    play(hero.fig, [{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 520 });
    swing(hero.arm, [[0, 0], [0.35, -16], [0.6, -10], [1, 0]], 560);
    if (!await waitMs(170, my)) return;
    for (const ev of events) {
      if (ev.kind !== 'shield') continue;
      const target = heroCards[ev.hero];
      flash('qbubble', at(target.fig), [
        { transform: 'scale(.4)', opacity: 0 },
        { transform: 'scale(1.05)', opacity: 1, offset: 0.35 },
        { transform: 'scale(1)', opacity: 0.9, offset: 0.7 },
        { transform: 'scale(1.2)', opacity: 0 }
      ], { duration: 760, easing: 'ease-out' });
      float(target.fig, `🛡+${ev.amount}`, 'shield');
    }
    if (events.some((ev) => ev.kind === 'taunt')) {
      ring('t2 wide', at(hero.fig), 3.2, 560);
      for (const view of enemyCards) if (!view.card.classList.contains('dead')) play(view.body, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6%)' }, { transform: 'translateX(0)' }], { duration: 360 });
    }
    paintParty();
    await waitMs(380, my);
  }

  async function priest(events, run, my) {
    const hero = heroCards[3];
    play(hero.fig, [{ transform: 'translateY(0)' }, { transform: 'translateY(-10%)', offset: 0.4 }, { transform: 'translateY(0)' }], { duration: 520, easing: 'ease-out' });
    swing(hero.arm, [[0, 0], [0.35, -30], [0.7, -24], [1, 0]], 600);
    ring('t3', at(hero.tip), 1.6, 380);
    if (!await waitMs(180, my)) return;
    const from = at(hero.tip);
    await Promise.all(events.filter((ev) => ev.kind === 'heal' || ev.kind === 'revive').map((ev) => {
      const target = heroCards[ev.hero];
      return shoot('qmote', from, at(target.fig), 240, unit() * 5).then(() => {
        if (!live(my)) return;
        const point = at(target.fig);
        if (ev.kind === 'revive') {
          flash('qbeam', point, [{ transform: 'scaleY(.1)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1, offset: 0.3 }, { transform: 'scaleY(1)', opacity: 0 }], { duration: 700 });
          float(target.fig, '复活！', 'heal');
        } else if (ev.amount) float(target.fig, `+${ev.amount}`, 'heal');
        for (let k = 0; k < 4; k += 1) {
          flash('qsparkle', { x: point.x + (Math.random() - 0.5) * point.w, y: point.y + point.h * 0.2 }, [
            { transform: 'translateY(0) scale(.5)', opacity: 0 },
            { transform: `translateY(${-point.h * 0.3}px) scale(1)`, opacity: 1, offset: 0.3 },
            { transform: `translateY(${-point.h * 0.8}px) scale(.6)`, opacity: 0 }
          ], { duration: 640 + k * 60, easing: 'ease-out' }, '✚');
        }
      });
    }));
    paintParty();
    await waitMs(220, my);
  }

  const ACTS = [warrior, mage, guardian, priest];
  async function heroAct(group, events, my) {
    const hero = heroCards[group.type];
    if (events.some((ev) => ev.kind === 'fizzle')) {
      float(hero.fig, '已倒下', 'dmg');
      await play(hero.card, [{ transform: 'translateX(0)' }, { transform: 'translateX(-4%)' }, { transform: 'translateX(4%)' }, { transform: 'translateX(0)' }], { duration: 300 });
      return;
    }
    await ACTS[group.type](events, group.run, my);
  }

  // ---- the board ----
  // Every cleared tile pops, throws a few sparks, and sends a mote to the hero it belongs to.
  function popCells(step) {
    const my = epoch, size = tiles[0].getBoundingClientRect().width;
    for (const group of step.groups) {
      const dest = at(heroCards[group.type].fig);
      group.cells.forEach(([r, c], k) => {
        const tile = tileAt(r, c), point = at(tile);
        tile.classList.add('pop');
        burst(point, `t${group.type}`, 5, size * 0.75);
        setTimeout(() => { if (live(my)) shoot(`qorb t${group.type}`, point, dest, 340, size); }, 60 + k * 22);
      });
      setTimeout(() => { if (live(my)) ring(`t${group.type}`, at(heroCards[group.type].fig), 1.3, 300); }, 420);
    }
  }
  // After a step the core has already let the columns fall: each tile is drawn at its new
  // place and slides down from where it was (new tiles come in from above the board).
  function dropBoard(cleared) {
    const gone = new Set(cleared.map(([r, c]) => `${r},${c}`));
    paintBoard();
    const pitch = tileAt(1, 0).getBoundingClientRect().top - tileAt(0, 0).getBoundingClientRect().top;
    for (let c = 0; c < QUEST.COLS; c += 1) {
      const kept = [];
      for (let r = 0; r < QUEST.ROWS; r += 1) if (!gone.has(`${r},${c}`)) kept.push(r);
      const fresh = QUEST.ROWS - kept.length;
      if (!fresh) continue;
      for (let r = 0; r < QUEST.ROWS; r += 1) {
        const fall = r < fresh ? fresh : r - kept[r - fresh];
        if (!fall) continue;
        animate(tileAt(r, c), [
          { transform: `translateY(${-fall * pitch}px)`, opacity: r < fresh ? 0.3 : 1 },
          { transform: 'translateY(0)', opacity: 1, offset: 0.78 },
          { transform: `translateY(${-pitch * 0.06}px)`, offset: 0.9 },
          { transform: 'translateY(0)' }
        ], { duration: 260 + fall * 55, easing: 'ease-in' });
      }
    }
  }
  // The two tiles slide into each other's place (and back again when the swap makes no match).
  async function slide(a, b, back) {
    const ta = tileAt(...a), tb = tileAt(...b), pa = at(ta), pb = at(tb);
    const dx = pb.x - pa.x, dy = pb.y - pa.y;
    const frames = (x, y) => (back
      ? [{ transform: 'translate(0,0)' }, { transform: `translate(${x * 0.45}px,${y * 0.45}px)` }, { transform: 'translate(0,0)' }]
      : [{ transform: 'translate(0,0)' }, { transform: `translate(${x}px,${y}px)` }]);
    const options = { duration: back ? 280 : 160, easing: 'ease-in-out', fill: 'forwards' };
    ta.style.zIndex = '2';
    const moves = [animate(ta, frames(dx, dy), options), animate(tb, frames(-dx, -dy), options)];
    await Promise.all(moves.map(done));
    ta.style.zIndex = '';
    return moves;
  }

  // ---- the enemies' answer ----
  function hurtHero(ev) {
    const view = heroCards[ev.hero];
    float(view.fig, ev.amount ? `-${ev.amount}` : '挡住', ev.amount ? 'dmg' : 'shield');
    if (ev.blocked) ring('t2', at(view.fig), 1.5, 360);
    if (ev.amount) {
      burst(at(view.fig), 'hurt', 6, unit() * 5);
      play(view.fig, [{ transform: 'translateX(0)', filter: 'none' }, { transform: 'translateX(-14%) rotate(-8deg)', filter: 'brightness(1.6) sepia(1) hue-rotate(-50deg) saturate(4)', offset: 0.25 }, { transform: 'translateX(0)', filter: 'none' }], { duration: 380, easing: 'ease-out' });
    }
  }
  async function foeAct(act, my) {
    const view = foeView(act.enemy), enemy = foeOf(act.enemy);
    const cast = act.events.find((ev) => ev.kind === 'cast');
    const hurts = act.events.filter((ev) => ev.kind === 'hurt');
    const heal = act.events.find((ev) => ev.kind === 'enemyHeal');
    if (cast || heal) say(`${enemy.name}：${(cast || heal).move}`);
    if (act.events.some((ev) => ev.kind === 'frozen')) {
      float(view?.body, '被冻住', 'ice');
      burst(at(view.body), 'ice', 6, unit() * 6);
      await play(view.body, [{ transform: 'translateX(0)' }, { transform: 'translateX(-3%)' }, { transform: 'translateX(3%)' }, { transform: 'translateX(0)' }], { duration: 420 });
      return waitMs(160, my);
    }
    if (!cast) {
      // 自我修复: a green glow, no attack.
      ring('t3 wide', at(view.body), 2.2, 520);
      play(view.body, [{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 520 });
      if (!await waitMs(260, my)) return false;
      if (heal?.amount) float(view.body, `+${heal.amount}`, 'heal');
      paintEnemies();
      return waitMs(380, my);
    }
    const victims = hurts.map((ev) => heroCards[ev.hero]);
    const from = at(view.body);
    if (cast.k === 'aoe') {
      play(view.body, [{ transform: 'translateY(0)' }, { transform: 'translateY(-18%) scale(1.1)', offset: 0.45 }, { transform: 'translateY(0)' }], { duration: 560, easing: 'ease-out' });
      swing(view.arm, [[0, 0], [0.45, 40], [0.7, -20], [1, 0]], 560);
      if (!await waitMs(260, my)) return false;
      const middle = at(partyRow);
      ring('wave', { x: from.x, y: from.y }, 1.2, 300);
      await shoot('qwave', from, { x: middle.x - middle.w * 0.2, y: from.y }, 260);
      if (!live(my)) return false;
      ring('wave', at(victims[0]?.fig ?? partyRow), 3, 420);
    } else if (cast.k === 'pierce') {
      play(view.body, [{ transform: 'translateX(0)' }, { transform: 'translateX(8%)', offset: 0.4 }, { transform: 'translateX(-6%)', offset: 0.6 }, { transform: 'translateX(0)' }], { duration: 520 });
      swing(view.arm, [[0, 0], [0.4, 30], [0.6, -34], [1, 0]], 520);
      if (!await waitMs(200, my)) return false;
      if (victims[0]) await shoot('qdark', from, at(victims[0].fig), 260, unit() * 3);
      if (!live(my)) return false;
    } else {
      // hit / drain: lunge at the victim.
      const target = victims[0] && at(victims[0].fig), card = at(view.card);
      const dx = target ? target.x - card.x + target.w * 0.9 : 0, dy = target ? target.y - from.y : 0;
      const lunge = animate(view.card, [
        { transform: 'translate(0,0)' },
        { transform: `translate(${unit() * 3}px,0)`, offset: 0.15 },
        { transform: `translate(${dx}px,${dy}px)`, offset: 0.42 },
        { transform: `translate(${dx}px,${dy}px)`, offset: 0.58 },
        { transform: 'translate(0,0)' }
      ], { duration: 640, easing: 'ease-in-out' });
      // Facing left, a forward blow is a counter-clockwise swing.
      swing(view.arm, [[0, 0], [0.3, 38], [0.46, -60], [0.62, -48], [1, 0]], 640);
      if (!await waitMs(290, my)) return false;
      if (victims[0]) flash('qslash foe', at(victims[0].fig), [{ transform: 'rotate(110deg) scale(.4)', opacity: 1 }, { transform: 'rotate(160deg) scale(1.1)', opacity: 0 }], { duration: 300 });
      for (const ev of hurts) hurtHero(ev);
      paintParty();
      await done(lunge);
      if (!live(my)) return false;
      if (heal?.amount) {
        await shoot('qdark drain', at(victims[0].fig), at(view.body), 300, unit() * 4);
        if (!live(my)) return false;
        float(view.body, `+${heal.amount}`, 'heal');
        paintEnemies();
      }
      return waitMs(160, my);
    }
    for (const ev of hurts) hurtHero(ev);
    paintParty();
    return waitMs(420, my);
  }

  // ---- turns ----
  const live = (my) => alive && my === epoch;
  const waitMs = (ms, my) => new Promise((resolve) => setTimeout(() => resolve(live(my)), ms));

  const castLine = (step) => {
    const parts = step.groups.map((g) => {
      const hero = HEROES[g.type];
      if (state.party[g.type].hp <= 0) return `${hero.name}已倒下`;
      return `${hero.name} ${hero.skill}${g.run >= 4 ? ` ${g.run} 连` : ''}`;
    });
    return `${step.combo > 1 ? `连锁 ×${step.combo} · ` : ''}${parts.join(' · ')}`;
  };

  async function playSwap(a, b) {
    if (busy || state.phase !== 'player') return;
    const my = epoch;
    busy = true;
    selected = null;
    clearHint();
    paintBoard();
    if (!swapTiles(state, a[0], a[1], b[0], b[1])) {
      say('这一步连不成三个，换个位置试试。');
      const moves = await slide(a, b, true);
      moves.forEach((move) => move?.cancel());
      if (live(my)) busy = false;
      return;
    }
    const moves = await slide(a, b, false);
    if (!live(my)) return;
    paintBoard();
    moves.forEach((move) => move?.cancel());
    for (let step = resolveStep(state); step; step = resolveStep(state)) {
      shownHp = new Map();
      say(castLine(step));
      popCells(step);
      if (step.combo > 1) banner(`连锁 ×${step.combo}`, 'combo', boardEl);
      const long = step.groups.find((g) => g.run >= 4);
      if (long) setTimeout(() => { if (live(my)) banner(`${long.run} 连！`, `t${long.type}`, scene); }, 200);
      if (!await waitMs(380, my)) return;
      dropBoard(step.cells);
      await Promise.all(step.groups.map((group, k) => waitMs(k * 200, my).then((ok) => ok && heroAct(group, step.events.filter((ev) => ev.by === group.type), my))));
      if (!live(my)) return;
      paintAll();
      if (!await waitMs(140, my)) return;
    }
    const result = finishMove(state);
    paintAll();
    if (result.reshuffled) say('没有可走的步了，棋盘已重排。');
    if (result.outcome === 'cleared') {
      say('本关胜利！');
      if (await waitMs(800, my)) showRewards();
    } else if (result.outcome === 'won') {
      if (await waitMs(900, my)) finish(true);
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
    if (!await waitMs(360, my)) return;
    for (let act = enemyStep(state); act; act = enemyStep(state)) {
      if (!await foeAct(act, my)) return;
      paintParty();
      paintEnemies();
    }
    paintAll();
    if (state.phase === 'lost') {
      say('全军覆没……');
      if (await waitMs(800, my)) finish(false);
      return;
    }
    setTurnLabel('你的回合');
    say(state.taunt > 0 ? '盾卫的嘲讽还在，敌人会盯着他打。' : '轮到你了。');
    busy = false;
  }

  // The wave walks in from the right; between stages the party marches on and the land scrolls by.
  function enterWave(my, march) {
    const width = scene.getBoundingClientRect().width;
    const entering = enemyCards.map((view, k) => animate(view.card, [
      { transform: `translateX(${width * 0.55}px)`, opacity: 0 },
      { transform: 'translateX(0)', opacity: 1 }
    ], { duration: 700, delay: (march ? 650 : 120) + k * 160, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' }));
    if (!march) return Promise.resolve();
    const from = travelled;
    travelled -= width * 0.9;
    layers.forEach((layer, k) => {
      const rate = [0.25, 0.55, 1][k];
      layer.style.backgroundPositionX = `${travelled * rate}px`;
      animate(layer, [{ backgroundPositionX: `${from * rate}px` }, { backgroundPositionX: `${travelled * rate}px` }], { duration: 1300, easing: 'ease-in-out' });
    });
    partyRow.classList.add('walking');
    return Promise.all([waitMs(1300, my), ...entering.map(done)]).then(() => { if (live(my)) partyRow.classList.remove('walking'); return live(my); });
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
  async function pickReward(id) {
    if (!chooseReward(state, id)) return;
    const my = epoch;
    overlay.hidden = true;
    fx.replaceChildren();
    buildEnemies();
    paintAll();
    setTurnLabel('前进中');
    const names = state.enemies.map((enemy) => enemy.name).join('、');
    say(`第 ${state.stage} 关：${names}${QUEST.BOSS_STAGES.includes(state.stage) ? '——首领！' : ''}`);
    if (!await enterWave(my, true)) return;
    setTurnLabel('你的回合');
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

  const opening = () => `第 1 关：${state.enemies.map((enemy) => enemy.name).join('、')}。点选两格相邻方块交换，也可以直接滑动；连成三个，同色的英雄就会出手。`;
  function restart() {
    epoch += 1;
    stopMotion();
    state = createQuest();
    busy = false;
    selected = null;
    drag = null;
    clearHint();
    overlay.hidden = true;
    partyRow.classList.remove('walking');
    buildEnemies();
    paintAll();
    setTurnLabel('你的回合');
    say(opening());
    enterWave(epoch, false);
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
  say(opening());
  enterWave(epoch, false);

  return {
    get state() { return state; },
    restart,
    hint,
    destroy() {
      alive = false;
      clearHint();
      stopMotion();
      wrap.replaceChildren();
    },
    debug: { cell: tileAt, best: () => best }
  };
}
