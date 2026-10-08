import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const publicFiles = [
  '.nojekyll', 'index.html', '404.html', 'privacy.html', 'app.js', 'styles.css',
  '404.css', 'robots.txt', 'sitemap.xml', 'llms.txt', 'favicon.svg', 'favicon.png',
  'apple-touch-icon.png', 'og-cover.jpg',
  'images/profile-avatar.webp', 'images/lovable-profile-clean.webp',
  'images/identity-cover.webp', 'images/identity-lamps-off.webp',
  'images/promptflower-icon.webp', 'images/promptflower-wordmark.webp',
  'images/gallery-arrow-left.jpg', 'images/gallery-arrow-right.jpg',
  'images/github-activity.svg', 'images/lovable-activity.svg',
  'images/github-mark.svg', 'images/lovable-mark.svg',
  ...Array.from({ length: 6 }, (_, i) => [
    `images/Portfolio (${i + 1}).webp`, `images/Portfolio (${i + 1}).jpg`,
    `images/Portfolio (${i + 1})-sm.webp`
  ]).flat()
];

export function preparePublic() {
  const output = join(projectRoot, 'site-dist');
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
        if (relative !== 'images') throw new Error(`Unexpected publication directory: ${relative}`);
        inspectOutput(join(path, entry.name), relative + '/');
      } else if (!publicFiles.includes(relative)) throw new Error(`Unexpected publication file: ${relative}`);
    }
  };
  inspectOutput(output);
  for (const file of publicFiles) {
    checkPath(projectRoot, file);
    if (!lstatSync(join(projectRoot, file)).isFile()) throw new Error(`Missing public file: ${file}`);
  }
  mkdirSync(output, { recursive: true });
  for (const file of publicFiles) {
    checkPath(output, file);
    mkdirSync(dirname(join(output, file)), { recursive: true });
    copyFileSync(join(projectRoot, file), join(output, file));
  }
  console.log(`Prepared ${publicFiles.length} public files in ${output}`);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) preparePublic();

