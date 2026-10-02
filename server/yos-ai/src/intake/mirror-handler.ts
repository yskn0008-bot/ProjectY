import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';

const DEFAULT_MAX_BODY_BYTES = 64_000;
const MAX_ITEMS = 50;
const PROCESSING_TTL_SECONDS = 120;
const DONE_TTL_SECONDS = 30 * 24 * 60 * 60;
const DATA_SOURCE_CACHE_TTL_SECONDS = 24 * 60 * 60;
const DATA_SOURCE_CACHE_KEY = 'yos:notion:mirror:v1:data-source';
const DATA_SOURCE_TITLE = 'YOS Tasks';
const NOTION_VERSION = '2026-03-11';

const AREAS = new Set(['Money', 'Work', 'ProjectY', 'Life', 'Home', 'Idea', 'Admin', 'Shopping']);
const PRIORITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const STATUSES = new Set(['次にやる', '実行中', '待ち', '本人操作', '保留', '完了']);
const KINDS = new Set(['Task', 'Project', 'Goal', 'Waiting']);
const OWNERS = new Set(['YOS', '陽介', '開発', '外部待ち']);

export interface NotionMirrorItem {
  syncKey: string;
  title: string;
  area: string;
  priority: string;
  status: string;
  kind: string;
  owner: string;
  nextAction: string | null;
  blocker: string | null;
  sourceRef: string;
  actionUrl: string | null;
  dueAt: string | null;
}

export interface NotionMirrorInput {
  eventId: string;
  syncedAt: string;
  source: string;
  items: NotionMirrorItem[];
}

export class MirrorInProgressError extends Error {}

export function createNotionMirrorHandler(options: {
  tokenSha256: string;
  notionToken: string;
  notionDataSourceId?: string | null;
  redis: RedisCommandClient;
  fetchImpl?: FetchLike;
  maxBodyBytes?: number;
}): (request: Request) => Promise<Response> {
  const tokenSha256 = normalizeHash(options.tokenSha256);
  const notionToken = required(options.notionToken, 'Notion token');
  const configuredDataSourceId = options.notionDataSourceId
    ? normalizeId(options.notionDataSourceId, 'Notion data source ID')
    : null;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;

  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 1_000_000) {
    throw new Error('Invalid mirror max body size');
  }

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405, {'Allow': 'POST'});

    const token = bearerToken(request.headers.get('authorization'));
    if (!token || !(await matchesSha256(token, tokenSha256))) return json({error: 'Unauthorized'}, 401);

    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') return json({error: 'Content-Type must be application/json'}, 415);

    let bodyText: string;
    try {
      bodyText = await request.text();
    } catch {
      return json({error: 'Invalid request body'}, 400);
    }
    if (new TextEncoder().encode(bodyText).byteLength > maxBodyBytes) {
      return json({error: 'Request body is too large'}, 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(bodyText) as unknown;
    } catch {
      return json({error: 'Invalid JSON'}, 400);
    }

    const parsed = parseInput(body);
    if (!parsed.ok) return json({error: parsed.error}, 400);

    try {
      const notionDataSourceId = configuredDataSourceId ?? await resolveNotionDataSourceId({
        notionToken,
        redis: options.redis,
        fetchImpl
      });
      const result = await processMirror({
        input: parsed.value,
        notionToken,
        notionDataSourceId,
        redis: options.redis,
        fetchImpl
      });
      return json({
        ok: true,
        eventId: parsed.value.eventId,
        duplicate: result.duplicate,
        updated: result.updated
      }, result.duplicate ? 200 : 201);
    } catch (error) {
      if (error instanceof MirrorInProgressError) return json({error: 'Mirror event is already being processed'}, 409);
      return json({error: 'Notion mirror is temporarily unavailable'}, 503);
    }
  };
}


