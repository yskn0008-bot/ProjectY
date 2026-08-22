import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (name) => readFile(new URL('../hj/' + name, import.meta.url), 'utf8');

test('twelve archetypes are lenses with light and shadow', async () => {
  await import('../hj/archetypes.js');
  const values = globalThis.HJ_ARCHETYPES;
  assert.equal(values.length, 12);
  assert.equal(new Set(values.map((item) => item.id)).size, 12);
  values.forEach((item) => {
    assert.ok(item.name);
    assert.ok(item.description);
    assert.ok(item.light);
    assert.ok(item.shadow);
  });
});

test('current location extends the existing journey store', async () => {
  const [app, bootstrap, map] = await Promise.all([
    read('app.js'),
    read('bootstrap.js'),
    read('current-location.js')
  ]);
  for (const field of ['stageUnknown','compass','quest','treasure','controllable','reality','archetypes']) {
    assert.match(app, new RegExp(field + ':'));
    assert.match(bootstrap, new RegExp(field + ':'));
  }
  assert.match(map, /hj-domain-journeys-v1/);
  assert.doesNotMatch(map, /localStorage\.clear\(/);
  assert.doesNotMatch(map, /ranking|score|fixedType/i);
});

test('first profile keeps the stage unknown until the user chooses one', async () => {
  const profile = await read('profile.js');
  assert.match(profile, /<option value=""\$\{stageUnknown\?' selected':''\}>分からない<\/option>/);
  assert.match(profile, /stageOptions\(focus\?\.stage\|\|STAGES\[0\],Boolean\(focus\?\.stageUnknown\)\)/);
  assert.match(profile, /stageOptions\(focus\.stage\|\|STAGES\[0\],Boolean\(focus\.stageUnknown\)\)/);
  assert.match(profile, /focus\.stageUnknown=!selectedStage/);
  assert.doesNotMatch(profile, /focus\.stageUnknown=false/);
  assert.doesNotMatch(profile, /STAGES\.indexOf\(journey\.stage\)/);
  assert.doesNotMatch(profile, /if\(!profile\(\)\)openDialog\(\)/, '初回設定を強制表示してはいけない');
});

test('conversation-first home preserves raw input without inventing facts', async () => {
  const [page, scenes] = await Promise.all([read('index.html'), read('scenes.js')]);
  assert.match(page, /id="startConversation"[^>]*>今のことを話す</);
  assert.match(page, /id="startNewConversation"[^>]*hidden>別のことを話す</);
  assert.match(page, /id="conversationComposer"[^>]*hidden/);
  assert.match(page, /<details id="hjDetails"/);
  assert.match(page, /今日は何があった？/);
  assert.match(page, /<label class="raw-input-label">話したいこと/);
  for (const field of ['rawInput','confirmedFacts','candidates','evidence','unknown','conversationStatus']) {
    assert.match(scenes, new RegExp(field));
  }
  assert.match(scenes, /fact:\s*''/);
  assert.match(scenes, /write\(KEYS\.scenes, scenes\)/);
  assert.match(scenes, /latestRawInput\(true\)/, '未完了の下書きだけを再開候補にする');
  assert.match(scenes, /scene\.conversationStatus === 'draft'/, '完了済み原文を再開候補にしてはいけない');
  assert.match(scenes, /latest \? '続きを話す' : '今のことを話す'/, '戻った時の主要CTAを一つにする');
  assert.match(scenes, /currentWeekScenes\(\)\.filter\(\(scene\) => scene\.fact\)/, 'Raw Inputを事実の物語へ混ぜてはいけない');
  assert.doesNotMatch(scenes, /localStorage\.setItem\(['"]hj-raw/i, 'Raw Input専用の保存キーを増やしてはいけない');
});

test('detailed HJ forms stay behind explicit progressive disclosure', async () => {
  const [page, scenes, map] = await Promise.all([
    read('index.html'),
    read('scenes.js'),
    read('current-location.js')
  ]);
  for (const id of ['currentLocationEditor', 'journeyEditor', 'sceneEditor', 'storyEditor']) {
    assert.match(page, new RegExp(`<details id="${id}"`));
    assert.doesNotMatch(page, new RegExp(`<details id="${id}"[^>]*\\sopen(?:\\s|>)`));
  }
  assert.match(page, /id="currentSummaryList"/);
  assert.match(page, /id="storyHistorySection"/);
  assert.match(map, /renderCurrentLocationSummary/);
  assert.match(scenes, /openDetail\('story', 'storyHistorySection'\)/);
  assert.match(scenes, /\$\('storyEditor'\)\.open = true/, '明示的な物語作成操作では編集欄を開く');
});

test('scene loop keeps fact, feeling, choice, result and one next step', async () => {
  const scenes = await read('scenes.js');
  assert.match(scenes, /\bfact,/);
  for (const field of ['feeling','choice','result','reflection','controllable','next','activeArchetypes','neededArchetype']) {
    assert.match(scenes, new RegExp(field + ':'));
  }
  assert.match(scenes, /\.slice\(0,\s*3\)/);
  assert.doesNotMatch(scenes, /localStorage\.clear\(/);
});

test('offline manifest contains every current-location asset', async () => {
  const worker = await read('service-worker.js');
  for (const asset of ['./archetypes.js', './current-location.js']) {
    assert.ok(worker.includes('"' + asset + '"'), asset + ' must be in the HJ cache manifest');
  }
  assert.match(worker, /key\.startsWith\("hj-multi-journey-"\)/);
});
