import { act, beatPhase, canPlace, cellAt, cellCentre, createGame, hexOffset, HEIGHT, MODES, pieceCentre, POP2, POP3, pop3Multiplier, pop3Stage, SURGE, surgeStage, tickGame, WIDTH } from './game-core.js';

const MODE_META = {
  pop2: { label: 'ARCADE 01', title: '泡噗 2', help: '拖动屏幕驾驶飞船，接住飘来的彩球。三个同色相连就会消除，挂在上面的也一起掉；别让任何彩球碰到中间的星球。' },
  pop3: { label: 'ARCADE 02', title: '泡噗 3', help: '拖动飞船接住落下的音符，三个同色相连消除。漏掉的音符会让底部的怪鼠上升，消除能把它压回去；跟着光圈点「打拍」累积连击倍率。' },
  surge: { label: 'ARCADE 03', title: '山山兔队长大作战：泡姆狂潮', help: '点传送带上的拼块，再点场地格子放下（也可以直接拖过去）。三个同色相连会变成泡姆沿所在行向右发射，击退敌人。' }
};
const COLOR_HEX = { red: '#ff5d6c', yellow: '#ffd543', green: '#44c986', blue: '#58a8f0', purple: '#a78bfa' };
const PLAYER_HEX = ['#58d4de', '#ff9d5c'];
const DRAG_GAIN = 1.25;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let mode = 'pop2';
let state = null;
let frameId = 0;
let lastFrame = 0;
let lastSnapshot = 0;
let activePlayer = 0;
let soloPlayers = 1;
let axeMode = false;
let hover = null;
let controlsKey = '';
let hudText = '';
let lastMove = null;
let lastMoveAt = 0;
let pendingMove = null;
let moveTimer = 0;
let buzzedAt = 0;
let endedAt = 0;
const pointers = new Map();
const keys = new Set();
const keyMoving = [false, false];
let lan = { role: 'solo', token: null, code: null, base: '', source: null, events: null };
let rtc = { peer: null, channel: null };

