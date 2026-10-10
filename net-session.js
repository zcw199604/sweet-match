// 联机客户端：连接、房间码、断线重连、刷新后接着玩。不碰 DOM，SDK 和存储都可以注入，所以 Node 里就能测。
// 服务端见 server/（Colyseus，每个房间一份权威状态）。浏览器里的 SDK 是 vendor/colyseus/colyseus.js。

export const SERVER_DEFAULT = 'wss://wss-game.zcw.work';
export const SERVER_PORT = 2567;
const STORE_KEY = 'pao-net-room';
const CONSENTED = 4000;                       // room.leave(true) 的关闭码，服务端据此判断是主动退出
const RETRY_MS = [500, 1000, 2000, 3000, 5000, 8000];

// 和 server/arcade-room.js 的字母表一致：去掉 I O 0 1。
export const normalizeCode = (text) => String(text ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const isCode = (code) => /^[A-HJ-NP-Z2-9]{5}$/.test(code);

const isLocalHost = (hostname) => /^(localhost|127\.0\.0\.1|\[::1\]|\d{1,3}(\.\d{1,3}){3}|[^.]+\.local)$/.test(hostname);
const isSocketUrl = (value) => typeof value === 'string' && /^wss?:\/\/[^\s/]+/.test(value);

// 线上页面只连线上服务；?net= 和本机存储的覆盖只在 localhost / 局域网地址下生效，
// 免得有人发个带 ?net= 的链接，把别人的对局引到他自己的服务器。
export function resolveServerUrl({ search = '', stored = null, hostname = '' } = {}) {
  if (!isLocalHost(hostname)) return SERVER_DEFAULT;
  const fromQuery = new URLSearchParams(search).get('net');
  if (isSocketUrl(fromQuery)) return fromQuery;
  if (isSocketUrl(stored)) return stored;
  return `ws://${hostname}:${SERVER_PORT}`;
}

export const shareUrl = (origin, game, code) => `${origin}/?game=${encodeURIComponent(game)}&room=${encodeURIComponent(code)}`;

export function randomKey(cryptoLike = globalThis.crypto) {
  const bytes = new Uint8Array(12);
  cryptoLike.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

let sdkPromise = null;
export function loadSdk(src = './vendor/colyseus/colyseus.js') {
  if (globalThis.Colyseus) return Promise.resolve(globalThis.Colyseus);
  sdkPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => (globalThis.Colyseus ? resolve(globalThis.Colyseus) : reject(new Error('联机组件加载失败')));
    script.onerror = () => { sdkPromise = null; reject(new Error('联机组件加载失败，请检查网络后重试')); };
    document.head.append(script);
  });
  return sdkPromise;
}

// 把 SDK 抛出的英文/内部错误换成玩家看得懂的话。
export function friendlyError(error) {
  const text = String(error?.message ?? error ?? '');
  if (/房间码不对|no rooms? found|not found|locked|is full/i.test(text)) return '房间不存在，或者已经满员。请核对房间码。';
  if (/fetch failed|Failed to fetch|NetworkError|Load failed|ECONN|ENOTFOUND|closed unexpectedly|timeout/i.test(text)) return '连不上联机服务器，请稍后重试。';
  return text || '联机失败，请重试。';
}

const readSaved = (storage) => { try { return JSON.parse(storage?.getItem(STORE_KEY) ?? 'null'); } catch { return null; } };

// 刷新页面后，这个游戏还有一局可以接着玩吗？
export function hasResume(storage, game) {
  const saved = readSaved(storage);
  return Boolean(saved && saved.game === game && saved.token);
}

