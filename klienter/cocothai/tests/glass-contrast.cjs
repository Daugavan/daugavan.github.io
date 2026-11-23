/* Samples composited backgrounds beneath the changed controls in Chromium.
 * Run a local server, then GLASS_URL=http://127.0.0.1:8765 node tests/glass-contrast.cjs.
 * Requires Playwright + pngjs. This is a targeted check, not a whole-site WCAG audit.
 */
'use strict';
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const base = process.env.GLASS_URL || 'http://127.0.0.1:8765';
const output = process.env.GLASS_ARTIFACTS || '/tmp/coco-glass-review';
function luminance(rgb) {
  const c = rgb.slice(0, 3).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
}
function ratio(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
let browser;
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const results = [];
  async function sample(selector, state = 'normal') {
    const target = p.locator(selector).first();
    if (state === 'hover') await target.hover();
    else await p.mouse.move(1, 990);
    const info = await target.evaluate(n => {
      const style = n.getAttribute('style');
      const color = getComputedStyle(n).color.match(/[\d.]+/g).map(Number);
      const range = document.createRange(); range.selectNodeContents(n);
      const r = range.getBoundingClientRect(), box = n.getBoundingClientRect();
      n.style.setProperty('color', 'transparent', 'important');
      return { style, color, x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
    });
    const image = PNG.sync.read(await target.screenshot({ animations: 'disabled' }));
    await target.evaluate((n, style) => { if (style === null) n.removeAttribute('style'); else n.setAttribute('style', style); }, info.style);
    let minimum = Infinity;
    for (let y = Math.max(0, Math.ceil(info.y)); y < Math.min(image.height, Math.floor(info.y + info.h)); y++) {
      for (let x = Math.max(0, Math.ceil(info.x)); x < Math.min(image.width, Math.floor(info.x + info.w)); x++) {
        const i = (y * image.width + x) * 4;
        minimum = Math.min(minimum, ratio(info.color, [...image.data.subarray(i, i + 3)]));
      }
    }
    assert.ok(Number.isFinite(minimum) && minimum >= 4.5, `${selector} ${state}: ${minimum}`);
    results.push({ selector, state, minimumTextContrast: +minimum.toFixed(2) });
  }
  await p.goto(base + '/index.html');
  await p.evaluate(() => document.fonts.ready);
  for (const selector of ['.header .nav-link[aria-current]', '.header-cta', '.hero-cta .btn-primary', '.hero-cta .btn-outline-light']) {
    await sample(selector);
    await sample(selector, 'hover');
  }
  await p.locator('.glass-toggle').scrollIntoViewIfNeeded();
  await sample('.glass-toggle > span:first-child');
  await sample('.glass-toggle-state');
  await p.goto(base + '/meny.html#kyckling');
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(200);
  await sample('.menu-nav-link.active');
  await sample('.menu-nav-link:not(.active)');
  const marker = await p.locator('.menu-nav-marker').boundingBox();
  const strip = PNG.sync.read(await p.screenshot({ clip: { x: Math.floor(marker.x) - 3, y: Math.floor(marker.y + marker.height / 2), width: 8, height: 1 } }));
  const outside = [...strip.data.subarray(0, 3)];
  const edge = Math.max(...[3, 4].map(x => ratio([...strip.data.subarray(x * 4, x * 4 + 3)], outside)));
  assert.ok(edge >= 3, `Selected capsule boundary: ${edge}`);
  results.push({ selector: '.menu-nav-marker', sampledBoundaryContrast: +edge.toFixed(2) });
  await p.locator('.menu-nav-link.active').focus();
  const focus = await p.locator('.menu-nav-link.active').evaluate(n => ({ color: getComputedStyle(n).outlineColor, width: getComputedStyle(n).outlineWidth }));
  assert.equal(focus.width, '2px');
  fs.mkdirSync(output, { recursive: true });
  const result = { engine: browser.version(), viewport: '1440x1000', method: 'Minimum foreground contrast across the text rectangle after hiding text; sampled capsule edge against its adjacent composited background. Existing photo and menu backdrops; targeted controls only.', results, focus };
  fs.writeFileSync(path.join(output, 'contrast.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
