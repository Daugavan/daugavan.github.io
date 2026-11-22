import { readFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const safePath = value => typeof value === 'string' && value.length > 0 &&
  value.split('/').every(part => /^[a-zA-Z0-9._][a-zA-Z0-9._ ()-]*$/.test(part)) &&
  !value.includes('..');

export function loadClients(path = join(projectRoot, 'clients.json')) {
  const registry = JSON.parse(readFileSync(path, 'utf8'));
  if (registry.version !== 1 || !Array.isArray(registry.clients)) throw new Error('Invalid client registry');
  const slugs = new Set();
  for (const client of registry.clients) {
    if (typeof client.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(client.slug) || slugs.has(client.slug)) {
      throw new Error('Invalid or duplicate client slug');
    }
    slugs.add(client.slug);
    if (client.label !== undefined && (typeof client.label !== 'string' || !client.label.trim() || client.label.length > 100)) {
      throw new Error(`Invalid client label for ${client.slug}`);
    }
    if (!/^[\w-]+\/[\w.-]+$/.test(client.repository) || client.branch !== 'main') {
      throw new Error(`Invalid source for ${client.slug}`);
    }
    if (!Array.isArray(client.files) || !client.files.includes('index.html') ||
        new Set(client.files).size !== client.files.length || client.files.some(file =>
          !safePath(file) || file.split('/').some(part => part.startsWith('.')) ||
          !/\.(?:html|css|js|jpg|jpeg|png|webp|svg|ico|woff2?)$/i.test(file) ||
          /(?:^|\/)(?:tests?|reports?|scripts?|node_modules)(?:\/|$)/i.test(file))) {
      throw new Error(`Invalid publication file list for ${client.slug}`);
    }
  }
  return registry.clients;
}

export function readConfinedFile(root, relative) {
  if (!safePath(relative)) throw new Error(`Unsafe publication path: ${relative}`);
  const absoluteRoot = resolve(root);
  // Check each ancestor too: a source root can itself live below a junction.
  let current = absoluteRoot;
  for (;;) {
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink rejected: ${current}`);
    const parent = resolve(current, '..');
    if (parent === current) break;
    current = parent;
  }
  current = absoluteRoot;
  for (const part of relative.split('/')) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error(`Symlink rejected: ${relative}`);
  }
  if (!lstatSync(current).isFile()) throw new Error(`Missing publication file: ${relative}`);
  return readFileSync(current);
}

export function previewHtml(html) {
  // Replace source SEO instructions only in the deployment copy.
  return html.replace(/<meta\b[^>]*>/gi, tag =>
    /\bname\s*=\s*(["'])(?:robots|googlebot|bingbot)\1/i.test(tag) ? '' : tag
  ).replace(/<\/head\s*>/i, '  <meta name="robots" content="noindex, nofollow">\n</head>');
}

export function renderClientDirectory(template, clients = loadClients()) {
  const escape = value => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  const marker = /<!-- client-links:start -->[\s\S]*?<!-- client-links:end -->/;
  if (!marker.test(template)) throw new Error('Missing client directory marker');
  const links = clients.map(client => `        <li><a href="/klienter/${client.slug}/">${escape(client.label ?? client.slug)}</a></li>`).join('\n');
  return template.replace(marker, () => `<!-- client-links:start -->\n${links}\n        <!-- client-links:end -->`);
}

export function validateClientReferences(client, files) {
  const origin = 'https://preview.invalid';
  const prefix = `/klienter/${client.slug}/`;
  const allowed = new Set(files.keys());
  const check = (reference, file) => {
    const ref = reference.trim();
    if (!ref || /^(?:#|data:|https?:|\/\/|mailto:|tel:)/i.test(ref)) return;
    const url = new URL(ref, origin + prefix + file);
    const pathname = decodeURIComponent(url.pathname);
    if (url.origin !== origin || !pathname.startsWith(prefix)) {
      throw new Error(`${client.slug}/${file}: reference escapes client: ${ref}`);
    }
    const target = pathname.slice(prefix.length) || 'index.html';
    if (!allowed.has(target)) throw new Error(`${client.slug}/${file}: excluded resource: ${ref}`);
  };
  for (const [file, bytes] of files) {
    const text = bytes.toString('utf8');
    if (file.endsWith('.html')) {
      if (!/<\/head\s*>/i.test(text)) throw new Error(`${file}: missing head element`);
      for (const match of text.matchAll(/\b(?:src|href|action|poster)\s*=\s*(["'])(.*?)\1/gi)) check(match[2], file);
      for (const match of text.matchAll(/\b(?:srcset|imagesrcset)\s*=\s*(["'])(.*?)\1/gi)) {
        for (const candidate of match[2].split(',')) check(candidate.trim().split(/\s+/)[0], file);
      }
    } else if (file.endsWith('.css')) {
      for (const match of text.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/gi)) {
        check(match[1] ?? match[2] ?? match[3], file);
      }
    }
  }
}

export function clientPublication(sourceRoot = join(projectRoot, 'klienter'), clients = loadClients()) {
  const result = new Map();
  for (const client of clients) {
    const root = join(sourceRoot, client.slug);
    const files = new Map(client.files.map(file => [file, readConfinedFile(root, file)]));
    validateClientReferences(client, files);
    for (const [file, bytes] of files) {
      result.set(`klienter/${client.slug}/${file}`, bytes);
    }
  }
  return result;
}
