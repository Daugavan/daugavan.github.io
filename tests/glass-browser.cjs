const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
// Pass an existing RobotHaven-local Playwright module; no installation is needed.
const { chromium } = require(path.resolve(process.argv[2]));
process.env.TEMP = process.env.TMP = path.join(root, 'reports/glass-browser-temp');
fs.mkdirSync(process.env.TEMP, { recursive: true });

(async () => {
  const { publicFiles } = await import(pathToFileURL(path.join(root, 'scripts/prepare-public.mjs')));
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
  const server = http.createServer((req, res) => {
    const file = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
    if (!publicFiles.includes(file)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(path.join(root, file)).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({
      ...(process.env.GLASS_BROWSER_PATH ? { executablePath: process.env.GLASS_BROWSER_PATH } : { channel: process.env.GLASS_BROWSER_CHANNEL || 'msedge' }),
      headless: true, chromiumSandbox: true, timeout: 30000
    });
    for (const width of [1440, 390, 768]) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, locale: 'sv-SE', reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      const violations = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.exposeFunction('recordViolation', value => violations.push(value));
      await page.addInitScript(() => document.addEventListener('securitypolicyviolation', event => window.recordViolation(event.violatedDirective)));
      await page.route('https://api.github.com/**', route => route.fulfill({ json: [] }));
      const url = `http://127.0.0.1:${server.address().port}/`;
      await page.goto(url);
      await page.locator('.glass-backdrop').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(root, `reports/liquid-glass-header-${width}.png`) });
      await page.locator('.gallery-spread').first().click();
      await page.waitForFunction(() => document.querySelector('.g-lightbox-pic')?.naturalWidth > 0);
      const toggle = page.locator('.g-detail-toggle');
      await toggle.click();
      await page.locator('.g-lightbox-pic').focus();
      await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => document.querySelector('.g-detail-lens').style.backgroundSize !== '');
      const lens = await page.locator('.g-detail-lens').evaluate(el => ({ left: el.style.left, image: el.style.backgroundImage, size: el.style.backgroundSize }));
      assert.match(lens.image, /Portfolio/);
      assert.ok(parseFloat(lens.size) > (await page.locator('.g-lightbox-pic').boundingBox()).width);
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(previous => document.querySelector('.g-detail-lens').style.left !== previous, lens.left);
      await page.screenshot({ path: path.join(root, `reports/liquid-glass-detail-${width}.png`) });
      await page.locator('.g-lightbox-next').click();
      await page.waitForFunction(() => /(?:%28|\()2(?:%29|\))/.test(document.querySelector('.g-detail-lens').style.backgroundImage));
      assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('Escape');
      await page.locator('.g-lightbox').waitFor({ state: 'detached' });
      assert.equal(await page.locator('.gallery-spread').first().evaluate(el => el === document.activeElement), true);
      await page.locator('.glass-preference').click();
      assert.equal(await page.locator('html').evaluate(el => el.classList.contains('solid-surfaces')), true);
      assert.equal(await page.locator('.lang-switch').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
      await page.reload();
      await page.locator('.glass-preference').waitFor();
      assert.equal(await page.locator('.glass-preference').getAttribute('aria-pressed'), 'true');
      await page.locator('#langSwitch').click();
      assert.equal(await page.locator('.glass-preference').textContent(), 'Reduce glass effects');
      await page.locator('.glass-preference').click();
      await page.locator('.gallery-spread').first().click();
      await page.locator('.g-lightbox-next').click();
      assert.match(await page.locator('.g-lightbox figcaption').textContent(), /2 \/ 6/);
      await page.keyboard.press('Escape');
      assert.deepEqual(errors, []);
      assert.deepEqual(violations, []);
      await context.close();
      console.log(`PASS ${width}px: lens, image changes, focus return, language, solid persistence, CSP and overflow`);
    }
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
