'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CODEX_ACTOR,
  atomicTransport,
  branchCondition,
  buildTransportPlan,
  compactTarget,
  decide,
  newestQaRuns,
  qaState,
  transientEvidence,
} = require('./projecty-hq-autopilot.cjs');

const REPOSITORY = 'yskn0008-bot/ProjectY';
const OWNER = 'yskn0008-bot';
const HEAD = 'a'.repeat(40);
const NEXT_HEAD = 'b'.repeat(40);
const MATRIX = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'projecty-recovery-red-team.json'), 'utf8'));

function ownerPr(head = HEAD) {
  return {
    number: 315,
    state: 'open',
    merged: false,
    user: { login: OWNER },
    author_association: 'OWNER',
    head: { sha: head, ref: 'work/issue-315-recovery-red-team', repo: { full_name: REPOSITORY } },
    base: { ref: 'main', sha: 'c'.repeat(40) },
    mergeable: true,
    mergeable_state: 'clean',
  };
}

function scopeComment(prNumber, allowedPaths) {
  const encoded = Buffer.from(JSON.stringify({
    pr: prNumber,
    allowAutoTransport: true,
    allowedPaths,
  })).toString('base64url');
  return {
    id: 91,
    user: { login: OWNER },
    author_association: 'OWNER',
    body: '<!-- projecty-autopilot-scope:' + encoded + ' -->',
  };
}

function fullArtifact(base, files) {
  const fence = String.fromCharCode(96).repeat(3);
  return [
    'PROJECTY_BASE_HEAD:' + base,
    ...Object.entries(files).flatMap(([name, content]) => [
      'PROJECTY_FULL_FILE:' + name,
      fence,
      content,
      fence,
    ]),
    'Summary',
    'complete artifact',
  ].join('\n');
}

function recordingApi(handler) {
  const calls = [];
  return {
    calls,
    async request(requestPath, options = {}) {
      calls.push({ path: requestPath, options });
      return handler(requestPath, options, calls);
    },
  };
}

function qaRun({ name, head = HEAD, conclusion = 'success', status = 'completed', id = 1, created = '2026-09-13T00:00:00Z' }) {
  return { id, name, head_sha: head, conclusion, status, created_at: created };
}

function simulateLegacySequentialInstall(existing, payloads, failBeforeWriteIndex) {
  const state = new Map(Object.entries(existing));
  const backup = new Map(state);
  let failed = false;
  payloads.forEach(([name, text], index) => {
    if (index === failBeforeWriteIndex) {
      failed = true;
      return;
    }
    if (!failed) state.set(name, text);
  });
  return { state, backup, failed };
}

test('red-team matrix covers every requested failure and forces one of four classifications', () => {
  const expected = new Set([
    'required-qa-missing',
    'required-qa-failure',
    'qa-pending',
    'old-head-success',
    'branch-head-move',
    'write-midway-failure',
    'partial-distribution',
    'github-api-temporary',
    'result-unknown',
    'duplicate-event',
    'retry-limit',
    'codex-unavailable',
    'external-service-outage',
    'branch-conflict',
    'long-stalled',
  ]);
  const actual = new Set(MATRIX.scenarios.map((scenario) => scenario.id));
  assert.deepEqual(actual, expected);
  const allowed = new Set(MATRIX.allowedClassifications);
  for (const scenario of MATRIX.scenarios) {
    assert.ok(allowed.has(scenario.classification), `${scenario.id} must have a bounded classification`);
    assert.ok(scenario.safeNext && scenario.safeNext.length > 5, `${scenario.id} must define a safe next state`);
  }
});

test('required QA missing cannot become QA_SUCCESS', () => {
  const currentHeadRuns = newestQaRuns([
    qaRun({ name: 'Codex governance' }),
  ], HEAD);
  assert.notEqual(qaState(currentHeadRuns).next, 'QA_SUCCESS', 'missing YOS BRAVIA Safety must fail closed');
});

test('required QA failure cannot become QA_SUCCESS even when another QA is green', () => {
  const currentHeadRuns = newestQaRuns([
    qaRun({ name: 'Codex governance', id: 1 }),
    qaRun({ name: 'YOS BRAVIA Safety', conclusion: 'failure', id: 2 }),
  ], HEAD);
  assert.notEqual(qaState(currentHeadRuns).next, 'QA_SUCCESS', 'required BRAVIA failure must not be dropped from the required set');
});

