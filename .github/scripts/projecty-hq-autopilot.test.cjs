'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CODEX_ACTOR,
  MARKER,
  STALL_MS,
  atomicTransport,
  branchCondition,
  buildTransportPlan,
  chooseCommentMutation,
  classifyQaLevel,
  decide,
  isAck,
  isTarget,
  isTrustedFinal,
  newestQaRuns,
  paginate,
  parseArtifact,
  parseRecovery,
  processEvent,
  qaState,
  syntheticEvent,
  transientEvidence,
  validPath,
} = require('./projecty-hq-autopilot.cjs');

const REPOSITORY = 'yskn0008-bot/ProjectY';
const OWNER = 'yskn0008-bot';
const HEAD = 'a'.repeat(40);

function ownerPr(overrides = {}) {
  return {
    number: 4,
    state: 'open',
    merged: false,
    body: '',
    updated_at: '2026-08-21T20:00:00Z',
    user: { login: OWNER },
    author_association: 'OWNER',
    head: { sha: HEAD, ref: 'codex/issue-232', repo: { full_name: REPOSITORY } },
    base: { ref: 'main', sha: 'b'.repeat(40) },
    mergeable: true,
    mergeable_state: 'clean',
    ...overrides,
  };
}

function managedComment(state, id = 1) {
  const encoded = Buffer.from(JSON.stringify(state)).toString('base64url');
  return { id, body: MARKER + '\n<!-- projecty-hq-recovery:' + encoded + ' -->' };
}

function scopeComment(prNumber, allowedPaths, allowAutoTransport = true) {
  const encoded = Buffer.from(JSON.stringify({
    pr: prNumber,
    allowAutoTransport,
    allowedPaths,
  })).toString('base64url');
  return {
    id: 9,
    user: { login: OWNER },
    author_association: 'OWNER',
    body: '<!-- projecty-autopilot-scope:' + encoded + ' -->',
  };
}

function fullArtifact(base, files) {
  const fence = String.fromCharCode(96).repeat(3);
  const blocks = Object.entries(files).flatMap(([name, content]) => [
    'PROJECTY_FULL_FILE:' + name,
    fence,
    content,
    fence,
  ]);
  return ['PROJECTY_BASE_HEAD:' + base, ...blocks, 'Summary', 'complete artifact'].join('\n');
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

test('QA classification preserves Level 1 boundaries and sensitive Level 3 paths', () => {
  assert.equal(classifyQaLevel('QA Level 1', ['life/index.html', 'life/styles/main.css']), 1);
  assert.equal(classifyQaLevel('', ['life/index.html']), 2);
  assert.equal(classifyQaLevel('QA Level 1', ['life/app.js']), 2);
  assert.equal(classifyQaLevel('QA Level 1', ['life/service-worker.js']), 3);
  assert.equal(classifyQaLevel('QA Level 1', ['.github/workflows/check.yml']), 3);
});

test('owner-only same-repository open PR is the complete target boundary', () => {
  assert.equal(isTarget(ownerPr(), REPOSITORY, OWNER), true);
  assert.equal(isTarget(ownerPr({ user: { login: 'other' } }), REPOSITORY, OWNER), false);
  assert.equal(isTarget(ownerPr({ author_association: 'MEMBER' }), REPOSITORY, OWNER), false);
  assert.equal(isTarget(ownerPr({ state: 'closed' }), REPOSITORY, OWNER), false);
  assert.equal(isTarget(ownerPr({ head: { sha: HEAD, ref: 'main', repo: { full_name: REPOSITORY } } }), REPOSITORY, OWNER), false);
  assert.equal(isTarget(ownerPr({ head: { sha: HEAD, ref: 'feature', repo: { full_name: 'other/fork' } } }), REPOSITORY, OWNER), false);
});

test('branch condition distinguishes a safe behind update from a conflict', () => {
  assert.equal(branchCondition(ownerPr({ mergeable: true, mergeable_state: 'behind' })), 'BRANCH_BEHIND');
  assert.equal(branchCondition(ownerPr({ mergeable: false, mergeable_state: 'dirty' })), 'BRANCH_CONFLICT');
  assert.equal(branchCondition(ownerPr()), null);
});

test('managed state updates in place and identical state makes no write', () => {
  const body = MARKER + '\nstate';
  assert.deepEqual(chooseCommentMutation([{ id: 7, body }], body), { kind: 'none' });
  assert.deepEqual(chooseCommentMutation([{ id: 7, body }], body + '!'), {
    kind: 'update',
    id: 7,
    body: body + '!',
  });
  assert.equal(chooseCommentMutation([], body).kind, 'create');
});

test('newest current-head success replaces stale and unrelated failures', () => {
  const runs = newestQaRuns([
    { id: 9, name: 'Codex governance', head_sha: HEAD, conclusion: 'failure', created_at: '2026-08-21T10:00:00Z' },
    { id: 10, name: 'Codex governance', head_sha: HEAD, conclusion: 'success', created_at: '2026-08-21T10:05:00Z' },
    { id: 11, name: 'Codex governance', head_sha: 'old', conclusion: 'failure', created_at: '2026-08-21T10:10:00Z' },
    { id: 12, name: 'unrelated fan-out', head_sha: HEAD, conclusion: 'failure', created_at: '2026-08-21T10:15:00Z' },
  ], HEAD);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].conclusion, 'success');
  assert.equal(qaState(runs).next, 'QA_SUCCESS');
  assert.equal(qaState([]).next, 'QA_BOOTSTRAP_BLOCKED');
});

