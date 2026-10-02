import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';
import {completeNotionMirrorKeys, mirrorNotionInput, type NotionMirrorInput, type NotionMirrorItem} from './mirror-handler.js';

const MAX_ITEMS = 50;
const SCOPE_TTL_SECONDS = 45 * 24 * 60 * 60;
const PROCESSING_TTL_SECONDS = 120;
const DONE_TTL_SECONDS = 30 * 24 * 60 * 60;
const ALLOWED_SCOPES = new Set(['calendar:next7', 'reminder:next7']);

type CalendarSnapshotItem = {
  title: string;
  start: string;
  end: string;
};

type ReminderSnapshotItem = {
  title: string;
  due: string;
};

type SnapshotInput = {
  eventId: string;
  syncedAt: string;
  scope: 'calendar:next7' | 'reminder:next7';
  fullSnapshot: boolean;
  items: Array<CalendarSnapshotItem | ReminderSnapshotItem>;
};

export function createIosSnapshotHandler(options: {
  tokenSha256: string;
  notionToken: string;
  notionDataSourceId?: string | null;
  redis: RedisCommandClient;
  fetchImpl?: FetchLike;
}): (request: Request) => Promise<Response> {
  const tokenSha256 = normalizeHash(options.tokenSha256);
  const notionToken = required(options.notionToken, 'Notion token');
  const fetchImpl = options.fetchImpl ?? fetch;

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405, {'Allow': 'POST'});
    const token = bearerToken(request.headers.get('authorization'));
    if (!token || !(await matchesSha256(token, tokenSha256))) return json({error: 'Unauthorized'}, 401);
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return json({error: 'Content-Type must be application/json'}, 415);
    }

    let raw = '';
    try { raw = await request.text(); }
    catch { return json({error: 'Invalid request body'}, 400); }
    if (new TextEncoder().encode(raw).byteLength > 64_000) return json({error: 'Request body is too large'}, 413);

    let body: unknown;
    try { body = JSON.parse(raw) as unknown; }
    catch { return json({error: 'Invalid JSON'}, 400); }
    const parsed = parseSnapshot(body);
    if (!parsed.ok) return json({error: parsed.error}, 400);

    const eventKey = `yos:notion:ios-snapshot:v1:event:${parsed.value.eventId}`;
    const claimed = await options.redis.command<string | null>([
      'SET', eventKey, 'processing', 'NX', 'EX', PROCESSING_TTL_SECONDS
    ]);
    if (claimed !== 'OK') {
      const existing = await options.redis.command<string | null>(['GET', eventKey]);
      if (existing === 'done') return json({ok: true, duplicate: true, updated: 0, retired: 0}, 200);
      return json({error: 'Snapshot is already being processed'}, 409);
    }

    try {
      const current = await mapItems(parsed.value);
      let updated = 0;
      if (current.length) {
        const mirrorInput: NotionMirrorInput = {
          eventId: `ios:${parsed.value.eventId}`,
          syncedAt: parsed.value.syncedAt,
          source: parsed.value.scope,
          items: current
        };
        const result = await mirrorNotionInput({
          input: mirrorInput,
          notionToken,
          notionDataSourceId: options.notionDataSourceId,
          redis: options.redis,
          fetchImpl
        });
        updated = result.updated;
      }

      const scopeKey = `yos:notion:ios-snapshot:v1:scope:${parsed.value.scope}`;
      const previousRaw = await options.redis.command<string | null>(['GET', scopeKey]);
      const previous = parseStoredKeys(previousRaw);
      const currentKeys = current.map((item) => item.syncKey);
      let retired = 0;

      if (parsed.value.fullSnapshot) {
        const currentSet = new Set(currentKeys);
        const stale = previous.filter((key) => !currentSet.has(key));
        retired = await completeNotionMirrorKeys({
          syncKeys: stale,
          syncedAt: parsed.value.syncedAt,
          notionToken,
          notionDataSourceId: options.notionDataSourceId,
          redis: options.redis,
          fetchImpl
        });
        await options.redis.command<string>([
          'SET', scopeKey, JSON.stringify(currentKeys), 'EX', SCOPE_TTL_SECONDS
        ]);
      } else {
        const merged = [...new Set([...previous, ...currentKeys])];
        await options.redis.command<string>([
          'SET', scopeKey, JSON.stringify(merged), 'EX', SCOPE_TTL_SECONDS
        ]);
      }

      await options.redis.command<string>(['SET', eventKey, 'done', 'EX', DONE_TTL_SECONDS]);
      return json({ok: true, duplicate: false, updated, retired}, 201);
    } catch {
      try { await options.redis.command<number>(['DEL', eventKey]); } catch {}
      return json({error: 'iOS snapshot mirror is temporarily unavailable'}, 503);
    }
  };
}