test('required QA pending cannot become QA_SUCCESS', () => {
  const currentHeadRuns = newestQaRuns([
    qaRun({ name: 'Codex governance', id: 1 }),
    qaRun({ name: 'YOS BRAVIA Safety', conclusion: null, status: 'in_progress', id: 2 }),
  ], HEAD);
  assert.notEqual(qaState(currentHeadRuns).next, 'QA_SUCCESS', 'required BRAVIA pending must remain waiting');
});

test('old-head success never certifies the current head', () => {
  const currentHeadRuns = newestQaRuns([
    qaRun({ name: 'Codex governance', head: NEXT_HEAD }),
  ], HEAD);
  assert.equal(currentHeadRuns.length, 0);
  assert.equal(qaState(currentHeadRuns).next, 'QA_BOOTSTRAP_BLOCKED');
});

test('branch head movement must not reset the same failure recovery budget', () => {
  const target = { head: HEAD, phase: 'OBSERVING', failures: {}, seen: [], progressAt: '2026-09-13T00:00:00Z' };
  const first = decide(target, 'ACTION_TRANSIENT_FAILURE', {
    target: 'PR#315',
    head: HEAD,
    workflowId: 'ProjectY HQ Safety',
    runId: 10,
    delivery: 'delivery-1',
  });
  target.failures[first.id] = first.record;
  assert.equal(first.action, 'RERUN_FAILED');

  const moved = compactTarget(target, ownerPr(NEXT_HEAD), Date.parse('2026-09-13T00:05:00Z'));
  const afterMove = decide(moved, 'ACTION_TRANSIENT_FAILURE', {
    target: 'PR#315',
    head: NEXT_HEAD,
    workflowId: 'ProjectY HQ Safety',
    runId: 11,
    delivery: 'delivery-2',
  });
  assert.notEqual(afterMove.action, 'RERUN_FAILED', 'head movement must not grant a fresh first retry for the same underlying failure');
});

test('atomic write failure before ref switch leaves branch head untouched', async () => {
  let blobWrites = 0;
  const api = recordingApi((requestPath, options) => {
    if (requestPath.startsWith('/git/ref/heads/')) return { object: { sha: HEAD } };
    if (requestPath === '/git/commits/' + HEAD && !options.method) return { tree: { sha: 'base-tree' } };
    if (requestPath === '/git/blobs') {
      blobWrites += 1;
      if (blobWrites === 2) throw new Error('synthetic blob write failure');
      return { sha: 'blob-1' };
    }
    throw new Error('unexpected request ' + requestPath);
  });

  await assert.rejects(() => atomicTransport(api, {
    base: HEAD,
    branch: 'work/issue-315-recovery-red-team',
    files: [
      { path: 'docs/a.md', content: 'new-a' },
      { path: 'docs/b.md', content: 'new-b' },
    ],
  }), /synthetic blob write failure/);

  assert.equal(api.calls.some((call) => call.path.startsWith('/git/refs/heads/') && call.options.method === 'PATCH'), false, 'branch ref must not move after partial staging');
});

test('partial transport artifact is rejected before distribution', () => {
  const pr = ownerPr();
  const allowed = ['docs/a.md', 'docs/b.md'];
  const comment = {
    user: { login: CODEX_ACTOR },
    body: fullArtifact(HEAD, { 'docs/a.md': 'new-a' }),
  };
  const plan = buildTransportPlan({
    comment,
    comments: [scopeComment(pr.number, allowed)],
    pr,
    repository: REPOSITORY,
    owner: OWNER,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.reason, 'SCOPE_MISMATCH');
});

test('legacy sequential installer fixture reproduces new-old mixed state after a midway failure', () => {
  const payloads = [
    ['A.js', 'new-A'],
    ['B.js', 'new-B'],
    ['C.js', 'new-C'],
    ['D.js', 'new-D'],
  ];
  const result = simulateLegacySequentialInstall({
    'A.js': 'old-A',
    'B.js': 'old-B',
    'C.js': 'old-C',
    'D.js': 'old-D',
  }, payloads, 2);

  assert.equal(result.failed, true);
  assert.equal(result.state.get('A.js'), 'new-A');
  assert.equal(result.state.get('B.js'), 'new-B');
  assert.equal(result.state.get('C.js'), 'old-C');
  assert.equal(result.state.get('D.js'), 'old-D');
  assert.deepEqual([...result.backup.values()], ['old-A', 'old-B', 'old-C', 'old-D']);
});

test('GitHub API temporary failure gets one bounded retry, then external wait instead of owner escalation', () => {
  const target = { failures: {} };
  const evidence = { target: 'PR#315', head: HEAD, workflowId: 99, runId: 100 };

  const first = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...evidence, delivery: 'api-1' });
  target.failures[first.id] = first.record;
  assert.equal(first.action, 'RERUN_FAILED');

  const duplicate = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...evidence, delivery: 'api-1' });
  assert.equal(duplicate.action, 'NONE');

  const second = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...evidence, delivery: 'api-2' });
  target.failures[second.id] = second.record;
  const exhausted = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...evidence, delivery: 'api-3' });
  assert.equal(exhausted.action, 'WAIT_EXTERNAL', 'persistent external outage must wait for provider recovery, not ask the owner to debug GitHub');
});

