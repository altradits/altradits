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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
