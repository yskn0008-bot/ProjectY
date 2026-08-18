import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, webkit } from 'playwright';

const baseURL = process.env.HJ_BASE_URL || 'http://127.0.0.1:4173/yos/hj/';
const browserName = process.env.HJ_BROWSER || 'chromium';
const engine = { chromium, webkit }[browserName];
if (!engine) throw new Error(`Unsupported browser: ${browserName}`);
await mkdir('test-results', { recursive: true });

const browser = await engine.launch();
const context = await browser.newContext({
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo',
  acceptDownloads: true
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.error(`[${browserName}] ${message.text()}`);
});

const visible = async (selector) => page.locator(selector).isVisible();
const settleReload = async () => {
  await page.waitForTimeout(700);
  await page.waitForLoadState('domcontentloaded');
};
const waitReload = async (action) => {
  await action();
  await settleReload();
};

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#onboardingDialog').evaluate((node) => node.open), false, '初回設定が強制表示された');
  assert.equal(await visible('#startConversation'), true, '初回ホームの主要行動が見えない');
  assert.equal(await page.locator('#startConversation').textContent(), '今のことを話す', '主要CTAが会話入口ではない');
  assert.equal(await visible('#startNewConversation'), false, '下書きがない初回に別の会話導線を表示している');
  assert.equal(await page.locator('#hjDetails').evaluate((node) => node.open), false, '詳細HJ項目が初回から展開されている');
  assert.equal(await page.locator('#conversationHome input:visible, #conversationHome textarea:visible, #conversationHome select:visible').count(), 0, '初回ホームに入力欄が露出している');

  await page.locator('#startConversation').click();
  assert.equal(await visible('#conversationComposer'), true, '会話入力が開かない');
  assert.equal(await page.locator('.yos-question:visible').count(), 1, '一度に複数の質問を表示している');
  assert.equal((await page.locator('.raw-input-label').textContent()).trim().startsWith('話したいこと'), true, '入口で内部保存用語を操作させている');
  await page.locator('#rawInput').fill('仕事のことが気になった。でも、何が事実かはまだ整理できていない。');
  await page.waitForTimeout(100);
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('hj-daily-scenes-v1') || '[]')[0]);
  assert.match(draft?.rawInput || '', /何が事実かはまだ整理できていない/, '本人の原文が下書き保存されない');
  assert.equal(draft?.fact, '', '本人の原文を事実として保存した');
  assert.deepEqual(draft?.confirmedFacts, [], '本人未確認の事実を保存した');
  assert.deepEqual(draft?.candidates, [], 'AI未接続なのに整理候補を生成した');
  assert.equal(draft?.conversationStatus, 'draft', '下書き状態が保存されない');

  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.locator('#onboardingDialog').evaluate((node) => node.open), false, '再起動で初回設定が強制表示された');
  assert.equal(await visible('#conversationResume'), true, '再起動後に前回の続きが分からない');
  assert.equal(await page.locator('#startConversation').textContent(), '続きを話す', '下書き再開が主要CTAになっていない');
  assert.equal(await visible('#startNewConversation'), true, '下書きを壊さず別のことを話す導線がない');
  assert.equal(await page.locator('#conversationHome .primary:visible').count(), 1, '戻った時に主要CTAが複数ある');
  await page.screenshot({ path: `test-results/hj-resume-${browserName}.png`, fullPage: true });
  await page.locator('#startConversation').click();
  assert.match(await page.locator('#rawInput').inputValue(), /仕事のことが気になった/, '保存した原文から再開できない');
  await page.locator('#finishRawInput').click();
  assert.equal(await visible('#rawSaved'), true, '原文保存完了が分からない');
  assert.equal(await visible('#conversationResume'), false, '完了済みの原文を未完了の続きとして表示した');
  assert.equal(await visible('#startNewConversation'), false, '完了後も別会話導線を重複表示している');
  assert.equal(await page.locator('#startConversation').textContent(), '今のことを話す', '完了後に次回の自然な入口へ戻らない');
  const rawRecord = await page.evaluate(() => JSON.parse(localStorage.getItem('hj-daily-scenes-v1') || '[]')[0]);
  assert.equal(rawRecord?.conversationStatus, 'raw', '本人の原文として保存完了できない');
  assert.equal(rawRecord?.fact, '', '保存完了時に本人の原文を事実へ変換した');

  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await visible('#conversationResume'), false, '再起動後に完了済み原文を再開候補として表示した');
  assert.equal(await page.locator('#startConversation').textContent(), '今のことを話す', '再起動後に新しい会話入口へ戻らない');

  await page.locator('#openPastStories').click();
  assert.equal(await visible('#storyHistorySection'), true, 'これまでの物語を閲覧できない');
  assert.equal(await page.locator('#storyEditor').evaluate((node) => node.open), false, 'これまでを見る操作で物語作成フォームを開いた');
  assert.equal(await page.locator('#storyPanel input:visible, #storyPanel textarea:visible, #storyPanel select:visible').count(), 0, 'これまでを見る画面に入力欄が露出している');
  await page.screenshot({ path: `test-results/hj-past-read-first-${browserName}.png`, fullPage: true });

  await page.locator('#editProfile').click();
  assert.equal(await page.locator('#onboardingDialog').evaluate((node) => node.open), true, '設定を任意で開けない');
  assert.equal(await page.locator('#profileStage').inputValue(), '', '新規利用者の現在地が「分からない」にならない');

  await page.locator('#profileName').fill('テスト主人公');
  await page.locator('#profileDomain').selectOption('work');
  assert.equal(await page.locator('#profileStage').inputValue(), '', '旅を選ぶと現在地不明が失われる');
  await page.locator('#profileTheme').fill('自分の物語を記録する');
  await page.locator('#profileFormat').selectOption('picturebook');
  await page.locator('#profileTone').selectOption('direct');
  await waitReload(() => page.locator('#onboardingForm button[type="submit"]').click());

  await page.waitForSelector('#conversationHome');
  const initialJourney = await page.evaluate(() => JSON.parse(localStorage.getItem('hj-domain-journeys-v1') || '[]')[0]);
  assert.equal(initialJourney?.stageUnknown, true, '現在地不明のまま初回設定を保存できない');
  assert.equal(await page.locator('#activeStage').textContent(), '分からない', '保存後に現在地不明を表示できない');

  await page.locator('#editProfile').click();
  assert.equal(await page.locator('#onboardingDialog').evaluate((node) => node.open), true, '設定を開き直せない');
  assert.equal(await page.locator('#profileStage').inputValue(), '', '設定を開き直すと現在地不明が失われる');
  await page.locator('#profileStage').selectOption({ label: '冒険への誘い' });
  await waitReload(() => page.locator('#onboardingForm button[type="submit"]').click());

  await page.waitForSelector('#conversationHome');
  assert.match(await page.locator('#heroTitle').textContent(), /テスト主人公/, '名前が反映されない');
  assert.equal(await page.locator('.journey-card').count(), 5, '初期の5領域がない');
  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('hj-user-preferences-v1') || '{}'));
  assert.equal(preferences.storyFormat, 'picturebook');
  assert.equal(preferences.mentorTone, 'direct');

  await page.locator('#openCurrentLocation').click();
  assert.equal(await visible('#currentLocationSection'), true, '現在地ダッシュボードが表示されない');
  assert.equal(await page.locator('#currentLocationEditor').evaluate((node) => node.open), false, '現在地を見る操作で詳細編集を開いた');
  assert.equal(await page.locator('#journeysPanel input:visible, #journeysPanel textarea:visible, #journeysPanel select:visible').count(), 0, '現在地を見る画面に入力欄が露出している');
  assert.match(await page.locator('#currentStageSummary').textContent(), /冒険への誘い/, '現在地を読む表示が保存済みデータを反映しない');
  await page.screenshot({ path: `test-results/hj-current-read-first-${browserName}.png`, fullPage: true });
  await page.locator('#currentLocationEditor > summary').click();
  assert.equal(await visible('#mapCompass'), true, '明示操作で現在地の詳細編集を開けない');
  await page.locator('#mapCompass').fill('生活を安全に立て直す');
  await page.locator('#mapStage').selectOption({ label: '帰路' });
  await page.locator('.map-details').first().locator(':scope > summary').click();
  await page.locator('#mapRealityBody').fill('睡眠不足');
  await page.locator('#mapRealityMind').fill('まだ整理できていない');
  await page.locator('#mapControllable').fill('事実を確認して、一人で抱え込まず連絡する');
  await page.locator('#mapQuest').fill('帰宅したら歯を磨く');
  await page.locator('#mapTreasure').fill('まだ意味は分からない');
  await page.locator('.map-details').nth(1).locator(':scope > summary').click();
  for (let index = 0; index < 3; index += 1) {
    await page.locator('[data-archetype-id]').nth(index).click();
  }
  await page.locator('[data-archetype-id]').nth(3).click();
  assert.equal(await page.locator('[data-archetype-id][aria-pressed="true"]').count(), 3, '今前へ出ている力が3つを超える');
  assert.match(await page.locator('#appStatus').textContent(), /最大3つ/, '最大3つの案内が出ない');
  await page.locator('#mapNeededArchetype').selectOption('sage');
  await page.locator('#mapArchetypeBalance').selectOption('unknown');
  await page.locator('#mapArchetypeNote').fill('<img src=x onerror=alert(1)>まだ分からない');
  await waitReload(() => page.locator('#saveCurrentLocation').click());

  const currentLocation = await page.evaluate(() => JSON.parse(localStorage.getItem('hj-domain-journeys-v1') || '[]')[0]);
  assert.equal(currentLocation.compass, '生活を安全に立て直す');
  assert.equal(currentLocation.quest, '帰宅したら歯を磨く');
  assert.equal(currentLocation.reality.body, '睡眠不足');
  assert.equal(currentLocation.archetypes.active.length, 3);
  assert.equal(currentLocation.archetypes.needed, 'sage');
  assert.equal(currentLocation.archetypes.balance, 'unknown');
  assert.equal(await page.locator('#mapArchetypeNote').inputValue(), 'img src=x onerror=alert(1)まだ分からない', '未承認HTMLが安全な文字列へ正規化されない');
  assert.equal(await page.locator('#currentLocationSection img').count(), 0, '未承認HTMLが要素として表示された');
  assert.equal(await page.locator('[data-archetype-score]').count(), 0, 'アーキタイプを点数化している');
  assert.match(await page.locator('#currentSummaryList').textContent(), /帰宅したら歯を磨く/, '現在地の閲覧表示に次の一手が反映されない');

  await page.locator('#openCurrentLocation').click();
  assert.equal(await page.locator('#journeyEditor').evaluate((node) => node.open), false, '領域別編集が初期表示で開いている');
  await page.locator('#journeyEditor > summary').click();
  const firstCard = page.locator('.journey-card').first();
  await firstCard.locator('[data-role="stage"]').selectOption({ label: '宝を持って帰還' });
  await firstCard.locator('[data-role="cycle"]').fill('1');
  await firstCard.locator('[data-role="save"]').click();
  await page.waitForTimeout(200);
  await firstCard.locator('[data-role="stage"]').selectOption({ label: '日常世界' });
  await firstCard.locator('[data-role="save"]').click();
  await page.waitForTimeout(250);
  assert.equal(await firstCard.locator('[data-role="cycle"]').inputValue(), '2', '12→1で周回が増えない');
  assert.notEqual(await page.locator('#historySummary').textContent(), '0件', '螺旋履歴が保存されない');

  await page.locator('#openScene').click();
  assert.equal(await visible('#scenePanel'), true, '今日のシーン画面へ移動できない');
  assert.equal(await page.locator('#sceneEditor').evaluate((node) => node.open), false, '今日のシーン詳細が初期表示で開いている');
  assert.equal(await page.locator('#scenePanel input:visible, #scenePanel textarea:visible, #scenePanel select:visible').count(), 0, '今日のシーン画面に入力欄が露出している');
  await page.locator('#sceneEditor > summary').click();
  assert.equal(await visible('#sceneFact'), true, '明示操作で今日のシーン詳細を開けない');
  await page.locator('#sceneFact').fill('テスト中に、今日の出来事を一件記録した。');
  await page.locator('#sceneFeeling').fill('まだ落ち着かない。');
  await page.locator('#sceneChoice').fill('事実だけを書いた。');
  await page.locator('#sceneResult').fill('記録が保存された。');
  await page.locator('#sceneReflection').fill('短い入力なら続けやすいという今の解釈。');
  await page.locator('#sceneControllable').fill('次も事実から書く。');
  await page.locator('#sceneNext').fill('明日も一件だけ記録する。');
  await page.locator('#scenePanel .map-details').locator(':scope > summary').click();
  await page.locator('#sceneArchetype1').selectOption('sage');
  await page.locator('#sceneArchetype2').selectOption('caregiver');
  await page.locator('#sceneNeededArchetype').selectOption('explorer');
  await page.locator('#sceneArchetypeBalance').selectOption('helping');
  await page.locator('#saveScene').click();
  await page.waitForSelector('#sceneHistory .scene-item');
  assert.match(await page.locator('#sceneHistory').textContent(), /今日の出来事を一件記録/);
  assert.match(await page.locator('#sceneHistory').textContent(), /まだ落ち着かない/);
  const questAfterScene = await page.evaluate(() => JSON.parse(localStorage.getItem('hj-domain-journeys-v1') || '[]')[0]?.quest);
  assert.equal(questAfterScene, '明日も一件だけ記録する。', 'シーンで本人が決めた次の一手が注目中の旅へつながらない');

  await page.locator('#sceneHistory .scene-edit').first().click();
  assert.equal(await page.locator('#sceneEditDialog').evaluate((node) => node.open), true, '編集画面が開かない');
  await page.locator('#editSceneResult').fill('編集後の結果が保存された。');
  await waitReload(() => page.locator('#sceneEditForm button[type="submit"]').click());
  await page.locator('#openCurrentLocation').click();
  await page.locator('[data-tab="scenes"]').click();
  await page.waitForSelector('#sceneHistory .scene-item');
  assert.match(await page.locator('#sceneHistory').textContent(), /編集後の結果が保存された/);

  await page.locator('#collectWeek').click();
  assert.equal(await visible('#storyPanel'), true, '今週の物語へ移動できない');
  assert.equal(await page.locator('#storyEditor').evaluate((node) => node.open), true, '明示的な物語作成操作で入力欄が開かない');
  assert.match(await page.locator('#storyFacts').inputValue(), /今日の出来事を一件記録/);
  await page.locator('[data-format="newspaper"]').click();
  await page.locator('#storyNext').fill('明日も一件だけ記録する。');
  await page.locator('#buildStory').click();
  assert.equal(await visible('#previewSection'), true, '作品プレビューが表示されない');
  assert.match(await page.locator('#storyWork').textContent(), /ノンフィクション/);
  await page.locator('#saveStory').click();
  await page.waitForSelector('#storyHistory article');
  assert.equal(await page.locator('#storyHistory article').count(), 1, '作品が本棚に保存されない');

  const imageDownload = page.waitForEvent('download');
  await page.locator('#shareStoryImage').click();
  const image = await imageDownload;
  assert.match(image.suggestedFilename(), /\.png$/i, '画像共有がPNGではない');
  await image.saveAs(`test-results/hj-weekly-story-${browserName}.png`);

  const backupDownload = page.waitForEvent('download');
  await page.locator('#exportData').click();
  const backup = await backupDownload;
  assert.match(backup.suggestedFilename(), /\.json$/i, 'バックアップがJSONではない');
  const backupPath = `test-results/hj-backup-${browserName}.json`;
  await backup.saveAs(backupPath);

  page.once('dialog', (dialog) => dialog.accept());
  await waitReload(() => page.locator('#resetData').click());
  const cleared = await page.evaluate(() => ({
    profile: localStorage.getItem('hj-user-profile-v1'),
    scenes: localStorage.getItem('hj-daily-scenes-v1'),
    stories: localStorage.getItem('hj-weekly-stories-v1')
  }));
  assert.equal(cleared.profile, null, '全削除後もプロフィールが残っている');
  assert.equal(cleared.scenes, null, '全削除後もシーンが残っている');
  assert.equal(cleared.stories, null, '全削除後も作品が残っている');

  await page.locator('#importFile').setInputFiles(backupPath);
  await settleReload();
  await page.waitForSelector('#conversationHome');
  assert.match(await page.locator('#heroTitle').textContent(), /テスト主人公/, '復元後に名前が戻らない');
  const restored = await page.evaluate(() => ({
    journeys: JSON.parse(localStorage.getItem('hj-domain-journeys-v1') || '[]'),
    scenes: JSON.parse(localStorage.getItem('hj-daily-scenes-v1') || '[]'),
    stories: JSON.parse(localStorage.getItem('hj-weekly-stories-v1') || '[]'),
    history: JSON.parse(localStorage.getItem('hj-stage-history-v1') || '[]'),
    preferences: JSON.parse(localStorage.getItem('hj-user-preferences-v1') || '{}')
  }));
  assert.equal(restored.journeys[0]?.cycle, 2, '復元後に周回数が戻らない');
  assert.equal(restored.journeys[0]?.compass, '生活を安全に立て直す', '復元後にコンパスが戻らない');
  assert.equal(restored.journeys[0]?.archetypes?.active?.length, 3, '復元後にアーキタイプが戻らない');
  assert.equal(restored.scenes.length, 2, '復元後に既存シーンと本人の原文が戻らない');
  assert.equal(restored.scenes[0]?.result, '編集後の結果が保存された。', '編集済み結果が復元されない');
  assert.equal(restored.scenes[0]?.feeling, 'まだ落ち着かない。', '復元後に感情が戻らない');
  assert.equal(restored.scenes[0]?.activeArchetypes?.length, 2, '復元後に場面のアーキタイプが戻らない');
  assert.match(restored.scenes[1]?.rawInput || '', /何が事実かはまだ整理できていない/, '復元後に本人の原文が戻らない');
  assert.equal(restored.scenes[1]?.fact, '', '復元時に本人の原文を事実へ変換した');
  assert.equal(restored.stories.length, 1, '復元後に作品が戻らない');
  assert.ok(restored.history.length > 0, '復元後に螺旋履歴が戻らない');
  assert.equal(restored.preferences.storyFormat, 'picturebook', '物語形式が復元されない');
  assert.equal(restored.preferences.mentorTone, 'direct', 'YOSの話し方が復元されない');

  await page.locator('#openCurrentLocation').click();
  await page.locator('#consultYos').click();
  await page.waitForTimeout(150);
  assert.match(await page.locator('#appStatus').textContent(), /コピー/, 'YOS相談データを作れない');

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  assert.ok(overflow.scrollWidth <= overflow.width + 1, `横スクロールが発生: ${JSON.stringify(overflow)}`);

  const cacheStatus = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    const paths = [
      './index.html', './styles.css', './onboarding.css', './scenes.css', './completion.css',
      './archetypes.js', './bootstrap.js', './app.js', './profile.js', './scenes.js', './history.js',
      './editor.js', './story-image.js', './data-complete.js', './current-location.js', './manifest.webmanifest'
    ];
    const entries = await Promise.all(paths.map(async (path) => {
      const url = new URL(path, location.href).href;
      return [path, Boolean(await caches.match(url))];
    }));
    return Object.fromEntries(entries);
  });
  for (const [path, cached] of Object.entries(cacheStatus)) {
    assert.equal(cached, true, `オフラインキャッシュ漏れ: ${path}`);
  }

  await page.reload({ waitUntil: 'networkidle' });
  if (browserName === 'chromium') {
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    assert.match(await page.locator('#heroTitle').textContent(), /テスト主人公/, 'オフライン再起動できない');
    await context.setOffline(false);
  } else {
    assert.match(await page.locator('#heroTitle').textContent(), /テスト主人公/, 'WebKit再起動後に保存状態が戻らない');
  }

  await page.screenshot({ path: `test-results/hj-se3-full-${browserName}.png`, fullPage: true });
  assert.deepEqual(pageErrors, [], `ページ例外: ${pageErrors.join(' | ')}`);
  console.log(`HJ smoke test passed: ${browserName}`);
} finally {
  await browser.close();
}
