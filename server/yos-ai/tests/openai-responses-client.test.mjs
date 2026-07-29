import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIResponsesClient } from '../dist/openai/responses-client.js';

const modelOutput = {
  answer: '結論',
  facts: ['事実'],
  assumptions: [],
  unknowns: [],
  memoryCandidates: [],
  nextAction: null
};

test('Responses client forces store false and structured output', async () => {
  let requestBody;
  const client = new OpenAIResponsesClient({
    apiKey: 'test-key',
    model: 'gpt-5.6-terra',
    safetyIdentifier: 'hashed-user',
    responseSchema: { type: 'object' },
    fetchImpl: async (_input, init) => {
      requestBody = JSON.parse(init.body);
      return new Response(JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(modelOutput) }] }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  const result = await client.generate({
    requestId: 'r1',
    route: { primary: 'taxi-live', related: [], liveMode: true, reasons: [] },
    instruction: 'instruction',
    userText: '営業中',
    context: 'context',
    sourceRefs: [],
    conflicts: []
  });

  assert.equal(requestBody.store, false);
  assert.equal(requestBody.safety_identifier, 'hashed-user');
  assert.equal(requestBody.text.verbosity, 'low');
  assert.equal(requestBody.text.format.type, 'json_schema');
  assert.equal(result.answer, '結論');
});

test('Responses client rejects malformed model output', async () => {
  const client = new OpenAIResponsesClient({
    apiKey: 'test-key',
    safetyIdentifier: 'hashed-user',
    responseSchema: { type: 'object' },
    fetchImpl: async () => new Response(JSON.stringify({
      output: [{ type: 'message', content: [{ type: 'output_text', text: '{"answer":1}' }] }]
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  });

  await assert.rejects(() => client.generate({
    requestId: 'r1',
    route: { primary: 'yos', related: [], liveMode: false, reasons: [] },
    instruction: 'instruction',
    userText: '相談',
    context: 'context',
    sourceRefs: [],
    conflicts: []
  }), /answer must be a string/);
});
