import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverFrictionCandidates} from '../dist/review/friction-discovery.js';

const now = '2026-09-13T00:00:00.000Z';
function signal(overrides = {}) {
  return {
    id: 's1',
    occurredAt: '2026-09-12T00:00:00.000Z',
    source: 'clarity',
    patternKey: 'battery-check',
    label: '外出前のバッテリー確認',
    kind: 'repeated_check',
    minutesSpent: 2,
    manualSteps: 3,
    automatable: true,
    reversible: true,
    risk: 'low',
    evidenceId: 'e1',
    ...overrides
  };
}

test('promotes only repeated low-risk measurable friction', () => {
  const result = discoverFrictionCandidates([
    signal({id: 's1', evidenceId: 'e1', occurredAt: '2026-09-12T00:00:00.000Z'}),
    signal({id: 's2', evidenceId: 'e2', occurredAt: '2026-09-10T00:00:00.000Z'}),
    signal({id: 's3', evidenceId: 'e3', occurredAt: '2026-09-08T00:00:00.000Z'})
  ], {now});
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0]?.patternKey, 'battery-check');
  assert.equal(result.candidates[0]?.handoff, 'prototype');
});

test('does not promote one-off inconvenience', () => {
  const result = discoverFrictionCandidates([signal()], {now});
  assert.equal(result.candidates.length, 0);
});

test('blocks medium or high risk patterns from automatic prototype handoff', () => {
  const result = discoverFrictionCandidates([
    signal({id: 's1', evidenceId: 'e1', risk: 'medium'}),
    signal({id: 's2', evidenceId: 'e2', risk: 'medium', occurredAt: '2026-09-10T00:00:00.000Z'}),
    signal({id: 's3', evidenceId: 'e3', risk: 'medium', occurredAt: '2026-09-08T00:00:00.000Z'})
  ], {now});
  assert.equal(result.candidates.length, 0);
});

test('requires measurable time or step impact', () => {
  const result = discoverFrictionCandidates([
    signal({id: 's1', evidenceId: 'e1', minutesSpent: null, manualSteps: null}),
    signal({id: 's2', evidenceId: 'e2', occurredAt: '2026-09-10T00:00:00.000Z', minutesSpent: null, manualSteps: null}),
    signal({id: 's3', evidenceId: 'e3', occurredAt: '2026-09-08T00:00:00.000Z', minutesSpent: null, manualSteps: null})
  ], {now});
  assert.equal(result.candidates.length, 0);
});
