const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND_ROOT = path.resolve(__dirname, '..', 'frontend');
const PROJECT_ROOT = path.resolve(FRONTEND_ROOT, '..');

function loadEnv() {
  const file = path.join(PROJECT_ROOT, '.env');
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(fs.readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return [];
    const splitAt = trimmed.indexOf('=');
    return splitAt > 0 ? [[trimmed.slice(0, splitAt).trim(), trimmed.slice(splitAt + 1).trim().replace(/^['"]|['"]$/g, '')]] : [];
  }));
}

const config = loadEnv();
const PORT = Number(process.env.FRONTEND_PORT || config.FRONTEND_PORT) || 5173;
const API_BASE = (process.env.API_BASE || config.API_BASE || `http://localhost:${Number(process.env.PORT || config.PORT) || 3000}/api`).replace(/\/$/, '');
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method not allowed'); }
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/config.js') {
    const body = `window.SHOP_API_BASE = ${JSON.stringify(API_BASE)};`;
    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(req.method === 'HEAD' ? '' : body);
  }
  const requested = url.pathname === '/' ? 'index.html' : url.pathname === '/admin' || url.pathname === '/admin/' ? 'admin.html' : decodeURIComponent(url.pathname.slice(1));
  const filePath = path.resolve(FRONTEND_ROOT, requested);
  if (!filePath.startsWith(FRONTEND_ROOT + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(filePath).pipe(res);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Frontend port ${PORT} is already in use. Reusing the server at http://localhost:${PORT}.`);
    process.exitCode = 0;
    return;
  }
  console.error(`Frontend server failed: ${error.message}`);
  process.exitCode = 1;
});
server.listen(PORT, '0.0.0.0', () => console.log(`Frontend running at http://localhost:${PORT} (API: ${API_BASE})`));