test('pagination continues past 100 rows', async () => {
  const api = recordingApi((requestPath) => {
    const page = new URL('https://example.invalid' + requestPath).searchParams.get('page');
    if (page === '1') return Array.from({ length: 100 }, (_, id) => ({ id }));
    if (page === '2') return [{ id: 100 }];
    throw new Error('unexpected request ' + requestPath);
  });
  const rows = await paginate(api, '/issues/232/comments');
  assert.equal(rows.length, 101);
  assert.equal(api.calls.length, 2);
});

test('only a substantive exact Codex final is trusted', () => {
  assert.equal(isAck('On it.'), true);
  assert.equal(isTrustedFinal({ user: { login: CODEX_ACTOR }, body: 'On it.' }), false);
  assert.equal(isTrustedFinal({ user: { login: 'chatgpt-codex-connector' }, body: 'Summary\nDone' }), false);
  assert.equal(isTrustedFinal({ user: { login: CODEX_ACTOR }, body: 'Summary\nDone' }), true);
});

test('artifact parsing and path validation reject traversal', () => {
  const artifact = parseArtifact(fullArtifact(HEAD, { '.github/scripts/a.cjs': 'one' }));
  assert.equal(artifact.base, HEAD);
  assert.equal(artifact.files.get('.github/scripts/a.cjs'), 'one');
  assert.equal(validPath('.github/scripts/a.cjs'), true);
  assert.equal(validPath('../outside'), false);
  assert.equal(validPath('/absolute'), false);
  assert.equal(validPath('a\\b'), false);
});

