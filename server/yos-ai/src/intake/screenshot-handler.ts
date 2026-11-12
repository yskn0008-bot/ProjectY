import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';
import {CaptureInProgressError} from './raw-first-processor.js';
import {parseScreenshotCapture} from './screenshot-capture.js';

const VERSION = '2025-09-03';
const PROCESSING_TTL = 120;
const DONE_TTL = 30 * 86400;
const RELEASE_OWNED = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
const ADVANCE_OWNED = "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3]); return 1 else return 0 end";

export function createScreenshotIntakeHandler(options: {
  tokenSha256: string;
  notionToken: string;
  notionPageId: string;
  redis: RedisCommandClient;
  fetchImpl?: FetchLike;
}): (request: Request) => Promise<Response> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const hash = options.tokenSha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(hash)) throw new Error('Invalid token hash');
  if (!/^[a-f0-9-]{32,36}$/iu.test(options.notionPageId) ||
      options.notionPageId.replaceAll('-', '').length !== 32) throw new Error('Invalid Notion page');
  if (!options.notionToken.trim()) throw new Error('Missing Notion token');

  return async (request) => {
    if (request.method !== 'POST') return response(405, 'Method not allowed');
    const match = /^Bearer ([^\s]{16,512})$/u.exec(request.headers.get('authorization') ?? '');
    if (!match || !(await matchesHash(match[1]!, hash))) return response(401, 'Unauthorized');
    if (request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      return response(415, 'JSON required');
    }
    const maxBodyBytes = 6_800_000;
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (!Number.isFinite(declared) || declared > maxBodyBytes) return response(413, 'Too large');
    let body: unknown;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).length > maxBodyBytes) return response(413, 'Too large');
      body = JSON.parse(raw) as unknown;
    } catch {
      return response(400, 'Invalid JSON');
    }
    const parsed = parseScreenshotCapture(body);
    if (!parsed.ok) return response(400, parsed.error);
    const input = parsed.value;
    const key = 'yos:intake:screenshot:v1:' + input.captureId;
    const owner = 'processing:' + crypto.randomUUID();
    const uncertain = 'uncertain:' + owner;
    try {
      const claimed = await options.redis.command<string | null>(['SET', key, owner, 'NX', 'EX', PROCESSING_TTL]);
      if (claimed !== 'OK') {
        if (await options.redis.command<string | null>(['GET', key]) === 'done') {
          return Response.json({ok: true, captureId: input.captureId, duplicate: true, inboxSaved: true, classification: 'pending'}, {status: 200, headers: {'Cache-Control': 'no-store'}});
        }
        throw new CaptureInProgressError();
      }
      let appendAttempted = false;
      try {
        const filename = 'screenshot-' + input.captureId.replaceAll(':', '-') +
          (input.mimeType === 'image/png' ? '.png' : input.mimeType === 'image/jpeg' ? '.jpg' : '.heic');
        const headers = {Authorization: 'Bearer ' + options.notionToken, 'Notion-Version': VERSION};
        const created = await fetchImpl('https://api.notion.com/v1/file_uploads', {
          method: 'POST', headers: {...headers, 'Content-Type': 'application/json'},
          body: JSON.stringify({mode: 'single_part', filename})
        });
        if (!created.ok) throw new Error('Notion upload creation failed');
        const createdData = await created.json() as {id?: string};
        if (!createdData.id || !/^[a-f0-9-]{36}$/iu.test(createdData.id)) throw new Error('Invalid upload id');
        const bytes = decodeBase64(input.imageBase64);
        const form = new FormData();
        form.append('file', new Blob([bytes], {type: input.mimeType}), filename);
        const sent = await fetchImpl('https://api.notion.com/v1/file_uploads/' + createdData.id + '/send', {
          method: 'POST', headers, body: form
        });
        if (!sent.ok) throw new Error('Notion image upload failed');
        const sentData = await sent.json() as {status?: string};
        if (sentData.status !== 'uploaded') throw new Error('Notion upload not complete');
        const metadata = input.capturedAt + ' · ios-screenshot/' + input.saveLocation + ' · ' + input.captureId;
        // Persist the long-lived uncertain receipt BEFORE the irreversible append.
        // A worker whose upload lease expired must never append or alter another worker's receipt.
        const reserved = await options.redis.command<number>(['EVAL', ADVANCE_OWNED, 1, key, owner, uncertain, DONE_TTL]);
        if (reserved !== 1) return response(409, 'Screenshot ownership changed; check Inbox before retrying');
        // A network timeout during append has an ambiguous outcome: Notion may
        // already have stored the image. Do not automatically retry the append.
        appendAttempted = true;
        const appended = await fetchImpl('https://api.notion.com/v1/blocks/' + options.notionPageId + '/children', {
          method: 'PATCH', headers: {...headers, 'Content-Type': 'application/json'},
          body: JSON.stringify({children: [
            {object: 'block', type: 'paragraph', paragraph: {rich_text: [{type: 'text', text: {content: metadata}}]}},
            {object: 'block', type: 'image', image: {type: 'file_upload', file_upload: {id: createdData.id}}},
            {object: 'block', type: 'divider', divider: {}}
          ]})
        });
        if (!appended.ok) throw new Error('Notion append failed');
        // HTTP 200 alone is not proof that Notion created the intended blocks.
        const appendResult = await appended.json() as {results?: Array<{id?: string; type?: string}>};
        if (!Array.isArray(appendResult.results) || appendResult.results.length !== 3 ||
            appendResult.results[0]?.type !== 'paragraph' ||
            appendResult.results[1]?.type !== 'image' ||
            appendResult.results[2]?.type !== 'divider' ||
            appendResult.results.some((block) => typeof block.id !== 'string')) {
          throw new Error('Notion append acknowledgement incomplete');
        }
        const completed = await options.redis.command<number>(['EVAL', ADVANCE_OWNED, 1, key, uncertain, 'done', DONE_TTL]);
        if (completed !== 1) throw new Error('Screenshot receipt ownership changed');
        return Response.json({ok: true, captureId: input.captureId, duplicate: false, inboxSaved: true, classification: 'pending'}, {status: 201, headers: {'Cache-Control': 'no-store'}});
      } catch {
        // A failed Redis acknowledgement after a successful Notion append must not
        // immediately unlock the capture: doing so could duplicate private images.
        // After append begins, the durable uncertain receipt already exists. Never
        // overwrite it here; a successful newer owner must remain untouched.
        if (!appendAttempted) {
          try { await options.redis.command<number>(['EVAL', RELEASE_OWNED, 1, key, owner]); } catch { /* Processing TTL allows later retry. */ }
        }
        return response(appendAttempted ? 409 : 503,
          appendAttempted ? 'Screenshot save outcome uncertain; check Inbox before retrying' : 'Screenshot intake temporarily unavailable');
      }
    } catch (error) {
      return response(error instanceof CaptureInProgressError ? 409 : 503, 'Screenshot intake temporarily unavailable');
    }
  };
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out = new Uint8Array((value.length / 4) * 3 - (value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0));
  let bits = 0, accumulator = 0, index = 0;
  for (const char of value) {
    if (char === '=') break;
    accumulator = (accumulator << 6) | alphabet.indexOf(char);
    bits += 6;
    if (bits >= 8) { bits -= 8; out[index++] = (accumulator >>> bits) & 255; }
  }
  return out;
}

async function matchesHash(token: string, expected: string): Promise<boolean> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  const actual = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  let diff = 0;
  for (let i = 0; i < 64; i += 1) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
function response(status: number, error: string): Response {
  return Response.json({error}, {status, headers: {'Cache-Control': 'no-store'}});
}
