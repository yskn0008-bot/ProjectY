import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const browserName = process.env.LIFE_BROWSER || 'chromium';
const engine = { chromium, webkit }[browserName];
if (!engine) throw new Error(`Unsupported browser: ${browserName}`);

const baseURL = process.env.LIFE_BASE_URL || 'http://127.0.0.1:4173/life/';
const lifeDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const nextHour = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const followingHour = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

const browser = await engine.launch();
const context = await browser.newContext({
  viewport: { width: 375, height: 667 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'ja-JP',
  timezoneId: 'Asia/Tokyo'
});
await context.addInitScript(({ date, start, end }) => {
  if (localStorage.getItem('yos-life-v1')) return;
  localStorage.setItem('yos-life-v1', JSON.stringify({
    days: {
      [date]: {
        schedule: [{ id: 'existing-event', title: '既存の予定', start, end, category: 'personal' }],
        tasks: [{ text: '既存タスク', done: false, category: 'personal' }],
        routines: { wake: [0], before: [], home: [] },
        checkin: { sleep: '6.5', health: '3', mood: '2' },
        doneToday: '既存のできたこと'
      }
    },
    activeGroup: 'wake'
  }));
}, { date: lifeDate, start: nextHour, end: followingHour });

const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', error => pageErrors.push(error.message));

const waitForDailyFlow = async () => {
  await page.waitForSelector('#lifeDailyFlowV1');
  await page.waitForFunction(() => Boolean(document.getElementById('lifeFlowDateV1')?.textContent.trim()));
};
const clickAndWaitForReload = async locator => {
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    locator.click()
  ]);
  await waitForDailyFlow();
};

try {
  await page.goto(baseURL, { waitUntil: 'networkidle' });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForDailyFlow();

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    mainPaddingBottom: Number.parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom)
  }));
  assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `horizontal overflow: ${layout.scrollWidth}/${layout.clientWidth}`);
  assert.ok(layout.mainPaddingBottom >= 90, 'fixed navigation does not have enough safe bottom space');
  assert.match(await page.locator('#lifeMorningNextEventV1').textContent(), /既存の予定/, 'existing schedule is not restored');

  await page.locator('#lifeWorkModeV1').selectOption('work');
  await page.locator('#lifeMorningSleepV1').fill('7');
  await page.locator('#lifeMorningHealthV1').fill('4');
  await page.locator('#lifeMorningMoodV1').fill('3');
  await page.locator('#lifeProtectV1').fill('睡眠を守る');
  await page.locator('#lifeMorningTaskV1').fill('連絡を一件返す');
  await page.locator('#lifeDesiredSceneV1').fill('歯を磨いて横になる');
  await page.locator('.life-money-v1 summary').click();
  await page.locator('#lifeMoneyBalanceV1').fill('50000');
  await page.locator('#lifeMoneyIncomeDateV1').fill(lifeDate);
  await page.locator('#lifeMoneyRequiredV1').fill('家賃 30000');
  await page.locator('#lifeMoneyProtectedV1').fill('30000');
  await page.locator('#lifeMoneyFreeV1').fill('20000');
  await page.locator('#lifeMoneyBudgetV1').fill('3000');
  await page.locator('#lifeMoneyNextPaymentV1').fill('家賃 30000');
  await page.locator('#lifeMoneyDangerV1').selectOption('watch');
  await clickAndWaitForReload(page.locator('#lifeStartDayV1'));

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('yos-life-v1')));
  assert.equal(saved.activeLifeDate, lifeDate);
  assert.equal(saved.days[lifeDate].lifeFlow.protect, '睡眠を守る');
  assert.equal(saved.days[lifeDate].tasks[0].text, '連絡を一件返す');
  assert.equal(saved.days[lifeDate].schedule[0].title, '既存の予定');
  assert.equal(saved.moneySafety.todayBudget, '3000');
  assert.equal(saved.days[lifeDate].doneToday, '既存のできたこと');

  const carriedDate = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('yos-life-v1'));
    const original = data.activeLifeDate;
    const date = new Date(`${original}T12:00:00+09:00`);
    date.setDate(date.getDate() - 1);
    const carried = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(date);
    data.days[carried] = data.days[original];
    delete data.days[original];
    data.activeLifeDate = carried;
    localStorage.setItem('yos-life-v1', JSON.stringify(data));
    return carried;
  });
  await page.reload({ waitUntil: 'networkidle' });
  await waitForDailyFlow();
  assert.equal(await page.locator('#lifeFlowDateV1').textContent(), carriedDate, 'open Life day was split at midnight');
  assert.equal(await page.locator('#lifeMorningTaskV1').inputValue(), '連絡を一件返す');

  await page.locator('[data-life-flow-tab="night"]').click();
  await page.locator('#lifeNightDoneV1').fill('連絡を一件返した');
  await page.locator('#lifeNightSpentV1').fill('1200');
  await page.locator('#lifeNightFactV1').fill('予定の連絡を一件返した。');
  await page.locator('#lifeNightChoiceV1').fill('短い文章で返信した。');
  await page.locator('#lifeNightResultV1').fill('返信済みになった。');
  await page.locator('#lifeNightDiscomfortV1').fill('まだ落ち着かない。');
  await page.locator('#lifeTomorrowImportantV1').fill('起きたら予定を確認する。');
  await clickAndWaitForReload(page.locator('#lifeEndDayV1'));

  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('yos-life-v1')));
  const closed = saved.days[carriedDate];
  assert.equal(saved.lastClosedLifeDate, carriedDate);
  assert.ok(closed.lifeFlow.endedAt);
  assert.equal(closed.money.spentToday, '1200');
  assert.equal(closed.hjSnapshot.schema, 'life-hj-export-v1');
  assert.equal(closed.hjSnapshot.selfReport.fact, '予定の連絡を一件返した。');
  assert.equal(closed.hjSnapshot.selfReport.choice, '短い文章で返信した。');
  assert.equal(closed.hjSnapshot.selfReport.result, '返信済みになった。');
  assert.equal(closed.hjSnapshot.selfReport.discomfort, 'まだ落ち着かない。');
  assert.equal(Object.hasOwn(closed.hjSnapshot, 'stage'), false, 'HJ stage must not be inferred');

  await page.evaluate(() => navigator.serviceWorker.ready);
  const cacheStatus = await page.evaluate(async () => {
    const paths = [
      './', './index.html', './manifest.webmanifest', './yos-suite-v3.js?v=5',
      './home-v1.js?v=3', './home-v1.css?v=2', './home-priority-v1.css?v=2'
    ];
    const entries = await Promise.all(paths.map(async path => [
      path,
      Boolean(await caches.match(new URL(path, location.href).href))
    ]));
    return Object.fromEntries(entries);
  });
  for (const [path, cached] of Object.entries(cacheStatus)) {
    assert.equal(cached, true, `offline cache is missing ${path}`);
  }
  if (browserName === 'chromium') {
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDailyFlow();
    assert.equal(await page.locator('#lifeDailyFlowV1').isVisible(), true, 'daily flow is not available offline');
    await context.setOffline(false);
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDailyFlow();
    const restoredDone = await page.evaluate(date => JSON.parse(localStorage.getItem('yos-life-v1')).days[date].doneToday, carriedDate);
    assert.equal(restoredDone, '連絡を一件返した', 'WebKit reload did not restore the closed day');
  }
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
  console.log(`Life daily flow smoke passed: ${browserName}`);
} finally {
  await browser.close();
}
