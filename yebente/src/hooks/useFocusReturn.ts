import { useEffect } from 'react';

// Closing a modal returns focus to whatever opened it, so keyboards and
// switch devices carry on where they were instead of restarting at the top.
export function useFocusReturn(active = true) {
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    return () => { try { prev?.focus?.(); } catch { /* the opener is gone */ } };
  }, [active]);
}
