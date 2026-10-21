// Pure notification triage adapter. No external writes, no model calls, no new SSOT.
import {selectAlerts} from './alert-engine.mjs';

const clean = value => String(value ?? '').trim();
const forbidden = /\b(?:\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}|\d{6})\b/g;
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
    // Double notification is opt-in only after the original app notice is no longer active.
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
// A caller may request delivery only after confirming that the replacement
// is more useful and the original app notification has intentionally been disabled.
export function planYosDeliveries(inputs, options = {}) {
  const result = triageNotifications(inputs, options);
  const send = [], held = [];
  for (const alert of result.alerts) {
    const entry = {...formatYosNotification(alert), channel: alert.channel, key: alert.key};
    // OTPs stay in the originating app only, never YOS re-notification.
    // Confirmed P0 can run in parallel with the original safety notification.
    const confirmedEmergency = alert.channel === 'emergency' &&
      alert.requiresImmediateAwareness && alert.requiresImmediateAction &&
      alert.delayCausesMaterialHarm;
    const replacementReady = alert.originalNoticeDisabled || confirmedEmergency;
    if (!alert.sensitive && alert.deliveryApproved && alert.materiallyMoreUseful &&
        replacementReady && !['morning', 'night', 'routine'].includes(alert.channel)) {
      send.push(entry);
    }
    else held.push(entry);
  }
  return {records: result.records, send, held};
}
