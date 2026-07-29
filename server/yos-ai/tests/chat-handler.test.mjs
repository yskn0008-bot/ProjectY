import test from 'node:test';
import assert from 'node:assert/strict';
import { createChatHandler } from '../dist/api/chat-handler.js';

const origin = 'https://yos.example';
const identity = {
  subject: 'subject',
  audience: 'client',
  issuer: 'accounts.google.com',
  expiresAt: 1_900_000_000
};

function dependencies(overrides = {}) {
  return {
    allowedOrigins: [origin],
    identityVerifier: { async verify(token) { if (token === 'bad') throw new Error('bad'); return identity; } },
    identityGate: { async authorize() { return { subjectHash: 'hash' }; } },
    rateLimiter: { async check() { return { allowed: true, remaining: 29 }; } },
    orchestrator: {
      async answer(request) {
        return {
          requestId: request.requestId,
          route: { primary: 'yos', related: [], liveMode: false, reasons: [] },
          answer: 'ok', facts: [], assumptions: [], unknowns: [], memoryCandidates: [], nextAction: null,
          conflicts: [], sources: [], safety: { level: 'normal', notes: [] }
        };
      }
    },
    requestIdFactory: () => 'req-test',
    clock: () => '2026-07-29T14:00:00.000Z',
    ...overrides
  };
}

function jsonRequest(body, options = {}) {
  return new Request('https://api.example/api/yos/chat', {
    method: options.method ?? 'POST',
    headers: {
      origin: options.origin ?? origin,
      authorization: options.authorization ?? 'Bearer good',
      'content-type': options.contentType ?? 'application/json'
    },
    body: options.method === 'OPTIONS' ? undefined : JSON.stringify(body)
  });
}

test('handles CORS preflight only for an allowed origin', async () => {
  const handler = createChatHandler(dependencies());
  const response = await handler(jsonRequest({}, { method: 'OPTIONS' }));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);

  const denied = await handler(jsonRequest({}, { method: 'OPTIONS', origin: 'https://evil.example' }));
  assert.equal(denied.status, 403);
});

test('rejects missing or invalid authentication', async () => {
  const handler = createChatHandler(dependencies());
  const missing = await handler(new Request('https://api.example/api/yos/chat', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{"userText":"hello"}'
  }));
  assert.equal(missing.status, 401);

  const bad = await handler(jsonRequest({ userText: 'hello' }, { authorization: 'Bearer bad' }));
  assert.equal(bad.status, 401);
});

test('rejects invalid content type, JSON, unknown fields and oversized input', async () => {
  const handler = createChatHandler(dependencies({ maxUserTextCharacters: 5 }));
  const contentType = await handler(jsonRequest({ userText: 'hello' }, { contentType: 'text/plain' }));
  assert.equal(contentType.status, 415);

  const invalidJson = await handler(new Request('https://api.example/api/yos/chat', {
    method: 'POST', headers: { origin, authorization: 'Bearer good', 'content-type': 'application/json' }, body: '{'
  }));
  assert.equal(invalidJson.status, 400);

  const unknownField = await handler(jsonRequest({ userText: 'hello', currentTime: '2026-07-29T23:00:00+09:00' }));
  assert.equal(unknownField.status, 400);

  const tooLong = await handler(jsonRequest({ userText: '123456' }));
  assert.equal(tooLong.status, 400);
});

test('enforces the injected rate limiter before model execution', async () => {
  let called = false;
  const handler = createChatHandler(dependencies({
    rateLimiter: { async check() { return { allowed: false, remaining: 0, retryAfterSeconds: 42 }; } },
    orchestrator: { async answer() { called = true; throw new Error('must not run'); } }
  }));
  const response = await handler(jsonRequest({ userText: 'hello' }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '42');
  assert.equal(called, false);
});

test('returns a grounded YOS answer and security headers', async () => {
  let received;
  const handler = createChatHandler(dependencies({
    orchestrator: {
      async answer(request) {
        received = request;
        return {
          requestId: request.requestId,
          route: { primary: 'yos', related: [], liveMode: false, reasons: [] },
          answer: 'ok', facts: [], assumptions: [], unknowns: [], memoryCandidates: [], nextAction: null,
          conflicts: [], sources: [], safety: { level: 'normal', notes: [] }
        };
      }
    }
  }));
  const response = await handler(jsonRequest({ userText: '  hello  ' }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(received.userText, 'hello');
  assert.equal(received.requestId, 'req-test');
  assert.equal(received.currentTime, '2026-07-29T14:00:00.000Z');
  assert.equal((await response.json()).answer, 'ok');
});

test('does not leak internal backend errors', async () => {
  const handler = createChatHandler(dependencies({
    orchestrator: { async answer() { throw new Error('OPENAI_API_KEY=secret'); } }
  }));
  const response = await handler(jsonRequest({ userText: 'hello' }));
  const body = await response.text();
  assert.equal(response.status, 503);
  assert.doesNotMatch(body, /secret|OPENAI_API_KEY/);
  assert.match(body, /temporarily unavailable/);
});
