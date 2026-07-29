import type {Environment} from '../config.js';

export interface YosStorageConfig {
  upstashUrl: string;
  upstashToken: string;
  auditRetentionSeconds: number;
}

export function loadYosStorageConfig(environment: Environment): YosStorageConfig {
  const upstashUrl = required(environment, 'UPSTASH_REDIS_REST_URL');
  const parsed = new URL(upstashUrl);
  if (parsed.protocol !== 'https:' || parsed.origin !== upstashUrl.replace(/\/$/u, '')) {
    throw new Error('UPSTASH_REDIS_REST_URL must be an exact HTTPS origin');
  }
  const retentionDays = positiveInteger(environment, 'YOS_AUDIT_RETENTION_DAYS', 30, 365);
  return {
    upstashUrl: parsed.origin,
    upstashToken: required(environment, 'UPSTASH_REDIS_REST_TOKEN'),
    auditRetentionSeconds: retentionDays * 24 * 60 * 60
  };
}

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function positiveInteger(environment: Environment, name: string, fallback: number, maximum: number): number {
  const raw = environment[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Invalid positive integer environment variable: ${name}`);
  }
  return value;
}
