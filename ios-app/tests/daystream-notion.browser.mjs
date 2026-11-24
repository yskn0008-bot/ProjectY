import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {htmlFor,row} from './daystream-notion-scriptable.test.mjs';

// Native Scriptable URL is a one-tap read-only projection over the existing day.
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
// The next-day override assertion requires a recurring Notion fixture.
for(const record of rows)record.properties['習慣周期']={select:{name:'毎日'}};
const html=htmlFor(rows),browser=await (process.env.LIFE_BROWSER==='webkit'?webkit:chromium).launch({headless:true,
 ...(process.env.DAYSTREAM_BROWSER_BIN?{executablePath:process.env.DAYSTREAM_BROWSER_BIN}:{})});
const store='YOS_DAYSTREAM_WEB_PLAN_V1';
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
  const detail=await page.evaluate(()=>({day:typeof selectedDay==='string'?selectedDay:'unknown',
   projected:window.YOS_ONE_TAP_FOR_DAY?.('2026-12-01',[]).map(x=>({t:x.t,kind:x.kind,s:x.s,d:x.d})),
   cards:[...document.querySelectorAll('#tl .card')].map(x=>({kind:x.className,text:x.innerText.slice(0,50)})),
   storageError:window.YOS_WEB_DATA_ERROR||null}));
  assert.equal(await page.locator('#tl .card.task').count(),4,JSON.stringify(detail));
  const projected=await page.locator('#tl .card.task').evaluateAll(x=>x.map(el=>el.innerText));
  assert.deepEqual(projected.map(x=>['睡眠','起床','水を飲む','歯磨き'].find(y=>x.includes(y))),['睡眠','起床','水を飲む','歯磨き']);
  assert.equal(await page.locator('#tl .card.task .task-copy').count(),4,'synced cards reuse the existing movable task layout');
  assert.equal(await page.locator('#tl .card.task .fixed-label').count(),4);
  assert.equal(await page.locator('#tl .card.task .task-drag-grip').count(),4,'all synced tasks have move handles');
  const tones=await page.locator('#tl .card.task[data-notion="1"]').evaluateAll(nodes=>nodes.map(el=>el.dataset.flowTone));
  assert.ok(new Set(tones).size>=3,'synced cards must not be green-only: '+tones);
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),store),null,'preview never writes a plan');
  // Native iPhone request: release directly saves; nearby bars visibly react while moving.
  const dragCard=page.locator('#tl .card.task[data-notion="1"]').filter({hasText:'歯磨き'});
  await page.evaluate(()=>{window.__dragDebug=[];for(const kind of ['pointerdown','pointermove','pointerup','pointercancel','mousedown','mousemove','mouseup','dragstart'])document.addEventListener(kind,e=>window.__dragDebug.push({kind,y:e.clientY,x:e.clientX,target:e.target?.className,button:e.button,pointerId:e.pointerId}),true)});
  await dragCard.scrollIntoViewIfNeeded();
  const gripBox=await dragCard.locator('.task-drag-grip').boundingBox();
  assert.ok(gripBox,'drag grip is reachable');
  const dragX=gripBox.x+gripBox.width/2,dragY=gripBox.y+gripBox.height/2;
  const beforeDrag=await page.evaluate(()=>items.find(x=>x.t==='歯磨き').s);
  await page.mouse.move(dragX,dragY);await page.mouse.down();
  await page.mouse.move(dragX,dragY-55,{steps:12});
  await page.waitForTimeout(90);
  const dragDebug=await dragCard.evaluate(el=>({active:el.classList.contains('drag-preview'),css:el.className,transform:el.style.transform,scroll:scrollY}));
  assert.equal(dragDebug.active,true,'bar lifts under the finger: '+JSON.stringify({dragDebug,events:await page.evaluate(()=>window.__dragDebug)}));
  assert.ok(await page.locator('#tl .card.drag-neighbor').count()>0,'other bars react during the drag');
  await page.mouse.up();
  assert.equal(await page.locator('#moveDialog').isVisible(),false,'drop never opens placement advice');
  assert.notEqual(await page.evaluate(()=>items.find(x=>x.t==='歯磨き').s),beforeDrag,'drop saves the new time');
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),store),null,'direct Notion drag never changes the manual plan');
  assert.equal(await page.locator('#moveToast').isVisible(),true,'compact confirmation appears after saving');
  await page.locator('#moveUndo').click();
  assert.equal(await page.evaluate(()=>items.find(x=>x.t==='歯磨き').s),beforeDrag,'one tap undo restores the original time');
  assert.equal(await page.locator('#moveDialog').isVisible(),false,'undo never opens placement advice');
  const startCard=page.locator('#tl .card.task[data-notion="1"]').filter({hasText:'起床'});
  // Move the 2-minute wake task into the 05:25 brush task's window.
  // Collision must remain a small warning on the bar, never a drop-time sheet.
  await startCard.scrollIntoViewIfNeeded();
  const clashGrip=await startCard.locator('.task-drag-grip').boundingBox();
  const clashDelta=await page.evaluate(()=>{
   const task=items.find(x=>x.t==='起床');return yFor(task.s+5)-yFor(task.s);
  });
  const clashStart=await page.evaluate(()=>items.find(x=>x.t==='起床').s);
  await page.mouse.move(clashGrip.x+clashGrip.width/2,clashGrip.y+clashGrip.height/2);
  await page.mouse.down();
  await page.mouse.move(clashGrip.x+clashGrip.width/2,clashGrip.y+clashGrip.height/2+clashDelta,{steps:10});
  await page.mouse.up();
  assert.equal(await page.locator('#moveDialog').isVisible(),false,'overlapping drop does not open placement advice');
  assert.equal(await page.evaluate(()=>placementAt(items.find(x=>x.t==='起床'),items.find(x=>x.t==='起床').s).overlaps.some(x=>x.t==='歯磨き')),true,'collision is retained without moving the other task');
  assert.equal(await page.locator('#tl .card.task').filter({hasText:'起床'}).locator('.layer-status').innerText(),'！');
  await page.locator('#moveUndo').click();
  assert.equal(await page.evaluate(()=>items.find(x=>x.t==='起床').s),clashStart,'overlapping drop can be undone');
  await startCard.locator('.task-drag-grip').click();
  assert.equal(await page.locator('#moveDialog').isVisible(),true,'tap move grip opens existing placement advisor');
  await page.locator('#moveTime').fill('16:20');
  await page.locator('#moveSave').click();
  assert.match(await page.locator('#tl .card.task[data-notion="1"]').filter({hasText:'起床'}).innerText(),/16:20/);
  const moveKey='YOS_DAYSTREAM_NOTION_MOVES_V1';
  assert.ok(await page.evaluate(key=>localStorage.getItem(key),moveKey));
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),store),null,'moving Notion card never writes the original plan');
  await page.reload();await page.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
  await page.evaluate(()=>showDay('2026-12-01'));
  assert.match(await page.locator('#tl .card.task[data-notion="1"]').filter({hasText:'起床'}).innerText(),/16:20/,
   'local time override survives reload');
  await page.evaluate(()=>showDay('2026-12-02'));
  assert.match(await page.locator('#tl .card.task[data-notion="1"]').filter({hasText:'起床'}).innerText(),/14:20/,
   'other days keep Notion schedule');
  assert.equal(await page.evaluate(()=>localStorage.getItem('YOS_DAYSTREAM_DIRECT_IMPORTED_V1')),null);
  assert.equal(await page.locator('#weekStrip').isVisible(),false);
  assert.equal(await page.locator('.flow-tools').getAttribute('open'),null);
  await page.locator('#flowEdit').click();
  assert.equal(await page.getByText('タイムラインを編集',{exact:true}).first().isVisible(),true);
  assert.equal(await page.locator('.flow-date-row').isVisible(),false);
  await page.locator('#flowDone').click();
  assert.equal(await page.locator('.flow-date-row').isVisible(),true);
  assert.equal(await page.locator('#yosNotionEditSheet').count(),0);
  assert.equal(await page.locator('#yosNotionMoveBar').count(),0);
  const colors=await page.locator('#tl .card.task').evaluateAll(cards=>cards.map(c=>getComputedStyle(c).backgroundColor));
  assert.equal(colors.length,4);
  assert.ok(colors.every(c=>c!=='rgba(0, 0, 0, 0)'));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  // Preserve a local manual edit and continue to show synced cards without duplication.
  await page.evaluate(key=>{
   const p={version:1,days:{'2026-12-01':[
    {id:90001,t:'手動で登録した予定',s:990,d:30,kind:'task',done:false},
    {id:90002,t:'水を飲む',s:910,d:3,kind:'task',
     sourceRef:'yos-direct:'+'b'.repeat(32),done:false}
   ]},hiddenCalendar:{}};
   if(!window.YOS_DAYSTREAM_WEB.write(p))throw Error('Native plan write failed');
  },store);
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
  await page.evaluate(()=>showDay('2026-12-01'));
  assert.equal(await page.locator('#tl .card.task').count(),5,'two local rows and three nonduplicated previews');
  let state=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),store);
  assert.equal(state.days[date].length,2);
  assert.equal(state.days[date].find(x=>x.t==='水を飲む').s,910);
  assert.equal(state.days[date].find(x=>x.t==='手動で登録した予定').s,990);
  // A corrupt pre-existing plan cannot be rewritten by the projection.
  await page.evaluate(key=>localStorage.setItem(key,'{invalid-json'),store);
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
  await page.evaluate(()=>showDay('2026-12-01'));
  assert.equal(await page.evaluate(key=>localStorage.getItem(key),store),'{invalid-json');
  assert.equal(await page.locator('#tl .card.task').count(),4);
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

 // Native preview remains read-only even when a user has existing manual edits.
 const day='2026-12-01';
 const calendar={status:'ok',source:'scriptable-on-device',
  calendarDays:{[day]:[{title:'夜勤',start:1020,duration:420}]},
  allDayDays:{},calendarCoverage:{from:day,until:'2026-12-02',status:'ok'}};
 const previewHtml=htmlFor(rows,calendar);
 const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Tokyo'});
 const pg=await ctx.newPage(),errs=[];
 pg.on('pageerror',e=>errs.push(e.message));
 await pg.route('**/*',route=>route.request().url()==='http://yos.local/'
  ?route.fulfill({status:200,contentType:'text/html',body:previewHtml}):route.abort());
 await pg.goto('http://yos.local/');
 await pg.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
 await pg.evaluate(()=>showDay('2026-12-01'));
 assert.equal(await pg.locator('#tl .card.task').count(),4);
 assert.equal(await pg.locator('#tl .card.schedule').count(),1);
 const native=pg.locator('#yosTimelineSync');
 assert.equal(await native.count(),1,'the sync action is visible in the pinned HTML');
 assert.equal(await native.isVisible(),true);
 assert.match(await native.innerText(),/Notion同期/);
 const manual={version:1,days:{[day]:[{id:9124,t:'自分の予定',s:720,d:30,kind:'task',done:false}]},hiddenCalendar:{}};
 await pg.evaluate(plan=>{
  if(!window.YOS_DAYSTREAM_WEB.write(plan))throw Error('manual plan save failed');
 },manual);
 await pg.reload();
 await pg.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
 await pg.evaluate(()=>showDay('2026-12-01'));
 assert.equal(await pg.locator('#tl .card.task').count(),5,'manual task plus four read-only Notion cards');
 const savedPlan=await pg.evaluate(key=>JSON.parse(localStorage.getItem(key)),store);
 assert.deepEqual(savedPlan,manual,'Notion preview never mutates the saved plan');
 await pg.evaluate(key=>localStorage.setItem(key,'{corrupt'),store);
 await pg.reload();
 await pg.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
 await pg.evaluate(()=>showDay('2026-12-01'));
 assert.equal(await pg.locator('#tl .card.task').count(),4,'read-only Notion remains visible without a valid saved plan');
 assert.equal(await pg.evaluate(key=>localStorage.getItem(key),store),'{corrupt','corrupt plan remains untouched');
 assert.deepEqual(errs,[]);
 await ctx.close();
 // Regression for the actual iPhone screenshot: localStorage throws SecurityError.
 // The Notion preview must still render, and no write may be attempted.
 const blocked=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Tokyo'});
 await blocked.addInitScript(()=>{
  const denied=()=>{throw new DOMException('Storage unavailable','SecurityError')};
  Storage.prototype.getItem=denied;
  Storage.prototype.setItem=denied;
  Storage.prototype.removeItem=denied;
 });
 const blockedPage=await blocked.newPage(),blockedErrors=[];
 blockedPage.on('pageerror',e=>blockedErrors.push(e.message));
 await blockedPage.route('**/*',route=>route.request().url()==='http://yos.local/'
  ?route.fulfill({status:200,contentType:'text/html',body:previewHtml}):route.abort());
 await blockedPage.goto('http://yos.local/');
 await blockedPage.waitForFunction(()=>document.getElementById('yosNativeBoot')===null);
 await blockedPage.evaluate(()=>showDay('2026-12-01'));
 assert.equal(await blockedPage.locator('#tl .card.task').count(),4,
  'Notion projection remains visible when iPhone WebView storage is unavailable');
 assert.match(await blockedPage.locator('#yosWebSourceState').textContent(),/Notion 4件取得/);
 assert.ok(!blockedErrors.some(e=>/Uncaught|SecurityError/.test(e)),
  'the read-only preview should not crash on a denied storage API');
 await blocked.close();
}finally{await browser.close()}
console.log('DAYSTREAM native tasks: 320/390/402px PASS');
