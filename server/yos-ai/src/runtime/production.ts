import {loadYosRuntimeConfig, type Environment} from '../config.js';
import type {FetchLike} from '../http.js';
import {loadYosStorageConfig} from '../storage/config.js';
import {UpstashAuditSink} from '../storage/upstash-audit.js';
import {UpstashFixedWindowRateLimiter} from '../storage/upstash-rate-limit.js';
import {UpstashRestClient} from '../storage/upstash-rest.js';
import {createYosApp, type YosAppHandlers} from './app.js';

export interface CreateProductionYosAppOptions {
  environment: Environment;
  responseSchema: Record<string, unknown>;
  fetchImpl?: FetchLike;
  healthVersion?: string;
}

export function createProductionYosApp(options: CreateProductionYosAppOptions): YosAppHandlers {
  const config = loadYosRuntimeConfig(options.environment);
  const storage = loadYosStorageConfig(options.environment);
  const redis = new UpstashRestClient({
    url: storage.upstashUrl,
    token: storage.upstashToken,
    ...(options.fetchImpl ? {fetchImpl: options.fetchImpl} : {})
  });
  const rateLimiter = new UpstashFixedWindowRateLimiter({
    client: redis,
    limit: config.limits.requestsPerHour,
    windowSeconds: 60 * 60
  });
  const auditSink = new UpstashAuditSink({
    client: redis,
    retentionSeconds: storage.auditRetentionSeconds
  });

  return createYosApp({
    config,
    responseSchema: options.responseSchema,
    rateLimiter,
    auditSink,
    ...(options.fetchImpl ? {fetchImpl: options.fetchImpl} : {}),
    ...(options.healthVersion ? {healthVersion: options.healthVersion} : {})
  });
}
