import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GOOGLE_READ_ONLY_SCOPES,
  createVercelIdentityPoolClient,
  serviceAccountImpersonationUrl,
  workloadIdentityAudience
} from '../dist/auth/google-runtime.js';

const config = {
  mode: 'vercel_oidc',
  projectNumber: '123456789012',
  workloadIdentityPoolId: 'vercel-pool',
  workloadIdentityProviderId: 'vercel-provider',
  serviceAccountEmail: 'yos-reader@example-project.iam.gserviceaccount.com'
};

test('builds fixed Google WIF audience and impersonation URL', () => {
  assert.equal(
    workloadIdentityAudience(config),
    '//iam.googleapis.com/projects/123456789012/locations/global/workloadIdentityPools/vercel-pool/providers/vercel-provider'
  );
  assert.equal(
    serviceAccountImpersonationUrl(config.serviceAccountEmail),
    'https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/yos-reader@example-project.iam.gserviceaccount.com:generateAccessToken'
  );
});

test('creates an IdentityPoolClient with read-only scopes and request token supplier', async () => {
  const client = createVercelIdentityPoolClient(config, 'aaa.bbb.ccc');
  assert.deepEqual(client.scopes, [...GOOGLE_READ_ONLY_SCOPES]);
  assert.equal(client.getServiceAccountEmail(), config.serviceAccountEmail);
  assert.equal(await client.retrieveSubjectToken(), 'aaa.bbb.ccc');
});

test('rejects invalid service account emails and malformed Vercel tokens', () => {
  assert.throws(() => serviceAccountImpersonationUrl('not-an-email'), /invalid/);
  assert.throws(() => createVercelIdentityPoolClient(config, 'not-jwt'), /format/);
});
