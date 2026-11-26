import { useEffect, useRef } from 'react';

// Every modal closes on Escape. Stacked modals (the scanner over Send) close
// top-first: only the last opener answers the key.
const stack: Array<() => void> = [];

export function useEscape(onClose: () => void, active = true) {
  const ref = useRef(onClose);
  ref.current = onClose;
  useEffect(() => {
    if (!active) return;
    const close = () => ref.current();
    stack.push(close);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && stack[stack.length - 1] === close) close(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      const i = stack.indexOf(close);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active]);
}
