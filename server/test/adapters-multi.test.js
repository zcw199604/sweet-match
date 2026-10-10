import test from 'node:test';
import assert from 'node:assert/strict';
import { legalMoves as junqiMoves } from '../../junqi-core.js';
import { suggestedMove } from '../../doudizhu-core.js';
import { previewAeroplane } from '../../aeroplane-core.js';
import { adapters } from '../adapters/index.js';
import { rngFrom } from '../adapters/util.js';

const wire = (value) => JSON.parse(JSON.stringify(value));

// ---------- 军棋翻棋版 ----------
test('junqi: 暗棋的身份和阵营不进 view；客户端凭 view 算出的落点和服务端一致', () => {
  const a = adapters.junqi, rng = rngFrom({ s: 5 });
  let state = a.init({ seed: 11 });
  for (let plies = 0; plies < 300 && !a.result(state).over; plies++) {
    const actors = [0, 1].filter((seat) => a.canAct(state, seat));
    assert.equal(actors.length, 1);
    const seat = actors[0], view = wire(a.view(state, seat));
    view.board.forEach((piece, at) => {
      if (piece && !piece.revealed) assert.deepEqual(piece, { revealed: false }, `第 ${at} 格的暗棋只能说「没翻开」`);
    });
    assert.equal(JSON.stringify(view).includes('"kind":"flag"') && !state.board.some((p) => p?.kind === 'flag' && p.revealed), false);
    const options = [];
    state.board.forEach((piece, at) => {
      if (piece && !piece.revealed) options.push({ type: 'flip', at });
      for (const to of junqiMoves(state, at)) options.push({ type: 'move', from: at, to });
    });
    assert.equal(junqiMoves(view, 0).length >= 0, true);
    for (let at = 0; at < 60; at++) assert.deepEqual(junqiMoves(view, at), junqiMoves(state, at), `第 ${at} 格的落点`);
    const next = a.apply(state, seat, options[Math.floor(rng() * options.length)]);
    assert.equal(next.ok, true);
    state = next.state;
  }
});

test('junqi: 非法操作被拒；多余字段不会混进 state.last；不是自己的回合不能动', () => {
  const a = adapters.junqi, state = a.init({ seed: 3 });
  assert.equal(a.canAct(state, 0), true);
  assert.equal(a.canAct(state, 1), false);
  assert.equal(a.apply(state, 0, null).ok, false);
  assert.equal(a.apply(state, 0, { type: 'flip', at: 'x' }).ok, false);
  assert.equal(a.apply(state, 0, { type: 'move', from: 0, to: 1 }).ok, false);
  const at = state.board.findIndex(Boolean);
  const next = a.apply(state, 0, { type: 'flip', at, secret: 'x'.repeat(1000) });
  assert.equal(next.ok, true);
  assert.deepEqual(next.state.last, { type: 'flip', at });
  assert.equal(a.canAct(next.state, 0), false);
  assert.equal(a.canAct(next.state, 1), true);
});

test('junqi: 同一个种子开局一样，不同种子不同', () => {
  const a = adapters.junqi, kinds = (s) => s.board.map((p) => p && `${p.side}${p.kind}`).join();
  assert.equal(kinds(a.init({ seed: 1 })), kinds(a.init({ seed: 1 })));
  assert.notEqual(kinds(a.init({ seed: 1 })), kinds(a.init({ seed: 2 })));
});

// ---------- 斗地主 ----------
// 真人座位按核心给的推荐走（叫分用 aiStep 同款规则太绕，直接叫 3 分），电脑座位走 auto。
function humanMove(adapter, state, seat) {
  const g = state.game;
  if (g.phase === 'bidding') return { type: 'bid', score: g.highBid < 3 ? g.highBid + 1 : 0 };
  const move = suggestedMove(g, seat);
  return move ? { type: 'play', cards: move.cards } : { type: 'pass' };
}
function playOut(adapter, state, limit = 600) {
  for (let i = 0; i < limit && !adapter.result(state).over; i++) {
    const seat = [0, 1, 2].find((s) => adapter.canAct(state, s));
    if (seat !== undefined) {
      const next = adapter.apply(state, seat, humanMove(adapter, state, seat));
      assert.equal(next.ok, true, next.message);
      state = next.state;
    } else {
      const next = adapter.auto(state);
      assert.ok(next?.ok, '没有真人能动时，电脑必须有一步可走');
      state = next.state;
    }
  }
  return state;
}

