import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent mouse wheel and touch-scroll from changing numeric amounts or scrolling in inputs
window.addEventListener(
  'wheel',
  () => {
    if (
      document.activeElement?.tagName === 'INPUT' &&
      (document.activeElement as HTMLInputElement).type === 'number'
    ) {
      (document.activeElement as HTMLInputElement).blur();
    }
  },
  { passive: true }
);

// Never shown inside another site's frame (no tricking a tap onto Send).
if (window.top !== window.self) {
  document.documentElement.innerHTML = '';
  throw new Error('Not shown inside a frame.');
}

// Offline shell and install prompt: the worker caches the app shell only,
// never API answers (see yebente/public/sw.js).
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/yebente/sw.js').catch(() => {});

// Tell the Security watch when the page's script lock blocks something that isn't ours.
let reported = 0;
document.addEventListener('securitypolicyviolation', (e) => {
  const blocked = String(e.blockedURI || '');
  if (reported >= 3 || /-extension:/i.test(blocked) || /-extension:/i.test(String(e.sourceFile || ''))) return;
  reported++;
  const body = JSON.stringify({ page: location.pathname, directive: e.effectiveDirective, blocked: blocked.slice(0, 200) });
  try { navigator.sendBeacon('/api/report', new Blob([body], { type: 'application/json' })); } catch { /* best effort */ }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Screen recordings and app-switcher snapshots must not catch secrets: while
// hidden, blur every .yb-sensitive box (PINs, codes, words). Shown again on return.
const veil = () => { document.documentElement.dataset.private = '1'; };
const unveil = () => { delete document.documentElement.dataset.private; };
document.addEventListener('visibilitychange', () => { if (document.hidden) veil(); else unveil(); });
window.addEventListener('pagehide', veil);
window.addEventListener('pageshow', unveil);
