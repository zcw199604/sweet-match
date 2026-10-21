import test from 'node:test';
import assert from 'node:assert/strict';
import * as reversi from '../../reversi-core.js';
import * as draughts from '../../draughts-core.js';
import * as jungle from '../../jungle-core.js';
import * as gomoku from '../../gomoku-core.js';
import { createXiangqi, legalMoves as xiangqiMoves } from '../../xiangqi-core.js';
import { move } from '../../g2048-core.js';
import { chord, neighbours as mineNeighbours, reveal, toggleFlag } from '../../minesweeper-core.js';
import { adapters } from '../adapters/index.js';
import { rngFrom } from '../adapters/util.js';

const wire = (value) => JSON.parse(JSON.stringify(value));

// 每个回合制游戏：怎么从核心的合法着法得到「客户端会发的 action」，以及客户端怎么用 view 算落点。
const turnGames = {
  gomoku: { legal: (s) => gomoku.legalMoves(s).map(({ to }) => ({ to })), client: (v) => gomoku.legalMoves(v) },
  reversi: { legal: (s) => reversi.legalMoves(s).map(({ to }) => ({ to })), client: (v) => reversi.legalMoves(v) },
  draughts: { legal: (s) => wire(draughts.legalMoves(s)), client: (v) => draughts.legalMoves(v) },
  jungle: { legal: (s) => jungle.legalMoves(s).map(({ from, to }) => ({ from, to })), client: (v) => jungle.legalMoves(v) },
  xiangqi: { legal: (s) => xiangqiMoves(s).map(({ from, to }) => ({ from, to })), client: (v) => xiangqiMoves(createXiangqi({ fen: v.fen })) }
};

for (const [id, helper] of Object.entries(turnGames)) {
  test(`${id}: 随机对局里，只有轮到的座位能动；非法动作被拒；客户端凭 view 能算出和服务端一样的落点`, () => {
    const adapter = adapters[id], rng = rngFrom({ s: 99 });
    let state = adapter.init({ seed: 1 });
    let plies = 0;
    for (; plies < 400 && !adapter.result(state).over; plies++) {
      const actors = [0, 1].filter((seat) => adapter.canAct(state, seat));
      assert.equal(actors.length, 1, `第 ${plies} 手应当恰好有一个座位能动`);
      const seat = actors[0];

      const clientMoves = helper.client(wire(adapter.view(state, seat)));
      const serverMoves = helper.legal(state);
      assert.equal(clientMoves.length, serverMoves.length, '客户端和服务端的落点数量应一致');

      assert.equal(adapter.apply(state, seat, { from: 'zz', to: 'zz', path: 'bad', index: -1 }).ok, false);
      assert.equal(adapter.apply(state, seat, null).ok, false);

      const action = serverMoves[Math.floor(rng() * serverMoves.length)];
      const next = adapter.apply(state, seat, wire(action));
      assert.equal(next.ok, true, `${JSON.stringify(action)} 应当合法`);
      state = next.state;
    }
    assert.ok(plies > 4, '至少走了几手');
    const { over, winner } = adapter.result(state);
    if (over) assert.ok(winner === null || winner === 0 || winner === 1);
  });
}

test('xiangqi: 红方=座位0 先手，黑方不能抢着走', () => {
  const a = adapters.xiangqi, s = a.init({});
  assert.equal(a.canAct(s, 0), true);
  assert.equal(a.canAct(s, 1), false);
  assert.equal(a.apply(s, 0, { from: 'a3', to: 'a4' }).ok, true);
  assert.equal(a.canAct(s, 0), false);
  assert.equal(a.canAct(s, 1), true);
  assert.deepEqual(Object.keys(a.view(s, 1)).sort(), ['check', 'fen', 'lastMove', 'phase', 'plies', 'reason', 'turn', 'winner']);
});

test('draughts: view 不带越滚越大的 repetition 表', () => {
  const a = adapters.draughts;
  assert.equal('repetition' in a.view(a.init({}), 0), false);
});

// ---------- 2048 竞速 ----------
const dirs = ['left', 'down', 'right', 'up'];

test('g2048: 同一个种子，两人开局一样；选项被白名单过滤', () => {
  const a = adapters.g2048;
  const s = a.init({ seed: 7, target: 128 });
  assert.deepEqual(s.players[0], s.players[1]);
  assert.equal(s.target, 128);
  assert.equal(a.init({ seed: 7, target: '<script>' }).target, 1024);
  assert.equal(a.init({ seed: 7, target: 99999 }).target, 1024);
});

