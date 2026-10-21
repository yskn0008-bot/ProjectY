// Pure notification triage adapter. No external writes, no model calls, no new SSOT.
import {selectAlerts} from './alert-engine.mjs';

const clean = value => String(value ?? '').trim();
const forbidden = /\b(?:\d[ -]?){11,27}\d\b|\b\d{6}\b/g;
const authText = /認証|確認コード|ワンタイム|暗証番号|パスコード|ログインコード|verification|one[- ]?time|passcode|security code|sign[- ]?in code|\bOTP\b|\bPIN\b/i;
const selfApps = /^(?:shortcuts?|ショートカット|actions|scriptable|chatgpt|yos(?: alerts)?|clarity notification)$/i;
const redact = (value, sensitive, limit) => sensitive
  ? '認証・セキュリティ通知。内容は元アプリで確認'
  : clean(value).replace(forbidden, '[redacted]').slice(0, limit);

export function normalizeNotification(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('notification must be an object');
  const sourceId = clean(input.sourceId);
  const title = clean(input.title);
  const receivedAt = clean(input.receivedAt);
  if (!sourceId || !title || !receivedAt || Number.isNaN(Date.parse(receivedAt))) {
    throw new TypeError('sourceId, title and valid receivedAt are required');
  }
  const sourceApp = clean(input.sourceApp);
  // The analysis object is a proposal from a trusted YOS model step, not
  // instructions read out of the third-party notification.
  const proposal = input.analysis && typeof input.analysis === 'object' && !Array.isArray(input.analysis)
    ? input.analysis : null;
  const sensitive = authText.test(title + ' ' + clean(input.summary) + ' ' +
    (proposal ? [proposal.what,proposal.impact,proposal.deadline,proposal.nextAction].map(clean).join(' ') : ''));
  const summary = redact(input.summary, sensitive, 280);
  const analysis = proposal ? {
    what: redact(proposal.what, sensitive, 120),
    impact: redact(proposal.impact, sensitive, 140),
    deadline: proposal.deadlineConfirmedBySource === true
      ? redact(proposal.deadline, sensitive, 70) : '',
    deadlineConfirmedBySource: proposal.deadlineConfirmedBySource === true,
    nextAction: redact(proposal.nextAction, sensitive, 120)
  } : null;
  const category = ['payment', 'money_anomaly', 'task', 'routine', 'information'].includes(input.category)
    ? input.category : 'information';
  return {
    sourceId, sourceApp, title: redact(title, sensitive, 160), receivedAt, summary, analysis,
    sensitive, ignored: selfApps.test(sourceApp),
    nativeReminderNotifies: input.nativeReminderNotifies === true,
    existingAutomationNotifies: input.existingAutomationNotifies === true,
    // Delivery is separately authorized and must add meaningful value.
    // Keep the original app's notification on until on-device acceptance passes.
    deliveryApproved: input.deliveryApproved === true,
    materiallyMoreUseful: input.materiallyMoreUseful === true,
    originalNoticeDisabled: input.originalNoticeDisabled === true,
    // This flag must be set by trusted YOS code, never parsed from notification text.
    confirmedByYOS: input.confirmedByYOS === true,
    kind: category,
    requiresImmediateAwareness: input.requiresImmediateAwareness === true,
    requiresImmediateAction: input.requiresImmediateAction === true,
    delayCausesMaterialHarm: input.delayCausesMaterialHarm === true,
    needsReview: input.needsReview !== false,
    deferToNight: input.deferToNight === true,
    sourceUrl: /^https:\/\//.test(clean(input.sourceUrl)) ? clean(input.sourceUrl) : ''
  };
}

// Caller must persist sourceId and delivery receipts in existing storage.
// Only explicit triage facts can qualify as emergency.
export function triageNotifications(inputs, {notifiedKeys = [], now = new Date()} = {}) {
  const records = inputs.map(normalizeNotification);
  // Raw third-party notifications never create another notification.
  // Require an explicit, trusted YOS review before any re-delivery.
  const deliveryCandidates = records.filter(record =>
    !record.ignored && !record.needsReview && record.confirmedByYOS);
  const alerts = selectAlerts(deliveryCandidates, {notifiedKeys, now});
  return {records, alerts};
}

