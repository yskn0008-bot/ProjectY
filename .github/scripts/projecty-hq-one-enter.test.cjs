'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  FAILURE_CLASSES,
  MAX_RECOVERY_ATTEMPTS,
  STATES,
  adaptHqPhase,
  createHqBridge,
  makeSyntheticAdapters,
  normalizeFailureClass,
  problemFingerprint,
  runOneEnter,
  transition,
  validateRequest,
} = require('./projecty-hq-one-enter.cjs');

const request = (extra = {}) => ({ id: 'lane4-test', text: '小さなsynthetic開発依頼', mode: 'synthetic', ...extra });
const states = (result) => result.trace.map((entry) => entry.state);

test('declares the exact Lane 4 state and failure vocabularies', () => {
  assert.deepEqual(STATES, [
    'RECEIVED', 'ASSET_SEARCH', 'PLANNED', 'IMPLEMENTING', 'VERIFYING',
    'RECOVERING', 'USABLE', 'OWNER_ACTION_REQUIRED', 'EXTERNAL_WAIT', 'ENDED',
  ]);
  assert.deepEqual(FAILURE_CLASSES, ['CODE_FAILURE', 'TRANSPORT_FAILURE', 'EXTERNAL_FAILURE', 'UNKNOWN_RESULT', 'CONFLICT']);
});

test('synthetic happy path reaches verified USABLE then ENDED', async () => {
  const result = await runOneEnter({ request: request(), adapters: makeSyntheticAdapters() });
  assert.equal(result.usable, true);
  assert.equal(result.state, 'ENDED');
  assert.equal(result.endReason, 'USABLE_VERIFIED');
  assert.deepEqual(states(result), ['RECEIVED', 'ASSET_SEARCH', 'PLANNED', 'IMPLEMENTING', 'VERIFYING', 'USABLE', 'ENDED']);
  assert.equal(result.plan.route, 'REUSE_EXISTING_HQ_WITH_ADAPTER');
  assert.equal(result.artifacts.length, 1);
});

test('intentional first verification failure recovers without discarding the artifact', async () => {
  const result = await runOneEnter({ request: request(), adapters: makeSyntheticAdapters({ failVerificationOnce: true }) });
  assert.equal(result.usable, true);
  assert.deepEqual(states(result), [
    'RECEIVED', 'ASSET_SEARCH', 'PLANNED', 'IMPLEMENTING', 'VERIFYING',
    'RECOVERING', 'VERIFYING', 'USABLE', 'ENDED',
  ]);
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.artifacts[0].id, 'synthetic:lane4-test');
  const attempts = Object.values(result.recovery).map((record) => record.attempts);
  assert.deepEqual(attempts, [1]);
});

test('same problem fingerprint does not reset when head SHA changes', () => {
  const a = problemFingerprint({ target: 'PR#999', failureClass: 'CODE_FAILURE', operation: 'VERIFYING', evidenceKey: 'unit-test', head: 'a'.repeat(40) });
  const b = problemFingerprint({ target: 'PR#999', failureClass: 'CODE_FAILURE', operation: 'VERIFYING', evidenceKey: 'unit-test', head: 'b'.repeat(40) });
  assert.equal(a, b);
});

test('bounded recovery stops after two automatic attempts even when evidence head changes', async () => {
  let verifyCalls = 0;
  const adapters = {
    assetSearch: async () => ({ status: 'ok', candidates: [] }),
    plan: async () => ({ route: 'synthetic', owner: 'YOS', parallel: false }),
    implement: async () => ({ ok: true, artifacts: [{ id: 'fixed-artifact', revision: 1 }] }),
    verify: async ({ context }) => {
      verifyCalls += 1;
      context.request.baseSha = String(verifyCalls).padStart(40, '0');
      return { status: 'failure', failure: { failureClass: 'CODE_FAILURE', evidenceKey: 'same-test', target: 'PR#999' } };
    },
    recover: async () => ({ action: 'RETRY_VERIFY' }),
  };
  const result = await runOneEnter({ request: request({ baseSha: '0'.repeat(40) }), adapters });
  assert.equal(result.usable, false);
  assert.equal(result.state, 'OWNER_ACTION_REQUIRED');
  assert.equal(verifyCalls, MAX_RECOVERY_ATTEMPTS + 1);
  assert.equal(Object.keys(result.recovery).length, 1);
  assert.equal(Object.values(result.recovery)[0].attempts, MAX_RECOVERY_ATTEMPTS);
  assert.equal(result.artifacts[0].id, 'fixed-artifact');
});

