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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