test('transport requires owner scope and every allowlisted full file', () => {
  const pr = ownerPr();
  const allowed = ['.github/scripts/a.cjs', 'docs/a.md'];
  const comment = {
    user: { login: CODEX_ACTOR },
    body: fullArtifact(HEAD, {
      '.github/scripts/a.cjs': 'one',
      'docs/a.md': 'two',
    }),
  };
  const ok = buildTransportPlan({
    comment,
    comments: [scopeComment(pr.number, allowed)],
    pr,
    repository: REPOSITORY,
    owner: OWNER,
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.files.map((file) => file.path), allowed);

  const partial = {
    ...comment,
    body: fullArtifact(HEAD, { '.github/scripts/a.cjs': 'one' }),
  };
  assert.equal(buildTransportPlan({
    comment: partial,
    comments: [scopeComment(pr.number, allowed)],
    pr,
    repository: REPOSITORY,
    owner: OWNER,
  }).reason, 'SCOPE_MISMATCH');
  assert.equal(buildTransportPlan({
    comment,
    comments: [],
    pr,
    repository: REPOSITORY,
    owner: OWNER,
  }).reason, 'OWNER_SCOPE_REQUIRED');
});

test('atomic transport creates one commit and performs a non-force head update', async () => {
  let refReads = 0;
  let updateBody;
  const api = recordingApi((requestPath, options) => {
    if (requestPath.startsWith('/git/ref/heads/')) {
      refReads += 1;
      return { object: { sha: HEAD } };
    }
    if (requestPath === '/git/commits/' + HEAD && !options.method) return { tree: { sha: 'base-tree' } };
    if (requestPath === '/git/blobs') return { sha: 'blob-' + api.calls.length };
    if (requestPath === '/git/trees') return { sha: 'new-tree' };
    if (requestPath === '/git/commits' && options.method === 'POST') return { sha: 'new-commit' };
    if (requestPath.startsWith('/git/refs/heads/')) {
      updateBody = JSON.parse(options.body);
      return {};
    }
    throw new Error('unexpected request ' + requestPath);
  });
  const sha = await atomicTransport(api, {
    base: HEAD,
    branch: 'codex/issue-232',
    files: [
      { path: '.github/scripts/a.cjs', content: 'one' },
      { path: 'docs/a.md', content: 'two' },
    ],
  });
  assert.equal(sha, 'new-commit');
  assert.equal(refReads, 2);
  assert.deepEqual(updateBody, { sha: 'new-commit', force: false });
});

test('atomic transport stops on a concurrent head move', async () => {
  let refReads = 0;
  const api = recordingApi((requestPath, options) => {
    if (requestPath.startsWith('/git/ref/heads/')) {
      refReads += 1;
      return { object: { sha: refReads === 1 ? HEAD : 'c'.repeat(40) } };
    }
    if (requestPath === '/git/commits/' + HEAD) return { tree: { sha: 'base-tree' } };
    if (requestPath === '/git/blobs') return { sha: 'blob' };
    if (requestPath === '/git/trees') return { sha: 'tree' };
    if (requestPath === '/git/commits' && options.method === 'POST') return { sha: 'commit' };
    throw new Error('unexpected request ' + requestPath);
  });
  await assert.rejects(() => atomicTransport(api, {
    base: HEAD,
    branch: 'feature',
    files: [{ path: 'docs/a.md', content: 'one' }],
  }), /TRANSPORT_HEAD_RACE/);
  assert.equal(api.calls.some((call) => call.path.startsWith('/git/refs/heads/')), false);
});

test('bounded transient ladder is idempotent and cannot repeat forever', () => {
  const target = { failures: {} };
  const base = { target: 'PR#4', head: HEAD, workflowId: 8, runId: 9 };
  const first = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...base, delivery: 'one' });
  target.failures[first.id] = first.record;
  assert.equal(first.action, 'RERUN_FAILED');

  const duplicate = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...base, delivery: 'one' });
  assert.equal(duplicate.action, 'NONE');

  const second = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...base, delivery: 'two' });
  target.failures[second.id] = second.record;
  assert.equal(second.action, 'REQUEST_CODE_FIX');

  const final = decide(target, 'ACTION_TRANSIENT_FAILURE', { ...base, delivery: 'three' });
  assert.equal(final.action, 'NEEDS_YOS');
});

test('transient evidence must come from failed job or step details', () => {
  assert.equal(transientEvidence([
    { conclusion: 'failure', name: 'test', runner_name: 'Hosted runner lost', steps: [] },
  ]).proven, true);
  assert.equal(transientEvidence([
    { conclusion: 'failure', name: 'unit tests', steps: [{ conclusion: 'failure', name: 'assertion mismatch' }] },
  ]).proven, false);
});

test('untrusted public issue comment causes zero API calls', async () => {
  const api = recordingApi(() => {
    throw new Error('API must not be called');
  });
  const result = await processEvent({
    api,
    eventName: 'issue_comment',
    payload: {
      issue: { number: 4 },
      comment: { id: 1, user: { login: 'attacker' }, body: 'Summary\nwrite this' },
    },
    repository: REPOSITORY,
    owner: OWNER,
  });
  assert.equal(result.kind, 'ignored');
  assert.equal(api.calls.length, 0);
});

