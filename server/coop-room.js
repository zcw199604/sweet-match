import { CloseCode } from '@colyseus/core';
import { CodeRoom } from './code-room.js';

const RECONNECT_SECONDS = 60;
const SEAT_HOST = 0, SEAT_GUEST = 1;
// 只转发前端联机逻辑会发的几种包；snapshot 是房主整盘状态（实测 1～3KB），32KB 已经很宽松，超了当作异常丢掉；传输层的单包上限是 64KB。
const TYPES = new Set(['hello', 'action', 'snapshot']);
const MAX_BYTES = 32 * 1024;
const RATE_PER_SECOND = 80, RATE_BURST = 160;

// 实时合作游戏（泡噗 2、泡噗 3、山山兔）的中继房间：游戏本体仍然跑在房主的浏览器里（和局域网版一样，房主出快照、
// 客人发操作），服务器只负责房间码、座位、断线重连，把一方的包转给另一方。所以它不认识任何游戏，也不保存游戏状态。
export class CoopRoom extends CodeRoom {
  onCreate({ hostKey } = {}) {
    this.initCode({ hostKey });
    this.maxClients = 2;
    this.sessions = [null, null];          // 座位 → sessionId（0 房主 / 1 客人）
    this.online = new Set();
    this.buckets = new Map();
    this.onMessage('net', (client, message) => this.relay(client, message));
    // onJoin 时推的状态会赶在客户端注册 handler 之前，所以客户端注册完后主动要一次（和 ArcadeRoom 一样）。
    this.onMessage('sync', (client) => this.pushState(client));
  }

  onJoin(client, options, auth) {
    const seat = auth?.host ? SEAT_HOST : SEAT_GUEST;
    this.sessions[seat] = client.sessionId;
    this.online.add(client.sessionId);
    this.pushAll();
  }

  async onLeave(client, code) {
    const seat = this.sessions.indexOf(client.sessionId);
    this.online.delete(client.sessionId);
    this.pushAll();
    if (code !== CloseCode.CONSENTED) {
      try {
        await this.allowReconnection(client, RECONNECT_SECONDS);
        this.online.add(client.sessionId);
        this.pushAll();
        return;
      } catch { /* 超时未回来 */ }
    }
    this.sessions[seat] = null;
    this.buckets.delete(client.sessionId);
    if (seat === SEAT_HOST) {              // 游戏在房主那里，房主走了房间就没有意义了
      this.broadcast('net', { type: 'closed' });
      this.disconnect();
    } else this.pushAll();                 // 客人走了：房间保持开放，房主可以等下一位
  }

  allow(client) {
    const now = Date.now(), bucket = this.buckets.get(client.sessionId) ?? { tokens: RATE_BURST, at: now };
    bucket.tokens = Math.min(RATE_BURST, bucket.tokens + (now - bucket.at) / 1000 * RATE_PER_SECOND);
    bucket.at = now;
    this.buckets.set(client.sessionId, bucket);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    return true;
  }

  relay(client, message) {
    if (!message || typeof message !== 'object' || !TYPES.has(message.type) || !this.allow(client)) return;
    if (JSON.stringify(message).length > MAX_BYTES) return;
    const seat = this.sessions.indexOf(client.sessionId);
    if (seat < 0) return;
    const peerId = this.sessions[1 - seat];
    this.clients.find((c) => c.sessionId === peerId)?.send('net', message);   // 对方不在线就丢掉：重连后由客户端重新要快照
  }

  pushAll() {
    for (const c of this.clients) this.pushState(c);
  }

  pushState(client) {
    const seats = this.sessions.map((id) => (id === null ? 'empty' : this.online.has(id) ? 'online' : 'offline'));
    client.send('state', {
      game: 'coop', code: this.code, version: 0, round: 0, rematch: null, seat: this.sessions.indexOf(client.sessionId), seats,
      view: null, result: { over: false, winner: null }
    });
  }
}
