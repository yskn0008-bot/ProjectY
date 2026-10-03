import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';
import {mirrorNotionInput, type NotionMirrorInput, type NotionMirrorItem} from '../intake/mirror-handler.js';

const SCHEMA = 'yos-base-home-refresh-v1';
const NOTION_VERSION = '2026-03-11';
const DATA_SOURCE_TITLE = 'YOS Tasks';
const DATA_SOURCE_CACHE_KEY = 'yos:notion:mirror:v1:data-source';
const DATA_SOURCE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_MAX_BODY_BYTES = 96_000;
const MAX_LOCAL_ITEMS = 30;
const PROJECTY_HOME = 'https://yskn0008-bot.github.io/ProjectY/system/';
const PROJECTY_REPO = 'yskn0008-bot/ProjectY';

export interface BaseHomeCalendarItem {
  id: string;
  title: string;
  start: string;
  end?: string | null;
  location?: string | null;
  allDay?: boolean;
}

export interface BaseHomeReminderItem {
  id: string;
  title: string;
  dueAt?: string | null;
  priority?: number | null;
  overdue?: boolean;
}

export interface BaseHomeMoneySnapshot {
  updatedAt: string;
  usableAmount: number | null;
  nextPayment?: {label: string; date: string; amount: number | null} | null;
  nextIncome?: {label: string; date: string; amount: number | null} | null;
  shortfall?: {amount: number; date?: string | null} | null;
  actionUrl?: string | null;
}

export interface BaseHomeRefreshInput {
  schema: typeof SCHEMA;
  eventId: string;
  syncedAt: string;
  calendar?: BaseHomeCalendarItem[];
  reminders?: BaseHomeReminderItem[];
  money?: BaseHomeMoneySnapshot | null;
  refreshProjectY?: boolean;
}

interface MissionControl {
  updated_at?: string;
  inbox?: Array<Record<string, unknown>>;
  recently_completed?: Array<Record<string, unknown>>;
  projects?: Array<Record<string, unknown>>;
}

export function createBaseHomeRefreshHandler(options: {
  widgetToken: string;
  notionToken: string;
  notionDataSourceId?: string | null;
  redis: RedisCommandClient;
  fetchImpl?: FetchLike;
  maxBodyBytes?: number;
}): (request: Request) => Promise<Response> {
  const widgetToken = required(options.widgetToken, 'Widget token');
  if (widgetToken.length < 32 || widgetToken.length > 512) throw new Error('Invalid widget token');
  const notionToken = required(options.notionToken, 'Notion token');
  const notionDataSourceId = options.notionDataSourceId?.trim() || null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405, {Allow: 'POST'});
    if (!safeEqual(bearerToken(request), widgetToken)) return json({error: 'Authentication failed'}, 401);

    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') return json({error: 'Content-Type must be application/json'}, 415);

    let bodyText = '';
    try {
      bodyText = await request.text();
    } catch {
      return json({error: 'Invalid request body'}, 400);
    }
    if (new TextEncoder().encode(bodyText).byteLength > maxBodyBytes) {
      return json({error: 'Request body is too large'}, 413);
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(bodyText);
    } catch {
      return json({error: 'Invalid JSON'}, 400);
    }
    const parsed = parseInput(parsedJson);
    if (!parsed.ok) return json({error: parsed.error}, 400);

    try {
      const dataSourceId = await resolveDataSourceId({
        configured: notionDataSourceId,
        notionToken,
        redis: options.redis,
        fetchImpl
      });
      const results: Record<string, unknown> = {};

      if (parsed.value.calendar !== undefined) {
        const items = parsed.value.calendar.map(calendarToMirrorItem);
        results.calendar = await syncSnapshot({
          eventId: parsed.value.eventId + ':calendar',
          syncedAt: parsed.value.syncedAt,
          source: 'Apple Calendar',
          prefix: 'calendar:',
          items,
          notionToken,
          notionDataSourceId: dataSourceId,
          redis: options.redis,
          fetchImpl
        });
      }

      if (parsed.value.reminders !== undefined) {
        const items = parsed.value.reminders.map(reminderToMirrorItem);
        results.reminders = await syncSnapshot({
          eventId: parsed.value.eventId + ':reminders',
          syncedAt: parsed.value.syncedAt,
          source: 'Apple Reminders',
          prefix: 'reminder:',
          items,
          notionToken,
          notionDataSourceId: dataSourceId,
          redis: options.redis,
          fetchImpl
        });
      }

      if (parsed.value.money) {
        const item = moneyToMirrorItem(parsed.value.money);
        results.money = await syncSnapshot({
          eventId: parsed.value.eventId + ':money',
          syncedAt: parsed.value.syncedAt,
          source: 'YOS Money',
          prefix: 'money:',
          items: [item],
          notionToken,
          notionDataSourceId: dataSourceId,
          redis: options.redis,
          fetchImpl
        });
      }

      if (parsed.value.refreshProjectY === true) {
        const current = await loadMissionControl(fetchImpl);
        results.projectY = await syncSnapshot({
          eventId: parsed.value.eventId + ':projecty:' + current.sha.slice(0, 12),
          syncedAt: parsed.value.syncedAt,
          source: 'GitHub / Mission Control',
          prefix: 'projecty:',
          items: missionControlToMirrorItems(current.data, current.sha),
          notionToken,
          notionDataSourceId: dataSourceId,
          redis: options.redis,
          fetchImpl
        });
      }

      return json({ok: true, eventId: parsed.value.eventId, results}, 200);
    } catch (error) {
      return json({
        error: 'BASE HOME refresh is temporarily unavailable',
        retryable: true
      }, 503);
    }
  };
}

