const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require(path.resolve(process.argv[2]));
const root = path.resolve(__dirname, '..');
const pause = () => new Promise(resolve => setTimeout(resolve, 30));

async function check(blockedStorage) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://daugavan.github.io/', runScripts: 'outside-only'
  });
  const w = dom.window;
  const preferences = new Map();
  w.matchMedia = query => {
    if (!preferences.has(query)) preferences.set(query, {
      matches: query.includes('reduced-motion'), listeners: [],
      addEventListener(_name, listener) { this.listeners.push(listener); }
    });
    return preferences.get(query);
  };
  w.requestAnimationFrame = fn => setTimeout(fn, 0);
  w.cancelAnimationFrame = clearTimeout;
  w.ResizeObserver = class { observe() {} };
  w.TextDecoder = TextDecoder;
  w.AbortController = AbortController;
  w.fetch = async () => new Response('[]');
  w.HTMLImageElement.prototype.decode = () => Promise.reject(new Error('Offline fixture'));
  Object.defineProperty(w.HTMLImageElement.prototype, 'naturalWidth', { get: () => 1600 });
  Object.defineProperty(w.HTMLImageElement.prototype, 'complete', { get: () => true });
  w.Element.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 400 });
  Object.defineProperty(w.HTMLElement.prototype, 'offsetWidth', { get: () => 128 });
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new w.Event('close')); };
  if (blockedStorage) {
    Object.defineProperty(w, 'localStorage', { get() { throw new Error('Storage blocked'); } });
  } else w.localStorage.setItem('lang', 'en');
  try {
    w.eval(fs.readFileSync(path.join(root, 'glass.js'), 'utf8'));
    w.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
    await pause();
    const q = selector => w.document.querySelector(selector);
    assert.ok(q('.glass-backdrop'));
    q('.glass-preference').click();
    assert.equal(q('html').classList.contains('solid-surfaces'), true);
    if (!blockedStorage) assert.equal(w.localStorage.getItem('daugavan-solid-surfaces'), 'true');
    q('.glass-preference').click();
    assert.equal(q('html').classList.contains('solid-surfaces'), false);
    const transparency = preferences.get('(prefers-reduced-transparency: reduce)');
    transparency.matches = true;
    transparency.listeners.forEach(fn => fn());
    assert.equal(q('.glass-preference').disabled, true);
    assert.equal(q('html').classList.contains('solid-surfaces'), true);
    transparency.matches = false;
    transparency.listeners.forEach(fn => fn());
    q('.gallery-spread').focus();
    q('.gallery-spread').click();
    q('.g-detail-toggle').click();
    await pause();
    assert.equal(q('.g-detail-toggle').getAttribute('aria-pressed'), 'true');
    assert.equal(q('.g-detail-lens').hidden, false);
    assert.equal(q('.g-detail-lens').style.backgroundSize, '1080px 720px');
    assert.equal(q('.g-detail-lens').style.backgroundPosition, '-476px -296px');
    q('.g-lightbox-pic').focus();
    q('.g-lightbox-pic').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await pause();
    assert.equal(q('.g-detail-lens').style.left, '330px');
    assert.match(q('figcaption').textContent, /1 \/ 6/);
    q('.g-lightbox-pic').setPointerCapture = () => {};
    const drag = new w.Event('pointerdown', { bubbles: true });
    Object.assign(drag, { pointerType: 'touch', pointerId: 1, buttons: 1, clientX: 150, clientY: 100 });
    q('.g-lightbox-pic').dispatchEvent(drag);
    await pause();
    assert.equal(q('.g-detail-lens').style.left, '150px');
    assert.equal(q('.g-detail-lens').style.top, '100px');
    assert.match(q('figcaption').textContent, /1 \/ 6/, 'dragging the lens must not change the photo');
    q('.g-lightbox-next').click();
    assert.equal(q('.g-detail-lens').hidden, true, 'hide stale image while the next loads');
    q('.g-lightbox-pic').dispatchEvent(new w.Event('load'));
    await pause();
    assert.match(q('.g-detail-lens').style.backgroundImage, /(?:%28|\()2(?:%29|\))/);
    q('.g-lightbox-pic').onerror();
    assert.match(q('.g-lightbox-pic').src, /\.jpg$/);
    q('.g-lightbox-pic').dispatchEvent(new w.Event('load'));
    await pause();
    assert.match(q('.g-detail-lens').style.backgroundImage, /\.jpg/);
    q('#langSwitch').click();
    assert.match(q('.g-detail-toggle').textContent, /Detaljläge/);
    assert.match(q('.glass-preference').textContent, /Minska/);
    q('.g-detail-toggle').click();
    assert.equal(q('.g-detail-lens').hidden, true);
    q('.g-lightbox-pic').dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    assert.match(q('figcaption').textContent, /3 \/ 6/);
    q('.g-lightbox-close').click();
    assert.equal(q('dialog'), null);
    assert.equal(q('.gallery-spread'), w.document.activeElement);
    console.log(`PASS glass DOM (${blockedStorage ? 'blocked' : 'available'} storage): preferences, lens geometry, keyboard, image changes, translation, focus return`);
  } finally { w.close(); }
}

(async () => { await check(false); await check(true); })().catch(error => { console.error(error); process.exitCode = 1; });
