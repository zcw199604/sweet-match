import test from 'node:test';
import assert from 'node:assert/strict';
import { Session, SERVER_DEFAULT, friendlyError, hasResume, isCode, normalizeCode, randomKey, resolveServerUrl, shareUrl } from '../net-session.js';
import { ONLINE_GAMES, isOnlineGame } from '../online-games.js';

// ---- 假的 SDK：记录调用，由测试决定什么时候推消息、什么时候断线 ----
function fakeSdk({ failReconnect = 0 } = {}) {
  const log = { created: [], joined: [], reconnected: [], rooms: [] };
  let failures = failReconnect;
  class FakeRoom {
    constructor() {
      this.reconnectionToken = `tok-${log.rooms.length + 1}`;
      this.handlers = {}; this.dropHandlers = []; this.sent = []; this.leftWith = undefined;
      log.rooms.push(this);
    }
    onMessage(type, fn) { this.handlers[type] = fn; }
    onLeave(fn) { this.dropHandlers.push(fn); }
    send(type, message) { this.sent.push([type, message]); }
    async leave(consented) { this.leftWith = consented; }
    push(type, message) { this.handlers[type](message); }
    drop(code = 1006) { this.dropHandlers.forEach((fn) => fn(code)); }
  }
  class Client {
    constructor(url) { this.url = url; }
    async create(game, options) { log.created.push({ url: this.url, game, options }); return new FakeRoom(); }
    async join(game, options) { log.joined.push({ game, options }); return new FakeRoom(); }
    async reconnect(token) {
      log.reconnected.push(token);
      if (failures > 0) { failures -= 1; throw new Error('no'); }
      return new FakeRoom();
    }
  }
  return { sdk: { Client }, log };
}
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k), m }; };
const make = (extra = {}, sdkOptions) => {
  const { sdk, log } = fakeSdk(sdkOptions);
  const storage = memory();
  const session = new Session({ sdk, url: 'ws://x', game: 'gomoku', storage, wait: async () => {}, ...extra });
  return { session, log, storage };
};
const statePayload = (extra = {}) => ({ game: 'gomoku', code: 'ABCD2', version: 0, seat: 0, seats: ['online', 'empty'], view: { turn: 1 }, result: { over: false, winner: null }, ...extra });

test('resolveServerUrl: 线上页面只连线上服务；本机/局域网可以用 ?net= 或本机存储覆盖', () => {
  assert.equal(resolveServerUrl({ hostname: 'game.zcw.work' }), SERVER_DEFAULT);
  assert.equal(resolveServerUrl({ hostname: 'game.zcw.work', search: '?net=wss://evil.example' }), SERVER_DEFAULT, '线上页面不接受 ?net=');
  assert.equal(resolveServerUrl({ hostname: 'game.zcw.work', stored: 'wss://evil.example' }), SERVER_DEFAULT);
  assert.equal(resolveServerUrl({ hostname: 'localhost' }), 'ws://localhost:2567');
  assert.equal(resolveServerUrl({ hostname: '192.168.1.8' }), 'ws://192.168.1.8:2567');
  assert.equal(resolveServerUrl({ hostname: '127.0.0.1', search: '?net=ws://127.0.0.1:3001' }), 'ws://127.0.0.1:3001');
  assert.equal(resolveServerUrl({ hostname: 'localhost', stored: 'wss://wss-game.zcw.work' }), 'wss://wss-game.zcw.work');
  assert.equal(resolveServerUrl({ hostname: 'localhost', search: '?net=javascript:alert(1)' }), 'ws://localhost:2567', '只认 ws/wss');
});

test('房间码：规整大小写和空格，只接受服务端字母表里的 5 位', () => {
  assert.equal(normalizeCode(' ab-cd2 '), 'ABCD2');
  assert.equal(normalizeCode(null), '');
  assert.equal(isCode('ABCD2'), true);
  for (const bad of ['ABCD', 'ABCD22', 'ABCD0', 'ABCDI', 'ABCDO', 'ABCD1', 'abcd2', '']) assert.equal(isCode(bad), false, bad);
  assert.equal(shareUrl('https://game.zcw.work', 'xiangqi', 'ABCD2'), 'https://game.zcw.work/?game=xiangqi&room=ABCD2');
});

test('randomKey：24 位十六进制，每次不同', () => {
  const a = randomKey(), b = randomKey();
  assert.match(a, /^[0-9a-f]{24}$/);
  assert.notEqual(a, b);
});

