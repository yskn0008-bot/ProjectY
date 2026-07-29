import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGroundedFacts} from '../dist/grounding.js';

const sources = [
  {id: '00_law', title: '00_律法', kind: 'law', priority: 1},
  {id: '02_yos_master', title: '02_YOS Master', kind: 'master', priority: 2}
];

test('accepts facts grounded in known sources and deduplicates source IDs', () => {
  const result = validateGroundedFacts([
    {text: '安全を最優先する', sourceIds: ['00_law', '00_law']}
  ], sources);

  assert.deepEqual(result.accepted, [
    {text: '安全を最優先する', sourceIds: ['00_law']}
  ]);
  assert.deepEqual(result.rejected, []);
});

test('rejects facts without sources or with unknown sources', () => {
  const result = validateGroundedFacts([
    {text: '根拠なし', sourceIds: []},
    {text: '未知の根拠', sourceIds: ['missing']}
  ], sources);

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 2);
  assert.match(result.rejected[0].reason, /根拠情報源がない/);
  assert.match(result.rejected[1].reason, /未知の根拠情報源/);
});

test('enforces fact count, length and sources-per-fact limits', () => {
  const result = validateGroundedFacts([
    {text: 'a'.repeat(6), sourceIds: ['00_law']},
    {text: '二件目', sourceIds: ['00_law', '02_yos_master']}
  ], sources, {maxFacts: 1, maxTextCharacters: 5, maxSourcesPerFact: 1});

  assert.equal(result.accepted.length, 0);
  assert.equal(result.rejected.length, 2);
  assert.match(result.rejected[0].reason, /1〜5文字/);
  assert.match(result.rejected[1].reason, /最大1件/);
});
