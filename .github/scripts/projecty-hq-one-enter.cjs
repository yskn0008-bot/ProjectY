'use strict';

const crypto = require('node:crypto');

const STATES = Object.freeze([
  'RECEIVED',
  'ASSET_SEARCH',
  'PLANNED',
  'IMPLEMENTING',
  'VERIFYING',
  'RECOVERING',
  'USABLE',
  'OWNER_ACTION_REQUIRED',
  'EXTERNAL_WAIT',
  'ENDED',
]);

const FAILURE_CLASSES = Object.freeze([
  'CODE_FAILURE',
  'TRANSPORT_FAILURE',
  'EXTERNAL_FAILURE',
  'UNKNOWN_RESULT',
  'CONFLICT',
]);

const HALT_STATES = new Set(['OWNER_ACTION_REQUIRED', 'EXTERNAL_WAIT', 'ENDED']);
const MAX_RECOVERY_ATTEMPTS = 2;
const MAX_ENGINE_STEPS = 32;

const ALLOWED_TRANSITIONS = Object.freeze({
  RECEIVED: new Set(['ASSET_SEARCH']),
  ASSET_SEARCH: new Set(['PLANNED', 'OWNER_ACTION_REQUIRED', 'EXTERNAL_WAIT', 'ENDED']),
  PLANNED: new Set(['IMPLEMENTING', 'OWNER_ACTION_REQUIRED', 'EXTERNAL_WAIT', 'ENDED']),
  IMPLEMENTING: new Set(['VERIFYING', 'RECOVERING', 'OWNER_ACTION_REQUIRED', 'EXTERNAL_WAIT', 'ENDED']),
  VERIFYING: new Set(['USABLE', 'RECOVERING', 'OWNER_ACTION_REQUIRED', 'EXTERNAL_WAIT', 'ENDED']),
  RECOVERING: new Set(['IMPLEMENTING', 'VERIFYING', 'OWNER_ACTION_REQUIRED', 'EXTERNAL_WAIT', 'ENDED']),
  USABLE: new Set(['ENDED']),
  OWNER_ACTION_REQUIRED: new Set(),
  EXTERNAL_WAIT: new Set(),
  ENDED: new Set(),
});

const HQ_FAILURE_MAP = Object.freeze({
  ACTION_CODE_FAILURE: 'CODE_FAILURE',
  CODEX_PUSH_BLOCKED: 'TRANSPORT_FAILURE',
  CODEX_GH_UNAUTHENTICATED: 'TRANSPORT_FAILURE',
  CODEX_RESULT_NO_GITHUB_ARTIFACT: 'TRANSPORT_FAILURE',
  TRANSPORT_API_FAILURE: 'TRANSPORT_FAILURE',
  ACTION_TRANSIENT_FAILURE: 'EXTERNAL_FAILURE',
  TASK_STALLED: 'UNKNOWN_RESULT',
  STALE_QA_STATE: 'UNKNOWN_RESULT',
  QA_BOOTSTRAP_BLOCKED: 'UNKNOWN_RESULT',
  HEAD_MOVED: 'CONFLICT',
  BRANCH_BEHIND: 'CONFLICT',
  BRANCH_CONFLICT: 'CONFLICT',
  BRANCH_BEHIND_OR_CONFLICT: 'CONFLICT',
});

const HQ_PHASE_MAP = Object.freeze({
  OBSERVING: 'RECEIVED',
  RUNNING: 'IMPLEMENTING',
  TRANSPORTING: 'RECOVERING',
  TRANSPORT_READY: 'RECOVERING',
  BRANCH_SYNCING: 'RECOVERING',
  RECOVERY_API_FAILED: 'RECOVERING',
  AWAITING_QA: 'VERIFYING',
  QA_BOOTSTRAP_BLOCKED: 'VERIFYING',
  QA_FAILURE: 'VERIFYING',
  QA_SUCCESS: 'USABLE',
  NEEDS_YOS: 'OWNER_ACTION_REQUIRED',
  CONFIG_BLOCKED: 'OWNER_ACTION_REQUIRED',
});

function stableObject(value) {
  if (Array.isArray(value)) return value.map(stableObject);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableObject(value[key])]));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeFailureClass(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (FAILURE_CLASSES.includes(raw)) return raw;
  return HQ_FAILURE_MAP[raw] || 'UNKNOWN_RESULT';
}

function adaptHqPhase(value) {
  const raw = String(value || '').trim().toUpperCase();
  return HQ_PHASE_MAP[raw] || 'RECOVERING';
}

