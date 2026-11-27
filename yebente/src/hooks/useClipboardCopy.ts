import { useCallback, useEffect, useRef, useState } from 'react';

// One honest copy button: the tick shows only after the clipboard accepts
// the text. A denial shows a plain failure note instead of a fake tick.
export function useClipboardCopy(resetMs = 2000) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = useCallback(async (text: string) => {
    if (!text) return false;
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      setCopied(false);
      setFailed(true);
      timer.current = setTimeout(() => setFailed(false), resetMs);
      return false;
    }
    setFailed(false);
    setCopied(true);
    timer.current = setTimeout(() => setCopied(false), resetMs);
    return true;
  }, [resetMs]);
  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setCopied(false);
    setFailed(false);
  }, []);
  return { copied, failed, copy, reset };
}
