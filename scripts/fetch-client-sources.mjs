import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { loadClients, projectRoot } from './clients.mjs';

function checkedDirectory(path) {
  const parent = dirname(path);
  if (parent !== path) checkedDirectory(parent);
  if (existsSync(path)) {
    if (lstatSync(path).isSymbolicLink() || !lstatSync(path).isDirectory()) throw new Error('Unsafe client source directory');
  } else mkdirSync(path);
}

export async function fetchClientSources({ token, clients = loadClients(), overrides = {},
  destinationRoot = join(projectRoot, '.client-sources'), fetchImpl = fetch } = {}) {
  if (!token) throw new Error('CLIENT_REPO_READ_TOKEN is required to read private client repositories');
  const destination = resolve(destinationRoot);
  const withinProject = relative(resolve(projectRoot), destination);
  if (!withinProject || isAbsolute(withinProject) || withinProject.startsWith('..' + sep) || withinProject === '..') {
    throw new Error('Client sources must use a dedicated directory inside the project');
  }
  for (const [slug, ref] of Object.entries(overrides)) {
    if (!clients.some(client => client.slug === slug) || !/^[a-f0-9]{40}$/.test(ref)) {
      throw new Error('Rollback requires a registered client and a full commit SHA');
    }
  }
  const request = async (path, raw = false) => {
    const response = await fetchImpl(`https://api.github.com/${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28' }, redirect: 'error', signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) throw new Error(`Client source request failed (HTTP ${response.status})`);
    return raw ? Buffer.from(await response.arrayBuffer()) : response.json();
  };
  const revisions = {};
  for (const client of clients) {
    const commit = await request(`repos/${client.repository}/commits/${overrides[client.slug] ?? client.branch}`);
    if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error('Invalid source commit');
    const tree = await request(`repos/${client.repository}/git/trees/${commit.sha}?recursive=1`);
    if (tree.truncated || !Array.isArray(tree.tree)) throw new Error('Incomplete client source tree');
    const entries = new Map(tree.tree.map(entry => [entry.path, entry]));
    const files = [];
    let total = 0;
    for (const file of client.files) {
      const entry = entries.get(file);
      if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode) ||
          !/^[a-f0-9]{40}$/.test(entry.sha) || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > 10 * 1024 * 1024) {
        throw new Error(`${client.slug}: missing, oversized or unsafe publication file: ${file}`);
      }
      total += entry.size;
      if (total > 100 * 1024 * 1024) throw new Error('Client publication exceeds 100 MiB');
      const bytes = await request(`repos/${client.repository}/git/blobs/${entry.sha}`, true);
      const hash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
      if (bytes.length !== entry.size || hash !== entry.sha) throw new Error('Client source integrity check failed');
      files.push([file, bytes]);
    }
    // Download and verify the complete client before writing its local source cache.
    for (const [file, bytes] of files) {
      const target = join(destination, client.slug, file);
      checkedDirectory(dirname(target));
      if (existsSync(target) && (lstatSync(target).isSymbolicLink() || !lstatSync(target).isFile())) throw new Error('Unsafe source file');
      writeFileSync(target, bytes);
    }
    revisions[client.slug] = commit.sha;
    console.log(`Fetched ${client.slug} at ${commit.sha}`);
  }
  return revisions;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { client: { type: 'string' }, ref: { type: 'string' } } });
  if (Boolean(values.client) !== Boolean(values.ref)) throw new Error('Use --client and --ref together');
  await fetchClientSources({ token: process.env.CLIENT_REPO_READ_TOKEN,
    overrides: values.client ? { [values.client]: values.ref } : {} });
}
