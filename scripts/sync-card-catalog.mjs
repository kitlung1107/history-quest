// Default: local dry-run, no credential access or network. --apply needs separate approval.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { buildCardCatalog, catalogFields } from './card-catalog.mjs';
import { releaseContext, validateReleaseCredentials, assertCurrentRelease } from './card-catalog-release.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
let apply = false, dryRun = false, ci = false, project;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--apply') apply = true;
  else if (args[i] === '--dry-run') dryRun = true;
  else if (args[i] === '--ci') ci = true;
  else if (args[i] === '--project') project = args[++i];
  else throw new Error(`Unknown argument: ${args[i]}`);
}
assert.ok(!(apply && dryRun), 'Choose --apply OR --dry-run');
assert.ok(!ci || apply, '--ci requires --apply');
assert.ok(!(apply && process.env.GITHUB_ACTIONS === 'true' && !ci), 'GitHub writes must use the guarded --ci mode');
const release = ci ? releaseContext(process.env) : null;
const snapshot = buildCardCatalog(JSON.parse(await readFile(path.join(root, 'client/src/content/settings/cards.json'), 'utf8')));
if (!apply) {
  console.log(JSON.stringify({ mode: 'dry-run', network: false, target: 'cardCatalog/current', replacement: snapshot }, null, 2));
} else {
  const emulator = process.env.FIRESTORE_EMULATOR_HOST;
  let request;
  if (emulator) {
    assert.match(emulator, /^(127\.0\.0\.1|localhost):\d+$/, 'Emulator must use loopback');
    assert.ok(['demo-full-card-access','demo-browser-draw-preview'].includes(project), 'Emulator applies are restricted to the named synthetic catalogue/draw projects');
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
    if (release) {
      assert.ok(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'OIDC ADC file is missing');
      validateReleaseCredentials(JSON.parse(await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')), release);
      await assertCurrentRelease(release, process.env.GITHUB_TOKEN);
    }
    // CI uses only OIDC ADC. Manual approved releases can reuse an existing CLI login.
    const require = createRequire(import.meta.url);
    const auth = require('firebase-tools/lib/auth');
    const { requireAuth } = require('firebase-tools/lib/requireAuth');
    const { Client } = require('firebase-tools/lib/apiv2');
    const options = { project, nonInteractive: true };
    if (!release) {
      const account = auth.getGlobalDefaultAccount();
      if (account) auth.setActiveAccount(options, account);
    }
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
  let receipt;
  if (before && isDeepStrictEqual(before.fields, fields)) {
    receipt = { mode: 'unchanged', project, sourceSha256: snapshot.sourceSha256 };
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
    receipt = { mode: 'applied', project, backup, sourceSha256: snapshot.sourceSha256, cards: Object.keys(snapshot.cards).length };
  }
  if (release) {
    receipt.commit = release.sha;
    await mkdir(path.join(root, 'tmp/full-card-access'), { recursive: true });
    await writeFile(path.join(root, 'tmp/full-card-access/catalogue-sync-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  }
  console.log(JSON.stringify(receipt));
}
