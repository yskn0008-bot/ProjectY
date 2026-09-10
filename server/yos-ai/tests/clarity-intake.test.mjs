import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createClarityIntakeHandler} from '../dist/intake/handler.js';

const token = 'clarity-test-token-0123456789';
const tokenSha256 = createHash('sha256').update(token).digest('hex');
const notionPageId = '01234567-89ab-cdef-0123-456789abcdef';

function makeRedis() {
  const state = new Map();
  const commands = [];
  return {
    state,
    commands,
    client: {
      async command(command) {
        commands.push(command);
        const [name, key, value] = command;
        if (name === 'SET' && command.includes('NX')) {
          if (state.has(key)) return null;
          state.set(key, value);
          return 'OK';
        }
        if (name === 'SET') {
          state.set(key, value);
          return 'OK';
        }
        if (name === 'GET') return state.get(key) ?? null;
        if (name === 'DEL') return state.delete(key) ? 1 : 0;
        throw new Error(`Unexpected command: ${name}`);
      }
    }
  };
}

function request(body, authorization = `Bearer ${token}`) {
  return new Request('https://example.com/api/yos/intake', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

const validBody = {
  rawText: '7日19時までに10000円返済',
  capturedAt: '2026-09-07T17:00:00+09:00',
  inputMode: 'text',
  source: 'clarity',
  captureId: 'clarity-20260907-170000-0001'
};

test('Clarity intake appends raw text to Notion and marks idempotency complete', async () => {
  const redis = makeRedis();
  let notionRequest;
  const handler = createClarityIntakeHandler({
    tokenSha256,
    notionToken: 'secret-notion-token',
    notionPageId,
    redis: redis.client,
    fetchImpl: async (input, init) => {
      notionRequest = {input, init};
      return new Response(JSON.stringify({object: 'list'}), {status: 200});
    }
  });

  const response = await handler(request(validBody));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    ok: true,
    captureId: validBody.captureId,
    duplicate: false
  });
  assert.equal(notionRequest.input, `https://api.notion.com/v1/blocks/${notionPageId}/children`);
  assert.equal(notionRequest.init.headers.Authorization, 'Bearer secret-notion-token');
  assert.doesNotMatch(notionRequest.init.body, /secret-notion-token/u);
  assert.match(notionRequest.init.body, /7日19時までに10000円返済/u);
  assert.equal(redis.state.get(`yos:intake:clarity:v1:${validBody.captureId}`), 'done');
});

test('Clarity intake rejects an invalid bearer token before Notion or Redis writes', async () => {
  const redis = makeRedis();
  let notionCalls = 0;
  const handler = createClarityIntakeHandler({
    tokenSha256,
    notionToken: 'secret-notion-token',
    notionPageId,
    redis: redis.client,
    fetchImpl: async () => {
      notionCalls += 1;
      return new Response('{}', {status: 200});
    }
  });

  const response = await handler(request(validBody, 'Bearer definitely-wrong-token-1234'));
  assert.equal(response.status, 401);
  assert.equal(redis.commands.length, 0);
  assert.equal(notionCalls, 0);
});

test('Clarity intake returns duplicate success without appending twice when capture is done', async () => {
  const redis = makeRedis();
  redis.state.set(`yos:intake:clarity:v1:${validBody.captureId}`, 'done');
  let notionCalls = 0;
  const handler = createClarityIntakeHandler({
    tokenSha256,
    notionToken: 'secret-notion-token',
    notionPageId,
    redis: redis.client,
    fetchImpl: async () => {
      notionCalls += 1;
      return new Response('{}', {status: 200});
    }
  });

  const response = await handler(request(validBody));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    captureId: validBody.captureId,
    duplicate: true
  });
  assert.equal(notionCalls, 0);
});

test('Clarity intake clears processing claim when Notion append fails so retry remains possible', async () => {
  const redis = makeRedis();
  const handler = createClarityIntakeHandler({
    tokenSha256,
    notionToken: 'secret-notion-token',
    notionPageId,
    redis: redis.client,
    fetchImpl: async () => new Response('failed', {status: 503})
  });

  const response = await handler(request(validBody));
  assert.equal(response.status, 503);
  assert.equal(redis.state.has(`yos:intake:clarity:v1:${validBody.captureId}`), false);
});

test('Clarity intake validates raw input and content type before external writes', async () => {
  const redis = makeRedis();
  const handler = createClarityIntakeHandler({
    tokenSha256,
    notionToken: 'secret-notion-token',
    notionPageId,
    redis: redis.client,
    fetchImpl: async () => new Response('{}', {status: 200})
  });

  const invalid = await handler(request({...validBody, rawText: '   '}));
  assert.equal(invalid.status, 400);
  assert.equal(redis.commands.length, 0);

  const wrongContentType = new Request('https://example.com/api/yos/intake', {
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain'},
    body: JSON.stringify(validBody)
  });
  assert.equal((await handler(wrongContentType)).status, 415);
});
