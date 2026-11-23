import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fetchRepositories, normalizeRepositories, statisticsScript } from '../scripts/update-repositories.mjs';

const repo = overrides => ({ name: 'public-repo', private: false, stargazers_count: 12, ...overrides });

test('Publisher authenticates bounded requests and never follows supplied Link URLs', async () => {
  const calls = [];
  const data = await fetchRepositories(async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify([repo({ name: 'repo-' + calls.length })]), {
      headers: calls.length === 1 ? { Link: '<https://evil.example/>; rel="next"' } : {}
    });
  }, 'test-only-token');
  assert.equal(data.repos.length, 2);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.url.startsWith('https://api.github.com/users/Daugavan/repos?')));
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-only-token');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal('private' in data.repos[0], false);
  let attempts = 0;
  await assert.rejects(fetchRepositories(async () => {
    attempts++;
    return new Response(JSON.stringify([repo()]), { headers: { Link: '<https://evil.example/>; rel="next"' } });
  }), /pagination limit/);
  assert.equal(attempts, 10);
});

test('Failed, private, malformed or incomplete fetches do not produce a new snapshot', async () => {
  for (const status of [403, 429, 500]) {
    let attempts = 0;
    await assert.rejects(fetchRepositories(async () => { attempts++; return new Response('{}', { status }); }));
    assert.equal(attempts, 1);
  }
  for (const body of ['{', '{}', JSON.stringify([repo({ private: true })]), JSON.stringify([repo({ stargazers_count: -1 })]),
    JSON.stringify([repo(), repo()]), JSON.stringify(Array.from({ length: 101 }, () => repo())), ' '.repeat(2 * 1024 * 1024 + 1)]) {
    await assert.rejects(fetchRepositories(async () => new Response(body)));
  }
  assert.throws(() => normalizeRepositories([repo({ name: '../secret' })]));
  assert.throws(() => normalizeRepositories([repo({ name: undefined })]));
});

test('Generated browser data contains only normalized public fields and safely preserves text', () => {
  const attack = '</script><script>globalThis.pwned=true</script>';
  const repositories = { version: 1, retrieved: new Date().toISOString(),
    repos: normalizeRepositories([repo({ description: attack, secret: 'must-not-publish' })]) };
  const activity = JSON.parse(readFileSync(new URL('../activity-snapshot.json', import.meta.url)));
  const script = statisticsScript(repositories, activity);
  const context = vm.createContext({ window: {} });
  vm.runInContext(script, context);
  assert.equal(context.window.portfolioStatistics.repositories.repos[0].description, attack);
  assert.equal(context.pwned, undefined);
  assert.ok(!script.includes('must-not-publish'));
  assert.ok(!script.includes('</script>'));
});
