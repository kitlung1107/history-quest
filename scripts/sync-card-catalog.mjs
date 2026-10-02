// Default: local dry-run, no credential access or network. --apply needs separate approval.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { buildCardCatalog, catalogFields } from './card-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
let apply = false, dryRun = false, project;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--apply') apply = true;
  else if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--project') project = args[++i];
  else throw new Error(`Unknown argument: ${args[i]}`);
}
assert.ok(!(apply && dryRun), 'Choose --apply OR --dry-run');
const snapshot = buildCardCatalog(JSON.parse(await readFile(path.join(root, 'client/src/content/settings/cards.json'), 'utf8')));
if (!apply) {
  console.log(JSON.stringify({ mode: 'dry-run', network: false, target: 'cardCatalog/current', replacement: snapshot }, null, 2));
} else {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  let request;
  if (emulator) {
    assert.match(emulator, /^(127\.0\.0\.1|localhost):\d+$/, 'Emulator must use loopback');
    assert.equal(project, 'demo-full-card-access', 'Emulator applies are restricted to demo-full-card-access');
    request = async (method, resource, body) => {
      const response = await fetch(`http://${emulator}/v1/${resource}`, {
        method, headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (response.status === 404 && method === 'GET') return null;
      if (!response.ok) throw new Error(`Emulator ${method} failed: ${response.status}`);
      return response.json();
    };
  } else {
    assert.equal(project, 'history-discovery-center', 'Explicit --project history-discovery-center is required');
    // Reuse the already-established Firebase CLI identity. Never create credentials.
    const require = createRequire(import.meta.url);
    const auth = require('firebase-tools/lib/auth');
    const { requireAuth } = require('firebase-tools/lib/requireAuth');
    const { Client } = require('firebase-tools/lib/apiv2');
    const options = { project, nonInteractive: true };
    auth.setActiveAccount(options, auth.getGlobalDefaultAccount());
    await requireAuth(options);
    const api = new Client({ auth: true, apiVersion: 'v1', urlPrefix: 'https://firestore.googleapis.com' });
    request = async (method, resource, body) => {
      try {
        const response = method === 'GET' ? await api.get(resource) : await api.post(resource, body);
        return response.body;
      } catch (error) {
        if (method === 'GET' && error.status === 404) return null;
        throw error;
      }
    };
  }
  const base = `projects/${project}/databases/(default)/documents`;
  const name = `${base}/cardCatalog/current`;
  const fields = catalogFields(snapshot);
  const before = await request('GET', name);
  if (before && isDeepStrictEqual(before.fields, fields)) {
    console.log(JSON.stringify({ mode: 'unchanged', project, sourceSha256: snapshot.sourceSha256 }));
  } else {
    const backupDir = path.join(root, 'tmp/full-card-access');
    await mkdir(backupDir, { recursive: true });
    const backup = path.join(backupDir, `catalogue-before-${Date.now()}.json`);
    await writeFile(backup, JSON.stringify({ project, document: before }, null, 2) + '\n', { flag: 'wx' });
    // Atomic replacement removes stale IDs too. CAS refuses a concurrent publisher.
    await request('POST', `${base}:commit`, { writes: [{
      update: { name, fields },
      currentDocument: before ? { updateTime: before.updateTime } : { exists: false },
    }] });
    const after = await request('GET', name);
    assert.deepEqual(after?.fields, fields, 'Published catalogue verification failed');
    console.log(JSON.stringify({ mode: 'applied', project, backup, sourceSha256: snapshot.sourceSha256, cards: Object.keys(snapshot.cards).length }));
  }
}
