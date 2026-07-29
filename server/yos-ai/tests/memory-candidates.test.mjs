import test from 'node:test';
import assert from 'node:assert/strict';
import {validateMemoryCandidates} from '../dist/memory-candidates.js';

const sources = [
  {id: 'law', title: '00_律法', kind: 'law', priority: 1},
  {id: 'taxi', title: '03_Taxi Master', kind: 'master', priority: 5}
];

function candidate(overrides = {}) {
  return {
    content: '営業終了時刻は3:30',
    category: 'operation-rule',
    domain: 'taxi-live',
    status: 'candidate',
    evidenceSourceIds: ['taxi'],
    privacyLevel: 'L1',
    ...overrides
  };
}

test('accepts grounded candidates and deduplicates evidence IDs', () => {
  const result = validateMemoryCandidates([
    candidate({evidenceSourceIds: ['taxi', 'taxi']})
  ], sources, ['taxi-live']);
  assert.equal(result.accepted.length, 1);
  assert.deepEqual(result.accepted[0].evidenceSourceIds, ['taxi']);
  assert.equal(result.rejected.length, 0);
});

test('rejects L4, unrelated, ungrounded and unknown-source candidates', () => {
  const result = validateMemoryCandidates([
    candidate({privacyLevel: 'L4'}),
    candidate({domain: 'money'}),
    candidate({evidenceSourceIds: []}),
    candidate({evidenceSourceIds: ['unknown']})
  ], sources, ['taxi-live']);
  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 4);
});

test('caps candidate count and content length', () => {
  const result = validateMemoryCandidates([
    candidate({content: 'x'.repeat(501)}),
    ...Array.from({length: 11}, () => candidate())
  ], sources, ['taxi-live'], {maxCandidates: 10, maxContentCharacters: 500});
  assert.ok(result.rejected.some((item) => item.reason.includes('文字')));
  assert.ok(result.rejected.some((item) => item.reason.includes('最大10件')));
});