test('g2048: 两人同时可以动（没有回合），先到目标的赢，之后谁都不能动', () => {
  const a = adapters.g2048;
  let s = a.init({ seed: 7, target: 128 });
  assert.equal(a.canAct(s, 0) && a.canAct(s, 1), true);
  for (let i = 0; i < 2000 && !a.result(s).over; i++) {
    for (const seat of [0, 1]) {
      if (a.result(s).over) break;
      for (let k = 0; k < 4; k++) {
        const r = a.apply(s, seat, { type: 'move', dir: dirs[(i + k) % 4] });
        if (r.ok) { s = r.state; break; }
      }
    }
  }
  const result = a.result(s);
  assert.equal(result.over, true);
  assert.ok(['target', 'stuck'].includes(s.reason));
  if (s.reason === 'target') assert.ok(Math.max(...s.players[result.winner].game.tiles.map((t) => t.v)) >= 128);
  assert.equal(a.canAct(s, 0) || a.canAct(s, 1), false);
});

test('g2048: 不许撤销/乱方向；动一个人的盘不影响另一个；view 不发撤销历史', () => {
  const a = adapters.g2048, s = a.init({ seed: 3, target: 512 });
  assert.equal(a.apply(s, 0, { type: 'undo' }).ok, false);
  assert.equal(a.apply(s, 0, { type: 'move', dir: 'sideways' }).ok, false);
  const moved = dirs.map((d) => a.apply(s, 0, { type: 'move', dir: d })).find((r) => r.ok);
  assert.deepEqual(moved.state.players[1], s.players[1]);
  assert.equal(moved.state.players[0].game.moves, 1);
  const text = JSON.stringify(a.view(moved.state, 1));
  for (const secret of ['history', 'seed', 'undosLeft']) assert.equal(text.includes(secret), false, secret);
  assert.equal(a.view(moved.state, 1).players.length, 2);
});

test('g2048: 客户端拿 view 里的盘面和随机状态在本地连走几步，结果和服务端一模一样（包括新块）', () => {
  const a = adapters.g2048;
  let s = a.init({ seed: 7, target: 2048 });
  const mine = wire(a.view(s, 0)).players[0];
  const local = { tiles: mine.tiles, nextId: mine.nextId, score: mine.score, moves: mine.moves, won: false, over: mine.over, undosLeft: 0, history: [] };
  const box = { s: mine.rng };
  for (let i = 0; i < 30; i++) {
    const dir = dirs.find((d) => move(structuredClone(local), d, () => 0).ok);
    if (!dir) break;
    move(local, dir, rngFrom(box));
    s = a.apply(s, 0, { type: 'move', dir }).state;
  }
  const server = wire(a.view(s, 0)).players[0];
  assert.ok(server.moves > 5);
  assert.deepEqual([local.tiles, local.nextId, local.score, local.moves, local.over, box.s], [server.tiles, server.nextId, server.score, server.moves, server.over, server.rng]);
});

test('g2048: 一方无路可走就停手，另一方可以继续', () => {
  const a = adapters.g2048, s = a.init({ seed: 1, target: 2048 });
  s.players[1].game.over = true;
  assert.equal(a.canAct(s, 1), false);
  assert.equal(a.canAct(s, 0), true);
  assert.doesNotMatch(a.cantAct(s, 1), /轮到/);
});

// ---------- 扫雷竞速 ----------
const mineIndexes = (board) => board.cells.flatMap((c, i) => (c.mine ? [i] : []));

test('minesweeper: 两人雷区完全一样，起手中心格已翻开；不同种子雷区不同', () => {
  const a = adapters.minesweeper, s = a.init({ seed: 5, level: 'easy' });
  assert.deepEqual(mineIndexes(s.players[0]), mineIndexes(s.players[1]));
  assert.equal(mineIndexes(s.players[0]).length, 10);
  const center = 4 * 9 + 4;
  assert.equal(s.players[0].cells[center].open && s.players[1].cells[center].open, true);
  assert.notDeepEqual(mineIndexes(a.init({ seed: 5000, level: 'easy' }).players[0]), mineIndexes(s.players[0]));
  assert.equal(a.init({ seed: 5, level: 'nope' }).level, 'normal');
});

