import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, sign} from 'node:crypto';
import responseSchema from '../schemas/yos-projecty-decision.schema.json' with {type: 'json'};
import {
  classifyFailureStage,
  classifyModelRequestDiagnostic,
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
  assert.throws(() => parseDecisionRequest({...valid, candidateActions: ['APPROVE_QA']}));
  assert.throws(() => parseDecisionRequest({...valid, extra: 'x'}));
});

test('decision token boundary cannot express merge, deploy, credential, or unsupported approval actions', () => {
  assert.deepEqual(parseDecisionToken('CONTINUE|REQUEST_STATUS'), {decision: 'CONTINUE', allowedAction: 'REQUEST_STATUS'});
  assert.deepEqual(parseDecisionToken('NEEDS_YOUSUKE|NONE'), {decision: 'NEEDS_YOUSUKE', allowedAction: null});
  assert.throws(() => parseDecisionToken('CONTINUE|MERGE'));
  assert.throws(() => parseDecisionToken('CONTINUE|DEPLOY'));
  assert.throws(() => parseDecisionToken('CONTINUE|APPROVE_QA'));
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

test('ProjectY decision Structured Outputs schema stays inside the strict supported subset', () => {
  const unsupportedKeywords = new Set([
    '$schema',
    'minLength',
    'maxLength',
    'uniqueItems',
    'allOf',
    'not',
    'dependentRequired',
    'dependentSchemas',
    'if',
    'then',
    'else',
  ]);

  function inspect(node, path = '$') {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    for (const key of Object.keys(node)) {
      assert.equal(unsupportedKeywords.has(key), false, `${path} contains unsupported keyword ${key}`);
    }
    if (node.type === 'object') {
      assert.equal(node.additionalProperties, false, `${path} must set additionalProperties=false`);
      const propertyNames = Object.keys(node.properties || {}).sort();
      const requiredNames = [...(node.required || [])].sort();
      assert.deepEqual(requiredNames, propertyNames, `${path} must require every declared property`);
    }
    if (node.properties) {
      for (const [key, value] of Object.entries(node.properties)) inspect(value, `${path}.properties.${key}`);
    }
    if (node.items) inspect(node.items, `${path}.items`);
    if (Array.isArray(node.anyOf)) node.anyOf.forEach((value, index) => inspect(value, `${path}.anyOf[${index}]`));
    if (node.$defs) {
      for (const [key, value] of Object.entries(node.$defs)) inspect(value, `${path}.$defs.${key}`);
    }
  }

  inspect(responseSchema);
  assert.equal(responseSchema.type, 'object');
  assert.equal(responseSchema.properties.memoryCandidates.maxItems, 0);
});

test('failure diagnostics expose only bounded stage names', () => {
  assert.equal(classifyFailureStage({stage: 'source-load'}, 'answer'), 'source-load');
  assert.equal(classifyFailureStage({stage: 'model-request'}, 'answer'), 'model-request');
  assert.equal(classifyFailureStage({stage: 'unexpected-secret-looking-value'}, 'runtime-create'), 'runtime-create');
  assert.equal(classifyFailureStage(new Error('private details'), 'authorization'), 'authorization');
});

test('model request diagnostics expose only bounded status labels', () => {
  for (const status of ['network', '400', '401', '403', '404', '429', '5xx', 'other']) {
    assert.equal(classifyModelRequestDiagnostic({modelRequestStatus: status}, 'model-request'), status);
  }
  assert.equal(classifyModelRequestDiagnostic({modelRequestStatus: '401 token=secret'}, 'model-request'), null);
  assert.equal(classifyModelRequestDiagnostic({modelRequestStatus: '429'}, 'source-load'), null);
  assert.equal(classifyModelRequestDiagnostic(new Error('private details'), 'model-request'), null);
});
