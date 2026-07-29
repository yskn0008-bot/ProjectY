import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectBoundedA1Range, validateBoundedRanges } from '../dist/sources/a1-range.js';

test('counts a bounded Japanese sheet range', () => {
  const result = inspectBoundedA1Range("'乗車履歴'!A1:J100");
  assert.equal(result.rows, 100);
  assert.equal(result.columns, 10);
  assert.equal(result.cells, 1000);
});

test('rejects open-ended ranges', () => {
  assert.throws(() => inspectBoundedA1Range("'乗車履歴'!A:J"), /bounded/);
  assert.throws(() => inspectBoundedA1Range("'乗車履歴'!A1:J"), /bounded/);
});

test('rejects oversized reads', () => {
  assert.throws(() => validateBoundedRanges(["'乗車履歴'!A1:Z1000"], 10_000), /exceeds/);
});