test('minesweeper: 竞速 view 发自己整块雷区（含雷）和 acts，对手只给进度；合作不发未翻开格子的雷和数字', () => {
  const a = adapters.minesweeper, s = a.init({ seed: 5, level: 'easy' });
  const v = wire(a.view(s, 0));
  assert.deepEqual(v.cells, wire(s.players[0].cells));
  assert.equal(v.cells.filter((c) => c.mine).length, 10);
  assert.equal(v.me.acts, 0);
  assert.deepEqual(Object.keys(v.rival).sort(), ['flags', 'lost', 'opened', 'total']);
  const coop = a.view(a.init({ seed: 5, level: 'easy', mode: 'coop' }), 0);
  for (const cell of coop.cells) if (!cell.open) assert.deepEqual([cell.mine, cell.adjacent], [false, 0]);
  assert.equal(coop.cells.some((c) => c.mine), false);
});

test('minesweeper 竞速：客户端拿 view 在本地连点（插旗/翻开/快开），结果和服务端一模一样，acts 逐一累加', () => {
  const a = adapters.minesweeper;
  let s = a.init({ seed: 9, level: 'normal' });
  const v = wire(a.view(s, 0));
  const local = { rows: v.rows, cols: v.cols, mines: v.mines, cells: v.cells, exploded: v.exploded, started: true, phase: 'playing' };
  const play = (type, index) => {
    assert.equal({ flag: toggleFlag, reveal, chord }[type](local, index), true, `${type} ${index}`);
    s = a.apply(s, 0, { type, index }).state;
  };
  const near = (i) => mineNeighbours(local, i);
  // 把挨着已翻开数字的雷都插上旗，再对这些数字快开；最后翻几个安全格
  for (let i = 0; i < local.cells.length; i++) {
    const c = local.cells[i];
    if (!c.open || !c.adjacent) continue;
    for (const j of near(i)) if (local.cells[j].mine && !local.cells[j].flagged) play('flag', j);
    if (near(i).some((j) => !local.cells[j].open && !local.cells[j].flagged)) play('chord', i);
  }
  for (let i = 0, n = 0; i < local.cells.length && n < 3; i++) if (!local.cells[i].open && !local.cells[i].mine && !local.cells[i].flagged) { play('reveal', i); n++; }
  const server = wire(a.view(s, 0));
  assert.ok(server.me.acts > 5);
  assert.deepEqual(local.cells, server.cells);
});

test('minesweeper: 踩雷立刻判负，之后雷全部公开', () => {
  const a = adapters.minesweeper, s = a.init({ seed: 5, level: 'easy' });
  const mine = mineIndexes(s.players[1])[0];
  const r = a.apply(s, 1, { type: 'reveal', index: mine });
  assert.equal(r.ok, true);
  assert.deepEqual(a.result(r.state), { over: true, winner: 0 });
  assert.equal(r.state.reason, 'mine');
  assert.equal(a.view(r.state, 0).cells.filter((c) => c.mine).length, 10);
  assert.equal(a.canAct(r.state, 0), false);
});

test('minesweeper: 先扫完安全格的人赢；对手的盘面不受影响', () => {
  const a = adapters.minesweeper;
  let s = a.init({ seed: 5, level: 'easy' });
  const before = JSON.stringify(s.players[1]);
  for (let i = 0; i < s.players[0].cells.length && !a.result(s).over; i++) {
    const cell = s.players[0].cells[i];
    if (cell.mine || cell.open) continue;
    const r = a.apply(s, 0, { type: 'reveal', index: i });
    assert.equal(r.ok, true);
    s = r.state;
  }
  assert.deepEqual(a.result(s), { over: true, winner: 0 });
  assert.equal(s.reason, 'cleared');
  assert.equal(JSON.stringify(s.players[1]), before);
});

