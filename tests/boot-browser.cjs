const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const report = path.join(root, 'reports');
process.env.TEMP = process.env.TMP = path.join(report, 'browser-temp-boot');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(report, 'browser-cache-boot');
fs.mkdirSync(process.env.TEMP, { recursive: true });
const { chromium } = require(path.resolve(process.argv[2] || path.join(root, '../promptflower/.task-temp/browser-tools/node_modules/playwright')));
const { createServer } = require('node:http');

(async () => {
  const { publicFiles } = await import('../scripts/prepare-public.mjs');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
  const server = createServer((request, response) => {
    const file = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (!publicFiles.includes(file)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    response.end(fs.readFileSync(path.join(root, 'site-dist', file)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}/`;
  let browser;
  const errors = [];
  let cases = 0;
  async function setup(options = {}, init) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...options });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://api.github.com/**', route => route.abort());
    await page.addInitScript(() => {
      window.bootViolations = [];
      document.addEventListener('securitypolicyviolation', event => window.bootViolations.push(event.violatedDirective));
      new MutationObserver(() => {
        const active = document.documentElement?.classList.contains('boot-active');
        if (active && window.bootStartedAt === undefined) window.bootStartedAt = performance.now();
        if (!active && window.bootStartedAt !== undefined && window.bootCompletedAt === undefined) {
          window.bootCompletedAt = performance.now();
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
    });
    if (init) await page.addInitScript(init);
    return { context, page };
  }
  async function released(page) {
    await page.locator('#portfolioBoot').waitFor({ state: 'hidden', timeout: 5500 });
    assert.equal(await page.locator('html').evaluate(el => el.classList.contains('boot-active')), false);
    assert.equal(await page.locator('.wrap').evaluate(el => el.inert), false);
    assert.equal(await page.locator('.wrap').getAttribute('aria-hidden'), null);
    assert.equal(await page.locator('.wrap').evaluate(el => getComputedStyle(el).visibility), 'visible');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(await page.evaluate(() => window.bootViolations), []);
    cases++;
  }
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    // Verify real timing and the published package at both sizes.
    for (const width of [1440, 390]) {
      const { context, page } = await setup({ viewport: { width, height: width === 390 ? 844 : 1000 } });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('#portfolioBoot').isVisible(), true);
      assert.equal(await page.locator('.wrap').evaluate(el => el.inert), true);
      assert.equal(await page.locator('.wrap').getAttribute('aria-hidden'), 'true');
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.id), 'bootSkip');
      assert.ok((await page.locator('#bootSkip').boundingBox()).height >= 44);
      await page.waitForFunction(() => document.querySelectorAll('.boot-line').length === 15);
      await page.screenshot({ path: path.join(report, `boot-${width}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.waitForFunction(() => document.querySelector('#bootCommand').textContent === 'start portfolio');
      await released(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'mainContent');
      const elapsed = await page.evaluate(() => window.bootCompletedAt - window.bootStartedAt);
      assert.ok(elapsed >= 2900 && elapsed < 3800, `Unexpected boot duration: ${elapsed}`);
      await page.screenshot({ path: path.join(report, `boot-complete-${width}.png`) });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await released(page);
      await page.locator('#langSwitch').click();
      await page.locator('.gallery-spread').first().click();
      assert.equal(await page.locator('dialog[open]').count(), 1);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('dialog[open]').count(), 0, 'Boot must remove its Escape handler');
      await context.close();
    }

    for (const method of ['click', 'escape']) {
      const { context, page } = await setup({}, () => localStorage.setItem('lang', 'sv'));
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      assert.match(await page.locator('#bootSkip').textContent(), /Hoppa över/);
      assert.equal(await page.locator('#portfolioBoot').getAttribute('lang'), 'sv');
      if (method === 'click') await page.locator('#bootSkip').click();
      else await page.keyboard.press('Escape');
      await released(page);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'mainContent');
      await context.close();
    }

    for (const scenario of ['reduced', 'no-js', 'blocked-script', 'anchor', 'history']) {
      const { context, page } = await setup({
        reducedMotion: scenario === 'reduced' ? 'reduce' : 'no-preference',
        javaScriptEnabled: scenario !== 'no-js'
      });
      if (scenario === 'blocked-script') await page.route('**/boot.js?*', route => route.abort());
      if (scenario === 'history') {
        await page.goto(base + 'cookies.html');
        await page.goto(base + 'privacy.html');
        await page.goto(base);
        await page.locator('#bootSkip').click();
        await page.goto(base + 'cookies.html');
        await page.evaluate(() => sessionStorage.clear());
        await page.goBack({ waitUntil: 'domcontentloaded' });
      } else await page.goto(base + (scenario === 'anchor' ? '#activityTitle' : ''), { waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('#portfolioBoot').isVisible(), false, scenario);
      assert.equal(await page.locator('.wrap').evaluate(el => getComputedStyle(el).visibility), 'visible');
      cases++;
      await context.close();
    }

    // Blocked storage must neither prevent entry nor trap a second navigation.
    {
      const { context, page } = await setup({}, () => {
        for (const name of ['sessionStorage', 'localStorage']) {
          Object.defineProperty(window, name, { get() { throw new DOMException('Blocked', 'SecurityError'); } });
        }
      });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.locator('#bootSkip').click();
      await released(page);
      await page.reload({ waitUntil: 'domcontentloaded' });
      assert.equal(await page.locator('#portfolioBoot').isVisible(), true);
      await page.keyboard.press('Escape');
      await released(page);
      await context.close();
    }

    // Suppress normal completion and prove the independent four-second recovery fires.
    {
      const { context, page } = await setup({}, () => {
        const original = window.setTimeout.bind(window);
        window.setTimeout = (callback, delay, ...args) => original(callback, delay === 3000 ? 60000 : delay, ...args);
      });
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await released(page);
      assert.ok(await page.evaluate(() => window.bootCompletedAt - window.bootStartedAt >= 3900));
      await context.close();
    }

    // A preference change during boot must release immediately without animation.
    {
      const { context, page } = await setup();
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await released(page);
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(`Boot browser checks passed: ${cases} scenarios; desktop/mobile screenshots saved in reports/.`);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
