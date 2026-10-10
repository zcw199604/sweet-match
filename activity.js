// 游玩记录的浏览器端：只在游戏界面、页面可见、最近有点击 / 触摸 / 指针移动 / 按键时计时，定时把累计值报给 /api/activity。
// 任何失败都静默忽略，不能影响游戏。服务端的约定见 activity-core.js。
import { BOARDS } from './leaderboard-core.js';
import { playerId, playerName } from './leaderboard.js';
import { notePlayed } from './recent.js';

const ENDPOINT = '/api/activity';
const TICK_MS = 1000;
const HEARTBEAT_MS = 60_000;
const IDLE_MS = 30_000; // 这么久没点击 / 触摸 / 指针移动 / 按键就暂停计时
const SPLIT_MS = 5 * 60_000; // 中断超过这么久，回来算新的一段
const MIN_REPORT_MS = 5000; // 不满 5 秒的误触不上报

let current = null; // { board, sid, startAt, activeMs, sentMs, countedAt }
let lastInput = 0;
let timer = 0;

const newSid = () => crypto.randomUUID?.() ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
const visible = () => document.visibilityState !== 'hidden';

function payload(session, now) {
  return JSON.stringify({ sid: session.sid, pid: playerId(), name: playerName(), board: session.board, active_ms: Math.round(session.activeMs), elapsed_ms: Math.round(now - session.startAt) });
}
// beacon 用于页面即将关闭 / 切到后台时：普通 fetch 这时可能被取消。
function send(session, beacon = false) {
  if (session.activeMs < MIN_REPORT_MS || session.activeMs === session.sentMs || !playerId()) return; // 没登录就没有身份可记
  session.sentMs = session.activeMs;
  const body = payload(session, Date.now());
  try {
    if (beacon && navigator.sendBeacon?.(ENDPOINT, body)) return;
    fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch { /* 记录不到就算了 */ }
}

const start = (board, now) => ({ board, sid: newSid(), startAt: now, activeMs: 0, sentMs: 0, countedAt: now });
// 中断（切后台、挂机）超过 SPLIT_MS 后回来，算新的一段，这样时间线上不会出现跨几个小时的假长段。
function resume(now) {
  if (now - current.countedAt > SPLIT_MS) { send(current, true); current = start(current.board, now); }
  else current.countedAt = now;
}

function tick() {
  if (!current) return;
  const now = Date.now();
  if (!visible() || now - lastInput > IDLE_MS) return;
  if (now - current.countedAt > SPLIT_MS) resume(now);
  // 被浏览器节流后的大间隔不算时长。
  const gained = Math.min(now - current.countedAt, TICK_MS * 2.5);
  current.activeMs += gained;
  current.countedAt = now;
  notePlayed(BOARDS[current.board]?.game ?? current.board, gained); // 同时支持无榜单的本地小游戏
  if (current.activeMs - current.sentMs >= HEARTBEAT_MS) send(current);
}

// 告诉记录器现在在玩哪个榜单对应的游戏（board 用榜单 id，如 'pop3-endless'）；离开游戏界面时传 null。
export function trackActivity(board) {
  if (current?.board === board) return;
  if (current) send(current, true);
  const now = Date.now();
  current = board ? start(board, now) : null;
}

export function initActivity() {
  const touch = () => { lastInput = Date.now(); };
  for (const type of ['pointerdown', 'pointermove', 'keydown', 'touchstart']) document.addEventListener(type, touch, { passive: true, capture: true });
  // 回到前台时重新起算，避免把后台那段时间补进去；要等用户有了新的操作才继续计时。
  document.addEventListener('visibilitychange', () => {
    if (!current) return;
    if (visible()) resume(Date.now()); else send(current, true);
  });
  window.addEventListener('pagehide', () => { if (current) send(current, true); });
  timer = timer || setInterval(tick, TICK_MS);
}