async function syncSnapshot(options: {
  eventId: string;
  syncedAt: string;
  source: string;
  prefix: string;
  items: NotionMirrorItem[];
  notionToken: string;
  notionDataSourceId: string;
  redis: RedisCommandClient;
  fetchImpl: FetchLike;
}): Promise<{updated: number; archived: number; duplicate: boolean}> {
  let duplicate = false;
  let updated = 0;

  if (options.items.length) {
    const input: NotionMirrorInput = {
      eventId: options.eventId,
      syncedAt: options.syncedAt,
      source: options.source,
      items: options.items
    };
    const result = await mirrorNotionInput({
      input,
      notionToken: options.notionToken,
      notionDataSourceId: options.notionDataSourceId,
      redis: options.redis,
      fetchImpl: options.fetchImpl
    });
    duplicate = result.duplicate;
    updated = result.updated;
  }

  const keep = new Set(options.items.map(item => item.syncKey));
  const archived = await reconcilePrefix({
    prefix: options.prefix,
    keep,
    notionToken: options.notionToken,
    notionDataSourceId: options.notionDataSourceId,
    redis: options.redis,
    fetchImpl: options.fetchImpl
  });

  return {updated, archived, duplicate};
}

export async function reconcilePrefix(options: {
  prefix: string;
  keep: Set<string>;
  notionToken: string;
  notionDataSourceId: string;
  redis: RedisCommandClient;
  fetchImpl?: FetchLike;
}): Promise<number> {
  if (!['calendar:', 'reminder:', 'money:', 'projecty:'].includes(options.prefix)) {
    throw new Error('Unsafe mirror prefix');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  let cursor: string | null = null;
  let archived = 0;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      filter: {
        property: '同期キー',
        rich_text: {starts_with: options.prefix}
      }
    };
    if (cursor) body.start_cursor = cursor;

    const payload = await notionRequest(
      fetchImpl,
      options.notionToken,
      `https://api.notion.com/v1/data_sources/${options.notionDataSourceId}/query`,
      {method: 'POST', body: JSON.stringify(body)}
    );
    const results = Array.isArray(payload.results) ? payload.results : [];

    for (const raw of results) {
      if (!isRecord(raw) || typeof raw.id !== 'string' || !isRecord(raw.properties)) continue;
      const syncKey = richTextValue(raw.properties['同期キー']);
      if (!syncKey || !syncKey.startsWith(options.prefix) || options.keep.has(syncKey)) continue;

      await notionRequest(
        fetchImpl,
        options.notionToken,
        `https://api.notion.com/v1/pages/${raw.id}`,
        {method: 'PATCH', body: JSON.stringify({archived: true})}
      );
      archived += 1;
      try {
        await options.redis.command<number>(['DEL', `yos:notion:mirror:v1:item:${syncKey}`]);
      } catch {
        // Redis mapping cleanup is best-effort. A future retry can still locate by sync key.
      }
    }

    cursor = payload.has_more === true && typeof payload.next_cursor === 'string'
      ? payload.next_cursor
      : null;
  } while (cursor);

  return archived;
}

