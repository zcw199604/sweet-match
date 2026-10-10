export const AEROPLANE_TEAMS = ['红队', '黄队', '绿队', '蓝队'];
export const AEROPLANE_RING = [
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6],
  [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0], [7, 0],
  [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5],
  [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6], [14, 7],
  [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8],
  [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14], [7, 14],
  [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9],
  [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], [0, 7]
];
export const AEROPLANE_HOME = Array.from({ length: 4 }, (_, player) =>
  Array.from({ length: 6 }, (_, i) => player === 0 ? [i + 1, 7] : player === 1 ? [7, i + 1] : player === 2 ? [13 - i, 7] : [7, 13 - i]));

export function createAeroplane() {
  return { planes: Array.from({ length: 4 }, () => [-1, -1, -1, -1]), turn: 0, phase: 'roll', dice: null,
    legal: [], sixes: 0, winner: null, moves: 0, lastMove: null, message: '红队先行' };
}

export function aeroplaneCell(player, progress) {
  if (progress < 0) return `airport-${player}`;
  if (progress >= 52) return `home-${player}-${progress - 52}`;
  return (player * 13 + progress) % 52;
}

function endTurn(state) {
  state.phase = 'roll'; state.legal = [];
  if (state.dice !== 6) { state.turn = (state.turn + 1) % 4; state.sixes = 0; }
}

export function rollAeroplane(state, random = Math.random) {
  if (state.phase !== 'roll') return false;
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) return false;
  state.dice = Math.floor(value * 6) + 1;
  state.sixes = state.dice === 6 ? state.sixes + 1 : 0;
  if (state.sixes === 3) {
    state.message = `${AEROPLANE_TEAMS[state.turn]}连续三次掷六，第三次行动取消`;
    state.turn = (state.turn + 1) % 4; state.sixes = 0; state.legal = [];
    return true;
  }
  state.legal = state.planes[state.turn].flatMap((progress, i) => progress < 57 && (progress >= 0 || state.dice === 6) ? [i] : []);
  state.message = `${AEROPLANE_TEAMS[state.turn]}掷出 ${state.dice} 点`;
  if (!state.legal.length) {
    state.message += '，无飞机可动'; endTurn(state);
  } else state.phase = 'move';
  return true;
}

export function previewAeroplane(state, plane) {
  if (state.phase !== 'move' || !state.legal.includes(plane)) return null;
  const player = state.turn, from = state.planes[player][plane], path = [], bonuses = [];
  let to = from;
  if (from < 0) { to = 0; path.push(0); }
  else {
    let direction = 1;
    for (let i = 0; i < state.dice; i++) {
      if (to === 57) direction = -1;
      to += direction; path.push(to);
    }
    // Resolve each bonus once: flying takes precedence; a jump may lead into the flight tile.
    if (to === 16) { to += 12; path.push(to); bonuses.push('fly'); }
    else if (to < 48 && aeroplaneCell(player, to) % 4 === player) {
      to += 4; path.push(to); bonuses.push('jump');
      if (to === 16) { to += 12; path.push(to); bonuses.push('fly'); }
    }
  }
  const captured = [];
  if (to < 52) state.planes.forEach((planes, opponent) => {
    if (opponent === player) return;
    planes.forEach((progress, index) => {
      if (progress >= 0 && progress < 52 && aeroplaneCell(opponent, progress) === aeroplaneCell(player, to)) captured.push({ player: opponent, plane: index });
    });
  });
  return { player, plane, from, to, path, bonuses, captured };
}

export function moveAeroplane(state, plane) {
  const move = previewAeroplane(state, plane);
  if (!move) return false;
  state.planes[move.player][plane] = move.to;
  move.captured.forEach(hit => { state.planes[hit.player][hit.plane] = -1; });
  state.lastMove = move; state.moves++;
  state.message = `${AEROPLANE_TEAMS[move.player]} ${plane + 1} 号${move.from < 0 ? '起飞' : move.to === 57 ? '抵达终点' : '前进'}${move.bonuses.includes('jump') ? ' · 同色跳跃' : ''}${move.bonuses.includes('fly') ? ' · 飞越航线' : ''}${move.captured.length ? ` · 撞回 ${move.captured.length} 架` : ''}`;
  if (state.planes[move.player].every(progress => progress === 57)) {
    state.winner = move.player; state.phase = 'won'; state.legal = [];
    state.message = `${AEROPLANE_TEAMS[move.player]}四机全部抵达，获胜！`;
  } else endTurn(state);
  return true;
}
