// Local preview for the existing static/Vercel app. API calls remain read-only.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      if (!['/api/products', '/api/flights', '/api/img'].includes(url.pathname)) { res.writeHead(404).end(); return; }
      const upstream = await fetch('https://hifind.fr' + url.pathname + url.search, { signal: AbortSignal.timeout(14000) });
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(Buffer.from(await upstream.arrayBuffer())); return;
    }
    const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep) || file.includes('/.git/') || file.includes('/node_modules/')) { res.writeHead(403).end(); return; }
    if (!(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : await readFile(file));
  } catch (error) {
    res.writeHead(error.code === 'ENOENT' ? 404 : 502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ressource indisponible pour le moment.' }));
  }
});
server.listen(Number(option('--port', 4173)), option('--host', '0.0.0.0'), () => console.log('HiFind local preview listening'));
