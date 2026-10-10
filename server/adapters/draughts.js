import * as core from '../../draughts-core.js';
import { boardGame } from './board.js';

// repetition 是每个局面出现次数的表，越走越大；客户端算落点用不到，不发。
const view = ({ repetition, ...rest }) => rest;
export default boardGame('draughts', core, { view, illegal: '这步棋不合法。' });