export function calendarToMirrorItem(item: BaseHomeCalendarItem): NotionMirrorItem {
  const start = validDateTime(item.start) ?? new Date().toISOString();
  const detail = [item.allDay ? '終日' : formatTokyoTime(start), clean(item.location ?? '', 160)]
    .filter(Boolean)
    .join('・');
  return {
    syncKey: 'calendar:' + stableId(item.id),
    title: '予定｜' + clean(item.title || '予定', 180),
    area: 'Life',
    priority: 'P2',
    status: '保留',
    kind: 'Task',
    owner: 'YOS',
    nextAction: detail || null,
    blocker: null,
    sourceRef: 'Apple Calendar:' + clean(item.id, 240),
    actionUrl: 'calshow:' + String(Math.floor(Date.parse(start) / 1000)),
    dueAt: start
  };
}

export function reminderToMirrorItem(item: BaseHomeReminderItem): NotionMirrorItem {
  const dueAt = item.dueAt ? validDateTime(item.dueAt) : null;
  const priority = reminderPriority(item.priority);
  return {
    syncKey: 'reminder:' + stableId(item.id),
    title: 'Task｜' + clean(item.title || 'Reminder', 180),
    area: 'Life',
    priority,
    status: item.overdue ? '本人操作' : '次にやる',
    kind: 'Task',
    owner: '陽介',
    nextAction: item.overdue ? '期限を過ぎています。Remindersで確認' : (dueAt ? 'Remindersで確認' : null),
    blocker: item.overdue ? '期限超過' : null,
    sourceRef: 'Apple Reminders:' + clean(item.id, 240),
    actionUrl: null,
    dueAt
  };
}

export function moneyToMirrorItem(snapshot: BaseHomeMoneySnapshot): NotionMirrorItem {
  const parts = [
    '使えるお金 ' + yen(snapshot.usableAmount),
    snapshot.nextPayment ? '次の支払い ' + snapshot.nextPayment.date + ' ' + clean(snapshot.nextPayment.label, 80) + ' ' + yen(snapshot.nextPayment.amount) : '次の支払い 予定なし',
    snapshot.nextIncome ? '次の入金 ' + snapshot.nextIncome.date + ' ' + clean(snapshot.nextIncome.label, 80) + ' ' + yen(snapshot.nextIncome.amount) : '次の入金 予定なし',
    snapshot.shortfall && snapshot.shortfall.amount > 0
      ? '不足見込み ' + yen(snapshot.shortfall.amount) + (snapshot.shortfall.date ? ' (' + snapshot.shortfall.date + ')' : '')
      : '不足見込み なし'
  ];
  return {
    syncKey: 'money:current',
    title: 'Money｜現在地',
    area: 'Money',
    priority: snapshot.shortfall && snapshot.shortfall.amount > 0 ? 'P0' : 'P1',
    status: snapshot.shortfall && snapshot.shortfall.amount > 0 ? '本人操作' : '保留',
    kind: 'Task',
    owner: 'YOS',
    nextAction: parts.join(' / '),
    blocker: snapshot.shortfall && snapshot.shortfall.amount > 0 ? '残高不足見込み ' + yen(snapshot.shortfall.amount) : null,
    sourceRef: 'YOS Money money.json:' + clean(snapshot.updatedAt, 80),
    actionUrl: snapshot.actionUrl ?? null,
    dueAt: snapshot.nextPayment?.date ? dateOnly(snapshot.nextPayment.date) : null
  };
}

