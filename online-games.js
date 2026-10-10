// 哪些游戏支持联机，以及各自在联机外壳里怎么挂载。新游戏：先在 server/adapters/ 写适配器，再在这里加一行。
// lead：大厅里的一句说明（棋类用默认文案）；seats：座位对应的称呼（和服务端的座位顺序一致）；options：创建房间时玩家能选的项目（键名要和服务端适配器的 init 对上）。
export const ONLINE_GAMES = {
  gomoku: { seats: ['黑方', '白方'], load: () => import('./board-games.js'), mount: 'mountGomoku' },
  reversi: { seats: ['黑方', '白方'], load: () => import('./board-games.js'), mount: 'mountReversi' },
  draughts: { seats: ['白方', '黑方'], load: () => import('./board-games.js'), mount: 'mountDraughts' },
  jungle: { seats: ['红方', '蓝方'], load: () => import('./board-games.js'), mount: 'mountJungle' },
  xiangqi: { seats: ['红方', '黑方'], load: () => import('./xiangqi.js'), mount: 'mountXiangqi' },
  g2048: {
    seats: ['玩家 1', '玩家 2'], race: true,
    lead: '两人同一个开局，各玩各的盘面，先合出目标方块的人获胜；谁先被堵死就停手，等对手结束。',
    options: [{ key: 'target', label: '目标方块', choices: [[512, '512'], [1024, '1024'], [2048, '2048']], fallback: 1024 }],
    boxClass: 'canvas-wrap g2048-wrap',
    load: () => import('./g2048.js'), mount: 'mountG2048'
  },
  minesweeper: {
    seats: ['玩家 1', '玩家 2'], race: true,
    lead: '两人是同一块雷区，各扫各的，先扫完所有安全格的人获胜；踩雷当场判负，能看到对手的进度。',
    options: [{ key: 'level', label: '难度', choices: [['easy', '简单'], ['normal', '普通'], ['hard', '困难']], fallback: 'normal' }],
    load: () => import('./minesweeper.js'), mount: 'mountMinesweeper'
  }
};
export const isOnlineGame = (id) => Object.hasOwn(ONLINE_GAMES, id);
