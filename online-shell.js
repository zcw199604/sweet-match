// 联机外壳：大厅（创建 / 加入）→ 等对手 → 对局条 + 游戏本体。游戏本体由各游戏的 mount 函数画，
// 外壳只负责连接和房间；游戏通过 mount 的 `online` 参数（一个 Session）收状态、发动作。
import { ONLINE_GAMES } from './online-games.js';
import { Session, friendlyError, hasResume, isCode, loadSdk, normalizeCode, resolveServerUrl, shareUrl } from './net-session.js';

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};
const safe = (read, fallback = null) => { try { return read(); } catch { return fallback; } };
const RIVAL = { online: ['online', '对手在线'], offline: ['offline', '对手掉线，等待重连…'], empty: ['gone', '对手已离开'] };
const CROWD = { online: ['online', '其他玩家都在线'], offline: ['offline', '有人掉线，等待重连…'], empty: ['gone', '有人已离开'] };
// 除我以外的人里，最糟的状态决定提示：有人走了 > 有人掉线 > 都在线。两人局就是对手本人的状态。
const rivalState = (seats, seat) => {
  const others = seats.filter((_, i) => i !== seat);
  return others.includes('empty') ? 'empty' : others.includes('offline') ? 'offline' : 'online';
};

// 「本地 / 联机对战」切换条。onSelect('local' | 'online')；返回 { el, select }。
export function createModeTabs(onSelect, active = 'local') {
  const bar = el('div', 'mode-tabs');
  bar.setAttribute('role', 'tablist');
  const tabs = [['local', '本地'], ['online', '联机对战']].map(([id, label]) => {
    const button = el('button', 'mode-tab', label);
    button.type = 'button';
    button.dataset.tab = id;
    button.setAttribute('role', 'tab');
    button.addEventListener('click', () => select(id, true));
    bar.append(button);
    return button;
  });
  function select(id, notify = false) {
    for (const tab of tabs) {
      const on = tab.dataset.tab === id;
      tab.classList.toggle('active', on);
      tab.setAttribute('aria-selected', String(on));
    }
    if (notify) onSelect(id);
  }
  select(active);
  return { el: bar, select };
}

