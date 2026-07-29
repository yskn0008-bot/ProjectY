import test from 'node:test';
import assert from 'node:assert/strict';
import { GoogleAuthAccessTokenProvider } from '../dist/sources/access-token-provider.js';

test('normalizes Google Auth Library access tokens', async () => {
  const stringProvider = new GoogleAuthAccessTokenProvider({ async getAccessToken() { return 'token-a'; } });
  assert.equal(await stringProvider.getAccessToken(), 'token-a');

  const objectProvider = new GoogleAuthAccessTokenProvider({ async getAccessToken() { return { token: 'token-b' }; } });
  assert.equal(await objectProvider.getAccessToken(), 'token-b');
});

test('rejects missing Google access tokens', async () => {
  const provider = new GoogleAuthAccessTokenProvider({ async getAccessToken() { return null; } });
  await assert.rejects(() => provider.getAccessToken(), /unavailable/);
});
