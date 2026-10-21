// Pure notification triage adapter. No external writes, no model calls, no new SSOT.
import {selectAlerts} from './alert-engine.mjs';

const clean = value => String(value ?? '').trim();
const forbidden = /\b(?:\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}|\d{6})\b/g;
const authText = /認証|確認コード|ワンタイム|暗証番号|パスコード|ログインコード|verification|one[- ]?time|passcode|security code|\bOTP\b|\bPIN\b/i;
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
  const sensitive = authText.test(title + ' ' + clean(input.summary));
  const summary = redact(input.summary, sensitive, 280);
  const category = ['payment', 'money_anomaly', 'task', 'routine', 'information'].includes(input.category)
    ? input.category : 'information';
  return {
    sourceId, sourceApp, title: redact(title, sensitive, 160), receivedAt, summary,
    ignored: selfApps.test(sourceApp),
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
