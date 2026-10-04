'use strict';

const CONTEXT = 'Vercel – project-y-yos-ai';
const MARKER_PATH = 'server/yos-ai/.redeploy-trigger';
const RATE_LIMIT_RE = /(?:build-rate-limit|docs\/limits#rate-limits|api-deployments-free-per-day|rate.?limit)/i;
const MAX_ATTEMPTS = 4;
const BACKOFF_MS = [
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];

function parseMarker(text) {
  try {
    const value = JSON.parse(String(text || ''));
    if (value?.schema_version !== '1.0.0' || value?.kind !== 'yos-ai-approved-release-retry') return null;
    if (!/^[0-9a-f]{40}$/i.test(String(value.source_sha || ''))) return null;
    if (!Number.isInteger(value.attempt) || value.attempt < 1 || value.attempt > MAX_ATTEMPTS) return null;
    if (!Number.isFinite(Date.parse(value.requested_at))) return null;
    return value;
  } catch {
    return null;
  }
}

function selectVercelStatus(statuses) {
  return (statuses || []).find((row) => row?.context === CONTEXT) || null;
}

function planRetry({ statuses, marker, sourceSha, latestServerSha, sourceCommitMs, now = Date.now() }) {
  const status = selectVercelStatus(statuses);
  if (!status) return { action: 'NONE', reason: 'vercel-status-missing' };
  if (status.state === 'success') return { action: 'NONE', reason: 'vercel-success' };
  if (status.state === 'pending') return { action: 'EXTERNAL_WAIT', reason: 'vercel-pending' };
  if (status.state !== 'failure') return { action: 'EXTERNAL_WAIT', reason: 'vercel-status-' + status.state };
  if (!RATE_LIMIT_RE.test(String(status.target_url || '') + ' ' + String(status.description || ''))) {
    return { action: 'NONE', reason: 'non-rate-limit-failure' };
  }

  const sameSource = marker?.source_sha === sourceSha;
  const attempt = sameSource ? marker.attempt : 0;
  if (attempt >= MAX_ATTEMPTS) {
    return { action: 'EXTERNAL_WAIT_BOUNDED', reason: 'retry-budget-exhausted', attempt };
  }

  const anchor = sameSource ? Date.parse(marker.requested_at) : Number(sourceCommitMs);
  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
  const retryAtMs = anchor + delay;
  if (!Number.isFinite(retryAtMs)) return { action: 'NONE', reason: 'invalid-retry-anchor' };
  if (now < retryAtMs) {
    return { action: 'EXTERNAL_WAIT', reason: 'backoff', attempt, retryAt: new Date(retryAtMs).toISOString() };
  }

  return {
    action: 'RETRY_RELEASE',
    reason: 'vercel-rate-limit',
    attempt: attempt + 1,
    retryAt: new Date(now).toISOString(),
    sourceSha,
    latestServerSha,
  };
}

function markerContent(plan) {
  return JSON.stringify({
    schema_version: '1.0.0',
    kind: 'yos-ai-approved-release-retry',
    approval_basis: 'source already merged to main',
    source_sha: plan.sourceSha,
    attempt: plan.attempt,
    requested_at: plan.retryAt,
    previous_failed_sha: plan.latestServerSha,
    reason: plan.reason,
  }, null, 2) + '\n';
}

function apiClient(token, repository) {
  const root = `https://api.github.com/repos/${repository}`;
  return {
    async request(path, options = {}) {
      const response = await fetch(`${root}${path}`, {
        ...options,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          ...options.headers,
        },
      });
      if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
      return response.status === 204 ? null : response.json();
    },
  };
}

async function readMarker(api, branch) {
  const row = await api.request(`/contents/${MARKER_PATH}?ref=${encodeURIComponent(branch)}`);
  return {
    sha: row.sha,
    marker: parseMarker(Buffer.from(String(row.content || '').replace(/\n/g, ''), 'base64').toString('utf8')),
  };
}

async function processRetry({ api, branch, sourceSha, latestServerSha, sourceCommitMs, now = Date.now(), dryRun = false }) {
  const statusPayload = await api.request(`/commits/${latestServerSha}/status`);
  const markerState = await readMarker(api, branch);
  const plan = planRetry({
    statuses: statusPayload.statuses || [],
    marker: markerState.marker,
    sourceSha,
    latestServerSha,
    sourceCommitMs,
    now,
  });

  if (plan.action !== 'RETRY_RELEASE' || dryRun) return { ...plan, dryRun };

  await api.request(`/contents/${MARKER_PATH}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `chore(yos-ai): retry deferred approved release (${plan.attempt}/${MAX_ATTEMPTS})`,
      content: Buffer.from(markerContent(plan)).toString('base64'),
      sha: markerState.sha,
      branch,
    }),
  });

  return { ...plan, committed: true };
}

async function main() {
  const repository = process.env.REPOSITORY;
  const branch = process.env.DEFAULT_BRANCH || 'main';
  const token = process.env.GITHUB_TOKEN;
  const sourceSha = process.env.SOURCE_SHA;
  const latestServerSha = process.env.LATEST_SERVER_SHA;
  const sourceCommitMs = Number(process.env.SOURCE_COMMIT_MS);
  const dryRun = process.env.DRY_RUN === 'true';

  if (!repository || !token) throw new Error('REPOSITORY and GITHUB_TOKEN are required');
  for (const [name, value] of [['SOURCE_SHA', sourceSha], ['LATEST_SERVER_SHA', latestServerSha]]) {
    if (!/^[0-9a-f]{40}$/i.test(String(value || ''))) throw new Error(`${name} must be a commit SHA`);
  }
  if (!Number.isFinite(sourceCommitMs)) throw new Error('SOURCE_COMMIT_MS is required');

  const result = await processRetry({
    api: apiClient(token, repository),
    branch,
    sourceSha,
    latestServerSha,
    sourceCommitMs,
    dryRun,
  });
  console.log(JSON.stringify(result));
}

module.exports = {
  BACKOFF_MS,
  CONTEXT,
  MARKER_PATH,
  MAX_ATTEMPTS,
  RATE_LIMIT_RE,
  markerContent,
  parseMarker,
  planRetry,
  processRetry,
  selectVercelStatus,
};

if (require.main === module) main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