test('doudizhu: 2 人局补 1 个电脑，打得完，赢家是座位；选项被白名单过滤', () => {
  const a = adapters.doudizhu;
  assert.equal(a.seatCount({ humans: 2 }), 2);
  assert.equal(a.seatCount({ humans: 3 }), 3);
  assert.equal(a.seatCount({ humans: 99 }), 2);
  assert.equal(a.seatCount({ humans: { $gt: 1 } }), 2);
  assert.equal(a.seatCount(undefined), 2);
  const state = playOut(a, a.init({ seed: 9, humans: 2 }));
  assert.equal(a.result(state).over, true);
  assert.ok([0, 1, 2].includes(a.result(state).winner));
  assert.equal([0, 1, 2].some((s) => a.canAct(state, s)), false);
});

test('doudizhu: 3 人局没有电脑，auto 不会替真人出牌', () => {
  const a = adapters.doudizhu, state = a.init({ seed: 4, humans: 3 });
  assert.equal(a.auto(state), null);
  assert.equal(playOut(a, state) !== null, true);
});

test('doudizhu: 视角旋转，自己永远是 players[0]；别人的手牌、底牌（叫分时）、随机数不外泄', () => {
  const a = adapters.doudizhu, state = a.init({ seed: 21, humans: 3 }), g = state.game;
  for (const seat of [0, 1, 2]) {
    const v = wire(a.view(state, seat));
    assert.deepEqual(v.players[0].cards, g.players[seat].cards);
    assert.equal(v.players[0].name, '你');
    assert.equal(v.current, (g.current - seat + 3) % 3);
    for (const k of [1, 2]) {
      assert.deepEqual(v.players[k].cards, [], '别人的手牌不发');
      assert.equal(v.players[k].count, 17);
    }
    assert.deepEqual(v.bottom, [null, null, null], '叫分时底牌是暗的');
    const text = JSON.stringify(v);
    for (const id of g.players.flatMap((p, i) => (i === seat ? [] : p.cards))) assert.equal(text.includes(`[${id},`) || text.includes(`,${id},`) || text.includes(`,${id}]`), false, `牌 ${id} 泄漏了`);
    assert.equal(text.includes('rng'), false);
  }
  // 叫完分成为地主后：底牌公开，地主手里多 3 张
  let s = state;
  s = a.apply(s, 0, { type: 'bid', score: 3 }).state;
  const v1 = wire(a.view(s, 1));
  assert.equal(v1.bottom.every((id) => Number.isInteger(id)), true);
  assert.equal(v1.landlord, (0 - 1 + 3) % 3);
  assert.equal(v1.players[2].count, 20, '0 号座位是 1 号座位的上家 → players[2]');
  assert.match(v1.message, /玩家 1/);
  assert.equal(wire(a.view(s, 0)).message.includes('玩家 1'), false, '自己的名字换成「你」');
});

test('doudizhu: 非法操作被拒且不改状态；只有轮到的座位能动', () => {
  const a = adapters.doudizhu, state = a.init({ seed: 2, humans: 3 });
  const before = JSON.stringify(state.game.players), mine = state.game.players[0].cards;
  assert.equal(a.canAct(state, 0), true);
  assert.equal(a.canAct(state, 1), false);
  for (const bad of [null, {}, { type: 'bid', score: 9 }, { type: 'bid', score: '3' }, { type: 'play', cards: mine }, { type: 'pass' }, { type: 'bid', score: -1 }]) {
    assert.equal(a.apply(state, 0, bad).ok, false, JSON.stringify(bad));
  }
  assert.equal(JSON.stringify(state.game.players), before);
  a.apply(state, 0, { type: 'bid', score: 3 });
  assert.equal(a.apply(state, 0, { type: 'play', cards: ['x'] }).ok, false);
  assert.equal(a.apply(state, 0, { type: 'play', cards: [mine[0], mine[0]] }).ok, false);
  assert.equal(a.apply(state, 0, { type: 'play', cards: [99] }).ok, false, '不在手里的牌');
});

