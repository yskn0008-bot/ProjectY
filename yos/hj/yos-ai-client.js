'use strict';

// Browser distribution of server/yos-ai/src/client/yos-ai-client.ts.
// Credentials are requested for each chat and are never written to browser storage.
(() => {
  class YosAiHttpError extends Error {
    constructor({ message, status, requestId, retryAfterSeconds, diagnosticCode }) {
      super(message);
      this.name = 'YosAiHttpError';
      this.status = status;
      this.requestId = requestId;
      this.retryAfterSeconds = retryAfterSeconds;
      this.diagnosticCode = diagnosticCode;
    }
  }

  class YosAiClient {
    constructor(options) {
      this.baseUrl = normalizeBaseUrl(options?.baseUrl);
      if (typeof options?.getGoogleIdToken !== 'function') throw new Error('getGoogleIdToken is required');
      this.getGoogleIdToken = options.getGoogleIdToken;
      this.fetchImpl = options.fetchImpl || fetch;
      this.timeoutMilliseconds = boundedInteger(options.timeoutMilliseconds ?? 65000, 1000, 120000, 'timeoutMilliseconds');
      this.maxResponseBytes = boundedInteger(options.maxResponseBytes ?? 2000000, 1024, 10000000, 'maxResponseBytes');
    }

    async chat(input) {
      validateChatInput(input);
      let token;
      try {
        token = validateEphemeralToken(await this.getGoogleIdToken(), 'Google ID token');
      } catch (error) {
        throw new YosAiHttpError({
          message: 'Google sign-in is unavailable',
          status: Number(error?.status) || 0,
          diagnosticCode: 'google-token'
        });
      }
      return this.requestJson('/api/yos/chat', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(input)
      });
    }

    async requestJson(path, init) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMilliseconds);
      try {
        const response = await this.fetchImpl(new URL(path, this.baseUrl), {
          ...init,
          signal: controller.signal,
          credentials: 'omit',
          cache: 'no-store',
          redirect: 'error',
          referrerPolicy: 'no-referrer'
        });
        const body = await readBoundedJson(response, this.maxResponseBytes);
        if (!response.ok) throw toHttpError(response, body);
        return body;
      } catch (error) {
        if (error instanceof YosAiHttpError) {
          if (!error.diagnosticCode) error.diagnosticCode = 'http-response';
          throw error;
        }
        if (error instanceof Error && error.name === 'AbortError') {
          throw new YosAiHttpError({ message: 'YOS request timed out', status: 0, diagnosticCode: 'request-timeout' });
        }
        throw new YosAiHttpError({
          message: 'YOS is temporarily unavailable',
          status: 0,
          diagnosticCode: 'browser-fetch'
        });
      } finally {
        clearTimeout(timeout);
      }
    }
  }

  function normalizeBaseUrl(value) {
    let url;
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

  function validateChatInput(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('chat input is required');
    boundedText(input.userText, 1, 10000, 'userText');
    if (input.currentLocation !== undefined) boundedText(input.currentLocation, 1, 300, 'currentLocation');
    if (input.conversationSummary !== undefined) boundedText(input.conversationSummary, 1, 12000, 'conversationSummary');
    const allowed = new Set(['userText', 'currentLocation', 'conversationSummary']);
    for (const key of Object.keys(input)) if (!allowed.has(key)) throw new Error(`Unknown chat field: ${key}`);
  }

  function validateEphemeralToken(value, name) {
    if (typeof value !== 'string') throw new Error(`${name} is required`);
    const token = value.trim();
    if (!token || token.length > 16384 || /\s/u.test(token)) throw new Error(`${name} is invalid`);
    return token;
  }

  async function readBoundedJson(response, maxBytes) {
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new YosAiHttpError({ message: 'YOS returned an unexpected response', status: response.status });
    }
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) {
      throw new YosAiHttpError({ message: 'YOS response is too large', status: response.status });
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new YosAiHttpError({ message: 'YOS returned invalid JSON', status: response.status });
    }
  }

  function toHttpError(response, body) {
    const record = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const retryAfter = response.headers.get('retry-after');
    return new YosAiHttpError({
      message: typeof record.error === 'string' && record.error.length <= 200 ? record.error : `YOS request failed with HTTP ${response.status}`,
      status: response.status,
      requestId: typeof record.requestId === 'string' ? record.requestId : undefined,
      retryAfterSeconds: retryAfter && /^\d+$/u.test(retryAfter) ? Number(retryAfter) : undefined
    });
  }

  function boundedText(value, minimum, maximum, name) {
    if (typeof value !== 'string') throw new Error(`${name} must be a string`);
    const text = value.trim();
    if (text.length < minimum || text.length > maximum) throw new Error(`${name} is invalid`);
    return text;
  }

  function boundedInteger(value, minimum, maximum, name) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} is invalid`);
    return value;
  }

  globalThis.YosAiClient = YosAiClient;
  globalThis.YosAiHttpError = YosAiHttpError;
})();
