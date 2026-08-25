import test from 'node:test';
import assert from 'node:assert/strict';
import {ModelFailure} from '../dist/model-failure.js';
import {OpenAIResponsesClient} from '../dist/openai/responses-client.js';

const modelOutput = {
  answer: '結論',
  facts: [{text: '事実', sourceIds: ['source-1']}],
  assumptions: [],
  unknowns: [],
  memoryCandidates: [],
  nextAction: null
};

function modelInput(liveMode = false) {
  return {
    requestId: 'r1',
    route: {primary: liveMode ? 'taxi-live' : 'yos', related: [], liveMode, reasons: []},
    instruction: 'instruction',
    userText: liveMode ? '営業中' : '相談',
    context: 'context',
    sourceRefs: [{id: 'source-1', title: 'Source', kind: 'master', priority: 1}],
    conflicts: []
  };
}

function clientReturning(response) {
  return new OpenAIResponsesClient({
    apiKey: 'test-key',
    safetyIdentifier: 'hashed-user',
    responseSchema: {type: 'object'},
    fetchImpl: async () => response
  });
}

async function rejectsWithSafeStage(client, stage) {
  await assert.rejects(client.generate(modelInput()), (error) => {
    assert.ok(error instanceof ModelFailure);
    assert.equal(error.stage, stage);
    assert.equal(error.cause, undefined);
    assert.equal(error.message, 'Model request failed');
    assert.doesNotMatch(JSON.stringify(error), /private|secret|token|user question|model output/i);
    return true;
  });
}

test('Responses client forces safe options and captures usage', async () => {
  let requestBody;
  const client = new OpenAIResponsesClient({
    apiKey: 'test-key',
    model: 'gpt-5.6-terra',
    safetyIdentifier: 'hashed-user',
    responseSchema: {type: 'object'},
    maxOutputTokens: 4000,
    liveMaxOutputTokens: 1200,
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        id: 'resp_123',
        model: 'gpt-5.6-terra-2026-07-01',
        output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify(modelOutput)}]}],
        usage: {
          input_tokens: 100,
          input_tokens_details: {cached_tokens: 25},
          output_tokens: 40,
          output_tokens_details: {reasoning_tokens: 10},
          total_tokens: 140
        }
      }), {status: 200, headers: {'content-type': 'application/json'}});
    }
  });

  const result = await client.generate(modelInput(true));

  assert.equal(requestBody.store, false);
  assert.equal(requestBody.safety_identifier, 'hashed-user');
  assert.equal(requestBody.text.verbosity, 'low');
  assert.equal(requestBody.reasoning.effort, 'low');
  assert.equal(requestBody.max_output_tokens, 1200);
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.equal(result.answer, '結論');
  assert.deepEqual(result.facts, modelOutput.facts);
  assert.deepEqual(result.modelUsage, {
    model: 'gpt-5.6-terra-2026-07-01',
    responseId: 'resp_123',
    inputTokens: 100,
    cachedInputTokens: 25,
    outputTokens: 40,
    reasoningTokens: 10,
    totalTokens: 140
  });
});

test('Responses client allows missing usage without inventing values', async () => {
  const client = new OpenAIResponsesClient({
    apiKey: 'test-key',
    safetyIdentifier: 'hashed-user',
    responseSchema: {type: 'object'},
    fetchImpl: async () => new Response(JSON.stringify({
      output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify(modelOutput)}]}]
    }), {status: 200, headers: {'content-type': 'application/json'}})
  });
  const result = await client.generate(modelInput());
  assert.equal(result.modelUsage, undefined);
});

test('Responses client rejects malformed model output', async () => {
  const client = new OpenAIResponsesClient({
    apiKey: 'test-key',
    safetyIdentifier: 'hashed-user',
    responseSchema: {type: 'object'},
    fetchImpl: async () => new Response(JSON.stringify({
      output: [{type: 'message', content: [{type: 'output_text', text: '{"answer":1}'}]}]
    }), {status: 200, headers: {'content-type': 'application/json'}})
  });

  await rejectsWithSafeStage(client, 'model-response-invalid');
});

test('Responses client rejects facts without source IDs', async () => {
  const client = new OpenAIResponsesClient({
    apiKey: 'test-key',
    safetyIdentifier: 'hashed-user',
    responseSchema: {type: 'object'},
    fetchImpl: async () => new Response(JSON.stringify({
      output: [{
        type: 'message',
        content: [{
          type: 'output_text',
          text: JSON.stringify({...modelOutput, facts: [{text: '根拠なし', sourceIds: []}]})
        }]
      }]
    }), {status: 200, headers: {'content-type': 'application/json'}})
  });

  await rejectsWithSafeStage(client, 'model-response-invalid');
});

test('Responses client rejects corrupt usage counters', async () => {
  const client = new OpenAIResponsesClient({
    apiKey: 'test-key',
    safetyIdentifier: 'hashed-user',
    responseSchema: {type: 'object'},
    fetchImpl: async () => new Response(JSON.stringify({
      output: [{type: 'message', content: [{type: 'output_text', text: JSON.stringify(modelOutput)}]}],
      usage: {input_tokens: -1, output_tokens: 1, total_tokens: 0}
    }), {status: 200, headers: {'content-type': 'application/json'}})
  });

  await rejectsWithSafeStage(client, 'model-response-invalid');
});

test('Responses client classifies network failures without retaining details', async () => {
  const client = new OpenAIResponsesClient({
    apiKey: 'test-key',
    safetyIdentifier: 'hashed-user',
    responseSchema: {type: 'object'},
    fetchImpl: async () => { throw new Error('private network token'); }
  });
  await rejectsWithSafeStage(client, 'model-network');
});

test('Responses client classifies fixed safe HTTP failure stages', async (t) => {
  const cases = [
    {name: 'auth', status: 401, body: {error: {message: 'private token'}}, stage: 'model-http-auth'},
    {
      name: 'quota',
      status: 429,
      body: {error: {code: 'insufficient_quota', message: 'private billing details'}},
      stage: 'model-http-quota'
    },
    {
      name: 'rate-limit',
      status: 429,
      body: {error: {code: 'rate_limit_exceeded', message: 'private rate details'}},
      stage: 'model-http-rate-limit'
    },
    {name: 'request', status: 400, body: {error: {message: 'private model name'}}, stage: 'model-http-request'},
    {name: 'timeout', status: 408, body: {error: {message: 'private timeout'}}, stage: 'model-http-timeout'},
    {name: 'upstream', status: 500, body: {error: {message: 'private upstream'}}, stage: 'model-http-upstream'}
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      const response = new Response(JSON.stringify(item.body), {
        status: item.status,
        headers: {'content-type': 'application/json'}
      });
      await rejectsWithSafeStage(clientReturning(response), item.stage);
    });
  }
});

test('Responses client classifies invalid successful payloads without retaining output', async () => {
  const response = new Response('{"output":"private model output"}', {
    status: 200,
    headers: {'content-type': 'application/json'}
  });
  await rejectsWithSafeStage(clientReturning(response), 'model-response-invalid');
});
