'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BACKOFF_MS,
  CONTEXT,
  MAX_ATTEMPTS,
  markerContent,
  parseMarker,
  planRetry,
  processRetry,
} = require('./projecty-hq-vercel-retry.cjs');

const SOURCE = 'a'.repeat(40);
const LATEST = 'b'.repeat(40);
const T0 = Date.parse('2026-10-04T03:00:00Z');

function rateLimitStatus(state = 'failure') {
  return [{ context: CONTEXT, state, target_url: 'https://vercel.com/project-y1?upgradeToPro=build-rate-limit' }];
}

function marker(attempt, requestedAt = '2026-10-04T03:00:00.000Z') {
  return {
    schema_version: '1.0.0',
    kind: 'yos-ai-approved-release-retry',
    approval_basis: 'source already merged to main',
    source_sha: SOURCE,
    attempt,
    requested_at: requestedAt,
    previous_failed_sha: LATEST,
    reason: 'vercel-rate-limit',
  };
}

test('legacy redeploy marker is not treated as approved retry state', () => {
  assert.equal(parseMarker('2026-10-04 old plain text trigger'), null);
  assert.equal(parseMarker(JSON.stringify(marker(1))).attempt, 1);
});

test('successful Vercel status ends retry planning', () => {
  const plan = planRetry({
    statuses: rateLimitStatus('success'),
    marker: null,
    sourceSha: SOURCE,
    latestServerSha: LATEST,
    sourceCommitMs: T0,
    now: T0 + 10 * BACKOFF_MS[0],
  });
  assert.equal(plan.action, 'NONE');
  assert.equal(plan.reason, 'vercel-success');
});

test('first rate-limit retry waits one hour from source merge', () => {
  const early = planRetry({
    statuses: rateLimitStatus(),
    marker: null,
    sourceSha: SOURCE,
    latestServerSha: LATEST,
    sourceCommitMs: T0,
    now: T0 + BACKOFF_MS[0] - 1,
  });
  assert.equal(early.action, 'EXTERNAL_WAIT');

  const due = planRetry({
    statuses: rateLimitStatus(),
    marker: null,
    sourceSha: SOURCE,
    latestServerSha: LATEST,
    sourceCommitMs: T0,
    now: T0 + BACKOFF_MS[0],
  });
  assert.equal(due.action, 'RETRY_RELEASE');
  assert.equal(due.attempt, 1);
});

test('same approved source uses bounded increasing backoff', () => {
  const m = marker(1);
  const wait = planRetry({
    statuses: rateLimitStatus(),
    marker: m,
    sourceSha: SOURCE,
    latestServerSha: LATEST,
    sourceCommitMs: T0,
    now: Date.parse(m.requested_at) + BACKOFF_MS[1] - 1,
  });
  assert.equal(wait.action, 'EXTERNAL_WAIT');

  const due = planRetry({
    statuses: rateLimitStatus(),
    marker: m,
    sourceSha: SOURCE,
    latestServerSha: LATEST,
    sourceCommitMs: T0,
    now: Date.parse(m.requested_at) + BACKOFF_MS[1],
  });
  assert.equal(due.action, 'RETRY_RELEASE');
  assert.equal(due.attempt, 2);
});

test('retry budget exhausts without asking the user or writing another trigger', () => {
  const plan = planRetry({
    statuses: rateLimitStatus(),
    marker: marker(MAX_ATTEMPTS),
    sourceSha: SOURCE,
    latestServerSha: LATEST,
    sourceCommitMs: T0,
    now: T0 + 100 * 24 * 60 * 60 * 1000,
  });
  assert.equal(plan.action, 'EXTERNAL_WAIT_BOUNDED');
});

test('non-rate-limit failure is not blindly redeployed', () => {
  const plan = planRetry({
    statuses: [{ context: CONTEXT, state: 'failure', target_url: 'https://vercel.com/some-build-error' }],
    marker: null,
    sourceSha: SOURCE,
    latestServerSha: LATEST,
    sourceCommitMs: T0,
    now: T0 + BACKOFF_MS[0],
  });
  assert.equal(plan.action, 'NONE');
  assert.equal(plan.reason, 'non-rate-limit-failure');
});

test('dry-run plans a due retry but performs no marker write', async () => {
  const calls = [];
  const api = {
    async request(path, options = {}) {
      calls.push({ path, options });
      if (path === `/commits/${LATEST}/status`) return { statuses: rateLimitStatus() };
      if (path.startsWith('/contents/server/yos-ai/.redeploy-trigger?')) {
        return {
          sha: 'marker-blob',
          content: Buffer.from('legacy trigger\n').toString('base64'),
        };
      }
      throw new Error('unexpected write');
    },
  };
  const result = await processRetry({
    api,
    branch: 'main',
    sourceSha: SOURCE,
    latestServerSha: LATEST,
    sourceCommitMs: T0,
    now: T0 + BACKOFF_MS[0],
    dryRun: true,
  });
  assert.equal(result.action, 'RETRY_RELEASE');
  assert.equal(calls.some((call) => call.options.method === 'PUT'), false);
});

test('committed retry rewrites only the existing redeploy marker', async () => {
  const calls = [];
  const api = {
    async request(path, options = {}) {
      calls.push({ path, options });
      if (path === `/commits/${LATEST}/status`) return { statuses: rateLimitStatus() };
      if (path.startsWith('/contents/server/yos-ai/.redeploy-trigger?')) {
        return {
          sha: 'marker-blob',
          content: Buffer.from('legacy trigger\n').toString('base64'),
        };
      }
      if (path === '/contents/server/yos-ai/.redeploy-trigger' && options.method === 'PUT') return { commit: { sha: 'new' } };
      throw new Error('unexpected request ' + path);
    },
  };
  const result = await processRetry({
    api,
    branch: 'main',
    sourceSha: SOURCE,
    latestServerSha: LATEST,
    sourceCommitMs: T0,
    now: T0 + BACKOFF_MS[0],
    dryRun: false,
  });
  assert.equal(result.action, 'RETRY_RELEASE');
  assert.equal(result.committed, true);
  const write = calls.find((call) => call.options.method === 'PUT');
  const body = JSON.parse(write.options.body);
  assert.equal(body.sha, 'marker-blob');
  const decoded = Buffer.from(body.content, 'base64').toString('utf8');
  const state = JSON.parse(decoded);
  assert.equal(state.source_sha, SOURCE);
  assert.equal(state.attempt, 1);
  assert.match(state.approval_basis, /merged to main/);
  assert.equal(markerContent(result).includes(SOURCE), true);
});
