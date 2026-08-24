import test from 'node:test';
import assert from 'node:assert/strict';
import {createChatHandler} from '../dist/api/chat-handler.js';

const origin = 'https://yos.example';
const identity = {
  subject: 'subject',
  audience: 'client',
  issuer: 'accounts.google.com',
  expiresAt: 1_900_000_000
};

function answerFor(request, overrides = {}) {
  return {
    requestId: request.requestId,
    route: {primary: 'yos', related: [], liveMode: false, reasons: []},
    answer: 'private answer text',
    facts: [],
    assumptions: [],
    unknowns: [],
    memoryCandidates: [],
    nextAction: null,
    conflicts: [],
    sources: [],
    safety: {level: 'normal', notes: []},
    ...overrides
  };
}

function dependencies(overrides = {}) {
  return {
    allowedOrigins: [origin],
    identityVerifier: {async verify(token) { if (token === 'bad') throw new Error('bad'); return identity; }},
    identityGate: {async authorize() { return {subjectHash: 'hash'}; }},
    rateLimiter: {async check() { return {allowed: true, remaining: 29}; }},
    auditSink: {async append() {}},
    runtimeFactory: {
      async create() {
        return {async answer(request) { return answerFor(request); }};
      }
    },
    requestIdFactory: () => 'req-test',
    clock: () => '2026-07-29T14:00:00.000Z',
    monotonicClock: (() => {
      const values = [1000, 1123];
      return () => values.shift() ?? 1123;
    })(),
    ...overrides
  };
}

function jsonRequest(body, options = {}) {
  const headers = {
    origin: options.origin ?? origin,
    authorization: options.authorization ?? 'Bearer good',
    'content-type': options.contentType ?? 'application/json'
  };
  if (options.vercelOidcToken) headers['x-vercel-oidc-token'] = options.vercelOidcToken;
  return new Request('https://api.example/api/yos/chat', {
    method: options.method ?? 'POST',
    headers,
    body: options.method === 'OPTIONS' ? undefined : JSON.stringify(body)
  });
}

test('handles CORS preflight only for an allowed origin', async () => {
  const handler = createChatHandler(dependencies());
  const response = await handler(jsonRequest({}, {method: 'OPTIONS'}));
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), origin);

  const denied = await handler(jsonRequest({}, {method: 'OPTIONS', origin: 'https://evil.example'}));
  assert.equal(denied.status, 403);
});

test('rejects missing or invalid authentication', async () => {
  const handler = createChatHandler(dependencies());
  const missing = await handler(new Request('https://api.example/api/yos/chat', {
    method: 'POST', headers: {origin, 'content-type': 'application/json'}, body: '{"userText":"hello"}'
  }));
  assert.equal(missing.status, 401);

  const bad = await handler(jsonRequest({userText: 'hello'}, {authorization: 'Bearer bad'}));
  assert.equal(bad.status, 401);
});

test('rejects invalid content type, JSON, unknown fields and oversized input', async () => {
  const handler = createChatHandler(dependencies({maxUserTextCharacters: 5}));
  const contentType = await handler(jsonRequest({userText: 'hello'}, {contentType: 'text/plain'}));
  assert.equal(contentType.status, 415);

  const invalidJson = await handler(new Request('https://api.example/api/yos/chat', {
    method: 'POST', headers: {origin, authorization: 'Bearer good', 'content-type': 'application/json'}, body: '{'
  }));
  assert.equal(invalidJson.status, 400);

  const unknownField = await handler(jsonRequest({userText: 'hello', currentTime: '2026-07-29T23:00:00+09:00'}));
  assert.equal(unknownField.status, 400);

  const tooLong = await handler(jsonRequest({userText: '123456'}));
  assert.equal(tooLong.status, 400);
});

test('enforces the injected rate limiter before runtime creation', async () => {
  let called = false;
  const handler = createChatHandler(dependencies({
    rateLimiter: {async check() { return {allowed: false, remaining: 0, retryAfterSeconds: 42}; }},
    runtimeFactory: {async create() { called = true; throw new Error('must not run'); }}
  }));
  const response = await handler(jsonRequest({userText: 'hello'}));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('retry-after'), '42');
  assert.equal(called, false);
});

test('ignores a valid inbound Vercel token header', async () => {
  let runtimeContext;
  let receivedRequest;
  const handler = createChatHandler(dependencies({
    runtimeFactory: {
      async create(context) {
        runtimeContext = context;
        return {
          async answer(request) {
            receivedRequest = request;
            return answerFor(request);
          }
        };
      }
    }
  }));
  const response = await handler(jsonRequest(
    {userText: 'hello'},
    {vercelOidcToken: 'aaa.bbb.ccc'}
  ));
  assert.equal(response.status, 200);
  assert.equal(runtimeContext.vercelOidcToken, undefined);
  assert.equal(runtimeContext.subjectHash, 'hash');
  assert.equal(receivedRequest.vercelOidcToken, undefined);
  assert.equal(JSON.stringify(await response.json()).includes('aaa.bbb.ccc'), false);
});

