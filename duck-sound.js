// 数独鸭的音效：全部用 Web Audio 现场合成，不带音频文件，也不引新依赖。
// 浏览器要求声音由用户手势开启：第一次点画布时 unlock() 建好 / 唤醒 AudioContext，之前的声音直接跳过。
// 音色：放鸭是「啵」地冒出来再「嘎」一声；打叉是轻轻的木头「嗒」；冲突是两只鸭低声吵架；
// 提示是两下风铃；通关时每行鸭子跳起来各叫一声（越往下音越高），最后一段小号角。

let ctx = null;
let master = null;
let noise = null;

function audio() {
  if (!ctx) {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
    master = ctx.createGain();
    master.gain.value = 0.55;
    // 压一下峰值，几只鸭同时叫也不会爆音
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

// 一个音：频率从 f0 滑到 f1，可选带通 / 低通滤波，包络是快起慢落。
function tone(at, { f0, f1 = f0, dur, type = 'sine', gain = 0.2, filter = null, attack = 0.008 }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), at + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let node = osc;
  if (filter) {
    const f = ctx.createBiquadFilter();
    f.type = filter.type ?? 'bandpass';
    f.Q.value = filter.q ?? 1;
    f.frequency.setValueAtTime(filter.from, at);
    if (filter.to) f.frequency.exponentialRampToValueAtTime(filter.to, at + dur);
    node = node.connect(f);
  }
  node.connect(amp).connect(master);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}
// 一段噪声：水花、刷子这类没有音高的声音。
function hiss(at, { dur, from, to = from, q = 1, gain = 0.2, type = 'bandpass' }) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(from, at);
  f.frequency.exponentialRampToValueAtTime(to, at + dur);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(amp).connect(master);
  src.start(at, Math.random() * 0.2);
  src.stop(at + dur + 0.02);
}

// 橡皮鸭「嘎」：锯齿波过一个会张合的带通（像鸭嘴一开一合），音高往下掉一点。
function quack(at, pitch = 1, gain = 0.22) {
  tone(at, { f0: 520 * pitch, f1: 360 * pitch, dur: 0.17, type: 'sawtooth', gain, filter: { from: 900 * pitch, to: 1500 * pitch, q: 4 } });
  tone(at + 0.01, { f0: 1040 * pitch, f1: 760 * pitch, dur: 0.12, type: 'square', gain: gain * 0.25, filter: { from: 1800 * pitch, q: 6 } });
}
function pop(at, gain = 0.16) {
  hiss(at, { dur: 0.12, from: 900, to: 3000, q: 1.4, gain: gain * 0.7 });
  tone(at, { f0: 260, f1: 980, dur: 0.1, gain });
}

const VOICES = {
  // 放鸭：「啵」地冒出来（白烟），紧接着「嘎」一声，帽子落下时轻轻一磕
  place: (t) => { pop(t); quack(t + 0.15, 1 + (Math.random() - 0.5) * 0.12); tone(t + 0.36, { f0: 900, f1: 700, dur: 0.05, type: 'triangle', gain: 0.07 }); },
  pickup: (t) => tone(t, { f0: 480, f1: 920, dur: 0.12, gain: 0.14 }),
  cross: (t) => { tone(t, { f0: 1700, f1: 1250, dur: 0.045, type: 'triangle', gain: 0.1 }); hiss(t, { dur: 0.03, from: 3500, gain: 0.05, type: 'highpass' }); },
  erase: (t) => tone(t, { f0: 950, f1: 620, dur: 0.06, type: 'triangle', gain: 0.08 }),
  clash: (t) => {
    tone(t, { f0: 196, f1: 180, dur: 0.24, type: 'sawtooth', gain: 0.12, filter: { type: 'lowpass', from: 900 } });
    tone(t, { f0: 208, f1: 190, dur: 0.24, type: 'sawtooth', gain: 0.12, filter: { type: 'lowpass', from: 900 } });
    quack(t + 0.06, 0.72, 0.16);
  },
  hint: (t) => { for (const [k, f] of [[0, 1046], [0.08, 1568], [0.16, 2093]]) tone(t + k, { f0: f, dur: 0.4, gain: 0.08 }); },
  undo: (t) => tone(t, { f0: 720, f1: 430, dur: 0.11, gain: 0.1 }),
  clear: (t) => hiss(t, { dur: 0.32, from: 400, to: 2400, q: 0.8, gain: 0.12 }),
  toggle: (t) => tone(t, { f0: 1300, f1: 1100, dur: 0.05, type: 'triangle', gain: 0.08 }),
  // 换题：几颗水泡依次冒上来
  deal: (t) => { for (let k = 0; k < 4; k += 1) tone(t + k * 0.06, { f0: 380 + k * 120, f1: 700 + k * 160, dur: 0.07, gain: 0.08 }); },
  // 通关：每行的鸭子跳起来时叫一声（和画面的跳跃波浪同一个节奏），然后一段小号角
  win: (t, { rows = 6, step = 0.08 } = {}) => {
    for (let r = 0; r < rows; r += 1) quack(t + r * step, 1 + r * 0.05, 0.14);
    const end = t + rows * step + 0.25;
    [523, 659, 784, 1046].forEach((f, k) => tone(end + k * 0.09, { f0: f, dur: k === 3 ? 0.55 : 0.16, type: 'triangle', gain: 0.13 }));
    tone(end + 0.27, { f0: 1568, dur: 0.6, gain: 0.05 });
  }
};

// on：是否出声；log 记下最近播放的音效名（测试和调试用）。
export function duckSound(on = true) {
  const log = [];
  let lastCross = -Infinity;
  let unlocked = false;
  return {
    on,
    log,
    // 在用户手势里调用：建好 / 唤醒音频。唤醒是异步的，这一下手势里排的声音会在唤醒后马上响
    unlock() {
      if (!this.on) return;
      const a = audio();
      if (!a) return;
      unlocked = true;
      if (a.state === 'suspended') a.resume().catch(() => {});
    },
    play(name, { delay = 0, ...opts } = {}) {
      if (!this.on || !VOICES[name] || !ctx || !unlocked || ctx.state === 'closed') return;
      // 拖动一路打叉时一格一声太密，最多每 35ms 一下
      if (name === 'cross' || name === 'erase') {
        const now = performance.now();
        if (now - lastCross < 35) return;
        lastCross = now;
      }
      log.push(name);
      if (log.length > 30) log.shift();
      try { VOICES[name](ctx.currentTime + 0.01 + delay, opts); } catch { /* 某些浏览器不支持某个参数时宁可不出声 */ }
    }
  };
}
