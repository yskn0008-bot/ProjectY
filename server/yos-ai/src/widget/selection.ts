import type {TaskDashboardItem} from '../tasks/handler.js';

const ACTIVE_STATES = new Set(['実行中', '本人操作']);
const NEXT_STATE = '次にやる';

export interface WidgetTask {
  title: string;
  state: string;
  due: string | null;
  nextAction: string;
}

export interface WidgetFeed {
  generatedAt: string | null;
  task: WidgetTask | null;
  sourceState: 'active' | 'next' | 'empty';
}

export function selectWidgetFeed(tasks: TaskDashboardItem[], generatedAt: string | null): WidgetFeed {
  const ordered = [...tasks].sort((a, b) => a.order - b.order);
  const active = ordered.find((task) => ACTIVE_STATES.has(task.state));
  const selected = active ?? ordered.find((task) => task.state === NEXT_STATE) ?? null;

  if (!selected) return {generatedAt, task: null, sourceState: 'empty'};

  return {
    generatedAt,
    sourceState: active ? 'active' : 'next',
    task: {
      title: selected.title,
      state: selected.state,
      due: selected.due,
      nextAction: selected.nextAction
    }
  };
}
