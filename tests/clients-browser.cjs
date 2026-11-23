const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { once } = require('node:events');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'reports/client-publication');
fs.mkdirSync(evidence, { recursive: true });
process.env.TEMP = process.env.TMP = path.join(evidence, 'browser-temp');
fs.mkdirSync(process.env.TEMP, { recursive: true });
const { chromium } = require(path.resolve(process.argv[2]));
const testPassword = 'browser-test-passphrase';
const accessScriptPath = path.join(root, 'klienter/access.js');
const accessScript = fs.readFileSync(accessScriptPath, 'utf8');
const productionHash = accessScript.match(/const PASSWORD_SHA256 = '([a-f0-9]{64})'/)?.[1];
assert.ok(productionHash, 'Expected a SHA-256 password hash in the access script');
const testHash = crypto.createHash('sha256').update(testPassword, 'utf8').digest('hex');
const testAccessScript = accessScript.replace(productionHash, testHash);

async function unlock(page, origin, expectedTarget, testWrongPassword = false) {
  await page.waitForURL(url => url.pathname === '/klienter/access.html');
  const accessUrl = new URL(page.url());
  assert.equal(accessUrl.searchParams.get('return'), expectedTarget);
  if (testWrongPassword) {
    await page.locator('#client-access-password').fill('incorrect-test-password');
    await page.locator('#client-access-submit').click();
    await page.getByRole('status').getByText('Fel lösenord. Försök igen.').waitFor();
    assert.equal(new URL(page.url()).pathname, '/klienter/access.html');
  }
  await page.locator('#client-access-password').fill(testPassword);
  await page.locator('#client-access-submit').click();
  await page.waitForURL(origin + expectedTarget);
  assert.equal(new URL(page.url()).pathname + new URL(page.url()).search + new URL(page.url()).hash, expectedTarget);
}

