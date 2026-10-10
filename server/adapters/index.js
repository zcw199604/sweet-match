import gomoku from './gomoku.js';
import reversi from './reversi.js';
import draughts from './draughts.js';
import jungle from './jungle.js';
import xiangqi from './xiangqi.js';
import g2048 from './g2048-race.js';
import minesweeper from './minesweeper-race.js';
import junqi from './junqi.js';
import doudizhu from './doudizhu.js';
import aeroplane from './aeroplane.js';

// 房间名就是适配器的键。新游戏：写一个适配器、在这里注册一行。
// 适配器契约：seats / init(options) / canAct(state, seat) / apply(state, seat, action) / view(state, seat) / result(state)
// 可选：cantAct(state, seat) —— canAct 为假时给客户端看的原因，默认「还没轮到你」。
// 可选：seatCount(options) —— 按（还没白名单过的）创建选项决定真人座位数，默认 seats；teamGame —— 组队局，有人离开时本局作废而不是判对方赢；
//       auto(state) —— 电脑代打：轮到没有真人的座位时由房间定时调用，返回 { ok: true, state }，轮到真人就返回 null。
export const adapters = { gomoku, reversi, draughts, jungle, xiangqi, g2048, minesweeper, junqi, doudizhu, aeroplane };
