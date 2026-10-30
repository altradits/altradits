import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './theme/brandKit';
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
