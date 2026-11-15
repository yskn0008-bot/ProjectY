import type {FetchLike} from '../http.js';
import type {TaskDashboardItem, TaskDashboardResponse} from '../tasks/handler.js';

const NOTION_VERSION = '2026-03-11';
const DATA_SOURCE_TITLE = 'YOS Tasks';
const MAX_PAGES = 5;
const PAGE_SIZE = 100;

export interface LoadNotionTaskDashboardOptions {
  notionToken: string;
  notionDataSourceId?: string;
  fetchImpl?: FetchLike;
  /** DAYSTREAM needs all tasks, not only the ordered widget shortlist. */
  calendar?: boolean;
}

export async function loadNotionTaskDashboard(
  options: LoadNotionTaskDashboardOptions
): Promise<TaskDashboardResponse> {
  const token = required(options.notionToken, 'Notion token');
  const fetchImpl = options.fetchImpl ?? fetch;
  const dataSourceId = options.notionDataSourceId
    ? normalizeId(options.notionDataSourceId, 'Notion data source ID')
    : await resolveDataSourceId(token, fetchImpl);

  const tasks: TaskDashboardItem[] = [];
  const seen = new Set<string>();
  let cursor: string | null = null;
  let page = 0;
  let ignoredBlankCount = 0;

  do {
    const body: Record<string, unknown> = {page_size: PAGE_SIZE};
    if (cursor) body.start_cursor = cursor;

    const payload = await notionRequest(
      fetchImpl,
      token,
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {method: 'POST', body: JSON.stringify(body)}
    );

    if (options.calendar && typeof payload.has_more !== 'boolean') throw new Error('Notion pagination state is missing');
    if (!Array.isArray(payload.results)) throw new Error('Notion query results are missing');
    const results = payload.results;
    for (const entry of results) {
      const item = parseTask(entry, options.calendar === true);
      if (item) {
        if (options.calendar) {
          if (!item.id || seen.has(item.id)) throw new Error('Notion returned duplicate or missing task IDs');
          seen.add(item.id);
          if (tasks.length >= 400) throw new Error('Notion calendar exceeds client capacity');
        }
        tasks.push(item);
      } else if (options.calendar && isRecord(entry) && entry.archived !== true && entry.in_trash !== true) {
        ignoredBlankCount += 1;
      }
    }

    if (payload.has_more === true && (typeof payload.next_cursor !== 'string' || !payload.next_cursor || payload.next_cursor === cursor)) throw new Error('Notion pagination is incomplete');
    cursor = payload.has_more === true && typeof payload.next_cursor === 'string'
      ? payload.next_cursor
      : null;
    page += 1;
  } while (cursor && page < MAX_PAGES);

  if (cursor) throw new Error('Notion pagination limit reached');
  tasks.sort((a, b) => a.order - b.order);
  return {generatedAt: new Date().toISOString(), tasks, ...(options.calendar ? {source: 'notion' as const, complete: true, ignoredBlankCount} : {})};
}

/** Complete-only, replay-safe operation on one verified page in the existing Tasks source.
 * Notion has no conditional PATCH: pre-read/version/readback detect stale or uncertain
 * results, but cannot promise a transaction against simultaneous external Notion edits.
 */
export async function completeNotionTask(options: LoadNotionTaskDashboardOptions & {
  pageId: string; expectedEditedAt: string; expectedState: string;
}): Promise<TaskDashboardItem> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const id = normalizeId(options.pageId, 'Notion page ID');
  const source = normalizeId(options.notionDataSourceId ?? '', 'Notion data source ID').replaceAll('-', '').toLowerCase();
  const url = `https://api.notion.com/v1/pages/${id}`;
  const read = async () => {
    const page = await notionRequest(fetchImpl, options.notionToken, url, {method: 'GET'});
    if (!isRecord(page.parent) || String(page.parent.data_source_id ?? '').replaceAll('-', '').toLowerCase() !== source) throw new Error('Task parent mismatch');
    const task = parseTask(page, true);
    if (!task || task.id !== id.replaceAll('-', '').toLowerCase()) throw new Error('Task is unavailable');
    if (task.sourceKind !== 'task') throw new Error('Mirrored calendar/reminder/money records must be managed in the original source');
    if (task.habitCycle) throw new Error('Recurring templates cannot be completed as one occurrence');
    return task;
  };
  const current = await read();
  if (current.state === '完了') return current; // Resolve an already-applied request without another write.
  if (!['次にやる','実行中','本人操作'].includes(options.expectedState) || current.state !== options.expectedState || !options.expectedEditedAt || current.lastEditedAt !== options.expectedEditedAt) {
    throw new Error('Task changed; refresh before completion');
  }
  await notionRequest(fetchImpl, options.notionToken, url, {
    method: 'PATCH', body: JSON.stringify({properties: {'状態': {select: {name: '完了'}}}})
  });
  const result = await read();
  if (result.state !== '完了') throw new Error('Completion readback is uncertain');
  return result;
}