async function resolveNotionDataSourceId(options: {
  notionToken: string;
  redis: RedisCommandClient;
  fetchImpl: FetchLike;
}): Promise<string> {
  const cached = await options.redis.command<string | null>(['GET', DATA_SOURCE_CACHE_KEY]);
  if (cached) return normalizeId(cached, 'cached Notion data source ID');

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
  const matches = results.filter((entry) => {
    if (!isRecord(entry) || entry.object !== 'data_source') return false;
    return notionTitle(entry.title) === DATA_SOURCE_TITLE;
  });

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one accessible Notion data source titled "${DATA_SOURCE_TITLE}", found ${matches.length}`);
  }

  const id = normalizeId(String((matches[0] as Record<string, unknown>).id ?? ''), 'discovered Notion data source ID');
  await options.redis.command<string>(['SET', DATA_SOURCE_CACHE_KEY, id, 'EX', DATA_SOURCE_CACHE_TTL_SECONDS]);
  return id;
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

async function processMirror(options: {
  input: NotionMirrorInput;
  notionToken: string;
  notionDataSourceId: string;
  redis: RedisCommandClient;
  fetchImpl: FetchLike;
}): Promise<{duplicate: boolean; updated: number}> {
  const eventKey = `yos:notion:mirror:v1:event:${options.input.eventId}`;
  const claimed = await options.redis.command<string | null>([
    'SET', eventKey, 'processing', 'NX', 'EX', PROCESSING_TTL_SECONDS
  ]);
  if (claimed !== 'OK') {
    if (await options.redis.command<string | null>(['GET', eventKey]) === 'done') {
      return {duplicate: true, updated: 0};
    }
    throw new MirrorInProgressError('Mirror event is already being processed');
  }

  try {
    for (const item of options.input.items) {
      await upsertItem({...options, item});
    }
    await options.redis.command<string>(['SET', eventKey, 'done', 'EX', DONE_TTL_SECONDS]);
    return {duplicate: false, updated: options.input.items.length};
  } catch (error) {
    try {
      await options.redis.command<number>(['DEL', eventKey]);
    } catch {
      // Source data remains authoritative; mirror can be retried with the same eventId.
    }
    throw error;
  }
}

async function upsertItem(options: {
  input: NotionMirrorInput;
  item: NotionMirrorItem;
  notionToken: string;
  notionDataSourceId: string;
  redis: RedisCommandClient;
  fetchImpl: FetchLike;
}): Promise<void> {
  const mapKey = `yos:notion:mirror:v1:item:${options.item.syncKey}`;
  let pageId = await options.redis.command<string | null>(['GET', mapKey]);

  if (!pageId) {
    pageId = await findPageIdBySyncKey(options);
  }

  const properties = notionProperties(options.item, options.input.syncedAt);
  if (pageId) {
    await notionRequest(options.fetchImpl, options.notionToken, `https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      body: JSON.stringify({properties})
    });
  } else {
    const payload = await notionRequest(options.fetchImpl, options.notionToken, 'https://api.notion.com/v1/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: {type: 'data_source_id', data_source_id: options.notionDataSourceId},
        properties
      })
    });
    pageId = typeof payload.id === 'string' ? payload.id : null;
    if (!pageId) throw new Error('Notion create page returned no page id');
  }

  await options.redis.command<string>(['SET', mapKey, pageId]);
}

async function findPageIdBySyncKey(options: {
  item: NotionMirrorItem;
  notionToken: string;
  notionDataSourceId: string;
  fetchImpl: FetchLike;
}): Promise<string | null> {
  const payload = await notionRequest(
    options.fetchImpl,
    options.notionToken,
    `https://api.notion.com/v1/data_sources/${options.notionDataSourceId}/query`,
    {
      method: 'POST',
      body: JSON.stringify({
        page_size: 2,
        filter: {
          property: '同期キー',
          rich_text: {equals: options.item.syncKey}
        }
      })
    }
  );
  const results = Array.isArray(payload.results) ? payload.results : [];
  if (results.length > 1) throw new Error('Duplicate Notion sync keys detected');
  const id = results[0] && typeof results[0] === 'object' && typeof results[0].id === 'string' ? results[0].id : null;
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

function notionProperties(item: NotionMirrorItem, syncedAt: string): Record<string, unknown> {
  return {
    'やること': title(item.title),
    '領域': select(item.area),
    '優先度': select(item.priority),
    '状態': select(item.status),
    '種類': select(item.kind),
    '担当': select(item.owner),
    '次の一手': richText(item.nextAction ?? ''),
    'ブロッカー': richText(item.blocker ?? ''),
    '正本・根拠': richText(item.sourceRef),
    '同期キー': richText(item.syncKey),
    '最終同期': {date: {start: syncedAt}},
    '操作URL': {url: item.actionUrl},
    '期限': {date: item.dueAt ? {start: item.dueAt} : null}
  };
}

function title(value: string): Record<string, unknown> {
  return {title: [{type: 'text', text: {content: value}}]};
}

function richText(value: string): Record<string, unknown> {
  return {rich_text: value ? [{type: 'text', text: {content: value}}] : []};
}

function select(value: string): Record<string, unknown> {
  return {select: {name: value}};
}

function parseInput(value: unknown): {ok: true; value: NotionMirrorInput} | {ok: false; error: string} {
  if (!isRecord(value)) return {ok: false, error: 'Request body must be an object'};

  const eventId = validIdentifier(value.eventId, 8, 160);
  if (!eventId) return {ok: false, error: 'eventId is required and must be stable'};

  const syncedAt = validDateTime(value.syncedAt);
  if (!syncedAt) return {ok: false, error: 'syncedAt must be a valid date-time'};

  const source = validText(value.source, 1, 80);
  if (!source) return {ok: false, error: 'source is required'};

  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > MAX_ITEMS) {
    return {ok: false, error: `items must contain 1..${MAX_ITEMS} entries`};
  }

  const items: NotionMirrorItem[] = [];
  for (const [index, rawItem] of value.items.entries()) {
    const parsed = parseItem(rawItem);
    if (!parsed.ok) return {ok: false, error: `items[${index}]: ${parsed.error}`};
    items.push(parsed.value);
  }

  return {ok: true, value: {eventId, syncedAt, source, items}};
}