test('appends a privacy-minimized audit before returning the answer', async () => {
  let audit;
  const handler = createChatHandler(dependencies({
    auditSink: {async append(record) { audit = record; }},
    runtimeFactory: {
      async create() {
        return {
          async answer(request) {
            return answerFor(request, {
              sources: [{
                id: 'law', title: '00_律法', kind: 'law', priority: 1,
                modifiedAt: '2026-07-29T00:00:00Z', locator: 'drive:private-file-id'
              }],
              conflicts: [{
                key: 'closing_time',
                selected: {key: 'closing_time', value: '03:30', status: 'confirmed', source: {id: 'law', title: 'law', kind: 'law', priority: 1}},
                alternatives: [{key: 'closing_time', value: '04:30', status: 'candidate', source: {id: 'old', title: 'old', kind: 'memory', priority: 9}}],
                reason: 'conflict'
              }],
              modelUsage: {
                model: 'gpt-5.6-terra', responseId: 'resp_private', inputTokens: 100,
                cachedInputTokens: 20, outputTokens: 40, reasoningTokens: 10, totalTokens: 140
              }
            });
          }
        };
      }
    }
  }));
  const response = await handler(jsonRequest(
    {userText: 'private question text', currentLocation: 'private location'},
    {vercelOidcToken: 'aaa.bbb.ccc'}
  ));
  assert.equal(response.status, 200);
  assert.equal(audit.requestId, 'req-test');
  assert.equal(audit.subjectHash, 'hash');
  assert.equal(audit.durationMilliseconds, 123);
  assert.deepEqual(audit.sourceSnapshots, [{sourceId: 'law', modifiedAt: '2026-07-29T00:00:00Z'}]);
  assert.deepEqual(audit.conflictKeys, ['closing_time']);
  assert.equal(audit.modelUsage.totalTokens, 140);
  const serialized = JSON.stringify(audit);
  assert.doesNotMatch(serialized, /private question text|private answer text|private location/);
  assert.doesNotMatch(serialized, /private-file-id|aaa\.bbb\.ccc|03:30|04:30/);
});

test('does not return an untracked answer when audit persistence fails', async () => {
  const handler = createChatHandler(dependencies({
    auditSink: {async append() { throw new Error('audit unavailable'); }}
  }));
  const response = await handler(jsonRequest({userText: 'hello'}));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /private answer text|audit unavailable/);
});

test('returns a grounded YOS answer and security headers', async () => {
  let received;
  const handler = createChatHandler(dependencies({
    runtimeFactory: {
      async create() {
        return {
          async answer(request) {
            received = request;
            return answerFor(request);
          }
        };
      }
    }
  }));
  const response = await handler(jsonRequest({userText: '  hello  '}));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(received.userText, 'hello');
  assert.equal(received.requestId, 'req-test');
  assert.equal(received.currentTime, '2026-07-29T14:00:00.000Z');
  assert.equal((await response.json()).answer, 'private answer text');
});

test('ignores malformed inbound Vercel tokens without leaking them', async () => {
  const handler = createChatHandler(dependencies());
  const response = await handler(jsonRequest({userText: 'hello'}, {vercelOidcToken: 'not-jwt'}));
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(body, /not-jwt/);
});

test('does not leak internal backend errors', async () => {
  const handler = createChatHandler(dependencies({
    runtimeFactory: {async create() { throw new Error('OPENAI_API_KEY=secret'); }}
  }));
  const response = await handler(jsonRequest({userText: 'hello'}));
  const body = await response.text();
  assert.equal(response.status, 503);
  assert.doesNotMatch(body, /secret|OPENAI_API_KEY/);
  assert.match(body, /temporarily unavailable/);
});

test('reports only a fixed safe stage for each fail-closed dependency boundary', async (t) => {
  const cases = [
    {
      stage: 'rate-limit',
      overrides: {
        rateLimiter: {async check() { throw new Error('UPSTASH_REDIS_REST_TOKEN=secret'); }}
      }
    },
    {
      stage: 'runtime-create',
      overrides: {
        runtimeFactory: {async create() { throw new Error('private runtime credential'); }}
      }
    },
    {
      stage: 'answer',
      overrides: {
        runtimeFactory: {
          async create() {
            return {async answer() { throw new Error('OPENAI_API_KEY=secret'); }};
          }
        }
      }
    },
    {
      stage: 'audit',
      overrides: {
        auditSink: {async append() { throw new Error('private audit payload'); }}
      }
    }
  ];

  for (const item of cases) {
    await t.test(item.stage, async () => {
      const events = [];
      const handler = createChatHandler(dependencies({
        ...item.overrides,
        failureReporter(event) { events.push(event); }
      }));
      const response = await handler(jsonRequest({userText: 'private-user-text'}));
      const responseBody = await response.text();
      const serializedEvents = JSON.stringify(events);
      assert.equal(response.status, 503);
      assert.deepEqual(events, [{stage: item.stage, requestId: 'req-test'}]);
      assert.doesNotMatch(serializedEvents, /private-user-text|secret|credential|payload|OPENAI|UPSTASH/);
      assert.doesNotMatch(responseBody, /private-user-text|secret|credential|payload|OPENAI|UPSTASH/);
    });
  }
});
