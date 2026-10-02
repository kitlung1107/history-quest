import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

export const RELEASE_PROJECT = 'history-discovery-center';
export const RELEASE_REPOSITORY = 'kitlung1107/history-quest';
export const RELEASE_WORKFLOW = `${RELEASE_REPOSITORY}/.github/workflows/deploy-pages.yml@refs/heads/main`;

/** Fail closed before obtaining Google credentials. No defaults enable publication. */
export function releaseContext(env) {
  assert.equal(env.CARD_CATALOG_SYNC_ENABLED, 'true', 'Catalogue auto-sync is awaiting explicit environment approval; Pages release stopped');
  assert.equal(env.GITHUB_ACTIONS, 'true', 'CI sync requires GitHub Actions');
  assert.equal(env.GITHUB_REPOSITORY, RELEASE_REPOSITORY, 'Unexpected repository');
  assert.equal(env.GITHUB_REF, 'refs/heads/main', 'Only main can publish the catalogue');
  assert.equal(env.GITHUB_WORKFLOW_REF, RELEASE_WORKFLOW, 'Unexpected release workflow');
  assert.ok(['push', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME), 'Only a main push or explicit main release is allowed');
  assert.match(env.GITHUB_SHA || '', /^[a-f0-9]{40}$/, 'Missing commit SHA');
  assert.ok(!env.FIRESTORE_EMULATOR_HOST, 'Production CI must not use an emulator');
  assert.ok(!env.FIREBASE_TOKEN, 'Personal Firebase tokens are forbidden in CI');
  assert.match(env.CARD_CATALOG_WIF_PROVIDER || '', /^projects\/\d+\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/, 'Missing or invalid approved WIF provider');
  assert.match(env.CARD_CATALOG_SERVICE_ACCOUNT || '', /^[a-z][a-z0-9-]{4,28}[a-z0-9]@history-discovery-center\.iam\.gserviceaccount\.com$/, 'Missing or invalid dedicated sync service account');
  return {
    sha: env.GITHUB_SHA, repository: RELEASE_REPOSITORY, project: RELEASE_PROJECT,
    provider: env.CARD_CATALOG_WIF_PROVIDER, serviceAccount: env.CARD_CATALOG_SERVICE_ACCOUNT,
  };
}

/** Reject long-lived keys and credentials for any other provider/service account. */
export function validateReleaseCredentials(credentials, context) {
  assert.equal(credentials.type, 'external_account', 'CI requires OIDC external-account ADC, never a service-account key');
  assert.equal(credentials.audience, `//iam.googleapis.com/${context.provider}`, 'ADC provider does not match the approved provider');
  assert.equal(credentials.subject_token_type, 'urn:ietf:params:oauth:token-type:jwt', 'Expected OIDC subject token');
  assert.equal(credentials.token_url, 'https://sts.googleapis.com/v1/token', 'Unexpected token exchange endpoint');
  const impersonation = new URL(credentials.service_account_impersonation_url);
  assert.equal(impersonation.origin, 'https://iamcredentials.googleapis.com', 'Unexpected impersonation endpoint');
  assert.equal(decodeURIComponent(impersonation.pathname), `/v1/projects/-/serviceAccounts/${context.serviceAccount}:generateAccessToken`, 'ADC service account does not match the approved account');
  assert.equal(impersonation.search, '', 'Unexpected impersonation query');
}

/** Serialized releases still need this check to reject a rerun of an older commit. */
export async function assertCurrentRelease(context, token, fetchImpl = fetch) {
  assert.ok(token, 'Read-only GitHub job token is required to verify main');
  const response = await fetchImpl(`https://api.github.com/repos/${RELEASE_REPOSITORY}/git/ref/heads/main`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    signal: AbortSignal.timeout(15_000), redirect: 'error',
  });
  assert.equal(response.status, 200, 'Cannot verify current main; release stopped');
  const ref = await response.json();
  assert.equal(ref.ref, 'refs/heads/main', 'Unexpected GitHub ref response');
  assert.equal(ref.object?.type, 'commit', 'Unexpected GitHub ref object');
  assert.equal(ref.object.sha, context.sha, 'This run is stale; release current main instead');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const context = releaseContext(process.env);
  await assertCurrentRelease(context, process.env.GITHUB_TOKEN);
  console.log(`Catalogue release preflight passed for ${context.sha}`);
}
