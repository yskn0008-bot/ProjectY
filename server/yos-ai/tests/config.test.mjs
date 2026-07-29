import test from 'node:test';
import assert from 'node:assert/strict';
import { loadYosRuntimeConfig } from '../dist/config.js';

const base = {
  OPENAI_API_KEY: 'secret',
  GOOGLE_CLIENT_ID: 'client',
  YOS_ALLOWED_ORIGINS: 'https://yos.example,https://app.example',
  GOOGLE_ALLOWED_SUBJECT_HASH: 'hash',
  GOOGLE_AUTH_MODE: 'vercel_oidc',
  GCP_PROJECT_NUMBER: '123456789012',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
  GCP_SERVICE_ACCOUNT_EMAIL: 'service@example.iam.gserviceaccount.com',
  YOS_LAW_DOCUMENT_ID: 'abcdefghijk1',
  YOS_MASTER_DOCUMENT_ID: 'abcdefghijk2',
  YOS_CHANGE_LOG_DOCUMENT_ID: 'abcdefghijk3',
  YOS_SYSTEM_MASTER_DOCUMENT_ID: 'abcdefghijk4',
  YOS_TAXI_MASTER_DOCUMENT_ID: 'abcdefghijk5',
  PROJECT75_SPREADSHEET_ID: 'abcdefghijk6'
};

test('loads strict production configuration with keyless Google auth', () => {
  const config = loadYosRuntimeConfig(base);
  assert.deepEqual(config.allowedOrigins, ['https://yos.example', 'https://app.example']);
  assert.equal(config.googleWorkloadAuth.mode, 'vercel_oidc');
  assert.equal(config.limits.requestsPerHour, 30);
});

test('rejects insecure production origins and missing values', () => {
  assert.throws(() => loadYosRuntimeConfig({ ...base, YOS_ALLOWED_ORIGINS: 'http://yos.example' }), /HTTPS/);
  assert.throws(() => loadYosRuntimeConfig({ ...base, OPENAI_API_KEY: '' }), /OPENAI_API_KEY/);
});

test('allows localhost and application default credentials only outside production', () => {
  const config = loadYosRuntimeConfig({
    ...base,
    NODE_ENV: 'development',
    YOS_ALLOWED_ORIGINS: 'http://localhost:3000',
    GOOGLE_AUTH_MODE: 'application_default'
  });
  assert.deepEqual(config.allowedOrigins, ['http://localhost:3000']);
  assert.equal(config.googleWorkloadAuth.mode, 'application_default');

  assert.throws(() => loadYosRuntimeConfig({ ...base, GOOGLE_AUTH_MODE: 'application_default' }), /not allowed/);
});
