import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { clientPublication, loadClients, previewHtml, projectRoot, renderClientDirectory } from '../scripts/clients.mjs';
import { preparePublic, publicFiles } from '../scripts/prepare-public.mjs';
import { createPreviewServer } from '../scripts/preview.mjs';

const evidence = join(projectRoot, 'reports/client-publication');
mkdirSync(evidence, { recursive: true });
const fixture = () => mkdtempSync(join(evidence, 'unit-'));
const save = (root, path, bytes) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), bytes);
};
const client = { slug: 'demo', repository: 'Daugavan/demo', branch: 'main', files: ['index.html', 'styles.css'] };
const page = '<!doctype html><html><head><meta name="robots" content="index, follow"><link rel="stylesheet" href="styles.css"></head><body>Client</body></html>';

test('registry permits explicit website files and rejects invalid paths, duplicate clients and internal material', () => {
  assert.equal(loadClients()[0].slug, 'cocothai');
  const root = fixture();
  const path = join(root, 'registry.json');
  const read = clients => {
    writeFileSync(path, JSON.stringify({ version: 1, clients }));
    return loadClients(path);
  };
  assert.deepEqual(read([client]), [client]);
  for (const file of ['../index.html', '/index.html', 'webp/../../secret.js', '.env.js', 'tests/private.js', 'README.md', 'x\\secret.js']) {
    assert.throws(() => read([{ ...client, files: ['index.html', file] }]));
  }
  assert.throws(() => read([client, client]));
  assert.throws(() => read([{ ...client, slug: '../demo' }]));
  assert.throws(() => read([{ ...client, files: ['index.html', 'index.html'] }]));
});

test('checked-in preview pages and assets are copied without rewriting the source', () => {
  const root = fixture();
  save(root, 'demo/index.html', previewHtml(page));
  save(root, 'demo/styles.css', 'body { color: red; }');
  const output = clientPublication(root, [client]);
  const html = output.get('klienter/demo/index.html').toString();
  assert.equal((html.match(/name="robots"/g) ?? []).length, 1);
  assert.match(html, /content="noindex, nofollow"/);
  assert.equal(html.split('<body>')[1], page.split('<body>')[1]);
  assert.equal(readFileSync(join(root, 'demo/index.html'), 'utf8'), previewHtml(page));
  assert.equal(output.get('klienter/demo/styles.css').toString(), 'body { color: red; }');
  assert.doesNotMatch(previewHtml('<head><meta content="index" name=\'googlebot\'></head>'), /googlebot/);
});

