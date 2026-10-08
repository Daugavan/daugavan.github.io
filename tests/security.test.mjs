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
const cache = overrides => ({ v: 5, t: Date.now(), repos: [repo()], stats: { commits: 10 }, statsT: Date.now(), ...overrides });
const cacheKey = 'daugavan_gh_v5';

function runtime(fetchImpl = async () => new Response('[]')) {
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
  const window = { matchMedia: () => ({ matches: true }), setTimeout, clearTimeout };
  const localStorage = {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  const context = vm.createContext({ window, document, localStorage, URL, AbortController,
    TextDecoder, fetch: fetchImpl, console });
  const instrumented = firstClosure.replace("  if (document.readyState === 'loading')", "  window.audit = { normalizeRepos, readCache, renderRepos, gh, getRepositories, getCommitSearchCount, cooldownUntil };\n  if (document.readyState === 'loading')");
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

test('Invalid names, star counts, cache ages and oversized cache are rejected', () => {
  const { api, storage } = runtime();
  for (const name of ['..', '.', '../evil', 'javascript:alert(1)', '"><script>', 'x'.repeat(101)]) {
    assert.throws(() => api.normalizeRepos([repo({ name })]));
  }
  for (const stars of [-1, 1.5, '<img onerror=alert(1)>', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => api.normalizeRepos([repo({ stargazers_count: stars })]));
  }
  for (const data of [cache({ t: Date.now() + 60000 }), cache({ t: Date.now() - 8 * 86400000 }),
    cache({ stats: { commits: 'bad' } }), cache({ repos: [repo({ name: '..' })] }), { v: 1 }]) {
    storage.set(cacheKey, JSON.stringify(data));
    assert.equal(api.readCache(), null);
  }
  storage.set(cacheKey, 'x'.repeat(1500001));
  assert.equal(api.readCache(), null);
  storage.set(cacheKey, JSON.stringify(cache()));
  assert.equal(api.readCache().stats.commits, 10);
});

test('Public API calls omit credentials and referrer and refuse redirects', async () => {
  let observed;
  const { api } = runtime(async (url, options) => {
    observed = { url, options };
    return new Response(JSON.stringify([repo()]));
  });
  assert.equal((await api.getRepositories()).repos.length, 1);
  assert.equal(observed.options.credentials, 'omit');
  assert.equal(observed.options.referrerPolicy, 'no-referrer');
  assert.equal(observed.options.redirect, 'error');
  await assert.rejects(api.gh('https://evil.example/api'), /Unexpected API origin/);
});

test('API byte limit catches oversized and chunked bodies without Content-Length', async () => {
  let aborted;
  const { api } = runtime(async (_, { signal }) => {
    aborted = signal;
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array(1024 * 1024 + 1));
        controller.close();
      }
    }));
  });
  await assert.rejects(api.getRepositories(), /API response too large/);
  assert.equal(aborted.aborted, true);
});

test('Timeout remains active while awaiting the streamed body', async () => {
  const { api } = runtime(async (_, { signal }) => new Response(new ReadableStream({
    start(controller) {
      signal.addEventListener('abort', () => controller.error(new Error('aborted')), { once: true });
    }
  })));
  await assert.rejects(api.gh('https://api.github.com/test', { timeout: 15 }), /aborted/);
});

test('Malformed UTF-8, JSON and unexpected page sizes fail closed', async () => {
  const badBodies = [new Uint8Array([255]), '{', JSON.stringify(Array.from({ length: 101 }, () => repo()))];
  for (const body of badBodies) {
    const { api } = runtime(async () => new Response(body));
    await assert.rejects(api.getRepositories());
  }
});

test('Pagination is bounded and Link destinations are never followed', async () => {
  const calls = [];
  const { api } = runtime(async url => {
    calls.push(url);
    return new Response(JSON.stringify([repo({ name: 'repo-' + calls.length })]), {
      headers: { Link: '<https://evil.example/steal>; rel="next"' }
    });
  });
  const result = await api.getRepositories();
  assert.equal(calls.length, 10);
  assert.equal(result.partial, true);
  assert.ok(calls.every(url => new URL(url).origin === 'https://api.github.com'));
});

test('Rate limits persist a bounded cooldown and incomplete commits are rejected', async () => {
  const { api, storage } = runtime(async () => new Response('{}', {
    status: 429, headers: { 'retry-after': '999999999' }
  }));
  await assert.rejects(api.getRepositories(), /GitHub API 429/);
  const until = Number(storage.get('daugavan_gh_cooldown'));
  assert.ok(until > Date.now());
  assert.ok(until <= Date.now() + 3600000);
  const incomplete = runtime(async () => new Response('{"total_count":10,"incomplete_results":true}'));
  await assert.rejects(incomplete.api.getCommitSearchCount(), /Incomplete commit count/);
});

test('CSP hashes match and all HTML pages omit inline handlers and remote fonts', () => {
  for (const page of ['index.html', '404.html', 'privacy.html']) {
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
  for (const file of ['index.html', '404.html', 'privacy.html', 'styles.css', '404.css']) {
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
