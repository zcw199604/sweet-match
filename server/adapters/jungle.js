import * as core from '../../jungle-core.js';
import { boardGame } from './board.js';

// 局面重复的历史挂在 state 的不可枚举属性上，只存在服务端内存里；视图里本来就没有。
export default boardGame('jungle', core);