test('ONLINE_GAMES：每个游戏都有座位称呼和挂载入口；选项有默认值', () => {
  assert.deepEqual(Object.keys(ONLINE_GAMES).sort(), ['draughts', 'g2048', 'gomoku', 'jungle', 'minesweeper', 'reversi', 'xiangqi']);
  for (const [id, cfg] of Object.entries(ONLINE_GAMES)) {
    assert.equal(cfg.seats.length, 2, id);
    assert.equal(typeof cfg.load, 'function', id);
    assert.equal(typeof cfg.mount, 'string', id);
    for (const option of cfg.options ?? []) assert.ok(option.choices.some(([value]) => value === option.fallback), `${id}.${option.key} 的默认值要在选项里`);
  }
  assert.equal(isOnlineGame('gomoku'), true);
  assert.equal(isOnlineGame('toString'), false, '不能被原型链上的名字蒙混');
  assert.equal(isOnlineGame('pop2'), false);
});

test('create：带创建者密钥和选项，注册完 handler 就发 sync，状态推进到 getter', async () => {
  const { session, log } = make();
  const events = [];
  session.on('state', (p) => events.push(p.version));
  await session.create({ target: 512 });
  assert.equal(log.created[0].game, 'gomoku');
  assert.equal(log.created[0].options.target, 512);
  assert.match(log.created[0].options.hostKey, /^[0-9a-f]{24}$/);
  const room = log.rooms[0];
  assert.deepEqual(room.sent, [['sync', undefined]]);
  assert.equal(session.status, 'live');
  assert.equal(session.state, null, '服务端还没推状态之前没有状态');
  room.push('state', statePayload());
  room.push('state', statePayload({ version: 1, seats: ['online', 'online'] }));
  assert.deepEqual(events, [0, 1]);
  assert.deepEqual([session.seat, session.code, session.full, session.view], [0, 'ABCD2', true, { turn: 1 }]);
});

test('join：房间码规整后再发', async () => {
  const { session, log } = make();
  await session.join(' ab cd2 ');
  assert.deepEqual(log.joined[0], { game: 'gomoku', options: { code: 'ABCD2' } });
});

test('send：连通时发 action；断线重连期间告诉玩家而不是悄悄吞掉', async () => {
  const { session, log } = make({ wait: () => new Promise(() => {}) });   // 重连等待永不结束，停在 reconnecting
  const rejects = [];
  session.on('reject', (m) => rejects.push(m));
  await session.create();
  session.send({ to: 5 });
  assert.deepEqual(log.rooms[0].sent.at(-1), ['action', { to: 5 }]);
  log.rooms[0].drop();
  assert.equal(session.status, 'reconnecting');
  session.send({ to: 6 });
  assert.equal(log.rooms[0].sent.length, 2, '没有再发出去');
  assert.match(rejects[0], /重连/);
});

test('服务端的 reject 原样转给界面', async () => {
  const { session, log } = make();
  const rejects = [];
  session.on('reject', (m) => rejects.push(m));
  await session.create();
  log.rooms[0].push('reject', { message: '还没轮到你' });
  assert.deepEqual(rejects, ['还没轮到你']);
});

test('掉线后自动重连：用原来的令牌，换新的连接，重新 sync，之后的状态照常到', async () => {
  const { session, log } = make({}, { failReconnect: 2 });
  const states = [];
  const statuses = [];
  session.on('state', (p) => states.push(p.version));
  session.on('status', (s) => statuses.push(s));
  await session.create();
  log.rooms[0].push('state', statePayload());
  log.rooms[0].drop(1006);
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual(log.reconnected, ['tok-1', 'tok-1', 'tok-1'], '前两次失败，第三次成功，都用掉线那个连接的令牌');
  assert.deepEqual(statuses, ['live', 'reconnecting', 'live']);
  const fresh = log.rooms[1];
  assert.deepEqual(fresh.sent, [['sync', undefined]]);
  fresh.push('state', statePayload({ version: 4 }));
  assert.deepEqual(states, [0, 4]);
  fresh.drop(1006);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(log.reconnected.at(-1), 'tok-2', '第二次掉线用的是新连接的令牌');
});

test('重连一直失败 → 关闭，原因是 lost，并清掉本机记录', async () => {
  const { session, log, storage } = make({}, { failReconnect: 99 });
  await session.create();
  assert.ok(storage.m.size === 1);
  log.rooms[0].drop(1006);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(log.reconnected.length, 6);
  assert.deepEqual([session.status, session.closeReason], ['closed', 'lost']);
  assert.equal(storage.m.size, 0);
});

test('服务端以「主动退出」关闭码断开 → 直接关闭，不重连', async () => {
  const { session, log } = make();
  await session.create();
  log.rooms[0].drop(4000);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(log.reconnected.length, 0);
  assert.deepEqual([session.status, session.closeReason], ['closed', 'left']);
});

