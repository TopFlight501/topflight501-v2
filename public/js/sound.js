// Small synthesised sound effects (no audio files needed).
let ctx = null;
let enabled = true;

export function setSoundEnabled(on) { enabled = on; }

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, start, dur, { type = 'sine', gain = 0.18, slideTo = null } = {}) {
  const a = ac(); if (!a) return;
  const t0 = a.currentTime + start;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}

function thud(start = 0) {
  const a = ac(); if (!a) return;
  // short filtered noise burst, like a dart hitting the board
  const len = Math.floor(a.sampleRate * 0.08);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  const g = a.createGain(); g.gain.value = 0.6;
  src.connect(f).connect(g).connect(a.destination);
  src.start(a.currentTime + start);
  tone(140, start, 0.09, { type: 'triangle', gain: 0.25, slideTo: 70 });
}

export const sfx = {
  hit() { if (!enabled) return; thud(); tone(880, 0.08, 0.14); tone(1320, 0.16, 0.22); },
  miss() { if (!enabled) return; thud(); tone(220, 0.08, 0.28, { type: 'sawtooth', gain: 0.07, slideTo: 150 }); },
  bonus() { if (!enabled) return; [660, 880, 1100, 1320].forEach((f, i) => tone(f, i * 0.08, 0.2, { gain: 0.14 })); },
  win() {
    if (!enabled) return;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.12, 0.3, { type: 'triangle', gain: 0.2 }));
    tone(1047, 0.5, 0.7, { type: 'triangle', gain: 0.18 });
    tone(1319, 0.5, 0.7, { gain: 0.1 });
  },
  click() { if (!enabled) return; tone(1200, 0, 0.04, { gain: 0.05 }); },
};
