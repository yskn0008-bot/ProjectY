import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createNotionMirrorHandler} from '../dist/intake/mirror-handler.js';

const token = 'clarity-test-token-0123456789';
const tokenSha256 = createHash('sha256').update(token).digest('hex');
const notionDataSourceId = '01234567-89ab-cdef-0123-456789abcdef';

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
  return new Request('https://example.com/api/yos/intake?mode=mirror', {
    method: 'POST',
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

function body(eventId = 'clarity-op-20261003-001') {
  return {
    eventId,
    syncedAt: '2026-10-03T00:30:00+09:00',
    source: 'clarity',
    items: [{
      syncKey: 'calendar:event:abc123',
      title: '歯医者',
      area: 'Life',
      priority: 'P1',
      status: '待ち',
      kind: 'Task',
      owner: '陽介',
      nextAction: '明日15時に予定',
      blocker: null,
      sourceRef: 'Apple Calendar:event:abc123',
      actionUrl: 'calshow:123456',
      dueAt: '2026-10-04T15:00:00+09:00'
    }]
  };
}

test('Notion mirror creates a new row and stores its stable mapping', async () => {
  const redis = makeRedis();
  const calls = [];
  const handler = createNotionMirrorHandler({
    tokenSha256,
    notionToken: 'secret-notion-token',
    notionDataSourceId,
    redis: redis.client,
    fetchImpl: async (input, init) => {
      calls.push({input: String(input), init});
      if (String(input).includes('/data_sources/')) return Response.json({results: []});
      if (String(input) === 'https://api.notion.com/v1/pages' && init.method === 'POST') {
        return Response.json({id: 'notion-page-1'});
      }
      throw new Error('Unexpected Notion request');
    }
  });

  const response = await handler(request(body()));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    ok: true,
    eventId: 'clarity-op-20261003-001',
    duplicate: false,
    updated: 1
  });
  assert.equal(calls.length, 2);
  assert.match(calls[0].input, /data_sources\/01234567-89ab-cdef-0123-456789abcdef\/query/u);
  assert.equal(calls[1].input, 'https://api.notion.com/v1/pages');
  assert.match(calls[1].init.body, /calendar:event:abc123/u);
  assert.equal(calls[1].init.headers['Notion-Version'], '2026-03-11');
  assert.doesNotMatch(calls[1].init.body, /secret-notion-token/u);
  assert.equal(redis.state.get('yos:notion:mirror:v1:item:calendar:event:abc123'), 'notion-page-1');
  assert.equal(redis.state.get('yos:notion:mirror:v1:event:clarity-op-20261003-001'), 'done');
});

test('Notion mirror updates the mapped row instead of creating a duplicate', async () => {
  const redis = makeRedis();
  redis.state.set('yos:notion:mirror:v1:item:calendar:event:abc123', 'notion-page-1');
  const calls = [];
  const handler = createNotionMirrorHandler({
    tokenSha256,
    notionToken: 'secret-notion-token',
    notionDataSourceId,
    redis: redis.client,
    fetchImpl: async (input, init) => {
      calls.push({input: String(input), init});
      return Response.json({id: 'notion-page-1'});
    }
  });

  const response = await handler(request(body('clarity-op-20261003-002')));
  assert.equal(response.status, 201);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, 'https://api.notion.com/v1/pages/notion-page-1');
  assert.equal(calls[0].init.method, 'PATCH');
});

test('Notion mirror treats the same completed event as duplicate without external writes', async () => {
  const redis = makeRedis();
  redis.state.set('yos:notion:mirror:v1:event:clarity-op-20261003-001', 'done');
  let calls = 0;
  const handler = createNotionMirrorHandler({
    tokenSha256,
    notionToken: 'secret-notion-token',
    notionDataSourceId,
    redis: redis.client,
    fetchImpl: async () => {
      calls += 1;
      return Response.json({});
    }
  });

  const response = await handler(request(body()));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    eventId: 'clarity-op-20261003-001',
    duplicate: true,
    updated: 0
  });
  assert.equal(calls, 0);
});

test('Notion mirror clears the event claim after Notion failure so retry stays possible', async () => {
  const redis = makeRedis();
  const handler = createNotionMirrorHandler({
    tokenSha256,
    notionToken: 'secret-notion-token',
    notionDataSourceId,
    redis: redis.client,
    fetchImpl: async () => new Response('failed', {status: 503})
  });

  const response = await handler(request(body()));
  assert.equal(response.status, 503);
  assert.equal(redis.state.has('yos:notion:mirror:v1:event:clarity-op-20261003-001'), false);
});

test('Notion mirror rejects invalid auth and invalid enum values before writes', async () => {
  const redis = makeRedis();
  let calls = 0;
  const handler = createNotionMirrorHandler({
    tokenSha256,
    notionToken: 'secret-notion-token',
    notionDataSourceId,
    redis: redis.client,
    fetchImpl: async () => {
      calls += 1;
      return Response.json({});
    }
  });

  assert.equal((await handler(request(body(), 'Bearer wrong-token-but-long-enough-1234'))).status, 401);
  const invalid = body('clarity-op-20261003-003');
  invalid.items[0].status = 'whatever';
  assert.equal((await handler(request(invalid))).status, 400);
  assert.equal(calls, 0);
});
