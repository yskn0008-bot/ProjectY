import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAuthLibraryVerifier } from '../dist/auth/google-auth-library-verifier.js';

test('delegates cryptographic verification to Google Auth Library client', async () => {
  let seen;
  const client = {
    async verifyIdToken(options) {
      seen = options;
      return {
        getPayload() {
          return {
            sub: 'subject',
            aud: 'client',
            iss: 'accounts.google.com',
            exp: 1_900_000_000,
            iat: 1_800_000_000,
            email_verified: true
          };
        }
      };
    }
  };
  const verifier = new GoogleAuthLibraryVerifier(client, 'client');
  const identity = await verifier.verify('id-token');
  assert.deepEqual(seen, { idToken: 'id-token', audience: 'client' });
  assert.equal(identity.subject, 'subject');
  assert.equal(identity.emailVerified, true);
});

test('rejects incomplete Google payloads', async () => {
  const verifier = new GoogleAuthLibraryVerifier({
    async verifyIdToken() { return { getPayload: () => ({ sub: 'subject' }) }; }
  }, 'client');
  await assert.rejects(() => verifier.verify('id-token'), /incomplete/);
});
