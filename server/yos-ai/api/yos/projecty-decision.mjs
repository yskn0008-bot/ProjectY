import {createHash, randomUUID, webcrypto} from 'node:crypto';
import responseSchema from '../../schemas/yos-projecty-decision.schema.json' with {type: 'json'};
import {loadYosRuntimeConfig} from '../../dist/config.js';
import {DefaultRequestRuntimeFactory} from '../../dist/runtime/request-runtime.js';

const ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const EXPECTED_AUDIENCE = 'projecty-yos-ai';
const EXPECTED_REPOSITORY = 'yskn0008-bot/ProjectY';
const EXPECTED_OWNER = 'yskn0008-bot';
const EXPECTED_REF = 'refs/heads/main';
const EXPECTED_WORKFLOW_REF = `${EXPECTED_REPOSITORY}/.github/workflows/projecty-hq-autopilot.yml@${EXPECTED_REF}`;
const SAFE_ACTIONS = new Set(['RERUN_FAILED', 'REQUEST_CODE_FIX', 'REQUEST_TRANSPORT', 'REQUEST_STATUS', 'UPDATE_BRANCH', 'APPROVE_QA']);
const TOKENS = new Set([
  'CONTINUE|RERUN_FAILED',
  'CONTINUE|REQUEST_CODE_FIX',
  'CONTINUE|REQUEST_TRANSPORT',
  'CONTINUE|REQUEST_STATUS',
  'CONTINUE|UPDATE_BRANCH',
  'CONTINUE|APPROVE_QA',
  'REVISE|REQUEST_CODE_FIX',
  'HOLD|NONE',
  'NEEDS_YOUSUKE|NONE',
]);
const CORE_IDS = ['00_law', '02_yos_master', '00_change_log'];
let jwksCache = {expiresAt: 0, keys: []};

function base64urlJson(segment) {
  return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
}

function audienceMatches(aud, expected) {
  return typeof aud === 'string' ? aud === expected : Array.isArray(aud) && aud.includes(expected);
}

async function getJwks(fetchImpl, now) {
  if (jwksCache.expiresAt > now && jwksCache.keys.length) return jwksCache.keys;
  const response = await fetchImpl(JWKS_URL, {headers: {'User-Agent': 'ProjectY-YOS'}});
  if (!response.ok) throw new Error('OIDC key discovery failed');
  const value = await response.json();
  if (!Array.isArray(value?.keys) || value.keys.length === 0) throw new Error('OIDC keys missing');
  jwksCache = {expiresAt: now + 5 * 60_000, keys: value.keys};
  return value.keys;
}

export async function verifyGitHubActionsOidc(token, {fetchImpl = fetch, now = Date.now()} = {}) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 8192) throw new Error('OIDC token invalid');
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('OIDC token invalid');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = base64urlJson(encodedHeader);
  const claims = base64urlJson(encodedPayload);
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('OIDC algorithm invalid');
  const keys = await getJwks(fetchImpl, now);
  const jwk = keys.find((key) => key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) throw new Error('OIDC signing key unavailable');
  const key = await webcrypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  const valid = await webcrypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    Buffer.from(encodedSignature, 'base64url'),
    Buffer.from(`${encodedHeader}.${encodedPayload}`)
  );
  if (!valid) throw new Error('OIDC signature invalid');
  const nowSeconds = Math.floor(now / 1000);
  if (claims.iss !== ISSUER || !audienceMatches(claims.aud, EXPECTED_AUDIENCE)) throw new Error('OIDC issuer or audience invalid');
  if (!Number.isFinite(claims.exp) || claims.exp < nowSeconds - 30) throw new Error('OIDC token expired');
  if (Number.isFinite(claims.nbf) && claims.nbf > nowSeconds + 30) throw new Error('OIDC token not active');
  if (claims.repository !== EXPECTED_REPOSITORY || claims.repository_owner !== EXPECTED_OWNER) throw new Error('OIDC repository invalid');
  if (claims.ref !== EXPECTED_REF || claims.workflow_ref !== EXPECTED_WORKFLOW_REF) throw new Error('OIDC workflow identity invalid');
  return claims;
}

function bearer(request) {
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '');
  if (!match?.[1]) throw new Error('Authorization failed');
  return match[1];
}

function secureJson(body, status) {
  return Response.json(body, {status, headers: {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
    'Referrer-Policy': 'no-referrer',
  }});
}

function boundedString(value, name, max, pattern) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || (pattern && !pattern.test(value))) throw new Error(`${name} invalid`);
  return value.trim();
}

