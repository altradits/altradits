import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Volume2, VolumeX } from 'lucide-react';
import type { Celebration } from '../services/celebrate';
import { useCountUp } from './SatsMotion';

// The full-screen sats show. Sending: coins blast out of the phone, faster and
// faster. Receiving: coins rain down into the phone, which glows with each one.
// Then the climax: a flash, lightning, shockwaves, a coin explosion, confetti,
// and the amount slams in. Calm (no motion) when the phone asks for reduced motion.

const CLIMAX = 1800; // ms
const SETTLE = 4200;
const COLORS = ['#f7931a', '#ffd166', '#DDB8FF', '#a855f7', '#34d399', '#ffffff', '#ff5fa2'];
const MUTE_KEY = 'yb_fx_muted';

type Kind = 'coin' | 'spark' | 'confetti';
interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; max: number; size: number; kind: Kind;
  color: string; rot: number; vr: number; homing?: boolean; burst?: boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---- sound: made on the fly (no files), quiet, and off with one tap
function soundFx() {
  let ctx: AudioContext | null = null;
  const ac = () => {
    if (ctx) return ctx;
    const A = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!A) return null;
    ctx = new A();
    return ctx;
  };
  const tone = (freq: number, dur: number, { type = 'sine' as OscillatorType, gain = 0.12, delay = 0, to = 0 } = {}) => {
    const c = ac();
    if (!c) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  };
  const whoosh = (dur: number, up: boolean) => {
    const c = ac();
    if (!c) return;
    const t = c.currentTime;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf;
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(up ? 300 : 2400, t);
    f.frequency.exponentialRampToValueAtTime(up ? 2400 : 300, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  };
  return {
    start: (up: boolean) => { ac()?.resume?.(); whoosh(CLIMAX / 1000, up); },
    tick: () => tone(rnd(1300, 2200), 0.07, { type: 'triangle', gain: 0.05 }),
    climax: () => {
      tone(90, 0.7, { gain: 0.35, to: 35 }); // the boom
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, 1.1, { type: 'triangle', gain: 0.09, delay: 0.05 + i * 0.06 }));
      [2093, 2637, 3136].forEach((f, i) => tone(f, 0.25, { gain: 0.04, delay: 0.4 + i * 0.09 }));
    },
    close: () => { ctx?.close().catch(() => {}); ctx = null; },
  };
}

