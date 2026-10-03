import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const read = (name) => readFile(new URL('../' + name, import.meta.url), 'utf8');

test('Night Reset rolls unfinished tasks forward without overwriting tomorrow', async () => {
  const source = await read('daily-flow-orchestrator-v1.js');
  const window = {};
  vm.runInNewContext(source, { window, Date, Intl });
  const api = window.__yosDailyFlowOrchestratorV1Api;
  assert.equal(typeof api?.prepareNextDay, 'function');

  const data = {
    days: {
      '2026-09-13': {
        tasks: [
          { text: '未完了A', done: false, category: 'personal' },
          { text: '完了B', done: true, category: 'personal' },
          { text: '未完了C', done: false, category: 'personal' }
        ],
        lifeFlow: {}
      },
      '2026-09-14': {
        tasks: [
          { text: '先にある予定', done: false, category: 'personal' },
          { text: '未完了C', done: false, category: 'personal' }
        ],
        lifeFlow: {}
      }
    }
  };

  const summary = api.prepareNextDay(
    data,
    '2026-09-13',
    '明日の重要予定',
    '2026-09-13T22:00:00.000Z'
  );

  assert.deepEqual(
    data.days['2026-09-14'].tasks.map(task => task.text),
    ['先にある予定', '未完了C', '未完了A'],
    'existing tomorrow tasks stay first, duplicate unfinished tasks are not copied twice'
  );
  assert.equal(summary.remainingCount, 2);
  assert.equal(summary.carriedCount, 1);
  assert.equal(summary.firstStep, '先にある予定');
  assert.equal(data.days['2026-09-14'].tasks[2].carriedFrom, '2026-09-13');
  assert.equal(data.days['2026-09-13'].lifeFlow.nightReset.nextDate, '2026-09-14');
  assert.equal(data.days['2026-09-14'].lifeFlow.preparedFromNight.sourceDate, '2026-09-13');
  assert.equal(data.days['2026-09-14'].lifeFlow.preparedFromNight.important, '明日の重要予定');
});

