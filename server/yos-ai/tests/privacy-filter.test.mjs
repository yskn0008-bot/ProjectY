import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText } from '../dist/privacy-filter.js';

test('blocks L4 documents entirely', () => {
  const result = sanitizeText('secret', 'L4');
  assert.equal(result.blocked, true);
  assert.equal(result.content, '');
});

test('redacts API keys from allowed documents', () => {
  const result = sanitizeText('key=sk-abcdefghijklmnopqrstuvwxyz123456', 'L2');
  assert.equal(result.blocked, false);
  assert.match(result.content, /REDACTED/);
  assert.doesNotMatch(result.content, /sk-abcdefghijklmnopqrstuvwxyz123456/);
});
