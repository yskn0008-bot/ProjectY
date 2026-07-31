import type {FetchLike} from '../http.js';
import type {ImadaNavModel} from '../nav/imada-model.js';
import type {YosAnswer} from '../types.js';

export interface YosAiClientOptions {
  baseUrl: string;
  getGoogleIdToken: () => Promise<string>;
  fetchImpl?: FetchLike;
  timeoutMilliseconds?: number;
  maxResponseBytes?: number;
}

export interface YosChatInput {
  userText: string;
  currentLocation?: string;
  conversationSummary?: string;
}

export interface YosHealthResponse {
  status: 'ok';
  service: 'yos-ai';
  version: string;
  time: string;
}

export interface TaxiEventInput {
  version: 1;
  eventId: string;
  businessDate: string;
  vehicle?: string;
  rideStartedAt?: string | null;
  rideEndedAt?: string | null;
  pickup?: string;
  pickupCoords?: string;
  dropoff?: string;
  dropoffCoords?: string;
  fare: number;
  tip: number;
  payment?: string;
  dispatch?: string;
  distance: number;
  durationMs: number;
  waitMs: number;
  memo?: string;
  clientUpdatedAt?: string;
}

export interface TaxiEventResult {
  ok: true;
  duplicate: boolean;
  eventId: string;
  updatedRange?: string;
}

export type YosAiErrorKind =
  | 'bad-request'
  | 'authentication'
  | 'origin'
  | 'method'
  | 'too-large'
  | 'unsupported-media'
  | 'rate-limit'
  | 'unavailable'
  | 'unexpected';

export class YosAiHttpError extends Error {
  readonly status: number;
  readonly kind: YosAiErrorKind;
  readonly requestId?: string;
  readonly retryAfterSeconds?: number;

  constructor(options: {
    message: string;
    status: number;
    kind: YosAiErrorKind;
    requestId?: string;
    retryAfterSeconds?: number;
  }) {
    super(options.message);
    this.name = 'YosAiHttpError';
    this.status = options.status;
    this.kind = options.kind;
    if (options.requestId) this.requestId = options.requestId;
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export class YosAiClient {
  readonly #baseUrl: URL;
  readonly #getGoogleIdToken: () => Promise<string>;
  readonly #fetch: FetchLike;
  readonly #timeoutMilliseconds: number;
  readonly #maxResponseBytes: number;

  constructor(options: YosAiClientOptions) {
    this.#baseUrl = normalizeBaseUrl(options.baseUrl);
    this.#getGoogleIdToken = options.getGoogleIdToken;
    this.#fetch = options.fetchImpl ?? fetch;
    this.#timeoutMilliseconds = boundedInteger(options.timeoutMilliseconds ?? 65_000, 1_000, 120_000, 'timeoutMilliseconds');
    this.#maxResponseBytes = boundedInteger(options.maxResponseBytes ?? 2_000_000, 1_024, 10_000_000, 'maxResponseBytes');
  }

  async health(): Promise<YosHealthResponse> {
    return this.#requestJson<YosHealthResponse>('/api/yos/health', {method: 'GET'});
  }

  async chat(input: YosChatInput): Promise<YosAnswer> {
    validateChatInput(input);
    const token = await this.#freshGoogleIdToken();
    return this.#requestJson<YosAnswer>('/api/yos/chat', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    });
  }

  async navModel(options: {refresh?: boolean} = {}): Promise<ImadaNavModel> {
    const path = options.refresh ? '/api/yos/nav-model?refresh=1' : '/api/yos/nav-model';
    return this.#requestJson<ImadaNavModel>(path, {method: 'GET'});
  }

  async recordTaxiEvent(input: TaxiEventInput, syncToken: string): Promise<TaxiEventResult> {
    validateTaxiEventInput(input);
    const token = validateEphemeralToken(syncToken, 'Taxi sync token');
    return this.#requestJson<TaxiEventResult>('/api/yos/taxi-event', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(input)
    }, new Set([409]));
  }

  async #freshGoogleIdToken(): Promise<string> {
    return validateEphemeralToken(await this.#getGoogleIdToken(), 'Google ID token');
  }

