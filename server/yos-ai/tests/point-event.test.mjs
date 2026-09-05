import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {
  createReferencedPointEvent,
  makePointId,
  mapHjRawInputToPointEvent,
  mapLifeSnapshotToPointEvent,
  mapTaxiEventToPointEvent,
  mapYosCaptureToPointEvent,
  validateLinkConfirmationGate,
  validatePointEventRef,
  validateRuleLifecycleGate
} from '../dist/point-event.js';

const provenance = {
  id: 'issue-277-source',
  title: 'Issue #277 fixture',
  kind: 'original',
  priority: 10,
  locator: 'test-fixture'
};

test('PointEventRefV1 schema keeps raw status and the approved producer list', async () => {
  const schemaUrl = new URL('../schemas/point-event-v1.schema.json', import.meta.url);
  const schema = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.equal(schema.title, 'PointEventRefV1');
  assert.equal(schema.properties.schemaVersion.const, 1);
  assert.equal(schema.properties.status.const, 'raw');
  assert.ok(schema.properties.sourceSystem.enum.includes('yos-capture'));
  assert.ok(schema.properties.sourceSystem.enum.includes('life-stream'));
  assert.equal(schema.additionalProperties, false);
});

test('YOS Capture projection preserves captureID, rawText and capturedAt without guessing occurredAt', () => {
  const point = mapYosCaptureToPointEvent({
    captureID: 'capture-001',
    rawText: '  原文をそのまま残す  ',
    capturedAt: '2026-09-05T08:00:00+09:00'
  }, provenance);

  assert.equal(point.sourceSystem, 'yos-capture');
  assert.equal(point.sourceRecordId, 'capture-001');
  assert.equal(point.pointId, makePointId('yos-capture', 'capture-001'));
  assert.equal(point.capturedAt, '2026-09-05T08:00:00+09:00');
  assert.equal(point.occurredAt, null);
  assert.deepEqual(point.raw, {mode: 'snapshot', value: '  原文をそのまま残す  '});
  assert.equal(point.status, 'raw');
});

test('Taxi projection preserves eventId and unconfirmed payload without promoting it', () => {
  const payload = {
    eventId: 'taxi-event-123',
    confirmationStatus: '未確認',
    fare: 2400
  };
  const point = mapTaxiEventToPointEvent({
    eventId: 'taxi-event-123',
    capturedAt: '2026-09-05T01:23:45+09:00',
    payload
  }, provenance);

  assert.equal(point.sourceRecordId, 'taxi-event-123');
  assert.equal(point.status, 'raw');
  assert.deepEqual(point.raw, {mode: 'snapshot', value: payload});
  assert.equal(point.raw.mode === 'snapshot' && point.raw.value.confirmationStatus, '未確認');
});

test('HJ Raw Input projection preserves rawInput and does not fabricate confirmed facts', () => {
  const point = mapHjRawInputToPointEvent({
    sceneId: 'scene-77',
    rawInput: '今日は少し前に進めた気がする',
    capturedAt: '2026-09-05T08:05:00+09:00'
  }, provenance);

  assert.deepEqual(point.raw, {mode: 'snapshot', value: '今日は少し前に進めた気がする'});
  assert.equal(Object.hasOwn(point, 'confirmedFacts'), false);
  assert.equal(Object.hasOwn(point, 'fact'), false);
});

test('Life projection is a detached read-only snapshot and does not mutate owner data', () => {
  const ownerSnapshot = {
    date: '2026-09-05',
    tasks: [{id: 't1', title: '洗濯', done: false}],
    settings: {sourceKey: 'yos-life-v1'}
  };
  const point = mapLifeSnapshotToPointEvent({
    snapshotId: 'life-2026-09-05-am',
    capturedAt: '2026-09-05T08:10:00+09:00',
    snapshot: ownerSnapshot
  }, provenance);

  assert.equal(point.sourceSystem, 'life');
  assert.deepEqual(point.raw, {mode: 'snapshot', value: ownerSnapshot});

  point.raw.value.tasks[0].done = true;
  assert.equal(ownerSnapshot.tasks[0].done, false);
});

test('stable source identity produces stable pointId and does not use heuristic content dedupe', () => {
  const a = makePointId('taxi', 'same-event-id');
  const b = makePointId('taxi', 'same-event-id');
  const c = makePointId('taxi', 'different-event-id');

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(makePointId('hj', 'same-event-id') === a, false);
});

