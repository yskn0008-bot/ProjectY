import test from 'node:test';
import assert from 'node:assert/strict';
import {loadYosStorageConfig} from '../dist/storage/config.js';
import {UpstashAuditSink} from '../dist/storage/upstash-audit.js';
import {UpstashFixedWindowRateLimiter} from '../dist/storage/upstash-rate-limit.js';
import {UpstashRestClient} from '../dist/storage/upstash-rest.js';

test('Upstash REST client sends commands without exposing token in the body', async () => {
  let request;
  const client = new UpstashRestClient({
    url: 'https://example.upstash.io',
    token: 'private-token',
    fetchImpl: async (input, init) => {
      request = {input, init};
      return new Response(JSON.stringify({result: 3}), {status: 200});
    }
  });

  const result = await client.command(['INCR', 'key']);
  assert.equal(result, 3);
  assert.equal(request.input, 'https://example.upstash.io');
  assert.equal(request.init.headers.Authorization, 'Bearer private-token');
  assert.doesNotMatch(request.init.body, /private-token/);
});

test('Upstash REST client rejects service errors without returning the service message', async () => {
  const client = new UpstashRestClient({
    url: 'https://example.upstash.io',
    token: 'private-token',
    fetchImpl: async () => new Response(JSON.stringify({error: 'secret backend detail'}), {status: 200})
  });
  await assert.rejects(() => client.command(['GET', 'key']), /^Error: Upstash command failed$/);
});

test('distributed limiter allows within the window and blocks above the limit', async () => {
  const commands = [];
  const counts = [1, 2, 3];
  const limiter = new UpstashFixedWindowRateLimiter({
    client: {
      async command(command) {
        commands.push(command);
        return counts.shift();
      }
    },
    limit: 2,
    windowSeconds: 3600,
    clock: () => 3_650
  });

  assert.deepEqual(await limiter.check('subject-hash'), {allowed: true, remaining: 1});
  assert.deepEqual(await limiter.check('subject-hash'), {allowed: true, remaining: 0});
  assert.deepEqual(await limiter.check('subject-hash'), {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: 3_550
  });
  assert.equal(commands[0][0], 'EVAL');
  assert.match(commands[0][3], /yos:rate:1:subject-hash/);
});

test('audit sink stores metadata with expiration', async () => {
  let command;
  const sink = new UpstashAuditSink({
    client: {async command(value) { command = value; return 'OK'; }},
    retentionSeconds: 3600
  });
  await sink.append({
    schemaVersion: '1.0',
    requestId: 'req-1',
    createdAt: '2026-07-30T00:00:00.000Z',
    subjectHash: 'hash',
    domain: 'yos',
    relatedDomains: [],
    liveMode: false,
    sourceSnapshots: [{sourceId: '00_law'}],
    conflictKeys: [],
    unknownCount: 0,
    memoryCandidateCount: 0,
    safetyLevel: 'normal',
    durationMilliseconds: 10
  });

  assert.equal(command[0], 'SETEX');
  assert.equal(command[1], 'yos:audit:req-1');
  assert.equal(command[2], 3600);
  assert.doesNotMatch(command[3], /userText|currentLocation|conversationSummary|answer/);
});

test('storage config requires HTTPS Upstash settings and bounds retention', () => {
  const config = loadYosStorageConfig({
    UPSTASH_REDIS_REST_URL: 'https://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'token',
    YOS_AUDIT_RETENTION_DAYS: '14'
  });
  assert.equal(config.auditRetentionSeconds, 14 * 24 * 60 * 60);
  assert.throws(() => loadYosStorageConfig({
    UPSTASH_REDIS_REST_URL: 'http://example.upstash.io',
    UPSTASH_REDIS_REST_TOKEN: 'token'
  }), /exact HTTPS origin/);
});
