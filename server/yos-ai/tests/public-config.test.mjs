import assert from 'node:assert/strict';
import test from 'node:test';
import handler from '../api/yos/public-config.mjs';

const origin = 'https://yskn0008-bot.github.io';

async function withEnvironment(values, run) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try {
    await run();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('returns only the public Google client ID to an allowed PWA origin', async () => {
  await withEnvironment({
    YOS_ALLOWED_ORIGINS: origin,
    GOOGLE_CLIENT_ID: '123456789-yos.apps.googleusercontent.com',
    OPENAI_API_KEY: 'must-not-leak'
  }, async () => {
    const response = await handler.fetch(new Request('https://api.example/api/yos/public-config', {
      headers: { Origin: origin }
    }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json();
    assert.deepEqual(body, { googleClientId: '123456789-yos.apps.googleusercontent.com' });
    assert.doesNotMatch(JSON.stringify(body), /must-not-leak/u);
  });
});

test('fails closed for an untrusted origin or missing client configuration', async () => {
  await withEnvironment({
    YOS_ALLOWED_ORIGINS: origin,
    GOOGLE_CLIENT_ID: '123456789-yos.apps.googleusercontent.com'
  }, async () => {
    const denied = await handler.fetch(new Request('https://api.example/api/yos/public-config', {
      headers: { Origin: 'https://evil.example' }
    }));
    assert.equal(denied.status, 403);
  });

  await withEnvironment({ YOS_ALLOWED_ORIGINS: origin, GOOGLE_CLIENT_ID: '' }, async () => {
    const unavailable = await handler.fetch(new Request('https://api.example/api/yos/public-config', {
      headers: { Origin: origin }
    }));
    assert.equal(unavailable.status, 503);
  });
});
