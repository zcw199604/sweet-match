import { act, cellCenter, COLORS, CANNON_Y, COLS, HEIGHT, MODES, RADIUS, ROWS, SURGE_COLS, SURGE_ROWS, WIDTH, createGame, tickGame } from './game-core.js';

const MODE_META = {
  pop2: { label: 'ARCADE 01', title: '泡噗 2', help: '拖动瞄准，松手发射；S / 换球可以切换下一颗泡泡。' },
  pop3: { label: 'ARCADE 02', title: '泡噗 3', help: '绕开石块并连续命中，六次失误会让泡泡墙上升。' },
  surge: { label: 'ARCADE 03', title: '山山兔队长大作战：泡姆狂潮', help: '选择列抓取同色堆，再放回列中形成三连；两名玩家共用一局。' }
};
const COLOR_HEX = { pink: '#ff5d80', cyan: '#58d4de', yellow: '#ffd543', violet: '#8e7bff', stone: '#798093' };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let mode = 'pop2';
let state = null;
let frameId = 0;
let lastFrame = 0;
let lastSnapshot = 0;
let activePlayer = 0;
let pointerActive = false;
let lan = { role: 'solo', token: null, code: null, base: '', source: null, events: null };
let rtc = { peer: null, channel: null };

function showScreen(id) {
  $$('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === id));
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
    broadcastSnapshot(true);
  } else if (message.type === 'snapshot' && lan.role === 'guest' && message.state) {
    state = message.state;
    mode = modeForState(state);
    activePlayer = 1;
    const meta = MODE_META[mode];
    $('#mode-label').textContent = meta.label;
    $('#game-title').textContent = meta.title;
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

function startGame(nextMode) {
  mode = nextMode; const meta = MODE_META[mode]; $('#mode-label').textContent = meta.label; $('#game-title').textContent = meta.title;
  activePlayer = lan.role === 'guest' ? 1 : 0;
  state = createGame(mode, (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0);
  if (lan.role === 'guest') { state = null; setHint('已进入房间，等待房主同步棋盘。'); }
  showScreen('game'); renderGame(); if (lan.role === 'host') broadcastSnapshot(true);
}
function restartGame() {
  if (lan.role === 'guest') return setHint('请由房主重新开始。', true);
  state = createGame(mode, (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0); broadcastSnapshot(true); renderGame();
}
function currentPlayerForPoint(x) { return mode === 'surge' ? activePlayer : (x < WIDTH / 2 ? 0 : 1); }
function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * WIDTH / rect.width, y: (event.clientY - rect.top) * HEIGHT / rect.height };
}
function sendAction(player, action) {
  if (!state) return;
  if (lan.role === 'guest') sendNetwork({ type: 'action', player: 1, action });
  else { if (act(state, player, action)) broadcastSnapshot(true); }
  renderGame();
}
function pointerDown(event) {
  if (!state || mode === 'surge') return;
  event.preventDefault(); const point = canvasPoint(event.currentTarget, event); activePlayer = currentPlayerForPoint(point.x); pointerActive = true; sendAction(activePlayer, { type: 'aim', x: point.x, y: point.y }); event.currentTarget.setPointerCapture?.(event.pointerId);
}
function pointerMove(event) {
  if (!pointerActive || !state || mode === 'surge') return;
  event.preventDefault(); const point = canvasPoint(event.currentTarget, event); sendAction(activePlayer, { type: 'aim', x: point.x, y: point.y });
}
function pointerUp(event) {
  if (!pointerActive || !state || mode === 'surge') return;
  event.preventDefault(); pointerActive = false; sendAction(activePlayer, { type: 'fire' });
}
function keyboard(event) {
  if (!state || !$('#game').classList.contains('active')) return;
  const key = event.key.toLowerCase();
  if (mode === 'surge') {
    if (key === 'a' || key === 'arrowleft') { event.preventDefault(); sendAction(activePlayer, { type: 'column', col: Math.max(0, state.players[activePlayer].column - 1) }); }
    if (key === 'd' || key === 'arrowright') { event.preventDefault(); sendAction(activePlayer, { type: 'column', col: Math.min(SURGE_COLS - 1, state.players[activePlayer].column + 1) }); }
    if (key === ' ') { event.preventDefault(); sendAction(activePlayer, { type: 'grab' }); }
    if (key === 'enter') { event.preventDefault(); sendAction(activePlayer, { type: 'fire' }); }
  } else {
    if (key === 's') { event.preventDefault(); sendAction(activePlayer, { type: 'swap' }); }
    if (key === ' ') { event.preventDefault(); sendAction(activePlayer, { type: 'fire' }); }
  }
}

function drawBubble(ctx, x, y, color, radius = RADIUS) {
  const gradient = ctx.createRadialGradient(x - radius * .35, y - radius * .4, radius * .08, x, y, radius * 1.2);
  gradient.addColorStop(0, '#ffffffcc'); gradient.addColorStop(.18, COLOR_HEX[color] || COLOR_HEX.stone); gradient.addColorStop(1, '#10152255');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ffffff40'; ctx.stroke();
}
function drawBoardBackground(ctx, title) {
  ctx.fillStyle = '#111824'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = '#1e2a3b'; ctx.fillRect(18, 18, WIDTH - 36, HEIGHT - 36);
  ctx.fillStyle = '#aeb5c430'; ctx.font = '12px "DM Mono"'; ctx.fillText(title, 36, 55);
}
function drawPlayer(ctx, player, index) {
  const x = player.x, y = player.y; const angle = Math.atan2(player.aimY - y, player.aimX - x);
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.fillStyle = index ? '#8e7bff' : '#58d4de'; ctx.fillRect(-9, -10, 38, 20); ctx.fillStyle = '#ffffff30'; ctx.fillRect(16, -6, 9, 12); ctx.restore();
  ctx.fillStyle = '#fff'; ctx.font = '11px "DM Mono"'; ctx.textAlign = 'center'; ctx.fillText(`P${index + 1}`, x, y + 34); ctx.textAlign = 'left';
  drawBubble(ctx, x - 28, y, player.current, 16);
}
function renderPop(ctx) {
  drawBoardBackground(ctx, mode === 'pop3' ? 'BOUNCE / STONE FIELD' : 'MATCH 3 / PLANET DEFENSE');
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const value = state.board[r][c]; if (!value) continue; const point = cellCenter(r, c); if (value === 'stone') { ctx.fillStyle = COLOR_HEX.stone; ctx.fillRect(point.x - 17, point.y - 17, 34, 34); ctx.fillStyle = '#ffffff24'; ctx.fillRect(point.x - 10, point.y - 11, 11, 5); } else drawBubble(ctx, point.x, point.y, value); }
  ctx.strokeStyle = '#58d4de22'; ctx.setLineDash([6, 6]); for (const player of state.players) { ctx.beginPath(); ctx.moveTo(player.x, player.y - 20); ctx.lineTo(player.aimX, player.aimY); ctx.stroke(); } ctx.setLineDash([]);
  for (const shot of state.projectiles) drawBubble(ctx, shot.x, shot.y, shot.color, 15);
  for (const player of state.players) drawPlayer(ctx, player, player.id);
  ctx.fillStyle = '#ff5d8040'; ctx.fillRect(25, CANNON_Y + 42, WIDTH - 50, 2);
}
function renderSurge(ctx) {
  drawBoardBackground(ctx, 'RISING STACK / CO-OP'); const left = 140, top = 92, cellW = 44, cellH = 39;
  ctx.strokeStyle = '#ffffff12'; ctx.lineWidth = 1; for (let c = 0; c <= SURGE_COLS; c++) { ctx.beginPath(); ctx.moveTo(left + c * cellW, top); ctx.lineTo(left + c * cellW, top + SURGE_ROWS * cellH); ctx.stroke(); }
  for (let r = 0; r <= SURGE_ROWS; r++) { ctx.beginPath(); ctx.moveTo(left, top + r * cellH); ctx.lineTo(left + SURGE_COLS * cellW, top + r * cellH); ctx.stroke(); }
  for (let r = 0; r < SURGE_ROWS; r++) for (let c = 0; c < SURGE_COLS; c++) if (state.board[r][c]) drawBubble(ctx, left + c * cellW + cellW / 2, top + r * cellH + cellH / 2, state.board[r][c], 17);
  for (const player of state.players) { const x = left + player.column * cellW + cellW / 2; ctx.fillStyle = player.id ? '#8e7bff' : '#58d4de'; ctx.fillRect(x - 18, top + SURGE_ROWS * cellH + 13, 36, 7); ctx.fillStyle = '#fff'; ctx.font = '10px "DM Mono"'; ctx.textAlign = 'center'; ctx.fillText(`P${player.id + 1}`, x, top + SURGE_ROWS * cellH + 38); for (let i = 0; i < player.held.length; i++) drawBubble(ctx, x, 55 - i * 28, player.held[i], 12); }
  ctx.textAlign = 'left';
}
function renderGame() {
  const stage = $('#game-stage'); if (!stage) return;
  const meta = MODE_META[mode];
  if (!stage.querySelector('canvas')) {
    stage.innerHTML = `<div class="stage-top"><div><span>${meta.label} · ${lan.role === 'guest' ? '玩家 2' : lan.role === 'host' ? '房主 / 玩家 1' : '单机双人'}</span><strong id="score-text">0</strong></div><button id="restart-game">重新开始</button></div><div class="canvas-wrap"><canvas class="game-canvas" width="720" height="720" tabindex="0" aria-label="${meta.title} 游戏画布"></canvas></div><div class="mobile-controls" id="mobile-controls"></div><p class="game-help">${meta.help}</p>`;
    stage.querySelector('canvas').addEventListener('pointerdown', pointerDown);
    $('#restart-game').addEventListener('click', restartGame);
    resizeCanvas();
  }
  const canvas = stage.querySelector('canvas'); const ctx = canvas.getContext('2d');
  if (state) { if (mode === 'surge') renderSurge(ctx); else renderPop(ctx); $('#score-text').textContent = `${state.score} 分 · ${state.phase === 'playing' ? `危险 ${Math.ceil(state.riseIn)}s` : state.phase === 'won' ? '完成！' : '回合结束'}`; }
  else { drawBoardBackground(ctx, 'WAITING FOR HOST'); ctx.fillStyle = '#fff'; ctx.font = '24px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('等待房主同步棋盘……', WIDTH / 2, HEIGHT / 2); ctx.textAlign = 'left'; }
  setupControls();
}
function setupControls() {
  const controls = $('#mobile-controls'); if (!controls || !state) return;
  const player = activePlayer; controls.innerHTML = '';
  const button = (text, action, className = '') => { const node = document.createElement('button'); node.textContent = text; node.className = className; node.addEventListener('click', () => sendAction(player, action)); controls.appendChild(node); };
  if (lan.role === 'solo') { const playerButton = document.createElement('button'); playerButton.textContent = `操作 P${player + 1}`; playerButton.className = 'player-toggle'; playerButton.addEventListener('click', () => { activePlayer = activePlayer ? 0 : 1; setupControls(); }); controls.appendChild(playerButton); }
  if (mode === 'surge') {
    button('←', { type: 'column', col: Math.max(0, state.players[player].column - 1) }); button(`第 ${state.players[player].column + 1} 列`, { type: 'column', col: state.players[player].column }, 'selected'); button('→', { type: 'column', col: Math.min(SURGE_COLS - 1, state.players[player].column + 1) }); button('抓取', { type: 'grab' }); button('发射', { type: 'fire' });
  } else {
    for (const color of COLORS) { const node = document.createElement('button'); node.className = `color-dot${state.players[player].current === color ? ' selected' : ''}`; node.style.background = COLOR_HEX[color]; node.title = color; node.setAttribute('aria-label', `选择${color}`); node.addEventListener('click', () => sendAction(player, { type: 'select', color })); controls.appendChild(node); }
    button('换球', { type: 'swap' }); button('发射', { type: 'fire' });
  }
}

function resizeCanvas() {
  const canvas = $('.game-canvas'); if (!canvas) return; const ratio = Math.min(2, window.devicePixelRatio || 1); canvas.width = WIDTH * ratio; canvas.height = HEIGHT * ratio; canvas.style.aspectRatio = `${WIDTH} / ${HEIGHT}`; canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
}
function loop(time) {
  const dt = lastFrame ? Math.min(.05, (time - lastFrame) / 1000) : 1 / 60; lastFrame = time;
  if (state && (lan.role === 'solo' || lan.role === 'host')) { tickGame(state, dt); broadcastSnapshot(); }
  if ($('#game').classList.contains('active')) renderGame(); frameId = requestAnimationFrame(loop);
}

$$('.arcade-card').forEach((card) => card.addEventListener('click', () => startGame(card.dataset.mode)));
$('#open-link').addEventListener('click', openLink); $('#game-link').addEventListener('click', openLink); $('#close-link').addEventListener('click', closeLink); $('#how-link').addEventListener('click', openLink);
$('#back-home').addEventListener('click', () => { showScreen('home'); });
$('#create-room').addEventListener('click', createRoom); $('#join-room').addEventListener('click', joinRoom); $('#leave-room').addEventListener('click', disconnect);
$('#make-offer').addEventListener('click', makeOffer); $('#make-answer').addEventListener('click', makeAnswer); $('#finish-answer').addEventListener('click', finishAnswer);
$$('[data-copy]').forEach((node) => node.addEventListener('click', async () => { const target = $(`#${node.dataset.copy}`); await navigator.clipboard?.writeText(target.value); setHint('已复制到剪贴板。'); }));
$$('.tab').forEach((tab) => tab.addEventListener('click', () => { $$('.tab').forEach((other) => other.classList.toggle('active', other === tab)); $('#server-panel').classList.toggle('active', tab.dataset.tab === 'server'); $('#webrtc-panel').classList.toggle('active', tab.dataset.tab === 'webrtc'); }));
$('#lan-server-url').value = new URLSearchParams(location.search).get('lan') || localStorage.getItem('pao-lan-server') || location.origin;
document.addEventListener('pointermove', pointerMove, { passive: false }); document.addEventListener('pointerup', pointerUp, { passive: false }); document.addEventListener('keydown', keyboard);
window.addEventListener('resize', resizeCanvas); window.addEventListener('beforeunload', () => { closeEvents(); rtc.peer?.close(); });
showScreen('home'); cancelAnimationFrame(frameId); frameId = requestAnimationFrame(loop);
