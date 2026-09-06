import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';

const DEFAULT_MAX_BODY_BYTES = 16_384;
const MAX_RAW_TEXT_CHARACTERS = 6_000;
const PROCESSING_TTL_SECONDS = 120;
const DONE_TTL_SECONDS = 30 * 24 * 60 * 60;
const NOTION_VERSION = '2022-06-28';

export interface ClarityIntakeHandlerOptions {
  tokenSha256: string;
  notionToken: string;
  notionPageId: string;
  redis: RedisCommandClient;
  fetchImpl?: FetchLike;
  maxBodyBytes?: number;
}

interface ClarityIntakeInput {
  rawText: string;
  capturedAt: string;
  inputMode: 'text' | 'voice';
  source: 'clarity';
  captureId: string;
}

export function createClarityIntakeHandler(options: ClarityIntakeHandlerOptions): (request: Request) => Promise<Response> {
  const tokenSha256 = normalizeHash(options.tokenSha256);
  const notionToken = requiredSecret(options.notionToken, 'Notion token');
  const notionPageId = normalizePageId(options.notionPageId);
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes < 1 || maxBodyBytes > 1_000_000) {
    throw new Error('Invalid intake max body size');
  }

  return async (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return json({error: 'Method not allowed'}, 405, {'Allow': 'POST'});
    }

    const token = bearerToken(request.headers.get('authorization'));
    if (!token || !(await matchesSha256(token, tokenSha256))) {
      return json({error: 'Unauthorized'}, 401);
    }

    const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
    if (contentType !== 'application/json') {
      return json({error: 'Content-Type must be application/json'}, 415);
    }

    const declaredLength = request.headers.get('content-length');
    if (declaredLength) {
      const parsedLength = Number(declaredLength);
      if (!Number.isFinite(parsedLength) || parsedLength < 0 || parsedLength > maxBodyBytes) {
        return json({error: 'Request body is too large'}, 413);
      }
    }

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
    const input = parsed.value;

    const dedupeKey = `yos:intake:clarity:v1:${input.captureId}`;
    let claimed: string | null;
    try {
      claimed = await options.redis.command<string | null>([
        'SET',
        dedupeKey,
        'processing',
        'NX',
        'EX',
        PROCESSING_TTL_SECONDS
      ]);
    } catch {
      return json({error: 'Intake is temporarily unavailable'}, 503);
    }

    if (claimed !== 'OK') {
      try {
        const state = await options.redis.command<string | null>(['GET', dedupeKey]);
        if (state === 'done') {
          return json({ok: true, captureId: input.captureId, duplicate: true}, 200);
        }
      } catch {
        return json({error: 'Intake is temporarily unavailable'}, 503);
      }
      return json({error: 'Capture is already being processed'}, 409);
    }

    try {
      await appendToNotion({fetchImpl, notionToken, notionPageId, input});
      await options.redis.command<string>(['SET', dedupeKey, 'done', 'EX', DONE_TTL_SECONDS]);
      return json({ok: true, captureId: input.captureId, duplicate: false}, 201);
    } catch {
      try {
        await options.redis.command<number>(['DEL', dedupeKey]);
      } catch {
        // The local Clarity raw record remains the fail-safe even if cleanup fails.
      }
      return json({error: 'YOS Inbox is temporarily unavailable'}, 503);
    }
  };
}

function parseInput(value: unknown): {ok: true; value: ClarityIntakeInput} | {ok: false; error: string} {
  if (!isRecord(value)) return {ok: false, error: 'Request body must be an object'};

  const rawText = value.rawText;
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    return {ok: false, error: 'rawText is required'};
  }
  if (rawText.length > MAX_RAW_TEXT_CHARACTERS) {
    return {ok: false, error: 'rawText is too long'};
  }

  const capturedAt = value.capturedAt;
  if (typeof capturedAt !== 'string' || capturedAt.length > 80 || !Number.isFinite(Date.parse(capturedAt))) {
    return {ok: false, error: 'capturedAt must be a valid date-time'};
  }

  const inputMode = value.inputMode;
  if (inputMode !== 'text' && inputMode !== 'voice') {
    return {ok: false, error: 'inputMode must be text or voice'};
  }

  if (value.source !== 'clarity') {
    return {ok: false, error: 'source must be clarity'};
  }

  const captureId = value.captureId;
  if (typeof captureId !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/u.test(captureId)) {
    return {ok: false, error: 'captureId is required and must be a stable identifier'};
  }

  return {
    ok: true,
    value: {rawText, capturedAt, inputMode, source: 'clarity', captureId}
  };
}

async function appendToNotion(options: {
  fetchImpl: FetchLike;
  notionToken: string;
  notionPageId: string;
  input: ClarityIntakeInput;
}): Promise<void> {
  const metadata = `${options.input.capturedAt} · clarity/${options.input.inputMode} · ${options.input.captureId}`;
  const response = await options.fetchImpl(`https://api.notion.com/v1/blocks/${options.notionPageId}/children`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${options.notionToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': NOTION_VERSION
    },
    body: JSON.stringify({
      children: [
        paragraph(metadata),
        paragraph(options.input.rawText),
        {object: 'block', type: 'divider', divider: {}}
      ]
    })
  });
  if (!response.ok) throw new Error('Notion append failed');
}

function paragraph(text: string): Record<string, unknown> {
  return {
    object: 'block',
    type: 'paragraph',
    paragraph: {
      rich_text: splitText(text).map((content) => ({type: 'text', text: {content}}))
    }
  };
}

function splitText(text: string): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length; offset += 1_900) chunks.push(text.slice(offset, offset + 1_900));
  return chunks.length > 0 ? chunks : [''];
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
  if (!/^[a-f0-9]{64}$/u.test(normalized)) throw new Error('Invalid intake token hash');
  return normalized;
}

function normalizePageId(value: string): string {
  const normalized = value.trim();
  if (!/^[a-f0-9-]{32,36}$/iu.test(normalized) || normalized.replaceAll('-', '').length !== 32) {
    throw new Error('Invalid Notion page ID');
  }
  return normalized;
}

function requiredSecret(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
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
