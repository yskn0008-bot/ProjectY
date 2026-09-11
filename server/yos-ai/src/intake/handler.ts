import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';
import {CaptureInProgressError, createRawFirstProcessor} from './raw-first-processor.js';

const DEFAULT_MAX_BODY_BYTES = 16_384;
const MAX_RAW_TEXT_CHARACTERS = 6_000;

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
  const fetchImpl = options.fetchImpl ?? fetch;
  const processor = createRawFirstProcessor({
    notionToken: options.notionToken,
    notionPageId: options.notionPageId,
    redis: options.redis,
    fetchImpl
  });
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

    try {
      const result = await processor.process(input);
      return json({ok: true, captureId: input.captureId, duplicate: result.duplicate}, result.duplicate ? 200 : 201);
    } catch (error) {
      if (error instanceof CaptureInProgressError) {
        return json({error: 'Capture is already being processed'}, 409);
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