test('client directory follows the registry, escapes labels and prevents indexing', () => {
  const template = readFileSync(join(projectRoot, 'klienter/index.html'), 'utf8');
  const html = renderClientDirectory(template, [{ ...client, label: 'Demo & <script>unsafe</script>' }, { ...client, slug: 'second' }]);
  assert.match(html, /href="\/klienter\/demo\/"/);
  assert.match(html, /Demo &amp; &lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.match(html, /href="\/klienter\/second\/">second</);
  assert.doesNotMatch(html, /href="\/klienter\/cocothai\/"/);
  assert.match(html, /content="noindex, nofollow"/);
  assert.throws(() => renderClientDirectory('<html></html>'), /Missing client directory marker/);
});

test('missing resources and links escaping the client directory block publication', () => {
  const root = fixture();
  save(root, 'demo/styles.css', '');
  for (const reference of ['missing.jpg', '/styles.css', '../index.html', '%2e%2e/index.html']) {
    save(root, 'demo/index.html', page.replace('styles.css', reference));
    assert.throws(() => clientPublication(root, [client]), /excluded resource|escapes client/);
  }
  save(root, 'demo/index.html', page.replace('</head>', '<link rel="preload" imagesrcset="missing.webp 640w"></head>'));
  assert.throws(() => clientPublication(root, [client]), /excluded resource/);
  save(root, 'demo/index.html', page);
  save(root, 'demo/styles.css', 'body { background: url(missing.jpg); }');
  assert.throws(() => clientPublication(root, [client]), /excluded resource/);
});

test('junctions or symlinks in source ancestors are rejected', () => {
  const root = fixture();
  save(root, 'real/demo/index.html', page);
  save(root, 'real/demo/styles.css', '');
  symlinkSync(join(root, 'real'), join(root, 'alias'), 'junction');
  assert.throws(() => clientPublication(join(root, 'alias'), [client]), /Symlink rejected/);
});

test('full package preserves every portfolio byte, includes only client allowlist and leaves output untouched on failure', () => {
  const root = fixture();
  const sources = join(root, 'sources');
  for (const entry of loadClients()) {
    for (const file of entry.files) save(sources, `${entry.slug}/${file}`, file.endsWith('.html') ? '<html><head></head><body>Test</body></html>' : 'asset');
    save(sources, `${entry.slug}/README.md`, 'private documentation');
  }
  const output = join(root, 'output');
  preparePublic({ includeClients: true, sourceRoot: sources, output });
  for (const file of publicFiles) {
    const original = readFileSync(join(projectRoot, file));
    const expected = file === 'klienter/index.html' ? Buffer.from(renderClientDirectory(original.toString('utf8'))) : original;
    assert.deepEqual(readFileSync(join(output, file)), expected);
  }
  assert.ok(existsSync(join(output, 'klienter/cocothai/index.html')));
  assert.ok(!existsSync(join(output, 'klienter/cocothai/README.md')));
  save(output, 'unexpected.txt', 'preserved');
  assert.throws(() => preparePublic({ includeClients: true, sourceRoot: sources, output }), /Unexpected publication file/);
  const previous = readFileSync(join(output, 'index.html'));
  assert.throws(() => preparePublic({ includeClients: true, sourceRoot: join(root, 'absent'), output }));
  assert.deepEqual(readFileSync(join(output, 'index.html')), previous);
});

test('preview serves the client directory and pages, redirects missing slash, handles HEAD and unknown URLs', async () => {
  const root = fixture();
  save(root, '404.html', 'Not found');
  save(root, 'klienter/index.html', 'Client list');
  save(root, 'klienter/cocothai/index.html', page);
  save(root, 'klienter/cocothai/meny.html', 'Menu');
  const server = createPreviewServer(root, { includeClients: true }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const redirect = await fetch(origin + '/klienter/cocothai?test=1', { redirect: 'manual' });
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.get('location'), '/klienter/cocothai/?test=1');
    assert.equal(await (await fetch(origin + '/klienter/cocothai/')).text(), page);
    assert.equal(await (await fetch(origin + '/klienter/cocothai/meny.html')).text(), 'Menu');
    const head = await fetch(origin + '/klienter/cocothai/', { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    assert.equal(await (await fetch(origin + '/klienter')).text(), 'Client list');
    for (const path of ['/klienter/unknown/', '/klienter/cocothai/README.md', '/klienter/cocothai/%2e%2e%2fsecret']) {
      assert.equal((await fetch(origin + path)).status, 404);
    }
    assert.equal((await fetch(origin + '/%ZZ')).status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});


test('the complete checked-in client works in the default build without credentials or nested Git metadata', () => {
  const client = loadClients()[0];
  assert.match(client.sourceCommit, /^[a-f0-9]{40}$/);
  const directory = join(projectRoot, 'klienter', client.slug);
  assert.ok(!existsSync(join(directory, '.git')));
  for (const file of ['README.md', '.htaccess', 'tests/glass-review.cjs']) assert.ok(existsSync(join(directory, file)));
  const output = join(fixture(), 'default-output');
  preparePublic({ output });
  assert.ok(existsSync(join(output, 'klienter/cocothai/menu-01-po-peak-thud.jpg')));
  assert.match(readFileSync(join(output, 'klienter/cocothai/index.html'), 'utf8'), /content="noindex, nofollow"/);
});
