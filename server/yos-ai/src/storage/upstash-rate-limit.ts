import type {RateLimitDecision, RateLimiter} from '../rate-limit.js';
import type {RedisCommandClient} from './upstash-rest.js';

const INCREMENT_WITH_EXPIRY = [
  "local current = redis.call('INCR', KEYS[1])",
  "if current == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
  'return current'
].join('\n');

export interface UpstashFixedWindowRateLimiterOptions {
  client: RedisCommandClient;
  limit: number;
  windowSeconds: number;
  prefix?: string;
  clock?: () => number;
}

export class UpstashFixedWindowRateLimiter implements RateLimiter {
  private readonly prefix: string;
  private readonly clock: () => number;

  constructor(private readonly options: UpstashFixedWindowRateLimiterOptions) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 1) throw new Error('limit must be positive');
    if (!Number.isSafeInteger(options.windowSeconds) || options.windowSeconds < 1) {
      throw new Error('windowSeconds must be positive');
    }
    this.prefix = validPrefix(options.prefix ?? 'yos:rate');
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
  }

  async check(key: string): Promise<RateLimitDecision> {
    const normalizedKey = key.trim();
    if (!normalizedKey || normalizedKey.length > 256) throw new Error('rate limit key is invalid');
    const now = this.clock();
    const bucket = Math.floor(now / this.options.windowSeconds);
    const redisKey = `${this.prefix}:${bucket}:${normalizedKey}`;
    const count = await this.options.client.command<number>([
      'EVAL',
      INCREMENT_WITH_EXPIRY,
      1,
      redisKey,
      this.options.windowSeconds + 60
    ]);
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Upstash rate limit result is invalid');

    const remaining = Math.max(0, this.options.limit - count);
    if (count > this.options.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, this.options.windowSeconds - (now % this.options.windowSeconds))
      };
    }
    return {allowed: true, remaining};
  }
}

function validPrefix(value: string): string {
  const prefix = value.trim();
  if (!/^[A-Za-z0-9:_-]{1,64}$/u.test(prefix)) throw new Error('rate limit prefix is invalid');
  return prefix;
}
