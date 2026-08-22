import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureRawFirst,
  classifyCapture,
  createRawCapture,
  NativeCaptureClient,
  parseExplicitJapaneseDateTime
} from '../shell/capture-core.js';

const fixedNow = new Date('2026-08-19T10:00:00+09:00');

test('raw is durable before classification and survives classifier failure', async () => {
  const events = [];
  const records = new Map();
  const store = {
    async append(record) { events.push('append'); records.set(record.captureID, record); },
    async replace(record) { events.push('replace'); records.set(record.captureID, record); }
  };
  const result = await captureRawFirst({
    rawText: '田中さんの件',
    store,
    now: fixedNow,
    captureID: 'capture-1',
    classifier() { events.push('classify'); throw new Error('offline'); }
  });
  assert.deepEqual(events, ['append', 'classify']);
  assert.equal(result.status, 'captured');
  assert.equal(records.get('capture-1').rawText, '田中さんの件');
});

test('shopping example is a candidate while raw text stays unchanged', () => {
  const raw = createRawCapture('手洗い石鹸', 'voice', fixedNow, 'capture-2');
  const result = classifyCapture(raw, fixedNow);
  assert.equal(result.rawText, '手洗い石鹸');
  assert.equal(result.target, 'shopping');
  assert.equal(result.status, 'classified');
  assert.equal(result.classificationCandidate.label, '買い物');
});

test('explicit next-week appointment is parsed from local calendar context', () => {
  const parsed = parseExplicitJapaneseDateTime('来週火曜14時 歯医者', fixedNow);
  assert.equal(parsed.title, '歯医者');
  assert.equal(new Date(parsed.start).getDay(), 2);
  assert.equal(new Date(parsed.start).getHours(), 14);
  const result = classifyCapture(createRawCapture('来週火曜14時 歯医者', 'voice', fixedNow, 'capture-3'), fixedNow);
  assert.equal(result.target, 'calendar');
  assert.equal(result.status, 'classified');
  assert.equal(result.confidence, 0.96);
});

test('ambiguous dates are not promoted to applied facts', () => {
  const result = classifyCapture(createRawCapture('来週 歯医者', 'text', fixedNow, 'capture-4'), fixedNow);
  assert.equal(result.status, 'needs_review');
  assert.equal(result.target, 'calendar');
  assert.equal(result.parsedDateTime, null);
  assert.equal(result.appliedRecordID, null);
});

test('native client refuses a silent web-storage substitute', async () => {
  const client = new NativeCaptureClient(null);
  assert.equal(client.available, false);
  await assert.rejects(client.capture('原文'), /iOSアプリ/);
  assert.deepEqual(await client.list(), { records: [], storageScope: 'unavailable' });
});

test('native client passes only raw text and input mode', async () => {
  const calls = [];
  const client = new NativeCaptureClient({
    async capture(value) { calls.push(value); return { record: { ...value, captureID: 'native' } }; },
    async list() { return { records: [], storageScope: 'app_group' }; }
  });
  await client.capture('  MY WAYは最初白紙でもいいかも  ', 'text');
  assert.deepEqual(calls, [{ rawText: 'MY WAYは最初白紙でもいいかも', inputMode: 'text' }]);
});
