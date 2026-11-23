import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import test from 'node:test';
import { projectRoot, publicFiles } from '../scripts/prepare-public.mjs';

const source = readFileSync(join(projectRoot, 'app.js'), 'utf8');
const firstClosure = source.slice(0, source.indexOf('\n})();') + 6);
const html = readFileSync(join(projectRoot, 'index.html'), 'utf8');
const repo = overrides => ({ name: 'safe-repo', stargazers_count: 3, description: '', ...overrides });

function runtime(repositories = { version: 1, retrieved: new Date().toISOString(), repos: [repo()] }) {
  const storage = new Map();
  const element = () => ({
    children: [], attributes: {}, style: {}, classList: { toggle() {} },
    setAttribute(key, value) { this.attributes[key] = value; },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; }
  });
  const repos = element();
  const count = element();
  const document = {
    readyState: 'loading',
    getElementById: id => id === 'repos' ? repos : id === 'repoCount' ? count : null,
    createElement: element, addEventListener() {}
  };
  const window = { portfolioStatistics: { repositories }, matchMedia: () => ({ matches: true }), setTimeout, clearTimeout };
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  const context = vm.createContext({ window, document, localStorage, URL, AbortController,
    TextDecoder, console });
  const instrumented = firstClosure.replace("  if (document.readyState === 'loading')", "  window.audit = { normalizeRepos, renderRepos, getRepositories };\n  if (document.readyState === 'loading')");
  vm.runInContext(instrumented, context);
  return { api: window.audit, storage, repos, count };
}

test('API and cached text cannot insert markup or change repository destinations', () => {
  const { api, repos } = runtime();
  const payload = `"><img src=x onerror="window.pwned=true"><script>alert(1)</script>`;
  const records = api.normalizeRepos([repo({ description: payload, language: payload,
    topics: [payload], updated_at: payload, html_url: 'javascript:alert(1)' })]);
  api.renderRepos(records);
  const anchor = repos.children[0];
  assert.equal(anchor.href, 'https://github.com/Daugavan/safe-repo');
  assert.equal(anchor.rel, 'noopener noreferrer');
  assert.ok(anchor.innerHTML.includes('&lt;img'));
  assert.ok(anchor.innerHTML.includes('data-lang="&quot;&gt;'));
  assert.ok(!anchor.innerHTML.includes('<img'));
  assert.ok(!anchor.innerHTML.includes('<script'));
  assert.ok(!anchor.innerHTML.includes('datetime="">'));
});

test('Invalid repository names and star counts are rejected', () => {
  const { api } = runtime();
  for (const name of ['..', '.', '../evil', 'javascript:alert(1)', '"><script>', 'x'.repeat(101)]) {
    assert.throws(() => api.normalizeRepos([repo({ name })]));
  }
  for (const stars of [-1, 1.5, '<img onerror=alert(1)>', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => api.normalizeRepos([repo({ stargazers_count: stars })]));
  }
  assert.throws(() => api.normalizeRepos(Array.from({ length: 1001 }, () => repo())));
});

test('Published repositories need no fetch capability, browser cache or API quota', async () => {
  const { api } = runtime();
  assert.equal((await api.getRepositories()).repos.length, 1);
  for (const repositories of [null, {}, { version: 1, retrieved: 'invalid', repos: [] },
    { version: 1, retrieved: '2099-01-01', repos: [] },
    { version: 1, retrieved: new Date().toISOString(), repos: [{}] }]) {
    await assert.rejects(runtime(repositories).api.getRepositories());
  }
  assert.ok(!/\bfetch\(/.test(source));
  assert.ok(!/\bfetch\(/.test(readFileSync(join(projectRoot, 'activity.js'), 'utf8')));
  assert.ok(html.includes("connect-src 'self'"));
});

test('CSP hashes match and all HTML pages omit inline handlers and remote fonts', () => {
  for (const page of ['index.html', '404.html', 'privacy.html', 'cookies.html']) {
    const text = readFileSync(join(projectRoot, page), 'utf8');
    assert.ok(text.includes("default-src 'none'"));
    assert.ok(text.includes("base-uri 'none'"));
    assert.ok(text.includes("form-action 'none'"));
    assert.ok(!/\son\w+\s*=/i.test(text));
    assert.ok(!/fonts\.(googleapis|gstatic)\.com/.test(text));
    for (const match of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) {
      if (!match[1].trim()) continue;
      assert.ok(text.includes('sha256-' + createHash('sha256').update(match[1]).digest('base64')));
    }
  }
  assert.ok(!readFileSync(join(projectRoot, 'assets/app.js'), 'utf8').includes('fetch('));
});

test('Publication includes every local HTML/CSS resource and all gallery variants', () => {
  const allowed = new Set(publicFiles);
  for (const file of ['index.html', '404.html', 'privacy.html', 'cookies.html', 'styles.css', '404.css']) {
    const text = readFileSync(join(projectRoot, file), 'utf8');
    const refs = file.endsWith('.css')
      ? [...text.matchAll(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/g)].map(match => match[1] ?? match[2] ?? match[3])
      : [...text.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
    for (const ref of refs) {
      if (/^(https?:|data:|#)/.test(ref) || ref === './' || ref === '/') continue;
      const local = decodeURIComponent(ref.split(/[?#]/)[0].replace(/^\//, ''));
      if (!local) continue;
      assert.ok(allowed.has(local), `${file} references excluded ${local}`);
      assert.ok(existsSync(join(projectRoot, local)));
    }
  }
  assert.ok(publicFiles.every(file => !/attachments|assets\/app|tests|scripts|report|\.env/.test(file)));
  assert.equal(new Set(publicFiles).size, publicFiles.length);
});
