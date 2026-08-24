import {createChatHandler, type ChatFailureReporter} from '../api/chat-handler.js';
import {createHealthHandler} from '../api/health-handler.js';
import type {AuditSink} from '../audit.js';
import {createGoogleIdentityVerifier} from '../auth/google-runtime.js';
import {IdentityGate} from '../auth/identity-gate.js';
import type {YosRuntimeConfig} from '../config.js';
import type {FetchLike} from '../http.js';
import type {RateLimiter} from '../rate-limit.js';
import {DefaultRequestRuntimeFactory} from './request-runtime.js';

export interface CreateYosAppOptions {
  config: YosRuntimeConfig;
  responseSchema: Record<string, unknown>;
  rateLimiter: RateLimiter;
  auditSink: AuditSink;
  fetchImpl?: FetchLike;
  requestIdFactory?: () => string;
  clock?: () => string;
  monotonicClock?: () => number;
  failureReporter?: ChatFailureReporter;
  healthVersion?: string;
}

export interface YosAppHandlers {
  chat(request: Request): Promise<Response>;
  health(request: Request): Promise<Response>;
}

export function createYosApp(options: CreateYosAppOptions): YosAppHandlers {
  const identityVerifier = createGoogleIdentityVerifier(options.config.googleClientId);
  const identityGate = new IdentityGate({
    expectedAudience: options.config.googleClientId,
    allowedSubjectHash: options.config.allowedSubjectHash,
    requireEmailVerified: true
  });
  const runtimeFactory = new DefaultRequestRuntimeFactory({
    config: options.config,
    responseSchema: options.responseSchema,
    ...(options.fetchImpl ? {fetchImpl: options.fetchImpl} : {})
  });
  const cors = {
    allowedOrigins: options.config.allowedOrigins,
    allowMissingOrigin: false
  };

  return {
    chat: createChatHandler({
      ...cors,
      identityVerifier,
      identityGate,
      runtimeFactory,
      rateLimiter: options.rateLimiter,
      auditSink: options.auditSink,
      ...(options.requestIdFactory ? {requestIdFactory: options.requestIdFactory} : {}),
      ...(options.clock ? {clock: options.clock} : {}),
      ...(options.monotonicClock ? {monotonicClock: options.monotonicClock} : {}),
      ...(options.failureReporter ? {failureReporter: options.failureReporter} : {})
    }),
    health: createHealthHandler({
      ...cors,
      version: options.healthVersion ?? '0.1.0',
      ...(options.clock ? {clock: options.clock} : {})
    })
  };
}
