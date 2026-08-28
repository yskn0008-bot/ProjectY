import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
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
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
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
  await page.waitForSelector('#lifeCalendarV1', { state: 'attached' });
  await page.waitForSelector('#lifeDailyFlowV1', { state: 'attached' });
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
  await waitForDailyFlow();
  assert.equal(await page.locator('#lifeCalendarV1').isVisible(), false, 'Life calendar detail must stay behind the compact home entry');
  await page.evaluate(() => navigator.serviceWorker.ready);

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    mainPaddingBottom: Number.parseFloat(getComputedStyle(document.querySelector('main')).paddingBottom)
  }));
  assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `horizontal overflow: ${layout.scrollWidth}/${layout.clientWidth}`);
  assert.ok(layout.mainPaddingBottom >= 76, 'fixed navigation does not have enough safe bottom space');
  assert.match(await page.locator('#lifeMorningNextEventV1').textContent(), /既存の予定/, 'existing schedule is not restored');
  assert.equal(await page.locator('.life-page-v1[data-page="home"] input').count(), 0, 'home must not ask for form input');
  assert.equal(await page.locator('#lifeDailyFlowV1').isVisible(), false, 'record form must stay behind the Record navigation');
  assert.equal(await page.locator('#homeSleepV1').textContent(), '6.5h', 'saved sleep is not summarized on home');
  assert.equal(await page.locator('#homeHealthV1').textContent(), '3/5', 'saved health is not summarized on home');
  assert.equal(await page.locator('#homeMoodV1').textContent(), '2/5', 'saved mood is not summarized on home');
  assert.equal(await page.locator('#homeFocusValueV1').textContent(), '既存タスク', 'saved task is not summarized on home');
  assert.equal(await page.locator('#homeDoneValueV1').textContent(), '既存のできたこと', 'saved done-today value is not summarized on home');
  assert.equal(await page.locator('.life-page-v1[data-page="home"] > :first-child').getAttribute('id'), 'lifeHomeDashboardV1', 'compact Life dashboard is not first');
  const lifeVisual = await page.evaluate(() => {
    const nav = document.getElementById('lifeBottomNavV1').getBoundingClientRect();
    const rhythm = document.querySelector('.home-rhythm-v1').getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      navTop: nav.top,
      navHeight: nav.height,
      contentBottom: rhythm.bottom,
      text: document.querySelector('.life-page-v1[data-page="home"]').innerText
    };
  });
  assert.equal(lifeVisual.width, 390);
  assert.ok(lifeVisual.navHeight >= 48 && lifeVisual.navHeight <= 72, `unexpected Life nav height: ${lifeVisual.navHeight}`);
  assert.ok(lifeVisual.contentBottom <= lifeVisual.navTop, `Life home exceeds one viewport: ${lifeVisual.contentBottom}/${lifeVisual.navTop}`);
  for (const label of ['今日のくらし','カレンダー','タスク','習慣','メモ','今日の予定','次のタスク','暮らしのリズム']) {
    assert.match(lifeVisual.text, new RegExp(label), `Life home is missing ${label}`);
  }
  await mkdir('test-results', { recursive: true });
  await page.screenshot({ path: `test-results/life-home-390-${browserName}.png`, fullPage: false });

  const yosPage = await context.newPage();
  const yosURL = new URL('../yos/', baseURL).href;
  await yosPage.goto(yosURL, { waitUntil: 'networkidle' });
  await yosPage.waitForSelector('#homePage');
  const yosVisual = await yosPage.evaluate(() => {
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
    const next = document.querySelector('.next-step').getBoundingClientRect();
    return {
      width: innerWidth,
      navTop: nav.top,
      navHeight: nav.height,
      contentBottom: next.bottom,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      text: document.body.innerText
    };
  });
  assert.equal(yosVisual.width, 390);
  assert.ok(yosVisual.scrollWidth <= yosVisual.clientWidth + 1, `YOS horizontal overflow: ${yosVisual.scrollWidth}/${yosVisual.clientWidth}`);
  assert.ok(yosVisual.navHeight >= 48 && yosVisual.navHeight <= 72, `unexpected YOS nav height: ${yosVisual.navHeight}`);
  assert.ok(yosVisual.contentBottom <= yosVisual.navTop, `YOS home exceeds one viewport: ${yosVisual.contentBottom}/${yosVisual.navTop}`);
  for (const label of ['MY WAY','人生ナビ','今ここ','行き先','ここまで','人生ルート','次の一歩','Home','Life','Money','Journey','Idea']) {
    assert.match(yosVisual.text, new RegExp(label), `YOS home is missing ${label}`);
  }
  await yosPage.screenshot({ path: `test-results/yos-home-390-${browserName}.png`, fullPage: false });
  await yosPage.close();

  await page.locator('.life-feature-grid-v1 [data-open-page="schedule"]').first().click();
  assert.equal(await page.locator('#lifeCalendarV1').isVisible(), true, 'Life calendar does not open from the compact home');
  assert.equal(await page.locator('#lifeCalendarTodayLabelV1').textContent(), '今日');
  assert.equal(await page.locator('#lifeCalendarTomorrowLabelV1').textContent(), '明日');
  assert.equal(await page.locator('#lifeCalendarSoonLabelV1').textContent(), 'もうすぐ');
  await page.locator('.life-calendar-details-v1 summary').click();
  assert.equal(await page.locator('#lifeCalendarUpcomingV1').isVisible(), true, 'calendar details do not progressively disclose');
  const calendarContract = await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('yos-life-v1'));
    const titles = date => window.__yosLifeCalendarV1.itemsForDate(data,date).map(item => item.title);
    return {
      count: data.lifeCalendar.length,
      monday: titles('2026-08-17'),
      rentWeekend: titles('2026-10-10'),
      rentWeekday: titles('2026-10-12'),
      waterSeptember: titles('2026-09-27'),
      waterOctober: titles('2026-10-27'),
      beforeDeadline: window.__yosLifeCalendarV1.displayFor(
        window.__yosLifeCalendarV1.itemsForDate(data,'2026-08-17')[0],
        new Date('2026-08-16T22:59:00Z')
      ),
      afterDeadline: window.__yosLifeCalendarV1.displayFor(
        window.__yosLifeCalendarV1.itemsForDate(data,'2026-08-17')[0],
        new Date('2026-08-16T23:01:00Z')
      )
    };
  });
  assert.equal(calendarContract.count, 12, 'known schedules were not seeded in the existing Life store');
  assert.ok(calendarContract.monday.includes('缶・ビン・紙・有害ゴミ'));
  assert.equal(calendarContract.rentWeekend.includes('家賃収入'), false, 'weekend rent income was not rolled forward');
  assert.ok(calendarContract.rentWeekday.includes('家賃収入'));
  assert.ok(calendarContract.waterSeptember.includes('水道'));
  assert.equal(calendarContract.waterOctober.includes('水道'), false);
  assert.deepEqual(calendarContract.beforeDeadline, {past:false,label:'朝8時まで'});
  assert.deepEqual(calendarContract.afterDeadline, {past:true,label:'朝8時を過ぎました'});

  await page.locator('#lifeBottomNavV1 [data-page="record"]').click();
  assert.equal(await page.locator('#lifeDailyFlowV1').isVisible(), true, 'Record must open the input flow in one action');
  await page.locator('#lifeWorkModeV1').selectOption('work');
  await page.locator('#lifeMorningSleepV1').fill('7');
  await page.locator('[data-life-rating-target="lifeMorningHealthV1"][data-life-rating-value="4"]').click();
  await page.locator('[data-life-rating-target="lifeMorningMoodV1"][data-life-rating-value="3"]').click();
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
  assert.equal(await page.locator('.life-page-v1[data-page="home"]').isVisible(), true, 'morning save must return to the reading home');

  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('yos-life-v1')));
  assert.equal(saved.activeLifeDate, lifeDate);
  assert.equal(saved.days[lifeDate].lifeFlow.protect, '睡眠を守る');
  assert.equal(saved.days[lifeDate].tasks[0].text, '連絡を一件返す');
  assert.equal(saved.days[lifeDate].schedule[0].title, '既存の予定');
  assert.equal(saved.moneySafety.todayBudget, '3000');
  assert.equal(saved.days[lifeDate].doneToday, '既存のできたこと');
  assert.equal(saved.lifeCalendar.length, 12, 'daily save removed the Life calendar source of truth');

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
  assert.equal(await page.locator('.life-page-v1[data-page="home"]').isVisible(), true, 'relaunch must start on the reading home');
  await page.locator('#lifeBottomNavV1 [data-page="record"]').click();
  assert.equal(await page.locator('#lifeFlowDateV1').textContent(), carriedDate, 'open Life day was split at midnight');
  assert.equal(await page.locator('#lifeMorningTaskV1').inputValue(), '連絡を一件返す');
  assert.equal(await page.locator('#lifeMorningHealthV1').inputValue(), '4', 'one-tap health did not preserve the existing value format');
  assert.equal(await page.locator('#lifeMorningMoodV1').inputValue(), '3', 'one-tap mood did not preserve the existing value format');

  await page.locator('[data-life-flow-tab="night"]').click();
  await page.locator('#lifeNightDoneV1').fill('連絡を一件返した');
  await page.locator('#lifeNightSpentV1').fill('1200');
  await page.locator('#lifeNightFactV1').fill('予定の連絡を一件返した。');
  await page.locator('#lifeNightChoiceV1').fill('短い文章で返信した。');
  await page.locator('#lifeNightResultV1').fill('返信済みになった。');
  await page.locator('#lifeNightDiscomfortV1').fill('まだ落ち着かない。');
  await page.locator('#lifeTomorrowImportantV1').fill('起きたら予定を確認する。');
  await clickAndWaitForReload(page.locator('#lifeEndDayV1'));
  assert.equal(await page.locator('.life-page-v1[data-page="home"]').isVisible(), true, 'night save must return to the reading home');

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
      './', './index.html', './manifest.webmanifest', './yos-suite-v3.js?v=8',
      './home-v1.js?v=6', './home-v1.css?v=2', './home-priority-v1.css?v=4'
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
    assert.equal(await page.locator('#lifeCalendarV1').isVisible(), true, 'reading home is not available offline');
    await page.locator('#lifeBottomNavV1 [data-page="record"]').click();
    assert.equal(await page.locator('#lifeDailyFlowV1').isVisible(), true, 'record flow is not available offline');
    await context.setOffline(false);
  } else {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForDailyFlow();
    const restoredDone = await page.evaluate(date => JSON.parse(localStorage.getItem('yos-life-v1')).days[date].doneToday, carriedDate);
    assert.equal(restoredDone, '連絡を一件返した', 'WebKit reload did not restore the closed day');
  }
  await page.locator('#lifeBottomNavV1 [data-page="home"]').click();
  await page.screenshot({ path: `test-results/life-calendar-iphone17-${browserName}.png`, fullPage: true });
  await page.setViewportSize({ width: 375, height: 667 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForDailyFlow();
  const narrowLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth
  }));
  assert.ok(narrowLayout.scrollWidth <= narrowLayout.clientWidth + 1, `narrow horizontal overflow: ${narrowLayout.scrollWidth}/${narrowLayout.clientWidth}`);
  await page.screenshot({ path: `test-results/life-calendar-narrow-${browserName}.png`, fullPage: true });
  assert.deepEqual(pageErrors, [], `page errors: ${pageErrors.join(' | ')}`);
  console.log(`Life calendar and daily flow smoke passed: ${browserName}`);
} finally {
  await browser.close();
}
