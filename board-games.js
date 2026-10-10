import * as gomoku from './gomoku-core.js';
import * as reversi from './reversi-core.js';
import * as draughts from './draughts-core.js';
import * as jungle from './jungle-core.js';

const configs = {
  gomoku: { core: gomoku, title:'五子棋', rows:15, cols:15, sides:['黑方','白方'], note:'点交叉点落子 · 五连获胜', rules:'15×15 自由五子棋，黑方先行；横、竖、两条斜线连续五枚或更多同色子获胜。无禁手，满盘无五连为和棋。' },
  reversi: { core: reversi, title:'黑白棋', rows:8, cols:8, sides:['黑方','白方'], note:'亮点可落子 · 夹住对方棋子就能翻面', rules:'黑方先行，落子必须在至少一个方向夹住对方连续棋子，八个方向同时翻面。无合法落点自动跳过；双方均不能落子时，棋子多的一方获胜，数量相同为和棋。' },
  draughts: { core: draughts, title:'国际跳棋', rows:10, cols:10, sides:['白方','黑方'], note:'点棋子，再点亮点 · 连吃时逐格选路线', rules:'10×10 国际跳棋，每方 20 子，白方先行。兵向前斜走一格，可向前或向后吃子；王沿对角线远行。有吃必吃，并须选择吃子数量最多的路线；连吃途中逐格点选亮点，完成整条路线后才结束回合。兵在回合结束停于对方底线升王。无子或无合法走法判负，三次重复局面或连续 25 回合仅王移动且无吃子为和棋；特殊残局限步暂未实现。' },
  jungle: { core: jungle, title:'斗兽棋', rows:9, cols:7, sides:['红方','蓝方'], note:'点动物，再点亮点 · 进入敌方兽穴获胜', rules:'象 > 狮 > 虎 > 豹 > 狼 > 狗 > 猫 > 鼠；大吃小、同级可吃，陆地鼠可吃象，象不能吃鼠。只有鼠能下河，水陆之间不能吃子；狮虎可以跳河，航线上任意鼠都会阻挡。进敌方陷阱的动物力量为零，不能进己方兽穴；进入敌穴或对手无棋可走即获胜，三次重复局面和棋。' }
};
const animals=['','鼠','猫','狗','狼','豹','虎','狮','象'];
const icons=['','🐭','🐱','🐶','🐺','🐆','🐯','🦁','🐘'];
function el(tag,cls,text) { const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node; }

