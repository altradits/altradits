import React, { useEffect, useState } from 'react';
import { Check, Zap } from 'lucide-react';

// Sats on the move: rising out while a payment is sent, falling in when sats
// arrive, then a check. Still (no motion) when the phone asks for reduced motion.
type Mode = 'sending' | 'sent' | 'received';

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const SatsMotion: React.FC<{ mode: Mode }> = ({ mode }) => {
  const done = mode !== 'sending';
  const tone = mode === 'sending' ? 'var(--yb-secondary)' : '#34d399';
  return (
    <div className="yb-motion relative w-24 h-24 mx-auto" aria-hidden="true">
      {done && <span className="yb-ripple absolute inset-0 rounded-full border-2" style={{ borderColor: tone }} />}
      <div
        className="absolute inset-0 rounded-full flex items-center justify-center border"
        style={{ background: 'color-mix(in srgb, ' + tone + ' 16%, transparent)', borderColor: 'color-mix(in srgb, ' + tone + ' 45%, transparent)', color: tone }}
      >
        {done ? <Check className="yb-pop w-10 h-10" strokeWidth={3} /> : <Zap className="yb-pulse w-9 h-9" />}
      </div>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`yb-coin ${mode === 'received' ? 'yb-coin-in' : 'yb-coin-up'} ${mode === 'sending' ? 'yb-loop' : ''}`}
          style={{ animationDelay: `${i * 0.22}s`, left: `${35 + i * 15}%` }}
        >
          ₿
        </span>
      ))}
    </div>
  );
};

// A number that counts up to its value (the amount just sent or received).
export function useCountUp(target: number, ms = 800) {
  const [n, setN] = useState(() => (reducedMotion() ? target : 0));
  useEffect(() => {
    if (reducedMotion()) { setN(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

export const CountUp: React.FC<{ value: number }> = ({ value }) => <>{useCountUp(value).toLocaleString()}</>;