function showScreen(id) {
  $$('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === id));
  document.body.classList.toggle('playing', id === 'game');
  // The home page may have been scrolled to reach a card; the board must start in view.
  window.scrollTo(0, 0);
  if (id === 'home') history.replaceState(null, '', '#home');
  else if (id === 'game') history.replaceState(null, '', `#game/${mode}`);
}
function setHint(message = '', error = false) {
  const node = $('#link-hint');
  node.textContent = message;
  node.style.color = error ? '#bc5d6d' : '#318d6a';
}
function setLinkState(connected) {
  const node = $('#link-state');
  node.classList.toggle('online', connected);
  node.querySelector('span').textContent = connected ? `${lan.role === 'host' ? '房主' : '玩家 2'} · 已连接` : '单机模式';
}
function modeForState(next) {
  if (!next?.mode || !MODES.includes(next.mode)) return mode;
  return next.mode;
}
function cloneState(value) { return JSON.parse(JSON.stringify(value)); }

function openLink() { $('#link').classList.add('active'); }
function closeLink() { $('#link').classList.remove('active'); }
function serverBase() {
  const input = $('#lan-server-url');
  const query = new URLSearchParams(location.search).get('lan');
  const value = (input?.value || query || localStorage.getItem('pao-lan-server') || location.origin).trim();
  const base = value || location.origin;
  if (input && !input.value) input.value = base;
  localStorage.setItem('pao-lan-server', base);
  return base.replace(/\/$/, '');
}
async function postJson(path, body) {
  const response = await fetch(`${lan.base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `请求失败 (${response.status})`);
  return data;
}
function closeEvents() {
  if (lan.events) lan.events.close();
  lan.events = null;
}
function sendNetwork(message) {
  if (rtc.channel?.readyState === 'open') rtc.channel.send(JSON.stringify(message));
  if (lan.token && lan.base) postJson('/api/message', { token: lan.token, message }).catch(() => setHint('局域网服务连接已断开，请检查地址。', true));
}
function installMessageHandler(message) {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'action' && lan.role === 'host' && state) {
    act(state, 1, message.action);
    broadcastSnapshot(message.action?.type !== 'move');
  } else if (message.type === 'snapshot' && lan.role === 'guest' && message.state) {
    const changed = modeForState(message.state) !== mode || !$('.game-canvas');
    state = message.state;
    mode = modeForState(state);
    activePlayer = 1;
    // Keep steering where the guest last pointed until the host has caught up with it.
    if (lastMove && performance.now() - lastMoveAt < 400) act(state, 1, lastMove);
    if (changed) buildStage();
    if (!$('#game').classList.contains('active')) showScreen('game');
    renderGame();
  } else if (message.type === 'hello' && lan.role === 'host' && state) {
    sendNetwork({ type: 'snapshot', state: cloneState(state) });
  } else if (message.type === 'closed') {
    setHint('房主已结束房间。', true);
    disconnect();
  }
}
function setupEvents() {
  closeEvents();
  if (!lan.token || !lan.base || !('EventSource' in window)) return;
  lan.events = new EventSource(`${lan.base}/api/events?token=${encodeURIComponent(lan.token)}`);
  lan.events.onmessage = (event) => { try { installMessageHandler(JSON.parse(event.data)); } catch { /* ignore malformed packets */ } };
  lan.events.onerror = () => setHint('正在等待局域网连接……', true);
}
function broadcastSnapshot(force = false) {
  if (lan.role !== 'host' || !state) return;
  const now = performance.now();
  if (!force && now - lastSnapshot < 90) return;
  lastSnapshot = now;
  sendNetwork({ type: 'snapshot', state: cloneState(state) });
}
async function createRoom() {
  try {
    lan.base = serverBase();
    const room = await postJson('/api/rooms', {});
    lan = { ...lan, ...room, source: 'lan' };
    setupEvents(); setLinkState(true); setHint(`房间 ${room.code} 已创建。把房间码发给朋友，再选择一个游戏。`);
  } catch (error) { setHint(`创建失败：${error.message}`, true); }
}
async function joinRoom() {
  try {
    const code = $('#room-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('请输入 6 位房间码');
    lan.base = serverBase();
    const room = await postJson('/api/join', { code });
    lan = { ...lan, ...room, source: 'lan' };
    setupEvents(); setLinkState(true); setHint(`已加入房间 ${room.code}，等待房主开始游戏。`);
    sendNetwork({ type: 'hello' });
  } catch (error) { setHint(`加入失败：${error.message}`, true); }
}
async function disconnect() {
  closeEvents();
  if (lan.token && lan.base) await postJson('/api/leave', { token: lan.token }).catch(() => {});
  if (rtc.peer) rtc.peer.close();
  rtc = { peer: null, channel: null };
  lan = { role: 'solo', token: null, code: null, base: '', source: null, events: null };
  setLinkState(false); setHint('已断开连接。');
}
function waitForIce(peer) {
  if (peer.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { if (peer.iceGatheringState === 'complete') { peer.removeEventListener('icegatheringstatechange', done); resolve(); } };
    peer.addEventListener('icegatheringstatechange', done);
    setTimeout(resolve, 3500);
  });
}
function rtcPacket(description) { return JSON.stringify({ type: description.type, sdp: description.sdp }); }
function setupRtcPeer(peer, channel) {
  rtc.peer = peer;
  const useChannel = (next) => {
    rtc.channel = next;
    next.onopen = () => { setLinkState(true); setHint('WebRTC 已连接，可以开始游戏。'); if (lan.role === 'host' && state) broadcastSnapshot(true); else next.send(JSON.stringify({ type: 'hello' })); };
    next.onclose = () => { setLinkState(false); setHint('WebRTC 连接已关闭。', true); };
    next.onmessage = (event) => { try { installMessageHandler(JSON.parse(event.data)); } catch { /* ignore */ } };
  };
  if (channel) useChannel(channel);
  peer.ondatachannel = (event) => useChannel(event.channel);
  peer.onconnectionstatechange = () => { if (['failed', 'disconnected', 'closed'].includes(peer.connectionState)) setHint('WebRTC 连接失败，请改用局域网房间码。', true); };
}
async function makeOffer() {
  if (!('RTCPeerConnection' in window)) return setHint('当前浏览器不支持 WebRTC。', true);
  try {
    lan = { ...lan, role: 'host', source: 'webrtc' };
    const peer = new RTCPeerConnection(); const channel = peer.createDataChannel('pao-arcade'); setupRtcPeer(peer, channel);
    await peer.setLocalDescription(await peer.createOffer()); await waitForIce(peer);
    $('#offer-code').value = rtcPacket(peer.localDescription); setHint('复制 offer 给伙伴。');
  } catch (error) { setHint(`生成 offer 失败：${error.message}`, true); }
}
async function makeAnswer() {
  if (!('RTCPeerConnection' in window)) return setHint('当前浏览器不支持 WebRTC。', true);
  try {
    const offer = JSON.parse($('#remote-offer').value); const peer = new RTCPeerConnection(); lan = { ...lan, role: 'guest', source: 'webrtc' }; setupRtcPeer(peer);
    await peer.setRemoteDescription(offer); await peer.setLocalDescription(await peer.createAnswer()); await waitForIce(peer);
    $('#answer-code').value = rtcPacket(peer.localDescription); setHint('复制 answer 回房主。');
  } catch (error) { setHint(`生成 answer 失败：${error.message}`, true); }
}
async function finishAnswer() {
  try { if (!rtc.peer) throw new Error('请先生成 offer'); await rtc.peer.setRemoteDescription(JSON.parse($('#remote-answer').value)); setHint('已提交 answer，等待连接。'); }
  catch (error) { setHint(`完成连接失败：${error.message}`, true); }
}

const newGame = () => createGame(mode, (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0, { players: lan.role === 'solo' ? soloPlayers : 2 });
function buildStage() {
  const meta = MODE_META[mode], stage = $('#game-stage');
  $('#mode-label').textContent = meta.label; $('#game-title').textContent = meta.title;
  stage.innerHTML = `<div class="stage-top"><div><span id="seat-text"></span><strong id="score-text">0 分</strong></div><button id="restart-game">重新开始</button></div><div class="canvas-wrap"><canvas class="game-canvas" width="720" height="720" tabindex="0" aria-label="${meta.title} 游戏画布"></canvas></div><div class="mobile-controls" id="mobile-controls"></div><p class="game-help">${meta.help}</p>`;
  const canvas = stage.querySelector('canvas');
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  $('#restart-game').addEventListener('click', restartGame);
  controlsKey = ''; hudText = ''; axeMode = false; hover = null; pointers.clear();
  resizeCanvas();
}
function startGame(nextMode) {
  mode = nextMode; activePlayer = lan.role === 'guest' ? 1 : 0;
  state = lan.role === 'guest' ? null : newGame();
  if (lan.role === 'guest') setHint('已进入房间，等待房主同步棋盘。');
  buildStage(); showScreen('game'); renderGame(); if (lan.role === 'host') broadcastSnapshot(true);
}
function restartGame() {
  if (lan.role === 'guest') return setHint('请由房主重新开始。', true);
  state = newGame(); axeMode = false; hover = null; controlsKey = ''; broadcastSnapshot(true); renderGame();
}
// Every player this device steers: both seats when two people share one screen.
const localPlayers = () => (lan.role === 'solo' ? state.players.map(p => p.id) : [activePlayer]);
function wellRect(index, count) {
  if (count === 1) return { x: 20, y: 10, s: 700 / POP3.H };
  return { x: index ? 375 : 15, y: 104, s: 1 };
}
function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * WIDTH / rect.width, y: (event.clientY - rect.top) * HEIGHT / rect.height };
}
function sendAction(player, action) {
  if (!state) return false;
  if (lan.role === 'guest') {
    // Apply locally so the guest's own piece answers at once; the host's snapshot stays authoritative.
    const done = act(state, 1, action);
    if (action.type !== 'move') sendNetwork({ type: 'action', player: 1, action });
    else {
      lastMove = action; lastMoveAt = performance.now(); pendingMove = action;
      if (!moveTimer) moveTimer = setTimeout(() => { moveTimer = 0; sendNetwork({ type: 'action', player: 1, action: pendingMove }); }, 50);
    }
    return done;
  }
  const done = act(state, player, action);
  if (done && action.type !== 'move') broadcastSnapshot(true);
  return done;
}
function playerAt(point) {
  if (lan.role !== 'solo' || mode === 'surge') return activePlayer;
  if (state.players.length === 1) return 0;
  return point.x < WIDTH / 2 ? 0 : 1;
}
function pieceAt(point) {
  const size = SURGE.BELT_CELL;
  return state.belt.find(piece => piece.cells.some(cell => Math.abs(point.x - piece.x - cell.dx * size) < size / 2 + 12 && Math.abs(point.y - SURGE.BELT_Y - cell.dy * size) < size / 2 + 12));
}
function surgePointer(entry, point, release) {
  const p = state.players[entry.player], cell = cellAt(point.x, point.y);
  const onField = cell.col >= 0 && cell.col < SURGE.COLS && cell.row >= 0 && cell.row < SURGE.ROWS;
  if (!release) {
    if (!onField && !p.held && !entry.piece) { const piece = pieceAt(point); if (piece && sendAction(entry.player, { type: 'pick', piece: piece.id })) entry.piece = piece; }
    hover = onField && (p.held || entry.piece || axeMode) ? { player: entry.player, ...cell, cells: p.held?.cells || entry.piece?.cells } : null;
    return;
  }
  hover = null;
  if (onField && axeMode) { axeMode = false; sendAction(entry.player, { type: 'axe', ...cell }); }
  else if (onField && p.held) sendAction(entry.player, { type: 'put', ...cell });
  // Released over the field before the rabbit reached the belt: fetch the piece, then carry it there.
  else if (onField && entry.piece) sendAction(entry.player, { type: 'pick', piece: entry.piece.id, ...cell });
  else if (!entry.piece) sendAction(entry.player, { type: 'move', x: point.x, y: point.y });
}
function pointerDown(event) {
  if (!state) return;
  event.preventDefault();
  // Ignore the tap that was already on its way down when the round ended.
  if (state.phase !== 'playing') { if (performance.now() - endedAt > 700) restartGame(); return; }
  const canvas = event.currentTarget, point = canvasPoint(canvas, event), player = playerAt(point), p = state.players[player];
  canvas.setPointerCapture?.(event.pointerId);
  const entry = { player, start: point, last: point, base: { x: p.x, y: p.y }, moved: false, time: performance.now() };
  pointers.set(event.pointerId, entry);
  if (mode === 'surge') surgePointer(entry, point, false);
}
function pointerMove(event) {
  const entry = pointers.get(event.pointerId), canvas = $('.game-canvas');
  if (!entry || !state || !canvas) return;
  event.preventDefault();
  const point = canvasPoint(canvas, event); entry.last = point;
  if (Math.hypot(point.x - entry.start.x, point.y - entry.start.y) > 8) entry.moved = true;
  if (mode === 'surge') return surgePointer(entry, point, false);
  if (!entry.moved) return;
  // Relative drag: the finger never has to sit on top of the ship it steers.
  const gain = DRAG_GAIN / (mode === 'pop3' ? wellRect(entry.player, state.players.length).s : 1);
  sendAction(entry.player, { type: 'move', x: entry.base.x + (point.x - entry.start.x) * gain, y: entry.base.y + (point.y - entry.start.y) * gain });
}
function pointerUp(event) {
  const entry = pointers.get(event.pointerId);
  if (!entry) return;
  pointers.delete(event.pointerId);
  if (!state || event.type === 'pointercancel') { hover = null; return; }
  event.preventDefault();
  if (mode === 'surge') surgePointer(entry, entry.last, true);
  else if (mode === 'pop3' && !entry.moved && performance.now() - entry.time < 350) sendAction(entry.player, { type: 'beat' });
}
// WASD drives the first local seat and the arrows the second; with one seat both sets work.
const KEY_DIRS = [{ a: [-1, 0], d: [1, 0], w: [0, -1], s: [0, 1] }, { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, -1], arrowdown: [0, 1] }];
const keySeat = (set) => { const seats = localPlayers(); return seats[Math.min(set, seats.length - 1)]; };
function primaryAction(player) {
  if (mode === 'pop3') sendAction(player, { type: 'beat' });
  else if (mode === 'surge') sendAction(player, { type: 'grab' });
}
function keyboard(event) {
  if (!state || !$('#game').classList.contains('active') || event.target.matches?.('input,textarea')) return;
  const key = event.key.toLowerCase(), down = event.type === 'keydown';
  if (KEY_DIRS.some(set => key in set)) { event.preventDefault(); if (down) keys.add(key); else keys.delete(key); return; }
  if (!down || event.repeat) return;
  if (key === ' ') { event.preventDefault(); primaryAction(keySeat(0)); }
  else if (key === 'enter') { event.preventDefault(); primaryAction(keySeat(1)); }
  else if (key === 'r' || key === 'e') sendAction(keySeat(0), { type: 'rotate' });
  else if (key === 'shift') sendAction(keySeat(1), { type: 'rotate' });
  else if (key === 'f') sendAction(keySeat(0), { type: 'skill' });
}
function steerFromKeys() {
  const moves = new Map();
  KEY_DIRS.forEach((set, index) => {
    const seat = keySeat(index), dir = moves.get(seat) || [0, 0];
    for (const key of Object.keys(set)) if (keys.has(key)) { dir[0] += set[key][0]; dir[1] += set[key][1]; }
    moves.set(seat, dir);
  });
  for (const [seat, [dx, dy]] of moves) {
    const p = state.players[seat], held = dx || dy;
    if (held) sendAction(seat, { type: 'move', x: p.x + Math.sign(dx) * 120, y: p.y + Math.sign(dy) * 120 });
    else if (keyMoving[seat]) sendAction(seat, { type: 'move', x: p.x, y: p.y });
    keyMoving[seat] = Boolean(held);
  }
}

function roundedRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, radius); else ctx.rect(x, y, w, h);
}
function drawBall(ctx, x, y, color, radius) {
  const gradient = ctx.createRadialGradient(x - radius * .35, y - radius * .4, radius * .08, x, y, radius * 1.2);
  gradient.addColorStop(0, '#ffffffcc'); gradient.addColorStop(.18, COLOR_HEX[color] || '#798093'); gradient.addColorStop(1, '#10152255');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ffffff40'; ctx.lineWidth = 1; ctx.stroke();
}
function drawBlock(ctx, x, y, size, color, alpha = 1) {
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.fillStyle = COLOR_HEX[color] || '#798093'; roundedRect(ctx, x - size / 2, y - size / 2, size, size, size * .2); ctx.fill();
  ctx.fillStyle = '#ffffff40'; roundedRect(ctx, x - size * .36, y - size * .38, size * .72, size * .2, size * .1); ctx.fill();
  ctx.fillStyle = '#1b213066'; ctx.beginPath(); ctx.arc(x - size * .14, y + size * .06, size * .06, 0, Math.PI * 2); ctx.arc(x + size * .14, y + size * .06, size * .06, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
function drawShip(ctx, x, y, radius, index) {
  ctx.fillStyle = PLAYER_HEX[index]; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
  ctx.fillStyle = '#1b2130'; ctx.beginPath(); ctx.arc(x - radius * .32, y - radius * .1, radius * .14, 0, Math.PI * 2); ctx.arc(x + radius * .32, y - radius * .1, radius * .14, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y + radius * .12, radius * .34, .2, Math.PI - .2); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1b2130'; ctx.stroke();
}
function label(ctx, text, x, y, size = 12, color = '#fff', align = 'center', font = 'Manrope, sans-serif') {
  ctx.fillStyle = color; ctx.font = `700 ${size}px ${font}`; ctx.textAlign = align; ctx.fillText(text, x, y); ctx.textAlign = 'left';
}
function drawEffects(ctx, well) {
  for (const item of state.effects) {
    if (item.well !== well) continue;
    const age = (state.elapsed - item.time) / 0.9;
    if (age < 0 || age > 1) continue;
    ctx.save(); ctx.globalAlpha = 1 - age;
    if (item.type === 'pop') { ctx.strokeStyle = COLOR_HEX[item.color] || '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(item.x, item.y, 8 + age * 26, 0, Math.PI * 2); ctx.stroke(); }
    else label(ctx, item.text, item.x, item.y - 18 - age * 34, 18);
    ctx.restore();
  }
}
function drawBanner(ctx) {
  const age = state.banner ? state.elapsed - state.banner.time : 9;
  if (age > 2.2) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, (2.2 - age) * 2);
  ctx.fillStyle = '#111824dd'; roundedRect(ctx, WIDTH / 2 - 190, HEIGHT / 2 - 44, 380, 88, 18); ctx.fill();
  label(ctx, state.banner.text, WIDTH / 2, HEIGHT / 2 + 11, 32); ctx.restore();
}

function renderPop2(ctx) {
  const { CX, CY } = POP2;
  ctx.fillStyle = '#111824'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(CX, CY, 20, CX, CY, POP2.ARENA_R + 30);
  glow.addColorStop(0, '#263a4f'); glow.addColorStop(1, '#162031');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(CX, CY, POP2.ARENA_R + 16, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff30'; ctx.lineWidth = 2; ctx.setLineDash([3, 9]); ctx.stroke(); ctx.setLineDash([]);
  // The planet flashes once anything loose drifts close.
  const threat = state.balls.some(ball => Math.hypot(ball.x - CX, ball.y - CY) < 130);
  if (threat) { ctx.strokeStyle = `rgba(255,93,108,${.35 + .35 * Math.sin(state.elapsed * 10)})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(CX, CY, POP2.HOME_R + 12, 0, Math.PI * 2); ctx.stroke(); }
  const planet = ctx.createRadialGradient(CX - 9, CY - 10, 3, CX, CY, POP2.HOME_R);
  planet.addColorStop(0, '#fff3b0'); planet.addColorStop(.5, '#ffb347'); planet.addColorStop(1, '#c9612c');
  ctx.fillStyle = planet; ctx.beginPath(); ctx.arc(CX, CY, POP2.HOME_R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#ffffff70'; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(CX, CY, POP2.HOME_R + 9, 8, -.4, 0, Math.PI * 2); ctx.stroke();
  for (const ball of state.balls) drawBall(ctx, ball.x, ball.y, ball.color, POP2.R);
  for (const p of state.players) {
    for (const cell of Object.keys(p.cells)) { const o = hexOffset(...cell.split(',').map(Number)); drawBall(ctx, p.x + o.x, p.y + o.y, p.cells[cell], POP2.R); }
    drawShip(ctx, p.x, p.y, POP2.SHIP_R, p.id);
    if (state.players.length > 1) label(ctx, `P${p.id + 1}`, p.x, p.y - POP2.SHIP_R - 6, 11, PLAYER_HEX[p.id], 'center', '"DM Mono"');
  }
  drawEffects(ctx);
}

function renderWell(ctx, p, count) {
  const rect = wellRect(p.id, count), { W, H, CELL } = POP3, spike = H - p.monster;
  ctx.save(); ctx.translate(rect.x, rect.y); ctx.scale(rect.s, rect.s);
  ctx.fillStyle = '#0d1320'; roundedRect(ctx, 0, 0, W, H, 10); ctx.fill(); ctx.save(); ctx.clip();
  for (const note of state.notes) if (note.well === p.id) drawBlock(ctx, note.x, note.y, CELL - 3, note.color);
  if (!p.out) {
    for (const cell of Object.keys(p.cells)) { const [c, r] = cell.split(',').map(Number); drawBlock(ctx, p.x + c * CELL, p.y + r * CELL, CELL - 3, p.cells[cell]); }
    // The ring closes on the ship exactly on the beat.
    const phase = beatPhase(state);
    ctx.strokeStyle = `rgba(88,212,222,${.35 + .65 * phase})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, 15 + 26 * (1 - phase), 0, Math.PI * 2); ctx.stroke();
    drawShip(ctx, p.x, p.y, CELL / 2 - 1, p.id);
    if (state.elapsed - p.judgeAt < .6) label(ctx, p.judge, p.x, p.y + CELL + 6, 13, p.judge === 'MISS' ? '#9aa3b5' : p.judge === 'GOOD' ? '#a78bfa' : '#ffb347');
  }
  ctx.fillStyle = '#3a4257'; ctx.fillRect(0, spike + 10, W, H - spike);
  ctx.fillStyle = '#c9cfdb'; ctx.beginPath();
  for (let x = 0; x < W; x += 22) { ctx.moveTo(x, spike + 12); ctx.lineTo(x + 11, spike); ctx.lineTo(x + 22, spike + 12); }
  ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(W / 2 - 16, spike + 30, 6, 0, Math.PI * 2); ctx.arc(W / 2 + 16, spike + 30, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7a4bd6'; ctx.beginPath(); ctx.arc(W / 2 - 16, spike + 31, 3, 0, Math.PI * 2); ctx.arc(W / 2 + 16, spike + 31, 3, 0, Math.PI * 2); ctx.fill();
  drawEffects(ctx, p.id);
  if (p.out) { ctx.fillStyle = '#000000aa'; ctx.fillRect(0, 0, W, H); label(ctx, `P${p.id + 1} LOST`, W / 2, H / 2, 26, '#c9cfdb'); }
  ctx.restore(); ctx.strokeStyle = PLAYER_HEX[p.id]; ctx.lineWidth = 2; roundedRect(ctx, 0, 0, W, H, 10); ctx.stroke();
  ctx.restore();
}
function renderPop3(ctx) {
  const count = state.players.length, time = Math.max(0, Math.ceil(state.timeLeft));
  ctx.fillStyle = '#1b1830'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  for (const p of state.players) renderWell(ctx, p, count);
  const combo = (p, x, y, align) => {
    label(ctx, `COMBO ${String(p.combo).padStart(3, '0')}`, x, y, 15, PLAYER_HEX[p.id], align, '"DM Mono"');
    label(ctx, `×${pop3Multiplier(p.combo).toFixed(1)}`, x, y + 24, 20, '#fff', align);
  };
  if (count === 1) {
    const x = 560;
    label(ctx, pop3Stage(state).name, x, 70, 20); label(ctx, 'SCORE', x, 130, 12, '#aeb5c4', 'center', '"DM Mono"'); label(ctx, String(state.score), x, 168, 34);
    label(ctx, state.rank || 'C', x, 262, 64, '#ffd543'); label(ctx, `${time}s`, x, 312, 18, '#aeb5c4');
    combo(state.players[0], x, 400, 'center');
  } else {
    label(ctx, pop3Stage(state).name, WIDTH / 2, 28, 15, '#aeb5c4'); label(ctx, String(state.score), WIDTH / 2, 64, 30);
    label(ctx, `${state.rank || 'C'} · ${time}s`, WIDTH / 2, 90, 15, '#ffd543');
    combo(state.players[0], 20, 44, 'left'); combo(state.players[1], WIDTH - 20, 44, 'right');
  }
  drawBanner(ctx);
}

function drawPiece(ctx, cells, x, y, size, alpha = 1) {
  for (const cell of cells) drawBlock(ctx, x + cell.dx * size, y + cell.dy * size, size - 5, cell.color, alpha);
}
function outlineCells(ctx, cells, col, row, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([7, 5]);
  for (const cell of cells) { const c = cellCentre(col + cell.dx, row + cell.dy); roundedRect(ctx, c.x - SURGE.CELL / 2 + 2, c.y - SURGE.CELL / 2 + 2, SURGE.CELL - 4, SURGE.CELL - 4, 9); ctx.stroke(); }
  ctx.setLineDash([]);
}
function drawEnemy(ctx, enemy) {
  const y = cellCentre(0, enemy.row).y, x = enemy.x, spec = SURGE.ENEMIES[enemy.type];
  if (enemy.type === 'sheep') {
    ctx.fillStyle = '#f4f1ea'; for (const [dx, dy] of [[-10, -6], [8, -8], [-4, 8], [11, 6], [0, 0]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 13, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#3b3340'; ctx.beginPath(); ctx.arc(x - 15, y, 8, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = enemy.type === 'hound' ? '#8a93b0' : '#b0566a'; ctx.beginPath();
    if (enemy.type === 'hound') ctx.ellipse(x, y, 22, 13, 0, 0, Math.PI * 2);
    else for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, r = i % 2 ? 12 : 20; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.fill();
    ctx.fillStyle = enemy.type === 'hound' ? '#1b2130' : '#ffd543'; ctx.beginPath(); ctx.arc(x - 9, y - 2, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = 0; i < enemy.hp && spec.hp > 1; i++) { ctx.fillStyle = '#ff5d6c'; ctx.fillRect(x - 14 + i * 10, y - 27, 8, 4); }
  if (enemy.gnaw > 0) { ctx.fillStyle = '#ffffff30'; ctx.fillRect(x - 16, y + 22, 32, 4); ctx.fillStyle = '#ffb347'; ctx.fillRect(x - 16, y + 22, 32 * enemy.gnaw / spec.gnaw, 4); }
}
function drawRabbit(ctx, p) {
  ctx.fillStyle = PLAYER_HEX[p.id];
  ctx.beginPath(); ctx.ellipse(p.x - 7, p.y - 20, 5, 13, -.2, 0, Math.PI * 2); ctx.ellipse(p.x + 7, p.y - 20, 5, 13, .2, 0, Math.PI * 2); ctx.fill();
  drawShip(ctx, p.x, p.y, 15, p.id);
}
function renderSurge(ctx) {
  const { COLS, ROWS, CELL, LEFT, TOP, BELT_TOP, BELT_BOTTOM, BELT_Y, BELT_CELL } = SURGE, right = LEFT + COLS * CELL, bottom = TOP + ROWS * CELL, stage = surgeStage(state);
  ctx.fillStyle = '#111824'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  label(ctx, `${state.level > SURGE.STAGES.length ? '∞' : `第 ${state.level} 关`} · ${stage.name}`, 24, 44, 20, '#fff', 'left');
  label(ctx, `${state.score} 分`, WIDTH - 24, 44, 20, '#ffd543', 'right');
  label(ctx, '← 传送带 · 点拼块抓取', 24, 78, 11, '#aeb5c4', 'left', '"DM Mono"');
  ctx.fillStyle = '#1c2536'; roundedRect(ctx, 0, BELT_TOP, WIDTH, BELT_BOTTOM - BELT_TOP, 0); ctx.fill();
  for (const piece of state.belt) drawPiece(ctx, piece.cells, piece.x, BELT_Y, BELT_CELL);
  ctx.fillStyle = '#1e2a3b'; roundedRect(ctx, LEFT, TOP, COLS * CELL, ROWS * CELL, 8); ctx.fill();
  ctx.strokeStyle = '#ffffff12'; ctx.lineWidth = 1; ctx.beginPath();
  for (let c = 1; c < COLS; c++) { ctx.moveTo(LEFT + c * CELL, TOP); ctx.lineTo(LEFT + c * CELL, bottom); }
  for (let r = 1; r < ROWS; r++) { ctx.moveTo(LEFT, TOP + r * CELL); ctx.lineTo(right, TOP + r * CELL); }
  ctx.stroke();
  for (let y = TOP; y < bottom; y += 18) { ctx.fillStyle = Math.floor((y - TOP) / 18) % 2 ? '#1b2130' : '#ffd543'; ctx.fillRect(LEFT - 12, y, 8, Math.min(18, bottom - y)); }
  for (let r = 0; r < ROWS; r++) label(ctx, '‹‹', right + 16, cellCentre(0, r).y + 6, 17, '#ff5d6c88');
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.board[r][c]) { const centre = cellCentre(c, r); drawBlock(ctx, centre.x, centre.y, CELL - 6, state.board[r][c]); }
  if (axeMode) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.board[r][c]) outlineCells(ctx, [{ dx: 0, dy: 0 }], c, r, '#ffd543');
  for (const shot of state.shots) { const y = cellCentre(0, shot.row).y; ctx.fillStyle = `${COLOR_HEX[shot.color]}55`; ctx.fillRect(shot.x - 34, y - 5, 34, 10); drawBall(ctx, shot.x, y, shot.color, 12); }
  for (const enemy of state.enemies) drawEnemy(ctx, enemy);
  if (hover?.cells) { drawPiece(ctx, hover.cells, cellCentre(hover.col, hover.row).x, cellCentre(hover.col, hover.row).y, CELL, .45); outlineCells(ctx, hover.cells, hover.col, hover.row, canPlace(state, hover.cells, hover.col, hover.row) ? '#44c986' : '#9aa3b5'); }
  else if (hover) outlineCells(ctx, [{ dx: 0, dy: 0 }], hover.col, hover.row, '#ffd543');
  for (const p of state.players) {
    if (p.held) {
      // Over the field the carried piece snaps to the grid, so its landing spot is never a guess.
      const cell = cellAt(p.x, p.y), over = p.y >= TOP && cell.col >= 0 && cell.col < COLS && cell.row < ROWS;
      if (over) { drawPiece(ctx, p.held.cells, cellCentre(cell.col, cell.row).x, cellCentre(cell.col, cell.row).y, CELL, .8); outlineCells(ctx, p.held.cells, cell.col, cell.row, canPlace(state, p.held.cells, cell.col, cell.row) ? '#44c986' : '#9aa3b5'); }
      else drawPiece(ctx, p.held.cells, p.x, p.y, BELT_CELL, .85);
    }
    drawRabbit(ctx, p);
    if (state.players.length > 1) label(ctx, `P${p.id + 1}`, p.x, p.y + 30, 11, PLAYER_HEX[p.id], 'center', '"DM Mono"');
  }
  drawEffects(ctx);
  const hud = bottom + 44;
  label(ctx, '防线', 24, hud, 13, '#aeb5c4', 'left');
  for (let i = 0; i < SURGE.LIVES; i++) label(ctx, '♥', 76 + i * 24, hud + 2, 22, i < state.lives ? '#ff5d6c' : '#ffffff25');
  label(ctx, `击退 ${state.defeated} / ${stage.total || '∞'}`, WIDTH / 2, hud, 15);
  label(ctx, `⚡ ${state.energy} / ${SURGE.MAX_ENERGY}`, WIDTH - 24, hud, 15, '#ffd543', 'right');
  ctx.fillStyle = '#ffffff18'; roundedRect(ctx, 24, hud + 22, WIDTH - 48, 12, 6); ctx.fill();
  ctx.fillStyle = '#ffd543'; roundedRect(ctx, 24, hud + 22, (WIDTH - 48) * state.energy / SURGE.MAX_ENERGY, 12, 6); ctx.fill();
  if (axeMode) label(ctx, '消消斧头：点一个方块，把它变成泡姆发射出去', WIDTH / 2, hud + 62, 13, '#ffd543');
  drawBanner(ctx);
}

function renderEnd(ctx) {
  ctx.fillStyle = '#0b0f18cc'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  label(ctx, state.phase === 'won' ? '完成！' : '回合结束', WIDTH / 2, HEIGHT / 2 - 30, 44);
  label(ctx, `${state.score} 分${mode === 'pop3' ? ` · 评价 ${state.rank || 'C'}` : ''}`, WIDTH / 2, HEIGHT / 2 + 18, 22, '#ffd543');
  label(ctx, lan.role === 'guest' ? '等待房主重新开始' : '点击画面重新开始', WIDTH / 2, HEIGHT / 2 + 62, 15, '#aeb5c4');
}
function hudLine() {
  const tail = state.phase === 'playing' ? '' : state.phase === 'won' ? ' · 完成！' : ' · 回合结束';
  if (mode === 'pop2') return `${state.score} 分 · 已消除 ${state.cleared}${tail}`;
  if (mode === 'pop3') return `${state.score} 分 · 评价 ${state.rank || 'C'} · ${Math.max(0, Math.ceil(state.timeLeft))}s${tail}`;
  return `${state.score} 分 · 防线 ${state.lives} · 击退 ${state.defeated}/${surgeStage(state).total || '∞'}${tail}`;
}
function renderGame() {
  const canvas = $('.game-canvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!state) {
    ctx.fillStyle = '#111824'; ctx.fillRect(0, 0, WIDTH, HEIGHT); label(ctx, '等待房主同步棋盘……', WIDTH / 2, HEIGHT / 2, 24);
    return;
  }
  if (mode === 'pop2') renderPop2(ctx); else if (mode === 'pop3') renderPop3(ctx); else renderSurge(ctx);
  if (state.phase === 'playing') endedAt = 0; else { endedAt ||= performance.now(); renderEnd(ctx); }
  const text = hudLine();
  if (text !== hudText) { hudText = text; $('#score-text').textContent = text; }
  // A short buzz on every clear, where the device supports it.
  const clear = state.effects.findLast?.(item => item.type === 'text');
  if (clear && clear.time > buzzedAt) { buzzedAt = clear.time; navigator.vibrate?.(12); } else if (!clear) buzzedAt = 0;
  setupControls();
}
function setupControls() {
  const controls = $('#mobile-controls'); if (!controls || !state) return;
  const affordable = mode === 'surge' && state.energy >= SURGE.AXE_COST;
  const next = [mode, lan.role, state.players.length, activePlayer, axeMode, affordable].join('|');
  if (next === controlsKey) return;
  controlsKey = next; controls.innerHTML = '';
  $('#seat-text').textContent = `${MODE_META[mode].label} · ${lan.role === 'guest' ? '玩家 2' : lan.role === 'host' ? '房主 / 玩家 1' : state.players.length === 1 ? '单人' : '同屏双人'}`;
  const button = (text, run, className = '', instant = false) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.className = className;
    // Rhythm taps fire on touch-down; waiting for the click would cost the beat.
    node.addEventListener(instant ? 'pointerdown' : 'click', (event) => { if (instant) event.preventDefault(); run(); }); controls.appendChild(node); return node;
  };
  if (lan.role === 'solo') button(state.players.length === 1 ? '单人 · 切换同屏双人' : '同屏双人 · 切换单人', () => { soloPlayers = soloPlayers === 1 ? 2 : 1; activePlayer = 0; restartGame(); }, 'player-toggle');
  if (mode === 'pop3') for (const seat of localPlayers()) button(localPlayers().length > 1 ? `P${seat + 1} 打拍` : '打拍', () => sendAction(seat, { type: 'beat' }), 'beat', true);
  if (mode === 'surge') {
    if (lan.role === 'solo' && state.players.length > 1) button(`操作 P${activePlayer + 1}`, () => { activePlayer = activePlayer ? 0 : 1; }, 'player-toggle');
    button('旋转 ⟳', () => sendAction(activePlayer, { type: 'rotate' }));
    button('抓 / 放', () => sendAction(activePlayer, { type: 'grab' }));
    button(`斧头 ⚡${SURGE.AXE_COST}`, () => { axeMode = !axeMode; }, axeMode ? 'selected' : '').disabled = !affordable && !axeMode;
  }
}

function resizeCanvas() {
  const canvas = $('.game-canvas'); if (!canvas) return; const ratio = Math.min(2, window.devicePixelRatio || 1); canvas.width = WIDTH * ratio; canvas.height = HEIGHT * ratio; canvas.style.aspectRatio = `${WIDTH} / ${HEIGHT}`; canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
}
function loop(time) {
  const dt = lastFrame ? Math.min(.05, (time - lastFrame) / 1000) : 1 / 60; lastFrame = time;
  if (state && $('#game').classList.contains('active')) {
    steerFromKeys();
    // Guests tick too, so motion stays smooth between the host's snapshots.
    tickGame(state, dt);
    broadcastSnapshot();
    renderGame();
  }
  frameId = requestAnimationFrame(loop);
}

$$('.arcade-card').forEach((card) => card.addEventListener('click', () => startGame(card.dataset.mode)));
$('#open-link').addEventListener('click', openLink); $('#game-link').addEventListener('click', openLink); $('#close-link').addEventListener('click', closeLink); $('#how-link').addEventListener('click', openLink);
$('#back-home').addEventListener('click', () => { showScreen('home'); });
$('#create-room').addEventListener('click', createRoom); $('#join-room').addEventListener('click', joinRoom); $('#leave-room').addEventListener('click', disconnect);
$('#make-offer').addEventListener('click', makeOffer); $('#make-answer').addEventListener('click', makeAnswer); $('#finish-answer').addEventListener('click', finishAnswer);
$$('[data-copy]').forEach((node) => node.addEventListener('click', async () => { const target = $(`#${node.dataset.copy}`); await navigator.clipboard?.writeText(target.value); setHint('已复制到剪贴板。'); }));
$$('.tab').forEach((tab) => tab.addEventListener('click', () => { $$('.tab').forEach((other) => other.classList.toggle('active', other === tab)); $('#server-panel').classList.toggle('active', tab.dataset.tab === 'server'); $('#webrtc-panel').classList.toggle('active', tab.dataset.tab === 'webrtc'); }));
$('#lan-server-url').value = new URLSearchParams(location.search).get('lan') || localStorage.getItem('pao-lan-server') || location.origin;
for (const type of ['pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, type === 'pointermove' ? pointerMove : pointerUp, { passive: false });
document.addEventListener('keydown', keyboard); document.addEventListener('keyup', keyboard);
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resizeCanvas); window.addEventListener('beforeunload', () => { closeEvents(); rtc.peer?.close(); });
// Read-only handle for end-to-end tests and debugging in the console.
window.__arcade = { get state() { return state; }, get mode() { return mode; } };
showScreen('home'); cancelAnimationFrame(frameId); frameId = requestAnimationFrame(loop);
