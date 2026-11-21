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
  assert.equal(await page.locator('#weekStrip').isVisible(),false);
  assert.equal(await page.locator('.flow-tools').getAttribute('open'),null);
  await page.locator('#flowEdit').click();
  assert.equal(await page.getByText('タイムラインを編集',{exact:true}).first().isVisible(),true);
  assert.equal(await page.locator('.flow-title').isVisible(),false);
  await page.locator('#flowDone').click();
  assert.equal(await page.locator('.flow-title').isVisible(),true);
  assert.equal(await page.locator('#yosNotionEditSheet').count(),0);
  assert.equal(await page.locator('#yosNotionMoveBar').count(),0);
  const colors=await page.locator('#tl .card.task').evaluateAll(cards=>cards.map(c=>getComputedStyle(c).backgroundColor));
  // Sleep and ordinary tasks retain distinct visual categories.
  assert.ok(colors.length===4);
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

 // Calendar rows created by existing Clarity iCloud routing appear as fixed
 // schedules in the same native DAYSTREAM layout without a new local task.
 const deviceMirror={status:'ok',source:'scriptable-on-device',
  calendarDays:{'2026-12-01':[{title:'Clarity予定',start:1140,duration:30}]},
  allDayDays:{},calendarCoverage:{from:'2026-12-01',until:'2026-12-02',status:'ok'}};
 const calendarHtml=htmlFor([],deviceMirror);
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Tokyo'});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  if(route.request().url()==='http://yos.local/')return route.fulfill({status:200,contentType:'text/html',body:calendarHtml});
  return route.abort();
 });
 await page.goto('http://yos.local/');
 await page.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
 await page.evaluate(()=>showDay('2026-12-01'));
 assert.equal(await page.locator('#tl .card.schedule').count(),1);
 assert.equal(await page.locator('#tl .card.task').count(),0);
 assert.match(await page.locator('#tl .card.schedule').innerText(),/Clarity予定/);
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),store);
 assert.ok(!saved||!Object.values(saved.days||{}).flat().some(x=>x.t==='Clarity予定'));
 assert.deepEqual(errors,[]);
 await context.close();

 // Real-world regression: long, read-only Apple appointments (e.g., a 7h
 // night shift) must not trap vertical finger scrolling on iPhone.
 const longShift={status:'ok',source:'scriptable-on-device',
  calendarDays:{'2026-12-01':[{title:'夜勤',start:1020,duration:420}]},
  allDayDays:{},calendarCoverage:{from:'2026-12-01',until:'2026-12-02',status:'ok'}};
 const shiftHtml=htmlFor([],longShift);
 const scroller=await browser.newContext({
  viewport:{width:390,height:844},timezoneId:'Asia/Tokyo',
  hasTouch:true,isMobile:process.env.LIFE_BROWSER!=='webkit'
 });
 const scrollPage=await scroller.newPage(),scrollErrors=[];
 scrollPage.on('pageerror',e=>scrollErrors.push(e.message));
 await scrollPage.route('**/*',route=>{
  if(route.request().url()==='http://yos.local/')
   return route.fulfill({status:200,contentType:'text/html',body:shiftHtml});
  return route.abort();
 });
 await scrollPage.goto('http://yos.local/');
 await scrollPage.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
 await scrollPage.evaluate(()=>{showDay('2026-12-01');document.getElementById('zoomBtn').click()});
 const shift=scrollPage.locator('#tl .card.schedule.fixed-scroll');
 assert.equal(await shift.count(),1,'fixed night shift is a native scrolling surface');
 assert.equal(await shift.evaluate(el=>getComputedStyle(el).touchAction),'pan-y');
 assert.equal(await shift.innerText().then(x=>x.includes('夜勤')),true);
 assert.equal(await scrollPage.locator('#tl .card.task').count(),0);
 if(process.env.LIFE_BROWSER==='chromium'){
  const absolute=await shift.evaluate(el=>el.getBoundingClientRect().top+scrollY);
  await scrollPage.evaluate(top=>scrollTo(0,Math.max(0,top-240)),absolute);
  const rect=await shift.boundingBox();
  assert.ok(rect,'night shift has a touchable bounding rectangle');
  const x=Math.round(rect.x+rect.width/2);
  const y=Math.round(Math.max(100,Math.min(570,rect.y+Math.min(65,rect.height/3))));
  assert.ok(y>rect.y&&y<rect.y+rect.height,'touch starts inside the actual night shift');
  const before=await scrollPage.evaluate(()=>scrollY);
  assert.ok(before>40,'night shift is in a scrolled document');
  const cdp=await scroller.newCDPSession(scrollPage);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=8;i++){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',
    touchPoints:[{x,y:y+i*19}]});
   await scrollPage.waitForTimeout(24);
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await scrollPage.waitForTimeout(180);
  const after=await scrollPage.evaluate(()=>scrollY);
  assert.ok(after<before-25,
   'touching a long fixed Apple card must scroll the whole timeline, not freeze it: '+before+' → '+after);
  assert.equal(await scrollPage.locator('#focus.show').count(),0,
   'a scroll gesture must not open the fixed appointment details');
  const saved=await scrollPage.evaluate(key=>localStorage.getItem(key),store);
  assert.ok(!saved||!JSON.parse(saved).days?.['2026-12-01']?.length,
   'scrolling must not write into the local timeline plan');
 }
 assert.deepEqual(scrollErrors,[]);
 await scroller.close();

 // Use the same boot HTML as Scriptable. The plan is pre-existing and includes
 // a locally editable Notion projection, an unrelated day, and fixed iCloud rows.
 const startDay='2026-12-01',nextDay='2026-12-02';
 const calendar={
  status:'ok',source:'scriptable-on-device',
  calendarDays:{
   [startDay]:[{title:'朝食',start:480,duration:30},{title:'夜勤',start:1020,duration:420}],
   [nextDay]:[{title:'夜勤',start:0,duration:300}]
  },allDayDays:{},calendarCoverage:{from:startDay,until:'2026-12-03',status:'ok'}
 };
 const fixtureRows=[row('2026-12-01T00:00:00Z','2026-12-01T00:30:00Z',
  'ウォーキング','e'.repeat(32),'yos-daystream-routine-202612-wake-walk')];
 const gestureHtml=htmlFor(fixtureRows,calendar);
 const gestureContext=await browser.newContext({
  viewport:{width:390,height:844},timezoneId:'Asia/Tokyo',hasTouch:true,
  isMobile:true,reducedMotion:'reduce'
 });
 const touchPage=await gestureContext.newPage(),gestureErrors=[];
 touchPage.on('pageerror',e=>gestureErrors.push(e.message));
 await touchPage.route('**/*',route=>route.request().url()==='http://yos.local/'
  ? route.fulfill({status:200,contentType:'text/html',body:gestureHtml}):route.abort());
 await touchPage.goto('http://yos.local/');
 const otherDay=[{id:9123,t:'別日の計画',s:700,d:25,kind:'task',done:false}];
 await touchPage.evaluate(({startDay,nextDay,otherDay,store})=>{
  const plan=JSON.parse(localStorage.getItem(store));
  plan.days[startDay].push(
   {id:9124,t:'筋トレ',s:660,d:30,kind:'habit',done:false},
   {id:9125,t:'朝の準備',s:365,d:25,kind:'habit',done:false}
  );
  plan.days[nextDay]=otherDay;
  if(!window.YOS_DAYSTREAM_WEB.write(plan))throw Error('fixture write failed');
 },{startDay,nextDay,otherDay,store});
 await touchPage.reload();
 await touchPage.evaluate(day=>{showDay(day);scrollTo(0,0)},startDay);
 const toolsPanel=touchPage.locator('.native-tools');
 assert.equal(await toolsPanel.locator('.yos-web-port').isVisible(),false);
 await toolsPanel.locator('summary').click();
 assert.match(await toolsPanel.locator('#yosWebSourceState').innerText(),/Notion 1件取得/);
 await toolsPanel.locator('summary').click();
 const task=touchPage.locator('#tl .card.task').filter({hasText:'ウォーキング'});
 const grip=task.locator('.task-drag-grip'),body=task.locator('.task-copy');
 const dialog=touchPage.locator('#moveDialog'),time=touchPage.locator('#moveTime');
 const read=()=>touchPage.evaluate(key=>JSON.parse(localStorage.getItem(key)),store);
 const original=await read();
 const taskRow=plan=>plan.days[startDay].find(x=>x.t==='ウォーキング');
 assert.equal(taskRow(original).s,540);
 assert.equal(await touchPage.locator('#tl .fixed-label').count(),2);
 assert.equal(await touchPage.locator('#tl .fixed-scroll .task-drag-grip').count(),0);
 if(process.env.DAYSTREAM_SCREENSHOTS){
  await touchPage.screenshot({path:process.env.DAYSTREAM_SCREENSHOTS+'/timeline.png'});
  await touchPage.locator('#flowEdit').click();
  await touchPage.screenshot({path:process.env.DAYSTREAM_SCREENSHOTS+'/editing.png'});
  await touchPage.locator('#flowDone').click();
 }

 const cdp=process.env.LIFE_BROWSER==='chromium'?await gestureContext.newCDPSession(touchPage):null;
 const touch=async (target,type,x,y)=>{
  if(cdp){
   await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:/End|Cancel/.test(type)?[]:[{x,y}]});
   return;
  }
  // WebKit's Linux driver only exposes a real tap. Send the same TouchEvent
  // handlers real coordinates and cover WebKit native pointer drag separately.
  const name=type.toLowerCase();
  await target.evaluate((el,{name,x,y})=>{
   const finger={identifier:1,target:el,clientX:x,clientY:y};
   const event=new Event(name,{bubbles:true,cancelable:true});
   Object.defineProperties(event,{touches:{value:/end|cancel/.test(name)?[]:[finger]},
    changedTouches:{value:[finger]}});
   el.dispatchEvent(event);
  },{name,x,y});
 };
 const center=async target=>{
  await target.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
  const box=await target.boundingBox();
  return {x:Math.round(box.x+box.width/2),y:Math.round(box.y+box.height/2)};
 };
 const drag=async(target,{hold=false,finish='touchEnd',delta=92}={})=>{
  const {x,y}=await center(target);
  const before=await touchPage.evaluate(()=>scrollY);
  await touch(target,'touchStart',x,y);
  if(hold){
   await task.locator('xpath=self::*[contains(@class, "press-armed")]').waitFor();
   // This first small movement must already be claimed by the armed hold.
   await touch(target,'touchMove',x,y+3);
  }
  for(let i=1;i<=6;i++)await touch(target,'touchMove',x,y+Math.round(delta*i/6));
  await touch(target,finish,x,y+delta);
  assert.ok(Math.abs(await touchPage.evaluate(()=>scrollY)-before)<=2,'moving a card preserves viewport position away from its edges');
 };
 if(cdp){
  await touchPage.evaluate(()=>document.getElementById('zoomBtn').click());
  const {x,y}=await center(body);
  const before=await touchPage.evaluate(()=>scrollY);
  await touch(body,'touchStart',x,y);
  for(let i=1;i<=7;i++){
   await touch(body,'touchMove',x,y-i*18);
   await touchPage.waitForTimeout(14);
  }
  await touch(body,'touchEnd',x,y-126);
  await touchPage.waitForFunction(y=>scrollY>y+25,before);
 }
 assert.deepEqual(await read(),original,'ordinary scrolling never saves or completes a task');
 assert.equal(await dialog.isVisible(),false);
 await center(body);
 await body.tap();
 await touchPage.locator('#focus.show').waitFor();
 assert.deepEqual(await read(),original,'tap opens details without writing completion');
 await touchPage.locator('#closeFocus').click();
 await drag(grip,{finish:'touchCancel'});
 assert.equal(await dialog.isVisible(),false);
 assert.deepEqual(await read(),original);
 await drag(grip);
 await dialog.waitFor();
 assert.notEqual(await time.inputValue(),'09:00');
 assert.deepEqual(await read(),original,'drag preview does not write before saving');
 await touchPage.locator('#moveCancel').click();
 assert.deepEqual(await read(),original);
 await drag(body,{hold:true});
 await dialog.waitFor();
 assert.notEqual(await time.inputValue(),'09:00');
 await time.fill('17:15');
 assert.match(await touchPage.locator('#moveAdvice').innerText(),/時間衝突 1件/);
 assert.match(await touchPage.locator('#moveImpact').innerText(),/夜勤.*30分重複/);
 assert.equal(await touchPage.locator('#moveOptions button').count(),0,'suggestions require a request');
 await touchPage.locator('#flowCandidates').click();
 const options=await touchPage.locator('#moveOptions button').allTextContents();
 assert.ok(options.length>0&&options.length<=3,'show up to three genuine same-day slots');
 assert.ok(options.every(text=>Number(text.slice(0,2))*60+Number(text.slice(3,5))+30<=1020),'every candidate avoids the shift through midnight');
 assert.deepEqual(await read(),original,'showing suggestions does not write');
 if(process.env.DAYSTREAM_SCREENSHOTS){
  await touchPage.screenshot({path:process.env.DAYSTREAM_SCREENSHOTS+'/placement.png'});
 }
 await touchPage.locator('#moveSave').click();
 const moved=await read();
 assert.deepEqual(taskRow(moved),{...taskRow(original),s:1035});
 assert.deepEqual(moved.days[nextDay],otherDay);
 assert.equal(moved.days[startDay].some(x=>x.source==='Apple Calendar'),false);
 await touchPage.locator('#yosUndoBtn').click();
 assert.deepEqual(await read(),original);
 await touchPage.locator('#yosRedoBtn').click();
 assert.deepEqual(await read(),moved);
 await touchPage.reload();
 await touchPage.evaluate(day=>showDay(day),startDay);
 assert.match(await task.innerText(),/17:15–17:45/);
 assert.match(await task.innerText(),/時間衝突/);
 if(!cdp){
  const {x,y}=await center(grip);
  await touchPage.mouse.move(x,y);await touchPage.mouse.down();
  await touchPage.mouse.move(x,y-110,{steps:8});await touchPage.mouse.up();
  await dialog.waitFor();
  assert.notEqual(await time.inputValue(),'17:15','WebKit pointer drag reaches a different start');
  await touchPage.locator('#moveCancel').click();
 }
 await grip.focus();
 await touchPage.keyboard.press('Enter');
 await dialog.waitFor();
 await time.fill('18:00');
 await touchPage.evaluate(()=>{const web=window.YOS_DAYSTREAM_WEB;window.__originalWrite=web.write;web.write=()=>false});
 await touchPage.locator('#moveSave').click();
 assert.deepEqual(await read(),moved,'failed save keeps previously committed data');
 assert.match(await task.innerText(),/17:15–17:45/);
 await touchPage.evaluate(day=>showDay(day),nextDay);
 const continuation=touchPage.locator('#tl .fixed-scroll').filter({hasText:'夜勤'});
 assert.match(await continuation.innerText(),/00:00–05:00/);
 assert.deepEqual(await read(),moved);
 assert.deepEqual(gestureErrors,[]);
 await gestureContext.close();
}finally{await browser.close()}
console.log('DAYSTREAM native tasks: 320/390/402px PASS');