export function missionControlToMirrorItems(data: MissionControl, sha: string): NotionMirrorItem[] {
  const items: NotionMirrorItem[] = [];
  const updated = clean(data.updated_at ?? '', 80);

  const projects = Array.isArray(data.projects) ? data.projects : [];
  for (const raw of projects) {
    const status = clean(raw.status, 30);
    const priorityNumber = number(raw.priority);
    if (status !== 'active' || priorityNumber === null || priorityNumber > 2) continue;
    const id = clean(raw.id, 120);
    const name = clean(raw.name, 120);
    if (!id || !name) continue;
    const sourceLinks = Array.isArray(raw.source_links) ? raw.source_links.map(v => clean(v, 500)).filter(Boolean) : [];
    const actionUrl = sourceLinks.find(url => /^https:\/\//u.test(url)) || PROJECTY_HOME;
    items.push({
      syncKey: 'projecty:project:' + stableId(id),
      title: 'ProjectY｜' + name,
      area: 'ProjectY',
      priority: projectPriority(priorityNumber),
      status: '実行中',
      kind: 'Project',
      owner: '開発',
      nextAction: clean(raw.next_action, 900) || null,
      blocker: clean(raw.blocker, 900) || null,
      sourceRef: `Mission Control:data/mission-control.json@${sha.slice(0, 12)}${updated ? ':' + updated : ''}`,
      actionUrl,
      dueAt: null
    });
  }

  const recent = Array.isArray(data.recently_completed) ? data.recently_completed.slice(0, 5) : [];
  for (const raw of recent) {
    const id = clean(raw.id, 160);
    const title = clean(raw.title, 170);
    if (!id || !title) continue;
    items.push({
      syncKey: 'projecty:recent:' + stableId(id),
      title: '完了｜' + title,
      area: 'ProjectY',
      priority: 'P3',
      status: '完了',
      kind: 'Task',
      owner: '開発',
      nextAction: clean(raw.result, 900) || null,
      blocker: null,
      sourceRef: `Mission Control:data/mission-control.json@${sha.slice(0, 12)}`,
      actionUrl: httpUrl(raw.source_url) || PROJECTY_HOME,
      dueAt: validDateTime(raw.completed_at)
    });
  }

  return items.slice(0, 30);
}

async function loadMissionControl(fetchImpl: FetchLike): Promise<{sha: string; data: MissionControl}> {
  const branchResponse = await fetchImpl(`https://api.github.com/repos/${PROJECTY_REPO}/branches/main`, {
    method: 'GET',
    headers: {Accept: 'application/vnd.github+json'}
  });
  if (!branchResponse.ok) throw new Error('GitHub branch lookup failed');
  const branch = await branchResponse.json();
  const sha = isRecord(branch) && isRecord(branch.commit) && typeof branch.commit.sha === 'string'
    ? branch.commit.sha
    : '';
  if (!/^[a-f0-9]{40}$/iu.test(sha)) throw new Error('GitHub returned invalid main SHA');

  const rawResponse = await fetchImpl(
    `https://raw.githubusercontent.com/${PROJECTY_REPO}/${sha}/data/mission-control.json`,
    {method: 'GET', headers: {Accept: 'application/json'}}
  );
  if (!rawResponse.ok) throw new Error('Mission Control download failed');
  const data = await rawResponse.json();
  if (!isRecord(data)) throw new Error('Mission Control payload is invalid');
  return {sha, data: data as MissionControl};
}

function parseInput(value: unknown): {ok: true; value: BaseHomeRefreshInput} | {ok: false; error: string} {
  if (!isRecord(value)) return {ok: false, error: 'Request body must be an object'};
  if (value.schema !== SCHEMA) return {ok: false, error: 'Unsupported schema'};

  const eventId = identifier(value.eventId, 8, 140);
  const syncedAt = validDateTime(value.syncedAt);
  if (!eventId) return {ok: false, error: 'eventId is invalid'};
  if (!syncedAt) return {ok: false, error: 'syncedAt is invalid'};

  const calendar = parseCalendar(value.calendar);
  if (calendar === undefined && value.calendar !== undefined) return {ok: false, error: 'calendar is invalid'};
  const reminders = parseReminders(value.reminders);
  if (reminders === undefined && value.reminders !== undefined) return {ok: false, error: 'reminders is invalid'};
  const money = parseMoney(value.money);
  if (money === undefined && value.money !== undefined) return {ok: false, error: 'money is invalid'};
  const refreshProjectY = value.refreshProjectY === true;

  if (calendar === undefined && reminders === undefined && !money && !refreshProjectY) {
    return {ok: false, error: 'At least one refresh source is required'};
  }

  return {
    ok: true,
    value: {
      schema: SCHEMA,
      eventId,
      syncedAt,
      ...(calendar !== undefined ? {calendar} : {}),
      ...(reminders !== undefined ? {reminders} : {}),
      ...(money ? {money} : {}),
      ...(refreshProjectY ? {refreshProjectY: true} : {})
    }
  };
}

function parseCalendar(value: unknown): BaseHomeCalendarItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_LOCAL_ITEMS) return undefined;
  const out: BaseHomeCalendarItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return undefined;
    const id = clean(raw.id, 240);
    const title = clean(raw.title, 180);
    const start = validDateTime(raw.start);
    const end = raw.end == null ? null : validDateTime(raw.end);
    const location = raw.location == null ? null : clean(raw.location, 240);
    if (!id || !title || !start || (raw.end != null && !end)) return undefined;
    out.push({id, title, start, end, location, allDay: raw.allDay === true});
  }
  return out;
}

