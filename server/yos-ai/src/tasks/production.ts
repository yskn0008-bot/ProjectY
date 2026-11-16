import {createGoogleIdentityVerifier} from '../auth/google-runtime.js';
import {IdentityGate} from '../auth/identity-gate.js';
import {loadYosRuntimeConfig, type Environment} from '../config.js';
import type {FetchLike} from '../http.js';
import {UpstashRestClient} from '../storage/upstash-rest.js';
import {createTaskDashboardHandler} from './handler.js';

export interface CreateProductionTaskDashboardOptions {
  environment: Environment;
  fetchImpl?: FetchLike;
}

export function createProductionTaskDashboard(options: CreateProductionTaskDashboardOptions): (request: Request) => Promise<Response> {
  const config = loadYosRuntimeConfig(options.environment);
  const identityVerifier = createGoogleIdentityVerifier(config.googleClientId);
  const identityGate = new IdentityGate({
    expectedAudience: config.googleClientId,
    allowedSubjectHash: config.allowedSubjectHash,
    requireEmailVerified: true
  });
  return createTaskDashboardHandler({
    allowedOrigins: config.allowedOrigins,
    allowMissingOrigin: false,
    identityVerifier,
    identityGate,
    googleWorkloadAuth: config.googleWorkloadAuth,
    ...(options.environment.UPSTASH_REDIS_REST_URL?.trim()&&options.environment.UPSTASH_REDIS_REST_TOKEN?.trim()?{habitRedis:new UpstashRestClient({url:options.environment.UPSTASH_REDIS_REST_URL,token:options.environment.UPSTASH_REDIS_REST_TOKEN,...(options.fetchImpl?{fetchImpl:options.fetchImpl}:{})})}:{}),
    ...(options.environment.UPSTASH_REDIS_REST_URL?.trim()&&options.environment.UPSTASH_REDIS_REST_TOKEN?.trim()?{passkeyRedis:new UpstashRestClient({url:options.environment.UPSTASH_REDIS_REST_URL,token:options.environment.UPSTASH_REDIS_REST_TOKEN,...(options.fetchImpl?{fetchImpl:options.fetchImpl}:{})}),passkeySubjectHash:config.allowedSubjectHash}:{}),
    notionToken: options.environment.YOS_NOTION_API_TOKEN?.trim() ?? '',
    notionDataSourceId: options.environment.YOS_NOTION_TASKS_DATA_SOURCE_ID?.trim() || '965c6086-32c1-463d-93b4-87a9cb69b3ad',
    ...(options.fetchImpl ? {fetchImpl: options.fetchImpl} : {})
  });
}
