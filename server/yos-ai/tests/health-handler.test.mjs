import test from 'node:test';
import assert from 'node:assert/strict';
import { createHealthHandler } from '../dist/api/health-handler.js';

const origin = 'https://yos.example';

test('health response exposes no secrets or source identifiers', async () => {
  const handler = createHealthHandler({
    allowedOrigins: [origin],
    version: '0.1.0',
    clock: () => '2026-07-29T23:00:00.000Z'
  });
  const response = await handler(new Request('https://api.example/api/yos/health', {
    headers: { origin }
  }));
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.match(text, /"status":"ok"/);
  assert.doesNotMatch(text, /API_KEY|DOCUMENT_ID|SPREADSHEET_ID/);
});

test('health rejects unknown origins and methods', async () => {
  const handler = createHealthHandler({ allowedOrigins: [origin] });
  const denied = await handler(new Request('https://api.example/api/yos/health', {
    headers: { origin: 'https://evil.example' }
  }));
  assert.equal(denied.status, 403);

  const method = await handler(new Request('https://api.example/api/yos/health', {
    method: 'POST', headers: { origin }
  }));
  assert.equal(method.status, 405);
});