test('the orchestrator extends the existing Life store and is loaded by the current suite', async () => {
  const [source, loader] = await Promise.all([
    read('daily-flow-orchestrator-v1.js'),
    read('yos-suite-v3.js')
  ]);
  assert.match(source, /const DATA_KEY='yos-life-v1'/);
  assert.match(source, /preparedFromNight/);
  assert.match(source, /nightReset/);
  assert.match(source, /carriedFrom/);
  assert.match(source, /capture:true/);
  assert.doesNotMatch(source, /localStorage\.clear\(/);
  assert.doesNotMatch(source, /yos-life-daily-flow|yos-night-reset/);
  assert.match(loader, /daily-flow-orchestrator-v1\.js\?v=1/);
});


async function loadWeeklyReviewApi(extra = {}) {
  const [frictionEngine, frictionLive, engine, live] = await Promise.all([
    read('friction-discovery-engine-v1.js'),
    read('friction-discovery-live-v1.js'),
    read('weekly-review-engine-v1.js'),
    read('weekly-review-live-v1.js')
  ]);
  const context = {globalThis:{}, Date, Intl, Set, Map, Number, String, Object, Array, Math, RegExp, ...extra};
  context.globalThis = context;
  vm.runInNewContext(frictionEngine, context, {filename:'friction-discovery-engine-v1.js'});
  vm.runInNewContext(frictionLive, context, {filename:'friction-discovery-live-v1.js'});
  vm.runInNewContext(engine, context, {filename:'weekly-review-engine-v1.js'});
  vm.runInNewContext(live, context, {filename:'weekly-review-live-v1.js'});
  return context.__yosWeeklyReviewLiveV1Api;
}
function weeklyReviewFixture() {
  const days = {};
  const dates = ['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04'];
  for (const [i,date] of dates.entries()) days[date] = {
    tasks:[
      {text:'水分補給',done:i<6},
      ...(i<4?[{text:'天気確認',done:true}]:[]),
      ...(i<5?[{text:'不要な一覧更新',done:false,...(i>0?{carriedFrom:dates[i-1]}:{})}]:[])
    ],
    routines:{wake:i<5?[0,1,2,3,4,5]:[0,1,2],before:[],home:[]},
    lifeFlow:i>0?{nightReset:{preparedAt:`${date}T22:00:00+09:00`}}:{}
  };
  days['2026-09-27']={tasks:[{text:'範囲外タスク',done:true}]};
  return {activeLifeDate:'2026-10-04',days};
}
test('Weekly Review uses seven MY LIFE days and caps each decision at one', async () => {
  const api=await loadWeeklyReviewApi(), data=weeklyReviewFixture();
  const review=api.buildReview(data,'2026-10-04','2026-10-04T22:00:00+09:00');
  assert.equal(review.source,'yos-life-v1');
  assert.equal(review.windowStart,'2026-09-28');
  assert.equal(review.continue.length,1); assert.equal(review.stop.length,1); assert.equal(review.automate.length,1);
  assert.equal(review.stop[0].label,'不要な一覧更新'); assert.equal(review.automate[0].label,'天気確認');
  assert.equal(review.continue[0].evidenceIds.some(id=>id.includes('2026-09-27')),false);
});
test('Weekly Review runs only on Sunday and is idempotent inside yos-life-v1', async () => {
  const api=await loadWeeklyReviewApi(), data=weeklyReviewFixture(), rootKeys=Object.keys(data).sort();
  assert.equal(api.runIfSunday(data,'2026-10-04','2026-10-04T22:00:00+09:00').ran,true);
  assert.equal(data.days['2026-10-04'].lifeFlow.weeklyReview.schema,'yos-weekly-review-v1');
  assert.deepEqual(Object.keys(data).sort(),rootKeys);
  assert.equal(api.runIfSunday(data,'2026-10-04').reason,'already-ran');
  const saturday=weeklyReviewFixture();
  assert.equal(api.runIfSunday(saturday,'2026-10-03').reason,'not-sunday');
  assert.equal(saturday.days['2026-10-03'].lifeFlow.weeklyReview,undefined);
});
test('Night Reset bridge persists Sunday review without another storage key', async () => {
  const storage=new Map([['yos-life-v1',JSON.stringify(weeklyReviewFixture())]]);
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  const api=await loadWeeklyReviewApi({localStorage});
  assert.equal(api.runSundayFromNightReset().ran,true);
  assert.equal(JSON.parse(storage.get('yos-life-v1')).days['2026-10-04'].lifeFlow.weeklyReview.windowEnd,'2026-10-04');
  assert.equal(storage.size,1);
});
test('Life loads Friction Discovery and Weekly Review before the existing suite', async () => {
  const html=await read('index.html');
  const frictionEngine=html.indexOf('./friction-discovery-engine-v1.js?v=1');
  const frictionLive=html.indexOf('./friction-discovery-live-v1.js?v=1');
  const engine=html.indexOf('./weekly-review-engine-v1.js?v=1');
  const live=html.indexOf('./weekly-review-live-v1.js?v=1');
  const suite=html.indexOf('./yos-suite-v3.js?v=10');
  assert.ok(frictionEngine>=0&&frictionLive>frictionEngine&&engine>frictionLive&&live>engine&&suite>live);
});


test('existing Night close owns the Sunday Weekly Review write', async () => {
  const home = await read('home-v1.js');
  assert.match(home, /weeklyReviewApi\.runIfSunday\(data,key,new Date\(\)\.toISOString\(\)\)/);
  const live = await read('weekly-review-live-v1.js');
  assert.doesNotMatch(live, /weeklyReviewHook|installNightResetHook/);
});


test('legacy store writes cannot erase Weekly Review extension fields', async () => {
  const home = await read('home-v1.js');
  assert.match(home, /\['nightReset','preparedFromNight','nightCheckin','weeklyReview'\]/);
  assert.match(home, /currentDay\.lifeFlow/);
  assert.match(home, /incomingDay\.lifeFlow\[field\]=currentDay\.lifeFlow\[field\]/);
});


test('Friction Discovery feeds repeated safe MY LIFE friction into Sunday Weekly Review', async () => {
  const api=await loadWeeklyReviewApi();
  const dates=['2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04'];
  const days={};
  for(const date of dates){
    days[date]={tasks:[
      {text:'天気を確認',done:true},{text:'天気を確認',done:true},
      {text:'支払いを確認',done:true},{text:'支払いを確認',done:true}
    ],routines:{wake:[],before:[],home:[]},lifeFlow:{}};
  }
  const review=api.buildReview({activeLifeDate:'2026-10-04',days},'2026-10-04','2026-10-04T22:00:00+09:00');
  assert.equal(review.frictionCandidateCount,1);
  assert.equal(review.automate.length,1);
  assert.equal(review.automate[0].label,'天気を確認');
  assert.match(review.automate[0].id,/^friction:life-task:/);
  assert.equal(review.automate[0].evidenceIds.some(id=>id.includes('支払い')),false);
});

test('unsafe repeated actions never become an automation candidate', async () => {
  const api=await loadWeeklyReviewApi();
  const dates=['2026-09-27','2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04'];
  const days={};
  for(const date of dates){
    days[date]={tasks:[{text:'支払いを確認',done:true},{text:'支払いを確認',done:true}],routines:{wake:[],before:[],home:[]},lifeFlow:{}};
  }
  const review=api.buildReview({activeLifeDate:'2026-10-04',days},'2026-10-04');
  assert.equal(review.frictionCandidateCount,0);
  assert.equal(review.automate.length,0);
});
