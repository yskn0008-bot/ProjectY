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

test('active HJ saves Raw Input before YOS AI and confirms one candidate at a time', async () => {
  const [page, scenes, client, auth, worker] = await Promise.all([
    read('index.html'),
    read('scenes.js'),
    read('yos-ai-client.js'),
    read('yos-auth.js'),
    read('service-worker.js')
  ]);
  assert.match(page, /src="\.\/yos-ai-client\.js"[\s\S]*src="\.\/yos-auth\.js"[\s\S]*src="\.\/scenes\.js"/);
  assert.equal((page.match(/data-ai-decision=/g) || []).length, 3);
  assert.match(page, />そう</);
  assert.match(page, />違う</);
  assert.match(page, />分からない</);

  const finish = scenes.indexOf('async function finishRawInput');
  const rawPersist = scenes.indexOf('if (!write(KEYS.scenes, scenes))', finish);
  const aiRequest = scenes.indexOf('await requestAiForScene(savedId)', finish);
  assert.ok(finish > -1 && rawPersist > finish && rawPersist < aiRequest, 'Raw Input must persist before AI work');
  for (const field of ['facts', 'assumptions', 'unknowns', 'conflicts', 'nextAction', 'memoryCandidates']) {
    assert.match(scenes, new RegExp(`result\\?\\.${field}`));
  }
  assert.match(scenes, /candidate\.type === 'fact'/, 'only confirmed fact candidates become confirmed facts');
  assert.match(scenes, /candidate\.type === 'nextAction'/, 'next action changes only after the explicit yes decision');
  assert.match(scenes, /candidateText'\)\.textContent = candidate\.value/);
  assert.doesNotMatch(scenes, /candidateText'\)\.innerHTML/);
  for (const status of [401, 403, 429, 503]) assert.match(scenes, new RegExp(`${status}:`));

  assert.match(client, /new URL\(path, this\.baseUrl\)/);
  assert.match(client, /'\/api\/yos\/chat'/);
  assert.match(client, /credentials: 'omit'/);
  assert.match(client, /cache: 'no-store'/);
  assert.match(auth, /accounts\.google\.com\/gsi\/client/);
  assert.match(auth, /\/api\/yos\/public-config/);
  assert.doesNotMatch(client + auth, /localStorage\.(?:getItem|setItem)/);
  assert.doesNotMatch(client + auth, /OPENAI_API_KEY|UPSTASH_REDIS_REST_TOKEN|YOS_.*DOCUMENT_ID/);
  assert.ok(worker.includes('"./yos-ai-client.js"'));
  assert.ok(worker.includes('"./yos-auth.js"'));
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

test('scene editor maps rendered cards to stable scene ids', async () => {
  const [scenes, editor] = await Promise.all([read('scenes.js'), read('editor.js')]);
  const decorateScenes = editor.match(/function decorateScenes\(\)[\s\S]*?(?=function decorateStories\(\))/u)?.[0] || '';
  assert.match(scenes, /article\.dataset\.sceneId = scene\.id/);
  assert.match(editor, /c\.dataset\.sceneId/);
  assert.match(editor, /ss\(\)\.find\(item=>item\.id===c\.dataset\.sceneId\)/);
  assert.match(decorateScenes, /ss\(\)\.find\(item=>item\.id===c\.dataset\.sceneId\)/);
  assert.doesNotMatch(decorateScenes, /items\[i\]/, 'scene cards must not map to records by position');
});