'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MARKER,
  chooseCommentMutation,
  classifyQaLevel,
  newestQaRuns,
  processEvent,
  qaState,
} = require('./projecty-hq-autopilot.cjs');

test('Level 1 requires an explicit declaration and UI-only files', () => {
  assert.equal(classifyQaLevel('QA Level 1', ['taxi/styles/main.css', 'taxi/index.html']), 1);
  assert.equal(classifyQaLevel('QA Level 1｜軽微UI変更', [
    'taxi/final-app-v131.css',
    'taxi/final-app-v131.js',
  ]), 1);
  assert.equal(classifyQaLevel('', ['taxi/styles/main.css']), 2);
  assert.equal(classifyQaLevel('Level 1', ['taxi/app.js']), 2);
  assert.equal(classifyQaLevel('QA Level 1', ['taxi/final-app.js']), 2);
});

test('sensitive paths are always Level 3', () => {
  assert.equal(classifyQaLevel('Level 1', ['taxi/service-worker.js']), 3);
  assert.equal(classifyQaLevel('Level 1', ['.github/workflows/check.yml']), 3);
  assert.equal(classifyQaLevel('', ['life/api/client.ts']), 3);
});

test('managed state is updated in place and identical state makes no write', () => {
  const body = `${MARKER}\nstate`;
  assert.deepEqual(chooseCommentMutation([{ id: 7, body }], body), { kind: 'none' });
  assert.deepEqual(chooseCommentMutation([{ id: 7, body }], `${body}!`), {
    kind: 'update', id: 7, body: `${body}!`,
  });
  assert.equal(chooseCommentMutation([], body).kind, 'create');
});

test('newest current-head success replaces a stale failure for each workflow', () => {
  const runs = newestQaRuns([
    { id: 9, name: 'Codex governance', head_sha: 'same', conclusion: 'failure', created_at: '2026-08-16T10:00:00Z' },
    { id: 10, name: 'Codex governance', head_sha: 'same', conclusion: 'success', created_at: '2026-08-16T10:05:00Z' },
    { id: 11, name: 'Codex governance', head_sha: 'old', conclusion: 'failure', created_at: '2026-08-16T10:10:00Z' },
    { id: 12, name: 'unrelated fan-out', head_sha: 'same', conclusion: 'failure', created_at: '2026-08-16T10:15:00Z' },
  ], 'same');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].conclusion, 'success');
  assert.match(qaState(runs).nextStep, /QA成功/);
});

test('manual dry-run evaluates a PR payload without making a write', async () => {
  const writes = [];
  const api = {
    async request(path, options = {}) {
      if (options.method) writes.push([path, options.method]);
      if (path.startsWith('/pulls/4/files')) return [{ filename: 'taxi/index.html' }];
      if (path.startsWith('/actions/runs?')) return { workflow_runs: [] };
      if (path.startsWith('/issues/232/comments')) return [];
      throw new Error(`unexpected request: ${path}`);
    },
  };
  const result = await processEvent({
    api,
    eventName: 'pull_request',
    payload: { action: 'synchronize', pull_request: { number: 4, body: 'Level 1', head: { sha: 'abc' } } },
    dryRun: true,
  });
  assert.equal(result.kind, 'create');
  assert.deepEqual(writes, []);
});

test('scheduled audit detects a QA change on the same head', async () => {
  const requested = [];
  const api = {
    async request(path) {
      requested.push(path);
      if (path.startsWith('/pulls?')) return [{ number: 8, body: '', head: { sha: 'same' } }];
      if (path.startsWith('/pulls/8/files')) return [{ filename: 'life/app.js' }];
      if (path.startsWith('/actions/runs?')) return { workflow_runs: [
        { id: 2, name: 'Codex governance', head_sha: 'same', conclusion: 'success', created_at: '2026-08-16T11:00:00Z' },
      ] };
      if (path.startsWith('/issues/232/comments')) {
        return [{ id: 1, body: `${MARKER}\n- current head: \`same\`\n- 状態: current-head QA: Codex governance=failure` }];
      }
      throw new Error(`unexpected request: ${path}`);
    },
  };
  const result = await processEvent({ api, eventName: 'schedule', payload: {}, dryRun: true });
  assert.equal(result.kind, 'update');
  assert.match(result.body, /Codex governance=success/);
  assert.ok(requested.some((path) => path.startsWith('/actions/runs?head_sha=same')));
});

test('late stale workflow delivery rebuilds state from latest current-head evidence', async () => {
  const api = {
    async request(path) {
      if (path === '/pulls/21') return { number: 21, body: '', head: { sha: 'head' } };
      if (path.startsWith('/pulls/21/files')) return [{ filename: 'life/view.js' }];
      if (path.startsWith('/actions/runs?')) return { workflow_runs: [
        { id: 5, name: 'Codex governance', head_sha: 'head', conclusion: 'failure', created_at: '2026-08-16T09:00:00Z' },
        { id: 6, name: 'Codex governance', head_sha: 'head', conclusion: 'success', created_at: '2026-08-16T09:05:00Z' },
      ] };
      if (path.startsWith('/issues/232/comments')) return [];
      throw new Error(`unexpected request: ${path}`);
    },
  };
  const result = await processEvent({
    api,
    eventName: 'workflow_run',
    payload: { workflow_run: {
      id: 5,
      name: 'Codex governance',
      head_sha: 'head',
      conclusion: 'failure',
      pull_requests: [{ number: 21 }],
    } },
    dryRun: true,
  });
  assert.equal(result.kind, 'create');
  assert.match(result.body, /Codex governance=success/);
  assert.doesNotMatch(result.body, /Codex governance=failure/);
});