function createHqBridge(hqModule) {
  const hq = hqModule || require('./projecty-hq-autopilot.cjs');
  if (typeof hq.qaState !== 'function' || typeof hq.processEvent !== 'function') {
    throw new Error('existing ProjectY HQ module must expose qaState and processEvent');
  }
  return Object.freeze({
    qaState: (...args) => hq.qaState(...args),
    processEvent: (...args) => hq.processEvent(...args),
    classifyQaLevel: typeof hq.classifyQaLevel === 'function' ? (...args) => hq.classifyQaLevel(...args) : null,
    mapFailureClass: normalizeFailureClass,
    mapPhase: adaptHqPhase,
  });
}

function problemFingerprint({ target, failureClass, operation, evidenceKey }) {
  // Deliberately excludes head SHA. v3.0 requires the same problem's retry count
  // to survive head/route changes instead of being reset by them.
  const payload = stableObject({
    target: String(target || 'one-enter'),
    failureClass: normalizeFailureClass(failureClass),
    operation: String(operation || 'unknown'),
    evidenceKey: String(evidenceKey || 'unspecified'),
  });
  return sha256(JSON.stringify(payload)).slice(0, 24);
}

function requestIdentity(request) {
  const supplied = String(request?.id || '').trim();
  if (supplied) return supplied;
  return `one-enter-${sha256(String(request?.text || '')).slice(0, 16)}`;
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('request must be an object');
  if (typeof request.text !== 'string' || !request.text.trim()) throw new Error('request.text is required');
  if (request.baseSha !== undefined && !/^[0-9a-f]{40}$/i.test(String(request.baseSha))) throw new Error('request.baseSha must be a 40-char SHA when supplied');
  return { ...request, id: requestIdentity(request), text: request.text.trim() };
}

function createContext(request) {
  return {
    request,
    state: 'RECEIVED',
    usable: false,
    endReason: null,
    assets: null,
    plan: null,
    artifacts: [],
    verification: null,
    recovery: {},
    trace: [{ state: 'RECEIVED', reason: 'request accepted' }],
    notes: [],
  };
}

function transition(context, next, reason) {
  if (!STATES.includes(next)) throw new Error(`unknown One Enter state: ${next}`);
  if (!ALLOWED_TRANSITIONS[context.state]?.has(next)) throw new Error(`illegal One Enter transition: ${context.state} -> ${next}`);
  context.state = next;
  context.trace.push({ state: next, reason: String(reason || '') });
}

function preserveArtifacts(context, artifacts) {
  if (!Array.isArray(artifacts)) return;
  const byId = new Map(context.artifacts.map((artifact) => [artifact.id, artifact]));
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== 'object' || !artifact.id) throw new Error('artifacts must have stable ids');
    const old = byId.get(artifact.id);
    byId.set(artifact.id, old ? { ...old, ...artifact, preservedFromPreviousAttempt: true } : { ...artifact });
  }
  context.artifacts = [...byId.values()];
}

function failureFromResult(result, operation) {
  const failure = result?.failure || result || {};
  return {
    failureClass: normalizeFailureClass(failure.failureClass || failure.class || failure.kind),
    operation,
    evidenceKey: String(failure.evidenceKey || failure.code || operation),
    target: String(failure.target || 'one-enter'),
    details: failure.details || failure.message || null,
  };
}

function recoveryAttempt(context, failure) {
  const fingerprint = problemFingerprint(failure);
  const old = context.recovery[fingerprint] || { attempts: 0, failureClass: failure.failureClass, operation: failure.operation };
  if (old.attempts >= MAX_RECOVERY_ATTEMPTS) return { allowed: false, fingerprint, record: old };
  const record = { ...old, attempts: old.attempts + 1, lastFailure: failure, lastHead: context.request.baseSha || null };
  context.recovery[fingerprint] = record;
  return { allowed: true, fingerprint, record };
}

function haltForExhaustion(context, failure, fingerprint) {
  const state = failure.failureClass === 'EXTERNAL_FAILURE' ? 'EXTERNAL_WAIT' : 'OWNER_ACTION_REQUIRED';
  transition(context, state, `bounded recovery exhausted for ${fingerprint}`);
  context.endReason = state === 'EXTERNAL_WAIT' ? 'EXTERNAL_RECOVERY_EXHAUSTED' : 'OWNER_DECISION_REQUIRED_AFTER_BOUNDED_RECOVERY';
}

