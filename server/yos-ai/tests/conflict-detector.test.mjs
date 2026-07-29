import test from 'node:test';
import assert from 'node:assert/strict';
import { detectConflicts } from '../dist/conflict-detector.js';

const source = (id, priority) => ({ id, title: id, kind: 'master', priority });

test('selects higher-priority confirmed evidence when values conflict', () => {
  const conflicts = detectConflicts([
    { key: 'closing_time', value: '03:30', status: 'confirmed', source: source('taxi-master', 5) },
    { key: 'closing_time', value: '04:30', status: 'confirmed', source: source('old-chat', 9) }
  ]);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].selected.value, '03:30');
  assert.equal(conflicts[0].selected.source.id, 'taxi-master');
});

test('ignores rejected and superseded evidence', () => {
  const conflicts = detectConflicts([
    { key: 'mode', value: 'single-persona', status: 'confirmed', source: source('law', 1) },
    { key: 'mode', value: 'multi-persona', status: 'rejected', source: source('idea', 8) }
  ]);
  assert.equal(conflicts.length, 0);
});