export function mountOnlineShell(wrap, { game, onHud = () => {}, autoJoin = null, storage = safe(() => window.sessionStorage) } = {}) {
  const cfg = ONLINE_GAMES[game];
  const root = el('section', `online-shell online-${game}`);
  wrap.replaceChildren(root);
  let alive = true, session = null, gameHandle = null, view = 'none', busy = false, leaving = false, noteTimer = 0;
  let bar = null;

  const serverUrl = () => resolveServerUrl({ search: location.search, stored: safe(() => localStorage.getItem('pao-net-server')), hostname: location.hostname });

  function button(label, className, onClick) {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }
  function note(text, bad = false) {
    if (!bar) return;
    bar.note.textContent = text;
    bar.note.classList.toggle('bad', bad);
    clearTimeout(noteTimer);
    if (text) noteTimer = setTimeout(() => { if (bar) bar.note.textContent = ''; }, 2800);
  }

  // ---- 大厅 ----
  function showLobby(message = '', bad = false) {
    view = 'lobby';
    bar = null;
    const box = el('div', 'online-lobby');
    box.append(el('h3', '', '联机对战'), el('p', 'online-lead', cfg.lead ?? '创建房间，把房间码或邀请链接发给朋友，对方打开就能加入。'));
    const controls = (cfg.options ?? []).map((option) => {
      const label = el('label', 'online-option', `${option.label} `);
      const select = el('select');
      option.choices.forEach(([value, text], index) => {
        select.append(new Option(text, String(index)));
        if (value === option.fallback) select.value = String(index);
      });
      label.append(select);
      box.append(label);
      return { option, select };
    });
    const create = button('创建房间', 'online-primary', () => {
      const options = Object.fromEntries(controls.map(({ option, select }) => [option.key, option.choices[select.selectedIndex][0]]));
      connect((s) => s.create(options), '正在创建房间……');
    });
    const join = el('div', 'online-join');
    const input = el('input');
    Object.assign(input, { type: 'text', maxLength: 8, placeholder: '输入 5 位房间码', autocomplete: 'off', spellcheck: false });
    input.setAttribute('autocapitalize', 'characters');
    input.setAttribute('aria-label', '房间码');
    const go = () => {
      const code = normalizeCode(input.value);
      if (!isCode(code)) return showLobby('房间码是 5 位字母和数字（没有 I、O、0、1）。', true);
      connect((s) => s.join(code), '正在加入房间……');
    };
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') go(); });
    join.append(input, button('加入', 'online-secondary', go));
    const msg = el('p', `online-msg${bad ? ' bad' : ''}`, message);
    msg.setAttribute('role', 'status');
    box.append(create, join, msg);
    if (busy) box.classList.add('busy');
    root.replaceChildren(box);
    onHud('联机对战 · 创建或加入房间');
  }

  // ---- 等对手 ----
  const waitingText = () => {
    const seats = session?.seats ?? [];
    return seats.length > 2 ? `等待其他玩家加入（${seats.filter((x) => x !== 'empty').length}/${seats.length}）……` : '等待对手加入……';
  };
  function showWaiting() {
    view = 'waiting';
    bar = null;
    const link = shareUrl(location.origin, game, session.code);
    const box = el('div', 'online-wait');
    const code = el('strong', 'online-code', session.code);
    code.setAttribute('aria-label', `房间码 ${session.code.split('').join(' ')}`);
    const field = el('input', 'online-link');
    Object.assign(field, { type: 'text', readOnly: true, value: link });
    field.setAttribute('aria-label', '邀请链接');
    field.addEventListener('focus', () => field.select());
    const copied = el('p', 'online-msg');
    const copy = (text, what) => navigator.clipboard?.writeText(text).then(() => { copied.textContent = `${what}已复制`; }, () => { copied.textContent = '复制失败，请长按链接手动复制'; field.select(); });
    box.append(
      el('p', 'online-lead', '把房间码发给朋友，或者发邀请链接：'), code, field,
      el('div', 'online-actions'), el('p', 'online-waiting', waitingText()), copied
    );
    box.querySelector('.online-actions').append(
      button('复制房间码', 'online-secondary', () => copy(session.code, '房间码')),
      button('复制邀请链接', 'online-secondary', () => copy(link, '邀请链接')),
      button('取消', 'online-ghost', () => leave(true))
    );
    root.replaceChildren(box);
    onHud(`房间 ${session.code} · 等待对手`);
  }

  // ---- 对局 ----
  function enterPlay() {
    view = 'play';
    const s = session;
    const status = el('span', 'online-rival');
    bar = { status, you: el('span', 'online-you'), note: el('span', 'online-note'), room: el('span', 'online-room'), after: el('div', 'online-after') };
    bar.note.setAttribute('role', 'status');
    bar.note.setAttribute('aria-live', 'polite');
    const top = el('div', 'online-bar');
    top.append(bar.room, bar.you, status, bar.note, button('离开房间', 'online-ghost', () => leave(false)));
    const box = el('div', `online-game ${cfg.boxClass ?? ''}`.trim());
    root.replaceChildren(top, bar.after, box);   // 结束提示条在棋盘上方：手机上不用滚动就能看到
    updateBar();
    cfg.load().then((module) => {
      if (!alive || session !== s) return;
      gameHandle = module[cfg.mount](box, { onHud, online: s });
    }).catch((error) => {
      console.error(error);
      if (alive) box.textContent = '游戏加载失败，请刷新页面后重试。';
    });
  }
  // 对局结束后的「再来一局 / 换边再来」。提议、同意、拒绝都经过服务端，这里只按 session.rematch 画。
  function renderAfter() {
    const box = bar.after, s = session;
    const { over, reason } = s.result, seat = s.seat, crowd = s.seats.length > 2, rival = rivalState(s.seats, seat);
    const signature = JSON.stringify([over, reason, rival, s.rematch]);
    if (box.dataset.sig === signature) return;
    box.dataset.sig = signature;
    box.replaceChildren();
    box.hidden = !over;
    if (!over) return;
    const label = (swap) => (swap ? '换边再来' : '再来一局');
    const row = el('div', 'online-actions');
    const ask = (swap, text, className = 'online-secondary') => button(text, className, () => s.proposeRematch(swap));
    const noSwap = cfg.race || cfg.noSwap;
    if (reason === 'forfeit' || reason === 'abandoned' || rival === 'empty') {
      box.append(el('p', 'online-after-text', crowd ? '有人已经离开，不能再来一局了。' : '对手已经离开，不能再来一局了。'));
    } else if (s.rematch && (s.rematch.agreed ? s.rematch.agreed.includes(seat) : s.rematch.seat === seat)) {
      box.append(el('p', 'online-after-text', s.rematch.agreed
        ? `已同意再来一局（${s.rematch.agreed.length}/${s.seats.length}），等其他玩家确认……`
        : `已向对手发出邀请（${label(s.rematch.swap)}），等待确认……`));
      row.append(button(s.rematch.agreed ? '取消' : '取消邀请', 'online-ghost', () => s.clearRematch()));
    } else if (s.rematch?.agreed) {
      box.append(el('p', 'online-after-text', `有人想再来一局（${s.rematch.agreed.length}/${s.seats.length} 已同意）`));
      row.append(ask(false, '同意', 'online-primary'), button('拒绝', 'online-ghost', () => s.clearRematch()));
    } else if (s.rematch) {
      const swap = s.rematch.swap;
      box.append(el('p', 'online-after-text', swap ? '对手想换边再来一局（先后手互换）' : '对手想再来一局'));
      row.append(ask(swap, '同意', 'online-primary'), button('拒绝', 'online-ghost', () => s.clearRematch()));
      if (!noSwap) row.append(ask(!swap, swap ? '改为原座位' : '改为换边'));
    } else {
      box.append(el('p', 'online-after-text', rival === 'offline' ? '这一局结束了，有人暂时掉线，可以先发出邀请。' : '这一局结束了。'));
      row.append(ask(false, '再来一局', 'online-primary'));
      if (!noSwap) row.append(ask(true, '换边再来'));   // 竞速游戏两边是对称的、多人局没有先后手，换边没有意义
    }
    if (row.childElementCount) box.append(row);
  }
  function updateBar() {
    if (!bar || !session) return;
    renderAfter();
    const seat = session.seat;
    bar.room.textContent = `房间 ${session.code ?? ''}`;
    bar.you.textContent = seat === null ? '' : `你是${cfg.seatName?.(seat, session.view) ?? cfg.seats[seat]}`;
    if (session.status === 'reconnecting') {
      bar.status.className = 'online-rival offline';
      bar.status.textContent = '连接中断，正在重连…';
      return;
    }
    const rival = rivalState(session.seats, seat);
    const [kind, text] = (session.seats.length > 2 ? CROWD : RIVAL)[rival];
    bar.status.className = `online-rival ${kind}`;
    bar.status.textContent = text;
  }

  // ---- 连接与退出 ----
  async function connect(run, busyText) {
    if (busy || !alive) return;
    busy = true;
    showLobby(busyText, false);
    try {
      const sdk = await loadSdk();
      const next = new Session({ sdk, url: serverUrl(), game, storage });
      await run(next);
      if (!alive) { next.suspend(); return; }
      session = next;
      session.on('state', refresh);
      session.on('status', onStatus);
      session.on('reject', (text) => note(text, true));
      session.on('notice', (text) => note(text, false));
      busy = false;
      refresh();
    } catch (error) {
      busy = false;
      if (alive) showLobby(friendlyError(error), true);
    }
  }
  function refresh() {
    if (!alive || !session?.state) return;
    if (view === 'play') return updateBar();
    if (session.full) return enterPlay();
    if (view !== 'waiting') showWaiting();
    else root.querySelector('.online-waiting')?.replaceChildren(waitingText());
  }
  function onStatus(status) {
    if (!alive) return;
    if (status === 'closed' && !leaving) {
      toLobby(session?.closeReason === 'lost' ? '连接中断太久，这一局已经结束了。可以重新创建或加入房间。' : '房间已经关闭。', true);
    } else updateBar();
  }
  function toLobby(message, bad = false) {
    gameHandle?.destroy?.();
    gameHandle = null;
    session = null;
    showLobby(message, bad);
  }
  async function leave(waiting) {
    if (!session) return;
    if (!waiting && !session.result.over && !window.confirm('现在离开，这一局会判对手获胜。确定要离开吗？')) return;
    leaving = true;
    await session.leave();
    leaving = false;
    toLobby('已离开房间。');
  }

  (async () => {
    showLobby();
    if (autoJoin) return connect((s) => s.join(autoJoin), `正在加入房间 ${autoJoin}……`);
    if (hasResume(storage, game)) await connect(async (s) => { if (!(await s.resume())) throw new Error('上一局已经结束了。'); }, '正在回到上一局……');
  })();

  return {
    get session() { return session; },
    restart() { /* 联机对局不能单方面重开 */ },
    destroy() {
      alive = false;
      clearTimeout(noteTimer);
      gameHandle?.destroy?.();
      // 还在等人 → 直接退房，别让房间空占 60 秒；对局进行中 → 只断开，保留座位，回来能接着玩。
      if (session) (session.full ? session.suspend() : session.leave());
      wrap.replaceChildren();
    }
  };
}
