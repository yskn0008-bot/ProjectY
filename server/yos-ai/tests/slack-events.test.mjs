import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createSlackEventsHandler} from '../dist/slack-events/handler.js';

const signingSecret = 'test-signing-secret-not-a-production-value';
const botToken = 'test-bot-token-not-a-production-value';
const now = 1_789_000_000_000;
const timestamp = String(now / 1_000);

function makeRedis() {
  const state = new Map();
  return {
    state,
    client: {
      async command(command) {
        const [name, key, value] = command;
        if (name === 'SET' && command.includes('NX')) {
          if (state.has(key)) return null;
          state.set(key, value);
          return 'OK';
        }
        if (name === 'SET') { state.set(key, value); return 'OK'; }
        if (name === 'GET') return state.get(key) ?? null;
        if (name === 'DEL') return state.delete(key) ? 1 : 0;
        throw new Error(`Unexpected command: ${name}`);
      }
    }
  };
}

function signedRequest(payload, requestTimestamp = timestamp, secret = signingSecret) {
  const body = JSON.stringify(payload);
  const signature = `v0=${createHmac('sha256', secret).update(`v0:${requestTimestamp}:${body}`).digest('hex')}`;
  return new Request('https://example.com/api/yos/slack-events', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Slack-Request-Timestamp': requestTimestamp, 'X-Slack-Signature': signature},
    body
  });
}

function eventPayload(overrides = {}) {
  return {
    type: 'event_callback', event_id: 'Ev-0911-001', team_id: 'T-YOS',
    event: {type: 'message', channel: 'C0C0RU43TPA', ts: '1789000000.123456', text: ' 原文を完全保持\n二行目 ', ...overrides}
  };
}

function setup({processor} = {}) {
  const redis = makeRedis();
  const jobs = [];
  const captures = [];
  const slackBodies = [];
  const handler = createSlackEventsHandler({
    signingSecret, botToken, redis: redis.client, now: () => now,
    waitUntil: (job) => jobs.push(job),
    processor: processor ?? {async process(input) { captures.push(input); return {duplicate: false}; }},
    fetchImpl: async (_url, init) => { slackBodies.push(JSON.parse(init.body)); return Response.json({ok: true}); }
  });
  return {handler, redis, jobs, captures, slackBodies};
}

test('Slack url_verification returns its challenge after signature verification', async () => {
  const {handler, jobs} = setup();
  const response = await handler(signedRequest({type: 'url_verification', challenge: 'challenge-value'}));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {challenge: 'challenge-value'});
  assert.equal(jobs.length, 0);
});

test('Slack intake rejects an invalid signature', async () => {
  const {handler} = setup();
  assert.equal((await handler(signedRequest(eventPayload(), timestamp, 'wrong-secret'))).status, 401);
});

test('Slack intake rejects stale timestamps to prevent replay', async () => {
  const {handler} = setup();
  assert.equal((await handler(signedRequest(eventPayload(), String(Number(timestamp) - 301)))).status, 401);
});

test('Slack intake ignores other channels, bot posts, and subtype messages', async () => {
  for (const override of [{channel: 'C-OTHER'}, {bot_id: 'B123'}, {subtype: 'message_changed'}]) {
    const {handler, jobs} = setup();
    const response = await handler(signedRequest(eventPayload(override)));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).ignored, true);
    assert.equal(jobs.length, 0);
  }
});

test('Slack ACK does not await Raw-first processing and preserves exact original text', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const captures = [];
  const {handler, jobs, slackBodies} = setup({processor: {async process(input) { captures.push(input); await pending; return {duplicate: false}; }}});
  const response = await handler(signedRequest(eventPayload()));
  assert.equal(response.status, 200);
  assert.equal(jobs.length, 1);
  release();
  await jobs[0];
  assert.equal(captures[0].rawText, ' 原文を完全保持\n二行目 ');
  assert.match(captures[0].captureId, /^slack-[a-f0-9]{64}$/u);
  assert.deepEqual(slackBodies, [{channel: 'C0C0RU43TPA', thread_ts: '1789000000.123456', text: 'YOS processed'}]);
});

test('duplicate Slack delivery processes and marks the thread only once', async () => {
  const setupResult = setup();
  await setupResult.handler(signedRequest(eventPayload()));
  await setupResult.jobs[0];
  await setupResult.handler(signedRequest(eventPayload()));
  await setupResult.jobs[1];
  assert.equal(setupResult.captures.length, 1);
  assert.equal(setupResult.slackBodies.length, 1);
});

test('failed Slack processing releases its event claim for retry', async () => {
  const {handler, jobs, redis} = setup({processor: {async process() { throw new Error('downstream unavailable'); }}});
  await handler(signedRequest(eventPayload()));
  await assert.rejects(jobs[0], /downstream unavailable/u);
  assert.equal(redis.state.has('yos:slack:event:v1:Ev-0911-001'), false);
});

test('duplicate Raw can repair a missing processed marker', async () => {
  const {handler, jobs, slackBodies} = setup({processor: {async process() { return {duplicate: true}; }}});
  await handler(signedRequest(eventPayload()));
  await jobs[0];
  assert.deepEqual(slackBodies, [{channel: 'C0C0RU43TPA', thread_ts: '1789000000.123456', text: 'YOS processed'}]);
});
