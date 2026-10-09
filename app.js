import { act, beatPhase, BLAST, blastCellAt, blastCellCentre, blastHasValidPlacement, blastMultiplier, blastPreviewLines, blastSnap, canPlace, cellAt, cellCentre, createGame, hexOffset, HEIGHT, MODES, pieceCentre, POP2, POP3, pop3Clock, pop3Multiplier, pop3Speed, pop3Stage, pop3Width, SURGE, surgeStage, tickGame, WIDTH } from './game-core.js';
import {
  drawBall, drawBlastBackdrop, drawBlastBeam, drawBlastBoard, drawBlastCallout, drawBlastGhost, drawBlastLineHint, drawBlastShatter,
  drawBlastSlot, drawBlastTile, drawBlock, drawBelt, drawBurst,
  drawClubBackdrop, drawDefence, drawEnemy, drawField,
  drawFloatingText, drawMeadowBackdrop, drawPortal, drawRabbit, drawShip, drawSparkle,
  drawStat, drawThruster, drawWell, glow, panel, resetArtCaches, roundRect, SHADES, withAlpha
} from './art.js';
import { initBoard, openBoard, reportScore } from './leaderboard.js';
import { initActivity, trackActivity } from './activity.js';
import { initRecent, noteOpened, showRecent } from './recent.js';
import {
  ballPainter, ballShades, DEFAULT_THEME, drawThemeArena, drawThemeBackdrop, drawThemeBase, drawThemeCraft,
  drawThemeThruster, isTheme, paintThemeChip, resetThemeCaches, THEMES, themeById
} from './themes.js';

const MODE_META = {
  pop2: { label: 'ARCADE 01', title: '泡噗 2', help: '拖动屏幕驾驶飞船，接住飘来的彩球。三个同色相连就会消除，挂在上面的也一起掉；飞船可以直接穿过星球，但彩球碰到星球就失败。' },
  pop3: { label: 'ARCADE 02', title: '泡噗 3', help: '拖动飞船接住落下的音符，三个同色相连消除。漏掉的音符会让底部的怪鼠上升，消除能把它压回去；跟着光圈点「打拍」累积连击倍率。' },
  surge: { label: 'ARCADE 03', title: '山山兔队长大作战：泡姆狂潮', help: '点传送带上的拼块，再点场地格子放下（也可以直接拖过去）。三个同色相连会变成泡姆沿所在行向右发射，击退敌人。' },
  blast: { label: 'ARCADE 04', title: '方块爆破', help: '把托盘里的拼块拖进 10×10 棋盘。整行或整列填满就会消除，一次消多行还有额外奖励；连续几手都能消除，分数倍率会一路涨。三个拼块都用完会补上新的一批，托盘里一个都放不下时回合结束。' },
  quest: { label: 'ARCADE 06', title: '三消勇者团', help: '交换相邻方块，三个同色相连就会让对应的英雄出手：⚔ 战士砍人、✦ 法师放穿透魔法、⛨ 盾卫举盾并嘲讽、✚ 牧师治疗。连成 4 个技能升级，5 个是大招；连一次 4 连以上还能多走一步。敌人头上会预告下一招，盾卫和牧师倒下了，他们的方块就没用了。点敌人可以换集火目标，一共 50 关，分成 5 章，每章最后（第 10、20、30、40、50 关）是首领。' },
  park: { label: 'ARCADE 07', title: '挪车接客', help: '点一辆车让它沿车顶的箭头开出去：前面没有挡路的车才开得动。开出来的车停进上方五个车位，候车区排在最前面的乘客会上同色的车，坐满就开走。车位停满、前面的乘客又找不到自己的车就输了，先看队伍里谁在前面，再决定挪哪辆。一共 30 关，点「提示」会让一辆不会死局的车闪一下。' },
  pour: { label: 'ARCADE 08', title: '倒水排序', help: '点一个瓶子再点另一个，把它顶上那一段同色的水倒过去：目标瓶要么是空的，要么顶上是同样的颜色，还得有空位。一瓶倒满同一种颜色就会封口收进上方的收集架，全部收集完过关。倒不动时用下面的道具：回退一步、加一个空瓶、打乱重排、提示一步；这些每关次数有限，用得越少星级越高，步数不超过「最少步数」是三星。一共 50 关，越往后颜色越多、空瓶越少；进度会保存在这台设备上。' },
  goose: { label: 'ARCADE 05', title: '抓大鹅', help: '点碗里的物品把它放进下方 7 格暂存栏，凑齐 3 个同样的就会消除。经典模式清空整碗即通关；无尽模式限时 60 秒，每消一组加 2 秒，碗里快空了会自动补货。暂存栏塞满 7 个就失败；够不着底下的东西时点「晃一下」。' }
};
// 抓大鹅, 方块爆破, 三消勇者团, 挪车接客 and 倒水排序 are solo games: no seats, no snapshots, no co-op toggle.
const SOLO_ONLY = ['blast', 'goose', 'quest', 'park', 'pour'];
const PLAYER_HEX = ['#58d4de', '#ff9d5c'];
const DRAG_GAIN = 1.25;
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let mode = 'pop2';
// The 泡噗2 skin is a per-device view choice, so it never reaches game-core or
// the network: each side of a co-op round may watch a different theme.
let theme = DEFAULT_THEME;
let state = null;
let frameId = 0;
let lastFrame = 0;
let lastSnapshot = 0;
let activePlayer = 0;
let soloPlayers = 1;
let axeMode = false;
let hover = null;
// 方块爆破's drag is pure view state: game-core only ever sees the committed
// placement, never where the finger was.
let blastDrag = null;
let blastBest = 0;
// The best score as it stood when this round began, so the end card can tell a
// new record from an old one; and the on-canvas score, which rolls up to the real one.
let blastPrevBest = 0;
let blastShown = 0;
let blastShownAt = 0;
// 抓大鹅 runs its own 3D view (goose.js, loaded on first use) with its own loop;
// app.js only builds the frame around it and tears it down on the way out.
let goose = null;
let gooseToken = 0;
let gooseMode = 'classic';
// 三消勇者团 is plain DOM (quest.js, loaded on first use); app.js only frames it.
let quest = null;
let questToken = 0;
// 挪车接客 is one canvas (park.js, loaded on first use); app.js only frames it.
let park = null;
let parkToken = 0;
// 倒水排序 is one canvas (pour.js, loaded on first use); app.js only frames it.
let pour = null;
let pourToken = 0;
// 泡噗3 无尽模式: the choice is remembered, and so is the best single-player score.
let pop3Endless = false;
let pop3Best = 0;
let pop3PrevBest = 0;
// 全球榜单：这一局结算后显示在结算卡片上的一行字（提交中 / 名次 / 连不上），每局开始时清空。
let lbStatus = '';
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
  if (id !== 'game') { stopGoose(); stopQuest(); stopPark(); }
  $$('.screen').forEach((screen) => screen.classList.toggle('active', screen.id === id));
  document.body.classList.toggle('playing', id === 'game');
  // The home page may have been scrolled to reach a card; the board must start in view.
  window.scrollTo(0, 0);
  if (id === 'home') history.replaceState(null, '', '#home');
  else if (id === 'game') history.replaceState(null, '', `#game/${mode}`);
  if (id === 'home') showRecent();
  syncActivity();
}
// 游玩记录：在游戏界面里就按当前榜单 id 计时，离开就停。模式切换（泡噗3、抓大鹅）后也要调一次。
function syncActivity() { trackActivity(document.body.classList.contains('playing') ? boardId() : null); }
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
    if (changed) { buildStage(); syncActivity(); }
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

