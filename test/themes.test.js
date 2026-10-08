import test from 'node:test';
import assert from 'node:assert/strict';
import { POP2_COLORS } from '../game-core.js';
import { ballPainter, ballShades, DEFAULT_THEME, isTheme, THEMES, themeById } from '../themes.js';

// The picker, the board and the network all key themes by id, so the registry is
// a contract worth pinning: a new skin that misses a painter or a colour would
// otherwise only show up as a blank board in one corner of one mode.
test('every theme is complete and distinct', () => {
  const ids = THEMES.map(theme => theme.id);
  assert.equal(new Set(ids).size, ids.length, 'theme ids must be unique');
  assert.equal(isTheme(DEFAULT_THEME), true);
  assert.equal(themeById('nope').id, DEFAULT_THEME, 'unknown ids fall back to the default');
  for (const theme of THEMES) {
    // Every field the board and the help line read, so a half-filled skin cannot
    // ship as a blank corner of one mode.
    for (const key of ['id', 'name', 'base', 'craft', 'backdrop', 'arena', 'craftName', 'pieceName', 'baseName', 'help']) {
      assert.ok(theme[key], `${theme.id} is missing ${key}`);
    }
  }
  // Three skins that genuinely differ, rather than three names for one look.
  assert.equal(new Set(THEMES.map(theme => theme.base)).size, THEMES.length);
  assert.equal(new Set(THEMES.map(theme => theme.backdrop)).size, THEMES.length);
  assert.equal(new Set(THEMES.map(theme => theme.craft)).size, THEMES.length);
  assert.equal(new Set(THEMES.map(theme => theme.arena)).size, THEMES.length);
  assert.equal(new Set(THEMES.map(theme => theme.baseName)).size, THEMES.length);
});

test('every theme can paint every colour the game deals', () => {
  for (const theme of THEMES) {
    const shades = ballShades(theme.id);
    for (const color of POP2_COLORS) {
      const s = shades[color];
      assert.ok(s, `${theme.id} has no ${color}`);
      for (const key of ['base', 'light', 'dark', 'edge', 'rim', 'glow']) {
        assert.match(s[key], /^#[0-9a-f]{6}$/i, `${theme.id}.${color}.${key}`);
      }
    }
    assert.equal(typeof ballPainter(theme.id), 'function');
  }
  // The shared candy palette is the fallback for any board without a skin.
  assert.equal(ballShades('space'), ballShades('unknown'));
  for (const color of POP2_COLORS) assert.ok(ballShades('unknown')[color]);
});
