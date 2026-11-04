import test from 'node:test';
import assert from 'node:assert/strict';

// 假的 Web Audio：只记下建了多少个发声节点；指数渐变到 ≤0 时像真浏览器一样抛错。
const made = { osc: 0, noise: 0, resumed: 0 };
const param = () => ({
  value: 0,
  setValueAtTime() {},
  exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new RangeError('exponential ramp to non-positive value'); }
});
const node = (extra = {}) => ({ connect(next) { return next; }, ...extra });
class FakeContext {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); }
  resume() { made.resumed += 1; this.state = 'running'; return Promise.resolve(); }
  createGain() { return node({ gain: param() }); }
  createDynamicsCompressor() { return node({ threshold: param(), ratio: param() }); }
  createBiquadFilter() { return node({ type: '', Q: param(), frequency: param() }); }
  createOscillator() { made.osc += 1; return node({ type: '', frequency: param(), start() {}, stop() {} }); }
  createBufferSource() { made.noise += 1; return node({ buffer: null, start() {}, stop() {} }); }
  createBuffer(_c, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
}
globalThis.window = { AudioContext: FakeContext };
const { duckSound } = await import('../duck-sound.js');
const total = () => made.osc + made.noise;

test('nothing plays before a gesture unlocks audio, or while muted', () => {
  const sfx = duckSound(true);
  sfx.play('place');
  assert.equal(total(), 0);
  const quiet = duckSound(false);
  quiet.unlock();
  quiet.play('place');
  assert.equal(total(), 0);
  assert.deepEqual(quiet.log, []);
});

test('every voice schedules sound without invalid ramps once unlocked', () => {
  const sfx = duckSound(true);
  sfx.unlock();
  assert.equal(made.resumed, 1);
  for (const name of ['place', 'pickup', 'erase', 'clash', 'hint', 'undo', 'clear', 'toggle', 'deal']) {
    const before = total();
    sfx.play(name);
    assert.ok(total() > before, `${name} made no sound`);
  }
  const before = made.osc;
  sfx.play('win', { rows: 10 });
  assert.ok(made.osc - before >= 10 * 2 + 4, 'one quack per row plus the fanfare');
  sfx.play('nope');
  assert.equal(sfx.log.at(-1), 'win');
});

test('drag-crossing a row does not fire a click for every cell', () => {
  const sfx = duckSound(true);
  sfx.unlock();
  for (let k = 0; k < 8; k += 1) sfx.play('cross');
  assert.equal(sfx.log.filter((n) => n === 'cross').length, 1);
  sfx.on = false;
  sfx.play('place');
  assert.equal(sfx.log.includes('place'), false);
});