async function resolveDataSourceId(notionToken: string, fetchImpl: FetchLike): Promise<string> {
  const payload = await notionRequest(
    fetchImpl,
    notionToken,
    'https://api.notion.com/v1/search',
    {
      method: 'POST',
      body: JSON.stringify({
        query: DATA_SOURCE_TITLE,
        filter: {property: 'object', value: 'data_source'},
        page_size: 100
      })
    }
  );

  const results = Array.isArray(payload.results) ? payload.results : [];
  const matches = results.filter((entry) => {
    if (!isRecord(entry) || entry.object !== 'data_source') return false;
    return notionTitle(entry.title) === DATA_SOURCE_TITLE;
  });

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one Notion data source titled "${DATA_SOURCE_TITLE}", found ${matches.length}`);
  }

  return normalizeId(String(matches[0]?.id ?? ''), 'discovered Notion data source ID');
}

function parseTask(value: unknown, calendar: boolean): TaskDashboardItem | null {
  if (!isRecord(value) || !isRecord(value.properties)) {
    if (calendar) throw new Error('Invalid Notion task');
    return null;
  }
  if (value.archived === true || value.in_trash === true) return null;
  const properties = value.properties;

  const order = numberProperty(properties['実行順']);
  const title = textProperty(properties['やること'], 'title', 160);
  const ordered = Number.isSafeInteger(order) && order >= 1 && order <= 999;
  if (!calendar && (!ordered || !title)) return null;
  // Notion permits blank placeholder pages. Keep them in the DB, report them separately.
  if (calendar && !title) {
    const populated = Object.values(properties).some((property) => {
      if (!isRecord(property)) return false;
      return ['title','rich_text','relation','multi_select'].some(key => Array.isArray(property[key]) && property[key].length > 0)
        || ['date','select','status','url','number','checkbox'].some(key => property[key] !== null && property[key] !== undefined && property[key] !== false);
    });
    if (!populated) return null;
    throw new Error('Notion task has no title');
  }
  const state = selectProperty(properties['状態'], 30);
  if (calendar && !['次にやる','実行中','本人操作','待ち','保留','完了'].includes(state)) throw new Error('Invalid Notion task state');
  const date = isRecord(properties['期限']) && isRecord(properties['期限'].date) ? properties['期限'].date : null;
  const metadata = calendar ? {
    id: normalizeId(String(value.id ?? ''), 'Notion page ID').replaceAll('-', '').toLowerCase(),
    sourceKind: (()=>{const sync=textProperty(properties['同期キー'], 'rich_text', 500);return sync.startsWith('calendar:')?'calendar' as const:sync.startsWith('reminder:')?'reminder' as const:sync.startsWith('money:')?'money' as const:'task' as const})(),
    dueEnd: date && typeof date.end === 'string' ? clean(date.end, 80) : null,
    dueTimeZone: date && typeof date.time_zone === 'string' ? clean(date.time_zone, 80) : null,
    habitCycle: selectProperty(properties['習慣周期'], 30),
    area: selectProperty(properties['領域'], 40),
    lastEditedAt: typeof value.last_edited_time === 'string' ? clean(value.last_edited_time, 80) : null
  } : {};

  return {
    ...metadata,
    order: ordered ? order : 1000,
    title,
    state,
    owner: selectProperty(properties['担当'], 30),
    due: dateProperty(properties['期限']),
    priority: selectProperty(properties['優先度'], 12),
    nextAction: textProperty(properties['次の一手'], 'rich_text', 500),
    completion: textProperty(properties['完了条件'], 'rich_text', 700),
    blocker: textProperty(properties['ブロッカー'], 'rich_text', 500),
    evidence: textProperty(properties['正本・根拠'], 'rich_text', 500),
    actionUrl: urlProperty(properties['操作URL']),
    lastSynced: dateProperty(properties['最終同期'])
  };
}

function numberProperty(value: unknown): number {
  if (!isRecord(value)) return Number.NaN;
  return typeof value.number === 'number' ? value.number : Number.NaN;
}

function selectProperty(value: unknown, max: number): string {
  if (!isRecord(value) || !isRecord(value.select) || typeof value.select.name !== 'string') return '';
  return clean(value.select.name, max);
}

function dateProperty(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.date) || typeof value.date.start !== 'string') return null;
  return clean(value.date.start, 80) || null;
}

function urlProperty(value: unknown): string | null {
  if (!isRecord(value) || typeof value.url !== 'string') return null;
  const raw = value.url.trim();
  if (!raw || raw.length > 2_000) return null;
  try {
    const parsed = new URL(raw);
    return ['https:', 'http:', 'shortcuts:', 'scriptable:', 'calshow:'].includes(parsed.protocol) ? raw : null;
  } catch {
    return null;
  }
}

function textProperty(value: unknown, key: 'title' | 'rich_text', max: number): string {
  if (!isRecord(value) || !Array.isArray(value[key])) return '';
  const text = value[key].map((part) => {
    if (!isRecord(part)) return '';
    if (typeof part.plain_text === 'string') return part.plain_text;
    if (isRecord(part.text) && typeof part.text.content === 'string') return part.text.content;
    return '';
  }).join('');
  return clean(text, max);
}

function notionTitle(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map((part) => {
    if (!isRecord(part)) return '';
    if (typeof part.plain_text === 'string') return part.plain_text;
    if (isRecord(part.text) && typeof part.text.content === 'string') return part.text.content;
    return '';
  }).join('').trim();
}

async function notionRequest(
  fetchImpl: FetchLike,
  notionToken: string,
  url: string,
  init: {method: string; body?: string}
): Promise<Record<string, any>> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION
    }
  });
  if (!response.ok) throw new Error(`Notion request failed: ${response.status}`);
  const payload = await response.json();
  if (!isRecord(payload)) throw new Error('Notion returned invalid JSON');
  return payload;
}

function clean(value: string, max: number): string {
  return value.replace(/[\u0000-\u001F\u007F]/gu, ' ').trim().slice(0, max);
}

function normalizeId(value: string, label: string): string {
  const normalized = value.trim();
  if (!/^[a-f0-9-]{32,36}$/iu.test(normalized) || normalized.replaceAll('-', '').length !== 32) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