function parseReminders(value: unknown): BaseHomeReminderItem[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_LOCAL_ITEMS) return undefined;
  const out: BaseHomeReminderItem[] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return undefined;
    const id = clean(raw.id, 240);
    const title = clean(raw.title, 180);
    const dueAt = raw.dueAt == null ? null : validDateTime(raw.dueAt);
    const priority = raw.priority == null ? null : number(raw.priority);
    if (!id || !title || (raw.dueAt != null && !dueAt) || (priority !== null && (!Number.isInteger(priority) || priority < 0 || priority > 9))) {
      return undefined;
    }
    out.push({id, title, dueAt, priority, overdue: raw.overdue === true});
  }
  return out;
}

function parseMoney(value: unknown): BaseHomeMoneySnapshot | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const updatedAt = validDateTime(value.updatedAt);
  if (!updatedAt) return undefined;
  const usableAmount = nullableMoney(value.usableAmount);
  if (usableAmount === undefined) return undefined;
  const nextPayment = parseMoneyEvent(value.nextPayment);
  const nextIncome = parseMoneyEvent(value.nextIncome);
  if (nextPayment === undefined || nextIncome === undefined) return undefined;
  let shortfall: BaseHomeMoneySnapshot['shortfall'] = null;
  if (value.shortfall != null) {
    if (!isRecord(value.shortfall)) return undefined;
    const amount = nullableMoney(value.shortfall.amount);
    if (amount === undefined || amount === null || amount < 0) return undefined;
    const date = value.shortfall.date == null ? null : dateOnly(value.shortfall.date);
    if (value.shortfall.date != null && !date) return undefined;
    shortfall = {amount, date};
  }
  const actionUrl = value.actionUrl == null ? null : safeActionUrl(value.actionUrl);
  if (value.actionUrl != null && !actionUrl) return undefined;
  return {updatedAt, usableAmount, nextPayment, nextIncome, shortfall, actionUrl};
}

