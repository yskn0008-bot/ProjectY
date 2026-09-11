import type {RedisCommandClient} from '../storage/upstash-rest.js';
import {CaptureInProgressError, type RawCapture, type RawFirstProcessor} from './raw-first-processor.js';

const CLASSIFICATION_CLAIM_TTL_SECONDS = 120;
const CLASSIFICATION_KEY_PREFIX = 'yos:capture:classification:v1:';
const SHOPPING_WORDS = ['石鹸', 'せっけん', '洗剤', '牛乳', '卵', 'トイレットペーパー', 'ティッシュ'];
const CALENDAR_PATTERN = /(?:今日|明日|来週|[月火水木金土日]曜|\d{1,2}時)/u;
const REMINDER_PATTERN = /(?:リマインド|忘れない|あとで|やること|タスク)/u;

export interface YosCaptureClassification {
  schemaVersion: 1;
  captureId: string;
  status: 'classified' | 'needs_review';
  target: 'shopping' | 'calendar' | 'reminders' | 'memo';
  label: string;
  confidence: number;
  classifiedAt: string;
  externalWrite: false;
}

export function createYosCaptureProcessor(options: {
  rawFirst: RawFirstProcessor;
  redis: RedisCommandClient;
  now?: () => Date;
}): RawFirstProcessor {
  const now = options.now ?? (() => new Date());

  return {
    async process(input) {
      const rawResult = await options.rawFirst.process(input);
      const resultKey = `${CLASSIFICATION_KEY_PREFIX}${input.captureId}`;
      if (await options.redis.command<string | null>(['GET', resultKey]) !== null) {
        return {duplicate: rawResult.duplicate};
      }

      const claimKey = `${resultKey}:claim`;
      const claimed = await options.redis.command<string | null>([
        'SET', claimKey, 'processing', 'NX', 'EX', CLASSIFICATION_CLAIM_TTL_SECONDS
      ]);
      if (claimed !== 'OK') {
        if (await options.redis.command<string | null>(['GET', resultKey]) !== null) {
          return {duplicate: rawResult.duplicate};
        }
        throw new CaptureInProgressError('Capture classification is already being processed');
      }

      try {
        const classification = classify(input, now());
        await options.redis.command<string>(['SET', resultKey, JSON.stringify(classification)]);
        await options.redis.command<number>(['DEL', claimKey]);
        return {duplicate: rawResult.duplicate};
      } catch (error) {
        try {
          await options.redis.command<number>(['DEL', claimKey]);
        } catch {
          // The bounded claim TTL keeps classification retryable if cleanup fails.
        }
        throw error;
      }
    }
  };
}

function classify(input: RawCapture, classifiedAt: Date): YosCaptureClassification {
  const common = {
    schemaVersion: 1 as const,
    captureId: input.captureId,
    classifiedAt: classifiedAt.toISOString(),
    externalWrite: false as const
  };
  if (SHOPPING_WORDS.some((word) => input.rawText.includes(word)) || /(?:買う|買って|購入)$/u.test(input.rawText)) {
    return {...common, status: 'classified', target: 'shopping', label: '買い物', confidence: 0.9};
  }
  if (CALENDAR_PATTERN.test(input.rawText)) {
    return {...common, status: 'needs_review', target: 'calendar', label: '予定かもしれません', confidence: 0.45};
  }
  if (REMINDER_PATTERN.test(input.rawText)) {
    return {...common, status: 'needs_review', target: 'reminders', label: 'リマインダーかもしれません', confidence: 0.45};
  }
  return {...common, status: 'needs_review', target: 'memo', label: '未整理', confidence: 0.25};
}
