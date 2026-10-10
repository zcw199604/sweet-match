import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, boardsOf } from '../leaderboard-core.js';
import { handleActivity, memoryStore, boardTitle } from '../activity-core.js';
import { emptyState, markOpened, recentList, viewOf } from '../recent-core.js';

const games = ['minesweeper', 'doudizhu', 'junqi', 'xiangqi'];
test('经典小游戏进入最近常玩目录，无需虚构排行榜分数', () => {
  let recent = emptyState();
  games.forEach((id, i) => { assert.ok(GAMES.some(g => g.id === id)); recent = markOpened(recent, id, i + 1); assert.deepEqual(boardsOf(id), []); });
  assert.deepEqual(recentList(viewOf(recent)).map(g => g.game), [...games].reverse());
});
test('经典小游戏的游玩时长可记录，并使用中文游戏名称', async () => {
  for (const id of games) {
    const store = memoryStore();
    const response = await handleActivity(new Request('http://x/api/activity', { method: 'POST', body: JSON.stringify({ sid: 'session-test', pid: 'player-test', name: '测试', board: id, active_ms: 6000, elapsed_ms: 6000 }) }), store);
    assert.equal(response.status, 200);
    assert.equal(boardTitle(id, GAMES), GAMES.find(g => g.id === id)?.title);
  }
});
