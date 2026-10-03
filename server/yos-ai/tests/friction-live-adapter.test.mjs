import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverFrictionFromLifeStore,
  projectLifeStoreToFrictionSignals
} from '../dist/review/friction-live-adapter.js';

test('projects only completed low-risk read-only MY LIFE tasks', () => {
  const store = {
    days: {
      '2026-10-01': {
        tasks: [
          {text: '天気を確認', done: true},
          {text: '支払いを確認', done: true},
          {text: 'アプリを開く', done: false},
          {text: 'メモを入力', done: true}
        ]
      },
      'not-a-date': {
        tasks: [{text: '天気を確認', done: true}]
      }
    }
  };

  const signals = projectLifeStoreToFrictionSignals(store);
  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.label, '天気を確認');
  assert.equal(signals[0]?.evidenceId, 'life:2026-10-01:task:0');
  assert.equal(signals[0]?.risk, 'low');
  assert.equal(signals[0]?.reversible, true);
});

test('normalizes equivalent task labels into one stable pattern key', () => {
  const store = {
    days: {
      '2026-10-01': {tasks: [{text: '  天気   を 確認  ', done: true}]},
      '2026-10-02': {tasks: [{text: '天気 を 確認', done: true}]}
    }
  };

  const signals = projectLifeStoreToFrictionSignals(store);
  assert.equal(signals.length, 2);
  assert.equal(signals[0]?.patternKey, signals[1]?.patternKey);
});

test('live adapter reaches the existing friction engine without new storage', () => {
  const days = {};
  const dates = [
    '2026-09-26','2026-09-27','2026-09-28','2026-09-29',
    '2026-09-30','2026-10-01','2026-10-02','2026-10-03'
  ];
  for (const date of dates) {
    days[date] = {
      tasks: [
        {text: '天気を確認', done: true},
        {text: '天気を確認', done: true}
      ]
    };
  }
  const store = {days};
  const before = JSON.stringify(store);

  const output = discoverFrictionFromLifeStore(store, {now: '2026-10-03T12:00:00+09:00'});

  assert.equal(JSON.stringify(store), before);
  assert.equal(output.signals.length, 16);
  assert.equal(output.result.candidates.length, 1);
  assert.equal(output.result.candidates[0]?.patternKey, 'life-task:天気を確認');
  assert.equal(output.result.candidates[0]?.manualStepsPerWeek, 8);
  assert.equal(output.result.candidates[0]?.handoff, 'prototype');
  assert.equal(output.result.candidates[0]?.requiresUserDecision, true);
});

test('malformed or empty MY LIFE input fails closed to no signal', () => {
  assert.deepEqual(projectLifeStoreToFrictionSignals(null), []);
  assert.deepEqual(projectLifeStoreToFrictionSignals({days: []}), []);
  assert.deepEqual(projectLifeStoreToFrictionSignals({days: {'2026-10-01': {tasks: 'bad'}}}), []);
});