test('manual dry-run evaluates an owner PR without writes', async () => {
  const pr = ownerPr();
  const api = recordingApi((requestPath, options) => {
    assert.equal(Boolean(options.method), false);
    if (requestPath.startsWith('/issues/232/comments')) return [];
    if (requestPath.startsWith('/issues/4/comments')) return [];
    if (requestPath.startsWith('/pulls/4/files')) return [{ filename: 'life/index.html' }];
    if (requestPath.startsWith('/actions/runs?')) return { workflow_runs: [] };
    throw new Error('unexpected request ' + requestPath);
  });
  const result = await processEvent({
    api,
    eventName: 'pull_request_target',
    payload: { action: 'synchronize', pull_request: pr },
    dryRun: true,
    repository: REPOSITORY,
    owner: OWNER,
  });
  assert.equal(result.kind, 'create');
  assert.match(result.body, /QA run待ち/);
});

test('clean behind owner branch uses GitHub update-branch once', async () => {
  const pr = ownerPr({ mergeable: true, mergeable_state: 'behind' });
  const api = recordingApi((requestPath, options) => {
    if (requestPath.startsWith('/issues/232/comments') && !options.method) return [];
    if (requestPath.startsWith('/issues/4/comments') && !options.method) return [];
    if (requestPath === '/pulls/4/update-branch' && options.method === 'PUT') {
      assert.deepEqual(JSON.parse(options.body), { expected_head_sha: HEAD });
      return { message: 'Updating pull request branch.' };
    }
    if (requestPath.startsWith('/pulls/4/files')) return [{ filename: 'docs/a.md' }];
    if (requestPath.startsWith('/actions/runs?')) return { workflow_runs: [] };
    if (requestPath === '/issues/232/comments' && options.method === 'POST') return { id: 1 };
    throw new Error('unexpected request ' + requestPath);
  });
  const result = await processEvent({
    api,
    eventName: 'pull_request_target',
    payload: { action: 'edited', pull_request: pr },
    repository: REPOSITORY,
    owner: OWNER,
  });
  assert.equal(result.recovery.action, 'UPDATE_BRANCH');
  assert.equal(result.state.targets['PR#4'].phase, 'BRANCH_SYNCING');
  assert.equal(api.calls.filter((call) => call.path === '/pulls/4/update-branch').length, 1);
});

test('branch conflict is recorded as NEEDS_YOS without attempting an update', async () => {
  const pr = ownerPr({ mergeable: false, mergeable_state: 'dirty' });
  const api = recordingApi((requestPath) => {
    if (requestPath.startsWith('/issues/232/comments')) return [];
    if (requestPath.startsWith('/issues/4/comments')) return [];
    if (requestPath.startsWith('/pulls/4/files')) return [{ filename: 'docs/a.md' }];
    if (requestPath.startsWith('/actions/runs?')) return { workflow_runs: [] };
    throw new Error('unexpected request ' + requestPath);
  });
  const result = await processEvent({
    api,
    eventName: 'pull_request_target',
    payload: { action: 'synchronize', pull_request: pr },
    dryRun: true,
    repository: REPOSITORY,
    owner: OWNER,
  });
  assert.equal(result.recovery.action, 'NEEDS_YOS');
  assert.equal(result.state.targets['PR#4'].phase, 'NEEDS_YOS');
  assert.equal(api.calls.some((call) => call.path.includes('update-branch')), false);
});

