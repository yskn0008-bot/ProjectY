// Pure notification triage adapter. No external writes, no model calls, no new SSOT.
import {selectAlerts} from './alert-engine.mjs';

const clean = value => String(value ?? '').trim();
const forbidden = /\b(?:\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}|\d{6})\b/g;

export function normalizeNotification(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('notification must be an object');
  const sourceId = clean(input.sourceId);
  const title = clean(input.title);
  const receivedAt = clean(input.receivedAt);
  if (!sourceId || !title || !receivedAt || Number.isNaN(Date.parse(receivedAt))) {
    throw new TypeError('sourceId, title and valid receivedAt are required');
  }
  const summary = clean(input.summary).replace(forbidden, '[redacted]').slice(0, 280);
  const category = ['payment', 'money_anomaly', 'task', 'routine', 'information'].includes(input.category)
    ? input.category : 'information';
  return {
    sourceId, title: title.slice(0, 160), receivedAt, summary,
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
  const alerts = selectAlerts(records, {notifiedKeys, now});
  return {records, alerts};
}
