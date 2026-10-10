// 哪些游戏支持联机，以及各自在联机外壳里怎么挂载。新游戏：先在 server/adapters/ 写适配器，再在这里加一行。
// lead：大厅里的一句说明（棋类用默认文案）；seats：座位对应的称呼（和服务端的座位顺序一致）；seatName(seat, view)：称呼要看对局内容时用它（飞行棋的队伍）；
// race：竞速游戏；noSwap：没有先后手可换（再来一局不提供「换边」）；options：创建房间时玩家能选的项目（键名要和服务端适配器的 init 对上）。
export const ONLINE_GAMES = {
  gomoku: { seats: ['黑方', '白方'], load: () => import('./board-games.js'), mount: 'mountGomoku' },
  reversi: { seats: ['黑方', '白方'], load: () => import('./board-games.js'), mount: 'mountReversi' },
  draughts: { seats: ['白方', '黑方'], load: () => import('./board-games.js'), mount: 'mountDraughts' },
  jungle: { seats: ['红方', '蓝方'], load: () => import('./board-games.js'), mount: 'mountJungle' },
  xiangqi: { seats: ['红方', '黑方'], load: () => import('./xiangqi.js'), mount: 'mountXiangqi' },
  junqi: {
    seats: ['先手', '后手'], noSwap: true,
    lead: '翻棋版军棋：每人轮流翻一枚暗棋或走一步，首枚翻出的棋子决定阵营。暗棋的身份只有翻开后才会告诉双方。',
    load: () => import('./junqi.js'), mount: 'mountJunqi'
  },
  doudizhu: {
    seats: ['玩家 1', '玩家 2', '玩家 3'], noSwap: true,
    lead: '三人斗地主。两个人也能开：第三家由电脑代打。人齐后自动开局，只有轮到你时才能叫分、出牌。',
    options: [{ key: 'humans', label: '真人玩家', choices: [[2, '2 人（补 1 个电脑）'], [3, '3 人']], fallback: 2 }],
    load: () => import('./doudizhu.js'), mount: 'mountDoudizhu'
  },
  aeroplane: {
    seats: ['红队', '黄队', '绿队', '蓝队'], noSwap: true,
    // 2 人局坐红、绿（对角），其余队伍由电脑代打，所以座位名要看服务端告诉的队伍，不能按座位号猜。
    seatName: (seat, view) => ['红队', '黄队', '绿队', '蓝队'][view?.team ?? seat],
    lead: '飞行棋：掷六起飞，同色跳格、航线飞跃，撞到对手送回机场，四架飞机先全部到终点的队伍获胜。人不够 4 个时，空出的队伍由电脑代打。',
    options: [{ key: 'humans', label: '真人玩家', choices: [[2, '2 人（红 · 绿）'], [3, '3 人（红 · 黄 · 绿）'], [4, '4 人']], fallback: 2 }],
    load: () => import('./aeroplane.js'), mount: 'mountAeroplane'
  },
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
