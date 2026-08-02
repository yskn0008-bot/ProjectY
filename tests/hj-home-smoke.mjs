import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const browserName = process.env.HJ_BROWSER || 'chromium';
const engine = { chromium, webkit }[browserName];
if (!engine) throw new Error(`Unsupported browser: ${browserName}`);

const browser = await engine.launch();
const context = await browser.newContext({
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo'
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));

try {
  const homeURL = process.env.YOS_HOME_URL || 'http://127.0.0.1:4173/yos/';
  await page.goto(homeURL, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });

  const journey = page.locator('.domain-card.journey');
  await journey.waitFor();
  assert.match(await journey.getAttribute('href'), /\.\/hj\/$/, 'YOSホームのJourney導線が新HJを向いていない');
  assert.equal(await journey.locator('b').textContent(), "Hero's Journey", 'Journeyカード名が更新されない');
  assert.match(await journey.locator('small').textContent(), /複数の旅/, 'Journeyカード説明が更新されない');

  const cacheCheck = await page.evaluate(async () => ({
    entryCached: Boolean(await caches.match(new URL('./hj-entry.js', location.href).href)),
    cacheNames: await caches.keys()
  }));
  assert.equal(cacheCheck.entryCached, true, 'YOSホーム用HJ入口スクリプトがキャッシュされていない');

  const serviceWorkerSource = await page.evaluate(async () => fetch('./service-worker.js', { cache: 'no-store' }).then((response) => response.text()));
  assert.match(serviceWorkerSource, /key\.startsWith\('yos-command-center-'\)/, 'YOS以外のキャッシュまで削除する可能性がある');
  assert.doesNotMatch(serviceWorkerSource, /keys\.filter\(\(key\) => key !== CACHE\)/, '全アプリのキャッシュを削除する旧処理が残っている');

  await journey.click();
  await page.waitForLoadState('domcontentloaded');
  assert.match(page.url(), /\/yos\/hj\/$/, 'YOSホームからHJへ遷移できない');
  assert.deepEqual(errors, [], `YOSホームでページ例外: ${errors.join(' | ')}`);
  console.log(`YOS→HJ home smoke passed: ${browserName}`);
} finally {
  await browser.close();
}
