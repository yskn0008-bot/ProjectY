import type {WidgetFeed, WidgetTask} from './selection.js';

export interface ProactiveSuggestion {
  title: string;
  reason: string;
  nextAction: string;
  actionUrl: string | null;
  source: 'existing-widget-task';
  requiresConfirmation: true;
}

/**
 * Reuses the existing widget's one-action decision. No new DB, AI calls,
 * notification delivery or automatic side effects.
 */
export function selectProactiveSuggestion(feed: WidgetFeed): ProactiveSuggestion | null {
  const task = feed.task;
  if (!task || !isUsable(task)) return null;
  const actionUrl = safeActionUrl(task.actionUrl);
  return {
    title: task.title.trim(),
    reason: task.state === '本人操作' ? '本人の操作が必要です'
      : task.state === '実行中' ? '現在進行中の対応です'
      : '次に取り組む候補です',
    nextAction: task.nextAction.trim(),
    actionUrl,
    source: 'existing-widget-task',
    requiresConfirmation: true
  };
}

function isUsable(task: WidgetTask): boolean {
  return Boolean(task.title?.trim() && task.nextAction?.trim()
    && ['本人操作', '実行中', '次にやる'].includes(task.state));
}

function safeActionUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
