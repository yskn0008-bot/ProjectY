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
  assert.equal(state.closed.lifeFlow.nightReset.remainingCount,1);
  assert.equal(state.closed.lifeFlow.nightReset.carriedCount,1);
  assert.equal(state.closed.lifeFlow.nightReset.firstStep,'朝いち既存');
  assert.equal(state.next.lifeFlow.preparedFromNight.firstStep,'朝いち既存');
  assert.equal(state.next.lifeFlow.preparedFromNight.important,'起きたら予定を確認する');
  assert.deepEqual(state.next.tasks.map(task=>task.text),['朝いち既存','夜の未完了']);
  assert.equal(state.next.tasks[1].carriedFrom,yesterday);

  await page.locator('#lifeBottomNavV1 [data-page="record"]').click();
  await page.locator('[data-life-flow-tab="morning"]').click();
  await page.waitForSelector('#lifeMorningPreparedV1',{state:'visible'});
  assert.match(await page.locator('#lifeMorningPreparedV1').textContent(),/朝いち既存/,'Morning Flow must surface the prepared first step');
  assert.deepEqual(pageErrors,[],`page errors: ${pageErrors.join(' | ')}`);
  console.log(`Daily flow handoff smoke passed: ${browserName}`);
}finally{
  await browser.close();
}