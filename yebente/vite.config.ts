import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

// Built into ./app and served by altradits.com at /yebente (see server.mjs and
// .htaccess). The API lives in the altradits server at /api/yebente/*.
// Local: run the altradits site (npm run dev at the repo root, port 3000), then `npm run dev` here.
export default defineConfig(() => ({
  base: '/yebente/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, '.') } },
  build: { outDir: 'app', emptyOutDir: true },
  server: { proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } } },
}));
