const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.argv[2] || 'playwright');
const snapshot = JSON.parse(fs.readFileSync(path.resolve('activity-snapshot.json'), 'utf8'));
const endpoint = '**/contents/activity-snapshot.json?ref=main';
process.env.TEMP = process.env.TMP = path.resolve('reports/browser-temp-activity');
fs.mkdirSync(process.env.TEMP, { recursive: true });
const assertLatest = async page => {
  const calendars = page.locator('.activity-scroll');
  assert.equal(await calendars.count(), 3);
  for (const calendar of await calendars.all()) {
    await calendar.scrollIntoViewIfNeeded();
    await calendar.locator('img').evaluate(image => image.decode());
  }
  await page.waitForFunction(() => [...document.querySelectorAll('.activity-scroll')].every(scroller =>
    Math.abs(scroller.scrollLeft - (scroller.scrollWidth - scroller.clientWidth)) <= 1
  ));
  const offsets = await calendars.evaluateAll(elements => elements.map(element => element.scrollLeft));
  if (page.viewportSize().width < 680) assert.ok(offsets.every(offset => offset > 100));
};
(async () => {
  const browser = await chromium.launch({channel:'msedge',headless:true});
  try {
    const open = async data => {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: 'reduce' });
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
    await assertLatest(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await assertLatest(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await assertLatest(page);
    await page.locator('.activity-card-github .activity-scroll').focus();
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => {
      const scroller = document.querySelector('.activity-card-github .activity-scroll');
      return scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 1;
    });
    await page.locator('.activity-card-github .activity-scroll').hover();
    await page.mouse.wheel(-1000, 0);
    await page.waitForFunction(() => document.querySelector('.activity-card-github .activity-scroll').scrollLeft === 0);
    const codexBefore = await page.locator('.activity-card-codex').innerText();
    await page.locator('#langSwitch').click();
    assert.match(await page.locator('[data-i18n="githubActivityTotal"]').innerText(), /9[ ,\u00a0]876/);
    await page.locator('#langSwitch').click();
    assert.equal(await page.locator('.activity-card-codex').innerText(), codexBefore);
    await page.locator('.activity-card-github .activity-scroll img').evaluate(image => image.decode());
    assert.equal(await page.locator('.activity-card-github .activity-scroll').evaluate(element => element.scrollLeft), 0);
    await page.setViewportSize({ width: 414, height: 896 });
    assert.equal(await page.locator('.activity-card-github .activity-scroll').evaluate(element => element.scrollLeft), 0);
    const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('daugavan_activity_v1')));
    assert.equal(cached.data.github.total,9876);
    await page.route(endpoint, r=>r.fulfill({status:503,body:'Unavailable'}));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('[data-i18n="githubActivityTotal"]').textContent.replace(/\D/g,'') === '9876');
    await assertLatest(page);
    await page.close();
    for (const data of [null, {version:1,github:{total:'<script>'},lovable:{}}, {...fresh, github:{...fresh.github, columns:[[5]]}}]) {
      const fallback = await open(data);
      await fallback.waitForTimeout(300);
      await assertLatest(fallback);
      assert.match(await fallback.locator('[data-i18n="githubActivityTotal"]').innerText(), /1[ ,\u00a0]510/);
      assert.match(await fallback.locator('[data-i18n="lovableActivityTotal"]').innerText(), /437/);
      assert.equal(await fallback.locator('.bg-star').count(),126);
      await fallback.close();
    }
    console.log('Latest activity on mobile/desktop, resize, manual keyboard scroll, language switch, cached/offline fallback, safe SVG calendars and unchanged Codex passed.');
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
