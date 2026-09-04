'use strict';

const crypto = require('node:crypto');
const { parseRecovery } = require('./projecty-hq-autopilot.cjs');

const ISSUE_NUMBER = 232;
const DECISION_MARKER = 'projecty-yos-decision:';
const OIDC_AUDIENCE = 'projecty-yos-ai';
const DEFAULT_ENDPOINT = 'https://project-y-yos-ai.vercel.app/api/yos/projecty-decision';
const SAFE_ACTIONS = new Set([
  'RERUN_FAILED',
  'REQUEST_CODE_FIX',
  'REQUEST_TRANSPORT',
  'REQUEST_STATUS',
  'UPDATE_BRANCH',
  'APPROVE_QA',
]);

function apiClient(token, repository, fetchImpl = fetch) {
  const root = `https://api.github.com/repos/${repository}`;
  return { async request(path, options = {}) {
    const response = await fetchImpl(`${root}${path}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    });
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status}`);
    return response.status === 204 ? null : response.json();
  } };
}

async function paginate(api, path, field) {
  const output = [];
  for (let page = 1; ; page += 1) {
    const join = path.includes('?') ? '&' : '?';
    const value = await api.request(`${path}${join}per_page=100&page=${page}`);
    const rows = field ? (value?.[field] || []) : (value || []);
    output.push(...rows);
    if (rows.length < 100) return output;
  }
}

function targetPrNumber(target) {
  const match = /^PR#([1-9][0-9]*)$/.exec(String(target || ''));
  if (!match) throw new Error('TARGET must be PR#<number>');
  return Number(match[1]);
}

function decisionFingerprint(request) {
  return crypto.createHash('sha256').update(JSON.stringify({
    target: request.target,
    currentHead: request.currentHead,
    failureClass: request.failureClass,
    evidenceSummary: request.evidenceSummary,
  })).digest('hex').slice(0, 24);
}

function hasDecision(comments, fingerprint) {
  return comments.some((comment) => comment.body?.includes(`<!-- ${DECISION_MARKER}${fingerprint} -->`));
}

function compactEvidence(target) {
  const failures = Object.entries(target.failures || {}).slice(-6).map(([id, value]) => ({
    id,
    attempts: Number(value?.attempts || 0),
    phase: value?.phase || null,
    lastError: value?.lastError ? String(value.lastError).slice(0, 300) : null,
  }));
  return JSON.stringify({
    phase: target.phase || 'NEEDS_YOS',
    lastAction: target.lastAction || null,
    next: target.next || null,
    lastError: target.lastError ? String(target.lastError).slice(0, 500) : null,
    failures,
  }).slice(0, 5000);
}

function inferFailureClass(target) {
  const next = String(target?.next || '');
  if (/branch conflict/i.test(next)) return 'BRANCH_CONFLICT';
  if (/atomic transport retries exhausted/i.test(next)) return 'TRANSPORT_API_FAILURE';
  if (/bounded recovery exhausted/i.test(next)) return 'BOUNDED_RECOVERY_EXHAUSTED';
  return 'NEEDS_YOS';
}

function parseDecisionResponse(value, expectedHead) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid YOS decision response');
  const decisions = new Set(['CONTINUE', 'REVISE', 'HOLD', 'NEEDS_YOUSUKE']);
  if (!decisions.has(value.decision)) throw new Error('invalid decision');
  if (value.targetHead !== expectedHead) throw new Error('stale YOS decision head');
  if (typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 1000) throw new Error('invalid YOS decision reason');
  const reason = value.reason.replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
  const allowedAction = value.allowedAction === null ? null : String(value.allowedAction || '');
  if (allowedAction !== null && !SAFE_ACTIONS.has(allowedAction)) throw new Error('unsafe YOS action');
  const stopping = value.decision === 'HOLD' || value.decision === 'NEEDS_YOUSUKE';
  if (stopping && allowedAction !== null) throw new Error('stopping decision cannot execute an action');
  if (!Array.isArray(value.evidenceSourceIds) || !value.evidenceSourceIds.every((id) => typeof id === 'string' && id.trim())) {
    throw new Error('invalid YOS decision evidence');
  }
  if (!stopping && value.evidenceSourceIds.length === 0) throw new Error('continuing YOS decision requires grounded evidence');
  if (!Array.isArray(value.unknowns) || !value.unknowns.every((item) => typeof item === 'string')) throw new Error('invalid unknowns');
  return {
    decision: value.decision,
    reason,
    allowedAction,
    targetHead: value.targetHead,
    evidenceSourceIds: [...new Set(value.evidenceSourceIds)].slice(0, 12),
    unknowns: value.unknowns.slice(0, 8),
  };
}