test('minesweeper: 非法格子/操作被拒；插旗可以来回切换', () => {
  const a = adapters.minesweeper, s = a.init({ seed: 5, level: 'easy' });
  for (const action of [{ type: 'reveal', index: -1 }, { type: 'reveal', index: 81 }, { type: 'reveal', index: 1.5 }, { type: 'reveal', index: '3' }, { type: 'boom', index: 0 }, {}, null]) {
    assert.equal(a.apply(s, 0, action).ok, false, JSON.stringify(action));
  }
  const closed = s.players[0].cells.findIndex((c) => !c.open);
  const flagged = a.apply(s, 0, { type: 'flag', index: closed });
  assert.equal(a.view(flagged.state, 0).cells[closed].flagged, true);
  assert.equal(a.view(a.apply(flagged.state, 0, { type: 'flag', index: closed }).state, 0).cells[closed].flagged, false);
  assert.equal(a.apply(s, 0, { type: 'reveal', index: s.players[0].cells.findIndex((c) => c.open) }).ok, false, '已翻开的格子不能再翻');
});

test('minesweeper: 开局展开的范围有上限，竞速不会一开局就扫掉大半张图', () => {
  const a = adapters.minesweeper;
  for (const level of ['easy', 'normal', 'hard']) {
    for (let seed = 1; seed <= 60; seed++) {
      const board = a.init({ seed, level }).players[0];
      const opened = board.cells.filter((c) => c.open).length;
      assert.ok(opened / (board.cells.length - board.mines) <= 0.25, `${level} seed ${seed} 开局翻开了 ${opened} 格`);
    }
  }
});

// ---------- 扫雷合作（轮流点同一块） ----------
test('minesweeper 合作：共用一块雷区，轮流翻格，插旗不占回合，没轮到的人翻不了', () => {
  const a = adapters.minesweeper, s = a.init({ seed: 6, level: 'easy', mode: 'coop' });
  assert.equal(s.mode, 'coop');
  assert.equal(a.init({ seed: 6, level: 'easy', mode: 'boom' }).mode, 'race', '乱传的玩法回落到竞速');
  const first = s.turn, other = 1 - first;
  const safe = s.board.cells.findIndex((c) => !c.open && !c.mine);
  assert.match(a.apply(s, other, { type: 'reveal', index: safe }).message, /轮到/);
  const closed = s.board.cells.findIndex((c, i) => !c.open && i !== safe);
  const flagged = a.apply(s, other, { type: 'flag', index: closed });
  assert.equal(flagged.ok, true);
  assert.equal(flagged.state.turn, first, '插旗不换人');
  const r = a.apply(flagged.state, first, { type: 'reveal', index: safe });
  assert.equal(r.ok, true);
  assert.equal(r.state.turn, other, '翻开一格后换人');
  for (const seat of [0, 1]) {
    const v = a.view(r.state, seat);
    assert.equal(v.cells[safe].open, true, '两人看到的是同一块盘面');
    assert.equal(v.cells[closed].flagged, true);
    assert.equal(v.cells.some((c) => c.mine), false, '没结束前看不到雷');
    assert.equal(v.turn, other);
  }
  assert.equal(JSON.stringify(a.view(r.state, 0)).includes('seed'), false);
});

test('minesweeper 合作：一起扫完一起赢；谁踩雷都一起输，并记下是谁踩的', () => {
  const a = adapters.minesweeper;
  let s = a.init({ seed: 6, level: 'easy', mode: 'coop' });
  const boom = a.apply(s, s.turn, { type: 'reveal', index: mineIndexes(s.board)[0] });
  assert.deepEqual(a.result(boom.state), { over: true, winner: null });
  assert.equal(boom.state.reason, 'mine');
  assert.equal(boom.state.by, s.turn);
  assert.equal(a.view(boom.state, 1 - s.turn).cells.filter((c) => c.mine).length, 10, '结束后两人都能看到所有雷');
  for (let i = 0; i < s.board.cells.length && !a.result(s).over; i++) {
    const cell = s.board.cells[i];
    if (cell.mine || cell.open) continue;
    const r = a.apply(s, s.turn, { type: 'reveal', index: i });
    assert.equal(r.ok, true);
    s = r.state;
  }
  assert.deepEqual(a.result(s), { over: true, winner: null });
  assert.equal(s.reason, 'cleared');
  assert.equal(a.teamGame(s), true);
  assert.equal(a.teamGame(a.init({ seed: 6 })), false, '竞速有人离开仍判对方赢');
});

test('minesweeper 合作：先手由种子决定，两人都有机会先手', () => {
  const turns = new Set([1, 2, 3, 4].map((seed) => adapters.minesweeper.init({ seed, mode: 'coop' }).turn));
  assert.deepEqual([...turns].sort(), [0, 1]);
});
