// Pure one-action recommendation selector. Read-only: no task creation or notifications.
const validDate = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const t = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0,10) === value ? t : null;
};
export function selectProactiveAction(items, {today} = {}) {
  const now = validDate(today);
  if (now === null) throw new TypeError('today must be YYYY-MM-DD');
  const candidates = [];
  for (const item of items ?? []) {
    if (!item || typeof item !== 'object' || item.completed || item.paid) continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const due = validDate(item.dueDate);
    if (!id || !title || due === null || !['payment','task','appointment'].includes(item.kind)) continue;
    const daysUntil = Math.round((due - now) / 86400000);
    if (daysUntil > 7) continue;
    // Unknown balances cannot be treated as zero; verified urgency is explicit.
    const verified = item.verified === true;
    const severity = verified && item.kind === 'payment' && item.shortfallConfirmed === true ? 0
      : verified && daysUntil <= 0 ? 1
      : verified && daysUntil <= 1 ? 2 : 3;
    candidates.push({id,title,kind:item.kind,dueDate:item.dueDate,daysUntil,
      severity,requiresReview:!verified,source:item.source || null});
  }
  candidates.sort((a,b)=>a.severity-b.severity || a.daysUntil-b.daysUntil || a.id.localeCompare(b.id));
  return candidates[0] || null;
}