// 方块爆破 is a solo puzzle, so it always gets one seat whatever the co-op toggle says.
const newGame = () => {
  const players = mode === 'blast' ? 1 : lan.role === 'solo' ? soloPlayers : 2;
  // Alone on an upright phone, 泡噗3 widens its well to use the screen's width.
  return createGame(mode, (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0, { players, endless: mode === 'pop3' && pop3Endless && lan.role === 'solo', cols: players === 1 && phoneUpright.matches ? POP3.WIDE_COLS : POP3.COLS });
};
// 泡噗2's rules read the same whatever the skin, so the help line names whatever
// the current theme actually put on the board.
function pop2Help() {
  const skin = themeById(theme);
  return `拖动屏幕驾驶${skin.craftName}，接住飘来的${skin.pieceName}。三个同色相连就会消除，挂在上面的也一起掉；${skin.craftName}可以直接飞过${skin.baseName}，但飘来的和挂在身上的${skin.pieceName}碰到${skin.baseName}都会失败。`;
}
const POP3_ENDLESS_HELP = '无尽模式没有倒计时和关卡：音符会越落越快，一直玩到碰到尖刺为止。照样拖动飞船接音符、三个同色相连消除，点「打拍」累积连击倍率；单人的最高分会记在本机。';
function stageHelp() { return mode === 'pop2' ? pop2Help() : mode === 'pop3' && state?.endless ? POP3_ENDLESS_HELP : MODE_META[mode].help; }

function buildStage() {
  const meta = MODE_META[mode], stage = $('#game-stage');
  $('#mode-label').textContent = meta.label; $('#game-title').textContent = meta.title;
  // Lets the stylesheet give one board its own page layout (方块爆破 goes edge to edge on phones).
  document.body.dataset.mode = mode;
  stopGoose();
  stopQuest();
  stopPark();
  stopPour();
  if (mode === 'goose') return buildGooseStage(stage, meta);
  if (mode === 'quest') return buildQuestStage(stage, meta);
  if (mode === 'park') return buildParkStage(stage, meta);
  if (mode === 'pour') return buildPourStage(stage, meta);
  // Only 泡噗2 is reskinned, so only that board gets the picker.
  const picker = mode === 'pop2' ? '<div class="theme-row" id="theme-row"></div>' : '';
  stage.innerHTML = `<div class="stage-top"><div><span id="seat-text"></span><strong id="score-text">0 分</strong></div><div class="stage-actions">${picker}<button id="restart-game">重新开始</button></div></div><div class="canvas-wrap${viewHeight() === HEIGHT ? '' : ' portrait'}" style="--h:${viewHeight()}"><canvas class="game-canvas" width="720" height="${viewHeight()}" tabindex="0" aria-label="${meta.title} 游戏画布"></canvas></div><div class="mobile-controls" id="mobile-controls"></div><p class="game-help">${stageHelp()}</p>`;
  const canvas = stage.querySelector('canvas');
  canvas.addEventListener('pointerdown', pointerDown);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  $('#restart-game').addEventListener('click', restartGame);
  controlsKey = ''; hudText = ''; axeMode = false; hover = null; pointers.clear(); blastDrag = null;
  themeChips($('#theme-row'));
  resizeCanvas();
}
function startGame(nextMode) {
  // A guest renders whatever the host broadcasts, so the solo puzzles stay off the network.
  if (SOLO_ONLY.includes(nextMode) && lan.role !== 'solo') return setHint(`${MODE_META[nextMode].title}是单机游戏，请先断开连接。`, true);
  mode = nextMode; activePlayer = lan.role === 'guest' ? 1 : 0;
  noteOpened(mode);
  // The 2D loop idles while state is null, which leaves the frame to goose.js.
  if (mode === 'goose' || mode === 'quest' || mode === 'park' || mode === 'pour') { state = null; buildStage(); showScreen('game'); return; }
  // Read the saved skin before the first frame draws.
  applyStoredTheme();
  state = lan.role === 'guest' ? null : newGame(); resetBlastView();
  if (lan.role === 'guest') setHint('已进入房间，等待房主同步棋盘。');
  buildStage(); showScreen('game'); renderGame(); if (lan.role === 'host') broadcastSnapshot(true);
}
function restartGame() {
  if (lan.role === 'guest') return setHint('请由房主重新开始。', true);
  state = newGame(); axeMode = false; hover = null; controlsKey = ''; resetBlastView(); broadcastSnapshot(true); renderGame();
}
function stopGoose() {
  gooseToken += 1;
  goose?.destroy();
  goose = null;
}
function stopQuest() {
  questToken += 1;
  quest?.destroy();
  quest = null;
}
function stopPark() {
  parkToken += 1;
  park?.destroy();
  park = null;
}
function buildParkStage(stage, meta) {
  stage.innerHTML = `<div class="stage-top"><div><span id="seat-text">${meta.label} · 单人</span><strong id="score-text">正在加载……</strong></div><div class="stage-actions"><button type="button" id="park-hint">提示</button><button id="restart-game">重新开始</button></div></div><div class="canvas-wrap park-wrap"></div><p class="game-help">${meta.help}</p>`;
  $('#restart-game').addEventListener('click', () => park?.restart());
  $('#park-hint').addEventListener('click', () => park?.hint());
  mountParkView(stage.querySelector('.park-wrap'));
}
async function mountParkView(wrap) {
  const token = parkToken;
  try {
    const { mountPark } = await import('./park.js');
    // The player left (or rebuilt the stage) while the module was loading.
    if (token !== parkToken) return;
    park = mountPark(wrap, { onHud: (text) => { $('#score-text').textContent = text; }, onResult: reportScore });
  } catch (error) {
    if (token !== parkToken) return;
    console.error(error);
    wrap.innerHTML = '<p class="quest-loading">游戏加载失败，请刷新页面重试。</p>';
  }
}
function stopPour() {
  pourToken += 1;
  pour?.destroy();
  pour = null;
}
function buildPourStage(stage, meta) {
  stage.innerHTML = `<div class="stage-top"><div><span id="seat-text">${meta.label} · 单人</span><strong id="score-text">正在加载……</strong></div><div class="stage-actions"><button id="restart-game">重新开始</button></div></div><div class="canvas-wrap pour-wrap"></div><p class="game-help">${meta.help}</p>`;
  $('#restart-game').addEventListener('click', () => pour?.restart());
  mountPourView(stage.querySelector('.pour-wrap'));
}
async function mountPourView(wrap) {
  const token = pourToken;
  try {
    const { mountPour } = await import('./pour.js');
    // The player left (or rebuilt the stage) while the module was loading.
    if (token !== pourToken) return;
    pour = mountPour(wrap, { onHud: (text) => { $('#score-text').textContent = text; }, onResult: reportScore });
  } catch (error) {
    if (token !== pourToken) return;
    console.error(error);
    wrap.innerHTML = '<p class="quest-loading">游戏加载失败，请刷新页面重试。</p>';
  }
}
function buildQuestStage(stage, meta) {
  stage.innerHTML = `<div class="stage-top"><div><span id="seat-text">${meta.label} · 单人</span><strong id="score-text">正在加载……</strong></div><div class="stage-actions"><button id="restart-game">重新开始</button></div></div><div class="canvas-wrap quest-wrap"></div><div class="mobile-controls" id="mobile-controls"><button type="button" id="quest-hint">提示</button></div><p class="game-help">${meta.help}</p>`;
  $('#restart-game').addEventListener('click', () => quest?.restart());
  $('#quest-hint').addEventListener('click', () => quest?.hint());
  mountQuestView(stage.querySelector('.quest-wrap'));
}
async function mountQuestView(wrap) {
  const token = questToken;
  try {
    const { mountQuest } = await import('./quest.js');
    // The player left (or rebuilt the stage) while the module was loading.
    if (token !== questToken) return;
    quest = mountQuest(wrap, { onHud: (text) => { $('#score-text').textContent = text; }, onResult: reportScore });
  } catch (error) {
    if (token !== questToken) return;
    console.error(error);
    wrap.innerHTML = '<p class="quest-loading">游戏加载失败，请刷新页面重试。</p>';
  }
}
function gooseModeLabel() { return gooseMode === 'classic' ? '经典模式 · 切换无尽' : '无尽模式 · 切换经典'; }
function buildGooseStage(stage, meta) {
  stage.innerHTML = `<div class="stage-top"><div><span id="seat-text">${meta.label} · 单人</span><strong id="score-text">正在加载……</strong></div><div class="stage-actions"><button id="restart-game">重新开始</button></div></div><div class="canvas-wrap goose-wrap"></div><div class="mobile-controls" id="mobile-controls"><button type="button" id="goose-shake">晃一下</button><button type="button" class="player-toggle" id="goose-mode">${gooseModeLabel()}</button></div><p class="game-help">${meta.help}</p>`;
  $('#restart-game').addEventListener('click', () => goose?.restart(gooseMode));
  $('#goose-shake').addEventListener('click', () => goose?.shake());
  $('#goose-mode').addEventListener('click', (event) => {
    gooseMode = gooseMode === 'classic' ? 'endless' : 'classic';
    try { localStorage.setItem('pao-goose-mode', gooseMode); } catch { /* private mode */ }
    event.currentTarget.textContent = gooseModeLabel();
    goose?.restart(gooseMode);
    syncActivity();
  });
  mountGooseView(stage.querySelector('.goose-wrap'));
}
async function mountGooseView(wrap) {
  const token = gooseToken;
  wrap.innerHTML = '<p class="goose-loading">正在加载 3D 引擎……</p>';
  try {
    const { mountGoose } = await import('./goose.js');
    if (token !== gooseToken) return;
    const view = await mountGoose(wrap, { mode: gooseMode, onHud: (text) => { $('#score-text').textContent = text; }, onResult: reportScore });
    // The player left (or restarted the stage) while the engine was loading.
    if (token !== gooseToken) { view.destroy(); return; }
    goose = view;
  } catch (error) {
    if (token !== gooseToken) return;
    console.error(error);
    wrap.innerHTML = '<div class="goose-loading"><p>3D 引擎加载失败，请检查网络或浏览器是否支持 WebGL。</p><button type="button">重试</button></div>';
    wrap.querySelector('button').addEventListener('click', () => mountGooseView(wrap));
  }
}
function resetBlastView() { lbStatus = ''; blastDrag = null; blastShown = 0; blastPrevBest = blastBest; pop3PrevBest = pop3Best; }
// Every player this device steers: both seats when two people share one screen.
const localPlayers = () => (lan.role === 'solo' ? state.players.map(p => p.id) : [activePlayer]);
// A phone held upright: 方块爆破 and 泡噗3 give up their square board for a taller one.
const phoneUpright = window.matchMedia('(max-width: 800px) and (orientation: portrait)');
// 泡噗3 alone on a phone: one tall canvas, a thin score strip on top, the well scaled to the full width below it.
const POP3_TALL = { TOP: 84, GAP: 10, MARGIN: 14 };
const tallPop3 = () => mode === 'pop3' && state?.players.length === 1 && phoneUpright.matches;
const tallScale = () => (WIDTH - 2 * POP3_TALL.MARGIN) / pop3Width(state);
function wellRect(index, count) {
  if (tallPop3()) {
    const s = tallScale();
    return { x: (WIDTH - pop3Width(state) * s) / 2, y: POP3_TALL.TOP, s };
  }
  // The side panel starts at x 424, so a widened well shrinks a little to stay clear of it.
  if (count === 1) return { x: 20, y: 10, s: Math.min(700 / POP3.H, 396 / pop3Width(state)) };
  return { x: index ? 375 : 15, y: 104, s: 1 };
}
// 方块爆破 and a phone-sized 泡噗3 draw on a portrait canvas; every other board is the square WIDTH × HEIGHT.
// 山山兔 on a phone held sideways: the belt and the field only fill y 96–576 of the square world, so the
// square canvas wastes the little height there is. Show just that band on a wide canvas instead — a pure
// view change (the world, snapshots and co-op are untouched), with the title and stats moved into the side column.
const phoneSideways = window.matchMedia('(orientation: landscape) and (max-height: 600px)');
const SURGE_VIEW = { TOP: 84, BOTTOM: 600 };
const surgeSideways = () => mode === 'surge' && phoneSideways.matches;
// World y of the canvas's top edge.
const viewTop = () => (surgeSideways() ? SURGE_VIEW.TOP : 0);
const viewHeight = () => (mode === 'blast' ? BLAST.HEIGHT : surgeSideways() ? SURGE_VIEW.BOTTOM - SURGE_VIEW.TOP : tallPop3() ? Math.round(POP3_TALL.TOP + POP3_TALL.GAP + POP3.H * tallScale()) : HEIGHT);
function canvasPoint(canvas, event) {
  const rect = canvas.getBoundingClientRect(); return { x: (event.clientX - rect.left) * WIDTH / rect.width, y: (event.clientY - rect.top) * viewHeight() / rect.height + viewTop() };
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
  if (lan.role !== 'solo' || mode === 'surge' || mode === 'blast') return activePlayer;
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
// Hit-test the whole slot rather than the piece's own cells: a tray cell is about
// 30 logical px — roughly 15 CSS px on a phone, well under a comfortable touch target.
function blastTraySlot(point) {
  const { TRAY_SLOT_X, TRAY_Y, TRAY_SLOT_W, TRAY_SLOT_H } = BLAST;
  for (let slot = 0; slot < TRAY_SLOT_X.length; slot += 1) {
    if (!state.tray[slot]) continue;
    if (Math.abs(point.x - TRAY_SLOT_X[slot]) <= TRAY_SLOT_W / 2 && Math.abs(point.y - TRAY_Y) <= TRAY_SLOT_H / 2) return slot;
  }
  return -1;
}
const blastSpan = (cells) => ({ w: Math.max(...cells.map(c => c.dx)) + 1, h: Math.max(...cells.map(c => c.dy)) + 1 });
// Cells of clearance between a fingertip and the lifted piece's lower edge.
const BLAST_LIFT = 1.1;
// The floating piece's centre. A finger would hide the piece it holds, so touch
// lifts it clear above the fingertip; a mouse pointer holds it by the middle.
function blastFloat(drag) {
  const { h } = blastSpan(drag.piece.cells);
  return { x: drag.x, y: drag.y - (drag.touch ? (h / 2 + BLAST_LIFT) * BLAST.CELL : 0) };
}
// The cell under the floating piece's top-left tile: placement and the ghost both
// snap from here, so the piece lands where it is seen, not where the finger is.
function blastDragCell(drag) {
  const { w, h } = blastSpan(drag.piece.cells), centre = blastFloat(drag);
  return blastCellAt(centre.x - (w - 1) / 2 * BLAST.CELL, centre.y - (h - 1) / 2 * BLAST.CELL);
}
function blastPointer(entry, point, release) {
  if (release) {
    if (blastDrag && blastDrag.pointerId === entry.pointerId) {
      blastDrag.x = point.x; blastDrag.y = point.y;
      const cell = blastDragCell(blastDrag);
      sendAction(entry.player, { type: 'place', slot: blastDrag.slot, col: cell.col, row: cell.row });
      blastDrag = null;
    }
    hover = null;
    return;
  }
  // A second finger must not hijack a drag that is already in flight.
  if (blastDrag && blastDrag.pointerId !== entry.pointerId) return;
  if (!blastDrag) {
    const slot = blastTraySlot(point);
    if (slot < 0) return;
    blastDrag = { pointerId: entry.pointerId, slot, piece: state.tray[slot], touch: entry.touch, since: performance.now() };
  }
  blastDrag.x = point.x; blastDrag.y = point.y;
  // The ghost snaps through the same rule the model places with, so it never lies.
  const raw = blastDragCell(blastDrag), at = blastSnap(state, blastDrag.piece.cells, raw.col, raw.row);
  hover = { col: (at || raw).col, row: (at || raw).row, cells: blastDrag.piece.cells, ok: Boolean(at) };
}
function pointerDown(event) {
  if (!state) return;
  event.preventDefault();
  // Ignore the tap that was already on its way down when the round ended.
  if (state.phase !== 'playing') { if (performance.now() - endedAt > 700 + (mode === 'blast' ? BLAST_END_DELAY : 0)) restartGame(); return; }
  const canvas = event.currentTarget, point = canvasPoint(canvas, event), player = playerAt(point), p = state.players[player];
  canvas.setPointerCapture?.(event.pointerId);
  const entry = { pointerId: event.pointerId, touch: event.pointerType !== 'mouse', player, start: point, last: point, base: { x: p.x, y: p.y }, moved: false, time: performance.now() };
  pointers.set(event.pointerId, entry);
  if (mode === 'surge') surgePointer(entry, point, false);
  if (mode === 'blast') blastPointer(entry, point, false);
}
function pointerMove(event) {
  const entry = pointers.get(event.pointerId), canvas = $('.game-canvas');
  if (!entry || !state || !canvas) return;
  event.preventDefault();
  const point = canvasPoint(canvas, event); entry.last = point;
  if (Math.hypot(point.x - entry.start.x, point.y - entry.start.y) > 8) entry.moved = true;
  if (mode === 'surge') return surgePointer(entry, point, false);
  if (mode === 'blast') return blastPointer(entry, point, false);
  if (!entry.moved) return;
  // Relative drag: the finger never has to sit on top of the ship it steers.
  const gain = DRAG_GAIN / (mode === 'pop3' ? wellRect(entry.player, state.players.length).s : 1);
  sendAction(entry.player, { type: 'move', x: entry.base.x + (point.x - entry.start.x) * gain, y: entry.base.y + (point.y - entry.start.y) * gain });
}
function pointerUp(event) {
  const entry = pointers.get(event.pointerId);
  if (!entry) return;
  pointers.delete(event.pointerId);
  if (!state || event.type === 'pointercancel') { hover = null; blastDrag = null; return; }
  event.preventDefault();
  if (mode === 'surge') surgePointer(entry, entry.last, true);
  else if (mode === 'blast') blastPointer(entry, entry.last, true);
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

function label(ctx, text, x, y, size = 12, color = '#fff', align = 'center', font = 'Manrope, sans-serif', outline = 0) {
  drawStat(ctx, text, x, y, { size, color, align, font, weight: 700, outline });
}
// The theme picker: a chip per skin, each showing its own landscape, base and
// craft. It lives in the stage header beside "重新开始" so it costs no vertical
// space — the board already fills the screen exactly.
function themeChips(row) {
  if (!row) return;
  row.innerHTML = '';
  for (const entry of THEMES) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `theme-chip${entry.id === theme ? ' selected' : ''}`;
    chip.dataset.theme = entry.id;
    chip.title = `${entry.name}：${entry.help}`;
    chip.setAttribute('aria-label', `切换到${entry.name}`);
    const canvas = document.createElement('canvas');
    canvas.width = 108; canvas.height = 84;
    canvas.style.width = '36px'; canvas.style.height = '28px';
    const c = canvas.getContext('2d'); c.scale(3, 3);
    paintThemeChip(c, entry, 36, 28, state ? state.elapsed : 0);
    chip.appendChild(canvas);
    chip.addEventListener('click', () => {
      theme = entry.id;
      try { localStorage.setItem('pao-theme', theme); } catch { /* private mode */ }
      // Cached sprites are keyed by colour and size only, so they must be dropped
      // or the previous skin's pieces would keep drawing.
      resetArtCaches(); resetThemeCaches(); controlsKey = '';
      $('.game-help').textContent = stageHelp();
      renderGame();
    });
    row.appendChild(chip);
  }
}

function applyStoredTheme() {
  let stored = null;
  try { stored = localStorage.getItem('pao-theme'); } catch { /* private mode */ }
  theme = isTheme(stored) ? stored : DEFAULT_THEME;
}
// 方块爆破 is the only board with a score worth keeping between visits.
function loadBlastBest() {
  try { blastBest = Math.max(0, Number(localStorage.getItem('pao-blast-best')) || 0); } catch { blastBest = 0; }
}
function saveBlastBest(value) {
  try { localStorage.setItem('pao-blast-best', String(value)); } catch { /* private mode */ }
}
function loadPop3Prefs() {
  try {
    pop3Endless = localStorage.getItem('pao-pop3-mode') === 'endless';
    pop3Best = Math.max(0, Number(localStorage.getItem('pao-pop3-endless-best')) || 0);
  } catch { /* private mode */ }
}
function savePop3(key, value) {
  try { localStorage.setItem(key, String(value)); } catch { /* private mode */ }
}
const mmss = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
// A score only counts toward the 无尽 record when one person played it.
const pop3Record = () => state.endless && state.players.length === 1;

// 每个游戏的每个模式各有一份全球榜。
function boardId() {
  if (mode === 'quest') return 'quest';
  if (mode === 'park') return 'park';
  if (mode === 'goose') return gooseMode === 'endless' ? 'goose-endless' : 'goose-classic';
  if (mode === 'pop3') return (state ? state.endless : pop3Endless) ? 'pop3-endless' : 'pop3-classic';
  return mode;
}
// 只有一个人玩的整局才上榜：联机和同屏双人的分数是两个人的合计，不能和单人比。
const ranked = () => lan.role === 'solo' && state?.players.length === 1;
function reportResult() {
  if (!ranked() || state.score < 1) return;
  const round = state;
  lbStatus = '正在提交成绩……';
  reportScore(boardId(), state.score).then((text) => { if (state === round) lbStatus = text; });
}

// Clears animate from the effect's own timestamp, so host and guest agree.
function drawEffects(ctx, well) {
  for (const item of state.effects) {
    if (item.well !== well) continue;
    const age = (state.elapsed - item.time) / 0.9;
    if (age < 0 || age > 1) continue;
    if (item.type === 'pop') drawBurst(ctx, item.x, item.y, item.color, age);
    else drawFloatingText(ctx, item.text, item.x, item.y, age, item.text?.startsWith('+') ? '#ffe9a3' : '#ffffff');
  }
}
function drawBanner(ctx) {
  const age = state.banner ? state.elapsed - state.banner.time : 9;
  if (age > 2.2) return;
  const alpha = Math.min(1, (2.2 - age) * 2), w = 420, h = 96;
  ctx.save(); ctx.globalAlpha = alpha;
  panel(ctx, WIDTH / 2 - w / 2, viewHeight() / 2 - h / 2, w, h, 22, { fill: 'rgba(10,15,28,.86)', stroke: 'rgba(255,213,67,.5)', shadow: 26 });
  panel(ctx, WIDTH / 2 - w / 2 + 8, viewHeight() / 2 - h / 2 + 8, w - 16, h - 16, 16, { fill: 'rgba(255,255,255,.04)', stroke: 'rgba(255,255,255,.08)' });
  drawStat(ctx, state.banner.text, WIDTH / 2, viewHeight() / 2 + 12, { size: 34, outline: 0, color: '#ffe9a3' });
  ctx.restore();
}

function renderPop2(ctx) {
  const { CX, CY, ARENA_R, HOME_R, R, SHIP_R } = POP2, t = state.elapsed;
  const skin = themeById(theme), shades = ballShades(theme), paint = ballPainter(theme);
  const ball = (x, y, color, radius, alpha = 1) => drawBall(ctx, x, y, color, radius, alpha, shades, paint);
  drawThemeBackdrop(ctx, skin.backdrop, WIDTH, HEIGHT, t);

  // The base flares once anything loose — or anything stuck to a ship, now that
  // a ship may fly over the base — drifts close to it.
  const near = (x, y) => Math.hypot(x - CX, y - CY) < HOME_R + R + 70;
  const threat = state.balls.some(item => near(item.x, item.y))
    || state.players.some(p => Object.keys(p.cells).some(cell => { const o = hexOffset(...cell.split(',').map(Number)); return near(p.x + o.x, p.y + o.y); }));
  drawThemeArena(ctx, skin.arena, CX, CY, ARENA_R + 4, t, threat);
  drawThemeBase(ctx, skin.base, CX, CY, HOME_R, t);

  const vig = ctx.createRadialGradient(CX, CY, ARENA_R * .62, CX, CY, ARENA_R * 1.06);
  vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(4,7,16,.5)');
  ctx.fillStyle = vig; ctx.fillRect(0, 0, WIDTH, HEIGHT);

  for (const item of state.balls) {
    const drift = Math.hypot(item.vx, item.vy) || 1;
    for (let i = 2; i >= 1; i--) {
      const k = i * 6;
      ball(item.x - item.vx / drift * k, item.y - item.vy / drift * k, item.color, R * (1 - i * .16), .14 / i);
    }
    ball(item.x, item.y, item.color, R);
  }
  for (const p of state.players) {
    for (const cell of Object.keys(p.cells)) { const o = hexOffset(...cell.split(',').map(Number)); ball(p.x + o.x, p.y + o.y, p.cells[cell], R); }
    drawThemeThruster(ctx, skin.craft, p.x, p.y, SHIP_R, p.id, t);
    drawThemeCraft(ctx, skin.craft, p.id, p.x, p.y, SHIP_R);
    if (state.players.length > 1) drawStat(ctx, `P${p.id + 1}`, p.x, p.y - SHIP_R - 14, { size: 12, color: PLAYER_HEX[p.id], font: '"DM Mono"', outline: 3 });
  }
  drawEffects(ctx);
}

function renderWell(ctx, p, count) {
  const rect = wellRect(p.id, count), { H, CELL } = POP3, W = pop3Width(state), t = state.elapsed, spike = H - p.monster;
  ctx.save(); ctx.translate(rect.x, rect.y); ctx.scale(rect.s, rect.s);
  drawWell(ctx, 0, 0, W, H, 1, { color: PLAYER_HEX[p.id], spike, t, alive: !p.out });
  ctx.save(); roundRect(ctx, 0, 0, W, H, 12); ctx.clip();
  for (const note of state.notes) if (note.well === p.id) drawBlock(ctx, note.x, note.y, CELL - 3, note.color);
  if (!p.out) {
    for (const cell of Object.keys(p.cells)) { const [c, r] = cell.split(',').map(Number); drawBlock(ctx, p.x + c * CELL, p.y + r * CELL, CELL - 3, p.cells[cell]); }
    // The ring closes on the ship exactly on the beat.
    const phase = beatPhase(state), ring = 15 + 28 * (1 - phase);
    ctx.strokeStyle = `rgba(88,212,222,${(.28 + .72 * phase).toFixed(3)})`; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(p.x, p.y, ring, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${(.08 + .26 * phase).toFixed(3)})`; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, ring + 6, 0, Math.PI * 2); ctx.stroke();
    drawThruster(ctx, p.x, p.y, CELL / 2 - 1, p.id, t);
    drawShip(ctx, p.x, p.y, CELL / 2 - 1, p.id);
    if (t - p.judgeAt < .6) drawFloatingText(ctx, p.judge, p.x, p.y + CELL - 4, (t - p.judgeAt) / .6,
      p.judge === 'MISS' ? '#9aa3b5' : p.judge === 'GOOD' ? '#a78bfa' : '#ffb347');
  }
  drawEffects(ctx, p.id);
  if (p.out) { ctx.fillStyle = 'rgba(6,9,18,.84)'; ctx.fillRect(0, 0, W, H); drawStat(ctx, `P${p.id + 1} 出局`, W / 2, H / 2, { size: 30, color: '#c9cfdb', outline: 0 }); }
  ctx.restore();
  ctx.restore();
}
function renderPop3(ctx) {
  const count = state.players.length, time = Math.max(0, Math.ceil(state.timeLeft)), t = state.elapsed, endless = state.endless;
  const gauge = endless ? (pop3Stage(state).fall - POP3.ENDLESS.fall) / (POP3.ENDLESS.MAX_FALL - POP3.ENDLESS.fall) : Math.min(1, state.timeLeft / pop3Stage(state).time);
  drawClubBackdrop(ctx, WIDTH, viewHeight(), t);
  for (const p of state.players) renderWell(ctx, p, count);
  const combo = (p, x, y, align) => {
    drawStat(ctx, `COMBO ${String(p.combo).padStart(3, '0')}`, x, y, { size: 15, color: PLAYER_HEX[p.id], align, font: '"DM Mono"', outline: 3 });
    drawStat(ctx, `×${pop3Multiplier(p.combo).toFixed(1)}`, x, y + 26, { size: 22, color: '#ffe9a3', align, outline: 4 });
  };
  if (tallPop3()) {
    const stage = pop3Stage(state), p = state.players[0];
    drawStat(ctx, stage.name, WIDTH / 2, 24, { size: 15, color: '#cfc6ea', outline: 0 });
    drawStat(ctx, String(state.score), WIDTH / 2, 64, { size: 36 });
    combo(p, 24, 34, 'left');
    drawStat(ctx, endless ? `×${pop3Speed(state).toFixed(1)}` : state.rank || 'C', WIDTH - 24, 52, { size: endless ? 34 : 40, color: '#ffd543', align: 'right' });
    drawStat(ctx, endless ? mmss(pop3Clock(state)) : `${time}s`, WIDTH - 24, 76, { size: 17, color: !endless && state.timeLeft < 15 ? '#ff8794' : '#d8d2ee', align: 'right', font: '"DM Mono"', outline: 3 });
    // The clock (or, in 无尽, how close the notes are to full speed) runs along the very top edge.
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, 0, WIDTH, 6);
    ctx.fillStyle = endless ? '#ff9d5c' : state.timeLeft < 15 ? '#ff5d6c' : '#58d4de'; ctx.fillRect(0, 0, WIDTH * gauge, 6);
  } else if (count === 1) {
    const x = 560;
    panel(ctx, 424, 34, 272, 476, 22, { fill: 'rgba(12,10,28,.62)', stroke: 'rgba(167,139,250,.28)', shadow: 24 });
    drawStat(ctx, pop3Stage(state).name, x, 82, { size: 21, outline: 0 });
    drawStat(ctx, 'SCORE', x, 138, { size: 12, color: '#b9aee0', font: '"DM Mono"', outline: 0, letter: 2 });
    drawStat(ctx, String(state.score), x, 184, { size: 38 });
    // Rank medallion.
    const rank = state.rank || 'C';
    glow(ctx, x, 272, 74, '#ffd543', .45);
    ctx.beginPath(); ctx.arc(x, 272, 58, 0, Math.PI * 2);
    const disc = ctx.createLinearGradient(x - 58, 272 - 58, x + 58, 272 + 58);
    disc.addColorStop(0, '#3b2f6b'); disc.addColorStop(1, '#221a44');
    ctx.fillStyle = disc; ctx.fill();
    ctx.strokeStyle = 'rgba(255,213,67,.75)'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, 272, 48, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 1; ctx.stroke();
    if (endless) drawStat(ctx, `×${pop3Speed(state).toFixed(1)}`, x, 272 + 14, { size: 40, color: '#ffd543' });
    else drawStat(ctx, rank, x, 272 + 24, { size: 68, color: '#ffd543' });
    drawStat(ctx, endless ? mmss(pop3Clock(state)) : `${time}s`, x, 372, { size: 22, color: '#d8d2ee', font: '"DM Mono"' });
    panel(ctx, x - 100, 394, 200, 8, 4, { fill: 'rgba(255,255,255,.12)', stroke: null });
    roundRect(ctx, x - 100, 394, Math.max(8, 200 * gauge), 8, 4);
    ctx.fillStyle = endless ? '#ff9d5c' : state.timeLeft < 15 ? '#ff5d6c' : '#58d4de'; ctx.fill();
    combo(state.players[0], x, 450, 'center');
  } else {
    drawStat(ctx, pop3Stage(state).name, WIDTH / 2, 28, { size: 15, color: '#cfc6ea', outline: 0 });
    drawStat(ctx, String(state.score), WIDTH / 2, 66, { size: 32 });
    drawStat(ctx, endless ? `×${pop3Speed(state).toFixed(1)} · ${mmss(pop3Clock(state))}` : `${state.rank || 'C'} · ${time}s`, WIDTH / 2, 92, { size: 15, color: '#ffd543', outline: 3 });
    combo(state.players[0], 20, 44, 'left'); combo(state.players[1], WIDTH - 20, 44, 'right');
  }
  drawBanner(ctx);
}

function drawPiece(ctx, cells, x, y, size, alpha = 1) {
  for (const cell of cells) drawBlock(ctx, x + cell.dx * size, y + cell.dy * size, size - 5, cell.color, alpha);
}
function outlineCells(ctx, cells, col, row, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.setLineDash([7, 5]);
  for (const cell of cells) { const c = cellCentre(col + cell.dx, row + cell.dy); roundRect(ctx, c.x - SURGE.CELL / 2 + 2, c.y - SURGE.CELL / 2 + 2, SURGE.CELL - 4, SURGE.CELL - 4, 9); ctx.stroke(); }
  ctx.setLineDash([]);
}
function renderSurge(ctx) {
  const { COLS, ROWS, CELL, LEFT, TOP, BELT_TOP, BELT_BOTTOM, BELT_Y, BELT_CELL } = SURGE, right = LEFT + COLS * CELL, bottom = TOP + ROWS * CELL, stage = surgeStage(state), t = state.elapsed;
  // Everything below is in world coordinates; sideways, the canvas is a window onto the middle of it.
  const side = surgeSideways();
  ctx.save(); ctx.translate(0, -viewTop());
  drawMeadowBackdrop(ctx, WIDTH, HEIGHT);
  if (!side) {
    drawStat(ctx, `${state.level > SURGE.STAGES.length ? '∞' : `第 ${state.level} 关`} · ${stage.name}`, 24, 44, { size: 21, align: 'left' });
    drawStat(ctx, `${state.score} 分`, WIDTH - 24, 44, { size: 21, color: '#ffd543', align: 'right' });
    drawStat(ctx, '← 传送带 · 点拼块抓取', 24, 78, { size: 11, color: '#a9b4c8', align: 'left', font: '"DM Mono"', weight: 500, outline: 0, letter: 1 });
  }

  drawBelt(ctx, 0, BELT_TOP, WIDTH, BELT_BOTTOM - BELT_TOP, t);
  for (const piece of state.belt) drawPiece(ctx, piece.cells, piece.x, BELT_Y, BELT_CELL);

  drawField(ctx, LEFT, TOP, COLS * CELL, ROWS * CELL, CELL, COLS, ROWS);
  drawPortal(ctx, right, TOP, WIDTH - right, ROWS * CELL, t);
  drawDefence(ctx, LEFT - 22, TOP, 14, ROWS * CELL, state.lives <= 1);

  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.board[r][c]) { const centre = cellCentre(c, r); drawBlock(ctx, centre.x, centre.y, CELL - 6, state.board[r][c]); }
  if (axeMode) for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (state.board[r][c]) outlineCells(ctx, [{ dx: 0, dy: 0 }], c, r, '#ffd543');
  for (const shot of state.shots) {
    const y = cellCentre(0, shot.row).y;
    glow(ctx, shot.x, y, 26, SHADES[shot.color]?.glow || '#ffffff', .6);
    const trail = ctx.createLinearGradient(shot.x - 40, y, shot.x, y);
    trail.addColorStop(0, withAlpha(SHADES[shot.color]?.base || '#ffffff', 0));
    trail.addColorStop(1, withAlpha(SHADES[shot.color]?.light || '#ffffff', .55));
    ctx.fillStyle = trail; roundRect(ctx, shot.x - 40, y - 5, 40, 10, 5); ctx.fill();
    drawBall(ctx, shot.x, y, shot.color, 12);
  }
  for (const enemy of state.enemies) {
    const spec = SURGE.ENEMIES[enemy.type];
    drawEnemy(ctx, enemy.x, cellCentre(0, enemy.row).y, enemy.type, enemy.hp, spec.hp, enemy.gnaw, spec.gnaw, t);
  }
  if (hover?.cells) { drawPiece(ctx, hover.cells, cellCentre(hover.col, hover.row).x, cellCentre(hover.col, hover.row).y, CELL, .45); outlineCells(ctx, hover.cells, hover.col, hover.row, canPlace(state, hover.cells, hover.col, hover.row) ? '#44c986' : '#9aa3b5'); }
  else if (hover) outlineCells(ctx, [{ dx: 0, dy: 0 }], hover.col, hover.row, '#ffd543');
  for (const p of state.players) {
    if (p.held) {
      // Over the field the carried piece snaps to the grid, so its landing spot is never a guess.
      const cell = cellAt(p.x, p.y), over = p.y >= TOP && cell.col >= 0 && cell.col < COLS && cell.row < ROWS;
      if (over) { drawPiece(ctx, p.held.cells, cellCentre(cell.col, cell.row).x, cellCentre(cell.col, cell.row).y, CELL, .8); outlineCells(ctx, p.held.cells, cell.col, cell.row, canPlace(state, p.held.cells, cell.col, cell.row) ? '#44c986' : '#9aa3b5'); }
      else drawPiece(ctx, p.held.cells, p.x, p.y, BELT_CELL, .85);
    }
    glow(ctx, p.x, p.y, 42, PLAYER_HEX[p.id], .3);
    drawRabbit(ctx, p.x, p.y, p.id);
    if (state.players.length > 1) drawStat(ctx, `P${p.id + 1}`, p.x, p.y + 32, { size: 12, color: PLAYER_HEX[p.id], font: '"DM Mono"', outline: 3 });
  }
  drawEffects(ctx);

  if (!side) {
    const hud = bottom + 44;
    panel(ctx, 16, hud - 24, WIDTH - 32, 86, 16, { fill: 'rgba(8,13,24,.6)', stroke: 'rgba(255,255,255,.1)' });
    drawStat(ctx, '防线', 36, hud, { size: 13, color: '#a9b4c8', align: 'left', outline: 0 });
    for (let i = 0; i < SURGE.LIVES; i++) drawStat(ctx, '♥', 88 + i * 26, hud + 3, { size: 23, color: i < state.lives ? '#ff5d6c' : 'rgba(255,255,255,.14)', outline: i < state.lives ? 3 : 0 });
    drawStat(ctx, `击退 ${state.defeated} / ${stage.total || '∞'}`, WIDTH / 2, hud, { size: 16, outline: 3 });
    drawStat(ctx, `⚡ ${state.energy} / ${SURGE.MAX_ENERGY}`, WIDTH - 36, hud, { size: 16, color: '#ffd543', align: 'right', outline: 3 });
    panel(ctx, 36, hud + 16, WIDTH - 72, 14, 7, { fill: 'rgba(255,255,255,.1)', stroke: 'rgba(255,255,255,.12)' });
    const ratio = state.energy / SURGE.MAX_ENERGY, bar = (WIDTH - 72) * ratio;
    if (bar > 2) {
      roundRect(ctx, 36, hud + 16, bar, 14, 7);
      const fill = ctx.createLinearGradient(36, 0, 36 + bar, 0);
      fill.addColorStop(0, '#ffb347'); fill.addColorStop(1, '#ffd543');
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.stroke();
    }
    for (let i = 1; i < SURGE.MAX_ENERGY / SURGE.AXE_COST; i++) {
      const x = 36 + (WIDTH - 72) * (i * SURGE.AXE_COST / SURGE.MAX_ENERGY);
      ctx.fillStyle = 'rgba(8,13,24,.55)'; ctx.fillRect(x, hud + 16, 2, 14);
    }
    if (axeMode) drawStat(ctx, '消消斧头：点一个方块，把它变成泡姆发射出去', WIDTH / 2, hud + 54, { size: 13, color: '#ffd543', outline: 3 });
  } else if (axeMode) drawStat(ctx, '消消斧头：点一个方块，把它变成泡姆发射出去', WIDTH / 2, bottom + 14, { size: 13, color: '#ffd543', outline: 3 });
  ctx.restore();
  drawBanner(ctx);
}

// Every tray piece shares one cell size; only the tall four- and five-cell pieces
// shrink to fit, in whole pixels, so the sprite cache gains a handful of entries
// rather than one per piece — overflowing it clears every board's cached sprites.
function blastTrayCell(piece) {
  const { w, h } = blastSpan(piece.cells);
  return Math.min(BLAST.TRAY_CELL, Math.floor((BLAST.TRAY_SLOT_W - 26) / w), Math.floor((BLAST.TRAY_SLOT_H - 16) / h));
}
// Lay a piece out around (cx, cy) at `pitch` per cell, `scale` times over. Tiles
// keep one sprite size and are scaled, so animating never asks the cache for new sizes.
function drawBlastPiece(ctx, cells, cx, cy, base, tile, scale, { color, alpha = 1, shadow = false } = {}) {
  const { w, h } = blastSpan(cells), pitch = base * scale, k = scale;
  const left = cx - w * pitch / 2, top = cy - h * pitch / 2;
  if (shadow) {
    ctx.save(); ctx.fillStyle = 'rgba(4,3,14,.42)';
    for (const cell of cells) { roundRect(ctx, left + cell.dx * pitch + pitch * .1, top + cell.dy * pitch + pitch * .26, pitch * .9, pitch * .9, pitch * .2); ctx.fill(); }
    ctx.restore();
  }
  for (const cell of cells) drawBlastTile(ctx, left + (cell.dx + .5) * pitch, top + (cell.dy + .5) * pitch, tile, color || cell.color, { alpha, scale: k });
}
const easeOutBack = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const BLAST_WORDS = { 2: '双消', 3: '三消', 4: '四消' };
// How long the board takes to grey out row by row before the end card shows, in ms.
const BLAST_END_DELAY = 700;
function renderBlast(ctx) {
  const { COLS, ROWS, CELL, LEFT, TOP, TRAY_Y, TRAY_SLOT_X, TRAY_SLOT_W, TRAY_SLOT_H } = BLAST;
  const now = performance.now(), tile = CELL - 6;
  // The model stops ticking once the round ends; the view clock runs on so the last
  // clear finishes and the board can grey out.
  const endAge = state.phase === 'playing' || !endedAt ? 0 : (now - endedAt) / 1000;
  const clock = state.elapsed + endAge, ended = state.phase !== 'playing';
  drawBlastBackdrop(ctx, WIDTH, BLAST.HEIGHT, clock);

  // The canvas score rolls up to the real one rather than jumping.
  const step = blastShownAt ? Math.min(.05, (now - blastShownAt) / 1000) : 0; blastShownAt = now;
  if (blastShown > state.score) blastShown = state.score;
  else blastShown = state.score - blastShown < .5 ? state.score : blastShown + (state.score - blastShown) * Math.min(1, step * 8);
  const rolling = Math.min(5, (state.score - blastShown) / 20);
  drawStat(ctx, `最高 ${Math.max(blastBest, state.score)}`, 24, 42, { size: 17, color: '#aeb5c4', align: 'left', outline: 3 });
  drawStat(ctx, `${Math.round(blastShown)} 分`, WIDTH - 24, 42, { size: 21 + rolling, color: '#ffd543', align: 'right' });
  if (state.streak > 1) drawStat(ctx, `连击 ×${blastMultiplier(state.streak).toFixed(2)}`, WIDTH - 24, 66, { size: 13, color: '#3fd0e0', align: 'right', outline: 3 });

  const fresh = state.effects.filter(item => clock - item.time < .9);
  // A multi-line clear or a long streak shakes the board, not the HUD.
  const kick = fresh.findLast(item => item.type === 'text');
  ctx.save();
  if (kick && clock - kick.time < .35) {
    const a = (clock - kick.time) / .35, m = Math.min(9, (kick.lines - 1) * 3 + (kick.streak >= 3 ? 2 : 0)) * (1 - a);
    if (m > 0) ctx.translate(Math.sin(a * 60) * m, Math.cos(a * 47) * m * .7);
  }
  drawBlastBoard(ctx, LEFT, TOP, COLS * CELL, ROWS * CELL, CELL, COLS, ROWS);

  // A freshly placed piece lands with a small squash and a white glint.
  const landed = new Map();
  for (const item of fresh) if (item.type === 'place') for (const cell of item.cells) landed.set(cell.row * COLS + cell.col, (clock - item.time) / .22);
  // Lines the current drag would clear take on the dragged piece's colour.
  const preview = blastDrag && hover?.ok ? blastPreviewLines(state, blastDrag.piece.cells, hover.col, hover.row) : null;
  const dragColor = blastDrag?.piece.cells[0].color;
  const lit = (col, row) => preview && (preview.rows.includes(row) || preview.cols.includes(col));
  for (let row = 0; row < ROWS; row += 1) for (let col = 0; col < COLS; col += 1) {
    if (!state.board[row][col]) continue;
    const at = blastCellCentre(col, row), land = landed.get(row * COLS + col);
    // Game over drains the colour out of the board from the bottom row up.
    const grey = ended && endAge > (ROWS - 1 - row) * .055;
    const t = land === undefined ? 1 : clamp01(land);
    drawBlastTile(ctx, at.x, at.y, tile, grey ? 'slate' : lit(col, row) ? dragColor : state.board[row][col], {
      scale: 1 + .14 * (1 - t) ** 2, flash: .5 * (1 - t), alpha: grey ? .8 : 1
    });
  }
  if (preview) {
    for (const row of preview.rows) drawBlastLineHint(ctx, LEFT, TOP + row * CELL, COLS * CELL, CELL, dragColor, clock);
    for (const col of preview.cols) drawBlastLineHint(ctx, LEFT + col * CELL, TOP, CELL, ROWS * CELL, dragColor, clock);
  }
  // The outline marks where the lifted piece will really land.
  if (blastDrag && hover?.ok) for (const cell of blastDrag.piece.cells) {
    const at = blastCellCentre(hover.col + cell.dx, hover.row + cell.dy);
    if (lit(hover.col + cell.dx, hover.row + cell.dy)) drawBlastTile(ctx, at.x, at.y, tile, dragColor, { alpha: .9 });
    else drawBlastGhost(ctx, at.x, at.y, tile, cell.color);
  }

  // Clears ripple outward from the placed piece: each cell holds until its delay,
  // then charges up and shatters, while a beam runs down every cleared line.
  for (const item of fresh) {
    if (item.type === 'pop') {
      const a = (clock - item.time - (item.delay || 0)) / .5;
      if (a < 0) drawBlastTile(ctx, item.x, item.y, tile, item.color);
      else drawBlastShatter(ctx, item.x, item.y, tile, item.color, a, Math.round(item.x + item.y * 3));
    } else if (item.type === 'line') {
      const a = (clock - item.time - .08) / .45;
      if (item.axis === 'row') drawBlastBeam(ctx, LEFT, TOP + item.index * CELL, COLS * CELL, CELL, item.color, a);
      else drawBlastBeam(ctx, LEFT + item.index * CELL, TOP, CELL, ROWS * CELL, item.color, a);
    }
  }
  ctx.restore();

  for (let slot = 0; slot < TRAY_SLOT_X.length; slot += 1) {
    const active = blastDrag?.slot === slot, piece = state.tray[slot];
    drawBlastSlot(ctx, TRAY_SLOT_X[slot], TRAY_Y, TRAY_SLOT_W, TRAY_SLOT_H, active);
    if (!piece || active) continue;
    // A fresh triple deals in one after another with a little overshoot.
    const deal = clamp01((clock - (state.dealtAt || 0) - slot * .07) / .32);
    if (deal <= 0) continue;
    const cell = blastTrayCell(piece), grow = easeOutBack(deal);
    // A piece that fits nowhere is drained to slate, so the player sees the danger coming.
    const stuck = !ended && !blastHasValidPlacement(state, piece.cells);
    drawBlastPiece(ctx, piece.cells, TRAY_SLOT_X[slot], TRAY_Y + (1 - deal) * 26, cell, cell - 4, grow, { color: stuck || ended ? 'slate' : null, alpha: stuck ? .55 : clamp01(deal * 2) });
  }

  for (const item of fresh) if (item.type === 'text') {
    const sub = [item.lines >= 2 ? `${BLAST_WORDS[item.lines] || '超级消除'}！` : '', item.streak >= 2 ? `连击 ×${item.streak}` : ''].filter(Boolean).join(' · ');
    drawBlastCallout(ctx, item.text, sub, item.x, item.y, (clock - item.time) / .9, 32 + 6 * Math.min(3, (item.lines || 1) - 1));
  }

  // The held piece grows from tray size to board size as it is picked up, and
  // rides above everything else.
  if (blastDrag) {
    const centre = blastFloat(blastDrag), from = blastTrayCell(blastDrag.piece) / CELL;
    const k = from + (1 - from) * (1 - (1 - clamp01((now - blastDrag.since) / 140)) ** 3);
    drawBlastPiece(ctx, blastDrag.piece.cells, centre.x, centre.y, CELL, tile, k, { alpha: hover?.ok ? 1 : .88, shadow: true });
  }
}

function renderEnd(ctx, alpha = 1) {
  const H = viewHeight(), mid = H / 2;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(8,12,22,.82)'; ctx.fillRect(0, 0, WIDTH, H);
  const endless = mode === 'pop3' && state.endless;
  const record = endless && pop3Record();
  // Every extra line (the 无尽 record, the leaderboard rank) grows the card by one row, half above and half below.
  const rows = (record ? 1 : 0) + (lbStatus ? 1 : 0), w = 440, h = 190 + rows * 28, shift = rows * 14;
  panel(ctx, WIDTH / 2 - w / 2, mid - h / 2, w, h, 24, { fill: 'rgba(13,18,32,.9)', stroke: 'rgba(255,213,67,.4)', shadow: 30 });
  drawStat(ctx, state.phase === 'won' ? '完成！' : '回合结束', WIDTH / 2, mid - 34 - shift, { size: 42, outline: 0 });
  const extra = endless ? ` · 坚持 ${mmss(pop3Clock(state))}` : mode === 'pop3' ? ` · 评价 ${state.rank || 'C'}` : mode === 'blast' ? (state.score > blastPrevBest ? ' · 新纪录！' : ` · 最高 ${blastBest}`) : '';
  let y = mid + 18 - shift;
  drawStat(ctx, `${state.score} 分${extra}`, WIDTH / 2, y, { size: 24, color: '#ffd543' });
  if (record) { y += 28; drawStat(ctx, state.score > pop3PrevBest ? '新纪录！' : `最高 ${pop3Best} 分`, WIDTH / 2, y, { size: 17, color: state.score > pop3PrevBest ? '#ff9d5c' : '#aeb5c4', outline: 0 }); }
  if (lbStatus) { y += 28; drawStat(ctx, lbStatus, WIDTH / 2, y, { size: 16, color: '#7fe3ea', outline: 0 }); }
  drawStat(ctx, lan.role === 'guest' ? '等待房主重新开始' : '点击画面重新开始', WIDTH / 2, y + 44, { size: 15, color: '#aeb5c4', outline: 0 });
  ctx.restore();
}
function hudLine() {
  const tail = state.phase === 'playing' ? '' : state.phase === 'won' ? ' · 完成！' : ' · 回合结束';
  if (mode === 'pop2') return `${state.score} 分 · 已消除 ${state.cleared}${tail}`;
  if (mode === 'pop3' && state.endless) return `${state.score} 分 · 速度 ×${pop3Speed(state).toFixed(1)} · ${mmss(pop3Clock(state))}${tail}`;
  if (mode === 'pop3') return `${state.score} 分 · 评价 ${state.rank || 'C'} · ${Math.max(0, Math.ceil(state.timeLeft))}s${tail}`;
  if (mode === 'blast') return `${state.score} 分 · 最高 ${Math.max(blastBest, state.score)} · 消除 ${state.cleared} 行${state.streak > 1 ? ` · ×${blastMultiplier(state.streak).toFixed(2)}` : ''}${tail}`;
  // Sideways the canvas has no title bar or stats row, so the level and energy move into this line.
  if (surgeSideways()) return `${state.level > SURGE.STAGES.length ? '∞' : `第 ${state.level} 关`} · ${state.score} 分 · 防线 ${state.lives} · 击退 ${state.defeated}/${surgeStage(state).total || '∞'} · ⚡${state.energy}/${SURGE.MAX_ENERGY}${tail}`;
  return `${state.score} 分 · 防线 ${state.lives} · 击退 ${state.defeated}/${surgeStage(state).total || '∞'}${tail}`;
}
function renderGame() {
  const canvas = $('.game-canvas'); if (!canvas) return;
  // Toggling solo/shared play or turning the phone changes the board's shape.
  if (viewHeight() !== shownHeight) resizeCanvas();
  const ctx = canvas.getContext('2d');
  if (!state) {
    ctx.fillStyle = '#111824'; ctx.fillRect(0, 0, WIDTH, HEIGHT); label(ctx, '等待房主同步棋盘……', WIDTH / 2, HEIGHT / 2, 24);
    return;
  }
  if (mode === 'pop2') renderPop2(ctx); else if (mode === 'pop3') renderPop3(ctx); else if (mode === 'surge') renderSurge(ctx); else renderBlast(ctx);
  // The score only moves on a clearing placement, so this writes at most once per
  // scoring event rather than once per frame.
  if (mode === 'pop3' && pop3Record() && state.score > pop3Best) { pop3Best = state.score; savePop3('pao-pop3-endless-best', pop3Best); }
  if (mode === 'blast' && state.score > blastBest) { blastBest = state.score; saveBlastBest(blastBest); }
  if (state.phase === 'playing') endedAt = 0;
  else {
    if (!endedAt) reportResult();
    endedAt ||= performance.now();
    // 方块爆破 lets the board grey out first, then fades the end card in.
    const fade = mode === 'blast' ? clamp01((performance.now() - endedAt - BLAST_END_DELAY) / 250) : 1;
    if (fade > 0) renderEnd(ctx, fade);
  }
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
  const next = [mode, lan.role, state.players.length, activePlayer, axeMode, affordable, theme, state.endless].join('|');
  if (next === controlsKey) return;
  controlsKey = next; controls.innerHTML = '';
  const seat = lan.role === 'guest' ? '玩家 2' : lan.role === 'host' ? '房主 / 玩家 1' : state.players.length === 1 ? '单人' : '同屏双人';
  $('#seat-text').textContent = `${MODE_META[mode].label} · ${seat}${state.endless ? ' · 无尽' : ''}`;
  const help = $('.game-help'); if (help) help.textContent = stageHelp();
  const button = (text, run, className = '', instant = false) => {
    const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.className = className;
    // Rhythm taps fire on touch-down; waiting for the click would cost the beat.
    node.addEventListener(instant ? 'pointerdown' : 'click', (event) => { if (instant) event.preventDefault(); run(); }); controls.appendChild(node); return node;
  };
  if (mode === 'pop2') themeChips($('#theme-row'));
  // 方块爆破 is solo-only, so it never gets the seat toggle.
  if (lan.role === 'solo' && mode !== 'blast') button(state.players.length === 1 ? '单人 · 切换同屏双人' : '同屏双人 · 切换单人', () => { soloPlayers = soloPlayers === 1 ? 2 : 1; activePlayer = 0; restartGame(); }, 'player-toggle');
  if (mode === 'pop3' && lan.role === 'solo') button(pop3Endless ? '无尽 · 切换经典' : '经典 · 切换无尽', () => {
    pop3Endless = !pop3Endless; savePop3('pao-pop3-mode', pop3Endless ? 'endless' : 'classic'); restartGame(); syncActivity();
  }, 'player-toggle mode-toggle');
  if (mode === 'pop3') for (const seat of localPlayers()) button(localPlayers().length > 1 ? `P${seat + 1} 打拍` : '打拍', () => sendAction(seat, { type: 'beat' }), 'beat', true);
  if (mode === 'surge') {
    if (lan.role === 'solo' && state.players.length > 1) button(`操作 P${activePlayer + 1}`, () => { activePlayer = activePlayer ? 0 : 1; }, 'player-toggle');
    button('旋转 ⟳', () => sendAction(activePlayer, { type: 'rotate' }));
    button('抓 / 放', () => sendAction(activePlayer, { type: 'grab' }));
    button(`斧头 ⚡${SURGE.AXE_COST}`, () => { axeMode = !axeMode; }, axeMode ? 'selected' : '').disabled = !affordable && !axeMode;
  }
}

let shownHeight = HEIGHT;
function resizeCanvas() {
  const canvas = $('.game-canvas'); if (!canvas) return; const ratio = Math.min(2, window.devicePixelRatio || 1), h = shownHeight = viewHeight();
  const wrap = canvas.parentElement; wrap.classList.toggle('portrait', h !== HEIGHT); wrap.style.setProperty('--h', h);
  canvas.width = WIDTH * ratio; canvas.height = h * ratio; canvas.style.aspectRatio = `${WIDTH} / ${h}`; canvas.getContext('2d').setTransform(ratio, 0, 0, ratio, 0, 0);
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
initBoard(); initActivity(); initRecent(startGame);
$('#open-board').addEventListener('click', () => openBoard());
$('#game-board').addEventListener('click', () => openBoard(boardId()));
$('#create-room').addEventListener('click', createRoom); $('#join-room').addEventListener('click', joinRoom); $('#leave-room').addEventListener('click', disconnect);
$('#make-offer').addEventListener('click', makeOffer); $('#make-answer').addEventListener('click', makeAnswer); $('#finish-answer').addEventListener('click', finishAnswer);
$$('[data-copy]').forEach((node) => node.addEventListener('click', async () => { const target = $(`#${node.dataset.copy}`); await navigator.clipboard?.writeText(target.value); setHint('已复制到剪贴板。'); }));
$$('.tab').forEach((tab) => tab.addEventListener('click', () => { $$('.tab').forEach((other) => other.classList.toggle('active', other === tab)); $('#server-panel').classList.toggle('active', tab.dataset.tab === 'server'); $('#webrtc-panel').classList.toggle('active', tab.dataset.tab === 'webrtc'); }));
$('#lan-server-url').value = new URLSearchParams(location.search).get('lan') || localStorage.getItem('pao-lan-server') || location.origin;
loadBlastBest(); loadPop3Prefs();
try { gooseMode = localStorage.getItem('pao-goose-mode') === 'endless' ? 'endless' : 'classic'; } catch { /* private mode */ }
for (const type of ['pointermove', 'pointerup', 'pointercancel']) document.addEventListener(type, type === 'pointermove' ? pointerMove : pointerUp, { passive: false });
document.addEventListener('keydown', keyboard); document.addEventListener('keyup', keyboard);
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', resizeCanvas); window.addEventListener('beforeunload', () => { closeEvents(); rtc.peer?.close(); });
// Read-only handle for end-to-end tests and debugging in the console.
window.__arcade = { get state() { return state; }, get mode() { return mode; }, get theme() { return theme; }, get best() { return blastBest; }, get goose() { return goose; }, get quest() { return quest; }, get park() { return park; }, get pour() { return pour; } };
// The card handlers only exist once this module has run, so tests wait on this
// rather than racing the import.
document.body.dataset.ready = '1';
showScreen('home'); cancelAnimationFrame(frameId); frameId = requestAnimationFrame(loop);