test('unknown external write result stops retry until reconciliation', () => {
  const target = { failures: {} };
  const decision = decide(target, 'RESULT_UNKNOWN', {
    target: 'PR#315',
    head: HEAD,
    delivery: 'write-timeout-1',
  });
  assert.equal(decision.action, 'WAIT_EXTERNAL', 'unknown result must not trigger a blind irreversible retry');
});

test('duplicate event delivery is a no-op and cannot repeat a side effect', () => {
  const target = { failures: {} };
  const evidence = { target: 'PR#315', head: HEAD, workflowId: 8, runId: 9, delivery: 'same-delivery' };
  const first = decide(target, 'ACTION_TRANSIENT_FAILURE', evidence);
  target.failures[first.id] = first.record;
  assert.equal(first.action, 'RERUN_FAILED');
  const duplicate = decide(target, 'ACTION_TRANSIENT_FAILURE', evidence);
  assert.equal(duplicate.action, 'NONE');
});

test('recovery retries are bounded and never loop indefinitely', () => {
  const target = { failures: {} };
  const evidence = { target: 'PR#315', head: HEAD, workflowId: 8, runId: 9 };
  const first = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...evidence, delivery: 'one' });
  target.failures[first.id] = first.record;
  const second = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...evidence, delivery: 'two' });
  target.failures[second.id] = second.record;
  const third = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...evidence, delivery: 'three' });
  assert.equal(first.record.attempts, 1);
  assert.equal(second.record.attempts, 2);
  assert.ok(['WAIT_EXTERNAL', 'NEEDS_YOS'].includes(third.action), 'third transition must leave the retry loop');
});

test('Codex unavailable/no artifact uses a bounded transport recovery path', () => {
  const target = { failures: {} };
  const first = decide(target, 'CODEX_RESULT_NO_GITHUB_ARTIFACT', {
    target: 'PR#315',
    head: HEAD,
    delivery: 'codex-limit-1',
  });
  target.failures[first.id] = first.record;
  assert.equal(first.action, 'REQUEST_TRANSPORT');
  const second = decide(target, 'CODEX_RESULT_NO_GITHUB_ARTIFACT', {
    target: 'PR#315',
    head: HEAD,
    delivery: 'codex-limit-2',
  });
  assert.notEqual(second.action, 'REQUEST_TRANSPORT', 'Codex recovery request must not recurse forever');
});

test('external service outage is recognized as transient evidence', () => {
  const proof = transientEvidence([
    {
      conclusion: 'failure',
      name: 'GitHub API',
      runner_name: 'Hosted runner',
      steps: [{ conclusion: 'failure', name: 'Service unavailable HTTP 503' }],
    },
  ]);
  assert.equal(proof.proven, true);
});

test('true branch conflict is classified for owner decision instead of guessed resolution', () => {
  const pr = ownerPr();
  pr.mergeable = false;
  pr.mergeable_state = 'dirty';
  assert.equal(branchCondition(pr), 'BRANCH_CONFLICT');
  const scenario = MATRIX.scenarios.find((item) => item.id === 'branch-conflict');
  assert.equal(scenario.classification, '本人判断必要');
});

test('long stalled task gets one bounded status recovery and then leaves the loop', () => {
  const target = { failures: {} };
  const first = decide(target, 'TASK_STALLED', { target: 'PR#315', head: HEAD, delivery: 'stall-1' });
  target.failures[first.id] = first.record;
  assert.equal(first.action, 'REQUEST_STATUS');
  const second = decide(target, 'TASK_STALLED', { target: 'PR#315', head: HEAD, delivery: 'stall-2' });
  assert.ok(['WAIT_EXTERNAL', 'NEEDS_YOS'].includes(second.action));
  assert.notEqual(second.action, 'REQUEST_STATUS');
});
