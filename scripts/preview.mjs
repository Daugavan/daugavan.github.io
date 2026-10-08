import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { preparePublic, publicFiles } from './prepare-public.mjs';
const root = preparePublic();
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' };
createServer((request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  let file;
  try { file = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html'; }
  catch { response.writeHead(400); response.end(); return; }
  const known = publicFiles.includes(file);
  if (!known) file = '404.html';
  response.writeHead(known ? 200 : 404, {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store'
  });
  response.end(request.method === 'HEAD' ? undefined : readFileSync(join(root, file)));
}).listen(4173, '127.0.0.1', () => console.log('Preview: http://127.0.0.1:4173'));