function normalizeAdapterStop(result) {
  const status = String(result?.status || '').toUpperCase();
  if (status === 'OWNER_ACTION_REQUIRED') return 'OWNER_ACTION_REQUIRED';
  if (status === 'EXTERNAL_WAIT') return 'EXTERNAL_WAIT';
  if (status === 'ENDED') return 'ENDED';
  return null;
}

async function applyAdapterStop(context, result, source) {
  const stop = normalizeAdapterStop(result);
  if (!stop) return false;
  transition(context, stop, result.reason || `${source} requested ${stop}`);
  context.endReason = result.endReason || result.reason || stop;
  return true;
}

async function recover(context, adapters, failure, resumeState) {
  transition(context, 'RECOVERING', `${failure.failureClass} during ${failure.operation}`);
  const attempt = recoveryAttempt(context, failure);
  if (!attempt.allowed) {
    haltForExhaustion(context, failure, attempt.fingerprint);
    return;
  }

  const decision = adapters.recover
    ? await adapters.recover({ context, failure, attempt: attempt.record.attempts, fingerprint: attempt.fingerprint, resumeState })
    : { action: 'OWNER_ACTION_REQUIRED', reason: 'no recovery adapter available' };
  const action = String(decision?.action || '').toUpperCase();

  if (action === 'RETRY_IMPLEMENT' || action === 'ALTERNATE_ROUTE' || action === 'ROLLBACK_AND_RETRY') {
    if (decision.planPatch) context.plan = { ...(context.plan || {}), ...decision.planPatch };
    if (decision.note) context.notes.push(String(decision.note));
    transition(context, 'IMPLEMENTING', `${action} attempt ${attempt.record.attempts}`);
    return;
  }
  if (action === 'RETRY_VERIFY') {
    transition(context, 'VERIFYING', `RETRY_VERIFY attempt ${attempt.record.attempts}`);
    return;
  }
  if (action === 'EXTERNAL_WAIT') {
    transition(context, 'EXTERNAL_WAIT', decision.reason || 'external condition required');
    context.endReason = decision.reason || 'EXTERNAL_WAIT';
    return;
  }
  if (action === 'END') {
    transition(context, 'ENDED', decision.reason || 'safe end selected');
    context.endReason = decision.reason || 'ENDED_BY_RECOVERY';
    return;
  }
  transition(context, 'OWNER_ACTION_REQUIRED', decision?.reason || 'recovery needs owner action');
  context.endReason = decision?.reason || 'OWNER_ACTION_REQUIRED';
}

async function runOneEnter(input) {
  const request = validateRequest(input?.request);
  const adapters = input?.adapters || {};
  for (const required of ['assetSearch', 'plan', 'implement', 'verify']) {
    if (typeof adapters[required] !== 'function') throw new Error(`adapter.${required} is required`);
  }
  const context = createContext(request);

  transition(context, 'ASSET_SEARCH', 'discover existing assets before implementation');
  const assets = await adapters.assetSearch({ context, request });
  if (await applyAdapterStop(context, assets, 'assetSearch')) return context;
  context.assets = assets;

  transition(context, 'PLANNED', 'shortest safe route selected');
  const plan = await adapters.plan({ context, request, assets });
  if (await applyAdapterStop(context, plan, 'plan')) return context;
  if (!plan || typeof plan !== 'object') throw new Error('plan adapter returned no plan');
  if (typeof plan.route !== 'string' || !plan.route.trim()) throw new Error('plan.route is required');
  if (typeof plan.owner !== 'string' || !plan.owner.trim()) throw new Error('plan.owner is required');
  if (plan.parallel !== undefined && typeof plan.parallel !== 'boolean') throw new Error('plan.parallel must be boolean when supplied');
  context.plan = plan;

  transition(context, 'IMPLEMENTING', 'execute selected route');

  for (let step = 0; step < MAX_ENGINE_STEPS && !HALT_STATES.has(context.state); step += 1) {
    if (context.state === 'IMPLEMENTING') {
      const result = await adapters.implement({ context, request, assets: context.assets, plan: context.plan, artifacts: context.artifacts });
      preserveArtifacts(context, result?.artifacts);
      if (await applyAdapterStop(context, result, 'implement')) break;
      if (result?.ok === false || result?.failure) {
        await recover(context, adapters, failureFromResult(result, 'IMPLEMENTING'), 'IMPLEMENTING');
        continue;
      }
      transition(context, 'VERIFYING', 'implementation artifact exists; verify required QA');
      continue;
    }

    if (context.state === 'VERIFYING') {
      const result = await adapters.verify({ context, request, plan: context.plan, artifacts: context.artifacts });
      context.verification = result || null;
      if (await applyAdapterStop(context, result, 'verify')) break;
      const status = String(result?.status || '').toLowerCase();
      if (result?.ok === true || status === 'success') {
        transition(context, 'USABLE', result?.reason || 'required verification succeeded');
        context.usable = true;
        transition(context, 'ENDED', 'verified fixed version is usable; development ends');
        context.endReason = 'USABLE_VERIFIED';
        break;
      }
      const resultWithFailure = result?.failure
        ? result
        : { failure: { failureClass: status === 'failure' ? 'CODE_FAILURE' : 'UNKNOWN_RESULT', evidenceKey: status || 'qa-unknown', details: result?.reason || null } };
      await recover(context, adapters, failureFromResult(resultWithFailure, 'VERIFYING'), 'VERIFYING');
      continue;
    }

    if (context.state === 'RECOVERING') throw new Error('recovery adapter left engine in RECOVERING without a next state');
  }

  if (!HALT_STATES.has(context.state)) throw new Error(`One Enter exceeded ${MAX_ENGINE_STEPS} bounded steps in state ${context.state}`);
  return context;
}

