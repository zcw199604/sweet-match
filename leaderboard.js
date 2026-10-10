// 全球榜单的浏览器端：身份（用户名 + 密码）、提交成绩、榜单弹窗。
import { BOARDS, boardsOf, cleanName, derivePid, formatValue, GAMES, isPassword, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN } from './leaderboard-core.js';

// 身份只有两样东西存在本机：密码和用户名。pid 永远由密码算出来，所以换浏览器输入同一个密码就是同一个人。
// 旧版本留下的随机 pao-pid 不再使用。
const KEYS = { pw: 'pao-pw', name: 'pao-name' };
const ENDPOINT = '/api/scores';
const PLAYER = '/api/player';
const memory = {}; // localStorage 不可用（隐私模式）时，至少在本次访问里保持稳定
const read = (key) => { try { return localStorage.getItem(key); } catch { return memory[key] ?? null; } };
const write = (key, value) => { memory[key] = value; try { localStorage.setItem(key, value); } catch { /* private mode */ } };
const drop = (key) => { delete memory[key]; try { localStorage.removeItem(key); } catch { /* private mode */ } };

let pidCache = { pw: null, pid: null };
function savedPassword() { const pw = read(KEYS.pw); return isPassword(pw) ? pw : null; }
// 未登录时返回 null：调用方据此不提交成绩、不上报游玩记录。
export function playerId() {
  const pw = savedPassword();
  if (!pw) return null;
  if (pidCache.pw !== pw) pidCache = { pw, pid: derivePid(pw) };
  return pidCache.pid;
}
export const playerName = () => (playerId() ? cleanName(read(KEYS.name)) : null);
export const playerPassword = savedPassword;

// 随机密码：去掉 0O1Il 这类容易看错的字符，12 位约 60 bit。
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export function randomPassword(length = 12) {
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
  let text = '';
  for (const byte of bytes) { if (byte < 256 - (256 % ALPHABET.length) && text.length < length) text += ALPHABET[byte % ALPHABET.length]; }
  return text.length === length ? text : randomPassword(length);
}

async function request(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `榜单暂时连不上 (${response.status})`);
  return data;
}

// 登录前预览：这个密码对应的身份有没有上过榜。连不上返回 null，登录不依赖服务端。
export async function lookupPlayer(password) {
  try { return await request(`${PLAYER}?pid=${encodeURIComponent(derivePid(password))}`); } catch { return null; }
}
// 改昵称：本机立刻生效，同时让服务端把这个身份在所有榜上的名字一起改掉。
export async function renamePlayer(raw) {
  const name = cleanName(raw);
  write(KEYS.name, name);
  const pid = playerId();
  if (!pid) return { name, synced: false };
  try {
    await request(PLAYER, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pid, name }) });
    return { name, synced: true };
  } catch { return { name, synced: false }; }
}
export function login(rawName, password) {
  write(KEYS.name, cleanName(rawName));
  write(KEYS.pw, password);
}
export function logout() { drop(KEYS.pw); drop(KEYS.name); }

// 一局结束后调用。返回要显示在结算卡片上的一行字；连不上榜单时返回提示而不是抛错，不能影响游戏本身。
export async function reportScore(board, value) {
  if (!BOARDS[board] || !Number.isInteger(value) || !playerId()) return '';
  try {
    const result = await request(ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ board, pid: playerId(), name: playerName(), value })
    });
    return result.improved
      ? `全球第 ${result.rank} 名 · 个人新纪录！`
      : `你的最佳 ${formatValue(board, result.best)} · 全球第 ${result.rank} 名`;
  } catch {
    return '榜单暂时连不上，成绩没有提交';
  }
}

export const fetchBoard = (board) => request(`${ENDPOINT}?board=${encodeURIComponent(board)}&pid=${encodeURIComponent(playerId() ?? '')}`);

// ---- 弹窗 ----
let current = 'pop2';
let loadToken = 0;
const $ = (selector) => document.querySelector(selector);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

function renderTabs() {
  const game = BOARDS[current].game;
  const games = $('#board-games'), modes = $('#board-modes');
  games.replaceChildren(...GAMES.filter(({ id }) => boardsOf(id).length).map(({ id, title }) => {
    const button = node('button', `board-tab${id === game ? ' active' : ''}`, title);
    button.type = 'button';
    button.addEventListener('click', () => showBoard(boardsOf(id)[0]));
    return button;
  }));
  const ids = boardsOf(game);
  modes.hidden = ids.length < 2;
  modes.replaceChildren(...ids.map((id) => {
    const button = node('button', `board-mode${id === current ? ' active' : ''}`, BOARDS[id].label);
    button.type = 'button';
    button.addEventListener('click', () => showBoard(id));
    return button;
  }));
}

function renderList(board, data) {
  const list = $('#board-list'), hint = $('#board-hint');
  list.replaceChildren(...data.entries.map((entry) => {
    const mine = data.me && data.me.rank === entry.rank && data.me.name === entry.name && data.me.value === entry.value;
    const row = node('li', `board-row${mine ? ' me' : ''}${entry.rank <= 3 ? ` top${entry.rank}` : ''}`);
    row.append(node('b', 'board-rank', String(entry.rank)), node('span', 'board-name', entry.name), node('span', 'board-value', formatValue(board, entry.value)));
    return row;
  }));
  const shown = data.me && data.entries.some((entry) => entry.rank === data.me.rank && entry.value === data.me.value);
  if (!data.entries.length) hint.textContent = '还没有人上榜，来当第一名！';
  else if (data.me && !shown) hint.textContent = `你的最佳 ${formatValue(board, data.me.value)} · 全球第 ${data.me.rank} 名`;
  else hint.textContent = data.me ? '' : '玩完一局，成绩会自动上榜。';
}

