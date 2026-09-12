import test from 'node:test';
import assert from 'node:assert/strict';
import {buildWeeklyReview} from '../dist/review/weekly-review.js';

const base = {
  domain: 'life',
  occurrences: 4,
  outcome: 'neutral',
  value: 'medium',
  friction: 'medium',
  automatable: false,
  reversible: true,
  measuredMinutesPerWeek: 0,
  manualStepsPerWeek: 0,
  evidenceIds: ['e1']
};

test('returns only continue, stop, automate candidates', () => {
  const result = buildWeeklyReview([
    {...base, id: 'keep', label: '朝の散歩', outcome: 'positive', value: 'high', friction: 'low'},
    {...base, id: 'stop', label: '使わない一覧の手更新', outcome: 'negative', value: 'low', friction: 'high'},
    {...base, id: 'auto', label: '同じ確認の繰り返し', automatable: true, measuredMinutesPerWeek: 12}
  ]);
  assert.deepEqual(result.continue.map((item) => item.id), ['keep']);
  assert.deepEqual(result.stop.map((item) => item.id), ['stop']);
  assert.deepEqual(result.automate.map((item) => item.id), ['auto']);
});

test('does not automate without measurable impact', () => {
  const result = buildWeeklyReview([
    {...base, id: 'noise', label: '小さな繰り返し', automatable: true}
  ]);
  assert.equal(result.automate.length, 0);
});

test('prefers stopping low-value work over automating it', () => {
  const result = buildWeeklyReview([
    {...base, id: 'waste', label: '不要な集計', value: 'low', outcome: 'negative', friction: 'high', automatable: true, measuredMinutesPerWeek: 30}
  ]);
  assert.equal(result.stop[0]?.id, 'waste');
  assert.equal(result.automate.length, 0);
});

test('requires evidence before proposing a candidate', () => {
  const result = buildWeeklyReview([
    {...base, id: 'no-evidence', label: '根拠なし', outcome: 'positive', value: 'high', evidenceIds: []}
  ]);
  assert.equal(result.continue.length, 0);
});
