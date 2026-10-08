const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.argv[2] || 'C:/Users/unknownuser/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '..');
process.env.TEMP = process.env.TMP = path.join(root, 'reports/browser-temp-background');
fs.mkdirSync(process.env.TEMP, { recursive: true });
const state = page => page.evaluate(() => {
  const svg = document.querySelector('.bg-svg');
  return {
    rect: svg.getBoundingClientRect().toJSON(),
    matrix: ['a', 'b', 'c', 'd', 'e', 'f'].map(key => document.querySelector('#bgPaths').getScreenCTM()[key]),
    animation: getComputedStyle(document.querySelector('#bgPaths')).animationName,
    radialAnimation: getComputedStyle(document.querySelector('.bg-radial')).animationName,
    paths: document.querySelectorAll('#bgPaths path').length,
    echo: getComputedStyle(document.querySelector('.bg-contour-echo')).display,
    overflow: document.documentElement.scrollWidth > innerWidth,
    violations: window.backgroundViolations
  };
});
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const versions = [['workspace', 'site-dist'], ['statistics', 'statistics-update/site-dist'], ['publication', 'statistics-update/github-publish/site-dist']]
      .filter(([, folder]) => fs.existsSync(path.join(root, folder, 'index.html')));
    for (const [name, folder] of versions) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('https://api.github.com/**', r => r.fulfill({ body: '[]', contentType: 'application/json' }));
      await page.addInitScript(() => {
        window.backgroundViolations = [];
        document.addEventListener('securitypolicyviolation', e => window.backgroundViolations.push(e.violatedDirective));
      });
      await page.goto(pathToFileURL(path.join(root, folder, 'index.html')).href);
      const first = await state(page);
      assert.equal(first.animation, 'none');
      assert.equal(first.radialAnimation, 'none');
      assert.equal(first.paths, 4);
      await page.waitForTimeout(1600);
      assert.deepEqual(await state(page), first, 'background must stay still over time');
      await page.locator('.gallery-wrapper .title').scrollIntoViewIfNeeded();
      await page.waitForTimeout(800);
      assert.ok(await page.evaluate(() => scrollY > 0));
      assert.deepEqual(await state(page), first, 'background must stay fixed while scrolling');
      await page.screenshot({ path: path.join(root, `reports/still-contours-${name}-desktop.png`) });
      await page.locator('#langSwitch').click();
      await page.locator('.gallery-spread').first().click();
      await page.locator('.g-lightbox-close').click();
      await page.setViewportSize({ width: 390, height: 844 });
      const mobile = await state(page);
      assert.equal(mobile.overflow, false);
      assert.equal(mobile.echo, 'none');
      assert.equal(mobile.rect.width, 390);
      assert.equal(mobile.rect.height, 844);
      await page.locator('.gallery-wrapper .title').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(root, `reports/still-contours-${name}-mobile.png`) });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert.equal((await state(page)).animation, 'none');
      assert.deepEqual((await state(page)).violations, []);
      assert.deepEqual(errors, []);
      console.log(`${name}: stationary over time and scroll; desktop, mobile, reduced motion, gallery, language and CSP passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