function makeSyntheticAdapters(options = {}) {
  let verifyCalls = 0;
  return {
    async assetSearch({ request }) {
      return {
        status: 'ok',
        query: request.text,
        candidates: [
          { id: 'issue-232-hq', kind: 'existing-orchestrator', path: '.github/scripts/projecty-hq-autopilot.cjs' },
          { id: 'hq-safety', kind: 'existing-qa', path: '.github/workflows/projecty-hq-safety.yml' },
        ],
      };
    },
    async plan() {
      return {
        route: 'REUSE_EXISTING_HQ_WITH_ADAPTER',
        owner: 'YOS',
        parallel: false,
        requiredQa: ['ProjectY One Enter', 'ProjectY HQ Safety'],
      };
    },
    async implement({ request, artifacts }) {
      const artifactId = `synthetic:${request.id}`;
      const existing = artifacts.find((artifact) => artifact.id === artifactId);
      return {
        ok: true,
        artifacts: [{
          id: artifactId,
          kind: 'synthetic-fixed-version',
          revision: Number(existing?.revision || 0) + 1,
          retained: true,
        }],
      };
    },
    async verify() {
      verifyCalls += 1;
      if (options.failVerificationOnce && verifyCalls === 1) {
        return {
          status: 'failure',
          failure: { failureClass: 'CODE_FAILURE', evidenceKey: 'synthetic-qa', details: 'intentional first-pass synthetic failure' },
        };
      }
      return { status: 'success', ok: true, reason: 'synthetic required QA green' };
    },
    async recover({ failure, attempt }) {
      if (failure.failureClass === 'CODE_FAILURE' && attempt <= MAX_RECOVERY_ATTEMPTS) {
        return { action: 'RETRY_VERIFY', note: 'reuse preserved artifact; apply bounded synthetic repair' };
      }
      return { action: 'OWNER_ACTION_REQUIRED', reason: 'no safe automatic synthetic recovery path' };
    },
  };
}

async function main() {
  const raw = process.env.ONE_ENTER_REQUEST_JSON;
  if (!raw) throw new Error('ONE_ENTER_REQUEST_JSON is required');
  const request = JSON.parse(raw);
  if (request.mode !== 'synthetic') throw new Error('CLI currently accepts mode=synthetic only; real GitHub actions must be supplied through explicit adapters');
  const result = await runOneEnter({
    request,
    adapters: makeSyntheticAdapters({ failVerificationOnce: Boolean(request.synthetic?.failVerificationOnce) }),
  });
  console.log(JSON.stringify(result));
  if (!result.usable || result.state !== 'ENDED') process.exitCode = 2;
}

module.exports = {
  ALLOWED_TRANSITIONS,
  FAILURE_CLASSES,
  HQ_FAILURE_MAP,
  HQ_PHASE_MAP,
  MAX_RECOVERY_ATTEMPTS,
  STATES,
  adaptHqPhase,
  createContext,
  createHqBridge,
  makeSyntheticAdapters,
  normalizeFailureClass,
  preserveArtifacts,
  problemFingerprint,
  runOneEnter,
  transition,
  validateRequest,
};

if (require.main === module) main().catch((error) => {
  console.error(JSON.stringify({ level: 'error', event: 'projecty_one_enter_failed', message: String(error.message || error).slice(0, 500) }));
  process.exitCode = 1;
});
