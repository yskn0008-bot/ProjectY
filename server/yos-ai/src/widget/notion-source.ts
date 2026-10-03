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
  let cursor: string | null = null;
  let page = 0;

  do {
    const body: Record<string, unknown> = {page_size: PAGE_SIZE};
    if (cursor) body.start_cursor = cursor;

    const payload = await notionRequest(
      fetchImpl,
      token,
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {method: 'POST', body: JSON.stringify(body)}
    );

    const results = Array.isArray(payload.results) ? payload.results : [];
    for (const entry of results) {
      const item = parseTask(entry);
      if (item) tasks.push(item);
    }

    cursor = payload.has_more === true && typeof payload.next_cursor === 'string'
      ? payload.next_cursor
      : null;
    page += 1;
  } while (cursor && page < MAX_PAGES);

  tasks.sort((a, b) => a.order - b.order);
  return {generatedAt: new Date().toISOString(), tasks};
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

function parseTask(value: unknown): TaskDashboardItem | null {
  if (!isRecord(value) || !isRecord(value.properties)) return null;
  const properties = value.properties;

  const order = numberProperty(properties['実行順']);
  const title = textProperty(properties['やること'], 'title', 160);
  if (!Number.isSafeInteger(order) || order < 1 || order > 999 || !title) return null;

  return {
    order,
    title,
    state: selectProperty(properties['状態'], 30),
    owner: selectProperty(properties['担当'], 30),
    due: dateProperty(properties['期限']),
    priority: selectProperty(properties['優先度'], 12),
    nextAction: textProperty(properties['次の一手'], 'rich_text', 500),
    completion: textProperty(properties['完了条件'], 'rich_text', 700),
    blocker: textProperty(properties['ブロッカー'], 'rich_text', 500),
    evidence: textProperty(properties['正本・根拠'], 'rich_text', 500)
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
  init: {method: string; body: string}
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