async function requestOidcToken(fetchImpl, environment, audience = OIDC_AUDIENCE) {
  const urlValue = environment.ACTIONS_ID_TOKEN_REQUEST_URL;
  const requestToken = environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!urlValue || !requestToken) throw new Error('GitHub OIDC runtime is unavailable');
  const url = new URL(urlValue);
  url.searchParams.set('audience', audience);
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${requestToken}` } });
  if (!response.ok) throw new Error(`GitHub OIDC token request failed: ${response.status}`);
  const payload = await response.json();
  if (!payload?.value || typeof payload.value !== 'string') throw new Error('GitHub OIDC token missing');
  return payload.value;
}

async function requestYosDecision(fetchImpl, endpoint, token, request) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`YOS decision request failed: ${response.status}`);
  return parseDecisionResponse(await response.json(), request.currentHead);
}

async function latestRuns(api, head) {
  const runs = await paginate(api, `/actions/runs?head_sha=${encodeURIComponent(head)}`, 'workflow_runs');
  return runs.filter((run) => run.head_sha === head).sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
}

async function performAllowedAction(api, pr, action, decision, head) {
  if (!action) return 'NO_ACTION';
  if (action === 'UPDATE_BRANCH') {
    await api.request(`/pulls/${pr.number}/update-branch`, { method: 'PUT', body: JSON.stringify({ expected_head_sha: head }) });
    return 'UPDATE_BRANCH_REQUESTED';
  }
  if (action === 'REQUEST_CODE_FIX' || action === 'REQUEST_TRANSPORT' || action === 'REQUEST_STATUS') {
    const text = action === 'REQUEST_CODE_FIX'
      ? `@codex YOS decision for SAME PR #${pr.number}: revise the current-head implementation with the minimum scoped fix. Do not broaden scope or merge.`
      : action === 'REQUEST_TRANSPORT'
        ? `@codex YOS decision for SAME PR #${pr.number}: transport current scoped work only. Return complete PROJECTY_BASE_HEAD:${head} + PROJECTY_FULL_FILE blocks if push is unavailable.`
        : `@codex YOS decision for SAME PR #${pr.number}: report current-head status and recover the existing task without broadening scope.`;
    await api.request(`/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body: text }) });
    return `${action}_COMMENTED`;
  }
  const runs = await latestRuns(api, head);
  if (action === 'RERUN_FAILED') {
    const run = runs.find((candidate) => candidate.conclusion === 'failure');
    if (!run) return 'RERUN_FAILED_SKIPPED_NO_FAILED_RUN';
    await api.request(`/actions/runs/${run.id}/rerun-failed-jobs`, { method: 'POST' });
    return `RERUN_FAILED_${run.id}`;
  }
  if (action === 'APPROVE_QA') {
    const run = runs.find((candidate) => candidate.status === 'waiting' || candidate.conclusion === 'action_required');
    if (!run) return 'APPROVE_QA_SKIPPED_NO_WAITING_RUN';
    await api.request(`/actions/runs/${run.id}/approve`, { method: 'POST' });
    return `APPROVE_QA_${run.id}`;
  }
  throw new Error('unsupported allowed action');
}

function decisionComment(fingerprint, request, decision, actionResult) {
  const evidence = decision.evidenceSourceIds.length
    ? decision.evidenceSourceIds.map((id) => `\`${id}\``).join(', ')
    : 'NONE (fail-closed stop; grounded evidence unavailable)';
  return [
    `<!-- ${DECISION_MARKER}${fingerprint} -->`,
    '## Issue #232｜YOS判断',
    `- target: ${request.target}`,
    `- current head: \`${request.currentHead}\``,
    `- failure class: \`${request.failureClass}\``,
    `- decision: \`${decision.decision}\``,
    `- reason: ${decision.reason}`,
    `- allowed action: \`${decision.allowedAction || 'NONE'}\``,
    `- action result: \`${actionResult}\``,
    `- evidence: ${evidence}`,
    `- unknown count: ${decision.unknowns.length}`,
    '- raw prompt / raw model response / token / secretはGitHubへ保存していない。',
    '- merge・本番公開・credential変更・破壊的変更・実機確認代替は自動実行しない。',
  ].join('\n');
}

