import { defineConfig } from 'vite';

// base './' deixa o build estático funcionar em qualquer subpasta (Pages, Netlify, Vercel)
export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2022' },
});