export const SatsCelebration: React.FC<{ c: Celebration; onDone: () => void }> = ({ c, onDone }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const calm = reducedMotion();
  const [phase, setPhase] = useState<'build' | 'climax' | 'settled'>(calm ? 'settled' : 'build');
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const amount = useCountUp(phase === 'build' ? 0 : c.sats, 1200);
  const send = c.kind === 'send';

  useEffect(() => {
    if (calm) return;
    const cv = canvasRef.current;
    const g = cv?.getContext('2d');
    if (!cv || !g) return;
    const fx = soundFx();
    const play = (f: () => void) => { if (!mutedRef.current) { try { f(); } catch { /* no audio */ } } };
    let W = 0, H = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      cv.width = W * dpr; cv.height = H * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const ps: P[] = [];
    const rings: { x: number; y: number; r: number; a: number; w: number }[] = [];
    let bolts: { x: number; y: number }[][] = [];
    const t0 = performance.now();
    let last = t0, lastTick = 0, flash = 0, shake = 0, glow = 0, climaxed = false, settled = false, raf = 0;

    const phone = () => {
      const w = Math.min(130, W * 0.3), h = w * 1.9;
      return { x: W / 2, y: H * 0.8, w, h, top: H * 0.8 - h / 2 };
    };
    const center = () => (send ? { x: W / 2, y: H * 0.3 } : { x: W / 2, y: phone().top + 20 });
    const add = (p: Partial<P> & { x: number; y: number }) => {
      if (ps.length > 700) return;
      ps.push({ vx: 0, vy: 0, life: 0, max: 120, size: 14, kind: 'coin', color: '#f7931a', rot: rnd(0, 6.28), vr: rnd(-0.2, 0.2), ...p });
    };
    const confetti = (n: number) => {
      for (let i = 0; i < n; i++) add({ kind: 'confetti', x: rnd(0, W), y: rnd(-H * 0.3, -10), vx: rnd(-1.5, 1.5), vy: rnd(2, 5), size: rnd(6, 12), color: pick(COLORS), max: 400, vr: rnd(-0.3, 0.3) });
    };
    const bolt = (x: number, y: number, ang: number, len: number) => {
      const pts = [{ x, y }];
      let cx = x, cy = y;
      for (let i = 0; i < 9; i++) {
        cx += Math.cos(ang) * (len / 9) + rnd(-18, 18);
        cy += Math.sin(ang) * (len / 9) + rnd(-18, 18);
        pts.push({ x: cx, y: cy });
      }
      return pts;
    };

    const climax = () => {
      climaxed = true;
      setPhase('climax');
      const o = center();
      flash = 1; shake = 18; glow = 1;
      [0, 1, 2].forEach((i) => rings.push({ x: o.x, y: o.y, r: 10 - i * 40, a: 1, w: 6 - i * 1.5 }));
      for (let i = 0; i < 160; i++) {
        const a = rnd(0, Math.PI * 2), s = rnd(4, 18);
        add({ kind: Math.random() < 0.45 ? 'coin' : 'spark', burst: true, x: o.x, y: o.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (send ? 0 : 4), size: rnd(10, 22), color: pick(COLORS), max: rnd(70, 140) });
      }
      bolts = Array.from({ length: 6 }, (_, i) => bolt(o.x, o.y, (i / 6) * Math.PI * 2 + rnd(-0.3, 0.3), Math.max(W, H) * 0.6));
      confetti(180);
      play(fx.climax);
      try { navigator.vibrate?.([40, 30, 40, 30, 200]); } catch { /* no vibration */ }
    };

    const drawPhone = (now: number) => {
      const p = phone();
      const x = p.x - p.w / 2, y = p.top;
      g.save();
      if (glow > 0.02) { g.shadowColor = send ? '#DDB8FF' : '#f7931a'; g.shadowBlur = 30 + glow * 60; }
      g.fillStyle = '#16121b';
      g.strokeStyle = 'rgba(221,184,255,0.75)';
      g.lineWidth = 3;
      g.beginPath(); g.roundRect(x, y, p.w, p.h, 22); g.fill(); g.stroke();
      g.shadowBlur = 0;
      const sg = g.createLinearGradient(0, y, 0, y + p.h);
      sg.addColorStop(0, `rgba(118,54,152,${0.55 + glow * 0.45})`);
      sg.addColorStop(1, `rgba(247,147,26,${0.15 + glow * 0.75})`);
      g.fillStyle = sg;
      g.beginPath(); g.roundRect(x + 8, y + 8, p.w - 16, p.h - 16, 16); g.fill();
      g.fillStyle = '#16121b';
      g.beginPath(); g.roundRect(p.x - 16, y + 12, 32, 6, 3); g.fill();
      g.fillStyle = `rgba(255,255,255,${0.75 + 0.25 * Math.sin(now / 90)})`;
      g.font = `900 ${p.w * 0.42}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('⚡', p.x, p.y);
      g.restore();
    };

    const drawCoin = (p: P) => {
      g.save();
      g.translate(p.x, p.y);
      g.scale(Math.max(0.15, Math.abs(Math.cos(p.rot))), 1); // spinning
      const r = p.size;
      const cg = g.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      cg.addColorStop(0, '#ffe29a'); cg.addColorStop(0.55, '#f7931a'); cg.addColorStop(1, '#b45f06');
      g.fillStyle = cg;
      g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.font = `900 ${r * 1.2}px system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('₿', 0, r * 0.06);
      g.restore();
    };

    const loop = (now: number) => {
      const t = now - t0;
      const dt = Math.min(40, now - last) / 16.67;
      last = now;
      const ph = phone();

      // Build-up: faster and faster toward the climax.
      if (t < CLIMAX) {
        const k = t / CLIMAX;
        const n = 1 + Math.floor(k * k * 6);
        for (let i = 0; i < n; i++) {
          if (send) {
            add({ x: ph.x + rnd(-ph.w * 0.3, ph.w * 0.3), y: ph.top + 10, vx: rnd(-1.6, 1.6), vy: -rnd(4, 9) - k * 8, size: rnd(9, 16), max: 160 });
            if (Math.random() < 0.6) add({ kind: 'spark', x: ph.x + rnd(-ph.w * 0.4, ph.w * 0.4), y: ph.top, vx: rnd(-2, 2), vy: -rnd(6, 14), color: pick(COLORS), size: 2, max: 40 });
          } else {
            add({ homing: true, x: rnd(-20, W + 20), y: rnd(-80, -10), vx: rnd(-1, 1), vy: rnd(3, 6) + k * 6, size: rnd(9, 16), max: 300 });
          }
        }
        shake = Math.max(shake, 1 + k * 6);
        glow = send ? 0.4 + 0.6 * k : glow;
        if (now - lastTick > 70 - k * 40) { lastTick = now; play(fx.tick); }
      } else if (!climaxed) climax();

      if (climaxed && !settled && t > CLIMAX + SETTLE) { settled = true; setPhase('settled'); }
      if (climaxed && t < CLIMAX + SETTLE - 1200 && Math.random() < 0.6) confetti(2);

      g.clearRect(0, 0, W, H);
      g.save();
      if (shake > 0.3) g.translate(rnd(-shake, shake), rnd(-shake, shake));
      shake *= 0.9;

      // Particles
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        if (p.homing) {
          const tx = ph.x, ty = ph.top + 30;
          p.vx += (tx - p.x) * 0.0028 * dt;
          p.vy += 0.35 * dt;
          p.vx *= 0.97;
          if (Math.hypot(tx - p.x, ty - p.y) < ph.w * 0.45 && p.y > ph.top - 20) {
            ps.splice(i, 1);
            glow = Math.min(1, glow + 0.025);
            continue;
          }
        } else if (p.kind === 'confetti') {
          p.vy = Math.min(p.vy + 0.04 * dt, 4.5);
          p.vx += Math.sin((p.life + p.x) / 18) * 0.06;
        } else if (p.burst) {
          p.vy += 0.28 * dt;
          p.vx *= 0.985;
        } else if (send) {
          p.vy -= 0.3 * dt; // accelerating up and away
        }
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt + (p.kind === 'coin' ? 0.12 * dt : 0);
        p.life += dt;
        if (p.life > p.max || p.y > H + 60 || p.y < -200) { ps.splice(i, 1); continue; }
        const fade = Math.min(1, (p.max - p.life) / 25);
        g.globalAlpha = Math.max(0, fade);
        if (p.kind === 'coin') drawCoin(p);
        else if (p.kind === 'spark') {
          g.strokeStyle = p.color; g.lineWidth = p.burst ? 3 : 2;
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); g.stroke();
        } else {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.color;
          g.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); g.restore();
        }
      }
      g.globalAlpha = 1;

      // Lightning from the climax point
      if (climaxed && t < CLIMAX + 380) {
        const a = 1 - (t - CLIMAX) / 380;
        bolts.forEach((b) => {
          g.strokeStyle = `rgba(255,236,170,${a})`; g.lineWidth = 4 * a + 1;
          g.shadowColor = '#ffd166'; g.shadowBlur = 20;
          g.beginPath(); b.forEach((pt, j) => (j ? g.lineTo(pt.x + rnd(-4, 4), pt.y + rnd(-4, 4)) : g.moveTo(pt.x, pt.y))); g.stroke();
        });
        g.shadowBlur = 0;
      }

      // Shockwaves
      rings.forEach((r) => {
        r.r += 14 * dt; r.a *= Math.pow(0.955, dt);
        if (r.r > 0 && r.a > 0.02) {
          g.strokeStyle = `rgba(221,184,255,${r.a})`; g.lineWidth = r.w;
          g.beginPath(); g.arc(r.x, r.y, r.r, 0, Math.PI * 2); g.stroke();
        }
      });

      drawPhone(now);
      if (!send && climaxed) glow *= Math.pow(0.985, dt);
      g.restore();

      if (flash > 0.01) {
        g.fillStyle = `rgba(255,255,255,${flash * 0.85})`;
        g.fillRect(0, 0, W, H);
        flash *= Math.pow(0.86, dt);
      }
      raf = requestAnimationFrame(loop);
    };

    play(() => fx.start(send));
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      fx.close();
    };
  }, [calm, send]);

  const finish = () => { if (phase !== 'build') onDone(); };
  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const m = !muted;
    setMuted(m);
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* private mode */ }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[90] overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at 50% 40%, #3b1a52 0%, #160b1f 55%, #07040a 100%)' }}
      onClick={finish}
      role="dialog"
      aria-label={send ? `Sent ${c.sats} sats` : `Received ${c.sats} sats`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      <button
        type="button"
        onClick={toggleMute}
        className="absolute top-4 right-4 z-10 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20"
        aria-label={muted ? 'Sound on' : 'Sound off'}
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      <div className="absolute inset-x-0 top-[14%] flex flex-col items-center text-center px-6 pointer-events-none">
        {phase === 'build' ? (
          <p className="yb-chant text-sm font-black tracking-[0.4em] text-[#DDB8FF]">
            {send ? 'SENDING SATS' : 'SATS INCOMING'}
          </p>
        ) : (
          <>
            <p className="yb-slam-sub text-base font-black tracking-[0.35em] text-[#ffd166]">
              {send ? 'SENT ⚡' : 'RECEIVED ⚡'}
            </p>
            <p
              className="yb-slam mt-2 font-black leading-none text-transparent bg-clip-text"
              style={{
                fontFamily: "'Arial Black', 'Helvetica Neue', system-ui, sans-serif", // the brand font's demo digits aren't real numbers
                fontSize: 'clamp(3.2rem, 17vw, 7rem)',
                backgroundImage: 'linear-gradient(180deg, #fff6d6 0%, #ffd166 40%, #f7931a 100%)',
                filter: 'drop-shadow(0 0 24px rgba(247,147,26,0.55))',
              }}
            >
              {send ? '' : '+'}{amount.toLocaleString()}
            </p>
            <p className="yb-slam-sub mt-1 text-lg font-black tracking-[0.3em] text-white">SATS</p>
            {c.label && <p className="yb-slam-sub mt-3 text-sm text-white/75 max-w-xs truncate">{send ? 'to ' : 'from '}{c.label}</p>}
          </>
        )}
      </div>

      {phase === 'settled' && (
        <div className="absolute inset-x-0 bottom-[6%] flex justify-center px-6">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onDone(); }}
            className="yb-rise h-12 px-10 rounded-full bg-white text-[#2A1238] font-black text-sm tracking-wider shadow-[0_0_40px_rgba(247,147,26,0.6)]"
          >
            Continue
          </button>
        </div>
      )}
    </div>,
    document.body
  );
};
