// 全球榜单的浏览器端：玩家标识与昵称、提交成绩、榜单弹窗。
import { BOARDS, boardsOf, cleanName, formatValue, GAMES, NAME_MAX } from './leaderboard-core.js';

const KEYS = { pid: 'pao-pid', name: 'pao-name' };
const ENDPOINT = '/api/scores';
const memory = {}; // localStorage 不可用（隐私模式）时，至少在本次访问里保持稳定
const read = (key) => { try { return localStorage.getItem(key); } catch { return memory[key] ?? null; } };
const write = (key, value) => { memory[key] = value; try { localStorage.setItem(key, value); } catch { /* private mode */ } };

export function playerId() {
  let pid = read(KEYS.pid);
  if (!pid || !/^[A-Za-z0-9_-]{8,64}$/.test(pid)) {
    pid = crypto.randomUUID?.() ?? `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    write(KEYS.pid, pid);
  }
  return pid;
}
export function playerName() {
  let name = read(KEYS.name);
  if (!name) { name = `玩家${String(Math.floor(Math.random() * 9000) + 1000)}`; write(KEYS.name, name); }
  return name;
}
export const setPlayerName = (raw) => { const name = cleanName(raw); write(KEYS.name, name); return name; };

async function request(path, options) {
  const response = await fetch(path, { cache: 'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `榜单暂时连不上 (${response.status})`);
  return data;
}

// 一局结束后调用。返回要显示在结算卡片上的一行字；连不上榜单时返回提示而不是抛错，不能影响游戏本身。
export async function reportScore(board, value) {
  if (!BOARDS[board] || !Number.isInteger(value)) return '';
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

export const fetchBoard = (board) => request(`${ENDPOINT}?board=${encodeURIComponent(board)}&pid=${encodeURIComponent(playerId())}`);

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
  games.replaceChildren(...GAMES.map(({ id, title }) => {
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
  $('#board-name').value = playerName();
  $('#board').classList.add('active');
  showBoard(board);
}
export const closeBoard = () => { loadToken += 1; $('#board').classList.remove('active'); };

export function initBoard() {
  $('#close-board').addEventListener('click', closeBoard);
  $('#board').addEventListener('click', (event) => { if (event.target.id === 'board') closeBoard(); });
  const input = $('#board-name');
  input.maxLength = NAME_MAX;
  input.addEventListener('change', () => { input.value = setPlayerName(input.value); });
}
