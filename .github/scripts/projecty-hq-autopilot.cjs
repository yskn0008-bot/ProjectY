'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const ISSUE_NUMBER = 232;
const MARKER = '<!-- projecty-hq-event-state -->';
const RECOVERY_MARKER = 'projecty-hq-recovery:';
const SCOPE_RE = /<!-- projecty-autopilot-scope:([A-Za-z0-9_-]+) -->/;
const CODEX_ACTOR = 'chatgpt-codex-connector[bot]';
const STALL_MS = 45 * 60 * 1000;
const MAX_SEEN = 12;
const QA_NAMES = new Set(['Codex governance', 'Taxi iPhone17 Smoke', 'Taxi Demand Calendar', 'YOS AI Core', 'YOSナビ Safety', 'YOS Service Worker']);
const UI_FILE = /^(taxi|life|yos|nav)\/(?:[^/]+\/)*(?:[^/]+\.(?:css|html)|final-app-v\d+\.js|[^/]*(?:style|theme|view|screen|component)[^/]*\.(?:js|cjs|mjs|ts|tsx|jsx))$/i;
const SENSITIVE_FILE = /(^|\/)(?:service-worker|sw)\.(?:js|cjs|mjs|ts)$|(^|\/)(?:auth|api|deploy|deployment|infrastructure|manifest)(?:\/|\.|-)|(^|\/)\.github\/|(?:^|\/)vercel\.json$/i;
const TRANSIENT_RE = /(?:hosted runner|runner (?:lost|offline|infrastructure)|network (?:error|failure)|timed?\s*out|rate.?limit|service unavailable|bad gateway|gateway timeout|ECONNRESET|HTTP\s*5\d\d|api-deployments-free-per-day)/i;

const nowIso = (now) => new Date(now === undefined ? Date.now() : now).toISOString();
const emptyState = () => ({ version: 4, targets: {} });
const targetKey = (pr) => `PR#${pr.number}`;
const deliveryKey = (payload, fallback) => String(payload.deliveryId || payload.comment?.id || payload.workflow_run?.id || fallback || 'event');

function classifyQaLevel(body, files) {
  if (files.some((file) => SENSITIVE_FILE.test(file))) return 3;
  return /(?:^|\n)\s*(?:QA\s*)?Level\s*1\b/im.test(body || '') && files.length && files.every((file) => UI_FILE.test(file)) ? 1 : 2;
}

