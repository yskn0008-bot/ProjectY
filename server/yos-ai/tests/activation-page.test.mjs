import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../public/activate.html', import.meta.url), 'utf8');

test('activation page generates a 256-bit token locally', () => {
  assert.match(html, /new Uint8Array\(32\)/u);
  assert.match(html, /crypto\.getRandomValues/u);
  assert.match(html, /crypto\.subtle\.digest\('SHA-256'/u);
});

test('activation page does not transmit or persist secrets', () => {
  assert.doesNotMatch(html, /\bfetch\s*\(/u);
  assert.doesNotMatch(html, /XMLHttpRequest/u);
  assert.doesNotMatch(html, /localStorage/u);
  assert.doesNotMatch(html, /sessionStorage/u);
  assert.doesNotMatch(html, /<script[^>]+src=/u);
  assert.doesNotMatch(html, /<form\b/u);
});

test('activation page explains token and hash separation', () => {
  assert.match(html, /YOS_TAXI_SYNC_TOKEN_SHA256/u);
  assert.match(html, /元のトークンはVercelへ入れません/u);
  assert.match(html, /\/api\/yos\/taxi-health/u);
});
