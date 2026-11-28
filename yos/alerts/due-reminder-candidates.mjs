// Deterministic due-time reminders; caller schedules delivery through existing YOS Alerts.
// The receipt key includes the reminder stage, preventing repeated alerts at each stage.
const DAY_MS = 86400000;
const clean = v => String(v ?? '').trim();
const dayNumber = value => {
  const day = clean(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const timestamp = Date.parse(day + 'T00:00:00Z');
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === day ? timestamp / DAY_MS : null;
};

export function dueReminderCandidates(items, {today, notifiedKeys = []} = {}) {
  const current = dayNumber(today);
  if (current === null) throw new TypeError('valid today (YYYY-MM-DD) is required');
  const sent = new Set(notifiedKeys);
  const result = [];
  for (const item of items ?? []) {
    if (!item || item.completed === true || item.paid === true || item.received === true) continue;
    const id = clean(item.sourceId || item.id);
    const due = dayNumber(item.dueAt || item.dueDate);
    if (!id || due === null) continue;
    const daysUntil = due - current;
    const stage = daysUntil === 1 ? 'day-before' : daysUntil === 0 ? 'due-today' : daysUntil < 0 ? 'overdue' : null;
    if (!stage) continue;
    const key = id + ':' + clean(item.dueAt || item.dueDate).slice(0, 10) + ':' + stage;
    if (sent.has(key)) continue;
    result.push({...item, sourceId: key, reminderStage: stage, daysUntil});
  }
  return result;
}
