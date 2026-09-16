import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // spec 02 §2.1 — /api is same-origin in production; proxying it here
    // means the client can always call relative /api/* paths and cookies
    // behave identically in dev and prod, with no CORS involved.
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
});