test('leave：以主动退出离开，清掉记录，之后即使收到断线通知也不重连', async () => {
  const { session, log, storage } = make();
  await session.create();
  await session.leave();
  assert.equal(log.rooms[0].leftWith, true);
  assert.equal(storage.m.size, 0);
  log.rooms[0].drop(1000);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(log.reconnected.length, 0);
  assert.deepEqual([session.status, session.closeReason], ['closed', 'left']);
});

test('suspend + resume：离开页面不放弃座位，回来用令牌接着玩；别的游戏的记录不会被误用', async () => {
  const first = make();
  await first.session.create();
  first.log.rooms[0].push('state', statePayload());
  await first.session.suspend();
  assert.equal(first.log.rooms[0].leftWith, false);
  assert.equal(hasResume(first.storage, 'gomoku'), true);
  assert.equal(hasResume(first.storage, 'xiangqi'), false);

  const { sdk, log } = fakeSdk();
  const back = new Session({ sdk, url: 'ws://x', game: 'gomoku', storage: first.storage, wait: async () => {} });
  assert.equal(await back.resume(), true);
  assert.deepEqual(log.reconnected, ['tok-1']);
  assert.equal(back.status, 'live');

  const other = new Session({ sdk, url: 'ws://x', game: 'xiangqi', storage: first.storage, wait: async () => {} });
  assert.equal(await other.resume(), false);
  assert.equal(log.reconnected.length, 1, '别的游戏根本不会去重连');
});

test('resume：座位已经没了（服务端拒绝）→ 返回 false，并清掉记录', async () => {
  const storage = memory();
  storage.setItem('pao-net-room', JSON.stringify({ game: 'gomoku', token: 'old' }));
  const { sdk } = fakeSdk({ failReconnect: 1 });
  const session = new Session({ sdk, url: 'ws://x', game: 'gomoku', storage, wait: async () => {} });
  assert.equal(await session.resume(), false);
  assert.equal(storage.m.size, 0);
  assert.equal(await session.resume(), false, '没有记录时也是 false');
});

test('存储坏了（隐私模式、被禁用）也不影响联机', async () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const { sdk } = fakeSdk();
  const session = new Session({ sdk, url: 'ws://x', game: 'gomoku', storage: broken, wait: async () => {} });
  await session.create();
  assert.equal(session.status, 'live');
  assert.equal(await session.resume(), false);
  assert.equal(hasResume(broken, 'gomoku'), false);
  await session.leave();
});

test('friendlyError：常见失败换成人话', () => {
  assert.match(friendlyError(new Error('房间码不对')), /房间不存在/);
  assert.match(friendlyError(new Error('no rooms found with provided criteria')), /房间不存在/);
  assert.match(friendlyError(new Error('fetch failed')), /连不上/);
  assert.match(friendlyError(new Error('Room connection was closed unexpectedly (1006)')), /连不上/);
  assert.equal(friendlyError(new Error('别的错误')), '别的错误');
  assert.match(friendlyError(undefined), /联机失败/);
});

test('再来一局：提议/取消按协议发给服务端；round、rematch 取自最近一次状态；notice 事件转给界面', async () => {
  const { session, log } = make();
  const notices = [];
  session.on('notice', (text) => notices.push(text));
  await session.create();
  const room = log.rooms[0];
  assert.deepEqual([session.round, session.rematch], [0, null], '还没有状态时的默认值');

  room.push('state', statePayload({ round: 2, rematch: { seat: 1, swap: true } }));
  assert.deepEqual([session.round, session.rematch], [2, { seat: 1, swap: true }]);

  session.proposeRematch(true);
  session.proposeRematch();                // 不传参数 = 原座位
  session.proposeRematch('yes');           // 真值都按「换边」发出；服务端只认严格的 true
  session.clearRematch();
  assert.deepEqual(room.sent.slice(1), [
    ['rematch', { swap: true }], ['rematch', { swap: false }], ['rematch', { swap: true }], ['rematch-clear', undefined]
  ]);

  room.push('notice', { text: '对手拒绝了再来一局' });
  assert.deepEqual(notices, ['对手拒绝了再来一局']);
});

test('再来一局：连接中断时不会悄悄丢，而是告诉玩家', async () => {
  const { session, log } = make({ wait: () => new Promise(() => {}) });
  const rejects = [];
  session.on('reject', (m) => rejects.push(m));
  await session.create();
  log.rooms[0].drop();
  session.proposeRematch(false);
  session.clearRematch();                  // 取消是尽力而为，断线时静默即可
  assert.equal(log.rooms[0].sent.length, 1, '只有最初的 sync');
  assert.match(rejects[0], /重连/);
  assert.equal(rejects.length, 1);
});
