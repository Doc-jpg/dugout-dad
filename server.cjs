#!/usr/bin/env node
/**
 * Tiny static server for the built app (dist/). No dependencies.
 *
 *   node server.cjs            -> http://localhost:4173
 *   PORT=5000 node server.cjs  -> another port
 *
 * localhost counts as a secure context, so the service worker, IndexedDB persistence
 * and "install app" all work here exactly as they do on a hosted HTTPS site.
 * Keep the port the same between runs: browser storage is tied to the origin.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, 'dist');
const port = parseInt(process.env.PORT || '4173', 10);
const host = process.env.HOST || '127.0.0.1';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.woff2': 'font/woff2',
  '.map': 'application/json'
};

if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('dist/index.html not found. Run "npm run build" first (or use the prebuilt dist folder).');
  process.exit(1);
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let file = path.normalize(path.join(root, url));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end();
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file)) file = path.join(root, 'index.html'); // SPA fallback
    const ext = path.extname(file).toLowerCase();
    const headers = { 'Content-Type': types[ext] || 'application/octet-stream' };
    // Never cache the shell or the service worker; hashed assets can be cached for a long time.
    headers['Cache-Control'] = ext === '.html' || file.endsWith('sw.js') || ext === '.webmanifest' ? 'no-cache' : 'public, max-age=31536000, immutable';
    fs.createReadStream(file)
      .on('open', () => res.writeHead(200, headers))
      .on('error', () => {
        res.writeHead(500);
        res.end();
      })
      .pipe(res);
  })
  .listen(port, host, () => {
    console.log(`Dugout Dad is running at http://localhost:${port}`);
    console.log('Leave this window open while you use the app. Press Ctrl+C to stop.');
  });
