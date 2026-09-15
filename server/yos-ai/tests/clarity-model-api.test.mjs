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

test('returns validated Clarity JSON as text so Shortcuts parses nested actions itself', async () => {
  await withEnv(async () => {
    globalThis.fetch = async (url, init) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      assert.equal(init.headers.Authorization, 'Bearer test-key-never-sent-to-client');
      const sent = JSON.parse(init.body);
      assert.equal(sent.input, 'test prompt');
      assert.equal(sent.store, false);
      assert.equal(sent.model, 'test-model');
      return Response.json({output_text: JSON.stringify({request_id: '123456', interpretation: {risk: 'low'}, actions: [{id: 'a1', executor: 'shopping', status: 'planned'}], feedback: {summary: ''}})});
    };
    const response = await handleClarityModel(request());
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /^text\/plain/u);
    const raw = await response.text();
    const body = JSON.parse(raw);
    assert.equal(body.request_id, '123456');
    assert.equal(body.actions.length, 1);
    assert.equal(body.actions[0].executor, 'shopping');
    assert.equal('ok' in body, false);
  });
});

test('fails closed when server OpenAI key is absent', async () => {
  await withEnv(async () => {
    delete process.env.OPENAI_API_KEY;
    const response = await handleClarityModel(request());
    assert.equal(response.status, 503);
  });
});

test('fails closed on non-JSON model output', async () => {
  await withEnv(async () => {
    globalThis.fetch = async () => Response.json({output_text: 'not-json'});
    const response = await handleClarityModel(request());
    assert.equal(response.status, 502);
  });
});
