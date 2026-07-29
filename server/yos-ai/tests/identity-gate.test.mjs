import test from 'node:test';
import assert from 'node:assert/strict';
import { IdentityGate, sha256Base64Url } from '../dist/auth/identity-gate.js';

const now = 1_800_000_000;
const validIdentity = {
  subject: 'google-subject-123',
  audience: 'yos-client',
  issuer: 'https://accounts.google.com',
  expiresAt: now + 3600,
  issuedAt: now - 60,
  emailVerified: true
};

async function gate(overrides = {}) {
  return new IdentityGate({
    expectedAudience: 'yos-client',
    allowedSubjectHash: await sha256Base64Url(validIdentity.subject),
    clock: () => now,
    ...overrides
  });
}

test('authorizes the configured Google subject', async () => {
  const result = await (await gate()).authorize(validIdentity);
  assert.equal(result.subjectHash, await sha256Base64Url(validIdentity.subject));
});

test('rejects a different Google subject', async () => {
  await assert.rejects(() => (async () => (await gate()).authorize({ ...validIdentity, subject: 'other' }))(), /not authorized/);
});

test('rejects wrong audience and issuer', async () => {
  await assert.rejects(() => (async () => (await gate()).authorize({ ...validIdentity, audience: 'other' }))(), /audience/);
  await assert.rejects(() => (async () => (await gate()).authorize({ ...validIdentity, issuer: 'https://evil.example' }))(), /issuer/);
});

test('rejects expired and future-issued tokens', async () => {
  await assert.rejects(() => (async () => (await gate()).authorize({ ...validIdentity, expiresAt: now - 61 }))(), /expired/);
  await assert.rejects(() => (async () => (await gate()).authorize({ ...validIdentity, issuedAt: now + 61 }))(), /future/);
});

test('can require verified email without using email as identity', async () => {
  await assert.rejects(() => (async () => (await gate({ requireEmailVerified: true })).authorize({ ...validIdentity, emailVerified: false }))(), /not verified/);
});
