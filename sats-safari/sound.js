// Sats Safari: tiny synthesized sounds. Off until the player turns sound on.
// No audio files: a few oscillator blips made in code.
let ctx = null;
let enabled = false;

export function setEnabled(on) {
  enabled = on === true;
  if (!enabled && ctx) ctx.close().catch(() => {});
  if (!enabled) ctx = null;
}

const isOn = () => enabled;

function tone(freq, at, dur, type = "sine", vol = 0.12) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const TUNES = {
  click: () => tone(660, 0, 0.08, "triangle"),
  coin: () => { tone(988, 0, 0.09, "square", 0.06); tone(1319, 0.08, 0.16, "square", 0.06); },
  star: () => { tone(784, 0, 0.1); tone(988, 0.1, 0.1); tone(1175, 0.2, 0.2); },
  win: () => { tone(523, 0, 0.12); tone(659, 0.12, 0.12); tone(784, 0.24, 0.12); tone(1047, 0.36, 0.3); },
  bad: () => tone(196, 0, 0.18, "sawtooth", 0.05),
};

export function play(name) {
  if (!isOn() || !TUNES[name]) return;
  try {
    if (typeof window === "undefined" || !window.AudioContext) return;
    if (!ctx) ctx = new window.AudioContext();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    TUNES[name]();
  } catch { /* silence is always safe */ }
}
