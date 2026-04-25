import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/sales/',
  build: {
    outDir: 'dist/sales',
    emptyOutDir: true,
  },
  server: {
    // In dev, serve the app at /sales/ to match production
    base: '/sales/',
  },
});