function parseItem(value: unknown): {ok: true; value: NotionMirrorItem} | {ok: false; error: string} {
  if (!isRecord(value)) return {ok: false, error: 'must be an object'};
  const syncKey = validIdentifier(value.syncKey, 4, 200);
  const itemTitle = validText(value.title, 1, 200);
  const sourceRef = validText(value.sourceRef, 1, 1_000);
  const area = enumValue(value.area, AREAS);
  const priority = enumValue(value.priority, PRIORITIES);
  const status = enumValue(value.status, STATUSES);
  const kind = enumValue(value.kind, KINDS);
  const owner = enumValue(value.owner, OWNERS);
  if (!syncKey) return {ok: false, error: 'syncKey is invalid'};
  if (!itemTitle) return {ok: false, error: 'title is invalid'};
  if (!area) return {ok: false, error: 'area is invalid'};
  if (!priority) return {ok: false, error: 'priority is invalid'};
  if (!status) return {ok: false, error: 'status is invalid'};
  if (!kind) return {ok: false, error: 'kind is invalid'};
  if (!owner) return {ok: false, error: 'owner is invalid'};
  if (!sourceRef) return {ok: false, error: 'sourceRef is invalid'};

  const nextAction = nullableText(value.nextAction, 1_000);
  const blocker = nullableText(value.blocker, 1_000);
  const actionUrl = nullableUrl(value.actionUrl);
  const dueAt = nullableDateTime(value.dueAt);
  if (nextAction === undefined) return {ok: false, error: 'nextAction is invalid'};
  if (blocker === undefined) return {ok: false, error: 'blocker is invalid'};
  if (actionUrl === undefined) return {ok: false, error: 'actionUrl is invalid'};
  if (dueAt === undefined) return {ok: false, error: 'dueAt is invalid'};

  return {
    ok: true,
    value: {syncKey, title: itemTitle, area, priority, status, kind, owner, nextAction, blocker, sourceRef, actionUrl, dueAt}
  };
}

function validIdentifier(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string' || value.length < min || value.length > max) return null;
  return /^[A-Za-z0-9._:/-]+$/u.test(value) ? value : null;
}

function validText(value: unknown, min: number, max: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length >= min && normalized.length <= max ? normalized : null;
}

function validDateTime(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 80 && Number.isFinite(Date.parse(value)) ? value : null;
}

function nullableText(value: unknown, max: number): string | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || value.length > max) return undefined;
  return value.trim();
}

function nullableDateTime(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return validDateTime(value) ?? undefined;
}

function nullableUrl(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || value.length > 2_000) return undefined;
  try {
    const parsed = new URL(value);
    if (!['https:', 'http:', 'shortcuts:', 'calshow:'].includes(parsed.protocol)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function enumValue(value: unknown, allowed: Set<string>): string | null {
  return typeof value === 'string' && allowed.has(value) ? value : null;
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
  for (let index = 0; index < actual.length; index += 1) difference |= actual.charCodeAt(index) ^ expectedHex.charCodeAt(index);
  return difference === 0;
}

function normalizeHash(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(normalized)) throw new Error('Invalid mirror token hash');
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
