export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  check(key: string): Promise<RateLimitDecision>;
}

interface WindowState {
  count: number;
  resetAt: number;
}

export interface InMemoryFixedWindowRateLimiterOptions {
  limit: number;
  windowSeconds: number;
  clock?: () => number;
  maxTrackedKeys?: number;
}

export class InMemoryFixedWindowRateLimiter implements RateLimiter {
  private readonly states = new Map<string, WindowState>();
  private readonly clock: () => number;
  private readonly maxTrackedKeys: number;

  constructor(private readonly options: InMemoryFixedWindowRateLimiterOptions) {
    if (!Number.isSafeInteger(options.limit) || options.limit < 1) throw new Error('limit must be positive');
    if (!Number.isSafeInteger(options.windowSeconds) || options.windowSeconds < 1) {
      throw new Error('windowSeconds must be positive');
    }
    this.clock = options.clock ?? (() => Math.floor(Date.now() / 1000));
    this.maxTrackedKeys = options.maxTrackedKeys ?? 1_000;
  }

  async check(key: string): Promise<RateLimitDecision> {
    if (!key.trim()) throw new Error('rate limit key is required');
    const now = this.clock();
    this.removeExpired(now);
    let state = this.states.get(key);
    if (!state || state.resetAt <= now) {
      if (this.states.size >= this.maxTrackedKeys) throw new Error('rate limiter capacity exceeded');
      state = { count: 0, resetAt: now + this.options.windowSeconds };
      this.states.set(key, state);
    }

    if (state.count >= this.options.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, state.resetAt - now)
      };
    }

    state.count += 1;
    return {
      allowed: true,
      remaining: Math.max(0, this.options.limit - state.count)
    };
  }

  private removeExpired(now: number): void {
    for (const [key, state] of this.states) {
      if (state.resetAt <= now) this.states.delete(key);
    }
  }
}
