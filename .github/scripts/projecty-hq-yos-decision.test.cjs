'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DECISION_MARKER,
  decisionFingerprint,
  hasDecision,
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

test('decision fingerprint is stable and duplicate marker suppresses a second request', () => {
  const request = {target: 'PR#4', currentHead: HEAD, failureClass: 'NEEDS_YOS', evidenceSummary: '{}'};
  const fingerprint = decisionFingerprint(request);
  assert.equal(fingerprint, decisionFingerprint({...request}));
  assert.equal(hasDecision([{body: `<!-- ${DECISION_MARKER}${fingerprint} -->`}], fingerprint), true);
  assert.equal(hasDecision([], fingerprint), false);
});

test('continuing decision requires real evidence while fail-closed stops may record none', () => {
  const valid = parseDecisionResponse({
    decision: 'CONTINUE',
    allowedAction: 'REQUEST_STATUS',
    targetHead: HEAD,
    evidenceSourceIds: ['00_law'],
    unknowns: [],
  }, HEAD);
  assert.equal(valid.allowedAction, 'REQUEST_STATUS');
  assert.throws(() => parseDecisionResponse({...valid, targetHead: 'b'.repeat(40)}, HEAD));
  assert.throws(() => parseDecisionResponse({...valid, allowedAction: 'MERGE'}, HEAD));
  assert.throws(() => parseDecisionResponse({...valid, evidenceSourceIds: []}, HEAD));

  const hold = parseDecisionResponse({
    decision: 'HOLD',
    allowedAction: null,
    targetHead: HEAD,
    evidenceSourceIds: [],
    unknowns: ['grounded facts unavailable'],
  }, HEAD);
  assert.equal(hold.allowedAction, null);
  assert.deepEqual(hold.evidenceSourceIds, []);

  const human = parseDecisionResponse({
    decision: 'NEEDS_YOUSUKE',
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
