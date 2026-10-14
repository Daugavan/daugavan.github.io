import { readFileSync, writeFileSync } from 'node:fs';
const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const license = read('./seedy/LICENSE.txt');
const kernel = read('./seedy/kernel.js');
const host = read('./seedy/mount.js');
const figure = read('./seedy/figure.js');
writeFileSync(new URL('../seedy.js', import.meta.url),
  `/* Hairline engine — lucasmarkes/hairline, commit f882be5f4c674b5bc4d691aaceccd00fce900971\n${license}\n*/\n` +
  `(() => {\n${kernel}\n${host}\n${figure}\n})();\n`);
console.log('Built seedy.js');