test('workflow action API failure is persisted in managed recovery state', async () => {
  const pr = ownerPr({ number: 21 });
  const run = {
    id: 44,
    workflow_id: 77,
    name: 'Codex governance',
    head_sha: HEAD,
    conclusion: 'failure',
    created_at: '2026-08-21T20:00:00Z',
    pull_requests: [{ number: 21 }],
  };
  let writtenBody = '';
  const api = recordingApi((requestPath, options) => {
    if (requestPath.startsWith('/issues/232/comments') && !options.method) return [];
    if (requestPath === '/pulls/21') return pr;
    if (requestPath.startsWith('/issues/21/comments')) return [];
    if (requestPath.startsWith('/actions/runs/44/jobs')) {
      return { jobs: [{ conclusion: 'failure', name: 'build', runner_name: 'Hosted runner lost', steps: [] }] };
    }
    if (requestPath === '/actions/runs/44/rerun-failed-jobs') throw new Error('HTTP 503 Service Unavailable');
    if (requestPath.startsWith('/pulls/21/files')) return [{ filename: 'docs/a.md' }];
    if (requestPath.startsWith('/actions/runs?')) return { workflow_runs: [run] };
    if (requestPath === '/issues/232/comments' && options.method === 'POST') {
      writtenBody = JSON.parse(options.body).body;
      return { id: 3 };
    }
    throw new Error('unexpected request ' + requestPath);
  });
  const result = await processEvent({
    api,
    eventName: 'workflow_run',
    payload: { workflow_run: run },
    repository: REPOSITORY,
    owner: OWNER,
  });
  const target = result.state.targets['PR#21'];
  assert.equal(target.phase, 'RECOVERY_API_FAILED');
  assert.match(Object.values(target.failures)[0].lastError, /503/);
  assert.match(writtenBody, /projecty-hq-recovery:/);
  assert.match(JSON.stringify(parseRecovery([{ body: writtenBody }])), /503/);
});

test('current-head action-required QA approval is narrowly continued', async () => {
  const pr = ownerPr({ number: 9 });
  const state = {
    version: 4,
    targets: {
      'PR#9': {
        head: HEAD,
        phase: 'AWAITING_QA',
        failures: {},
        seen: [],
        progressAt: '2026-08-21T19:00:00Z',
      },
    },
  };
  const run = {
    id: 88,
    name: 'Codex governance',
    head_sha: HEAD,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'action_required',
    created_at: '2026-08-21T20:00:00Z',
    pull_requests: [{ number: 9 }],
  };
  const api = recordingApi((requestPath, options) => {
    if (requestPath.startsWith('/issues/232/comments') && !options.method) return [managedComment(state)];
    if (requestPath === '/pulls/9') return pr;
    if (requestPath.startsWith('/actions/runs?')) return { workflow_runs: [run] };
    if (requestPath === '/actions/runs/88/approve' && options.method === 'POST') return {};
    if (requestPath.startsWith('/pulls/9/files')) return [{ filename: 'docs/a.md' }];
    if (requestPath === '/issues/comments/1' && options.method === 'PATCH') return {};
    throw new Error('unexpected request ' + requestPath);
  });
  const result = await processEvent({
    api,
    eventName: 'schedule',
    payload: {},
    now: Date.parse('2026-08-21T20:00:00Z'),
    repository: REPOSITORY,
    owner: OWNER,
  });
  assert.equal(result.recovery.action, 'APPROVE_QA');
  assert.equal(api.calls.filter((call) => call.path === '/actions/runs/88/approve').length, 1);
});

test('watchdog performs only one stalled recovery action per schedule', async () => {
  const old = '2026-08-21T18:00:00Z';
  const state = {
    version: 4,
    targets: {
      'PR#1': { head: HEAD, phase: 'RUNNING', failures: {}, seen: [], progressAt: old, runningSince: old },
      'PR#2': { head: 'd'.repeat(40), phase: 'RUNNING', failures: {}, seen: [], progressAt: old, runningSince: old },
    },
  };
  const pr1 = ownerPr({ number: 1 });
  const pr2 = ownerPr({
    number: 2,
    head: { sha: 'd'.repeat(40), ref: 'feature-two', repo: { full_name: REPOSITORY } },
  });
  const api = recordingApi((requestPath, options) => {
    if (requestPath.startsWith('/issues/232/comments') && !options.method) return [managedComment(state, 5)];
    if (requestPath === '/pulls/1') return pr1;
    if (requestPath === '/pulls/2') return pr2;
    if (requestPath === '/issues/1/comments' && options.method === 'POST') return { id: 10 };
    if (requestPath.startsWith('/pulls/1/files')) return [{ filename: 'docs/a.md' }];
    if (requestPath.startsWith('/actions/runs?')) return { workflow_runs: [] };
    if (requestPath === '/issues/comments/5' && options.method === 'PATCH') return {};
    throw new Error('unexpected request ' + requestPath);
  });
  const result = await processEvent({
    api,
    eventName: 'schedule',
    payload: {},
    now: Date.parse(old) + STALL_MS + 1,
    repository: REPOSITORY,
    owner: OWNER,
  });
  assert.equal(result.recovery.action, 'REQUEST_STATUS');
  assert.equal(api.calls.filter((call) => call.path === '/issues/1/comments').length, 1);
  assert.equal(api.calls.filter((call) => call.path === '/issues/2/comments').length, 0);
});

