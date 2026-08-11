'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MARKER,
  chooseCommentMutation,
  classifyQaLevel,
  processEvent,
  workflowRunState,
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

test('workflow results are accepted only for the current PR head', () => {
  const pr = { number: 19, head: { sha: 'current' } };
  assert.equal(workflowRunState({ head_sha: 'old', name: 'QA', conclusion: 'success' }, pr), null);
  const state = workflowRunState({ head_sha: 'current', name: 'QA', conclusion: 'failure' }, pr);
  assert.equal(state.status, 'QA failure');
  assert.match(state.nextStep, /Codex/);
});

test('manual dry-run evaluates a PR payload without making a write', async () => {
  const writes = [];
  const api = {
    async request(path, options = {}) {
      if (options.method) writes.push([path, options.method]);
      if (path.startsWith('/pulls/4/files')) return [{ filename: 'taxi/index.html' }];
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

test('hourly audit is silent when the latest head is already recorded', async () => {
  const api = {
    async request(path) {
      if (path.startsWith('/pulls?')) return [{ number: 8, head: { sha: 'same' } }];
      if (path.startsWith('/issues/232/comments')) {
        return [{ id: 1, body: `${MARKER}\n- current head: \`same\`` }];
      }
      throw new Error(`unexpected request: ${path}`);
    },
  };
  const result = await processEvent({ api, eventName: 'schedule', payload: {}, dryRun: false });
  assert.equal(result.kind, 'none');
});
