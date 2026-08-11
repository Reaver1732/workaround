import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const repoRoot = import.meta.dirname;

export default defineConfig({
  // The app lives in src/client, but src/lib sits outside that root and is
  // imported directly by the browser bundle. fs.allow below is what lets the
  // dev server read it.
  root: path.resolve(repoRoot, 'src/client'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@lib': path.resolve(repoRoot, 'src/lib'),
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [repoRoot],
    },
    // In dev the API runs separately on 3000. In production Express serves
    // the built bundle out of dist/ and there is no proxy.
    //
    // The key is a regex, not the plain string '/api'. A string key matches by
    // prefix, which also catches the client's own /api.ts module request: Vite
    // hands it to Express, Express answers with HTML, and the browser refuses
    // the module for its MIME type, leaving a blank page in dev only.
    proxy: {
      '^/api/': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    outDir: path.resolve(repoRoot, 'dist'),
    emptyOutDir: true,
  },
});