(async () => {
  const { createPreviewServer } = await import(pathToFileURL(path.join(root, 'scripts/preview.mjs')));
  const { loadClients } = await import(pathToFileURL(path.join(root, 'scripts/clients.mjs')));
  const server = createPreviewServer(path.join(root, 'site-dist'), { includeClients: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  let browser;
  const results = [];
  try {
    browser = await chromium.launch({ headless: true, ...(process.platform === 'win32' ? { channel: 'msedge' } : {}) });
    const origin = `http://127.0.0.1:${server.address().port}`;
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await context.route('**/klienter/access.js', route => route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: testAccessScript
      }));
      const errors = [];
      const failures = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (response.url().startsWith(origin) && response.status() >= 400) failures.push(response.url());
      });
      const directTarget = '/klienter/cocothai/meny.html';
      await page.goto(origin + directTarget, { waitUntil: 'domcontentloaded' });
      await unlock(page, origin, directTarget, true);
      const separateTab = await context.newPage();
      await separateTab.goto(origin + '/klienter/cocothai/', { waitUntil: 'domcontentloaded' });
      await separateTab.waitForURL(url => url.pathname === '/klienter/access.html');
      await separateTab.locator('#client-access-password').waitFor({ state: 'visible' });
      await separateTab.close();
      for (const client of loadClients()) {
        const base = `${origin}/klienter/${client.slug}/`;
        for (const file of client.files.filter(file => file.endsWith('.html'))) {
          const response = await page.goto(base + (file === 'index.html' ? '' : file), { waitUntil: 'networkidle' });
          assert.equal(response.status(), 200);
          assert.equal(await page.locator('meta[name="robots"]').getAttribute('content'), 'noindex, nofollow');
          await page.locator('h1').first().waitFor({ state: 'visible' });
          await page.locator('img').evaluateAll(images => images.forEach(image => { image.loading = 'eager'; }));
          await page.waitForFunction(() => [...document.images].every(image => image.complete && image.naturalWidth > 0));
          assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
          const styles = await page.locator('body').evaluate(element => ({ family: getComputedStyle(element).fontFamily, background: getComputedStyle(element).backgroundColor }));
          if (client.slug === 'cocothai') assert.match(styles.family, /Outfit/);
          assert.notEqual(styles.background, 'rgba(0, 0, 0, 0)');
          if (file === 'index.html') await page.screenshot({ path: path.join(evidence, `${client.slug}-${width}.png`), animations: 'disabled' });
          results.push({ client: client.slug, width, page: file, status: response.status() });
          console.log(`Verified ${client.slug}/${file} at ${width}px`);
        }
        // CocoThai has a known menu, glass preference and booking form contract.
        if (client.slug === 'cocothai') {
          await page.goto(base, { waitUntil: 'networkidle' });
          const toggle = page.locator('#menu-toggle');
          if (await toggle.isVisible()) {
            await toggle.click();
            assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
          }
          await page.locator('#nav-menu a[href="meny.html"]').click();
          await page.waitForURL(base + 'meny.html');
          await page.reload({ waitUntil: 'networkidle' });
          await page.locator('.menu-nav-link').last().click();
          await page.locator('.glass-toggle').click();
          assert.equal(await page.locator('html').getAttribute('data-glass'), 'off');
          await page.reload({ waitUntil: 'networkidle' });
          assert.equal(await page.locator('html').getAttribute('data-glass'), 'off');
          await page.goto(base + 'boka.html', { waitUntil: 'networkidle' });
          assert.match(await page.locator('form').getAttribute('action'), /^mailto:/);
          await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
          assert.ok(await page.locator('.form-error').count() > 0);
          assert.equal(page.url(), base + 'boka.html');
          await page.goto(base + 'kontakt.html', { waitUntil: 'networkidle' });
          assert.match(await page.locator('iframe').getAttribute('src'), /^https:\/\/www\.openstreetmap\.org\//);
        }
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(failures, []);
      for (const eyeIndex of [0, 1]) {
        await page.goto(origin, { waitUntil: 'networkidle' });
        await page.evaluate(() => sessionStorage.clear());
        const eye = page.locator('.seedy-eye-link').nth(eyeIndex);
        assert.equal(await page.locator('.seedy-eye-link').count(), 2);
        await eye.scrollIntoViewIfNeeded();
        const hit = await eye.locator('.seedy-eye-hit').boundingBox();
        assert.ok(hit.width >= 44 && hit.height >= 44, `Eye target too small: ${JSON.stringify(hit)}`);
        if (eyeIndex === 0) await eye.click();
        else { await eye.focus(); await page.keyboard.press('Enter'); }
        await unlock(page, origin, '/klienter/');
        await page.waitForURL(origin + '/klienter/');
        await page.getByRole('heading', { name: 'Klientprojekt' }).waitFor();
        if (eyeIndex === 0) await page.screenshot({ path: path.join(evidence, `directory-${width}.png`) });
        await page.getByRole('link', { name: 'Coco Thai', exact: true }).click();
        await page.waitForURL(origin + '/klienter/cocothai/');
      }
      await context.close();
    }
    // The discreet robot entrance is the only portfolio link to the directory.
    const page = await browser.newPage();
    await page.route('**/klienter/access.js', route => route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: testAccessScript
    }));
    await page.goto(origin, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('a[href*="/klienter/"]').count(), 2);
    for (const location of ['/klienter/unknown/', '/klienter/cocothai/README.md']) {
      assert.equal((await page.goto(origin + location)).status(), 404);
    }
    const unsafeTarget = 'https://example.org/';
    await page.goto(origin + '/klienter/access.html?return=' + encodeURIComponent(unsafeTarget));
    await page.waitForURL(url => url.pathname === '/klienter/access.html');
    assert.equal(new URL(page.url()).searchParams.get('return'), unsafeTarget);
    await page.locator('#client-access-password').fill(testPassword);
    await page.locator('#client-access-submit').click();
    await page.waitForURL(origin + '/klienter/');
    await page.goto(origin);
    await page.evaluate(() => sessionStorage.clear());
    await page.goto(origin + '/klienter/cocothai');
    await page.waitForURL(url => url.pathname === '/klienter/access.html');
    assert.equal(new URL(page.url()).searchParams.get('return'), '/klienter/cocothai/');
    const noJs = await browser.newContext({ javaScriptEnabled: false });
    const plain = await noJs.newPage();
    await plain.goto(origin + '/klienter/');
    assert.equal(await plain.locator('body').evaluate(element => getComputedStyle(element).visibility), 'hidden');
    await noJs.close();
    fs.writeFileSync(path.join(evidence, 'browser-results.json'), JSON.stringify(results, null, 2));
    console.log(`Verified ${results.length} client page/viewport combinations, direct links, both robot eyes, keyboard navigation, tab-only unlock, unsafe return URL fallback, closed view without JavaScript, forms, map, redirects and 404s.`);
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