export async function showBoard(board) {
  if (!BOARDS[board]) board = 'pop2';
  current = board;
  const token = ++loadToken;
  renderTabs();
  $('#board-list').replaceChildren();
  $('#board-hint').textContent = '加载中……';
  try {
    const data = await fetchBoard(board);
    if (token === loadToken) renderList(board, data);
  } catch (error) {
    if (token === loadToken) $('#board-hint').textContent = error.message || '榜单暂时连不上，请稍后再试';
  }
}

export function openBoard(board = current) {
  $('#board-name').value = playerName() ?? '';
  const pw = $('#board-pw');
  pw.value = playerPassword() ?? ''; pw.type = 'password';
  $('#board-pw-show').textContent = '显示';
  $('#board-me-hint').textContent = '改名会同步到所有榜单';
  $('#board').classList.add('active');
  showBoard(board);
}
export const closeBoard = () => { loadToken += 1; $('#board').classList.remove('active'); };

async function saveName() {
  const input = $('#board-name'), hint = $('#board-me-hint');
  if (!input.value.trim()) { hint.textContent = '昵称不能为空'; return; }
  hint.textContent = '保存中……';
  const { name, synced } = await renamePlayer(input.value);
  input.value = name;
  hint.textContent = synced ? '已同步到所有榜单' : '名字已改，榜单暂时连不上，下次提交成绩时同步';
  if (synced && $('#board').classList.contains('active')) showBoard(current);
}

async function copyPassword() {
  const input = $('#board-pw');
  input.type = 'text'; $('#board-pw-show').textContent = '隐藏';
  input.select();
  let copied = false;
  try { await navigator.clipboard.writeText(input.value); copied = true; } catch { try { copied = document.execCommand('copy'); } catch { /* 手动复制 */ } }
  $('#board-me-hint').textContent = copied ? '密码已复制' : '请手动复制上面的密码';
}

// ---- 登录门：本机没有身份时盖住整个页面，输入用户名和密码后才能继续 ----
let previewed = null; // 已经预览过的结果：{ password, found }，用户再点一次才真正进入

function resetPreview() {
  previewed = null;
  $('#login-submit').textContent = '进入';
  $('#login-hint').textContent = '';
}

export function showLogin() {
  const stale = read(KEYS.name); // 旧版本留下的昵称，当作用户名的默认值
  $('#login-name').value = stale ? cleanName(stale) : '';
  $('#login-pw').value = randomPassword();
  resetPreview();
  $('#login').classList.add('active');
}

async function submitLogin(event) {
  event.preventDefault();
  const nameInput = $('#login-name'), pwInput = $('#login-pw'), hint = $('#login-hint'), button = $('#login-submit');
  const rawName = nameInput.value.trim(), password = pwInput.value.trim();
  if (!rawName) { hint.textContent = '请输入用户名'; return; }
  if (!isPassword(password)) { hint.textContent = `密码需要 ${PASSWORD_MIN}~${PASSWORD_MAX} 位字母或数字`; return; }
  const name = cleanName(rawName);
  if (previewed?.password !== password) {
    button.disabled = true; hint.textContent = '正在查找这个密码对应的身份……';
    const found = await lookupPlayer(password);
    button.disabled = false;
    if (found) {
      previewed = { password, found };
      hint.textContent = found.exists
        ? `找到已有身份「${found.name}」，${found.boards} 个榜单有成绩。${name === found.name ? '' : `进入后榜单上的名字会改为「${name}」。`}`
        : '没有找到这个密码的成绩记录。如果想登录已有身份，请检查密码有没有输错；如果是新身份，再点一次即可创建。';
      button.textContent = '确认进入';
      return;
    }
    // 连不上服务端时不拦人：登录只是本机算一个 pid。
  }
  login(name, password);
  if (previewed?.found.exists && previewed.found.name !== name) await renamePlayer(name);
  $('#login').classList.remove('active');
  document.dispatchEvent(new Event('pao-login')); // 通知其他模块按新身份拉取数据（最近常玩）
}

export function initBoard() {
  $('#close-board').addEventListener('click', closeBoard);
  $('#board').addEventListener('click', (event) => { if (event.target.id === 'board') closeBoard(); });
  const input = $('#board-name');
  input.maxLength = NAME_MAX;
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') saveName(); });
  $('#board-rename').addEventListener('click', saveName);
  $('#board-pw-show').addEventListener('click', () => {
    const pw = $('#board-pw'), show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    $('#board-pw-show').textContent = show ? '隐藏' : '显示';
  });
  $('#board-pw-copy').addEventListener('click', copyPassword);
  $('#board-logout').addEventListener('click', () => {
    if (!window.confirm(`退出后，需要重新输入用户名和密码才能回到这个身份。\n\n请先确认你已经记下密码：${playerPassword()}`)) return;
    logout(); closeBoard(); showLogin();
    document.dispatchEvent(new Event('pao-logout'));
  });

  $('#login-name').maxLength = NAME_MAX;
  $('#login-pw').maxLength = PASSWORD_MAX;
  $('#login-form').addEventListener('submit', submitLogin);
  for (const id of ['#login-name', '#login-pw']) $(id).addEventListener('input', resetPreview);
  $('#login-gen').addEventListener('click', () => { $('#login-pw').value = randomPassword(); resetPreview(); });
  if (!playerId()) showLogin();
}
