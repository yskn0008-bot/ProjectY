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
  acceptDownloads: true,
  permissions: ['clipboard-read', 'clipboard-write']
});
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.error(`[${browserName}] ${message.text()}`);
});

const visible = async (selector) => page.locator(selector).isVisible();
const waitReload = async (action) => {
  await action();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(350);
};

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  assert.equal(await page.locator('#onboardingDialog').evaluate((node) => node.open), true, '初回設定が開かない');

  await page.locator('#profileName').fill('テスト主人公');
  await page.locator('#profileDomain').selectOption('work');
  await page.locator('#profileStage').selectOption({ label: '冒険への誘い' });
  await page.locator('#profileTheme').fill('自分の物語を記録する');
  await page.locator('#profileFormat').selectOption('picturebook');
  await page.locator('#profileTone').selectOption('direct');
  await waitReload(() => page.locator('#onboardingForm button[type="submit"]').click());

  await page.waitForSelector('#heroTitle');
  assert.match(await page.locator('#heroTitle').textContent(), /テスト主人公/, '名前が反映されない');
  assert.equal(await page.locator('.journey-card').count(), 5, '初期の5領域がない');
  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('hj-user-preferences-v1') || '{}'));
  assert.equal(preferences.storyFormat, 'picturebook');
  assert.equal(preferences.mentorTone, 'direct');

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
  await page.locator('#sceneFact').fill('テスト中に、今日の出来事を一件記録した。');
  await page.locator('#sceneChoice').fill('事実だけを書いた。');
  await page.locator('#sceneResult').fill('記録が保存された。');
  await page.locator('#sceneReflection').fill('短い入力なら続けやすいと感じた。');
  await page.locator('#saveScene').click();
  await page.waitForSelector('#sceneHistory .scene-item');
  assert.match(await page.locator('#sceneHistory').textContent(), /今日の出来事を一件記録/);

  await page.locator('#sceneHistory .scene-edit').first().click();
  assert.equal(await page.locator('#sceneEditDialog').evaluate((node) => node.open), true, '編集画面が開かない');
  await page.locator('#editSceneResult').fill('編集後の結果が保存された。');
  await waitReload(() => page.locator('#sceneEditForm button[type="submit"]').click());
  await page.locator('[data-tab="scenes"]').click();
  await page.waitForSelector('#sceneHistory .scene-item');
  assert.match(await page.locator('#sceneHistory').textContent(), /編集後の結果が保存された/);

  await page.locator('#collectWeek').click();
  assert.equal(await visible('#storyPanel'), true, '今週の物語へ移動できない');
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
  await backup.saveAs(`test-results/hj-backup-${browserName}.json`);

  await page.locator('#consultYos').click();
  await page.waitForTimeout(150);
  assert.match(await page.locator('#appStatus').textContent(), /コピー/, 'YOS相談データを作れない');

  const overflow = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  assert.ok(overflow.scrollWidth <= overflow.width + 1, `横スクロールが発生: ${JSON.stringify(overflow)}`);

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  assert.match(await page.locator('#heroTitle').textContent(), /テスト主人公/, 'オフライン再起動できない');
  await context.setOffline(false);

  await page.screenshot({ path: `test-results/hj-se3-full-${browserName}.png`, fullPage: true });
  assert.deepEqual(pageErrors, [], `ページ例外: ${pageErrors.join(' | ')}`);
  console.log(`HJ smoke test passed: ${browserName}`);
} finally {
  await browser.close();
}
