import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('capture screen asks for one free-form input and focuses immediately', async () => {
  const [html, script] = await Promise.all([read('../shell/capture.html'), read('../shell/capture.js')]);
  assert.match(html, /今のことを残す/);
  assert.match(html, /<textarea[^>]+autofocus/);
  assert.equal((html.match(/<form/g) || []).length, 1);
  assert.doesNotMatch(html, /<select|type="radio"|カテゴリを選/);
  assert.match(script, /text\.focus/);
});

test('web entry never stores raw text in localStorage', async () => {
  const source = (await Promise.all([
    read('../shell/capture-core.js'),
    read('../shell/capture.js'),
    read('../shell/capture.html')
  ])).join('\n');
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.match(source, /Capacitor\?\.Plugins\?\.YOSCapture/);
});

test('native contract keeps raw and inferred fields separate', async () => {
  const models = await read('../plugins/yos-capture/ios/Sources/YOSCapturePlugin/YOSCaptureModels.swift');
  for (const field of ['rawText', 'capturedAt', 'inputMode', 'classificationCandidate', 'parsedDateTime', 'target', 'confidence', 'appliedRecordID']) {
    assert.match(models, new RegExp(`\\b${field}\\b`));
  }
  assert.match(models, /case needsReview = "needs_review"/);
});

test('native service saves captured state before classification', async () => {
  const service = await read('../plugins/yos-capture/ios/Sources/YOSCapturePlugin/YOSCaptureService.swift');
  assert.ok(service.indexOf('repository.append(raw)') < service.indexOf('classifier.classify(raw'));
  assert.match(service, /return raw/);
});

test('EventKit application requires permission and idempotent marker', async () => {
  const source = await read('../plugins/yos-capture/ios/Sources/YOSCapturePlugin/YOSCaptureEventApplier.swift');
  assert.match(source, /requestFullAccessToEvents/);
  assert.match(source, /requestFullAccessToReminders/);
  assert.match(source, /YOS-CAPTURE-ID:/);
  assert.match(source, /applyAttemptID/);
  assert.match(source, /needsReview/);
});

test('Action Button path is a silent App Intent and package is linked locally', async () => {
  const [intent, packageJson] = await Promise.all([
    read('../plugins/yos-capture/ios/Sources/YOSCapturePlugin/YOSCaptureAppIntents.swift'),
    read('../package.json')
  ]);
  assert.match(intent, /SaveYOSCaptureIntent: AppIntent/);
  assert.match(intent, /inputMode: \.voice/);
  assert.match(intent, /保存しました/);
  assert.doesNotMatch(intent, /advice|助言|会話を続/);
  assert.equal(JSON.parse(packageJson).dependencies['@yos/capture'], 'file:plugins/yos-capture');
});

test('existing BRAVIA entry remains available beside primary Capture action', async () => {
  const home = await read('../shell/index.html');
  assert.match(home, /href="\.\/capture\.html"/);
  assert.match(home, /href="\.\/bravia\.html"/);
  assert.match(home, /href="\.\/taxi\/"/);
  assert.match(home, /href="\.\/life\/"/);
});
