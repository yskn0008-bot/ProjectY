import type {TaskDashboardItem} from '../tasks/handler.js';

const ACTIVE_STATES = new Set(['実行中', '本人操作']);
const NEXT_STATE = '次にやる';
const MAX_WIDGET_TASKS = 3;

export interface WidgetTask {
  order: number;
  title: string;
  state: string;
  priority: string;
  due: string | null;
  nextAction: string;
  actionUrl: string | null;
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
    order: task.order,
    title: task.title,
    state: task.state,
    priority: task.priority,
    due: task.due,
    nextAction: task.nextAction,
    actionUrl: task.actionUrl ?? null
  };
}


// Narrow calendar projection; never expose task notes, blockers or evidence.
// Unlike the 3-item widget card, this is for due dates in a bounded calendar window.
export interface CalendarDueTask {
  title: string;
  due: string;
  state: string;
  priority: string;
}

export interface CalendarWindowFeed {
  generatedAt: string | null;
  tasks: CalendarDueTask[];
  matchingCount: number;
  truncated: boolean;
  sourceComplete: boolean;
}

const CLOSED_TASK_STATES = new Set(['完了', '中止', '取り消し', 'キャンセル']);
const MAX_CALENDAR_TASKS = 100;

export function selectCalendarWindow(
  tasks: TaskDashboardItem[],
  generatedAt: string | null,
  start: string,
  end: string,
  sourceComplete = false
): CalendarWindowFeed {
  const matching = tasks
    .filter((task) => {
      if (!task.title?.trim() || CLOSED_TASK_STATES.has(task.state)) return false;
      const date=String(task.due || '').slice(0,10);
      return /^\d{4}-\d{2}-\d{2}$/.test(date) && date>=start && date<=end;
    })
    .sort((a,b) => String(a.due).localeCompare(String(b.due)) || a.order-b.order);
  const selected=matching.slice(0,MAX_CALENDAR_TASKS).map(task => ({
    title:task.title.slice(0,160),
    due:String(task.due).slice(0,10),
    state:task.state.slice(0,30),
    priority:task.priority.slice(0,12)
  }));
  return {
    generatedAt,
    tasks:selected,
    matchingCount:matching.length,
    truncated:matching.length>MAX_CALENDAR_TASKS || !sourceComplete,
    sourceComplete
  };
}
