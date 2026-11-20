// Read-only adapter for the existing YOS widget feed. Does not modify Focus selection.
import {selectProactiveAction} from './proactive-action.mjs';

export function previewWidgetProactiveAction(feed, {today} = {}) {
  if (!feed || !Array.isArray(feed.tasks)) return null;
  const items = feed.tasks.map((task, index) => ({
    id: String(task.order ?? index),
    title: task.title,
    kind: 'task',
    dueDate: typeof task.due === 'string' ? task.due.slice(0, 10) : '',
    verified: false, // Widget feed has no authoritative verified flag.
    source: 'YOS Tasks'
  }));
  const candidate = selectProactiveAction(items, {today});
  if (!candidate) return null;
  return {
    ...candidate,
    previewOnly: true,
    requiresReview: true,
    focusTaskUnchanged: true,
    currentFocusTitle: feed.task?.title ?? null
  };
}