async function run({ api, fetchImpl = fetch, environment = process.env, endpoint = DEFAULT_ENDPOINT, target }) {
  const issueComments = await paginate(api, `/issues/${ISSUE_NUMBER}/comments`);
  const state = parseRecovery(issueComments);
  const prNumber = targetPrNumber(target);
  const key = `PR#${prNumber}`;
  const targetState = state.targets?.[key];
  if (!targetState || targetState.phase !== 'NEEDS_YOS') return { status: 'ignored', reason: 'target is not NEEDS_YOS' };

  const pr = await api.request(`/pulls/${prNumber}`);
  if (pr.state !== 'open' || pr.merged || pr.head?.sha !== targetState.head || pr.head?.repo?.full_name !== environment.REPOSITORY) {
    return { status: 'ignored', reason: 'unsafe or stale target' };
  }
  const files = (await paginate(api, `/pulls/${prNumber}/files`)).map((file) => file.filename).slice(0, 100);
  const request = {
    target: key,
    currentHead: pr.head.sha,
    failureClass: inferFailureClass(targetState),
    evidenceSummary: compactEvidence(targetState),
    candidateActions: [...SAFE_ACTIONS],
    scope: files,
    unknowns: [targetState.next || 'next condition not recorded'].filter(Boolean),
  };
  const fingerprint = decisionFingerprint(request);
  if (hasDecision(issueComments, fingerprint)) return { status: 'ignored', reason: 'decision already recorded', fingerprint };

  const oidcToken = await requestOidcToken(fetchImpl, environment);
  const decision = await requestYosDecision(fetchImpl, endpoint, oidcToken, request);
  const freshPr = await api.request(`/pulls/${prNumber}`);
  if (freshPr.head?.sha !== decision.targetHead) return { status: 'ignored', reason: 'head moved after decision', fingerprint };
  const actionResult = await performAllowedAction(api, freshPr, decision.allowedAction, decision, decision.targetHead);
  await api.request(`/issues/${ISSUE_NUMBER}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body: decisionComment(fingerprint, request, decision, actionResult) }),
  });
  return { status: 'recorded', fingerprint, decision: decision.decision, allowedAction: decision.allowedAction, actionResult };
}

async function main() {
  const repository = process.env.REPOSITORY;
  const target = process.env.TARGET;
  if (!process.env.GITHUB_TOKEN || !repository || !target) throw new Error('GITHUB_TOKEN, REPOSITORY, and TARGET are required');
  const result = await run({ api: apiClient(process.env.GITHUB_TOKEN, repository), target });
  console.log(JSON.stringify(result));
}

module.exports = {
  DECISION_MARKER,
  OIDC_AUDIENCE,
  SAFE_ACTIONS,
  apiClient,
  compactEvidence,
  decisionComment,
  decisionFingerprint,
  hasDecision,
  inferFailureClass,
  paginate,
  parseDecisionResponse,
  performAllowedAction,
  requestOidcToken,
  requestYosDecision,
  run,
  targetPrNumber,
};

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ level: 'error', event: 'projecty_yos_decision_failed', message: String(error.message || error).slice(0, 300) }));
  process.exitCode = 1;
});
