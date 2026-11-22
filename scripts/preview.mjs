import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { preparePublic, publicFiles } from './prepare-public.mjs';
import { loadClients } from './clients.mjs';
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
export function createPreviewServer(root, { includeClients = true } = {}) {
  const files = new Set(publicFiles);
  if (includeClients) {
    for (const client of loadClients()) {
      for (const file of client.files) {
        const relative = `klienter/${client.slug}/${file}`;
        if (existsSync(join(root, relative))) files.add(relative);
      }
    }
  }
  return createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    let file;
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
      file = decodeURIComponent(url.pathname).slice(1) || 'index.html';
      if (file.includes('\\') || file.includes('\0')) throw new Error('Invalid path');
    }
    catch { response.writeHead(400); response.end(); return; }
    if (!file.endsWith('/') && files.has(file + '/index.html')) {
      response.writeHead(308, { Location: url.pathname + '/' + url.search });
      response.end();
      return;
    }
    if (file.endsWith('/')) file += 'index.html';
    const known = files.has(file);
    if (!known) file = '404.html';
    response.writeHead(known ? 200 : 404, {
      'Content-Type': types[extname(file)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'
    });
    response.end(request.method === 'HEAD' ? undefined : readFileSync(join(root, file)));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--clients')) throw new Error('Usage: node scripts/preview.mjs [--clients]');
  const includeClients = true;
  const root = preparePublic({ includeClients });
  createPreviewServer(root, { includeClients }).listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
}
