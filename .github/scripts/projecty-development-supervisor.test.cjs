'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  completionState,
  deterministicDecision,
  normalizeTaskContract,
  shouldNotify,
  supervisorFingerprint,
  toLegacyDecision,
} = require('./projecty-development-supervisor.cjs');

test('task contract reaches COMPLETE only when every criterion is verified', () => {
  const pending = completionState({ objective: 'finish app', completionCriteria: [{ description: 'QA green', verified: true }, { description: 'usable', verified: false }] });
  assert.equal(pending.decision, 'CONTINUE');
  const done = completionState({ objective: 'finish app', completionCriteria: [{ description: 'QA green', verified: true }, { description: 'usable', verified: true }] });
  assert.equal(done.decision, 'COMPLETE');
  assert.equal(shouldNotify(done), true);
});

test('user-only criterion waits for the user instead of pretending completion', () => {
  const state = completionState({ objective: 'ship', completionCriteria: [{ description: 'physical iPhone check', verified: false, userOnly: true }] });
  assert.equal(state.decision, 'WAIT_USER');
  assert.equal(shouldNotify(state), true);
});

test('routine code failure is revised without asking the owner', () => {
  const decision = deterministicDecision({
    target: 'PR#1',
    targetState: { phase: 'NEEDS_YOS', next: 'bounded recovery exhausted', failures: { a: { failureClass: 'ACTION_CODE_FAILURE' } } },
  });
  assert.deepEqual(decision, { decision: 'REVISE', reason: 'routine development recovery: ACTION_CODE_FAILURE', allowedAction: 'REQUEST_CODE_FIX' });
  assert.equal(shouldNotify(decision), false);
});

test('transport and QA bootstrap failures use bounded safe continuation', () => {
  assert.equal(deterministicDecision({ targetState: { phase: 'NEEDS_YOS', failures: { a: { failureClass: 'CODEX_PUSH_BLOCKED' } } } }).allowedAction, 'REQUEST_TRANSPORT');
  assert.equal(deterministicDecision({ targetState: { phase: 'NEEDS_YOS', failures: { a: { failureClass: 'QA_BOOTSTRAP_BLOCKED' } } } }).allowedAction, 'REQUEST_STATUS');
});

test('true conflict and explicit physical boundary return WAIT_USER', () => {
  assert.equal(deterministicDecision({ targetState: { phase: 'NEEDS_YOS', next: 'branch conflict requires scoped human review' } }).decision, 'WAIT_USER');
  assert.equal(deterministicDecision({ targetState: { phase: 'NEEDS_YOS', next: 'physical iPhone verification required' } }).decision, 'WAIT_USER');
});

test('same unresolved problem gets one deterministic supervisor attempt only', () => {
  const first = deterministicDecision({ targetState: { phase: 'NEEDS_YOS', failures: { a: { failureClass: 'TASK_STALLED' } } } });
  const second = deterministicDecision({ targetState: { phase: 'NEEDS_YOS', failures: { a: { failureClass: 'TASK_STALLED' } } }, alreadyAttempted: true });
  assert.equal(first.decision, 'CONTINUE');
  assert.equal(second.decision, 'WAIT_USER');
});

test('fingerprint ignores head changes and stays tied to the development problem', () => {
  const state = { phase: 'NEEDS_YOS', next: 'x', head: 'a'.repeat(40), failures: { a: { failureClass: 'ACTION_CODE_FAILURE' } } };
  const a = supervisorFingerprint({ target: 'PR#9', targetState: state });
  const b = supervisorFingerprint({ target: 'PR#9', targetState: { ...state, head: 'b'.repeat(40) } });
  assert.equal(a, b);
});

test('legacy mapping never grants merge, deploy, credential or destructive actions', () => {
  const mapped = toLegacyDecision({ decision: 'REVISE', reason: 'fix', allowedAction: 'REQUEST_CODE_FIX' }, 'a'.repeat(40));
  assert.equal(mapped.decision, 'REVISE');
  assert.equal(mapped.allowedAction, 'REQUEST_CODE_FIX');
  assert.throws(() => toLegacyDecision({ decision: 'CONTINUE', reason: 'bad', allowedAction: 'MERGE' }, 'a'.repeat(40)));
});

test('contract validation rejects missing objective or criteria', () => {
  assert.throws(() => normalizeTaskContract({ completionCriteria: ['x'] }));
  assert.throws(() => normalizeTaskContract({ objective: 'x', completionCriteria: [] }));
});
