import test from 'node:test';
import assert from 'node:assert/strict';
import { YosOrchestrator } from '../dist/orchestrator.js';

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
