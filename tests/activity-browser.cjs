const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.argv[2] || 'playwright');
const snapshot = JSON.parse(fs.readFileSync(path.resolve('activity-snapshot.json'), 'utf8'));
const endpoint = '**/contents/activity-snapshot.json?ref=main';
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const open = async data => {
      const page = await browser.newPage();
      await page.route('https://api.github.com/**', r => r.fulfill({body:'[]',contentType:'application/json'}));
      await page.route(endpoint, r => data === null ? r.fulfill({status:503,body:'Unavailable'}) : r.fulfill({body:JSON.stringify(data),contentType:'application/json'}));
      await page.goto(pathToFileURL(path.resolve('site-dist/index.html')).href);
      return page;
    };
    const fresh = structuredClone(snapshot);
    fresh.github.total = 9876; fresh.lovable.total = 5432;
    const page = await open(fresh);
    await page.waitForFunction(() => document.querySelector('[data-i18n="githubActivityTotal"]').textContent.replace(/\D/g,'') === '9876');
    assert.match(await page.locator('[data-i18n="lovableActivityTotal"]').innerText(), /5[ ,\u00a0]432/);
    assert.match(await page.locator('img[data-i18n-alt="githubActivityAlt"]').getAttribute('src'), /^data:image\/svg\+xml/);
    const codexBefore = await page.locator('.activity-card-codex').innerText();
    await page.locator('#langSwitch').click();
    assert.match(await page.locator('[data-i18n="githubActivityTotal"]').innerText(), /9[ ,\u00a0]876/);
    await page.locator('#langSwitch').click();
    assert.equal(await page.locator('.activity-card-codex').innerText(), codexBefore);
    const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('daugavan_activity_v1')));
    assert.equal(cached.data.github.total,9876);
    await page.route(endpoint, r=>r.fulfill({status:503,body:'Unavailable'}));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-i18n="githubActivityTotal"]').textContent.replace(/\D/g,'') === '9876');
    await page.close();
    for (const data of [null, {version:1,github:{total:'<script>'},lovable:{}}, {...fresh, github:{...fresh.github, columns:[[5]]}}]) {
      const fallback = await open(data);
      await fallback.waitForTimeout(300);
      assert.match(await fallback.locator('[data-i18n="githubActivityTotal"]').innerText(), /1[ ,\u00a0]510/);
      assert.match(await fallback.locator('[data-i18n="lovableActivityTotal"]').innerText(), /437/);
      assert.equal(await fallback.locator('.bg-star').count(),126);
      await fallback.close();
    }
    console.log('Automatic totals, safe SVG calendars, language switch, cached fallback, invalid data and unchanged Codex passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
