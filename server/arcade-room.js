import { randomInt } from 'node:crypto';
import { CloseCode, Room } from '@colyseus/core';
import { adapters } from './adapters/index.js';

const RECONNECT_SECONDS = 60;
// 房间码：5 位，去掉容易看混的 I O 0 1。只在本进程内保证不重复（单进程部署）。
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codesInUse = new Set();
function newCode() {
  for (;;) {
    const code = Array.from({ length: 5 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    if (!codesInUse.has(code)) { codesInUse.add(code); return code; }
  }
}

// 权威房间：状态只在这里推进，客户端只能提交 action，收到的永远是按座位裁剪后的 view。
// 房间名就是游戏名（defineRoom 时注册），所以客户端没法在 gomoku 房间里开别的游戏。
export class ArcadeRoom extends Room {
  onCreate({ hostKey, ...options } = {}) {
    this.adapter = adapters[this.roomName];
    if (!this.adapter) throw new Error(`unknown game: ${this.roomName}`);
    this.code = newCode();
    this.setMetadata({ code: this.code });   // 配合 filterBy(['code'])：加入时按房间码找房间
    // 创建者凭一次性密钥入座（密钥只在创建者手里，不进 metadata、不发给任何客户端）；其余人必须带对房间码。
    this.hostKey = typeof hostKey === 'string' && hostKey.length >= 16 ? hostKey : null;
    this.hostSeated = false;
    this.maxClients = this.adapter.seats;
    // 种子由服务端出：客户端不能选，雷区、新方块序列、洗牌都不可预测。
    this.gameOptions = options;           // 创建时的选项（目标方块、难度…），再来一局沿用
    this.game = this.adapter.init({ ...options, seed: randomInt(2 ** 31) });
    this.version = 0;
    this.round = 0;                       // 第几局；再来一局 +1，客户端据此知道是新的一局
    this.rematch = null;                  // 再来一局的提议 { seat, swap }，对局结束后才会有
    this.forfeited = null;
    this.seatBySession = new Map();
    this.online = new Set();
    this.onMessage('action', (client, action) => this.handleAction(client, action));
    // onJoin / 重连成功时服务端推的消息，客户端还没来得及注册 handler 就会丢。
    // 所以客户端注册完 handler 后主动发一次 sync，状态以这条为准。
    this.onMessage('sync', (client) => this.pushState(client));
    this.onMessage('rematch', (client, message) => this.handleRematch(client, message));
    this.onMessage('rematch-clear', (client) => this.clearRematch(client));
  }

  onAuth(client, options = {}) {
    if (this.hostKey && !this.hostSeated && options.hostKey === this.hostKey) { this.hostSeated = true; return true; }
    if (options.code === this.code) return true;
    throw new Error('房间码不对');
  }

  onDispose() {
    codesInUse.delete(this.code);
  }

  onJoin(client) {
    const taken = new Set(this.seatBySession.values());
    const seat = [...Array(this.adapter.seats).keys()].find((i) => !taken.has(i));
    this.seatBySession.set(client.sessionId, seat);
    this.online.add(client.sessionId);
    this.pushAll();
  }

  async onLeave(client, code) {
    const seat = this.seatBySession.get(client.sessionId);
    this.online.delete(client.sessionId);
    this.pushAll();
    if (code !== CloseCode.CONSENTED) {   // 对局结束后也保留座位：刷新一下页面不该丢掉「再来一局」
      try {
        await this.allowReconnection(client, RECONNECT_SECONDS);
        this.online.add(client.sessionId);
        this.pushAll();
        return;
      } catch { /* 超时未回来：落到下面按弃局处理 */ }
    }
    this.forfeit(seat);
    this.seatBySession.delete(client.sessionId);
    this.rematch = null;                  // 有人离开，没有可以提议的对象了
    this.pushAll();
  }

  // 两人局里一方离开（主动退出或掉线超时）且对局未结束 → 对方获胜，房间锁定不再接新人。
  forfeit(seat) {
    if (this.adapter.seats !== 2 || this.result().over) return;
    this.forfeited = seat;
    this.lock();
  }

  result() {
    if (this.forfeited !== null) return { over: true, winner: 1 - this.forfeited, reason: 'forfeit' };
    return this.adapter.result(this.game);
  }

  handleAction(client, action) {
    const seat = this.seatBySession.get(client.sessionId);
    if (seat === undefined || this.seatBySession.size < this.adapter.seats) return client.send('reject', { message: '对手还没到齐' });
    if (this.result().over) return client.send('reject', { message: '本局已结束' });
    if (!this.adapter.canAct(this.game, seat)) return client.send('reject', { message: this.adapter.cantAct?.(this.game, seat) ?? '还没轮到你' });
    let next;
    try {
      next = this.adapter.apply(this.game, seat, action);
    } catch {
      next = { ok: false, message: '无法识别的操作' };   // 客户端传来的东西不可信，核心抛错也只当作被拒绝
    }
    if (!next.ok) return client.send('reject', { message: next.message || '非法操作' });
    this.game = next.state;
    this.version += 1;
    this.pushAll();
  }

  // 再来一局：对局结束后任意一方提议，另一方同意才开始。swap=true 表示交换先后手（座位对调）。
  // 双方提议不一致（一方想原座位、一方想换边）时，后提的覆盖先提的，由先提的一方决定是否同意。
  handleRematch(client, message) {
    const seat = this.seatBySession.get(client.sessionId);
    if (seat === undefined || this.adapter.seats !== 2) return;
    if (!this.result().over || this.forfeited !== null) return client.send('reject', { message: '这一局还没结束，或者对手已经离开' });
    if (this.seatBySession.size < 2) return client.send('reject', { message: '对手已经离开了' });
    const swap = message?.swap === true;
    if (this.rematch && this.rematch.seat !== seat && this.rematch.swap === swap) return this.startRound(swap);
    this.rematch = { seat, swap };
    this.pushAll();
  }

  // 提议者自己取消 → 悄悄撤掉；对方拒绝 → 撤掉并告诉提议者。
  clearRematch(client) {
    const seat = this.seatBySession.get(client.sessionId);
    if (!this.rematch || seat === undefined) return;
    const proposer = this.rematch.seat;
    this.rematch = null;
    this.pushAll();
    if (proposer !== seat) {
      const id = [...this.seatBySession].find(([, s]) => s === proposer)?.[0];
      this.clients.find((c) => c.sessionId === id)?.send('notice', { text: '对手拒绝了再来一局' });
    }
  }

  startRound(swap) {
    this.game = this.adapter.init({ ...this.gameOptions, seed: randomInt(2 ** 31) });
    this.round += 1;
    this.version += 1;
    this.rematch = null;
    if (swap) for (const [id, seat] of this.seatBySession) this.seatBySession.set(id, 1 - seat);
    this.pushAll();
  }

  pushAll() {
    for (const c of this.clients) this.pushState(c);
  }

  pushState(client) {
    const seat = this.seatBySession.get(client.sessionId);
    const seats = [...Array(this.adapter.seats).keys()].map((i) => {
      const id = [...this.seatBySession].find(([, s]) => s === i)?.[0];
      return id === undefined ? 'empty' : this.online.has(id) ? 'online' : 'offline';
    });
    client.send('state', {
      game: this.adapter.id, code: this.code, version: this.version, round: this.round, rematch: this.rematch, seat, seats,
      view: this.adapter.view(this.game, seat), result: this.result()
    });
  }
}
