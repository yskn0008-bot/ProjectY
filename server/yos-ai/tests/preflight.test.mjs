import test from 'node:test';
import assert from 'node:assert/strict';
import {runProductionPreflight} from '../dist/preflight.js';

const valid = {
  OPENAI_API_KEY: 'sk-private-value',
  OPENAI_MODEL: 'gpt-5.6-terra',
  GOOGLE_CLIENT_ID: '123456789.apps.googleusercontent.com',
  YOS_ALLOWED_ORIGINS: 'https://yos.example',
  GOOGLE_ALLOWED_SUBJECT_HASH: 'a'.repeat(64),
  GOOGLE_AUTH_MODE: 'vercel_oidc',
  GCP_PROJECT_NUMBER: '123456789012',
  GCP_WORKLOAD_IDENTITY_POOL_ID: 'vercel-pool',
  GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID: 'vercel-provider',
  GCP_SERVICE_ACCOUNT_EMAIL: 'yos-ai@example-project.iam.gserviceaccount.com',
  YOS_LAW_DOCUMENT_ID: 'abcdefghijk1',
  YOS_MASTER_DOCUMENT_ID: 'abcdefghijk2',
  YOS_CHANGE_LOG_DOCUMENT_ID: 'abcdefghijk3',
  YOS_SYSTEM_MASTER_DOCUMENT_ID: 'abcdefghijk4',
  YOS_TAXI_MASTER_DOCUMENT_ID: 'abcdefghijk5',
  PROJECT75_SPREADSHEET_ID: 'abcdefghijk6',
  UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
  UPSTASH_REDIS_REST_TOKEN: 'redis-private-value'
};

test('production preflight passes a complete keyless configuration', () => {
  const report = runProductionPreflight(valid);
  assert.equal(report.status, 'ready');
  assert.equal(report.failed, 0);
  assert.equal(report.warnings, 0);
});

test('production preflight blocks missing and placeholder values', () => {
  const report = runProductionPreflight({
    ...valid,
    OPENAI_API_KEY: 'changeme',
    PROJECT75_SPREADSHEET_ID: ''
  });
  assert.equal(report.status, 'blocked');
  assert.ok(report.failed >= 2);
  assert.ok(report.checks.some((check) => check.id === 'OPENAI_API_KEY' && check.status === 'fail'));
  assert.ok(report.checks.some((check) => check.id === 'PROJECT75_SPREADSHEET_ID' && check.status === 'fail'));
});

test('production preflight never includes secret values in its report', () => {
  const serialized = JSON.stringify(runProductionPreflight(valid));
  assert.doesNotMatch(serialized, /sk-private-value/u);
  assert.doesNotMatch(serialized, /redis-private-value/u);
});

test('format warnings do not expose values or block an otherwise valid configuration', () => {
  const report = runProductionPreflight({
    ...valid,
    GOOGLE_CLIENT_ID: 'nonstandard-client',
    GOOGLE_ALLOWED_SUBJECT_HASH: 'nonstandard-hash',
    GCP_SERVICE_ACCOUNT_EMAIL: 'nonstandard-service-account'
  });
  assert.equal(report.status, 'ready');
  assert.equal(report.failed, 0);
  assert.equal(report.warnings, 3);
});