  async #requestJson<T>(path: string, init: RequestInit, acceptedErrorStatuses = new Set<number>()): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMilliseconds);
    try {
      const response = await this.#fetch(new URL(path, this.#baseUrl), {
        ...init,
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer'
      });
      const body = await readBoundedJson(response, this.#maxResponseBytes);
      if (!response.ok && !acceptedErrorStatuses.has(response.status)) {
        throw toHttpError(response, body);
      }
      return body as T;
    } catch (error) {
      if (error instanceof YosAiHttpError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new YosAiHttpError({
          message: 'YOS request timed out',
          status: 0,
          kind: 'unavailable'
        });
      }
      throw new YosAiHttpError({
        message: 'YOS is temporarily unavailable',
        status: 0,
        kind: 'unavailable'
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function normalizeBaseUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('baseUrl must be a valid URL');
  }
  const localhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(localhost && url.protocol === 'http:')) {
    throw new Error('baseUrl must use HTTPS outside localhost');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('baseUrl must not contain credentials, query, or fragment');
  }
  url.pathname = `${url.pathname.replace(/\/+$/u, '')}/`;
  return url;
}

function validateChatInput(input: YosChatInput): void {
  boundedText(input.userText, 1, 10_000, 'userText');
  if (input.currentLocation !== undefined) boundedText(input.currentLocation, 1, 300, 'currentLocation');
  if (input.conversationSummary !== undefined) {
    boundedText(input.conversationSummary, 1, 12_000, 'conversationSummary');
  }
  const allowed = new Set(['userText', 'currentLocation', 'conversationSummary']);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key)) throw new Error(`Unknown chat field: ${key}`);
  }
}

function validateTaxiEventInput(input: TaxiEventInput): void {
  if (input.version !== 1) throw new Error('Taxi event version must be 1');
  boundedText(input.eventId, 1, 160, 'eventId');
  if (!/^[A-Za-z0-9._:-]+$/u.test(input.eventId)) throw new Error('eventId is invalid');
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.businessDate)) throw new Error('businessDate is invalid');
  nonNegative(input.fare, 1_000_000, 'fare');
  nonNegative(input.tip, 1_000_000, 'tip');
  nonNegative(input.distance, 2_000, 'distance');
  nonNegative(input.durationMs, 172_800_000, 'durationMs');
  nonNegative(input.waitMs, 172_800_000, 'waitMs');
}

function validateEphemeralToken(value: string, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} is required`);
  const token = value.trim();
  if (!token || token.length > 16_384 || /\s/u.test(token)) throw new Error(`${name} is invalid`);
  return token;
}

async function readBoundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new YosAiHttpError({
      message: 'YOS returned an unexpected response',
      status: response.status,
      kind: 'unexpected'
    });
  }
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new YosAiHttpError({
      message: 'YOS response is too large',
      status: response.status,
      kind: 'unexpected'
    });
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new YosAiHttpError({
      message: 'YOS returned invalid JSON',
      status: response.status,
      kind: 'unexpected'
    });
  }
}

function toHttpError(response: Response, body: unknown): YosAiHttpError {
  const record = isRecord(body) ? body : {};
  const requestId = typeof record.requestId === 'string' ? record.requestId : undefined;
  const serverMessage = typeof record.error === 'string' && record.error.length <= 200 ? record.error : defaultMessage(response.status);
  const retryAfter = response.headers.get('retry-after');
  const retryAfterSeconds = retryAfter && /^\d+$/u.test(retryAfter) ? Number(retryAfter) : undefined;
  return new YosAiHttpError({
    message: serverMessage,
    status: response.status,
    kind: errorKind(response.status),
    ...(requestId ? {requestId} : {}),
    ...(retryAfterSeconds !== undefined ? {retryAfterSeconds} : {})
  });
}

function errorKind(status: number): YosAiErrorKind {
  if (status === 400) return 'bad-request';
  if (status === 401) return 'authentication';
  if (status === 403) return 'origin';
  if (status === 405) return 'method';
  if (status === 413) return 'too-large';
  if (status === 415) return 'unsupported-media';
  if (status === 429) return 'rate-limit';
  if (status === 503) return 'unavailable';
  return 'unexpected';
}

function defaultMessage(status: number): string {
  if (status === 401) return 'Authentication failed';
  if (status === 403) return 'Origin not allowed';
  if (status === 429) return 'Rate limit exceeded';
  if (status === 503) return 'YOS is temporarily unavailable';
  return `YOS request failed with HTTP ${status}`;
}

function boundedText(value: unknown, minimum: number, maximum: number, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`);
  const text = value.trim();
  if (text.length < minimum || text.length > maximum) throw new Error(`${name} is invalid`);
  return text;
}

function nonNegative(value: unknown, maximum: number, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > maximum) {
    throw new Error(`${name} is invalid`);
  }
  return value;
}

function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is invalid`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
