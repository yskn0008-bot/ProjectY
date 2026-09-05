import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
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

test('Google WIF uses the Vercel project configured default audience', () => {
  const oidcSource = readFileSync(new URL('../src/auth/vercel-oidc.ts', import.meta.url), 'utf8');
  const googleSource = readFileSync(new URL('../src/auth/google-runtime.ts', import.meta.url), 'utf8');
  assert.match(oidcSource, /getVercelOidcToken\(\)/u);
  assert.doesNotMatch(oidcSource, /getVercelOidcToken\(\{\s*audience/u);
  assert.match(googleSource, /requireVercelOidcToken\(\)/u);
  assert.doesNotMatch(googleSource, /requireVercelOidcToken\(audience\)/u);
});
