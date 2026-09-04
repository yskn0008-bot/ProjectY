import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import {
  mapYosAnswer,
  parseDecisionRequest,
  parseDecisionToken,
  verifyGitHubActionsOidc,
} from '../api/yos/projecty-decision.mjs';

const NOW = Date.parse('2026-09-04T10:00:00Z');
const {publicKey, privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
const publicJwk = publicKey.export({format: 'jwk'});
publicJwk.kid = 'test-key';
publicJwk.alg = 'RS256';
publicJwk.use = 'sig';

function b64(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function token(overrides = {}) {
  const header = b64({alg: 'RS256', kid: 'test-key', typ: 'JWT'});
  const payload = b64({
    iss: 'https://token.actions.githubusercontent.com',
    aud: 'projecty-yos-ai',
    exp: Math.floor(NOW / 1000) + 300,
    nbf: Math.floor(NOW / 1000) - 30,
    repository: 'yskn0008-bot/ProjectY',
    repository_owner: 'yskn0008-bot',
    ref: 'refs/heads/main',
    workflow_ref: 'yskn0008-bot/ProjectY/.github/workflows/projecty-hq-autopilot.yml@refs/heads/main',
    ...overrides,
  });
  const signingInput = `${header}.${payload}`;
  const signature = sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString('base64url');
  return `${signingInput}.${signature}`;
}

const jwksFetch = async () => Response.json({keys: [publicJwk]});

test('GitHub OIDC accepts only the trusted ProjectY default-branch workflow', async () => {
  const claims = await verifyGitHubActionsOidc(token(), {fetchImpl: jwksFetch, now: NOW});
  assert.equal(claims.repository, 'yskn0008-bot/ProjectY');

  await assert.rejects(() => verifyGitHubActionsOidc(token({aud: 'wrong'}), {fetchImpl: jwksFetch, now: NOW}));
  await assert.rejects(() => verifyGitHubActionsOidc(token({repository: 'other/repo'}), {fetchImpl: jwksFetch, now: NOW}));
  await assert.rejects(() => verifyGitHubActionsOidc(token({ref: 'refs/heads/feature'}), {fetchImpl: jwksFetch, now: NOW}));
  await assert.rejects(() => verifyGitHubActionsOidc(token({workflow_ref: 'yskn0008-bot/ProjectY/.github/workflows/other.yml@refs/heads/main'}), {fetchImpl: jwksFetch, now: NOW}));
});

test('decision request rejects unsafe action values and stale shapes', () => {
  const valid = parseDecisionRequest({
    target: 'PR#12',
    currentHead: 'a'.repeat(40),
    failureClass: 'NEEDS_YOS',
    evidenceSummary: '{"phase":"NEEDS_YOS"}',
    candidateActions: ['REQUEST_STATUS'],
    scope: ['server/yos-ai/api/yos/projecty-decision.mjs'],
    unknowns: [],
  });
  assert.equal(valid.target, 'PR#12');
  assert.throws(() => parseDecisionRequest({...valid, candidateActions: ['MERGE']}));
  assert.throws(() => parseDecisionRequest({...valid, extra: 'x'}));
});

test('decision token boundary cannot express merge, deploy, credential, or destructive actions', () => {
  assert.deepEqual(parseDecisionToken('CONTINUE|REQUEST_STATUS'), {decision: 'CONTINUE', allowedAction: 'REQUEST_STATUS'});
  assert.deepEqual(parseDecisionToken('NEEDS_YOUSUKE|NONE'), {decision: 'NEEDS_YOUSUKE', allowedAction: null});
  assert.throws(() => parseDecisionToken('CONTINUE|MERGE'));
  assert.throws(() => parseDecisionToken('CONTINUE|DEPLOY'));
});

test('YOS answer maps grounded safe decisions and records no fabricated evidence on source failure', () => {
  const answer = {
    answer: '安全な既存工程を継続できる',
    facts: [{text: 'Issue #232 applies', sourceIds: ['00_law', '04_system_master']}],
    assumptions: [],
    unknowns: [],
    memoryCandidates: [],
    nextAction: 'CONTINUE|REQUEST_STATUS',
    safety: {level: 'normal', notes: []},
  };
  const mapped = mapYosAnswer(answer, 'b'.repeat(40));
  assert.equal(mapped.decision, 'CONTINUE');
  assert.equal(mapped.allowedAction, 'REQUEST_STATUS');
  assert.deepEqual(mapped.evidenceSourceIds, ['00_law', '04_system_master']);

  const noFacts = mapYosAnswer({...answer, facts: []}, 'b'.repeat(40));
  assert.equal(noFacts.decision, 'HOLD');
  assert.equal(noFacts.allowedAction, null);
  assert.deepEqual(noFacts.evidenceSourceIds, []);

  const blocked = mapYosAnswer({...answer, safety: {level: 'attention', notes: ['00_law:情報源取得に失敗']}}, 'b'.repeat(40));
  assert.equal(blocked.decision, 'HOLD');
  assert.equal(blocked.allowedAction, null);
  assert.deepEqual(blocked.evidenceSourceIds, ['00_law', '04_system_master']);
});
