/* Run with Node and Playwright installed in your development environment.
 * Runtime site dependencies remain unchanged. Artifacts go outside the source tree.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { chromium, firefox, webkit } = require('playwright');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '..');
const output = process.env.GLASS_ARTIFACTS || '/tmp/coco-glass-review';
const engine = process.env.GLASS_BROWSER || 'chromium';
const pages = ['index', 'meny', 'boka', 'kontakt', 'integritetspolicy'];
fs.mkdirSync(output, { recursive: true });
const checks = [];
const errors = [];
const notTested = [];
function check(name, condition) { assert.ok(condition, name); checks.push(name); }
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const csp = fs.readFileSync(path.join(root, '_headers'), 'utf8').match(/Content-Security-Policy: (.+)/)[1];
const certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'coco-test-tls-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', path.join(certDir, 'key.pem'), '-out', path.join(certDir, 'cert.pem'), '-days', '1', '-subj', '/CN=localhost'], { stdio: 'ignore' });
// Capture only the external mail-client handoff in this fixture. The product
// submit handler, validation and URL encoding run unchanged.
const testScript = fs.readFileSync(path.join(root, 'script.js'), 'utf8').replace(
  'window.location.href = buildMailtoUrl(form);', 'window.__testMailto = buildMailtoUrl(form);');
assert.ok(testScript.includes('window.__testMailto ='), 'Mailto transport interception must be installed');
const server = https.createServer({ key: fs.readFileSync(path.join(certDir, 'key.pem')), cert: fs.readFileSync(path.join(certDir, 'cert.pem')) }, (req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': contentTypes[path.extname(file)] || 'application/octet-stream', 'Content-Security-Policy': csp });
    res.end(file === path.join(root, 'script.js') ? testScript : bytes);
  });
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'https://127.0.0.1:' + server.address().port;
  const type = { chromium, firefox, webkit }[engine];
  browser = await type.launch(engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] } : {});
  const context = await browser.newContext({ reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  // The remote map is outside this change; keep its GPU/network code out of
  // local regressions (headless Firefox lacks the embed's WebGL2 context).
  await context.route('https://www.openstreetmap.org/export/embed.html**', route => route.fulfill({ contentType: 'text/html', body: '<title>External map fixture</title>' }));
  context.on('page', p => p.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR:', e.message); }));
  const p = await context.newPage();
  p.setDefaultTimeout(7000);
  p.setDefaultNavigationTimeout(20000);
  p.on('console', msg => { if (msg.text().startsWith('Marker mismatch')) console.error(msg.text()); });
  async function open(file = 'index', suffix = '') {
    await p.goto(base + '/' + file + '.html' + suffix);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
  }
  async function emulate(options) {
    const names = { contrast: 'prefers-contrast', forcedColors: 'forced-colors', reducedMotion: 'prefers-reduced-motion' };
    const queries = Object.entries(options).filter(([key]) => names[key]).map(([key, value]) => '(' + names[key] + ': ' + value + ')');
    await p.evaluate(queries => { window.__reviewMedia = queries.map(q => matchMedia(q)); }, queries);
    await p.emulateMedia(options);
    await p.waitForTimeout(60);
    const stale = await p.evaluate(() => window.__reviewMedia.some(q => q.matches !== matchMedia(q.media).matches));
    if (stale) {
      notTested.push('Live ' + JSON.stringify(options) + ': engine automation leaves existing MediaQueryLists stale; startup behavior tested after reload');
      await p.reload();
      await p.evaluate(() => document.fonts.ready);
    }
  }
  async function aligned() {
    await p.waitForTimeout(250);
    return p.evaluate(() => {
      const a = document.querySelector('[aria-current="location"]').getBoundingClientRect();
      const m = document.querySelector('.menu-nav-marker').getBoundingClientRect();
      const ok = Math.abs(a.left - m.left) < 1 && Math.abs(a.width - m.width) < 1 && Math.abs(a.top - m.top) < 1;
      if (!ok) console.error('Marker mismatch', JSON.stringify({ a: a.toJSON(), m: m.toJSON() }));
      return ok;
    });
  }
  for (const width of [320, 390, 768, 1440]) {
    await p.setViewportSize({ width, height: 900 });
    for (const file of pages) {
      await open(file);
      const layout = await p.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
      check(`${file}: ${width}px reflow ${JSON.stringify(layout)}`, layout.scroll <= layout.viewport + 1);
      check(`${file}: named switch at ${width}px`, await p.getByRole('switch', { name: 'Glaseffekter' }).count() === 1);
      check(`${file}: 44px switch target at ${width}px`, (await p.locator('.glass-toggle').boundingBox()).height >= 44);
      if (file === 'index' && [390, 1440].includes(width)) await p.screenshot({ path: path.join(output, `${engine}-home-${width}.png`) });
    }
  }
  console.log(engine + ': layout matrix passed');
  await p.setViewportSize({ width: 390, height: 844 });
  await open('meny', '#skaldjur');
  check('direct hash selects category', await p.locator('[aria-current="location"]').getAttribute('href') === '#skaldjur');
  check('direct hash marker alignment', await aligned());
  check('mobile active category visible', await p.evaluate(() => {
    const a = document.querySelector('[aria-current="location"]').getBoundingClientRect();
    const l = document.querySelector('.menu-nav-list').getBoundingClientRect();
    return a.left >= l.left && a.right <= l.right;
  }));
  for (const id of ['buffe', 'kyckling', 'barn-dessert']) {
    await p.locator(`.menu-nav-link[href="#${id}"]`).focus();
    await p.keyboard.press('Enter');
    await p.waitForTimeout(300);
    check(`keyboard navigation to ${id}`, await p.locator('[aria-current="location"]').getAttribute('href') === '#' + id);
    check(`marker follows ${id}`, await aligned());
  }
  await p.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); });
  await p.waitForTimeout(120);
  await p.evaluate(() => scrollTo(0, 650));
  await p.waitForTimeout(300);
  check('hidden header leaves no sticky gap', await p.evaluate(() => {
    return document.documentElement.classList.contains('header-hidden') && Math.abs(document.querySelector('.menu-nav').getBoundingClientRect().top) < 1;
  }));
  await p.evaluate(() => scrollTo(0, 620));
  await p.waitForTimeout(150);
  check('visible header and category bar meet', await p.evaluate(() => {
    return Math.abs(document.querySelector('.header').getBoundingClientRect().bottom - document.querySelector('.menu-nav').getBoundingClientRect().top) < 1;
  }));
  check('header height comes from rendered geometry', await p.evaluate(() => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) === document.querySelector('.header').offsetHeight));
  await p.locator('.menu-nav-link[href="#kyckling"]').click();
  await p.screenshot({ path: path.join(output, `${engine}-categories-mobile.png`) });
  await p.evaluate(() => document.documentElement.style.fontSize = '200%');
  await p.waitForTimeout(150);
  check('200% text keeps marker aligned', await aligned());
  check('200% text reflows', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await p.evaluate(() => document.documentElement.style.fontSize = '');

  console.log(engine + ': category navigation passed');
  await open();
  const toggle = p.getByRole('switch', { name: 'Glaseffekter' });
  await toggle.focus();
  await p.keyboard.press('Space');
  check('Space toggles switch with focus retained', await toggle.getAttribute('aria-checked') === 'false' && await toggle.evaluate(n => document.activeElement === n));
  for (const file of pages) {
    await open(file);
    check(`${file}: persisted solid preference`, await p.locator('.glass-toggle').getAttribute('aria-checked') === 'false');
    check(`${file}: no navigation filter when off`, await p.locator('.header').evaluate(n => getComputedStyle(n, '::before').backdropFilter === 'none'));
  }
  await p.locator('.glass-toggle').click();
  await open();
  check('on preference restored across pages', await toggle.getAttribute('aria-checked') === 'true');
  check('decorative lens hidden from assistive tree', await p.locator('.glass-lens').evaluate(n => n.hasAttribute('inert') && n.getAttribute('aria-hidden') === 'true'));
  check('only one semantic h1', await p.getByRole('heading', { level: 1 }).count() === 1);
  await p.locator('#menu-toggle').click();
  await p.waitForFunction(() => document.activeElement === document.querySelector('#nav-menu a'));
  check('mobile menu opens with focus', await p.locator('#menu-toggle').getAttribute('aria-expanded') === 'true' && await p.locator('#nav-menu a').first().evaluate(n => document.activeElement === n));
  await p.keyboard.press('Escape');
  check('Escape returns focus', await p.locator('#menu-toggle').evaluate(n => document.activeElement === n) && await p.locator('#menu-toggle').getAttribute('aria-expanded') === 'false');
  for (const options of [{ contrast: 'more' }, { forcedColors: 'active' }]) {
    await emulate(options);
    const feature = Object.keys(options)[0] === 'contrast' ? 'prefers-contrast' : 'forced-colors';
    if (!await p.evaluate(({ feature, value }) => matchMedia('(' + feature + ': ' + value + ')').matches, { feature, value: Object.values(options)[0] })) {
      notTested.push(feature + ': automation did not activate the preference');
      await emulate({ contrast: 'no-preference', forcedColors: 'none' });
      continue;
    }
    check(JSON.stringify(options) + ': solid navigation', await p.locator('.header').evaluate(n => getComputedStyle(n, '::before').backdropFilter === 'none'));
    check(JSON.stringify(options) + ': lens removed', !await p.locator('.glass-lens').isVisible());
    await emulate({ contrast: 'no-preference', forcedColors: 'none' });
  }
  console.log(engine + ': preferences and mobile focus passed');
  if (engine === 'chromium') {
    const cdp = await context.newCDPSession(p);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    check('reduced transparency: preference is actually emulated', await p.evaluate(() => matchMedia('(prefers-reduced-transparency: reduce)').matches));
    check('reduced transparency: navigation solid', await p.locator('.header').evaluate(n => getComputedStyle(n, '::before').backdropFilter === 'none'));
    check('reduced transparency: lens removed', !await p.locator('.glass-lens').isVisible());
    await cdp.send('Emulation.setEmulatedMedia', { features: [] });
    await cdp.detach();
    await emulate({ reducedMotion: 'reduce' });
  } else notTested.push('OS reduced-transparency setting: no supported automation override; manual solid preference tested on all pages');
  await p.setViewportSize({ width: 1440, height: 1000 });
  await open();
  const lens = p.locator('.glass-lens');
  const filtered = await lens.screenshot();
  await p.locator('.glass-lens-copy').evaluate(n => n.style.filter = 'none');
  const plain = await lens.screenshot();
  check('SVG refraction changes actual lens pixels', !filtered.equals(plain));
  function textPixels(buffer) {
    const image = PNG.sync.read(buffer);
    let count = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i] > 180 && image.data[i + 1] > 170 && image.data[i + 2] > 140) count++;
    }
    return count;
  }
  check('refraction preserves the magnified glyph', textPixels(filtered) >= textPixels(plain) * 0.6);
  await p.locator('.glass-lens-copy').evaluate(n => n.style.removeProperty('filter'));
  check('text clone shares line wrapping', await p.locator('.glass-lens-copy').evaluate(n => n.offsetWidth === document.querySelector('#hero-title').offsetWidth));
  await emulate({ reducedMotion: 'no-preference' });
  await p.waitForTimeout(1100);
  const home = await lens.boundingBox();
  const title = await p.locator('#hero-title').boundingBox();
  await p.mouse.move(title.x + title.width * 0.75, title.y + title.height * 0.5);
  await p.waitForTimeout(60);
  check('fine pointer moves the lens', Math.abs((await lens.boundingBox()).x - home.x) > 20);
  await p.mouse.move(1, 900);
  await p.waitForFunction(homeX => Math.abs(document.querySelector('.glass-lens').getBoundingClientRect().x - homeX) < 1, home.x, { timeout: 2500 });
  check('lens settles back home', Math.abs((await lens.boundingBox()).x - home.x) < 1);
  await emulate({ reducedMotion: 'reduce' });
  await p.mouse.move(title.x + title.width * 0.8, title.y + title.height * 0.5);
  await p.waitForTimeout(50);
  check('reduced motion stops lens movement', Math.abs((await lens.boundingBox()).x - home.x) < 1);
  console.log(engine + ': optics and live motion passed');
  for (const file of ['boka', 'kontakt']) {
    await open(file);
    await p.locator('button[type="submit"]').click();
    check(`${file}: validation remains active`, await p.locator('[aria-invalid="true"]').count() > 0);
    const form = p.locator('form');
    if (file === 'kontakt') check('external map endpoint preserved', (await p.locator('.map-container iframe').getAttribute('src')).startsWith('https://www.openstreetmap.org/export/embed.html?'));
    check(`${file}: mailto form action preserved`, (await form.getAttribute('action')).startsWith('mailto:'));
    await p.locator('input[name="name"]').fill('Test Guest');
    await p.locator('input[name="email"]').fill('guest@example.test');
    if (file === 'boka') {
      await p.locator('[name="guests"]').selectOption({ index: 1 });
      await p.locator('[name="date"]').fill('2027-12-20');
      await p.locator('[name="time"]').selectOption({ index: 1 });
    } else await p.locator('[name="message"]').fill('Test message');
    await p.locator('button[type="submit"]').click({ noWaitAfter: true });
    await p.waitForTimeout(150);
    check(`${file}: valid form produces handoff status`, await p.locator('.form-message.success, .form-message--success').count() > 0 || (await p.locator('.form-message').textContent()).includes('e-postklient'));
    const handoff = await p.evaluate(() => window.__testMailto);
    check(`${file}: encoded handoff contains submitted fields`, handoff.startsWith('mailto:info@cocothai.se?') && decodeURIComponent(handoff).includes('Test Guest') && decodeURIComponent(handoff).includes('guest@example.test'));
    check(`${file}: honeypot excluded from handoff`, !decodeURIComponent(handoff).includes('company:'));
  }
  console.log(engine + ': forms passed');
  const blocked = await browser.newContext({ reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  await blocked.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
  const blockedPage = await blocked.newPage();
  await blockedPage.goto(base);
  await blockedPage.locator('.glass-toggle').click();
  check('blocked storage permits in-session toggle', await blockedPage.locator('.glass-toggle').getAttribute('aria-checked') === 'false');
  await blocked.close();
  const noJS = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true });
  const staticPage = await noJS.newPage();
  await staticPage.goto(base);
  check('no-JS heading remains visible', await staticPage.locator('#hero-title').isVisible());
  check('no-JS preference control is hidden', !await staticPage.locator('.glass-toggle').isVisible());
  await staticPage.goto(base + '/meny.html');
  check('no-JS category links remain real anchors', await staticPage.locator('.menu-nav-link[href="#kyckling"]').count() === 1);
  await noJS.close();
  const fallback = await browser.newContext({ reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  await fallback.route('**/styles.css', route => route.fulfill({ contentType: 'text/css', body: fs.readFileSync(path.join(root, 'styles.css'), 'utf8').replace(/@supports \(\(backdrop-filter[^\n]+/g, '@supports (not-a-real-property: none) {') }));
  const fallbackPage = await fallback.newPage();
  await fallbackPage.goto(base);
  check('no-filter navigation uses opaque backing', await fallbackPage.locator('.header').evaluate(n => { const s = getComputedStyle(n, '::before'); return s.backdropFilter === 'none' && s.backgroundColor === 'rgb(18, 28, 25)'; }));
  check('no-filter photo action uses opaque backing', await fallbackPage.locator('.hero-cta .btn-outline-light').evaluate(n => getComputedStyle(n).backgroundColor === 'rgb(18, 28, 25)'));
  await fallback.close();
  const noCanvas = await browser.newContext({ reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  await noCanvas.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  const plainPage = await noCanvas.newPage();
  await plainPage.goto(base);
  check('missing canvas keeps the simple magnification fallback', await plainPage.locator('.glass-lens-copy').evaluate(n => getComputedStyle(n).filter === 'none') && await plainPage.locator('#hero-title').isVisible());
  await noCanvas.close();
  const touch = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', ignoreHTTPSErrors: true });
  const touchPage = await touch.newPage();
  await touchPage.goto(base);
  await touchPage.evaluate(() => document.fonts.ready);
  const touchHome = await touchPage.locator('.glass-lens').boundingBox();
  await touchPage.locator('#hero-title').tap();
  check('touch keeps the decorative lens stationary', Math.abs((await touchPage.locator('.glass-lens').boundingBox()).x - touchHome.x) < 1);
  await touch.close();
  await emulate({ reducedMotion: 'no-preference' });
  await open('meny');
  await p.evaluate(() => { for (const id of ['kyckling', 'buffe', 'notkott', 'forratter']) document.querySelector('.menu-nav-link[href="#' + id + '"]').click(); });
  await p.waitForTimeout(1200);
  check('rapid category reversal resolves to the latest command', await p.locator('[aria-current="location"]').getAttribute('href') === '#forratter');
  check('rapid reversal preserves marker geometry', await aligned());
  await p.locator('.glass-toggle').scrollIntoViewIfNeeded();
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(output, `${engine}-switch.png`) });
  check('no uncaught JavaScript errors: ' + JSON.stringify(errors), errors.length === 0);
  const result = { engine, version: browser.version(), fixtures: ['HTTPS with production CSP', 'Captured mailto transport', 'External map embed replaced by a static fixture; endpoint checked'], assertions: checks.length, checks, errors, notTested };
  fs.writeFileSync(path.join(output, `${engine}-results.json`), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ engine, version: result.version, passed: checks.length, output }));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  server.close();
  fs.rmSync(certDir, { recursive: true, force: true });
});
