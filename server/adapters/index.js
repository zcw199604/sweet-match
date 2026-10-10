import gomoku from './gomoku.js';
import reversi from './reversi.js';
import draughts from './draughts.js';
import jungle from './jungle.js';
import xiangqi from './xiangqi.js';
import g2048 from './g2048-race.js';
import minesweeper from './minesweeper-race.js';

// 房间名就是适配器的键。新游戏：写一个适配器、在这里注册一行。
// 适配器契约：seats / init(options) / canAct(state, seat) / apply(state, seat, action) / view(state, seat) / result(state)
// 可选：cantAct(state, seat) —— canAct 为假时给客户端看的原因，默认「还没轮到你」。
export const adapters = { gomoku, reversi, draughts, jungle, xiangqi, g2048, minesweeper };