function mountBoard(id, wrap, {onHud=()=>{}, online=null}={}) {
  const config=configs[id], core=config.core;
  // online：联机时的 Session。状态以服务端推来的 view 为准，走子只是发给服务端，不在本地推进。
  let state=online?.view??core.createState(), mode=online?'online':'ai', alive=true, timer=0, history=[], selected=null, route=[];
  const root=el('section',`classic-game strategy-game ${id}-game`);
  const tools=el('div','classic-tools board-tools');tools.hidden=Boolean(online);
  const label=el('label','','对弈 '), select=el('select'); select.dataset.action='mode';
  select.append(new Option(`人机（${config.sides[0]}）`,'ai'),new Option('同屏双人','local'));label.append(select);
  const undo=el('button','classic-button','↶ 悔棋');undo.dataset.action='undo';
  const restart=el('button','classic-button','↻ 新一局');restart.dataset.action='restart';tools.append(label,undo,restart);
  const players=el('div','board-players'), seats=[el('span','board-player side-1'),el('span','board-player side-2')];players.append(...seats);
  const status=el('p','classic-status board-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const board=el('div',`strategy-board ${id}-board`);board.style.setProperty('--cols',config.cols);board.style.setProperty('--rows',config.rows);
  board.setAttribute('role','group');board.setAttribute('aria-label',`${config.title}，${config.rows}行${config.cols}列`);
  const note=el('p','board-note',config.note);
  const rules=el('details','board-rules');rules.append(el('summary','','怎么玩？'),el('p','',config.rules));
  if(online?.seat===1&&(id==='draughts'||id==='jungle')) board.classList.add('flipped');   // 后手在上方开局：转过来让自己的棋子在下面（换边后随座位更新，见 orient）
  root.append(tools,players,status,board,note,rules);wrap.replaceChildren(root);
  const cells=Array.from({length:config.rows*config.cols},(_,at)=>{
    const cell=el('button','board-cell');cell.type='button';cell.dataset.cell=at;cell.addEventListener('click',()=>click(at));board.append(cell);return cell;
  });
  const mine=()=>!online||(!online.result.over&&state.turn===online.seat+1);
  const blocked=()=>!alive||state.status!=='playing'||(mode==='ai'&&state.turn===2)||!mine();
  const clear=()=>{clearTimeout(timer);timer=0;};
  const sideName=side=>config.sides[side-1];
  function available() {
    return core.legalMoves(state).filter(m=>selected===null||m.from===selected).filter(m=>route.every((at,i)=>m.path?.[i]===at));
  }
  function render() {
    if(!alive)return;
    const moves=available(),targets=new Set(id==='gomoku'?[]:id==='reversi'?moves.map(m=>m.to):selected===null?[]:moves.map(m=>m.path?m.path[route.length]:m.to));
    const movable=new Set(core.legalMoves(state).map(m=>m.from));
    const preview=state.board.slice(),captured=new Set();
    if(route.length) {
      preview[selected]=null;preview[route.at(-1)]=state.board[selected];
      moves[0]?.captures.slice(0,route.length).forEach(at=>captured.add(at));
    }
    const count=side=>state.board.filter(p=>p?.side===side).length;
    seats.forEach((seat,i)=>{seat.textContent=`${online?(i===online.seat?'你':'对手'):mode==='ai'?(i?'电脑':'你'):`玩家 ${i+1}`} · ${sideName(i+1)} · ${count(i+1)} 子`;seat.classList.toggle('current',state.status==='playing'&&state.turn===i+1);});
    let text=state.status==='won'?`${sideName(state.winner)}获胜！`:state.status==='draw'?'本局和棋':`${sideName(state.turn)}${mode==='ai'&&state.turn===2?' · 电脑思考中…':route.length?' · 继续连吃':selected!==null?' · 选择亮起的落点':' · 请走棋'}`;
    if(online) {
      const {over,winner}=online.result;
      if(state.status==='won') text+=winner===online.seat||state.winner===online.seat+1?' · 你赢了！':' · 你输了';
      else if(over&&state.status==='playing') text=winner===online.seat?'对手已离开 · 你获胜！':'你已离开本局 · 对手获胜';
      else if(state.status==='playing') text=mine()?(route.length?'轮到你 · 继续连吃':selected!==null?'轮到你 · 选择亮起的落点':'轮到你 · 请走棋'):'等待对手走棋……';
    }
    status.textContent=(state.passed?`${sideName(state.passed)}无落点，跳过 · `:'')+text;
    onHud(`${config.title} · ${text} · ${state.moves} 手`);undo.disabled=!history.length;
    cells.forEach((cell,at)=>{
      const piece=preview[at],r=Math.floor(at/config.cols),c=at%config.cols;
      const terrain=id==='jungle'?core.terrain(at):'';
      const owner=id==='jungle'?core.owner(at):null;
      cell.className=`board-cell ${(r+c)%2?'dark':'light'} ${terrain}${owner?` owner-${owner}`:''}${targets.has(at)?' target':''}${movable.has(at)?' movable':''}${(route.length?route.at(-1):selected)===at?' selected':''}${captured.has(at)?' pending-capture':''}${state.last?.to===at||route.includes(at)?' last':''}`;
      cell.replaceChildren();
      if(piece) {
        const chip=el('span',`board-piece side-${piece.side}${piece.king?' king':''}`);
        if(id==='jungle') {chip.append(el('span','animal-icon',icons[piece.rank]),el('small','',animals[piece.rank]));}
        else if(piece.king) chip.textContent='♛';
        cell.append(chip);
      } else if(terrain==='den'||terrain==='trap') cell.append(el('span','terrain-mark',terrain==='den'?'穴':'✦'));
      if(targets.has(at)) cell.append(el('span','target-dot'));
      cell.disabled=blocked();
      cell.setAttribute('aria-pressed',String(selected===at));
      cell.setAttribute('aria-label',`${r+1}行${c+1}列，${piece?sideName(piece.side)+(piece.rank?animals[piece.rank]:piece.king?'王':'棋子'):terrain==='river'?'河流':terrain==='den'?'兽穴':terrain==='trap'?'陷阱':'空位'}${targets.has(at)?'，可落子':''}`);
    });
    if(mode==='ai'&&state.turn===2&&state.status==='playing'&&!timer) {
      timer=setTimeout(()=>{timer=0;if(alive&&mode==='ai'&&state.turn===2&&state.status==='playing'){const move=core.chooseAiMove(state);if(move)play(move);}},420);
    }
  }
  function play(move) {
    if(online) {online.send(move);selected=null;route=[];render();return;}
    const result=core.applyMove(state,move);
    if(!result.ok)return;
    history.push(state);state=result.state;selected=null;route=[];render();
  }
  function click(at) {
    if(blocked())return;
    if(id==='gomoku'||id==='reversi')return play({to:at});
    if(selected!==null) {
      const candidates=available().filter(m=>(m.path?m.path[route.length]:m.to)===at);
      if(candidates.length) {
        if(id==='draughts') {
          route.push(at);const complete=candidates.find(m=>m.path.length===route.length);
          if(complete)return play(complete);
          render();return;
        }
        return play(candidates[0]);
      }
    }
    route=[];selected=state.board[at]?.side===state.turn&&core.legalMoves(state,at).length?at:null;render();
  }
  function reset(){if(!alive||online)return;clear();state=core.createState();history=[];selected=null;route=[];render();}
  select.addEventListener('change',()=>{mode=select.value;reset();});restart.addEventListener('click',reset);
  undo.addEventListener('click',()=>{
    if(!alive||!history.length)return;
    clear();state=history.pop();
    if(mode==='ai')while(state.turn!==1&&history.length)state=history.pop();
    selected=null;route=[];render();
  });
  const orient=()=>{if(online&&(id==='draughts'||id==='jungle')) board.classList.toggle('flipped',online.seat===1);};
  const off=online?.on('state',payload=>{state=payload.view;selected=null;route=[];orient();render();});
  render();
  return {restart:reset,destroy(){alive=false;off?.();clear();root.remove();},get state(){return state;}};
}
export const mountGomoku=(wrap,options)=>mountBoard('gomoku',wrap,options);
export const mountReversi=(wrap,options)=>mountBoard('reversi',wrap,options);
export const mountDraughts=(wrap,options)=>mountBoard('draughts',wrap,options);
export const mountJungle=(wrap,options)=>mountBoard('jungle',wrap,options);
