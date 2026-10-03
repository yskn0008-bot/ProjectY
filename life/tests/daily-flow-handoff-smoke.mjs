import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const browserName=process.env.LIFE_BROWSER||'chromium';
const engine={chromium,webkit}[browserName];
if(!engine)throw new Error(`Unsupported browser: ${browserName}`);
const baseURL=process.env.LIFE_BASE_URL||'http://127.0.0.1:4173/life/';
const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
const yesterday=(()=>{const value=new Date(`${today}T12:00:00+09:00`);value.setDate(value.getDate()-1);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(value)})();
const fixedNow=`${today}T08:00:00+09:00`;

const browser=await engine.launch();
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo'});
await context.addInitScript(({today,yesterday,now})=>{
  const NativeDate=Date,fixedTime=NativeDate.parse(now);
  globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixedTime]))}static now(){return fixedTime}};
  if(!localStorage.getItem('yos-life-v1')){
    localStorage.setItem('yos-life-v1',JSON.stringify({
      activeLifeDate:yesterday,
      days:{
        [yesterday]:{
          tasks:[{text:'夜の未完了',done:false,category:'personal'},{text:'完了済み',done:true,category:'personal'}],
          lifeFlow:{startedAt:`${yesterday}T08:00:00.000Z`}
        },
        [today]:{tasks:[{text:'朝いち既存',done:false,category:'personal'}],schedule:[]}
      }
    }));
  }
},{today,yesterday,now:fixedNow});

