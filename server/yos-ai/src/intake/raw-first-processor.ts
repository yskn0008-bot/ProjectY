import type {FetchLike} from '../http.js';
import type {RedisCommandClient} from '../storage/upstash-rest.js';

const PROCESSING_TTL_SECONDS = 120;
const DONE_TTL_SECONDS = 30 * 24 * 60 * 60;
const NOTION_VERSION = '2022-06-28';

export interface RawCapture {
  rawText: string;
  capturedAt: string;
  inputMode: 'text' | 'voice';
  source: 'clarity';
  captureId: string;
}

export interface RawFirstProcessor {
  process(input: RawCapture): Promise<{duplicate: boolean}>;
}

export class CaptureInProgressError extends Error {}

export function createRawFirstProcessor(options: {
  notionToken: string;
  notionPageId: string;
  redis: RedisCommandClient;
  fetchImpl?: FetchLike;
}): RawFirstProcessor {
  const notionToken = requiredSecret(options.notionToken, 'Notion token');
  const notionPageId = normalizePageId(options.notionPageId);
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    async process(input) {
      const key = `yos:intake:clarity:v1:${input.captureId}`;
      const claimed = await options.redis.command<string | null>([
        'SET', key, 'processing', 'NX', 'EX', PROCESSING_TTL_SECONDS
      ]);
      if (claimed !== 'OK') {
        if (await options.redis.command<string | null>(['GET', key]) === 'done') return {duplicate: true};
        throw new CaptureInProgressError('Capture is already being processed');
      }

      try {
        await appendToNotion({fetchImpl, notionToken, notionPageId, input});
        await options.redis.command<string>(['SET', key, 'done', 'EX', DONE_TTL_SECONDS]);
        return {duplicate: false};
      } catch (error) {
        try {
          await options.redis.command<number>(['DEL', key]);
        } catch {
          // The original Clarity/Slack raw record remains the fail-safe if cleanup fails.
        }
        throw error;
      }
    }
  };
}

async function appendToNotion(options: {
  fetchImpl: FetchLike;
  notionToken: string;
  notionPageId: string;
  input: RawCapture;
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
      children: [paragraph(metadata), paragraph(options.input.rawText), {object: 'block', type: 'divider', divider: {}}]
    })
  });
  if (!response.ok) throw new Error('Notion append failed');
}

function paragraph(text: string): Record<string, unknown> {
  return {
    object: 'block', type: 'paragraph',
    paragraph: {rich_text: splitText(text).map((content) => ({type: 'text', text: {content}}))}
  };
}

function splitText(text: string): string[] {
  const chunks: string[] = [];
  for (let offset = 0; offset < text.length; offset += 1_900) chunks.push(text.slice(offset, offset + 1_900));
  return chunks.length > 0 ? chunks : [''];
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