// Convert an AI proposal to a readable detail view without asserting missing facts.
// The lock-screen payload deliberately excludes names, amounts and OTPs.
export function formatYosNotification(input) {
  // Revalidate even if input already resembles a normalized record.
  const n = normalizeNotification(input);
  const facts = n.analysis || {};
  return {
    title: 'YOS Alerts',
    lockScreenBody: '要確認の通知があります。詳細はYOSで確認してください。',
    detail: [
      '何が起きた：' + (facts.what || n.summary || '未確認'),
      '影響：' + (facts.impact || '未確認'),
      '期限：' + (facts.deadline || '未確認'),
      '次の行動：' + (facts.nextAction || '元アプリを開いて原本を確認'),
      '原本：' + (n.sourceApp ? n.sourceApp + 'アプリで確認' : '元通知で確認')
    ].join('\n'),
    sourceUrl: n.sourceUrl,
    sourceId: n.sourceId
  };
}

// Classification is not delivery. No sender is included in this module.
// Only trusted, reviewed P0/P1 information that provides additional value can
// be scheduled; an upstream app's original notification stays enabled.
export function planYosDeliveries(inputs, options = {}) {
  const result = triageNotifications(inputs, options);
  const send = [], held = [];
  for (const alert of result.alerts) {
    const entry = {...formatYosNotification(alert), channel: alert.channel, key: alert.key};
    // Never suppress upstream alerts. P0 and explicitly reviewed valuable
    // P1 guidance may coexist until the complete iPhone flow is verified.
    // Low priority, duplicates, OTPs and AI-only guesses stay held.
    const actionable = ['emergency', 'payment', 'money', 'task'].includes(alert.channel);
    if (!alert.sensitive && alert.deliveryApproved && alert.materiallyMoreUseful && actionable) {
      send.push(entry);
    } else {
      held.push(entry);
    }
  }
  return {records: result.records, send, held};
}


// Parse the two *existing* iPhone output contracts. This merely validates an
// AI proposal; the caller must independently approve and receipt any delivery.
// Strict first-line matching prevents third-party notification text from faking
// a YOS_ALERT by mentioning that word inside the body.
export function parseYosModelResponse(value) {
  const invalid = {valid: false, status: 'YOS_SILENT', priority: 'P3', analysis: null};
  if (typeof value !== 'string' || value.length > 5000) return invalid;
  const lines = value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
    .split('\n').map(line => line.trim()).filter(Boolean);
  const status = lines[0];
  if (!['YOS_ALERT', 'YOS_SILENT'].includes(status)) return invalid;
  // Legacy: status + priority + five facts + evidence (7 lines).
  // Notification Context v0.3: status + exactly five facts (6 lines).
  const latest = lines.length === 6;
  const labels = latest
    ? ['事実','本人への影響','将来のリスク','推奨する次の一手','根拠と鮮度']
    : ['優先度','事実','自分への影響','将来リスク','推奨','根拠'];
  if (lines.length !== labels.length + 1) return invalid;
  const values = [];
  for (let i = 0; i < labels.length; i++) {
    const prefix = labels[i] + ':';
    const line = lines[i+1].replace(/：/, ':');
    if (!line.startsWith(prefix)) return invalid;
    values.push(line.slice(prefix.length).trim());
  }
  if (values.some(x => !x)) return invalid;
  const priority = latest ? (status === 'YOS_ALERT' ? 'P1' : 'P3') : values[0];
  if (!['P0','P1','P2','P3'].includes(priority) ||
      ((status === 'YOS_ALERT') !== ['P0','P1'].includes(priority))) return invalid;
  const [what, impact, risk, nextAction, evidence] = latest ? values : values.slice(1);
  // AI replies with authentication codes do not leave this adapter.
  if (authText.test(value)) return invalid;
  return {
    valid: true, status, priority,
    // Legacy and v0.3 carry the same five useful fields once normalized.
    // 'P1' for v0.3 means candidate only, not verified impact/severity.
    analysis: {
      what: redact(what,false,120), impact: redact(impact,false,140),
      risk: redact(risk,false,180), nextAction: redact(nextAction,false,120),
      evidence: redact(evidence,false,180)
    }
  };
}
