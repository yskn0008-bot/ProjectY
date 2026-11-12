// Candidate-only extraction. Never authorizes payment or marks an invoice paid.
const text = (v, n = 300) => typeof v === 'string' ? v.trim().slice(0, n) : '';
const AMOUNT_RE = /(?:¥|￥|金額[:：]?\s*|請求(?:額|金額)[:：]?\s*|お支払(?:い)?金額[:：]?\s*)([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{1,9})(?![0-9,])\s*円?/gu;
const DUE_RE = /(?:支払期限|お支払期限|お支払い期限|振込期限|納付期限|期限)[:：\s]*([^\n]{0,35})/u;
const NEGATIVE = /(?:広告|キャンペーン|クーポン|ポイント還元|お支払い完了|決済完了|入金確認|領収書)/u;
const BILLING = /(?:請求|未払い|未納|支払期限|お支払い期限|納付期限|振込期限|督促)/u;
function isoDate(raw) {
  const m = text(raw, 50).match(/(?<!\d)(20\d{2})[\/.-](\d{1,2})[\/.-](\d{1,2})(?!\d)/u);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
    ? [y, String(mo).padStart(2, '0'), String(d).padStart(2, '0')].join('-') : null;
}
export function extractBillingCandidate(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const subject = text(input.subject, 240);
  const body = text(input.body, 8000);
  const sourceId = text(input.sourceId, 200);
  const sender = text(input.sender, 200);
  const combined = subject + '\n' + body;
  if (!sourceId || !BILLING.test(combined) || NEGATIVE.test(subject)) return null;
  const dueLine = combined.match(DUE_RE)?.[1] || '';
  const dueDate = isoDate(dueLine);
  const amounts = [...combined.matchAll(AMOUNT_RE)].map(m => Number(m[1].replaceAll(',', '')))
    .filter(v => Number.isSafeInteger(v) && v > 0);
  const uniqueAmounts = [...new Set(amounts)];
  // Multiple amounts may represent principal, interest and total; never guess which to pay.
  const amount = uniqueAmounts.length === 1 ? uniqueAmounts[0] : null;
  const category = /(?:督促|未納|延滞|債権|訴訟|法的措置)/u.test(combined)
    ? 'debt_or_collection_review' : 'billing_review';
  return {
    schema: 'yos-billing-candidate-v1',
    source_id: sourceId,
    sender,
    subject,
    amount_yen: amount,
    due_date: dueDate,
    category,
    status: 'unverified',
    requires_review: true,
    reason: !dueDate ? 'due_date_unverified' : amount === null ? 'amount_ambiguous' : 'awaiting_source_verification',
    // Source ID is the idempotency key; a reminder with a new source ID still needs
    // matching against existing bills before any persistent Money write.
    idempotency_key: 'gmail:' + sourceId
  };
}
export function shouldCreateMoneyEntry(candidate, existing = []) {
  if (!candidate || candidate.schema !== 'yos-billing-candidate-v1' ||
      candidate.status !== 'verified' || candidate.requires_review !== false ||
      !text(candidate.source_id, 200) || candidate.source_id !== text(candidate.source_id, 200) ||
      candidate.idempotency_key !== 'gmail:' + candidate.source_id ||
      !/^20\d{2}-\d{2}-\d{2}$/u.test(candidate.due_date || '') ||
      isoDate(candidate.due_date) !== candidate.due_date || !Array.isArray(existing) ||
      !Number.isSafeInteger(candidate.amount_yen) || candidate.amount_yen <= 0) return false;
  // A reminder with another message ID may refer to an existing bill. Matching
  // sender/date/amount is a review candidate, not proof of a separate expense.
  return !existing.some(e => e?.idempotency_key === candidate.idempotency_key ||
    (text(candidate.sender) && text(e?.sender).toLowerCase() === text(candidate.sender).toLowerCase() &&
      e?.due_date === candidate.due_date && e?.amount_yen === candidate.amount_yen));
}
