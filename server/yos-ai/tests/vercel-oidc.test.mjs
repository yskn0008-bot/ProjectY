import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVercelOidcToken
} from '../dist/auth/vercel-oidc.js';

test('accepts a compact JWT-shaped Vercel token', () => {
  assert.equal(validateVercelOidcToken(' aaa.bbb.ccc '), 'aaa.bbb.ccc');
});

test('rejects missing, malformed and oversized Vercel tokens', () => {
  assert.throws(() => validateVercelOidcToken(''), /required/);
  assert.throws(() => validateVercelOidcToken('not-jwt'), /format/);
  assert.throws(() => validateVercelOidcToken(`a.${'b'.repeat(8192)}.c`), /too large/);
});
