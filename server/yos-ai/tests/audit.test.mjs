import test from 'node:test';
import assert from 'node:assert/strict';
import {createAnswerAuditRecord} from '../dist/audit.js';

const answer = {
  requestId: 'req-1',
  route: {primary: 'taxi-live', related: ['external'], liveMode: true, reasons: ['test']},
  answer: 'private answer text',
  facts: ['private fact'],
  assumptions: [],
  unknowns: ['unknown detail'],
  memoryCandidates: [{
    content: 'private candidate', category: 'operation-rule', domain: 'taxi-live',
    status: 'candidate', evidenceSourceIds: ['taxi'], privacyLevel: 'L1'
  }],
  nextAction: 'private next action',
  conflicts: [{
    key: 'closing_time',
    selected: {key: 'closing_time', value: '03:30', status: 'confirmed', source: {id: 'taxi', title: 'Taxi', kind: 'master', priority: 5}},
    alternatives: [{key: 'closing_time', value: '04:30', status: 'candidate', source: {id: 'old', title: 'Old', kind: 'memory', priority: 9}}],
    reason: 'private conflict reason'
  }],
  sources: [{
    id: 'taxi', title: '03_Taxi Master', kind: 'master', priority: 5,
    modifiedAt: '2026-07-29T00:00:00Z', locator: 'drive:private-file-id'
  }],
  modelUsage: {
    model: 'gpt-5.6-terra', responseId: 'resp_private', inputTokens: 100,
    cachedInputTokens: 20, outputTokens: 40, reasoningTokens: 10, totalTokens: 140
  },
  safety: {level: 'attention', notes: ['private safety note']}
};

test('creates a minimal traceable audit without conversation content', () => {
  const record = createAnswerAuditRecord({
    answer,
    subjectHash: 'subject-hash',
    createdAt: '2026-07-29T14:00:00.000Z',
    durationMilliseconds: 321
  });

  assert.equal(record.domain, 'taxi-live');
  assert.deepEqual(record.relatedDomains, ['external']);
  assert.deepEqual(record.sourceSnapshots, [{sourceId: 'taxi', modifiedAt: '2026-07-29T00:00:00Z'}]);
  assert.deepEqual(record.conflictKeys, ['closing_time']);
  assert.equal(record.unknownCount, 1);
  assert.equal(record.memoryCandidateCount, 1);
  assert.equal(record.durationMilliseconds, 321);
  assert.equal(record.modelUsage.totalTokens, 140);

  const serialized = JSON.stringify(record);
  assert.doesNotMatch(serialized, /private answer text|private fact|private candidate|private next action/);
  assert.doesNotMatch(serialized, /private conflict reason|private safety note|private-file-id/);
  assert.doesNotMatch(serialized, /03:30|04:30/);
});

test('rejects invalid audit metadata', () => {
  assert.throws(() => createAnswerAuditRecord({
    answer, subjectHash: '', createdAt: '2026-07-29T14:00:00.000Z', durationMilliseconds: 1
  }), /subjectHash/);
  assert.throws(() => createAnswerAuditRecord({
    answer, subjectHash: 'hash', createdAt: 'not-a-date', durationMilliseconds: 1
  }), /createdAt/);
  assert.throws(() => createAnswerAuditRecord({
    answer, subjectHash: 'hash', createdAt: '2026-07-29T14:00:00.000Z', durationMilliseconds: -1
  }), /durationMilliseconds/);
});