test('validator accepts custom JSON raw payload without rewriting it', () => {
  const point = mapTaxiEventToPointEvent({
    eventId: 'custom-1',
    capturedAt: '2026-09-05T08:15:00+09:00',
    payload: {
      nested: {free: ['shape', 1, true, null]},
      customField: 'kept'
    }
  }, provenance);

  const result = validatePointEventRef(point);
  assert.equal(result.ok, true);
  assert.equal(result.value, point);
  assert.deepEqual(result.value.raw.value, point.raw.value);
});

test('safe raw reference is allowed without inventing a sourceRecordId', () => {
  const point = createReferencedPointEvent({
    pointId: 'pe:v1:other:external-ref-1',
    sourceSystem: 'other',
    sourceRecordId: null,
    capturedAt: '2026-09-05T08:20:00+09:00',
    ref: 'owner://external/ref/1',
    provenance
  });

  assert.equal(point.sourceRecordId, null);
  assert.equal(point.occurredAt, null);
  assert.deepEqual(point.raw, {mode: 'reference', ref: 'owner://external/ref/1'});
  assert.equal(validatePointEventRef(point).ok, true);
});

test('validator rejects guessed or promoted state instead of silently normalizing it', () => {
  const point = mapYosCaptureToPointEvent({
    captureID: 'capture-raw',
    rawText: 'raw',
    capturedAt: '2026-09-05T08:25:00+09:00'
  }, provenance);
  const promoted = {...point, status: 'confirmed'};
  const missingOccurredAt = {...point};
  delete missingOccurredAt.occurredAt;

  assert.equal(validatePointEventRef(promoted).ok, false);
  assert.equal(validatePointEventRef(missingOccurredAt).ok, false);
});

test('causal link cannot become confirmed without evidence or explicit user confirmation', () => {
  const blocked = validateLinkConfirmationGate({
    schemaVersion: 1,
    linkId: 'link-1',
    relation: 'causal',
    status: 'confirmed',
    pointIds: ['p1', 'p2'],
    evidencePointIds: [],
    userConfirmedAt: null
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reasons.join(' '), /causal link cannot be confirmed/);

  const evidenced = validateLinkConfirmationGate({
    schemaVersion: 1,
    linkId: 'link-2',
    relation: 'causal',
    status: 'confirmed',
    pointIds: ['p1', 'p2'],
    evidencePointIds: ['p3'],
    userConfirmedAt: null
  });
  assert.equal(evidenced.ok, true);

  const userConfirmed = validateLinkConfirmationGate({
    schemaVersion: 1,
    linkId: 'link-3',
    relation: 'causal',
    status: 'confirmed',
    pointIds: ['p1', 'p2'],
    evidencePointIds: [],
    userConfirmedAt: '2026-09-05T08:30:00+09:00'
  });
  assert.equal(userConfirmed.ok, true);
});

test('one event may remain a rule candidate but cannot become active without user approval', () => {
  const candidate = validateRuleLifecycleGate({
    schemaVersion: 1,
    ruleId: 'rule-1',
    version: 1,
    status: 'candidate',
    evidencePointIds: ['p1'],
    userApproval: null
  });
  assert.equal(candidate.ok, true);

  const blocked = validateRuleLifecycleGate({
    schemaVersion: 1,
    ruleId: 'rule-1',
    version: 2,
    status: 'user_approved_active',
    evidencePointIds: ['p1'],
    userApproval: null
  });
  assert.equal(blocked.ok, false);
  assert.match(blocked.reasons.join(' '), /explicit user approval/);
});

test('active rule requires approval time/reference/version and can later be disabled or superseded', () => {
  const active = validateRuleLifecycleGate({
    schemaVersion: 1,
    ruleId: 'rule-2',
    version: 3,
    status: 'user_approved_active',
    evidencePointIds: ['p1', 'p2'],
    userApproval: {
      approvedAt: '2026-09-05T08:35:00+09:00',
      approvalRef: 'user-confirmation:rule-2:v3'
    }
  });
  assert.equal(active.ok, true);

  const disabled = validateRuleLifecycleGate({
    schemaVersion: 1,
    ruleId: 'rule-2',
    version: 4,
    status: 'disabled',
    evidencePointIds: ['p1', 'p2'],
    userApproval: null
  });
  const superseded = validateRuleLifecycleGate({
    schemaVersion: 1,
    ruleId: 'rule-2',
    version: 5,
    status: 'superseded',
    evidencePointIds: ['p1', 'p2'],
    userApproval: null
  });
  assert.equal(disabled.ok, true);
  assert.equal(superseded.ok, true);
});
