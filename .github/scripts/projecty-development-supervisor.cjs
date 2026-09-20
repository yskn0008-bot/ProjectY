'use strict';

const crypto = require('node:crypto');

const DECISIONS = Object.freeze(['CONTINUE', 'REVISE', 'WAIT_USER', 'COMPLETE']);
const SAFE_ACTIONS = new Set(['RERUN_FAILED', 'REQUEST_CODE_FIX', 'REQUEST_TRANSPORT', 'REQUEST_STATUS', 'UPDATE_BRANCH']);
const USER_ONLY_RE = /(?:login|log in|2fa|two[- ]factor|本人確認|本人操作|secret|credential|資格情報|physical|実機|iphone|現物|支払|payment|契約|contract|公開|publish|deploy|削除|delete|不可逆|destructive|value judgment|価値判断)/i;
const CONFLICT_RE = /(?:branch conflict|真正な競合|conflict requires|unsafe scope|scope mismatch)/i;

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex').slice(0, 24);
}

function normalizeTaskContract(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('task contract must be an object');
  const objective = String(value.objective || '').trim();
  if (!objective) throw new Error('task objective is required');
  const criteria = Array.isArray(value.completionCriteria) ? value.completionCriteria : [];
  if (!criteria.length) throw new Error('at least one completion criterion is required');
  const completionCriteria = criteria.map((criterion, index) => {
    if (typeof criterion === 'string') return { id: `criterion-${index + 1}`, description: criterion.trim(), verified: false, evidence: [] };
    if (!criterion || typeof criterion !== 'object') throw new Error('completion criterion must be a string or object');
    const description = String(criterion.description || '').trim();
    if (!description) throw new Error('completion criterion description is required');
    return {
      id: String(criterion.id || `criterion-${index + 1}`),
      description,
      verified: criterion.verified === true,
      evidence: Array.isArray(criterion.evidence) ? criterion.evidence.map(String).slice(0, 12) : [],
      userOnly: criterion.userOnly === true,
    };
  });
  return {
    id: String(value.id || `dev-${hash({ objective, completionCriteria: completionCriteria.map((item) => item.description) })}`),
    objective,
    completionCriteria,
  };
}

function completionState(contract) {
  const task = normalizeTaskContract(contract);
  const requiredUser = task.completionCriteria.find((criterion) => criterion.userOnly && !criterion.verified);
  if (requiredUser) return { decision: 'WAIT_USER', reason: requiredUser.description, allowedAction: null, task };
  const incomplete = task.completionCriteria.filter((criterion) => !criterion.verified);
  if (!incomplete.length) return { decision: 'COMPLETE', reason: 'all completion criteria are verified', allowedAction: null, task };
  return { decision: 'CONTINUE', reason: `${incomplete.length} completion criteria remain`, allowedAction: null, task };
}

function latestFailure(targetState = {}) {
  const rows = Object.values(targetState.failures || {});
  return rows.reverse().find((row) => row && (row.failureClass || row.kind || row.phase || row.lastError)) || null;
}

function failureClass(targetState = {}) {
  const failure = latestFailure(targetState);
  return String(failure?.failureClass || failure?.kind || '').toUpperCase();
}

function supervisorFingerprint({ target, targetState, failure }) {
  return hash({
    target: String(target || ''),
    phase: String(targetState?.phase || ''),
    next: String(targetState?.next || ''),
    failureClass: String(failure || failureClass(targetState)),
  });
}

function deterministicDecision({ target, targetState = {}, alreadyAttempted = false } = {}) {
  const phase = String(targetState.phase || '').toUpperCase();
  const next = String(targetState.next || '');
  const failure = failureClass(targetState);

  if (USER_ONLY_RE.test(next) || CONFLICT_RE.test(next) || failure === 'BRANCH_CONFLICT') {
    return { decision: 'WAIT_USER', reason: next || failure || 'human-only development boundary', allowedAction: null };
  }

  if (alreadyAttempted) {
    return { decision: 'WAIT_USER', reason: 'deterministic supervisor recovery was already attempted for the same unresolved problem', allowedAction: null };
  }

  const actionByFailure = {
    ACTION_TRANSIENT_FAILURE: ['CONTINUE', 'RERUN_FAILED'],
    ACTION_CODE_FAILURE: ['REVISE', 'REQUEST_CODE_FIX'],
    CODEX_PUSH_BLOCKED: ['CONTINUE', 'REQUEST_TRANSPORT'],
    CODEX_GH_UNAUTHENTICATED: ['CONTINUE', 'REQUEST_TRANSPORT'],
    CODEX_RESULT_NO_GITHUB_ARTIFACT: ['CONTINUE', 'REQUEST_TRANSPORT'],
    TRANSPORT_API_FAILURE: ['CONTINUE', 'REQUEST_STATUS'],
    TASK_STALLED: ['CONTINUE', 'REQUEST_STATUS'],
    STALE_QA_STATE: ['CONTINUE', 'REQUEST_STATUS'],
    QA_BOOTSTRAP_BLOCKED: ['CONTINUE', 'REQUEST_STATUS'],
    HEAD_MOVED: ['CONTINUE', 'REQUEST_TRANSPORT'],
    BRANCH_BEHIND: ['CONTINUE', 'UPDATE_BRANCH'],
  };
  if (actionByFailure[failure]) {
    const [decision, allowedAction] = actionByFailure[failure];
    return { decision, reason: `routine development recovery: ${failure}`, allowedAction };
  }

  if (phase === 'NEEDS_YOS' && /bounded recovery exhausted/i.test(next)) {
    return null;
  }

  if (['RUNNING', 'AWAITING_QA', 'RECOVERING', 'BRANCH_SYNCING', 'TRANSPORTING', 'QA_BOOTSTRAP_BLOCKED'].includes(phase)) {
    return { decision: 'CONTINUE', reason: `routine development phase ${phase} should continue without owner interruption`, allowedAction: 'REQUEST_STATUS' };
  }

  return null;
}

function toLegacyDecision(decision, targetHead) {
  if (!decision) return null;
  if (!DECISIONS.includes(decision.decision)) throw new Error('invalid supervisor decision');
  if (decision.allowedAction !== null && decision.allowedAction !== undefined && !SAFE_ACTIONS.has(decision.allowedAction)) {
    throw new Error('invalid supervisor action');
  }
  const mapping = {
    CONTINUE: 'CONTINUE',
    REVISE: 'REVISE',
    WAIT_USER: 'NEEDS_YOUSUKE',
    COMPLETE: 'HOLD',
  };
  return {
    decision: mapping[decision.decision],
    reason: String(decision.reason || '').replace(/[\r\n]+/g, ' ').slice(0, 500),
    allowedAction: decision.allowedAction || null,
    targetHead,
    evidenceSourceIds: ['development_supervisor_rule'],
    unknowns: decision.decision === 'WAIT_USER' ? ['user action required'] : [],
    supervisorDecision: decision.decision,
  };
}

function shouldNotify(decision) {
  return Boolean(decision && (decision.decision === 'WAIT_USER' || decision.decision === 'COMPLETE'));
}

module.exports = {
  DECISIONS,
  SAFE_ACTIONS,
  completionState,
  deterministicDecision,
  failureClass,
  normalizeTaskContract,
  shouldNotify,
  supervisorFingerprint,
  toLegacyDecision,
};
