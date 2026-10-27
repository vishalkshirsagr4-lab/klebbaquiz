import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the browser talks to Vite (same origin) and /api is proxied to the Express server,
// which keeps the httpOnly auth cookie first-party - exactly like the Vercel rewrite does in production.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': { target: process.env.VITE_DEV_API || 'http://localhost:3000', changeOrigin: false },
    },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
