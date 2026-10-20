const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const root = path.resolve(__dirname, '..');
process.env.TEMP = process.env.TMP = path.join(root, 'reports/browser-temp-stats');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, 'reports/browser-cache-stats');
fs.mkdirSync(process.env.TEMP, { recursive: true });
const { chromium } = require(path.resolve(process.argv[2] || path.join(root, '../promptflower/.task-temp/browser-tools/node_modules/playwright')));

(async () => {
  const { publicFiles } = await import('../scripts/prepare-public.mjs');
  const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
  const server = createServer((request, response) => {
    const name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (!publicFiles.includes(name)) return response.writeHead(404).end();
    response.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream');
    response.end(fs.readFileSync(path.join(root, 'site-dist', name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'activity-snapshot.json'), 'utf8'));
  snapshot.github.total = 9876;
  const repo = { name: 'example', stargazers_count: 1407, description: 'Public project', language: 'JavaScript', topics: [], updated_at: '2026-10-20T00:00:00Z' };
  let browser;
  const errors = [];
  async function open({ data = snapshot, apiError = false, cache = null, storageBlocked = false, reducedMotion = 'reduce', javaScriptEnabled = true } = {}) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion, javaScriptEnabled });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ cache, storageBlocked }) => {
      window.violations = [];
      document.addEventListener('securitypolicyviolation', event => window.violations.push(event.violatedDirective));
      if (storageBlocked) {
        Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
      } else {
        localStorage.setItem('lang', 'en');
        if (cache) localStorage.setItem('daugavan_activity_v1', JSON.stringify({ data: cache, saved: Date.now() - 3600000 }));
      }
    }, { cache, storageBlocked });
    await page.route('https://api.github.com/**', route => {
      const activity = route.request().url().includes('activity-snapshot.json');
      if ((activity && data === null) || (!activity && apiError)) return route.fulfill({ status: 503, body: '{}' });
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify(activity ? data : [repo, { ...repo, name: 'second', stargazers_count: 0 }]) });
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    return { context, page };
  }
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const { context, page } = await open();
    await page.waitForFunction(() => document.getElementById('starsN').textContent !== '—', null, { timeout: 5000 })
      .catch(async error => { console.error({ errors, state: await page.locator('#statsSource').textContent() }); throw error; });
    assert.equal(await page.locator('#starsN').textContent(), '1,407');
    assert.equal(await page.locator('#reposN').textContent(), '2');
    assert.equal(await page.locator('#contributionsN').textContent(), '9,876');
    assert.equal(await page.locator('#contributionsSource time').getAttribute('datetime'), snapshot.github.retrieved);
    assert.match(await page.locator('[data-i18n="githubActivityTotal"]').textContent(), /9,876/);
    assert.equal(await page.locator('#progressFill').count(), 0);
    for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator('.stats-aura').scrollIntoViewIfNeeded();
      await page.locator('.stats-aura').screenshot({ path: path.join(root, `reports/aura-stats-${width}.png`) });
      assert.equal(await page.locator('.stats-aura').evaluate(el => el.scrollWidth > el.clientWidth), false);
      // The existing folded 3D gallery projects outside the layout; verify actual scrolling.
      assert.equal(await page.evaluate(() => { scrollTo(1000, scrollY); return scrollX; }), 0);
      const columns = await page.locator('.stats-metrics').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length);
      assert.equal(columns, width < 640 ? 1 : 3);
      const stats = await page.locator('.stats-aura').boundingBox();
      const repositories = await page.locator('[aria-labelledby="reposTitle"]').boundingBox();
      assert.ok(Math.abs(stats.width - repositories.width) < 1);
      assert.ok(repositories.y >= stats.y + stats.height);
    }
    await page.locator('#langSwitch').click();
    assert.match(await page.locator('#starsN').textContent(), /1[\s\u00a0]407/);
    assert.match(await page.locator('#contributionsN').textContent(), /9[\s\u00a0]876/);
    assert.match(await page.locator('#contributionsSource').textContent(), /Bidrag · hämtade/);
    assert.match(await page.locator('#statsTitle').textContent(), /GitHub-statistik/);
    assert.equal(await page.locator('.stats-metric').first().evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.deepEqual(await page.evaluate(() => window.violations), []);
    await context.close();

    for (const data of [null, { version: 1 }, { ...snapshot, github: { ...snapshot.github, total: '<script>' } }]) {
      const { context, page } = await open({ data, apiError: true });
      assert.equal(await page.locator('#contributionsN').textContent(), '—');
      assert.match(await page.locator('#contributionsSource').textContent(), /unavailable/);
      assert.equal(await page.locator('#starsN').textContent(), '—');
      assert.equal(await page.locator('#retryGitHub').isVisible(), true);
      await page.route('**/users/Daugavan/repos?*', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify([repo]) }));
      await page.locator('#retryGitHub').click();
      await page.waitForFunction(() => document.getElementById('starsN').textContent === '1,407');
      await context.close();
    }
    for (const options of [{ cache: snapshot, data: null }, { cache: snapshot, data: { ...snapshot, github: { ...snapshot.github, retrieved: '2026-10-01', total: 123 } } }, { storageBlocked: true }]) {
      const { context, page } = await open(options);
      assert.match((await page.locator('#contributionsN').textContent()).replace(/\D/g, ''), /^9876$/);
      assert.equal(await page.locator('#contributionsSource time').getAttribute('datetime'), snapshot.github.retrieved);
      await context.close();
    }
    {
      const { context, page } = await open({ javaScriptEnabled: false });
      assert.equal(await page.locator('#contributionsN').textContent(), '—');
      assert.equal(await page.locator('.stats-heading a').isVisible(), true);
      await context.close();
    }
    {
      const { context, page } = await open({ reducedMotion: 'no-preference' });
      assert.equal(await page.locator('.stats-aura').evaluate(el => el.classList.contains('stats-reveal')), false);
      await page.locator('#portfolioBoot').waitFor({ state: 'hidden' });
      await page.locator('.stats-aura').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.stats-aura').classList.contains('stats-reveal'));
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log('Aura stats passed: responsive layout, both languages, matching calendar/date, unavailable/malformed data, retry, offline cache, older snapshot rejection, blocked storage, no JS, reduced motion and reveal after boot.');
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
