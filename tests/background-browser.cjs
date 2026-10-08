// Run with: node tests/background-browser.cjs <absolute path to playwright>
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('node:http');
const { chromium } = require(process.argv[2] || 'playwright');
const root = path.resolve(__dirname, '..');
const publicationFolder = fs.existsSync(path.join(root, 'statistics-update/github-publish/site-dist'))
  ? 'statistics-update/github-publish/site-dist' : 'site-dist';
process.env.TEMP = process.env.TMP = path.join(root, 'reports/browser-temp-background');
fs.mkdirSync(process.env.TEMP, { recursive: true });
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
let publicRoot;
const server = createServer((req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html';
  const target = path.resolve(publicRoot, relative);
  if (!target.startsWith(publicRoot + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(target));
});
const state = page => page.evaluate(() => {
  const svg = document.querySelector('.bg-svg');
  const waves = document.querySelector('#bgPaths');
  const radial = document.querySelector('.bg-radial');
  const style = e => ({ transform: getComputedStyle(e).transform, play: getComputedStyle(e).animationPlayState });
  return {
    mode: document.documentElement.dataset.backgroundMotion, waves: style(waves), radial: style(radial),
    width: svg.getBoundingClientRect().width, height: svg.getBoundingClientRect().height,
    viewport: [innerWidth, innerHeight], overflow: document.documentElement.scrollWidth > innerWidth,
    smil: svg.querySelectorAll('animate, filter').length, paths: svg.querySelectorAll('path').length,
    violations: window.backgroundViolations
  };
});
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    const versions = [['publication', publicationFolder, 52]];
    if (publicationFolder !== 'site-dist') versions.push(['workspace', 'site-dist', 2], ['statistics', 'statistics-update/site-dist', 2]);
    for (const [name, folder, seconds] of versions) {
      publicRoot = path.join(root, folder);
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'no-preference' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('crash', () => errors.push('renderer crash'));
      await page.route('https://api.github.com/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.addInitScript(() => {
        window.backgroundViolations = [];
        document.addEventListener('securitypolicyviolation', e => window.backgroundViolations.push(e.violatedDirective));
      });
      await page.goto(url, { waitUntil: 'load' });
      const first = await state(page);
      assert.equal(first.mode, 'running');
      assert.equal(first.smil, 0);
      assert.equal(first.paths, 2);
      assert.deepEqual([first.width, first.height], first.viewport);
      for (let i = 0; i < seconds; i += 2) {
        await page.waitForTimeout(2000);
        const current = await state(page);
        assert.equal(current.mode, 'running');
        assert.equal(current.waves.play, 'running');
        assert.equal(current.radial.play, 'running');
        assert.notEqual(current.waves.transform, first.waves.transform);
        assert.notEqual(current.radial.transform, first.radial.transform);
        assert.equal(current.overflow, false);
        assert.deepEqual(current.violations, []);
        assert.deepEqual(errors, []);
        if (i % 10 === 0) console.log(`${name}: animation alive at ${i + 2}s`);
      }
      await page.screenshot({ path: path.join(root, `reports/background-${name}-desktop.png`) });
      // Visibility events must pause both layers without resetting their timelines.
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const paused = await state(page);
      await page.waitForTimeout(300);
      const stillPaused = await state(page);
      assert.equal(stillPaused.mode, 'paused');
      assert.equal(stillPaused.waves.play, 'paused');
      assert.equal(stillPaused.radial.play, 'paused');
      assert.equal(stillPaused.waves.transform, paused.waves.transform);
      assert.equal(stillPaused.radial.transform, paused.radial.transform);
      await page.evaluate(() => {
        delete document.hidden;
        document.dispatchEvent(new Event('visibilitychange'));
      });
      assert.equal((await state(page)).mode, 'running');
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.waitForFunction(() => document.documentElement.dataset.backgroundMotion === 'paused');
      assert.equal((await state(page)).mode, 'paused');
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.waitForFunction(() => document.documentElement.dataset.backgroundMotion === 'running');
      assert.equal((await state(page)).mode, 'running');
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(() => document.documentElement.dataset.backgroundMotion === 'paused');
      const mobile = await state(page);
      assert.equal(mobile.mode, 'paused');
      assert.equal(mobile.overflow, false);
      assert.deepEqual([mobile.width, mobile.height], mobile.viewport);
      await page.screenshot({ path: path.join(root, `reports/background-${name}-mobile.png`) });
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.waitForFunction(() => document.documentElement.dataset.backgroundMotion === 'running');
      assert.equal((await state(page)).mode, 'running');
      await page.locator('#langSwitch').click();
      await page.locator('.gallery-spread').first().click();
      await page.locator('.g-lightbox-close').click();
      assert.deepEqual(errors, []);
      assert.deepEqual((await state(page)).violations, []);
      results.push({ name, sustainedSeconds: seconds, errors, checks: ['animation moves', 'no SMIL/blur', 'full viewport', 'visibility pause/resume', 'reduced motion changes', 'mobile', 'resize resume', 'language', 'gallery', 'CSP'] });
      await context.close();
    }
    // Touch desktop and script-free visits retain a stable background.
    publicRoot = path.join(root, publicationFolder);
    for (const options of [{ hasTouch: true, isMobile: true }, { javaScriptEnabled: false }]) {
      const context = await browser.newContext({ ...options, viewport: { width: 1440, height: 1000 } });
      const page = await context.newPage();
      await page.route('https://api.github.com/**', r => r.fulfill({ body: '[]' }));
      await page.goto(url);
      const snapshot = await state(page);
      assert.equal(snapshot.waves.play, 'paused');
      assert.equal(snapshot.radial.play, 'paused');
      await context.close();
    }
    fs.writeFileSync(path.join(root, 'reports/background-verification.json'), JSON.stringify({ testedAt: new Date().toISOString(), browser: await browser.version(), results, additionalChecks: ['touch desktop', 'JavaScript disabled'] }, null, 2));
    console.log('PASS: all background and page interaction checks');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
