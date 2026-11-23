import test from 'node:test';
import assert from 'node:assert/strict';
import { pair, startServer, until } from './helpers.js';
import { RULES } from '../../wallshot-core.js';

// 阶段时长缩到 1/10：躲藏 500ms、瞄准 1.2s、揭晓 180ms。房间每次开局时才读这个值。
process.env.WALLSHOT_TIME_SCALE = '0.1';

async function begin(t) {
  const { url } = await startServer(t);
  const room = await pair(url, 'wallshot');
  room.a.send('action', { type: 'ready' });
  room.b.send('action', { type: 'ready' });
  await until(() => room.seenA.state.view.phase === 'hide' && room.seenB.state.view.phase === 'hide', { what: '双方准备后开第一回合' });
  const sniperSeat = room.seenA.state.view.sniper;
  const [sniper, hider] = sniperSeat === 0 ? [[room.a, room.seenA], [room.b, room.seenB]] : [[room.b, room.seenB], [room.a, room.seenA]];
  return { ...room, sniper, hider };
}

test('wallshot 房间：计时由服务端推进，躲的人的位置不发给狙击的人，命中由服务端判', async (t) => {
  const { sniper, hider } = await begin(t);
  const [shooter, seenS] = sniper, [, seenH] = hider;
  assert.equal(seenS.state.view.body, null, '狙击的人看不见藏好的人');
  assert.ok(seenH.state.view.body, '躲的人知道自己在哪');
  // 躲藏阶段开枪（打在没人的墙顶）：静默丢掉，不弹提示
  shooter.send('action', { type: 'shoot', x: 10, y: 168 });
  await until(() => seenS.state.view.phase === 'aim', { what: '躲藏时间到，进入瞄准' });
  assert.equal(seenS.rejects.length, 0, '过时的动作不弹 reject');
  assert.equal(seenS.state.view.bullets, RULES.BULLETS, '躲藏阶段那一枪没算');
  // 狙击的人瞄准，躲的人只看到准星在哪一列
  shooter.send('action', { type: 'aim', x: 50, y: 60 });
  await until(() => seenH.state.view.aim?.x === 50, { what: '躲的人看到红光' });
  assert.equal(seenH.state.view.aim.y, undefined);
  // 照着头打（测试作弊：从躲的人那边读坐标）→ 爆头获胜
  shooter.send('action', { type: 'shoot', x: seenH.state.view.body.x, y: 106 });
  await until(() => seenS.state.result.over, { what: '爆头分出胜负' });
  assert.equal(seenS.state.result.winner, seenS.state.seat);
  assert.equal(seenH.state.view.reason, 'head');
  assert.ok(seenS.state.view.body, '结束后双方都看得见');
  assert.equal(JSON.stringify(seenS.state).includes('"rng"'), false);
});

test('wallshot 房间：瞄准超时自动换边；躲的人移动按速度截断', async (t) => {
  const { hider, seenA } = await begin(t);
  const [mover, seenH] = hider;
  const x0 = seenH.state.view.body.x;
  mover.send('action', { type: 'move', x: x0 > 180 ? 0 : 360 });
  await until(() => seenH.state.view.body?.x !== x0, { what: '移动生效' });
  assert.ok(Math.abs(seenH.state.view.body.x - x0) < 60, '不能一步瞬移到墙那头');
  const first = seenA.state.view.sniper;
  await until(() => seenA.state.view.turn === 2, { timeout: 8000, what: '超时后进入第二回合' });
  assert.equal(seenA.state.view.sniper, 1 - first, '换边了');
  assert.equal(seenA.state.view.last.reason, 'timeout');
});
