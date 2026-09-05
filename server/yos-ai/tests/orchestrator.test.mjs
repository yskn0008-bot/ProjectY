import test from 'node:test';
import assert from 'node:assert/strict';
import { AnswerFailure, YosOrchestrator } from '../dist/orchestrator.js';
import { ModelFailure } from '../dist/openai/model-failure.js';

const source = (id, title, priority, privacyLevel = 'L1', content = title) => ({
  source: { id, title, kind: 'master', priority },
  privacyLevel,
  content
});

test('orchestrator loads core and domain sources and removes L4 content', async () => {
  const provider = {
    async loadCoreSources() {
      return [source('00_law', '00_律法', 1), source('secret', '秘密', 1, 'L4', 'sk-secret')];
    },
    async loadDomainSources() {
      return [source('03_taxi_master', '03_Taxi Master', 5)];
    }
  };

  const client = {
    async generate(input) {
      assert.match(input.context, /00_law/);
      assert.match(input.context, /03_taxi_master/);
      assert.doesNotMatch(input.context, /sk-secret/);
      return {
        answer: '結論',
        facts: [],
        assumptions: [],
        unknowns: [],
        memoryCandidates: [],
        nextAction: null
      };
    }
  };

  const orchestrator = new YosOrchestrator(provider, client);
  const result = await orchestrator.answer({
    requestId: 'req-1',
    userText: '営業中。今どこへ向かう？',
    currentTime: '2026-07-29T23:00:00+09:00'
  });

  assert.equal(result.route.primary, 'taxi-live');
  assert.equal(result.safety.level, 'attention');
  assert.ok(result.safety.notes.some((note) => note.includes('secret')));
});

const request = {
  requestId: 'req-private',
  userText: 'private user question',
  currentTime: '2026-07-29T23:00:00+09:00'
};

const modelOutput = () => ({
  answer: 'private model answer',
  facts: [],
  assumptions: [],
  unknowns: [],
  memoryCandidates: [],
  nextAction: null
});

async function rejectsAt(orchestrator, stage, modelRequestStatus) {
  await assert.rejects(orchestrator.answer(request), (error) => {
    assert.ok(error instanceof AnswerFailure);
    assert.equal(error.stage, stage);
    assert.equal(error.modelRequestStatus, modelRequestStatus);
    assert.equal(error.cause, undefined);
    assert.doesNotMatch(JSON.stringify(error), /private|secret|token|source-id|model answer/i);
    assert.doesNotMatch(error.message, /private|secret|token|source-id|model answer/i);
    return true;
  });
}

test('orchestrator classifies failures at each real answer boundary without retaining details', async (t) => {
  await t.test('source-load', async () => {
    const provider = {
      async loadCoreSources() { throw new Error('private source-id and token'); },
      async loadDomainSources() { return []; }
    };
    await rejectsAt(new YosOrchestrator(provider, {async generate() { return modelOutput(); }}), 'source-load', undefined);
  });

  await t.test('context-build', async () => {
    const privateDocument = source('private-source-id', 'private title', 1);
    Object.defineProperty(privateDocument, 'content', {
      get() { throw new Error('private context secret'); }
    });
    const provider = {
      async loadCoreSources() { return [privateDocument]; },
      async loadDomainSources() { return []; }
    };
    await rejectsAt(new YosOrchestrator(provider, {async generate() { return modelOutput(); }}), 'context-build', undefined);
  });

  await t.test('model-request', async () => {
    const provider = {
      async loadCoreSources() { return []; },
      async loadDomainSources() { return []; }
    };
    const client = {async generate() { throw new Error('OPENAI_API_KEY=secret model input'); }};
    await rejectsAt(new YosOrchestrator(provider, client), 'model-request', undefined);
  });

  await t.test('model request safe status propagation', async () => {
    const provider = {
      async loadCoreSources() { return []; },
      async loadDomainSources() { return []; }
    };
    const client = {async generate() { throw new ModelFailure('model-request', '429'); }};
    await rejectsAt(new YosOrchestrator(provider, client), 'model-request', '429');
  });

  await t.test('model client validation failure', async () => {
    const provider = {
      async loadCoreSources() { return []; },
      async loadDomainSources() { return []; }
    };
    const client = {async generate() { throw new ModelFailure('model-output-validate'); }};
    await rejectsAt(new YosOrchestrator(provider, client), 'model-output-validate', undefined);
  });

  await t.test('model-output-validate', async () => {
    const provider = {
      async loadCoreSources() { return []; },
      async loadDomainSources() { return []; }
    };
    const output = modelOutput();
    Object.defineProperty(output, 'facts', {
      get() { throw new Error('private model output'); }
    });
    await rejectsAt(new YosOrchestrator(provider, {async generate() { return output; }}), 'model-output-validate', undefined);
  });
});
