import type {FetchLike} from '../http.js';
import type {RawFirstProcessor} from '../intake/raw-first-processor.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';

const YOS_INBOX_CHANNEL_ID = 'C0C0RU43TPA';
const MAX_BODY_BYTES = 32_768;
const MAX_TIMESTAMP_AGE_SECONDS = 5 * 60;
const EVENT_CLAIM_TTL_SECONDS = 120;
const EVENT_DONE_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SlackEventsHandlerOptions {
  signingSecret: string;
  botToken: string;
  redis: RedisCommandClient;
  processor: RawFirstProcessor;
  waitUntil: (promise: Promise<unknown>) => void;
  fetchImpl?: FetchLike;
  now?: () => number;
}

export function createSlackEventsHandler(options: SlackEventsHandlerOptions): (request: Request) => Promise<Response> {
  const signingSecret = required(options.signingSecret, 'Slack signing secret');
  const botToken = required(options.botToken, 'Slack bot token');
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;

  return async (request) => {
    if (request.method !== 'POST') return json({error: 'Method not allowed'}, 405, {'Allow': 'POST'});

    const timestamp = request.headers.get('x-slack-request-timestamp');
    const signature = request.headers.get('x-slack-signature');
    if (!timestamp || !/^\d{10}$/u.test(timestamp) || Math.abs(now() / 1_000 - Number(timestamp)) > MAX_TIMESTAMP_AGE_SECONDS) {
      return json({error: 'Invalid or stale Slack timestamp'}, 401);
    }

    const declaredLength = Number(request.headers.get('content-length') ?? '0');
    if (!Number.isFinite(declaredLength) || declaredLength < 0 || declaredLength > MAX_BODY_BYTES) {
      return json({error: 'Request body is too large'}, 413);
    }
    let rawBody: string;
    try {
      rawBody = await request.text();
    } catch {
      return json({error: 'Invalid request body'}, 400);
    }
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json({error: 'Request body is too large'}, 413);
    }
    if (!signature || !(await validSignature(signingSecret, timestamp, rawBody, signature))) {
      return json({error: 'Invalid Slack signature'}, 401);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      return json({error: 'Invalid JSON'}, 400);
    }
    if (!isRecord(body)) return json({error: 'Invalid Slack payload'}, 400);
    if (body.type === 'url_verification') {
      return typeof body.challenge === 'string' ? json({challenge: body.challenge}, 200) : json({error: 'Invalid challenge'}, 400);
    }
    if (body.type !== 'event_callback' || typeof body.event_id !== 'string' || !isRecord(body.event)) {
      return json({ok: true, ignored: true}, 200);
    }

    const event = body.event;
    if (
      event.type !== 'message' || event.channel !== YOS_INBOX_CHANNEL_ID || typeof event.ts !== 'string' ||
      typeof event.text !== 'string' || event.text.length === 0 || event.bot_id !== undefined ||
      event.bot_profile !== undefined || event.subtype !== undefined
    ) {
      return json({ok: true, ignored: true}, 200);
    }

    const teamId = typeof body.team_id === 'string' ? body.team_id : 'unknown-team';
    const job = processEvent({
      eventId: body.event_id,
      teamId,
      messageTs: event.ts,
      rawText: event.text,
      botToken,
      redis: options.redis,
      processor: options.processor,
      fetchImpl
    });
    options.waitUntil(job);
    return json({ok: true}, 200);
  };
}

async function processEvent(options: {
  eventId: string;
  teamId: string;
  messageTs: string;
  rawText: string;
  botToken: string;
  redis: RedisCommandClient;
  processor: RawFirstProcessor;
  fetchImpl: FetchLike;
}): Promise<void> {
  const eventKey = `yos:slack:event:v1:${options.eventId}`;
  const claimed = await options.redis.command<string | null>([
    'SET', eventKey, 'processing', 'NX', 'EX', EVENT_CLAIM_TTL_SECONDS
  ]);
  if (claimed !== 'OK') return;

  try {
    const captureId = await stableCaptureId(options.teamId, YOS_INBOX_CHANNEL_ID, options.messageTs);
    const result = await options.processor.process({
      rawText: options.rawText,
      capturedAt: new Date(Number.parseFloat(options.messageTs) * 1_000).toISOString(),
      inputMode: 'text',
      source: 'clarity',
      captureId
    });
    if (!result.duplicate) await postProcessedMarker(options.fetchImpl, options.botToken, options.messageTs);
    await options.redis.command<string>(['SET', eventKey, 'done', 'EX', EVENT_DONE_TTL_SECONDS]);
  } catch (error) {
    try {
      await options.redis.command<number>(['DEL', eventKey]);
    } catch {
      // A short processing TTL still makes the event retryable when claim release fails.
    }
    throw error;
  }
}

async function stableCaptureId(teamId: string, channelId: string, messageTs: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${teamId}:${channelId}:${messageTs}`));
  return `slack-${hex(new Uint8Array(bytes))}`;
}

async function postProcessedMarker(fetchImpl: FetchLike, botToken: string, threadTs: string): Promise<void> {
  const response = await fetchImpl('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json; charset=utf-8'},
    body: JSON.stringify({channel: YOS_INBOX_CHANNEL_ID, thread_ts: threadTs, text: 'YOS processed'})
  });
  if (!response.ok) throw new Error('Slack processed marker failed');
  const result = await response.json() as {ok?: boolean};
  if (result.ok !== true) throw new Error('Slack processed marker failed');
}

async function validSignature(secret: string, timestamp: string, body: string, supplied: string): Promise<boolean> {
  if (!/^v0=[a-f0-9]{64}$/u.test(supplied)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`v0:${timestamp}:${body}`)));
  return constantTimeEqual(`v0=${hex(digest)}`, supplied);
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function required(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required`);
  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function json(body: Record<string, unknown>, status: number, headers: Record<string, string> = {}): Response {
  return Response.json(body, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers}});
}
