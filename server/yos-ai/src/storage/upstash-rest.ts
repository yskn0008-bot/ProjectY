import type {FetchLike} from '../http.js';

export type RedisCommandArgument = string | number;

export interface RedisCommandClient {
  command<T>(arguments_: readonly RedisCommandArgument[]): Promise<T>;
}

export interface UpstashRestClientOptions {
  url: string;
  token: string;
  fetchImpl?: FetchLike;
}

interface UpstashResponse<T> {
  result?: T;
  error?: string;
}

export class UpstashRestClient implements RedisCommandClient {
  private readonly url: string;
  private readonly token: string;
  private readonly fetchImpl: FetchLike;

  constructor(options: UpstashRestClientOptions) {
    const url = new URL(options.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
      throw new Error('Upstash REST URL must be an exact HTTPS origin');
    }
    if (!options.token.trim()) throw new Error('Upstash REST token is required');
    this.url = url.origin;
    this.token = options.token.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async command<T>(arguments_: readonly RedisCommandArgument[]): Promise<T> {
    if (arguments_.length === 0) throw new Error('Redis command is required');
    const response = await this.fetchImpl(this.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(arguments_)
    });
    if (!response.ok) throw new Error('Upstash command failed');
    const payload = await response.json() as UpstashResponse<T>;
    if (payload.error || !Object.prototype.hasOwnProperty.call(payload, 'result')) {
      throw new Error('Upstash command failed');
    }
    return payload.result as T;
  }
}