const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(error.message));
const waitForFlow=async()=>{
  await page.waitForSelector('#lifeDailyFlowV1',{state:'attached'});
  await page.waitForSelector('#lifeBottomNavV1',{state:'attached'});
};
try{
  await page.goto(baseURL,{waitUntil:'networkidle'});
  await waitForFlow();

  await page.waitForFunction(()=>document.querySelector('.life-task-sheet-v2 button[aria-label="タスクを追加"]')?.dataset.lifeTaskQuickAddV1==='1');
  await page.locator('.life-task-sheet-v2 button[aria-label="タスクを追加"]').click();
  await page.waitForSelector('#lifeTaskQuickAddInputV1',{state:'visible'});
  await page.locator('#lifeTaskQuickAddInputV1').fill('動作確認');
  await Promise.all([
    page.waitForNavigation({waitUntil:'domcontentloaded'}),
    page.locator('#lifeTaskQuickAddV1 button[type="submit"]').click()
  ]);
  await waitForFlow();
  const quickAdded=await page.evaluate(({yesterday})=>JSON.parse(localStorage.getItem('yos-life-v1')).days[yesterday].tasks.map(task=>task.text),{yesterday});
  assert.deepEqual(quickAdded,['夜の未完了','完了済み','動作確認'],'home plus must add an unfinished task instead of opening schedule');

  await page.locator('#lifeBottomNavV1 [data-page="record"]').click();
  await page.locator('[data-life-flow-tab="night"]').click();
  await page.locator('#lifeTomorrowImportantV1').fill('起きたら予定を確認する');
  await Promise.all([
    page.waitForNavigation({waitUntil:'domcontentloaded'}),
    page.locator('#lifeEndDayV1').click()
  ]);
  await waitForFlow();

  const state=await page.evaluate(({today,yesterday})=>{
    const data=JSON.parse(localStorage.getItem('yos-life-v1'));
    return {closed:data.days[yesterday],next:data.days[today]};
  },{today,yesterday});
  assert.ok(state.closed.lifeFlow.endedAt,'Night Reset must close the active Life day');
  assert.equal(state.closed.lifeFlow.nightReset.remainingCount,2);
  assert.equal(state.closed.lifeFlow.nightReset.carriedCount,2);
  assert.equal(state.closed.lifeFlow.nightReset.firstStep,'朝いち既存');
  assert.equal(state.next.lifeFlow.preparedFromNight.firstStep,'朝いち既存');
  assert.equal(state.next.lifeFlow.preparedFromNight.important,'起きたら予定を確認する');
  assert.deepEqual(state.next.tasks.map(task=>task.text),['朝いち既存','夜の未完了','動作確認']);
  assert.equal(state.next.tasks[1].carriedFrom,yesterday);
  assert.equal(state.next.tasks[2].carriedFrom,yesterday);

  await page.locator('#lifeBottomNavV1 [data-page="record"]').click();
  await page.locator('[data-life-flow-tab="morning"]').click();
  await page.waitForSelector('#lifeMorningPreparedV1',{state:'visible'});
  assert.match(await page.locator('#lifeMorningPreparedV1').textContent(),/朝いち既存/,'Morning Flow must surface the prepared first step');
  assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);

  const weeklyContext=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo'});
  await weeklyContext.addInitScript(()=>{
    const fixedNow='2026-10-04T22:00:00+09:00';
    const NativeDate=Date,fixedTime=NativeDate.parse(fixedNow);
    globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[fixedTime]))}static now(){return fixedTime}};
    const dates=['2026-09-28','2026-09-29','2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04'];
    const days={};
    dates.forEach((date,i)=>{
      days[date]={
        tasks:[
          {text:'水分補給',done:i<6},
          ...(i<4?[{text:'支払い確認',done:true}]:[]),
          ...(i<5?[{text:'不要な一覧更新',done:false,...(i>0?{carriedFrom:dates[i-1]}:{})}]:[])
        ],
        routines:{wake:i<5?[0,1,2,3,4,5]:[0,1,2],before:[],home:[]},
        lifeFlow:{startedAt:`${date}T08:00:00+09:00`}
      };
    });
    localStorage.setItem('yos-life-v1',JSON.stringify({activeLifeDate:'2026-10-04',days}));
  });
  const weeklyPage=await weeklyContext.newPage();
  const weeklyErrors=[];
  weeklyPage.on('pageerror',error=>weeklyErrors.push(error.message));
  await weeklyPage.goto(baseURL,{waitUntil:'networkidle'});
  await weeklyPage.waitForSelector('#lifeDailyFlowV1',{state:'attached'});
  await weeklyPage.waitForFunction(()=>Boolean(globalThis.__yosWeeklyReviewLiveV1Api&&document.querySelector('#lifeEndDayV1')?.dataset.weeklyReviewHook==='1'));
  await weeklyPage.locator('#lifeBottomNavV1 [data-page="record"]').click();
  await weeklyPage.locator('[data-life-flow-tab="night"]').click();
  await Promise.all([
    weeklyPage.waitForNavigation({waitUntil:'domcontentloaded'}),
    weeklyPage.locator('#lifeEndDayV1').click()
  ]);
  await weeklyPage.waitForSelector('#lifeDailyFlowV1',{state:'attached'});
  const weeklyState=await weeklyPage.evaluate(()=>JSON.parse(localStorage.getItem('yos-life-v1')));
  const review=weeklyState.days['2026-10-04']?.lifeFlow?.weeklyReview;
  assert.equal(review?.schema,'yos-weekly-review-v1','Sunday Night Reset must persist Weekly Review in yos-life-v1');
  assert.equal(review?.windowStart,'2026-09-28');
  assert.equal(review?.windowEnd,'2026-10-04');
  assert.ok((review?.continue?.length||0)<=1);
  assert.ok((review?.stop?.length||0)<=1);
  assert.ok((review?.automate?.length||0)<=1);
  assert.equal(review?.stop?.[0]?.label,'不要な一覧更新');
  assert.equal(review?.automate?.[0]?.label,'支払い確認');
  assert.deepEqual(weeklyErrors,[],`weekly page errors: ${weeklyErrors.join(' | ')}`);
  await weeklyContext.close();

  console.log(`Daily flow + Weekly Review Sunday handoff smoke passed: ${browserName}`);
}finally{
  await browser.close();
}
