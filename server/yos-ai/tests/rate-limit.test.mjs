import test from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryFixedWindowRateLimiter } from '../dist/rate-limit.js';

test('limits requests per subject within a fixed window', async () => {
  let now = 1000;
  const limiter = new InMemoryFixedWindowRateLimiter({ limit: 2, windowSeconds: 60, clock: () => now });
  assert.equal((await limiter.check('subject')).allowed, true);
  assert.equal((await limiter.check('subject')).allowed, true);
  const blocked = await limiter.check('subject');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSeconds, 60);
  now += 60;
  assert.equal((await limiter.check('subject')).allowed, true);
});

test('keeps limits separate by subject', async () => {
  const limiter = new InMemoryFixedWindowRateLimiter({ limit: 1, windowSeconds: 60, clock: () => 1000 });
  assert.equal((await limiter.check('a')).allowed, true);
  assert.equal((await limiter.check('b')).allowed, true);
});
