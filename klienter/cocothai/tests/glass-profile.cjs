/* Chromium trace comparison. Run a local server first, then:
 * GLASS_URL=http://127.0.0.1:8765 node tests/glass-profile.cjs
 * Optional GLASS_BASELINE_URL points to the pre-change site for scroll comparison.
 * Measures main-thread work, not GPU time or battery use.
 */
'use strict';
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.GLASS_URL || 'http://127.0.0.1:8765';
const output = process.env.GLASS_ARTIFACTS || '/tmp/coco-glass-review';
fs.mkdirSync(output, { recursive: true });
const p95 = values => [...values].sort((a, b) => a - b)[Math.ceil(values.length * .95) - 1] || 0;
let browser;
(async () => {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript(() => {
    const request = window.requestAnimationFrame;
    window.__requestedFrames = 0;
    window.requestAnimationFrame = callback => { window.__requestedFrames++; return request.call(window, callback); };
  });
  await page.goto(base);
  await page.evaluate(() => document.fonts.ready);
  await page.addStyleTag({ content: '.hero-media img {animation:none!important;will-change:auto!important} .glass-title-wrap {animation:none!important}' });
  await page.waitForTimeout(1200);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  async function trace(action) {
    await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' });
    await action();
    const finished = new Promise(resolve => cdp.once('Tracing.tracingComplete', resolve));
    await cdp.send('Tracing.end');
    const { stream } = await finished;
    let json = '';
    for (;;) { const chunk = await cdp.send('IO.read', { handle: stream }); json += chunk.data; if (chunk.eof) break; }
    await cdp.send('IO.close', { handle: stream });
    const events = JSON.parse(json).traceEvents;
    const marks = events.filter(e => /^coco-frame-\d+$/.test(e.name) && e.ph === 'I').sort((a, b) => a.ts - b.ts);
    if (marks.length < 60) throw new Error('Trace frame marks missing');
    const work = events.filter(e => e.pid === marks[0].pid && e.tid === marks[0].tid && e.ph === 'X' && e.dur > 0);
    const samples = [];
    for (let i = 1; i < marks.length; i++) {
      const start = marks[i - 1].ts, end = marks[i].ts;
      const spans = work.filter(e => e.ts < end && e.ts + e.dur > start).map(e => [Math.max(start, e.ts), Math.min(end, e.ts + e.dur)]).sort((a, b) => a[0] - b[0]);
      let total = 0, right = start;
      for (const [a, b] of spans) { total += Math.max(0, b - Math.max(a, right)); right = Math.max(right, b); }
      samples.push(total / 1000);
    }
    return { p95MainThreadMs: p95(samples), totalMainThreadMs: samples.reduce((a, b) => a + b, 0), frames: samples.length };
  }
  async function motion(kind) {
    await page.evaluate(async kind => {
      const title = document.getElementById('hero-title');
      for (let i = 0; i < 90; i++) {
        await new Promise(requestAnimationFrame);
        performance.mark('coco-frame-' + i);
        if (kind === 'pointer') {
          const r = title.getBoundingClientRect();
          title.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: r.left + r.width * (.3 + .3 * Math.sin(i / 10)), clientY: r.top + r.height * .5 }));
        } else scrollTo(0, i * 28);
      }
      await new Promise(requestAnimationFrame);
      performance.mark('coco-frame-90');
    }, kind);
  }
  const result = { browser: browser.version(), viewport: '1440x1000', notes: '90 frames/run; 3 measured runs after warm-up; background image animation disabled in every variant; traced main-thread union, not GPU/battery.', pointer: [], scroll: [] };
  // Warm both shader paths before recording alternated samples.
  await motion('pointer');
  await page.locator('.glass-lens-copy').evaluate(n => n.style.filter = 'none');
  await motion('pointer');
  for (let run = 0; run < 3; run++) {
    for (const variant of run % 2 ? ['refraction', 'magnify'] : ['magnify', 'refraction']) {
      await page.locator('.glass-lens-copy').evaluate((n, variant) => { n.style.filter = variant === 'magnify' ? 'none' : ''; }, variant);
      await page.waitForTimeout(100);
      result.pointer.push({ run: run + 1, variant, ...await trace(() => motion('pointer')) });
    }
  }
  await page.locator('.glass-lens-copy').evaluate(n => n.style.filter = '');
  for (let run = 0; run < 3; run++) {
    for (const variant of ['solid', 'glass']) {
      await page.evaluate(variant => { document.documentElement.dataset.glass = variant === 'solid' ? 'off' : 'on'; scrollTo(0, 0); }, variant);
      await page.waitForTimeout(400);
      result.scroll.push({ run: run + 1, variant, ...await trace(() => motion('scroll')) });
    }
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(1200);
  const idleStart = await page.evaluate(() => window.__requestedFrames);
  await page.waitForTimeout(500);
  result.intentionalFramesDuring500msIdle = await page.evaluate(start => window.__requestedFrames - start, idleStart);
  result.refractionPairedAddedP95Ms = [1, 2, 3].map(run => result.pointer.find(x => x.run === run && x.variant === 'refraction').p95MainThreadMs - result.pointer.find(x => x.run === run && x.variant === 'magnify').p95MainThreadMs);
  result.refractionAddedP95Ms = Math.max(...result.refractionPairedAddedP95Ms);
  result.refractionBudgetMs = 2;
  result.refractionGatePass = result.refractionAddedP95Ms <= 2;
  if (process.env.GLASS_BASELINE_URL) {
    await page.goto(process.env.GLASS_BASELINE_URL);
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: '.hero-media img {animation:none!important;will-change:auto!important} .glass-title-wrap {animation:none!important}' });
    await page.waitForTimeout(1200);
    await motion('scroll');
    result.beforeScroll = [];
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(400);
      result.beforeScroll.push({ run: i + 1, ...await trace(() => motion('scroll')) });
    }
  }
  fs.writeFileSync(path.join(output, 'performance.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  if (!result.refractionGatePass || result.intentionalFramesDuring500msIdle !== 0) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); });
