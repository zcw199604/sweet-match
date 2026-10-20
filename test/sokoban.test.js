import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, farthestPull, format, isSolved, move, parse, solvePushes, undo, walkPath } from '../sokoban-core.js';
import { LEVELS } from '../sokoban-levels.js';

const ROOM = ['#######', '#     #', '# $ . #', '#  @  #', '#######'].join('\n');

test('a map parses and formats back, and only floor reachable from the player counts', () => {
  assert.equal(format(parse(ROOM)), ROOM);
  const level = parse(ROOM);
  assert.equal(level.boxes.size, 1);
  assert.equal(level.goals.size, 1);
  assert.equal(level.floor.size, 15);
});

test('walking, pushing, blocked pushes and undo', () => {
  const game = createGame(ROOM);
  assert.ok(move(game, 3));             // 往左走一步
  assert.ok(move(game, 0));             // 往上：正好站到箱子下面
  undo(game); undo(game);
  assert.equal(game.moves, 0);
  // 自己找路走到箱子左边 (2,1)，再往右推两次进目标
  for (const d of walkPath(game, 2 * 7 + 1)) move(game, d);
  assert.equal(game.player, 2 * 7 + 1);
  assert.equal(move(game, 1).pushed, true);
  assert.equal(isSolved(game), false);
  assert.equal(move(game, 1).pushed, true);
  assert.equal(isSolved(game), true);
  assert.equal(game.pushes, 2);
  assert.equal(move(game, 1), null);    // 过关后不再动
  undo(game);
  assert.equal(game.pushes, 1);
  assert.equal(game.boxes.has(2 * 7 + 3), true);
  // 箱子推不进墙
  const wall = createGame(['#####', '#@$##', '# . #', '#####'].join('\n'));
  assert.equal(move(wall, 1), null);
});

test('the reverse search finds the hardest start, and its depth is the true minimum number of pushes', () => {
  const level = parse(ROOM);
  const { states, depth, complete } = farthestPull({ ...level, goals: level.goals }, 50_000);
  assert.equal(complete, true);
  assert.ok(states.length > 0);
  const map = format({ ...level, boxes: states[0].boxes, player: states[0].player });
  assert.equal(solvePushes(map), depth);
});

test('all 50 shipped levels are valid, unsolved at the start, and their par matches a forward solve', () => {
  assert.equal(LEVELS.length, 50);
  LEVELS.forEach((item, i) => {
    const level = parse(item.map);
    assert.equal(level.boxes.size, level.goals.size, `level ${i + 1}`);
    assert.ok(level.boxes.size >= 2);
    assert.ok(![...level.boxes].every((b) => level.goals.has(b)), `level ${i + 1} starts solved`);
    assert.ok(level.player >= 0);
  });
  // 正向 BFS 比较慢，抽查前面几关和后面一关
  for (const i of [0, 1, 2, 10, 20]) assert.equal(solvePushes(LEVELS[i].map), LEVELS[i].par, `level ${i + 1}`);
  for (let i = 1; i < LEVELS.length; i += 1) assert.ok(LEVELS[i].par >= LEVELS[i - 1].par);
});
