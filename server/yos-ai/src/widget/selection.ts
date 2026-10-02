import type {TaskDashboardItem} from '../tasks/handler.js';

const ACTIVE_STATES = new Set(['実行中', '本人操作']);
const NEXT_STATE = '次にやる';
const MAX_WIDGET_TASKS = 3;

export interface WidgetTask {
  title: string;
  state: string;
  due: string | null;
  nextAction: string;
}

export interface WidgetFeed {
  generatedAt: string | null;
  task: WidgetTask | null;
  tasks: WidgetTask[];
  sourceState: 'active' | 'next' | 'empty';
}

export function selectWidgetFeed(tasks: TaskDashboardItem[], generatedAt: string | null): WidgetFeed {
  const ordered = [...tasks].sort((a, b) => a.order - b.order);
  const active = ordered.filter((task) => ACTIVE_STATES.has(task.state));
  const next = ordered.filter((task) => task.state === NEXT_STATE);
  const selected = [...active, ...next].slice(0, MAX_WIDGET_TASKS).map(toWidgetTask);
  const first = selected[0] ?? null;

  if (!first) return {generatedAt, task: null, tasks: [], sourceState: 'empty'};

  return {
    generatedAt,
    sourceState: active.length > 0 ? 'active' : 'next',
    task: first,
    tasks: selected
  };
}

function toWidgetTask(task: TaskDashboardItem): WidgetTask {
  return {
    title: task.title,
    state: task.state,
    due: task.due,
    nextAction: task.nextAction
  };
}