test('doudizhu: 都不叫就重新发牌，名字不会回到本地版的「你/泡泡/噗噗」', () => {
  const a = adapters.doudizhu;
  let state = a.init({ seed: 5, humans: 3 });
  for (const seat of [0, 1, 2]) state = a.apply(state, seat, { type: 'bid', score: 0 }).state;
  assert.equal(state.game.phase, 'bidding');
  assert.equal(state.game.bidCount, 0);
  assert.deepEqual(state.game.players.map((p) => p.name), ['玩家 1', '玩家 2', '玩家 3']);
  assert.match(state.game.message, /重新发牌/);
});

// ---------- 飞行棋 ----------
function flyOut(adapter, state, rng, limit = 4000) {
  for (let i = 0; i < limit && !adapter.result(state).over; i++) {
    const seat = [0, 1, 2, 3].find((s) => adapter.canAct(state, s));
    let next;
    if (seat === undefined) next = adapter.auto(state);
    else if (state.game.phase === 'roll') next = adapter.apply(state, seat, { type: 'roll' });
    else next = adapter.apply(state, seat, { type: 'move', plane: state.game.legal[Math.floor(rng() * state.game.legal.length)] });
    assert.ok(next?.ok, `第 ${i} 步卡住了：${next?.message}`);
    state = next.state;
  }
  return state;
}

test('aeroplane: 座位数按选项来；2 人坐红、绿，电脑补黄、蓝；打得完', () => {
  const a = adapters.aeroplane;
  assert.deepEqual([2, 3, 4, 'x', undefined].map((humans) => a.seatCount({ humans })), [2, 3, 4, 2, 2]);
  const state = a.init({ seed: 8, humans: 2 });
  assert.deepEqual(wire(a.view(state, 0)).teams, [0, null, 1, null]);
  assert.equal(a.view(state, 1).team, 2);
  const done = flyOut(a, state, rngFrom({ s: 3 }));
  assert.equal(a.result(done).over, true);
  assert.equal(done.game.planes[done.game.winner].every((p) => p === 57), true);
});

test('aeroplane: 电脑队的回合真人不能动；真人回合 auto 不动；轮到谁就只有谁能掷骰', () => {
  const a = adapters.aeroplane;
  let state = a.init({ seed: 1, humans: 2 });
  assert.equal(a.canAct(state, 0), true);
  assert.equal(a.canAct(state, 1), false);
  assert.equal(a.auto(state), null, '红队是真人');
  state.game.turn = 1;   // 黄队是电脑
  assert.equal(a.canAct(state, 0) || a.canAct(state, 1), false);
  const stepped = a.auto(state);
  assert.ok(stepped.ok);
  assert.notEqual(JSON.stringify(stepped.state.game), JSON.stringify(state.game), 'auto 没有原地改传入的状态');
});

test('aeroplane: 掷骰结果由服务端决定（同种子同结果），非法动作被拒', () => {
  const a = adapters.aeroplane;
  const s1 = a.apply(a.init({ seed: 77, humans: 2 }), 0, { type: 'roll' }).state;
  const s2 = a.apply(a.init({ seed: 77, humans: 2 }), 0, { type: 'roll' }).state;
  assert.equal(s1.game.dice, s2.game.dice);
  const state = a.init({ seed: 77, humans: 2 });
  assert.equal(a.apply(state, 0, { type: 'move', plane: 0 }).ok, false, '还没掷骰');
  assert.equal(a.apply(state, 0, { dice: 6 }).ok, false);
  assert.equal(a.apply(state, 0, null).ok, false);
  let rolled = state;
  while (rolled.game.phase !== 'move') rolled = a.apply(rolled, rolled.game.turn === 0 ? 0 : 1, { type: 'roll' }).state;
  assert.equal(a.apply(rolled, 0, { type: 'roll' }).ok, false, '已经掷过了');
  assert.equal(a.apply(rolled, 0, { type: 'move', plane: 99 }).ok, false);
  assert.equal(a.apply(rolled, 0, { type: 'move', plane: 'a' }).ok, false);
  const view = wire(a.view(rolled, rolled.game.turn === 0 ? 0 : 1));
  assert.ok(previewAeroplane(view, view.legal[0]), '客户端凭 view 能预览路线');
  assert.equal(JSON.stringify(view).includes('rng'), false);
});
