import test from 'node:test';
import assert from 'node:assert/strict';
import { applyContextBudget } from '../dist/context-budget.js';

const document = (id, content, priority) => ({
  source: { id, title: id, kind: 'master', priority },
  privacyLevel: 'L1',
  content
});

test('preserves higher-priority context first and truncates safely', () => {
  const result = applyContextBudget([
    document('law', 'A'.repeat(80), 1),
    document('other', 'B'.repeat(80), 9)
  ], { maxTotalCharacters: 100, maxDocumentCharacters: 60 });
  assert.ok(result.documents[0].content.endsWith('[CONTEXT_TRUNCATED source_id=law]'));
  assert.match(result.documents[1].content, /CONTEXT_TRUNCATED|^$/);
  assert.ok(result.usedCharacters <= 100);
  assert.ok(result.notes.length >= 1);
});

test('never exceeds a tiny total budget', () => {
  const result = applyContextBudget([document('law', 'A'.repeat(80), 1)], { maxTotalCharacters: 5, maxDocumentCharacters: 5 });
  assert.ok(result.documents[0].content.length <= 5);
  assert.ok(result.usedCharacters <= 5);
});

test('rejects invalid context limits', () => {
  assert.throws(() => applyContextBudget([], { maxTotalCharacters: 0 }), /positive/);
});
