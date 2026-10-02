import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { releaseContext, validateReleaseCredentials, assertCurrentRelease, RELEASE_REPOSITORY, RELEASE_WORKFLOW } from './card-catalog-release.mjs';

const sha = 'a'.repeat(40);
const env = {
  CARD_CATALOG_SYNC_ENABLED: 'true', GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: RELEASE_REPOSITORY,
  GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: RELEASE_WORKFLOW, GITHUB_EVENT_NAME: 'push', GITHUB_SHA: sha,
  CARD_CATALOG_WIF_PROVIDER: 'projects/123456789/locations/global/workloadIdentityPools/card-sync/providers/github',
  CARD_CATALOG_SERVICE_ACCOUNT: 'card-catalog-publisher@history-discovery-center.iam.gserviceaccount.com',
};
const credentials = {
  type: 'external_account', audience: `//iam.googleapis.com/${env.CARD_CATALOG_WIF_PROVIDER}`,
  subject_token_type: 'urn:ietf:params:oauth:token-type:jwt', token_url: 'https://sts.googleapis.com/v1/token',
  service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${env.CARD_CATALOG_SERVICE_ACCOUNT}:generateAccessToken`,
};

test('approved exact main workflow context is required; disabled/missing config cannot silently publish', () => {
  assert.equal(releaseContext(env).sha, sha);
  assert.equal(releaseContext({ ...env, GITHUB_EVENT_NAME: 'workflow_dispatch' }).sha, sha);
  for (const override of [
    { CARD_CATALOG_SYNC_ENABLED: undefined }, { CARD_CATALOG_SYNC_ENABLED: 'false' }, { CARD_CATALOG_SYNC_ENABLED: '1' },
    { GITHUB_ACTIONS: 'false' }, { GITHUB_REPOSITORY: 'someone/another-repo' },
    { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_REF: 'refs/tags/main' },
    { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_EVENT_NAME: 'pull_request_target' },
    { GITHUB_WORKFLOW_REF: RELEASE_WORKFLOW.replace('deploy-pages.yml', 'other.yml') },
    { GITHUB_SHA: 'main' }, { FIRESTORE_EMULATOR_HOST: '127.0.0.1:8096' }, { FIREBASE_TOKEN: 'do-not-use' },
    { CARD_CATALOG_WIF_PROVIDER: '' }, { CARD_CATALOG_SERVICE_ACCOUNT: 'publisher@other-project.iam.gserviceaccount.com' },
  ]) assert.throws(() => releaseContext({ ...env, ...override }), JSON.stringify(override));
});

test('CI accepts only short-lived OIDC ADC matching the explicitly approved publisher', () => {
  const context = releaseContext(env);
  assert.doesNotThrow(() => validateReleaseCredentials(credentials, context));
  for (const override of [
    { type: 'service_account' }, { type: 'authorized_user' }, { audience: '//iam.googleapis.com/other' },
    { token_url: 'https://attacker.test/token' }, { subject_token_type: 'access_token' },
    { service_account_impersonation_url: credentials.service_account_impersonation_url.replace('iamcredentials.googleapis.com', 'attacker.test') },
    { service_account_impersonation_url: credentials.service_account_impersonation_url.replace('card-catalog-publisher@', 'different-publisher@') },
    { service_account_impersonation_url: `${credentials.service_account_impersonation_url}?other=true` },
  ]) assert.throws(() => validateReleaseCredentials({ ...credentials, ...override }, context));
});

test('latest-main check uses the exact repository, rejects stale runs and fails closed on unavailable GitHub', async () => {
  const context = releaseContext(env);
  let request;
  await assertCurrentRelease(context, 'synthetic-job-token', async (url, options) => {
    request = { url, options };
    return { status: 200, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha } }) };
  });
  assert.equal(request.url, `https://api.github.com/repos/${RELEASE_REPOSITORY}/git/ref/heads/main`);
  assert.equal(request.options.redirect, 'error');
  for (const response of [
    { status: 403 }, { status: 503 },
    { status: 200, json: async () => ({ ref: 'refs/heads/main', object: { type: 'commit', sha: 'b'.repeat(40) } }) },
    { status: 200, json: async () => ({ ref: 'refs/tags/main', object: { type: 'commit', sha } }) },
  ]) await assert.rejects(assertCurrentRelease(context, 'synthetic-job-token', async () => response));
  await assert.rejects(assertCurrentRelease(context, undefined, async () => { throw new Error('must not be called'); }));
});

test('CLI cannot apply from GitHub without guarded mode or approval; default remains offline', () => {
  const clean = { ...process.env, ...env, FIREBASE_TOKEN: '', FIRESTORE_EMULATOR_HOST: '', GOOGLE_APPLICATION_CREDENTIALS: 'nonexistent-adc-file' };
  for (const [args, override, error] of [
    [['--apply', '--project', 'history-discovery-center'], {}, /guarded --ci/],
    [['--ci', '--apply', '--project', 'history-discovery-center'], { CARD_CATALOG_SYNC_ENABLED: '' }, /awaiting explicit environment approval/],
    [['--ci', '--dry-run'], {}, /--ci requires --apply/],
  ]) {
    const result = spawnSync(process.execPath, ['scripts/sync-card-catalog.mjs', ...args], { encoding: 'utf8', env: { ...clean, ...override } });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, error);
  }
  const result = spawnSync(process.execPath, ['scripts/sync-card-catalog.mjs', '--dry-run'], { encoding: 'utf8', env: clean });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).network, false);
});

test('Pages release is serialized and depends on preflight, pinned auth and verified sync; no rule deployment or key secrets', () => {
  const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');
  const release = workflow.slice(workflow.indexOf('\n  deploy:'));
  const steps = ['Check release approval and current main', 'Authenticate approved catalogue publisher', 'Sync and verify trusted card catalogue', 'Deploy to GitHub Pages'];
  let last = -1;
  for (const step of steps) { const index = release.indexOf(`name: ${step}`); assert.ok(index > last); last = index; }
  assert.match(workflow, /cancel-in-progress: false/);
  assert.match(release, /--ci --apply --project history-discovery-center/);
  assert.match(release, /google-github-actions\/auth@[a-f0-9]{40}/);
  assert.match(release, /ref: \$\{\{ github\.sha \}\}/);
  assert.match(release, /--frozen-lockfile --ignore-scripts/);
  assert.doesNotMatch(workflow, /continue-on-error|secrets\.|firebase deploy|credentials_json/);
  const build = workflow.slice(workflow.indexOf('\n  build:'), workflow.indexOf('\n  deploy:'));
  assert.doesNotMatch(build, /id-token:|pages: write|google-github-actions\/auth/);
  const role = readFileSync('docs/deployment/card-catalog-sync-role.yaml', 'utf8');
  assert.deepEqual([...role.matchAll(/^  - (.+)$/gm)].map(m => m[1]), ['datastore.entities.get', 'datastore.entities.create', 'datastore.entities.update']);
});
