// Uses an existing jsdom installation supplied as an optional package path.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { JSDOM } = require(process.argv[2] ? path.resolve(process.argv[2]) : 'jsdom');
const root = path.resolve(__dirname, '..');
const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), {
  url: 'https://daugavan.github.io/', runScripts: 'outside-only'
});
const w = dom.window;
w.matchMedia = () => ({ matches: true, addEventListener() {} });
w.requestAnimationFrame = f => setTimeout(() => f(1000), 0);
w.cancelAnimationFrame = clearTimeout;
w.TextDecoder = TextDecoder;
w.AbortController = AbortController;
w.fetch = async () => new Response('[]');
w.HTMLImageElement.prototype.decode = () => Promise.reject(new Error('Offline image fixture'));
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
w.HTMLDialogElement.prototype.close = function () {
  this.removeAttribute('open'); this.dispatchEvent(new w.Event('close'));
};
const attack = '"><img src=x onerror="window.pwned=true"><script>alert(1)</script>';
w.localStorage.setItem('lang', 'en');
w.localStorage.setItem('daugavan_gh_v5', JSON.stringify({
  v: 5, t: Date.now(), statsT: Date.now(), stats: { commits: 10 },
  repos: [{ name: 'safe-repo', stargazers_count: 3, description: attack,
    language: attack, topics: [attack], updated_at: attack, html_url: 'javascript:alert(1)' }]
}));
w.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
setTimeout(() => {
  try {
    assert.equal(w.document.querySelectorAll('.gallery-spread[role=button]').length, 6);
    assert.equal(w.document.querySelectorAll('.repo img, .repo script').length, 0);
    assert.equal(w.document.querySelector('.repo').href, 'https://github.com/Daugavan/safe-repo');
    assert.ok(w.document.querySelector('.repo-desc').textContent.includes('<img'));
    assert.equal(w.pwned, undefined);
    w.document.querySelector('.gallery-spread').click();
    assert.ok(w.document.querySelector('dialog[open]'));
    w.document.querySelector('.g-lightbox-next').click();
    assert.ok(w.document.querySelector('figcaption').textContent.includes('2 / 6'));
    w.document.querySelector('.g-lightbox-close').click();
    assert.equal(w.document.querySelector('dialog'), null);
    w.document.querySelector('#langSwitch').click();
    assert.equal(w.document.documentElement.lang, 'sv-SE');
    assert.equal(w.document.querySelector('[data-i18n=sitePrivacy]').textContent, 'Sidans integritet');
    console.log('DOM regression passed: injected cache stays text; fixed URLs; gallery; navigation; close; language; privacy link.');
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { w.close(); }
}, 100);
