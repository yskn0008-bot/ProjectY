import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (name) => readFile(new URL('../' + name, import.meta.url), 'utf8');

test('morning and night extend the existing Life store', async () => {
  const [home, page] = await Promise.all([read('home-v1.js'), read('index.html')]);
  assert.match(home, /const DATA_KEY='yos-life-v1'/);
  assert.match(home, /activeLifeDate/);
  assert.match(page, /data\.activeLifeDate/);
  for (const field of ['workMode','protect','desiredScene','startedAt','endedAt','fact','choice','result','discomfort','tomorrowImportant']) {
    assert.match(home, new RegExp(field + ':'));
  }
  assert.doesNotMatch(home, /localStorage\.clear\(/);
  assert.doesNotMatch(home, /yos-life-daily-flow|yos-life-money/);
});

test('Money remains a compact safety view without automatic advice', async () => {
  const home = await read('home-v1.js');
  for (const field of ['currentBalance','nextIncomeDate','requiredPayments','protectedMoney','freeMoney','todayBudget','nextPayment','danger']) {
    assert.match(home, new RegExp(field + ':'));
  }
  assert.match(home, /投資・税務・支払い判断を自動で断定しません/);
});

test('Life calendar uses progressive disclosure and the existing store', async () => {
  const [home,page] = await Promise.all([read('home-v1.js'),read('index.html')]);
  assert.match(home, /lifeCalendar/);
  assert.match(home, /<h3 id="lifeCalendarTodayLabelV1">今日<\/h3>/);
  assert.match(home, /<h3 id="lifeCalendarTomorrowLabelV1">明日<\/h3>/);
  assert.match(home, /<h3 id="lifeCalendarSoonLabelV1">もうすぐ<\/h3>/);
  assert.match(home, /<details class="life-calendar-details-v1">/);
  assert.match(home, /<summary>予定を見る<\/summary>/);
  assert.match(home, /金額と支払い済み／未払いは、確認できる情報がある時だけ表示します/);
  assert.doesNotMatch(home, /yos-life-calendar-v1/);
  assert.match(page, /<script src="\.\/yos-suite-v3\.js\?v=8"><\/script>\s*<\/body>/, 'first open must load the Life home without a service-worker reload');
  assert.match(home, /data-life-rating-target="lifeMorningHealthV1"/, 'health must be selectable with one tap');
  assert.match(home, /data-life-rating-target="lifeMorningMoodV1"/, 'mood must be selectable with one tap');
  assert.match(page, /data-checkin-rating="health"/, 'the preserved status form must use one-tap health choices');
});

test('HJ snapshot is facts-only and user-controlled', async () => {
  const home = await read('home-v1.js');
  assert.match(home, /life-hj-export-v1/);
  assert.match(home, /selfReport:/);
  assert.match(home, /hjSnapshot=buildSnapshot/);
  assert.match(home, /事実スナップショットをコピー/);
  assert.doesNotMatch(home, /\b(?:stage|archetype|xp|growth|destiny)\s*:/i);
});

test('iPhone layout keeps the flow within a single compact column', async () => {
  const css = await read('home-priority-v1.css');
  assert.match(css, /\.life-daily-flow-v1\{[^}]*overflow:hidden/);
  assert.match(css, /@media\(max-width:430px\)/);
  assert.doesNotMatch(css, /width:\s*[5-9]\d\dpx/);
});
