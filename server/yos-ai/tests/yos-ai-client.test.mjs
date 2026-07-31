import test from 'node:test';
import assert from 'node:assert/strict';
import {YosAiClient, YosAiHttpError} from '../dist/client/yos-ai-client.js';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json; charset=utf-8', ...headers}
  });
}

test('client rejects insecure production base URLs and embedded credentials', () => {
  assert.throws(() => new YosAiClient({
    baseUrl: 'http://yos.example',
    getGoogleIdToken: async () => 'token'
  }), /HTTPS/u);
  assert.throws(() => new YosAiClient({
    baseUrl: 'https://user:pass@yos.example',
    getGoogleIdToken: async () => 'token'
  }), /credentials/u);
});

test('chat requests a fresh Google ID token and never enables cookies', async () => {
  const calls = [];
  let tokenCalls = 0;
  const client = new YosAiClient({
    baseUrl: 'https://api.example/yos/',
    getGoogleIdToken: async () => `google-token-${++tokenCalls}`,
    fetchImpl: async (input, init) => {
      calls.push({url: String(input), init});
      return json({answer: 'ok'});
    }
  });

  await client.chat({userText: '質問1'});
  await client.chat({userText: '質問2'});

  assert.equal(tokenCalls, 2);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://api.example/api/yos/chat');
  assert.equal(calls[0].init.credentials, 'omit');
  assert.equal(calls[0].init.cache, 'no-store');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer google-token-1');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer google-token-2');
  assert.deepEqual(JSON.parse(calls[0].init.body), {userText: '質問1'});
});

test('chat maps rate limits to a typed error with retry metadata', async () => {
  const client = new YosAiClient({
    baseUrl: 'https://api.example',
    getGoogleIdToken: async () => 'google-token',
    fetchImpl: async () => json(
      {error: 'Rate limit exceeded', requestId: 'request-1'},
      429,
      {'Retry-After': '45'}
    )
  });

  await assert.rejects(
    client.chat({userText: '質問'}),
    (error) => {
      assert.ok(error instanceof YosAiHttpError);
      assert.equal(error.status, 429);
      assert.equal(error.kind, 'rate-limit');
      assert.equal(error.requestId, 'request-1');
      assert.equal(error.retryAfterSeconds, 45);
      return true;
    }
  );
});

test('nav model refresh uses the explicit refresh query without authentication', async () => {
  let captured;
  const client = new YosAiClient({
    baseUrl: 'https://api.example',
    getGoogleIdToken: async () => {
      throw new Error('must not be called');
    },
    fetchImpl: async (input, init) => {
      captured = {url: String(input), init};
      return json({version: '3.0-imada-v47'});
    }
  });

  const result = await client.navModel({refresh: true});
  assert.equal(result.version, '3.0-imada-v47');
  assert.equal(captured.url, 'https://api.example/api/yos/nav-model?refresh=1');
  assert.equal(captured.init.method, 'GET');
  assert.equal(captured.init.headers, undefined);
});

test('taxi duplicate response is treated as an idempotent success', async () => {
  let captured;
  const client = new YosAiClient({
    baseUrl: 'https://api.example',
    getGoogleIdToken: async () => 'unused',
    fetchImpl: async (input, init) => {
      captured = {url: String(input), init};
      return json({ok: true, duplicate: true, eventId: 'event-1'}, 409);
    }
  });

  const result = await client.recordTaxiEvent({
    version: 1,
    eventId: 'event-1',
    businessDate: '2026-07-31',
    fare: 1200,
    tip: 0,
    distance: 3.2,
    durationMs: 600000,
    waitMs: 0
  }, 'ephemeral-sync-token');

  assert.equal(result.duplicate, true);
  assert.equal(captured.init.headers.Authorization, 'Bearer ephemeral-sync-token');
});

test('client converts network and timeout failures to generic unavailable errors', async () => {
  const networkClient = new YosAiClient({
    baseUrl: 'https://api.example',
    getGoogleIdToken: async () => 'token',
    fetchImpl: async () => {
      throw new Error('private network detail');
    }
  });

  await assert.rejects(
    networkClient.health(),
    (error) => error instanceof YosAiHttpError
      && error.kind === 'unavailable'
      && !error.message.includes('private network detail')
  );
});

test('client rejects non-JSON and oversized responses', async () => {
  const htmlClient = new YosAiClient({
    baseUrl: 'https://api.example',
    getGoogleIdToken: async () => 'token',
    fetchImpl: async () => new Response('<html>private</html>', {
      status: 502,
      headers: {'Content-Type': 'text/html'}
    })
  });
  await assert.rejects(htmlClient.health(), (error) => error instanceof YosAiHttpError && error.kind === 'unexpected');

  const largeClient = new YosAiClient({
    baseUrl: 'https://api.example',
    getGoogleIdToken: async () => 'token',
    maxResponseBytes: 1024,
    fetchImpl: async () => json({value: 'x'.repeat(2000)})
  });
  await assert.rejects(largeClient.health(), /too large/u);
});