function newestQaRuns(runs, head) {
  const result = new Map();
  const order = (r) => [Date.parse(r.created_at || 0) || 0, Number(r.run_attempt || 0), Number(r.id || 0)];
  for (const run of runs) {
    if (run.head_sha !== head || !QA_NAMES.has(run.name)) continue;
    const old = result.get(run.name);
    if (!old || order(run).some((v, i) => v > order(old)[i] && order(run).slice(0, i).every((x, j) => x === order(old)[j]))) result.set(run.name, run);
  }
  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function qaState(runs) {
  if (!runs.length) return { status: 'current-head QA run待ち。', next: 'QA_BOOTSTRAP_BLOCKED', nextStep: 'current-head QA run待ち。' };
  const pending = runs.some((r) => !r.conclusion || ['queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(r.status));
  const failed = runs.some((r) => r.conclusion && r.conclusion !== 'success');
  const next = pending ? 'AWAITING_QA' : failed ? 'QA_FAILURE' : 'QA_SUCCESS';
  return {
    status: runs.map((r) => `${r.name}=${r.conclusion || r.status || 'unknown'}`).join(', '),
    next,
    nextStep: pending ? 'QA実行中。' : failed ? 'QA失敗。' : 'QA成功。',
  };
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

function parseRecovery(comments) {
  const comment = [...comments].reverse().find((c) => c.body?.includes(MARKER));
  const encoded = comment?.body.match(new RegExp(`<!-- ${RECOVERY_MARKER}([A-Za-z0-9_-]+) -->`))?.[1];
  if (!encoded) return emptyState();
  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    return parsed?.targets && typeof parsed.targets === 'object' ? parsed : emptyState();
  } catch { return emptyState(); }
}

function compactTarget(old, pr, now) {
  if (!old || old.head !== pr.head.sha) return { head: pr.head.sha, phase: 'OBSERVING', failures: {}, seen: [], progressAt: nowIso(now) };
  return { ...old, failures: old.failures || {}, seen: (old.seen || []).slice(-MAX_SEEN) };
}

function renderState(selected, state) {
  const encoded = Buffer.from(JSON.stringify(state)).toString('base64url');
  return [MARKER, `<!-- ${RECOVERY_MARKER}${encoded} -->`, '## Issue #232 自動司令部の現在状態', '',
    `- target: ${selected.key}`, `- current head: \`${selected.target.head}\``, `- phase: ${selected.target.phase}`,
    `- QA: ${selected.qa.status}`, `- last action: ${selected.target.lastAction || 'NONE'}`,
    `- next condition: ${selected.target.next || selected.qa.next}`, '- 自動マージ・本番公開・credential変更・製品コード変更・実機確認代替なし。'].join('\n');
}

function chooseCommentMutation(comments, body) {
  const old = [...comments].reverse().find((c) => c.body?.includes(MARKER));
  if (old?.body === body) return { kind: 'none' };
  return old ? { kind: 'update', id: old.id, body } : { kind: 'create', body };
}

function isTarget(pr, repository, owner) {
  return Boolean(pr && pr.state === 'open' && !pr.merged && pr.head?.sha && pr.head?.ref && pr.head.ref !== 'main'
    && pr.head.repo?.full_name === repository && pr.user?.login === owner && pr.author_association === 'OWNER');
}

function branchCondition(pr) {
  if (pr.mergeable === false || pr.mergeable_state === 'dirty') return 'BRANCH_CONFLICT';
  if (pr.mergeable === true && pr.mergeable_state === 'behind') return 'BRANCH_BEHIND';
  return null;
}

function isAck(body) { return /^\s*(?:on it[.!]?|working on it[.!]?|started[.!]?)\s*$/i.test(body || ''); }
function isTrustedFinal(comment) {
  if (comment?.user?.login !== CODEX_ACTOR || isAck(comment.body)) return false;
  return /PROJECTY_(?:SINGLE_FILE_BASE|BASE_HEAD):[0-9a-f]{40}|\bView task\b|(?:^|\n)#{0,3}\s*Summary\b/i.test(comment.body || '');
}

function parseArtifact(text) {
  const base = text?.match(/PROJECTY_(?:SINGLE_FILE_BASE|BASE_HEAD):([0-9a-f]{40})/i)?.[1].toLowerCase();
  if (!base) return null;
  const files = new Map();
  const re = /(?:^|\n)(?:PROJECTY|PR\d+)_FULL_FILE:([^\r\n]+)\r?\n```[^\r\n]*\r?\n([\s\S]*?)\r?\n```(?=\r?\n|$)/g;
  for (const match of text.matchAll(re)) files.set(match[1].trim(), match[2]);
  const single = text.match(/(?:^|\n)PROJECTY_SINGLE_FILE_PATH:([^\r\n]+)\r?\nPROJECTY_SINGLE_FILE_BEGIN\r?\n```[^\r\n]*\r?\n([\s\S]*?)\r?\n```\r?\nPROJECTY_SINGLE_FILE_END/);
  if (single) files.set(single[1].trim(), single[2]);
  return files.size ? { base, files } : null;
}

function validPath(path) { return Boolean(path && !path.startsWith('/') && !path.includes('\\') && path.split('/').every((p) => p && p !== '.' && p !== '..')); }
function parseScope(comments, pr, owner) {
  for (const comment of [...comments].reverse()) {
    if (comment.user?.login !== owner || comment.author_association !== 'OWNER') continue;
    const encoded = comment.body?.match(SCOPE_RE)?.[1];
    if (!encoded) continue;
    try {
      const scope = JSON.parse(Buffer.from(encoded, 'base64url').toString());
      if (scope.pr === pr.number && scope.allowAutoTransport === true && Array.isArray(scope.allowedPaths) && scope.allowedPaths.every(validPath)) return scope;
    } catch { /* malformed owner configuration is ignored safely */ }
  }
  return null;
}

function buildTransportPlan({ comment, comments, pr, repository, owner }) {
  if (!isTarget(pr, repository, owner) || !isTrustedFinal(comment)) return { ok: false, reason: 'UNSAFE_TARGET_OR_ACTOR' };
  const artifact = parseArtifact(comment.body);
  if (!artifact) return { ok: false, reason: 'MISSING_ARTIFACT' };
  if (artifact.base !== pr.head.sha.toLowerCase()) return { ok: false, reason: 'HEAD_MOVED' };
  const scope = parseScope(comments, pr, owner);
  if (!scope) return { ok: false, reason: 'OWNER_SCOPE_REQUIRED' };
  const allowed = new Set(scope.allowedPaths);
  const paths = [...artifact.files.keys()];
  if (!paths.length || paths.some((path) => !validPath(path) || !allowed.has(path)) || paths.length !== allowed.size || [...allowed].some((p) => !artifact.files.has(p))) return { ok: false, reason: 'SCOPE_MISMATCH' };
  return { ok: true, base: artifact.base, branch: pr.head.ref, files: paths.map((path) => ({ path, content: artifact.files.get(path) })) };
}

async function atomicTransport(api, plan) {
  const refPath = `/git/ref/heads/${encodeURIComponent(plan.branch)}`;
  const before = await api.request(refPath);
  if (before.object?.sha !== plan.base) throw new Error('TRANSPORT_HEAD_RACE: ref moved before transport');
  const base = await api.request(`/git/commits/${plan.base}`);
  const treeEntries = [];
  for (const file of plan.files) {
    const blob = await api.request('/git/blobs', { method: 'POST', body: JSON.stringify({ content: file.content, encoding: 'utf-8' }) });
    treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const tree = await api.request('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: base.tree.sha, tree: treeEntries }) });
  const commit = await api.request('/git/commits', { method: 'POST', body: JSON.stringify({ message: 'fix: apply trusted Issue 232 artifact', tree: tree.sha, parents: [plan.base] }) });
  const current = await api.request(refPath);
  if (current.object?.sha !== plan.base) throw new Error('TRANSPORT_HEAD_RACE: ref moved during transport');
  await api.request(`/git/refs/heads/${encodeURIComponent(plan.branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  return commit.sha;
}

function failureId(kind, evidence = {}) {
  const root = kind === 'ACTION_TRANSIENT_FAILURE' || kind === 'ACTION_CODE_FAILURE' ? (evidence.workflowId || evidence.name || 'workflow') : kind;
  return crypto.createHash('sha256').update(`${evidence.target || ''}:${evidence.head || ''}:${kind}:${root}`).digest('hex').slice(0, 18);
}

function decide(target, kind, evidence) {
  const id = failureId(kind, evidence);
  const old = target.failures[id] || { attempts: 0, seen: [] };
  const delivery = String(evidence.delivery || '');
  if (delivery && old.seen.includes(delivery)) return { action: 'NONE', id, record: old };
  const record = { ...old, seen: [...old.seen, delivery].filter(Boolean).slice(-MAX_SEEN) };
  const ladders = {
    ACTION_TRANSIENT_FAILURE: ['RERUN_FAILED', 'REQUEST_CODE_FIX'],
    ACTION_CODE_FAILURE: ['REQUEST_CODE_FIX'], TASK_STALLED: ['REQUEST_STATUS'],
    CODEX_PUSH_BLOCKED: ['REQUEST_TRANSPORT'], CODEX_GH_UNAUTHENTICATED: ['REQUEST_TRANSPORT'], CODEX_RESULT_NO_GITHUB_ARTIFACT: ['REQUEST_TRANSPORT'],
    HEAD_MOVED: ['REQUEST_TRANSPORT'], QA_BOOTSTRAP_BLOCKED: ['REQUEST_STATUS'], BRANCH_BEHIND: ['UPDATE_BRANCH'],
  };
  const ladder = ladders[kind] || [];
  if (record.attempts >= ladder.length) return { action: 'NEEDS_YOS', id, record: { ...record, phase: 'NEEDS_YOS' } };
  return { action: ladder[record.attempts], id, record: { ...record, attempts: record.attempts + 1 } };
}

function transientEvidence(jobs) {
  const failed = jobs.filter((job) => job.conclusion === 'failure');
  const text = failed.flatMap((job) => [job.name, job.runner_name, ...(job.steps || []).filter((s) => s.conclusion === 'failure').map((s) => s.name)]).filter(Boolean).join(' ');
  return { proven: TRANSIENT_RE.test(text), text };
}

async function getDetails(api, pr) {
  const [files, runs] = await Promise.all([
    paginate(api, `/pulls/${pr.number}/files`),
    paginate(api, `/actions/runs?head_sha=${encodeURIComponent(pr.head.sha)}`, 'workflow_runs'),
  ]);
  return { files: files.map((f) => f.filename), runs: newestQaRuns(runs, pr.head.sha) };
}

function requestText(action, pr, evidence) {
  if (action === 'REQUEST_TRANSPORT') return `@codex Transport recovery only for this SAME PR #${pr.number}. FINAL RESPONSE must contain PROJECTY_BASE_HEAD:${pr.head.sha} and complete PROJECTY_FULL_FILE:<path> fenced blocks for every changed file; no git push, gh, links, excerpts, or local-only state.`;
  if (action === 'REQUEST_CODE_FIX') return `@codex Fix this current-head failure on the SAME PR with the minimum scoped change. Evidence: ${String(evidence.text || '').slice(0, 1000)}`;
  return '@codex This SAME PR task has not made meaningful progress for 45 minutes. Recover without broadening scope and return durable final evidence.';
}

async function perform(api, action, pr, evidence) {
  if (action === 'RERUN_FAILED') return api.request(`/actions/runs/${evidence.runId}/rerun-failed-jobs`, { method: 'POST' });
  if (action === 'UPDATE_BRANCH') return api.request(`/pulls/${pr.number}/update-branch`, { method: 'PUT', body: JSON.stringify({ expected_head_sha: pr.head.sha }) });
  if (action.startsWith('REQUEST_')) return api.request(`/issues/${pr.number}/comments`, { method: 'POST', body: JSON.stringify({ body: requestText(action, pr, evidence) }) });
  return null;
}

async function applyDecision(api, target, decision, pr, evidence, dryRun, now) {
  target.failures[decision.id] = decision.record;
  target.lastAction = decision.action;
  if (decision.action === 'NONE') return;
  if (decision.action === 'NEEDS_YOS') { target.phase = 'NEEDS_YOS'; target.next = 'bounded recovery exhausted'; return; }
  target.phase = decision.action.startsWith('REQUEST_') ? 'RUNNING' : 'RECOVERING';
  if (target.phase === 'RUNNING') target.runningSince = nowIso(now);
  if (dryRun) return;
  try {
    await perform(api, decision.action, pr, evidence); target.progressAt = nowIso(now);
    if (decision.action === 'UPDATE_BRANCH') { target.phase = 'BRANCH_SYNCING'; target.next = 'new head synchronize event'; }
  }
  catch (error) {
    decision.record.lastError = String(error.message || error).slice(0, 500);
    decision.record.lastErrorAt = nowIso(now);
    target.phase = 'RECOVERY_API_FAILED';
    target.next = 'new evidence or bounded watchdog step';
  }
}

async function continueQa(api, pr, target, dryRun, now) {
  const runs = newestQaRuns(await paginate(api, `/actions/runs?head_sha=${encodeURIComponent(target.head)}`, 'workflow_runs'), target.head);
  const eligible = runs.find((run) => run.head_sha === target.head && run.event === 'pull_request' && run.pull_requests?.some((linked) => linked.number === pr.number) && (run.status === 'waiting' || run.conclusion === 'action_required'));
  if (eligible) {
    target.phase = 'AWAITING_QA'; target.lastAction = 'APPROVE_QA';
    if (!dryRun) {
      try { await api.request(`/actions/runs/${eligible.id}/approve`, { method: 'POST' }); target.lastAction = 'QA_APPROVED'; target.progressAt = nowIso(now); }
      catch (error) { target.phase = 'RECOVERY_API_FAILED'; target.lastError = String(error.message || error).slice(0, 500); }
    }
  } else if (!runs.length) { target.phase = 'QA_BOOTSTRAP_BLOCKED'; target.next = 'current-head QA run or bounded watchdog recovery'; }
  else target.phase = qaState(runs).next;
  return { runs, action: eligible ? 'APPROVE_QA' : 'NONE' };
}

async function processOne({ api, pr, eventName, payload, comments, state, dryRun, now, repository, owner }) {
  const key = targetKey(pr);
  const target = compactTarget(state.targets[key], pr, now);
  state.targets[key] = target;
  target.lastEvent = eventName;
  let action = 'NONE';

  const branch = eventName === 'issue_comment' ? null : branchCondition(pr);
  if (branch === 'BRANCH_CONFLICT') {
    target.phase = 'NEEDS_YOS'; target.next = 'branch conflict requires scoped human review';
    return { key, target, action: 'NEEDS_YOS' };
  }
  if (branch === 'BRANCH_BEHIND') {
    const evidence = { target: key, head: pr.head.sha, delivery: deliveryKey(payload, `${eventName}:${pr.updated_at || pr.head.sha}`) };
    const decision = decide(target, branch, evidence); action = decision.action;
    await applyDecision(api, target, decision, pr, evidence, dryRun, now);
    return { key, target, action };
  }

  if (eventName === 'issue_comment') {
    const comment = payload.comment;
    const commentDelivery = deliveryKey(payload);
    if (target.seen.includes(commentDelivery)) return { key, target, action };
    target.seen = [...target.seen, commentDelivery].slice(-MAX_SEEN);
    if (isAck(comment.body)) { target.phase = 'RUNNING'; target.runningSince ||= nowIso(now); target.progressAt = nowIso(now); return { key, target, action }; }
    if (!isTrustedFinal(comment)) return { key, target, action };
    const plan = buildTransportPlan({ comment, comments, pr, repository, owner });
    if (plan.ok) {
      const transportId = failureId('TRANSPORT_API_FAILURE', { target: key, head: pr.head.sha });
      const transportRecord = target.failures[transportId] || { attempts: 0, seen: [] };
      if (transportRecord.attempts >= 2) { target.phase = 'NEEDS_YOS'; target.next = 'atomic transport retries exhausted'; return { key, target, action: 'NEEDS_YOS' }; }
      target.failures[transportId] = { ...transportRecord, attempts: transportRecord.attempts + 1, seen: [...transportRecord.seen, commentDelivery].slice(-MAX_SEEN) };
      target.lastAction = 'ATOMIC_TRANSPORT'; target.phase = 'TRANSPORTING';
      if (!dryRun) {
        try { target.head = await atomicTransport(api, plan); target.phase = 'AWAITING_QA'; target.progressAt = nowIso(now); }
        catch (error) { target.phase = 'RECOVERY_API_FAILED'; target.lastError = String(error.message || error).slice(0, 500); target.next = 'fresh evidence or bounded transport retry'; }
      } else target.phase = 'TRANSPORT_READY';
      return { key, target, action: 'ATOMIC_TRANSPORT', plan };
    }
    const safeStop = ['OWNER_SCOPE_REQUIRED', 'SCOPE_MISMATCH', 'UNSAFE_TARGET_OR_ACTOR'].includes(plan.reason);
    if (safeStop) { target.phase = 'CONFIG_BLOCKED'; target.next = plan.reason; return { key, target, action }; }
    const text = comment.body || '';
    const kind = plan.reason === 'HEAD_MOVED' ? 'HEAD_MOVED' : /CONNECT.*403|push.*failed/i.test(text) ? 'CODEX_PUSH_BLOCKED' : /gh.*unauth/i.test(text) ? 'CODEX_GH_UNAUTHENTICATED' : 'CODEX_RESULT_NO_GITHUB_ARTIFACT';
    const evidence = { target: key, head: pr.head.sha, delivery: deliveryKey(payload), text };
    const decision = decide(target, kind, evidence); action = decision.action;
    await applyDecision(api, target, decision, pr, evidence, dryRun, now);
  } else if (eventName === 'workflow_run' && payload.workflow_run?.conclusion === 'failure') {
    const run = payload.workflow_run;
    const jobs = await paginate(api, `/actions/runs/${run.id}/jobs`, 'jobs');
    const proof = transientEvidence(jobs);
    const kind = proof.proven ? 'ACTION_TRANSIENT_FAILURE' : 'ACTION_CODE_FAILURE';
    const evidence = { target: key, head: pr.head.sha, workflowId: run.workflow_id || run.name, runId: run.id, delivery: deliveryKey(payload), text: proof.text || `${run.name}: unknown failure` };
    const decision = decide(target, kind, evidence); action = decision.action;
    await applyDecision(api, target, decision, pr, evidence, dryRun, now);
  }
  if (['AWAITING_QA', 'QA_BOOTSTRAP_BLOCKED'].includes(target.phase)) await continueQa(api, pr, target, dryRun, now);
  return { key, target, action };
}

async function processEvent({ api, eventName, payload = {}, dryRun = false, now = Date.now(), repository, owner }) {
  if (eventName === 'issue_comment' && payload.comment?.user?.login !== CODEX_ACTOR) return { kind: 'ignored', reason: 'untrusted public comment' };
  const issueComments = await paginate(api, `/issues/${ISSUE_NUMBER}/comments`);
  const state = parseRecovery(issueComments);
  let prs = [];
  if (eventName === 'pull_request_target' || eventName === 'pull_request') prs = [payload.pull_request];
  else if (eventName === 'issue_comment') prs = [await api.request(`/pulls/${payload.issue.number}`)];
  else if (eventName === 'workflow_run') {
    const linked = payload.workflow_run?.pull_requests?.[0];
    if (linked) prs = [await api.request(`/pulls/${linked.number}`)];
  } else {
    for (const key of Object.keys(state.targets)) prs.push(await api.request(`/pulls/${key.slice(3)}`));
  }
  prs = prs.filter((pr) => isTarget(pr, repository, owner));
  if (eventName === 'workflow_run') prs = prs.filter((pr) => payload.workflow_run.head_sha === pr.head.sha);
  if (!prs.length) return { kind: 'ignored', reason: 'no safe managed open PR' };

  let selected = null;
  for (const pr of prs) {
    const key = targetKey(pr);
    const target = compactTarget(state.targets[key], pr, now); state.targets[key] = target;
    if (eventName === 'schedule') {
      const branch = branchCondition(pr);
      if (!selected && branch === 'BRANCH_CONFLICT') {
        target.phase = 'NEEDS_YOS'; target.next = 'branch conflict requires scoped human review'; selected = { key, target, action: 'NEEDS_YOS' };
      } else if (!selected && branch === 'BRANCH_BEHIND') {
        const evidence = { target: key, head: pr.head.sha, delivery: `branch:${pr.head.sha}` };
        const decision = decide(target, branch, evidence); selected = { key, target, action: decision.action };
        await applyDecision(api, target, decision, pr, evidence, dryRun, now);
      } else if (!selected && target.phase === 'RUNNING' && now - Date.parse(target.runningSince || target.progressAt) >= STALL_MS) {
        const evidence = { target: key, head: pr.head.sha, delivery: `stall:${target.failures?.[failureId('TASK_STALLED', { target: key, head: pr.head.sha })]?.attempts || 0}` };
        const decision = decide(target, 'TASK_STALLED', evidence); selected = { key, target, action: decision.action };
        await applyDecision(api, target, decision, pr, evidence, dryRun, now);
      } else if (!selected && ['AWAITING_QA', 'QA_BOOTSTRAP_BLOCKED'].includes(target.phase)) {
        const qaContinuation = await continueQa(api, pr, target, dryRun, now);
        if (qaContinuation.action !== 'NONE') selected = { key, target, action: qaContinuation.action };
      }
      continue;
    }
    const prComments = await paginate(api, `/issues/${pr.number}/comments`);
    const result = await processOne({ api, pr, eventName, payload, comments: prComments, state, dryRun, now, repository, owner });
    if (!selected && result.action !== 'NONE') selected = result;
  }

  const pr = prs.find((p) => targetKey(p) === selected?.key) || prs[0];
  const details = await getDetails(api, pr);
  const chosen = { key: targetKey(pr), target: state.targets[targetKey(pr)], qa: qaState(details.runs) };
  chosen.target.level = classifyQaLevel(pr.body || '', details.files);
  const body = renderState(chosen, state);
  const mutation = chooseCommentMutation(issueComments, body);
  if (!dryRun && mutation.kind !== 'none') {
    try { await api.request(mutation.kind === 'create' ? `/issues/${ISSUE_NUMBER}/comments` : `/issues/comments/${mutation.id}`, { method: mutation.kind === 'create' ? 'POST' : 'PATCH', body: JSON.stringify({ body }) }); }
    catch (error) { chosen.target.stateWriteError = String(error.message || error).slice(0, 500); }
  }
  return { ...mutation, recovery: selected && { target: selected.key, action: selected.action }, state, body };
}

function apiClient(token, repository) {
  const root = `https://api.github.com/repos/${repository}`;
  return { async request(path, options = {}) {
    const response = await fetch(`${root}${path}`, { ...options, headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', ...options.headers } });
    if (!response.ok) throw new Error(`${options.method || 'GET'} ${path}: ${response.status} ${await response.text()}`);
    return response.status === 204 ? null : response.json();
  } };
}

function syntheticEvent(eventName, payload, supplied) {
  if (eventName !== 'workflow_dispatch' || !supplied) return { eventName, payload };
  const value = JSON.parse(supplied);
  return { payload: value, eventName: value.workflow_run ? 'workflow_run' : value.pull_request ? 'pull_request_target' : value.comment ? 'issue_comment' : eventName };
}

async function main() {
  const repository = process.env.REPOSITORY;
  if (!process.env.GITHUB_TOKEN || !repository) throw new Error('GITHUB_TOKEN and REPOSITORY are required');
  const actual = syntheticEvent(process.env.EVENT_NAME, JSON.parse(fs.readFileSync(process.env.EVENT_PATH, 'utf8')), process.env.DISPATCH_EVENT_JSON);
  const result = await processEvent({ api: apiClient(process.env.GITHUB_TOKEN, repository), ...actual, dryRun: process.env.DRY_RUN === 'true', repository, owner: repository.split('/')[0] });
  console.log(JSON.stringify(result));
}

module.exports = { CODEX_ACTOR, MARKER, STALL_MS, atomicTransport, branchCondition, buildTransportPlan, chooseCommentMutation, classifyQaLevel, compactTarget, decide, failureId, isAck, isTarget, isTrustedFinal, newestQaRuns, paginate, parseArtifact, parseRecovery, parseScope, processEvent, qaState, renderState, syntheticEvent, transientEvidence, validPath };
if (require.main === module) main().catch((error) => { console.error(error); process.exitCode = 1; });
