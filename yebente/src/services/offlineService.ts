// Online or not, as the browser sees it. Payments need the network: when it's
// gone the app says so and sends nothing (no queue that only pretends to send).
export function isNetworkOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

// Calls back on every change; returns the function that stops listening.
export function onNetworkChange(onChange: (online: boolean) => void): () => void {
  const up = () => onChange(true);
  const down = () => onChange(false);
  window.addEventListener('online', up);
  window.addEventListener('offline', down);
  return () => {
    window.removeEventListener('online', up);
    window.removeEventListener('offline', down);
  };
}
