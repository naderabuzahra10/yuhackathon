// Production server: the built app, the API proxy and this server's own services (assistant, UniPoints, insights) on one origin.
//   npm run build && npm start
// Reads PORT, UNIJOURNEY_API, ANTHROPIC_API_KEY, AGENT_MODEL and UNIJOURNEY_DATA from the environment (or .env.local).
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServices } from './server/index.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const dist = resolve(here, 'dist');
const port = Number(process.env.PORT ?? 8080);
const apiOrigin = new URL(process.env.UNIJOURNEY_API ?? 'https://unijourney-yu-a12fda.fly.dev');
const handleService = createServices(process.env);

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

function proxyApi(req, res) {
  const send = apiOrigin.protocol === 'https:' ? httpsRequest : httpRequest;
  const upstream = send(
    { protocol: apiOrigin.protocol, hostname: apiOrigin.hostname, port: apiOrigin.port || undefined, path: req.url, method: req.method, headers: { ...req.headers, host: apiOrigin.host } },
    (up) => {
      const headers = { ...up.headers };
      // Behind plain http (local runs) a Secure cookie would be dropped.
      if (headers['set-cookie'] && req.headers['x-forwarded-proto'] !== 'https' && !req.socket.encrypted) {
        headers['set-cookie'] = headers['set-cookie'].map((c) => c.replace(/;\s*Secure/gi, ''));
      }
      res.writeHead(up.statusCode ?? 502, headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: { code: 'bad_gateway', message: 'The UniJourney API is unreachable' } }));
  });
  req.pipe(upstream);
}

function serveStatic(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(dist, pathname));
  // Only files inside dist are served; a sibling folder that merely shares the prefix is not.
  if (file !== dist && !file.startsWith(dist + sep)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  const ext = extname(file);
  res.writeHead(200, {
    'Content-Type': TYPES[ext] ?? 'application/octet-stream',
    'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  const url = req.url ?? '/';
  if (url.startsWith('/api/')) return proxyApi(req, res);
  if (handleService(req, res, url)) return;
  return serveStatic(req, res);
}).listen(port, () => {
  console.log(`UniJourney on http://localhost:${port}  (API ${apiOrigin.origin}; assistant ${process.env.ANTHROPIC_API_KEY ? 'model connected' : 'built-in planner, no key set'})`);
});
