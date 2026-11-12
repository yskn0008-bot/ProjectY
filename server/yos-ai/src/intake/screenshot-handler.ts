import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';
import {CaptureInProgressError} from './raw-first-processor.js';
import {parseScreenshotCapture} from './screenshot-capture.js';

const VERSION = '2025-09-03';
const PROCESSING_TTL = 120;
const DONE_TTL = 30 * 86400;
const RELEASE_OWNED = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end";
const ADVANCE_OWNED = "if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('SET', KEYS[1], ARGV[2]); return 1 else return 0 end";

export function createScreenshotIntakeHandler(options: {
  tokenSha256: string;
  notionToken: string;
  notionPageId: string;
  redis: RedisCommandClient;
  fetchImpl?: FetchLike;
}): (request: Request) => Promise<Response> {
  const transport = options.fetchImpl ?? fetch;
  const fetchImpl: FetchLike = (url, init) => transport(url, {...init, signal: AbortSignal.timeout(15_000)});
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
    const bytes = decodeBase64(input.imageBase64);
    const imageSha256 = await sha256(bytes);
    const fingerprint = await sha256(new TextEncoder().encode(JSON.stringify([
      input.capturedAt, input.source, input.saveLocation, input.mimeType, imageSha256
    ])));
    const key = 'yos:intake:screenshot:v1:' + input.captureId;
    // Never expire the identity binding: a reused capture ID must not acknowledge
    // an unrelated private image, even after a processing receipt has expired.
    const bindingKey = key + ':binding';
    const owner = 'processing:' + crypto.randomUUID();
    const uncertain = 'uncertain:' + owner;
    function expectedMetadata(): string {
      return input.capturedAt + ' · ios-screenshot/' + input.saveLocation + ' · ' + input.captureId + ' · sha256:' + imageSha256;
    }
    function success(status: number, duplicate: boolean, saved: {imageBlockId: string; metadataBlockId: string}): Response {
      return Response.json({ok: true, captureId: input.captureId, duplicate, inboxSaved: true,
        ...saved, imageSha256, classification: 'pending'}, {status, headers: {'Cache-Control': 'no-store'}});
    }
    async function verifySaved(imageBlockId: string, metadataBlockId: string): Promise<void> {
      const headers = {Authorization: 'Bearer ' + options.notionToken, 'Notion-Version': VERSION};
      async function block(id: string): Promise<Record<string, any>> {
        if (!/^[a-f0-9-]{36}$/iu.test(id)) throw new Error('Invalid block ID');
        const result = await fetchImpl('https://api.notion.com/v1/blocks/' + id, {headers});
        if (!result.ok) throw new Error('Readback unavailable');
        const value = await result.json() as Record<string, any>;
        const parent = value.parent?.page_id ?? value.parent?.block_id;
        if (value.id !== id || value.archived || value.in_trash ||
            typeof parent !== 'string' || parent.replaceAll('-', '') !== options.notionPageId.replaceAll('-', '')) throw new Error('Readback parent mismatch');
        return value;
      }
      const meta = await block(metadataBlockId);
      if (meta.type !== 'paragraph' || meta.paragraph?.rich_text?.map((x: any) => x.plain_text ?? x.text?.content ?? '').join('') !== expectedMetadata()) throw new Error('Metadata mismatch');
      const image = await block(imageBlockId);
      if (image.type !== 'image' || image.image?.type !== 'file') throw new Error('Image missing');
      const url = new URL(image.image.file.url);
      // Never forward the Notion bearer token to a file host, and never follow
      // arbitrary redirects/URLs from an unexpected Notion response.
      if (url.protocol !== 'https:' || url.username || url.password || url.port ||
          !['amazonaws.com', 'notion-static.com', 'notion.so'].some(host => url.hostname === host || url.hostname.endsWith('.' + host))) throw new Error('Unexpected file host');
      const file = await fetchImpl(url, {redirect: 'error'});
      if (!file.ok || Number(file.headers.get('content-length') ?? 0) > 3_000_000) throw new Error('Image download failed');
      const reader = file.body?.getReader();
      if (!reader) throw new Error('Image body missing');
      const chunks: Uint8Array[] = []; let total = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          total += part.value.byteLength;
          if (total > 3_000_000) { await reader.cancel(); throw new Error('Image too large'); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const savedBytes = new Uint8Array(total); let offset = 0;
      for (const chunk of chunks) { savedBytes.set(chunk, offset); offset += chunk.byteLength; }
      if (savedBytes.length !== bytes.length || await sha256(savedBytes) !== imageSha256) throw new Error('Image byte mismatch');
    }
    async function reconcile(): Promise<{imageBlockId: string; metadataBlockId: string}> {
      const headers = {Authorization: 'Bearer ' + options.notionToken, 'Notion-Version': VERSION};
      const matches: Array<{imageBlockId: string; metadataBlockId: string}> = [];
      let previous: Record<string, any> | undefined;
      let cursor = '';
      // Read-only bounded reconciliation. No match/too many pages is a hold,
      // never permission to append again with a new identity.
      for (let i = 0; i < 10; i++) {
        const result = await fetchImpl('https://api.notion.com/v1/blocks/' + options.notionPageId + '/children?page_size=100' +
          (cursor ? '&start_cursor=' + encodeURIComponent(cursor) : ''), {headers});
        if (!result.ok) throw new Error('Reconciliation unavailable');
        const data = await result.json() as Record<string, any>;
        if (!Array.isArray(data.results)) throw new Error('Invalid reconciliation');
        for (const block of data.results) {
          if (previous?.type === 'paragraph' &&
              previous.paragraph?.rich_text?.map((x: any) => x.plain_text ?? x.text?.content ?? '').join('') === expectedMetadata()) {
            if (block.type !== 'image') throw new Error('Image adjacency mismatch');
            matches.push({metadataBlockId: previous.id, imageBlockId: block.id});
          }
          previous = block;
        }
        if (!data.has_more) {
          if (matches.length !== 1) throw new Error('Ambiguous reconciliation');
          await verifySaved(matches[0]!.imageBlockId, matches[0]!.metadataBlockId);
          return matches[0]!;
        }
        if (typeof data.next_cursor !== 'string' || !data.next_cursor || cursor === data.next_cursor) throw new Error('Invalid cursor');
        cursor = data.next_cursor;
      }
      throw new Error('Reconciliation page limit; keep hold');
    }
    try {
      const bound = await options.redis.command<string | null>(['SET', bindingKey, fingerprint, 'NX']);
      if (bound !== 'OK' && await options.redis.command<string | null>(['GET', bindingKey]) !== fingerprint) {
        return response(409, 'Capture identity mismatch; original retained');
      }
      const claimed = await options.redis.command<string | null>(['SET', key, owner, 'NX', 'EX', PROCESSING_TTL]);
      if (claimed !== 'OK') {
        const receipt = await options.redis.command<string | null>(['GET', key]);
        if (receipt?.startsWith('done:')) {
          try {
            const saved = JSON.parse(receipt.slice(5)) as {imageBlockId: string; metadataBlockId: string};
            await verifySaved(saved.imageBlockId, saved.metadataBlockId);
            return success(200, true, saved);
          } catch { return response(409, 'Saved image readback failed; do not resend with a new ID'); }
        }
        if (receipt?.startsWith('uncertain:')) {
          try {
            const saved = await reconcile();
            const completed = await options.redis.command<number>(['EVAL', ADVANCE_OWNED, 1, key, receipt, 'done:' + JSON.stringify(saved), DONE_TTL]);
            if (completed !== 1) throw new Error('Receipt changed');
            return success(200, true, saved);
          } catch { return response(409, 'Screenshot outcome still uncertain; original retained'); }
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
        const form = new FormData();
        form.append('file', new Blob([bytes], {type: input.mimeType}), filename);
        const sent = await fetchImpl('https://api.notion.com/v1/file_uploads/' + createdData.id + '/send', {
          method: 'POST', headers, body: form
        });
        if (!sent.ok) throw new Error('Notion image upload failed');
        const sentData = await sent.json() as {status?: string};
        if (sentData.status !== 'uploaded') throw new Error('Notion upload not complete');
        const metadata = expectedMetadata();
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
        const saved = {metadataBlockId: appendResult.results[0]!.id!, imageBlockId: appendResult.results[1]!.id!};
        await verifySaved(saved.imageBlockId, saved.metadataBlockId);
        const completed = await options.redis.command<number>(['EVAL', ADVANCE_OWNED, 1, key, uncertain, 'done:' + JSON.stringify(saved), DONE_TTL]);
        if (completed !== 1) throw new Error('Screenshot receipt ownership changed');
        return success(201, false, saved);
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

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
