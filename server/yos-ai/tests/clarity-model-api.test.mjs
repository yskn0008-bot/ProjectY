import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import {handleClarityModel} from '../api/yos/intake.mjs';

const token = 'clarity-test-token-1234567890';
const hash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');

function request(auth = `Bearer ${token}`, body = {prompt: 'test prompt'}) {
  return new Request('https://example.test/api/yos/intake?mode=model', {
    method: 'POST',
    headers: {Authorization: auth, 'Content-Type': 'application/json'},
    body: JSON.stringify(body)
  });
}

function validResult(overrides = {}) {
  const executor = overrides.executor || 'shopping';
  const domain = executor === 'idea' ? 'idea' : executor === 'calendar' || executor === 'reminder' ? 'life' : 'shopping';
  const dateTime = executor === 'calendar' || executor === 'reminder' ? '2026-09-16T15:00:00+09:00' : '';
  const endDateTime = executor === 'calendar' ? '2026-09-16T16:00:00+09:00' : '';
  return {
    request_id: '123456',
    original_input: '明日3時に歯医者。帰りにトマト買う。棚のアイデアを残す。',
    context: {current_time: '2026-09-15T23:00:00+09:00', current_priorities: [], relevant_state: {}},
    interpretation: {objective: '入力内容を記録する', domains: [domain], urgency: 'scheduled', risk: 'low', confidence: 0.98},
    actions: [{
      id: 'a1', executor, domain,
      intent: executor === 'shopping' ? 'remember' : executor === 'reminder' ? 'notify' : 'create',
      target: '', content: overrides.content || 'トマト', conditions: [],
      destination: executor === 'shopping' ? 'Shopping' : executor === 'calendar' ? 'Calendar' : executor === 'reminder' ? 'Reminders' : 'Idea in Box',
      requires_confirmation: false, external_write: false, needs_review: false,
      dependency: null, status: 'planned', date_time: dateTime, end_date_time: endDateTime
    }],
    watches: [],
    feedback: {summary: '', next_action: '', whisper_line: ''}
  };
}

async function withEnv(fn) {
  const before = {token: process.env.YOS_CLARITY_INTAKE_TOKEN_SHA256, key: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL};
  const oldFetch = globalThis.fetch;
  process.env.YOS_CLARITY_INTAKE_TOKEN_SHA256 = hash;
  process.env.OPENAI_API_KEY = 'test-key-never-sent-to-client';
  process.env.OPENAI_MODEL = 'test-model';
  try { await fn(); }
  finally {
    globalThis.fetch = oldFetch;
    if (before.token === undefined) delete process.env.YOS_CLARITY_INTAKE_TOKEN_SHA256; else process.env.YOS_CLARITY_INTAKE_TOKEN_SHA256 = before.token;
    if (before.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before.key;
    if (before.model === undefined) delete process.env.OPENAI_MODEL; else process.env.OPENAI_MODEL = before.model;
  }
}

test('rejects missing bearer token without contacting OpenAI', async () => {
  await withEnv(async () => {
    let called = false;
    globalThis.fetch = async () => { called = true; throw new Error('must not call'); };
    const response = await handleClarityModel(request(''));
    assert.equal(response.status, 401);
    assert.equal(called, false);
  });
});

test('uses strict Structured Outputs and returns validated JSON as text', async () => {
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async (url, init) => {
      calls += 1;
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(init.headers.Authorization, 'Bearer test-key-never-sent-to-client');
      const sent = JSON.parse(init.body);
      assert.equal(sent.input, 'test prompt');
      assert.equal(sent.store, false);
      assert.equal(sent.model, 'test-model');
      assert.equal(sent.text.format.type, 'json_schema');
      assert.equal(sent.text.format.strict, true);
      assert.equal(sent.text.format.name, 'clarity_action_plan');
      assert.equal(sent.text.format.schema.additionalProperties, false);
      assert.deepEqual(sent.text.format.schema.properties.actions.items.properties.status.enum, ['planned']);
      return Response.json({output_text: JSON.stringify(validResult())});
    };
    const response = await handleClarityModel(request());
    assert.equal(response.status, 200);
    assert.equal(calls, 1);
    assert.match(response.headers.get('content-type') || '', /^text\/plain/u);
    const body = JSON.parse(await response.text());
    assert.equal(body.request_id, '123456');
    assert.equal(body.actions.length, 1);
    assert.equal(body.actions[0].executor, 'shopping');
    assert.equal('ok' in body, false);
  });
});

test('repairs an empty actions plan exactly once before returning it', async () => {
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls += 1;
      const sent = JSON.parse(init.body);
      if (calls === 1) {
        const invalid = validResult();
        invalid.actions = [];
        return Response.json({output_text: JSON.stringify(invalid)});
      }
      assert.match(sent.input, /CONTRACT REPAIR/u);
      assert.match(sent.input, /at least one action/u);
      return Response.json({output_text: JSON.stringify(validResult({executor: 'idea', content: '棚のアイデア'}))});
    };
    const response = await handleClarityModel(request());
    assert.equal(response.status, 200);
    assert.equal(calls, 2);
    const body = JSON.parse(await response.text());
    assert.equal(body.actions[0].executor, 'idea');
  });
});

test('fails closed after two semantically unusable model plans', async () => {
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      const invalid = validResult();
      invalid.actions = [];
      return Response.json({output_text: JSON.stringify(invalid)});
    };
    const response = await handleClarityModel(request());
    assert.equal(response.status, 502);
    assert.equal(calls, 2);
    assert.deepEqual(await response.json(), {error: 'Model output failed Clarity contract'});
  });
});

test('rejects calendar plans that claim executable state without dates', async () => {
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      const invalid = validResult({executor: 'calendar', content: '歯医者'});
      invalid.actions[0].date_time = '';
      invalid.actions[0].end_date_time = '';
      return Response.json({output_text: JSON.stringify(invalid)});
    };
    const response = await handleClarityModel(request());
    assert.equal(response.status, 502);
    assert.equal(calls, 2);
  });
});

test('fails closed when server OpenAI key is absent', async () => {
  await withEnv(async () => {
    delete process.env.OPENAI_API_KEY;
    const response = await handleClarityModel(request());
    assert.equal(response.status, 503);
  });
});

test('fails closed on non-JSON model output after one repair attempt', async () => {
  await withEnv(async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; return Response.json({output_text: 'not-json'}); };
    const response = await handleClarityModel(request());
    assert.equal(response.status, 502);
    assert.equal(calls, 2);
  });
});
