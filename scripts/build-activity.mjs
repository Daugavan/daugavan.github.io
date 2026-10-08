import { readFileSync, writeFileSync } from 'node:fs';
import { projectRoot } from './prepare-public.mjs';
import { join } from 'node:path';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]);
function calendar(name, columns, labels, colors, description) {
  const step = 952 / columns.length;
  const content = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 130" role="img" aria-labelledby="title description">',
    `<title id="title">${name} activity calendar</title><desc id="description">${escape(description)}</desc>`,
    '<g font-family="system-ui, sans-serif" font-size="11" fill="#9ca8b8">'
  ];
  for (const [label, column] of labels) content.push(`<text x="${34 + column * step}" y="14">${label}</text>`);
  if (name === 'GitHub') for (const [label, row] of [['Mon', 1], ['Wed', 3], ['Fri', 5]]) content.push(`<text x="2" y="${33 + row * 13}">${label}</text>`);
  content.push('</g>');
  columns.forEach((column, x) => column.forEach((level, y) => {
    if (level === null) return;
    content.push(`<rect x="${(34 + x * step).toFixed(2)}" y="${24 + y * 13}" width="${(step - 3).toFixed(2)}" height="10" rx="2" fill="${colors[level]}"/>`);
  }));
  content.push('<g font-family="system-ui, sans-serif" font-size="10" fill="#9ca8b8"><text x="851" y="125">Less</text><text x="965" y="125">More</text></g>');
  colors.forEach((color, i) => content.push(`<rect x="${879 + i * 15}" y="116" width="10" height="10" rx="2" fill="${color}"/>`));
  content.push('</svg>');
  writeFileSync(join(projectRoot, `images/${name.toLowerCase()}-activity.svg`), content.join('\n') + '\n');
}

const github = JSON.parse(readFileSync(join(projectRoot, 'reports/github-activity-data.json'), 'utf8'));
const lovable = JSON.parse(readFileSync(join(projectRoot, 'reports/lovable-activity-data.json'), 'utf8'));
calendar('GitHub', github.columns, github.months, ['#161e2b', '#0e4429', '#006d32', '#26a641', '#39d353'], `${github.total} contributions in the last year. Source: ${github.source}. Retrieved ${github.retrieved}.`);
calendar('Lovable', lovable.columns, [['Jan', 0], ['Feb', 4], ['Mar', 8], ['Apr', 12], ['May', 17], ['Jun', 21], ['Jul', 25], ['Aug', 30], ['Sep', 34], ['Oct', 39]], ['#202630', '#153561', '#124b88', '#0867bd', '#087ced'], '430 edits in the displayed year. Saved activity pattern; the public Lovable profile does not expose edit history.');
