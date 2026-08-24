import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const contract = JSON.parse(readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'));

test('OpenAPI contract identifies YOS AI v0.4', () => {
  assert.equal(contract.openapi, '3.1.0');
  assert.equal(contract.info.title, 'YOS AI API');
  assert.equal(contract.info.version, '0.4.0');
});

test('OpenAPI contract exposes only the five supported paths', () => {
  assert.deepEqual(Object.keys(contract.paths).sort(), [
    '/api/yos/chat',
    '/api/yos/health',
    '/api/yos/nav-model',
    '/api/yos/public-config',
    '/api/yos/taxi-event'
  ]);
  assert.ok(contract.paths['/api/yos/chat'].post);
  assert.ok(contract.paths['/api/yos/health'].get);
  assert.ok(contract.paths['/api/yos/nav-model'].get);
  assert.ok(contract.paths['/api/yos/public-config'].get);
  assert.ok(contract.paths['/api/yos/taxi-event'].post);
});

test('OpenAPI contract preserves authentication and input limits', () => {
  assert.deepEqual(contract.paths['/api/yos/chat'].post.security, [{googleIdToken: []}]);
  assert.deepEqual(contract.paths['/api/yos/taxi-event'].post.security, [{taxiSyncToken: []}]);
  const chat = contract.components.schemas.ChatRequest;
  assert.equal(chat.properties.userText.maxLength, 10_000);
  assert.equal(chat.properties.currentLocation.maxLength, 300);
  assert.equal(chat.properties.conversationSummary.maxLength, 12_000);
  assert.equal(chat.additionalProperties, false);
});

test('OpenAPI contract documents fail-closed errors without secret values', () => {
  const chatResponses = contract.paths['/api/yos/chat'].post.responses;
  for (const status of ['400', '401', '403', '405', '413', '415', '429', '503']) {
    assert.ok(chatResponses[status], `missing chat response ${status}`);
  }
  const serialized = JSON.stringify(contract);
  assert.doesNotMatch(serialized, /sk-[A-Za-z0-9_-]{12,}/u);
  assert.doesNotMatch(serialized, /Bearer\s+[A-Za-z0-9._~-]{12,}/u);
  assert.doesNotMatch(serialized, /-----BEGIN (?:RSA |EC |)PRIVATE KEY-----/u);
});
