'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DECISION_MARKER,
  boundedScope,
  decisionFingerprint,
  hasDecision,
  inferFailureClass,
  parseDecisionResponse,
  requestOidcToken,
  targetPrNumber,
} = require('./projecty-hq-yos-decision.cjs');

const HEAD = 'a'.repeat(40);

test('target parser accepts only PR target keys', () => {
  assert.equal(targetPrNumber('PR#232'), 232);
  assert.throws(() => targetPrNumber('issue#232'));
  assert.throws(() => targetPrNumber('PR#0'));
});

test('scope is complete or rejected instead of silently truncating changed files', () => {
  const hundred = Array.from({length: 100}, (_, index) => ({filename: `file-${index}.txt`}));
  const hundredOne = [...hundred, {filename: 'file-100.txt'}];
  assert.equal(boundedScope(hundred).length, 100);
  assert.equal(boundedScope(hundredOne), null);
});

test('decision fingerprint is stable and duplicate marker suppresses a second request', () => {
  const request = {target: 'PR#4', currentHead: HEAD, failureClass: 'BOUNDED_RECOVERY_EXHAUSTED', evidenceSummary: '{}'};
  const fingerprint = decisionFingerprint(request);
  assert.equal(fingerprint, decisionFingerprint({...request}));
  assert.equal(hasDecision([{body: `<!-- ${DECISION_MARKER}${fingerprint} -->`}], fingerprint), true);
  assert.equal(hasDecision([], fingerprint), false);
});

test('failure class preserves the reason YOS was requested', () => {
  assert.equal(inferFailureClass({next: 'branch conflict requires scoped human review'}), 'BRANCH_CONFLICT');
  assert.equal(inferFailureClass({next: 'atomic transport retries exhausted'}), 'TRANSPORT_API_FAILURE');
  assert.equal(inferFailureClass({next: 'bounded recovery exhausted'}), 'BOUNDED_RECOVERY_EXHAUSTED');
  assert.equal(inferFailureClass({next: 'unknown'}), 'NEEDS_YOS');
});

test('continuing decision requires reason and real evidence while fail-closed stops may record none', () => {
  const valid = parseDecisionResponse({
    decision: 'CONTINUE',
    reason: '既存の安全な工程を継続できる',
    allowedAction: 'REQUEST_STATUS',
    targetHead: HEAD,
    evidenceSourceIds: ['00_law'],
    unknowns: [],
  }, HEAD);
  assert.equal(valid.allowedAction, 'REQUEST_STATUS');
  assert.equal(valid.reason, '既存の安全な工程を継続できる');
  assert.throws(() => parseDecisionResponse({...valid, targetHead: 'b'.repeat(40)}, HEAD));
  assert.throws(() => parseDecisionResponse({...valid, reason: ''}, HEAD));
  assert.throws(() => parseDecisionResponse({...valid, allowedAction: 'MERGE'}, HEAD));
  assert.throws(() => parseDecisionResponse({...valid, allowedAction: 'APPROVE_QA'}, HEAD));
  assert.throws(() => parseDecisionResponse({...valid, evidenceSourceIds: []}, HEAD));

  const hold = parseDecisionResponse({
    decision: 'HOLD',
    reason: '根拠不足のため停止',
    allowedAction: null,
    targetHead: HEAD,
    evidenceSourceIds: [],
    unknowns: ['grounded facts unavailable'],
  }, HEAD);
  assert.equal(hold.allowedAction, null);
  assert.deepEqual(hold.evidenceSourceIds, []);

  const human = parseDecisionResponse({
    decision: 'NEEDS_YOUSUKE',
    reason: '本人しか決められない',
    allowedAction: null,
    targetHead: HEAD,
    evidenceSourceIds: [],
    unknowns: ['human decision required'],
  }, HEAD);
  assert.equal(human.decision, 'NEEDS_YOUSUKE');
});

test('OIDC token request uses Actions runtime and never needs a long-lived secret', async () => {
  let auth;
  let audience;
  const token = await requestOidcToken(async (url, options) => {
    auth = options.headers.Authorization;
    audience = new URL(url).searchParams.get('audience');
    return Response.json({value: 'header.payload.signature'});
  }, {
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example/id-token?x=1',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'ephemeral-runtime-token',
  });
  assert.equal(token, 'header.payload.signature');
  assert.equal(audience, 'projecty-yos-ai');
  assert.equal(auth, 'Bearer ephemeral-runtime-token');
});