function parseMoneyEvent(value: unknown): BaseHomeMoneySnapshot['nextPayment'] | undefined {
  if (value == null) return null;
  if (!isRecord(value)) return undefined;
  const label = clean(value.label, 100);
  const date = dateOnly(value.date);
  const amount = nullableMoney(value.amount);
  if (!label || !date || amount === undefined) return undefined;
  return {label, date, amount};
}

async function resolveDataSourceId(options: {
  configured: string | null;
  notionToken: string;
  redis: RedisCommandClient;
  fetchImpl: FetchLike;
}): Promise<string> {
  if (options.configured) return normalizeId(options.configured);
  const cached = await options.redis.command<string | null>(['GET', DATA_SOURCE_CACHE_KEY]);
  if (cached) return normalizeId(cached);

  const payload = await notionRequest(
    options.fetchImpl,
    options.notionToken,
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
  const matches = results.filter(raw => isRecord(raw) && raw.object === 'data_source' && notionTitle(raw.title) === DATA_SOURCE_TITLE);
  if (matches.length !== 1) throw new Error('YOS Tasks data source could not be resolved');
  const id = normalizeId(String((matches[0] as Record<string, unknown>).id ?? ''));
  await options.redis.command<string>(['SET', DATA_SOURCE_CACHE_KEY, id, 'EX', DATA_SOURCE_CACHE_TTL_SECONDS]);
  return id;
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

function richTextValue(value: unknown): string {
  if (!isRecord(value) || !Array.isArray(value.rich_text)) return '';
  return value.rich_text.map(part => {
    if (!isRecord(part)) return '';
    if (typeof part.plain_text === 'string') return part.plain_text;
    if (isRecord(part.text) && typeof part.text.content === 'string') return part.text.content;
    return '';
  }).join('').trim();
}

function notionTitle(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map(part => {
    if (!isRecord(part)) return '';
    if (typeof part.plain_text === 'string') return part.plain_text;
    if (isRecord(part.text) && typeof part.text.content === 'string') return part.text.content;
    return '';
  }).join('').trim();
}

function stableId(value: string): string {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    a ^= code;
    a = Math.imul(a, 0x01000193) >>> 0;
    b ^= code + i;
    b = Math.imul(b, 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

function reminderPriority(value: number | null | undefined): string {
  if (value === 1) return 'P0';
  if (value !== null && value !== undefined && value >= 2 && value <= 4) return 'P1';
  if (value !== null && value !== undefined && value >= 5 && value <= 9) return 'P2';
  return 'P2';
}

function projectPriority(value: number): string {
  if (value <= 1) return 'P0';
  if (value === 2) return 'P1';
  if (value === 3) return 'P2';
  return 'P3';
}

function formatTokyoTime(value: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(new Date(value));
  } catch {
    return '';
  }
}

function yen(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '未確定'
    : Math.round(value).toLocaleString('ja-JP') + '円';
}

function dateOnly(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}$/u);
  return match && Number.isFinite(Date.parse(value + 'T00:00:00+09:00')) ? value : null;
}

function validDateTime(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 80 && Number.isFinite(Date.parse(value)) ? value : null;
}

function identifier(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string' || value.length < min || value.length > max) return null;
  return /^[A-Za-z0-9._:/-]+$/u.test(value) ? value : null;
}

function nullableMoney(value: unknown): number | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 999_999_999_999) return undefined;
  return value;
}

function safeActionUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:', 'shortcuts:', 'scriptable:', 'calshow:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

function httpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2_000) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/gu, ' ').trim().slice(0, max);
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeId(value: string): string {
  const normalized = value.trim();
  if (!/^[a-f0-9-]{32,36}$/iu.test(normalized) || normalized.replaceAll('-', '').length !== 32) {
    throw new Error('Invalid Notion data source ID');
  }
  return normalized;
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(label + ' is required');
  return normalized;
}

function bearerToken(request: Request): string {
  const header = request.headers.get('authorization') ?? '';
  const match = header.match(/^Bearer\s+(.+)$/iu);
  return match ? match[1]!.trim() : '';
}

function safeEqual(left: string, right: string): boolean {
  if (!left || !right || left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra
    }
  });
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
