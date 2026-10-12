import { realpathSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, loadEnv, type Plugin } from 'vite';
// @ts-expect-error plain ES module shared with server.mjs
import { createServices } from './server/index.mjs';

// On Windows the project can be reached through two paths; resolve to the real one so module ids stay consistent.
const root = realpathSync.native(process.cwd());

type Next = () => void;
type Use = (fn: (req: IncomingMessage, res: ServerResponse, next: Next) => void) => unknown;

/** Serves /agent, /rewards and /insights in dev and preview. Keys are read here and never reach the browser bundle. */
function services(env: Record<string, string>): Plugin {
  const handle = createServices({ ...process.env, ...env }) as (req: IncomingMessage, res: ServerResponse, url: string) => boolean;
  const mount = (middlewares: { use: Use }) => {
    middlewares.use((req, res, next) => {
      if (!handle(req, res, req.url ?? '/')) next();
    });
  };
  // These hooks must return nothing: Vite runs a returned function as a late hook.
  return {
    name: 'unijourney-services',
    configureServer(server) {
      mount(server.middlewares);
    },
    configurePreviewServer(server) {
      mount(server.middlewares);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  const apiOrigin = env.UNIJOURNEY_API ?? 'https://unijourney-yu-a12fda.fly.dev';
  const proxy = {
    '/api': {
      target: apiOrigin,
      changeOrigin: true,
      configure(p: { on: (event: 'proxyRes', fn: (res: IncomingMessage) => void) => void }) {
        // The API sets Secure cookies; local http would drop them.
        p.on('proxyRes', (res) => {
          const cookies = res.headers['set-cookie'];
          if (cookies) res.headers['set-cookie'] = cookies.map((c) => c.replace(/;\s*Secure/gi, ''));
        });
      },
    },
  };
  return {
    root,
    plugins: [react(), tailwindcss(), services(env)],
    resolve: { alias: { '@': `${root.replaceAll('\\', '/')}/src` } },
    // host: true lets a phone on the same Wi-Fi open the app, for scanning check-in and voucher codes.
    server: { port: 5173, host: true, proxy, watch: { ignored: ['**/data/**'] } },
    preview: { port: 4173, host: true, proxy },
    build: {
      rollupOptions: {
        output: {
          manualChunks: { react: ['react', 'react-dom', 'react-router-dom'], leaflet: ['leaflet'] },
        },
      },
    },
  };
});
