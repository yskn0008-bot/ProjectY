import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {htmlFor,row} from './daystream-notion-scriptable.test.mjs';

const date='2026-12-01',rows=[
 row('2026-12-01T05:20:00Z','2026-12-01T05:22:00Z',
  '起床','a'.repeat(32),'yos-daystream-routine-202612-wake'),
 row('2026-12-01T05:22:00Z','2026-12-01T05:25:00Z',
  '水を飲む','b'.repeat(32),'yos-daystream-routine-202612-wake-water'),
 row('2026-12-01T05:25:00Z','2026-12-01T05:30:00Z',
  '歯磨き','c'.repeat(32),'yos-daystream-routine-202612-wake-brush'),
 row('2026-11-30T21:10:00Z','2026-12-01T05:20:00Z',
  '睡眠','d'.repeat(32),'yos-daystream-routine-202612-sleep')
];
const html=htmlFor(rows),browser=await (process.env.LIFE_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
const store='YOS_DAYSTREAM_WEB_PLAN_V1',importKey='YOS_DAYSTREAM_DIRECT_IMPORTED_V1';
try{
 for(const width of [320,390,402]){
  const context=await browser.newContext({viewport:{width,height:844},timezoneId:'Asia/Tokyo'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   if(route.request().url()==='http://yos.local/')return route.fulfill({status:200,contentType:'text/html',body:html});
   return route.abort();
  });
  await page.goto('http://yos.local/');
  await page.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
  await page.evaluate(()=>showDay('2026-12-01'));
  let state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),store);
  const direct=state.days[date].filter(x=>x.sourceRef?.startsWith('yos-direct:'));
  assert.equal(direct.length,4);
  assert.deepEqual(direct.map(x=>x.t),['睡眠','起床','水を飲む','歯磨き']);
  assert.deepEqual(direct.map(x=>[x.s,x.d]),[[370,490],[860,2],[862,3],[865,5]]);
  assert.equal(await page.locator('#tl .yos-notion-projection').count(),0);
  assert.equal(await page.locator('#tl .card.task').count(),4);
  assert.equal(await page.locator('#tl .card.task .task-copy').count(),4);
  assert.equal(await page.locator('#yosNotionEditSheet').count(),0);
  assert.equal(await page.locator('#yosNotionMoveBar').count(),0);
  const colors=await page.locator('#tl .card.task').evaluateAll(cards=>cards.map(c=>getComputedStyle(c).backgroundColor));
  // The original DAYSTREAM intentionally colors sleep differently from tasks.
  // Preserve that native styling instead of imposing a new visual scheme.
  assert.equal(new Set(colors.slice(1)).size,1);
  assert.ok(colors.every(c=>c!=='rgba(0, 0, 0, 0)'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.evaluate(key=>Object.keys(JSON.parse(localStorage.getItem(key))).length,importKey),4);
  // Editing the existing native record is authoritative; reimport cannot reset its time.
  await page.evaluate(key=>{
   const p=JSON.parse(localStorage.getItem(key));
   const task=p.days['2026-12-01'].find(x=>x.t==='水を飲む');task.s=910;
   p.days['2026-12-01'].push({id:90001,t:'既存テスト',s:990,d:30,kind:'task',done:false});
   if(!window.YOS_DAYSTREAM_WEB.write(p))throw Error('Native plan store failed');
  },store);
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
  state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),store);
  const after=state.days[date];
  assert.equal(after.filter(x=>x.sourceRef?.startsWith('yos-direct:')).length,4);
  assert.equal(after.find(x=>x.t==='水を飲む').s,910);
  assert.equal(after.find(x=>x.t==='既存テスト').s,990);
  // An intentional native deletion stays deleted (no resurrection on reopen).
  await page.evaluate(key=>{
   const p=JSON.parse(localStorage.getItem(key));
   p.days['2026-12-01']=p.days['2026-12-01'].filter(x=>x.t!=='歯磨き');
   if(!window.YOS_DAYSTREAM_WEB.write(p))throw Error('Delete verification failed');
  },store);
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
  state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),store);
  assert.equal(state.days[date].some(x=>x.t==='歯磨き'),false);
  assert.equal(state.days[date].some(x=>x.t==='既存テスト'),true);
  assert.deepEqual(errors,[]);
  await context.close();
 }
}finally{await browser.close()}
console.log('DAYSTREAM native tasks: 320/390/402px PASS');
