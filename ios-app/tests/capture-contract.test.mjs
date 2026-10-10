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

test('local event ledger is append-only, protected, private-by-default, and monthly partitioned', async () => {
  const [models, ledger] = await Promise.all([
    read('../plugins/yos-capture/ios/Sources/YOSCapturePlugin/YOSEventModels.swift'),
    read('../plugins/yos-capture/ios/Sources/YOSCapturePlugin/YOSEventLedger.swift')
  ]);
  assert.match(models, /case s0 = "S0"/);
  assert.match(models, /privacy: YOSEventPrivacy = \.s0/);
  assert.match(ledger, /events-%04d-%02d\.jsonl/);
  assert.match(ledger, /seekToEnd/);
  assert.match(ledger, /completeFileProtectionUntilFirstUserAuthentication/);
  assert.match(ledger, /isExcludedFromBackup = true/);
  assert.doesNotMatch(ledger, /URLSession|https?:\/\//);
});

test('capture logs only an evidence pointer into the event ledger, not a second raw-text copy', async () => {
  const service = await read('../plugins/yos-capture/ios/Sources/YOSCapturePlugin/YOSCaptureService.swift');
  assert.match(service, /source: "yos_capture"/);
  assert.match(service, /type: "user_input"/);
  assert.match(service, /"capture_id": \.string/);
  assert.match(service, /"input_mode": \.string/);
  const eventBlock = service.slice(service.indexOf('let event = YOSEvent'), service.indexOf('try? await eventLedger.append'));
  assert.doesNotMatch(eventBlock, /rawText|raw_text/);
});

test('Shortcuts receives a silent generic YOS Event App Intent', async () => {
  const intent = await read('../plugins/yos-capture/ios/Sources/YOSCapturePlugin/YOSCaptureAppIntents.swift');
  assert.match(intent, /RecordYOSEventIntent: AppIntent/);
  assert.match(intent, /openAppWhenRun: Bool = false/);
  assert.match(intent, /YOSEventService\(ledger: ledger\)/);
  assert.match(intent, /privacy: String/);
  assert.match(intent, /sourceEventID: String/);
});

test('EventKit application requires permission and idempotent marker', async () => {
  const source = await read('../plugins/yos-capture/ios/Sources/YOSCapturePlugin/YOSCaptureEventApplier.swift');
  assert.match(source, /requestFullAccessToEvents/);
  assert.match(source, /requestFullAccessToReminders/);
  assert.match(source, /YOS-CAPTURE-ID:/);
  assert.match(source, /applyAttemptID/);
  assert.match(source, /needsReview/);
});

test('App Group activation keeps the previous Application Support raw store', async () => {
  const source = await read('../plugins/yos-capture/ios/Sources/YOSCapturePlugin/YOSCaptureRepository.swift');
  assert.match(source, /migrationSourceURL/);
  assert.match(source, /migrateRecords/);
  assert.match(source, /knownIDs\.insert\(record\.captureID\)\.inserted/);
  assert.doesNotMatch(source, /removeItem\(at: source/);
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
