import {createAnswerAuditRecord, type AuditSink} from '../audit.js';
import type {IdentityGate} from '../auth/identity-gate.js';
import type {IdentityVerifier} from '../auth/types.js';
import type {RateLimiter} from '../rate-limit.js';
import type {RequestRuntimeFactory} from '../runtime/types.js';
import type {YosRequest} from '../types.js';
import {allowedOrigin, bearerToken, corsPreflight, secureJson, type CorsOptions} from './shared.js';

export type ChatFailureStage = 'rate-limit' | 'runtime-create' | 'answer' | 'audit';

export interface ChatFailureEvent {
  stage: ChatFailureStage;
  requestId: string;
}

export type ChatFailureReporter = (event: ChatFailureEvent) => void;

export interface ChatHandlerOptions extends CorsOptions {
  identityVerifier: IdentityVerifier;
  identityGate: IdentityGate;
  runtimeFactory: RequestRuntimeFactory;
  rateLimiter: RateLimiter;
  auditSink: AuditSink;
  requestIdFactory?: () => string;
  clock?: () => string;
  monotonicClock?: () => number;
  failureReporter?: ChatFailureReporter;
  maxBodyBytes?: number;
  maxUserTextCharacters?: number;
  maxConversationSummaryCharacters?: number;
  maxLocationCharacters?: number;
}

interface ChatBody {
  userText: string;
  currentLocation?: string;
  conversationSummary?: string;
}

export function createChatHandler(options: ChatHandlerOptions): (request: Request) => Promise<Response> {
  const requestIdFactory = options.requestIdFactory ?? (() => crypto.randomUUID());
  const clock = options.clock ?? (() => new Date().toISOString());
  const monotonicClock = options.monotonicClock ?? (() => Date.now());
  const maxBodyBytes = options.maxBodyBytes ?? 32_768;
  const maxUserTextCharacters = options.maxUserTextCharacters ?? 10_000;
  const maxConversationSummaryCharacters = options.maxConversationSummaryCharacters ?? 12_000;
  const maxLocationCharacters = options.maxLocationCharacters ?? 300;

  return async (request: Request): Promise<Response> => {
    const requestId = requestIdFactory();
    const origin = allowedOrigin(request, options);
    if (origin === null) return secureJson({error: 'Origin not allowed', requestId}, 403, null);
    if (request.method === 'OPTIONS') return corsPreflight(origin);
    if (request.method !== 'POST') {
      return secureJson({error: 'Method not allowed', requestId}, 405, origin, {Allow: 'POST, OPTIONS'});
    }
    if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
      return secureJson({error: 'Content-Type must be application/json', requestId}, 415, origin);
    }

    let subjectHash: string;
    try {
      const idToken = bearerToken(request);
      const identity = await options.identityVerifier.verify(idToken);
      subjectHash = (await options.identityGate.authorize(identity)).subjectHash;
    } catch {
      return secureJson({error: 'Authentication failed', requestId}, 401, origin);
    }

    try {
      const decision = await options.rateLimiter.check(subjectHash);
      if (!decision.allowed) {
        return secureJson(
          {error: 'Rate limit exceeded', requestId},
          429,
          origin,
          {'Retry-After': String(decision.retryAfterSeconds ?? 60)}
        );
      }
    } catch {
      reportFailure(options.failureReporter, {stage: 'rate-limit', requestId});
      return secureJson({error: 'YOS is temporarily unavailable', requestId}, 503, origin);
    }

    let body: ChatBody;
    try {
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > maxBodyBytes) {
        return secureJson({error: 'Request body is too large', requestId}, 413, origin);
      }
      body = parseChatBody(raw, {
        maxUserTextCharacters,
        maxConversationSummaryCharacters,
        maxLocationCharacters
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request body';
      return secureJson({error: message, requestId}, 400, origin);
    }

    const yosRequest: YosRequest = {
      requestId,
      userText: body.userText,
      currentTime: clock(),
      ...(body.currentLocation ? {currentLocation: body.currentLocation} : {}),
      ...(body.conversationSummary ? {conversationSummary: body.conversationSummary} : {})
    };

    const startedAt = monotonicClock();
    let failureStage: ChatFailureStage = 'runtime-create';
    try {
      const runtime = await options.runtimeFactory.create({
        requestId,
        subjectHash
      });
      failureStage = 'answer';
      const answer = await runtime.answer(yosRequest);
      const durationMilliseconds = Math.max(0, Math.round(monotonicClock() - startedAt));
      failureStage = 'audit';
      await options.auditSink.append(createAnswerAuditRecord({
        answer,
        subjectHash,
        createdAt: yosRequest.currentTime,
        durationMilliseconds
      }));
      return secureJson(answer, 200, origin);
    } catch {
      reportFailure(options.failureReporter, {stage: failureStage, requestId});
      return secureJson({error: 'YOS is temporarily unavailable', requestId}, 503, origin);
    }
  };
}

function parseChatBody(
  raw: string,
  limits: {
    maxUserTextCharacters: number;
    maxConversationSummaryCharacters: number;
    maxLocationCharacters: number;
  }
): ChatBody {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Request body must be valid JSON');
  }
  if (!isRecord(value)) throw new Error('Request body must be an object');

  const allowedKeys = new Set(['userText', 'currentLocation', 'conversationSummary']);
  const unknownKey = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknownKey) throw new Error(`Unknown request field: ${unknownKey}`);

  const userText = boundedString(value.userText, 'userText', 1, limits.maxUserTextCharacters);
  const currentLocation = optionalString(value.currentLocation, 'currentLocation', limits.maxLocationCharacters);
  const conversationSummary = optionalString(
    value.conversationSummary,
    'conversationSummary',
    limits.maxConversationSummaryCharacters
  );

  return {
    userText,
    ...(currentLocation ? {currentLocation} : {}),
    ...(conversationSummary ? {conversationSummary} : {})
  };
}

function boundedString(value: unknown, name: string, min: number, max: number): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw new Error(`${name} is required`);
  if (trimmed.length > max) throw new Error(`${name} exceeds ${max} characters`);
  return trimmed;
}

function optionalString(value: unknown, name: string, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return boundedString(value, name, 1, max);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function reportFailure(reporter: ChatFailureReporter | undefined, event: ChatFailureEvent): void {
  try {
    reporter?.(event);
  } catch {
    // Observability must never change the fail-closed response.
  }
}
