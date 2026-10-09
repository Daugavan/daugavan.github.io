import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Public profile pages only. Never load account cookies or private Codex history.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
const retrieved = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());
const validate = data => {
  if (!Number.isSafeInteger(data.total) || data.total < 0 || data.total > 1e9 ||
      data.columns.length < 50 || data.columns.length > 54 ||
      !data.columns.every(col => col.length === 7 && col.every(n => n === null || Number.isInteger(n) && n >= 0 && n <= 4)) ||
      !data.months.length || !data.months.every(([name, col]) => /^[A-Z][a-z]{2}$/.test(name) && Number.isInteger(col) && col >= 0 && col < data.columns.length)) {
    throw new Error('Unexpected public activity calendar; keeping the previous snapshot.');
  }
  return { ...data, retrieved };
};
try {
  const githubPage = await browser.newPage();
  await githubPage.goto('https://github.com/Daugavan', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await githubPage.locator('td[data-date]').first().waitFor({ timeout: 60000 });
  const github = validate(await githubPage.evaluate(() => {
    const cells = [...document.querySelectorAll('td[data-date]')];
    const width = Math.max(...cells.map(el => Number(el.getAttribute('data-ix')))) + 1;
    const columns = Array.from({ length: width }, () => Array(7).fill(null));
    cells.forEach(el => { columns[Number(el.getAttribute('data-ix'))][new Date(el.getAttribute('data-date') + 'T00:00:00Z').getUTCDay()] = Number(el.getAttribute('data-level')); });
    let column = 0;
    const months = [...document.querySelectorAll('table thead td[colspan]')].map(el => {
      const pair = [el.querySelector('[aria-hidden="true"]').textContent.trim(), column];
      column += Number(el.getAttribute('colspan'));
      return pair;
    });
    const heading = document.querySelector('#js-contribution-activity-description').textContent;
    const match = heading.match(/([\d,]+)\s+contributions?\s+in\s+the\s+last\s+year/);
    if (!match) throw new Error('GitHub total missing');
    return { total: Number(match[1].replaceAll(',', '')), columns, months };
  }));
  const lovablePage = await browser.newPage();
  await lovablePage.goto('https://lovable.dev/@daugavan', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await lovablePage.waitForFunction(() => document.querySelector('main')?.textContent.includes('Total edits'), null, { timeout: 60000 });
  const lovable = validate(await lovablePage.evaluate(() => {
    const candidates = [...document.querySelectorAll('main div')].filter(el => el.children.length >= 50 && el.children.length <= 54);
    const labels = candidates.find(el => el.className.includes('mb-1'));
    const grid = candidates.find(el => el.className === 'flex gap-[3px]');
    if (!labels || !grid) throw new Error('Lovable calendar missing');
    const months = [...labels.children].flatMap((el, i) => el.textContent.trim() ? [[el.textContent.trim(), i]] : []);
    const columns = [...grid.children].map(col => [...col.children].map(day => {
      const classes = day.firstElementChild.className;
      if (classes.includes('bg-marketing-muted')) return 0;
      if (!classes.includes('bg-marketing-brand-sapphire-primary')) throw new Error('Unknown Lovable activity color');
      return classes.includes('/40') ? 1 : classes.includes('/60') ? 2 : classes.includes('/80') ? 3 : 4;
    }));
    const match = document.querySelector('main').textContent.match(/(\d[\d,]*) edits on/);
    if (!match) throw new Error('Lovable total missing');
    return { total: Number(match[1].replaceAll(',', '')), columns, months };
  }));
  // Write only after both sources have passed validation. No partial refreshes.
  await writeFile(new URL('../activity-snapshot.json', import.meta.url), JSON.stringify({ version: 1, github, lovable }) + '\n');
  console.log(`Verified ${retrieved}: GitHub ${github.total}, Lovable ${lovable.total}. Codex unchanged.`);
} finally { await browser.close(); }
