// The full-screen sats show: one host (App) plays it; anything can ask for it.
// A payment is celebrated once, however many places notice it (ref).
export interface Celebration {
  kind: 'send' | 'receive';
  sats: number;
  label?: string; // who it went to / where it came from
  ref?: string;
}

const seen = new Set<string>();
let listener: ((c: Celebration) => void) | null = null;

export function celebrate(c: Celebration) {
  if (!(c.sats > 0)) return;
  if (c.ref) {
    if (seen.has(c.ref)) return;
    seen.add(c.ref);
  }
  listener?.(c);
}

// Payments already on screen when the app opens: not celebrated again.
export const markCelebrated = (refs: (string | undefined)[]) => refs.forEach((r) => r && seen.add(r));
export const wasCelebrated = (ref?: string) => Boolean(ref && seen.has(ref));

export function onCelebrate(fn: (c: Celebration) => void) {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}