test('workflow-run delivery rebuilds state from latest current-head evidence', async () => {
  const pr = ownerPr({ number: 21 });
  const stale = {
    id: 5,
    name: 'Codex governance',
    head_sha: HEAD,
    conclusion: 'failure',
    created_at: '2026-08-21T09:00:00Z',
    pull_requests: [{ number: 21 }],
  };
  const latest = {
    id: 6,
    name: 'Codex governance',
    head_sha: HEAD,
    conclusion: 'success',
    created_at: '2026-08-21T09:05:00Z',
  };
  const api = recordingApi((requestPath) => {
    if (requestPath.startsWith('/issues/232/comments')) return [];
    if (requestPath === '/pulls/21') return pr;
    if (requestPath.startsWith('/issues/21/comments')) return [];
    if (requestPath.startsWith('/actions/runs/5/jobs')) return { jobs: [] };
    if (requestPath.startsWith('/pulls/21/files')) return [{ filename: 'docs/a.md' }];
    if (requestPath.startsWith('/actions/runs?')) return { workflow_runs: [stale, latest] };
    throw new Error('unexpected request ' + requestPath);
  });
  const result = await processEvent({
    api,
    eventName: 'workflow_run',
    payload: { workflow_run: stale },
    dryRun: true,
    repository: REPOSITORY,
    owner: OWNER,
  });
  assert.match(result.body, /Codex governance=success/);
  assert.doesNotMatch(result.body, /Codex governance=failure/);
});

test('synthetic manual payload selects only an explicit supported event shape', () => {
  const prPayload = { pull_request: ownerPr() };
  assert.equal(syntheticEvent('workflow_dispatch', {}, JSON.stringify(prPayload)).eventName, 'pull_request_target');
  const untouched = syntheticEvent('schedule', { value: 1 }, '');
  assert.equal(untouched.eventName, 'schedule');
});

test('production workflow is trusted-base, event-driven, and has a five-minute watchdog', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../workflows/projecty-hq-autopilot.yml'), 'utf8');
  assert.match(workflow, /^  pull_request_target:/m);
  assert.match(workflow, /^  issue_comment:/m);
  assert.match(workflow, /cron: '\*\/5 \* \* \* \*'/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /contents: write/);
  assert.match(workflow, /pull-requests: write/);
  assert.doesNotMatch(workflow, /^  pull_request:/m);
  assert.doesNotMatch(workflow, /github\.workflow_sha/);
  assert.doesNotMatch(workflow, /git push/);
});

test('write-capable implementation never shells out or touches product paths', () => {
  const source = fs.readFileSync(path.join(__dirname, 'projecty-hq-autopilot.cjs'), 'utf8');
  assert.doesNotMatch(source, /node:child_process|execSync|spawnSync/);
  assert.doesNotMatch(source, /['"]\/(?:taxi|life|yos|nav|server)\//);
  const docs = fs.readFileSync(path.join(__dirname, '../../docs/ISSUE_232_AUTOCONTINUE.md'), 'utf8');
  assert.match(docs, /main上の本稼働確認/);
  assert.match(docs, /自動マージ、本番公開/);
});