export class Session {
  constructor({ sdk, url, game, storage = null, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), key = randomKey }) {
    Object.assign(this, { sdk, url, game, storage, wait, key });
    this.room = null;
    this.payload = null;        // 服务端最近一次推来的 state 消息
    this.status = 'idle';       // idle | live | reconnecting | closed
    this.closeReason = null;    // 'left' | 'lost'
    this.closing = false;
    this.listeners = { state: new Set(), reject: new Set(), notice: new Set(), status: new Set(), net: new Set() };
  }

  on(type, fn) {
    this.listeners[type].add(fn);
    return () => this.listeners[type].delete(fn);
  }
  #emit(type, value) { for (const fn of [...this.listeners[type]]) fn(value); }
  #setStatus(status) { if (status !== this.status) { this.status = status; this.#emit('status', status); } }

  get state() { return this.payload; }
  get view() { return this.payload?.view ?? null; }
  get seat() { return this.payload?.seat ?? null; }
  get seats() { return this.payload?.seats ?? []; }
  get code() { return this.payload?.code ?? null; }
  get result() { return this.payload?.result ?? { over: false, winner: null }; }
  get round() { return this.payload?.round ?? 0; }
  get rematch() { return this.payload?.rematch ?? null; }   // 再来一局的提议 { seat, swap } 或 null
  get full() { return this.seats.length > 0 && !this.seats.includes('empty'); }

  async create(options = {}) {
    const client = new this.sdk.Client(this.url);
    this.#attach(await client.create(this.game, { ...options, hostKey: this.key() }));
  }
  async join(code) {
    const client = new this.sdk.Client(this.url);
    this.#attach(await client.join(this.game, { code: normalizeCode(code) }));
  }
  // 刷新页面后接着玩：服务端会替掉线的人留座位 60 秒。
  async resume() {
    const saved = readSaved(this.storage);
    if (!saved || saved.game !== this.game) return false;
    try {
      this.#attach(await new this.sdk.Client(this.url).reconnect(saved.token));
      return true;
    } catch {
      this.#forget();
      return false;
    }
  }

  send(action) {
    if (this.status !== 'live') return this.#emit('reject', '连接中断，正在重连……');
    this.room.send('action', action);
  }

  // 实时合作游戏（coop 房间）：游戏跑在房主的浏览器里，这里只是把包原样交给服务端转给对方，收到的包从 'net' 事件出来。
  sendNet(message) {
    if (this.status === 'live') this.room.send('net', message);
  }

  // 再来一局：对局结束后一方提议、另一方同意才开始；swap=true 表示交换先后手。对方已经提议时再发同样的参数就是同意。
  proposeRematch(swap = false) {
    if (this.status !== 'live') return this.#emit('reject', '连接中断，正在重连……');
    this.room.send('rematch', { swap: Boolean(swap) });
  }
  // 取消自己的提议，或者拒绝对方的提议。
  clearRematch() {
    if (this.status === 'live') this.room.send('rematch-clear');
  }

  // 主动退出：服务端会把没打完的对局判给对方，所以要先问过玩家。
  async leave() {
    this.closing = true;
    this.#forget();
    try { await this.room?.leave(true); } catch { /* 连接已经断了 */ }
    this.closeReason = 'left';
    this.#setStatus('closed');
  }
  // 只是离开这个页面（回大厅、切回本地）：断开连接但保留座位，回来还能接着玩。
  async suspend() {
    this.closing = true;
    try { await this.room?.leave(false); } catch { /* 连接已经断了 */ }
    this.#setStatus('closed');
  }

  #attach(room) {
    this.room = room;
    room.onMessage('state', (payload) => { this.payload = payload; this.#save(); this.#emit('state', payload); });
    room.onMessage('reject', (m) => this.#emit('reject', m?.message ?? '操作被拒绝'));
    room.onMessage('notice', (m) => this.#emit('notice', m?.text ?? ''));
    room.onMessage('net', (m) => this.#emit('net', m));
    room.onLeave((code) => this.#dropped(code));
    this.#setStatus('live');
    this.#save();
    room.send('sync');   // 服务端在加入/重连时推的消息会赶在这里的 handler 注册之前，所以主动要一次
  }

  async #dropped(code) {
    if (this.closing) return;
    if (code === CONSENTED) return this.#close('left');
    const token = this.room.reconnectionToken;
    this.#setStatus('reconnecting');
    for (const delay of RETRY_MS) {
      await this.wait(delay);
      if (this.closing) return;
      try {
        this.#attach(await new this.sdk.Client(this.url).reconnect(token));
        return;
      } catch { /* 再试 */ }
    }
    this.#close('lost');
  }

  #close(reason) {
    this.#forget();
    this.closeReason = reason;
    this.#setStatus('closed');
  }
  #save() {
    try { this.storage?.setItem(STORE_KEY, JSON.stringify({ game: this.game, token: this.room?.reconnectionToken })); } catch { /* 隐私模式 */ }
  }
  #forget() {
    try { this.storage?.removeItem(STORE_KEY); } catch { /* 隐私模式 */ }
  }
}