export function parseDecisionRequest(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('request invalid');
  const allowedKeys = new Set(['target', 'currentHead', 'failureClass', 'evidenceSummary', 'candidateActions', 'scope', 'unknowns']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) throw new Error('request field invalid');
  const target = boundedString(value.target, 'target', 30, /^PR#[1-9][0-9]*$/);
  const currentHead = boundedString(value.currentHead, 'currentHead', 40, /^[0-9a-f]{40}$/);
  const failureClass = boundedString(value.failureClass, 'failureClass', 80, /^[A-Z0-9_-]+$/);
  const evidenceSummary = boundedString(value.evidenceSummary, 'evidenceSummary', 5000);
  if (!Array.isArray(value.candidateActions) || value.candidateActions.length > SAFE_ACTIONS.size || !value.candidateActions.every((action) => SAFE_ACTIONS.has(action))) throw new Error('candidateActions invalid');
  if (!Array.isArray(value.scope) || value.scope.length > 100 || !value.scope.every((item) => typeof item === 'string' && item.length > 0 && item.length <= 300)) throw new Error('scope invalid');
  if (!Array.isArray(value.unknowns) || value.unknowns.length > 12 || !value.unknowns.every((item) => typeof item === 'string' && item.length <= 500)) throw new Error('unknowns invalid');
  return {target, currentHead, failureClass, evidenceSummary, candidateActions: [...new Set(value.candidateActions)], scope: value.scope, unknowns: value.unknowns};
}

function buildDecisionPrompt(request) {
  return [
    'ProjectY GitHub 開発のYOS判断。これは通常会話ではなく、Issue #232自動司令部の停止点を安全に解くための判断要求。',
    '本人の人生価値観、大きな仕様、本番公開、credential、課金、破壊的変更、physical iPhone操作が必要なら NEEDS_YOUSUKE|NONE。',
    '根拠不足、真正な競合、正本不整合なら HOLD|NONE。',
    '安全な既存工程を継続できる場合だけ CONTINUE|<action>。実装修正が必要なら REVISE|REQUEST_CODE_FIX。',
    'nextActionはschemaにある結合tokenを1つだけ返す。answerは個人情報や正本本文を引用せず、GitHubへ保存しても安全な短い運用理由にする。',
    'memoryCandidatesは空配列。factsは判断根拠を正本source id付きで返す。',
    `TARGET=${request.target}`,
    `CURRENT_HEAD=${request.currentHead}`,
    `FAILURE_CLASS=${request.failureClass}`,
    `CANDIDATE_ACTIONS=${request.candidateActions.join(',') || 'NONE'}`,
    `SCOPE=${request.scope.join(',').slice(0, 5000) || 'NONE'}`,
    `EVIDENCE_SUMMARY=${request.evidenceSummary}`,
    `UNKNOWNS=${request.unknowns.join(' | ') || 'NONE'}`,
  ].join('\n');
}

export function parseDecisionToken(token) {
  if (typeof token !== 'string' || !TOKENS.has(token)) throw new Error('decision token invalid');
  const [decision, action] = token.split('|');
  return {decision, allowedAction: action === 'NONE' ? null : action};
}

function coreSourceUnavailable(answer) {
  return CORE_IDS.some((id) => answer.safety?.notes?.some((note) => String(note).startsWith(`${id}:`)));
}

export function mapYosAnswer(answer, targetHead) {
  if (!answer || !Array.isArray(answer.facts) || answer.facts.length === 0) {
    return {decision: 'HOLD', reason: '根拠付き事実を取得できないため自動判断を停止', allowedAction: null, targetHead, evidenceSourceIds: [], unknowns: ['grounded facts unavailable']};
  }
  const evidenceSourceIds = [...new Set(answer.facts.flatMap((fact) => fact.sourceIds || []))].slice(0, 12);
  if (coreSourceUnavailable(answer)) {
    return {decision: 'HOLD', reason: '必要なcore sourceを取得できないため自動判断を停止', allowedAction: null, targetHead, evidenceSourceIds, unknowns: ['core source unavailable']};
  }
  const parsed = parseDecisionToken(answer.nextAction);
  return {
    ...parsed,
    reason: String(answer.answer || '').replace(/[\r\n]+/g, ' ').slice(0, 500),
    targetHead,
    evidenceSourceIds,
    unknowns: Array.isArray(answer.unknowns) ? answer.unknowns.slice(0, 8) : [],
  };
}

export function createProjectyDecisionHandler({environment = process.env, fetchImpl = fetch, clock = () => new Date().toISOString(), requestIdFactory = randomUUID} = {}) {
  const config = loadYosRuntimeConfig(environment);
  const runtimeFactory = new DefaultRequestRuntimeFactory({config, responseSchema, fetchImpl});
  return async function handle(request) {
    if (request.method !== 'POST') return secureJson({error: 'method not allowed'}, 405);
    try {
      const token = bearer(request);
      const claims = await verifyGitHubActionsOidc(token, {fetchImpl});
      const text = await request.text();
      if (Buffer.byteLength(text, 'utf8') > 16_384) return secureJson({error: 'payload too large'}, 413);
      const input = parseDecisionRequest(JSON.parse(text));
      const requestId = requestIdFactory();
      const subjectHash = createHash('sha256').update(`${claims.repository}:${claims.workflow_ref}`).digest('hex');
      const service = await runtimeFactory.create({requestId, subjectHash});
      const answer = await service.answer({requestId, userText: buildDecisionPrompt(input), currentTime: clock()});
      return secureJson(mapYosAnswer(answer, input.currentHead), 200);
    } catch {
      console.error(JSON.stringify({level: 'error', event: 'projecty_yos_decision_unavailable', stage: 'request', message: 'request rejected'}));
      return secureJson({error: 'YOS decision unavailable'}, 503);
    }
  };
}

let productionHandler;

export default {
  async fetch(request) {
    productionHandler ??= createProjectyDecisionHandler();
    return productionHandler(request);
  }
};
