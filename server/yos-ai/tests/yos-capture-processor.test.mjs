import test from 'node:test';
import assert from 'node:assert/strict';
import {createYosCaptureProcessor} from '../dist/intake/yos-capture-processor.js';

function setup({rawDuplicate = false, failClassificationSave = false} = {}) {
  const state = new Map();
  const rawInputs = [];
  const redis = {
    async command(command) {
      const [name, key, value] = command;
      if (name === 'GET') return state.get(key) ?? null;
      if (name === 'SET' && command.includes('NX')) {
        if (state.has(key)) return null;
        state.set(key, value);
        return 'OK';
      }
      if (name === 'SET') {
        if (failClassificationSave && String(key).startsWith('yos:capture:classification:v1:') && !String(key).endsWith(':claim')) {
          throw new Error('classification store unavailable');
        }
        state.set(key, value);
        return 'OK';
      }
      if (name === 'DEL') return state.delete(key) ? 1 : 0;
      throw new Error(`Unexpected command: ${name}`);
    }
  };
  const processor = createYosCaptureProcessor({
    rawFirst: {async process(input) { rawInputs.push(input); return {duplicate: rawDuplicate}; }},
    redis,
    now: () => new Date('2026-09-11T00:00:00.000Z')
  });
  return {processor, state, rawInputs};
}

function capture(rawText, captureId = 'capture-1') {
  return {rawText, capturedAt: '2026-09-11T00:00:00.000Z', inputMode: 'text', source: 'clarity', captureId};
}

function savedClassification(state, captureId = 'capture-1') {
  return JSON.parse(state.get(`yos:capture:classification:v1:${captureId}`));
}

test('persists Raw before a Shopping classification', async () => {
  const {processor, state, rawInputs} = setup();
  await processor.process(capture('手洗い石鹸'));
  assert.equal(rawInputs.length, 1);
  assert.deepEqual(savedClassification(state), {
    schemaVersion: 1, captureId: 'capture-1', classifiedAt: '2026-09-11T00:00:00.000Z', externalWrite: false,
    status: 'classified', target: 'shopping', label: '買い物', confidence: 0.9
  });
});

test('keeps Calendar, Reminders, and ambiguous Memo for review without external writes', async () => {
  for (const [rawText, target] of [['来週火曜14時 歯医者', 'calendar'], ['あとで田中さんに連絡', 'reminders'], ['田中さんの件', 'memo']]) {
    const {processor, state} = setup();
    await processor.process(capture(rawText));
    const result = savedClassification(state);
    assert.equal(result.status, 'needs_review');
    assert.equal(result.target, target);
    assert.equal(result.externalWrite, false);
  }
});

test('does not classify when Raw-first persistence fails', async () => {
  const state = new Map();
  const processor = createYosCaptureProcessor({
    rawFirst: {async process() { throw new Error('raw unavailable'); }},
    redis: {async command() { throw new Error('classification must not run'); }}
  });
  await assert.rejects(processor.process(capture('手洗い石鹸')), /raw unavailable/u);
  assert.equal(state.size, 0);
});

test('deduplicates classification by capture ID even when Raw was already saved', async () => {
  const {processor, state} = setup({rawDuplicate: true});
  await processor.process(capture('手洗い石鹸'));
  const first = state.get('yos:capture:classification:v1:capture-1');
  await processor.process(capture('別の原文'));
  assert.equal(state.get('yos:capture:classification:v1:capture-1'), first);
});

test('releases classification claim after persistence failure so retry can succeed', async () => {
  const failed = setup({failClassificationSave: true});
  await assert.rejects(failed.processor.process(capture('手洗い石鹸')), /classification store unavailable/u);
  assert.equal(failed.state.has('yos:capture:classification:v1:capture-1:claim'), false);

  const retry = setup({rawDuplicate: true});
  await retry.processor.process(capture('手洗い石鹸'));
  assert.equal(savedClassification(retry.state).status, 'classified');
});
