import { existsSync, lstatSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientPublication, readConfinedFile } from './clients.mjs';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const publicFiles = [
  '.nojekyll', 'index.html', '404.html', 'privacy.html', 'cookies.html', 'app.js', 'glass.js', 'boot.js', 'activity.js', 'statistics-data.js', 'seedy.js', 'styles.css',
  '404.css', 'robots.txt', 'sitemap.xml', 'llms.txt', 'favicon.svg', 'favicon.png', 'favicon.ico',
  'apple-touch-icon.png', 'og-cover.jpg',
  'images/profile-avatar.webp', 'images/lovable-profile-clean.webp',
  'images/identity-cover.webp', 'images/identity-lamps-off.webp',
  'images/promptflower-icon.webp', 'images/promptflower-wordmark.webp',
  'images/gallery-arrow-left.jpg', 'images/gallery-arrow-right.jpg',
  'images/github-activity.svg', 'images/lovable-activity.svg',
  'images/github-mark.svg', 'images/lovable-mark.svg',
  'images/codex-activity.svg', 'images/codex-mark.png',
  ...Array.from({ length: 6 }, (_, i) => [
    `images/Portfolio (${i + 1}).webp`, `images/Portfolio (${i + 1}).jpg`,
    `images/Portfolio (${i + 1})-sm.webp`
  ]).flat()
];

export function preparePublic({ includeClients = false, sourceRoot, output = join(projectRoot, 'site-dist') } = {}) {
  // Read and validate the entire package before changing any output files.
  const publication = new Map(publicFiles.map(file => [file, readConfinedFile(projectRoot, file)]));
  if (includeClients) {
    for (const [file, bytes] of clientPublication(sourceRoot)) publication.set(file, bytes);
  }
  const directories = new Set();
  for (const file of publication.keys()) {
    let directory = dirname(file).replaceAll('\\', '/');
    while (directory !== '.') {
      directories.add(directory);
      directory = dirname(directory).replaceAll('\\', '/');
    }
  }
  const checkPath = (root, relative) => {
    let path = root;
    for (const part of relative.split('/')) {
      path = join(path, part);
      if (existsSync(path) && lstatSync(path).isSymbolicLink()) throw new Error(`Symlink rejected: ${relative}`);
    }
  };
  const inspectOutput = (path, prefix = '') => {
    if (!existsSync(path)) return;
    if (lstatSync(path).isSymbolicLink()) throw new Error('Publication directory must not be a symlink');
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isSymbolicLink()) throw new Error(`Symlink in publication directory: ${relative}`);
      if (entry.isDirectory()) {
        if (!directories.has(relative)) throw new Error(`Unexpected publication directory: ${relative}`);
        inspectOutput(join(path, entry.name), relative + '/');
      } else if (!publication.has(relative)) throw new Error(`Unexpected publication file: ${relative}`);
    }
  };
  inspectOutput(output);
  mkdirSync(output, { recursive: true });
  for (const [file, bytes] of publication) {
    checkPath(output, file);
    mkdirSync(dirname(join(output, file)), { recursive: true });
    writeFileSync(join(output, file), bytes);
  }
  console.log(`Prepared ${publication.size} public files in ${output}`);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== '--clients')) throw new Error('Usage: node scripts/prepare-public.mjs [--clients]');
  preparePublic({ includeClients: args.includes('--clients') });
}