async function mapItems(input: SnapshotInput): Promise<NotionMirrorItem[]> {
  const output: NotionMirrorItem[] = [];
  for (const item of input.items) {
    if (input.scope === 'calendar:next7') {
      const calendar = item as CalendarSnapshotItem;
      const digest = await sha256Hex(`calendar\0${calendar.title}\0${calendar.start}\0${calendar.end}`);
      output.push({
        syncKey: `calendar:${digest}`,
        title: calendar.title,
        area: 'Life',
        priority: 'P2',
        status: '待ち',
        kind: 'Task',
        owner: 'YOS',
        nextAction: `予定：${displayTime(calendar.start)} ${calendar.title}`,
        blocker: null,
        sourceRef: `Apple Calendar:${calendar.start}`,
        actionUrl: 'shortcuts://run-shortcut?name=YOS_OpenApp&input=text&text=calendar',
        dueAt: calendar.start
      });
    } else {
      const reminder = item as ReminderSnapshotItem;
      const digest = await sha256Hex(`reminder\0${reminder.title}\0${reminder.due}`);
      output.push({
        syncKey: `reminder:${digest}`,
        title: reminder.title,
        area: 'Life',
        priority: 'P1',
        status: '本人操作',
        kind: 'Task',
        owner: '陽介',
        nextAction: `リマインダー：${displayTime(reminder.due)} ${reminder.title}`,
        blocker: null,
        sourceRef: `Apple Reminders:${reminder.due}`,
        actionUrl: 'shortcuts://run-shortcut?name=YOS_OpenApp&input=text&text=reminders',
        dueAt: reminder.due
      });
    }
  }
  return output;
}

function parseSnapshot(value: unknown): {ok: true; value: SnapshotInput} | {ok: false; error: string} {
  if (!isRecord(value)) return {ok: false, error: 'Request body must be an object'};
  const eventId = identifier(value.eventId, 8, 160);
  if (!eventId) return {ok: false, error: 'eventId is invalid'};
  const syncedAt = dateTime(value.syncedAt);
  if (!syncedAt) return {ok: false, error: 'syncedAt is invalid'};
  const scope = typeof value.scope === 'string' && ALLOWED_SCOPES.has(value.scope)
    ? value.scope as SnapshotInput['scope']
    : null;
  if (!scope) return {ok: false, error: 'scope is invalid'};
  if (typeof value.fullSnapshot !== 'boolean') return {ok: false, error: 'fullSnapshot must be boolean'};
  if (!Array.isArray(value.items) || value.items.length > MAX_ITEMS) return {ok: false, error: 'items must contain 0..50 entries'};

  const items: Array<CalendarSnapshotItem | ReminderSnapshotItem> = [];
  for (const [index, item] of value.items.entries()) {
    if (!isRecord(item)) return {ok: false, error: `items[${index}] must be an object`};
    const title = text(item.title, 1, 200);
    if (!title) return {ok: false, error: `items[${index}].title is invalid`};
    if (scope === 'calendar:next7') {
      const start = dateTime(item.start);
      const end = dateTime(item.end);
      if (!start || !end || Date.parse(end) < Date.parse(start)) {
        return {ok: false, error: `items[${index}] calendar dates are invalid`};
      }
      items.push({title, start, end});
    } else {
      const due = dateTime(item.due);
      if (!due) return {ok: false, error: `items[${index}].due is invalid`};
      items.push({title, due});
    }
  }

  return {ok: true, value: {eventId, syncedAt, scope, fullSnapshot: value.fullSnapshot, items}};
}

function parseStoredKeys(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && /^[A-Za-z0-9._:/-]{4,200}$/u.test(entry));
  } catch {
    return [];
  }
}

function displayTime(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(parsed);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function identifier(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string' || value.length < min || value.length > max) return null;
  return /^[A-Za-z0-9._:/-]+$/u.test(value) ? value : null;
}

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length >= min && normalized.length <= max ? normalized : null;
}

function dateTime(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 80 && Number.isFinite(Date.parse(value)) ? value : null;
}

function bearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer ([^\s]{16,512})$/u.exec(header);
  return match?.[1] ?? null;
}

async function matchesSha256(value: string, expectedHex: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const actual = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  if (actual.length !== expectedHex.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expectedHex.charCodeAt(index);
  }
  return difference === 0;
}

function normalizeHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) throw new Error('Invalid snapshot token hash');
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

function json(body: Record<string, unknown>, status: number, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}
