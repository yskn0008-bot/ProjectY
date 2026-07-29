import type {AnswerAuditRecord, AuditSink} from '../audit.js';
import type {RedisCommandClient} from './upstash-rest.js';

export interface UpstashAuditSinkOptions {
  client: RedisCommandClient;
  retentionSeconds: number;
  prefix?: string;
}

export class UpstashAuditSink implements AuditSink {
  private readonly prefix: string;

  constructor(private readonly options: UpstashAuditSinkOptions) {
    if (!Number.isSafeInteger(options.retentionSeconds) || options.retentionSeconds < 60) {
      throw new Error('audit retentionSeconds must be at least 60');
    }
    this.prefix = validPrefix(options.prefix ?? 'yos:audit');
  }

  async append(record: AnswerAuditRecord): Promise<void> {
    if (!/^[A-Za-z0-9._:-]{1,200}$/u.test(record.requestId)) throw new Error('audit requestId is invalid');
    const serialized = JSON.stringify(record);
    if (serialized.length > 32_000) throw new Error('audit record is too large');
    await this.options.client.command<string>([
      'SETEX',
      `${this.prefix}:${record.requestId}`,
      this.options.retentionSeconds,
      serialized
    ]);
  }
}

function validPrefix(value: string): string {
  const prefix = value.trim();
  if (!/^[A-Za-z0-9:_-]{1,64}$/u.test(prefix)) throw new Error('audit prefix is invalid');
  return prefix;
}