test('pending/missing verification is UNKNOWN_RESULT and never becomes success', async () => {
  const adapters = {
    assetSearch: async () => ({ status: 'ok' }),
    plan: async () => ({ route: 'synthetic', owner: 'YOS', parallel: false }),
    implement: async () => ({ ok: true, artifacts: [{ id: 'artifact' }] }),
    verify: async () => ({ status: 'pending', reason: 'required QA has not completed' }),
    recover: async () => ({ action: 'OWNER_ACTION_REQUIRED', reason: 'verification evidence unresolved' }),
  };
  const result = await runOneEnter({ request: request(), adapters });
  assert.equal(result.usable, false);
  assert.equal(result.state, 'OWNER_ACTION_REQUIRED');
  assert.ok(states(result).includes('RECOVERING'));
  const record = Object.values(result.recovery)[0];
  assert.equal(record.failureClass, 'UNKNOWN_RESULT');
});

test('external blocker can pause at EXTERNAL_WAIT without pretending completion', async () => {
  const adapters = {
    assetSearch: async () => ({ status: 'ok' }),
    plan: async () => ({ route: 'synthetic', owner: 'YOS', parallel: false }),
    implement: async () => ({ status: 'EXTERNAL_WAIT', reason: 'provider rate limit' }),
    verify: async () => ({ status: 'success' }),
  };
  const result = await runOneEnter({ request: request(), adapters });
  assert.equal(result.state, 'EXTERNAL_WAIT');
  assert.equal(result.usable, false);
  assert.equal(result.endReason, 'provider rate limit');
});

test('HQ adapter vocabulary maps existing autopilot failure and phase names', () => {
  assert.equal(normalizeFailureClass('ACTION_CODE_FAILURE'), 'CODE_FAILURE');
  assert.equal(normalizeFailureClass('CODEX_PUSH_BLOCKED'), 'TRANSPORT_FAILURE');
  assert.equal(normalizeFailureClass('ACTION_TRANSIENT_FAILURE'), 'EXTERNAL_FAILURE');
  assert.equal(normalizeFailureClass('STALE_QA_STATE'), 'UNKNOWN_RESULT');
  assert.equal(normalizeFailureClass('BRANCH_CONFLICT'), 'CONFLICT');
  assert.equal(adaptHqPhase('RUNNING'), 'IMPLEMENTING');
  assert.equal(adaptHqPhase('AWAITING_QA'), 'VERIFYING');
  assert.equal(adaptHqPhase('QA_SUCCESS'), 'USABLE');
  assert.equal(adaptHqPhase('NEEDS_YOS'), 'OWNER_ACTION_REQUIRED');
});

test('HQ bridge calls existing HQ functions instead of duplicating them', async () => {
  const calls = [];
  const bridge = createHqBridge({
    qaState: (runs) => { calls.push(['qaState', runs.length]); return { next: 'QA_SUCCESS' }; },
    processEvent: async (input) => { calls.push(['processEvent', input.eventName]); return { kind: 'ok' }; },
    classifyQaLevel: (body, files) => { calls.push(['classifyQaLevel', files.length]); return 2; },
  });
  assert.equal(bridge.qaState([{}]).next, 'QA_SUCCESS');
  assert.equal(bridge.classifyQaLevel('', ['x.js']), 2);
  assert.deepEqual(await bridge.processEvent({ eventName: 'workflow_run' }), { kind: 'ok' });
  assert.deepEqual(calls, [['qaState', 1], ['classifyQaLevel', 1], ['processEvent', 'workflow_run']]);
});

test('illegal completion jump is rejected', () => {
  const context = { state: 'RECEIVED', trace: [] };
  assert.throws(() => transition(context, 'USABLE', 'skip'), /illegal One Enter transition/);
});

test('request validation fails closed for malformed base SHA', () => {
  assert.throws(() => validateRequest({ text: 'x', baseSha: 'main' }), /40-char SHA/);
});
