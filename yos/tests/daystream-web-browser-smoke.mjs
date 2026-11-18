import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium,webkit} from 'playwright';
const type=process.env.YOS_BROWSER||'chromium',browser=await (type==='webkit'?webkit:chromium).launch({headless:true});
const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,deviceScaleFactor:2});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
try{
 const res=await page.goto('http://127.0.0.1:4173/yos/daystream/',{waitUntil:'domcontentloaded'});
 assert.equal(res.status(),200);
 await page.locator('#timelinePanel').waitFor();
 await page.locator('#yosWebImport').waitFor();
 assert.equal(await page.locator('#yosWebHistory').isVisible(),true);
 await page.locator('#addBtn').click();
 await page.locator('#wizardNext').click();
 assert.match(await page.locator('#wizardError').textContent(),/名前/);
 await page.locator('#newTitle').fill('WIZARD CREATE');
 await page.locator('#wizardNext').click();
 assert.equal(await page.locator('#newTitle').isVisible(),false);
 await page.locator('#newTime').fill('13:00');await page.locator('#wizardNext').click();
 await page.locator('#newDuration').fill('1440');await page.locator('#wizardNext').click();
 assert.match(await page.locator('#wizardError').textContent(),/24:00/);
 await page.locator('#newDuration').fill('30');await page.locator('#wizardNext').click();
 await page.locator('.wizard-import summary').click();
 await page.locator('#shortcutNamesImport').fill('PayPay\nMorning\nPayPay');await page.locator('#saveShortcutNames').click();
 assert.match(await page.locator('#shortcutNamesStatus').textContent(),/2件/);
 await page.locator('#shortcutSearch').fill('pay');
 assert.equal(await page.locator('#shortcutPicker option[value="Morning"]').evaluate(el=>el.hidden),true);
 await page.locator('#shortcutPicker').selectOption('PayPay');await page.locator('#wizardNext').click();
 assert.match(await page.locator('#wizardSummary').textContent(),/PayPay/);
 await page.locator('#wizardBack').click();assert.equal(await page.locator('#newShortcut').inputValue(),'PayPay');
 await page.locator('#wizardNext').click();await page.locator('#saveBtn').click();
 const created=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1')).days).flat().find(x=>x.t==='WIZARD CREATE'));
 assert.equal(created.shortcut,'PayPay');assert.equal(created.s,780);assert.equal(created.d,30);
 await page.evaluate(()=>beginLocalEdit(items.find(x=>x.t==='WIZARD CREATE')));
 assert.equal(await page.locator('#newTitle').isVisible(),true);assert.equal(await page.locator('#newTime').isVisible(),true);
 await page.locator('#cancelEditor').click();

 // Action history must preserve existing task cards, with intentional, reversible changes.
 assert.equal(await page.locator('#yosUndoBtn').isEnabled(),true);
 assert.equal(await page.locator('#yosRedoBtn').isEnabled(),false);
 const touchSafety=await page.locator('#tl .card.task').first().evaluate(el=>({
  surface:getComputedStyle(el).touchAction,
  grip:getComputedStyle(el.querySelector('.task-drag-grip')).touchAction
 }));
 assert.equal(touchSafety.surface,'pan-y','swiping over task card should scroll page, not move task');
 assert.equal(touchSafety.grip,'none','only the dedicated handle may initiate vertical dragging');
 await page.locator('#yosUndoBtn').click();
 const undoneTask=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1')).days).flat().some(x=>x.t==='WIZARD CREATE'));
 assert.equal(undoneTask,false,'undo removes newly created local card');
 assert.equal(await page.locator('#yosRedoBtn').isEnabled(),true);
 await page.locator('#yosRedoBtn').click();
 const redoneTask=await page.evaluate(()=>Object.values(JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1')).days).flat().find(x=>x.t==='WIZARD CREATE'));
 assert.equal(redoneTask.s,780,'redo restores the same local card without changing its time');
 assert.equal(redoneTask.shortcut,'PayPay','redo preserves existing shortcut association');

 const completeResult=await page.evaluate(()=>{
  const task=items.find(x=>x.t==='WIZARD CREATE');toggleTaskDone(task);
  return {done:Boolean(items.find(x=>x.t==='WIZARD CREATE').done),actions:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_ACTIONS_V1')||'[]').length};
 });
 assert.equal(completeResult.done,true);
 assert.equal(completeResult.actions,1);
 await page.locator('#yosUndoBtn').click();
 const undoneCompletion=await page.evaluate(()=>({
  done:Boolean(items.find(x=>x.t==='WIZARD CREATE').done),
  actions:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_ACTIONS_V1')||'[]').length
 }));
 assert.equal(undoneCompletion.done,false,'undo restores local task incomplete status');
 assert.equal(undoneCompletion.actions,0,'undo rolls back its local completion log');
 await page.locator('#yosRedoBtn').click();
 const redoneCompletion=await page.evaluate(()=>({
  done:Boolean(items.find(x=>x.t==='WIZARD CREATE').done),
  actions:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_ACTIONS_V1')||'[]').length
 }));
 assert.equal(redoneCompletion.done,true,'redo restores local completion status');
 assert.equal(redoneCompletion.actions,1,'redo restores original local completion log');


 const status=await page.evaluate(()=>{
  const day=new Date(),iso=[day.getFullYear(),String(day.getMonth()+1).padStart(2,'0'),String(day.getDate()).padStart(2,'0')].join('-');
  const p={version:1,days:{[iso]:[{id:19001,t:'WEB PORT STORAGE SMOKE',s:480,d:30,kind:'task'}]},hiddenCalendar:{}};
  return {ok:window.YOS_DAYSTREAM_WEB.write(p),day};
 });
 assert.equal(status.ok,true,'browser save writes verified local plan');
 await page.reload({waitUntil:'domcontentloaded'});
 await page.getByText('WEB PORT STORAGE SMOKE',{exact:false}).first().waitFor();
 const changed=await page.evaluate(()=>{
  const p=JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1'));
  p.days[Object.keys(p.days)[0]][0].s=540;
  const ok=window.YOS_DAYSTREAM_WEB.write(p);
  return {ok,backup:localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_BACKUP_V1')};
 });
 assert.equal(changed.ok,true);
 assert.match(changed.backup,/WEB PORT STORAGE SMOKE/);
 const learning=await page.evaluate(()=>{
  const web=window.YOS_DAYSTREAM_WEB,stamp=new Date().toISOString();
  for(let i=0;i<3;i++)web.logCompletion({title:'完了試験',at:stamp,day:'2026-11-13',plannedStart:540});
  return web.suggestions()
 });
 assert.equal(learning.length,1);
 assert.equal(learning[0].count,3);
 const importState=await page.evaluate(()=>{
  const parser=window.YOS_DAYSTREAM_SOURCES;
  const calendar=parser.parseICS('BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:source1\nSUMMARY:Web read-only fixture\nDTSTART:20261113T090000\nDTEND:20261113T100000\nEND:VEVENT\nEND:VCALENDAR');
  const tasks=parser.normalizeTasks({items:[{id:'12345678-1234-1234-1234-123456789012',title:'Web imported task',status:'次にやる',priority:'P2',due:'2026-11-13'}]});
  localStorage.setItem('YOS_DAYSTREAM_WEB_CAL_SNAPSHOT_V1',JSON.stringify(calendar));
  localStorage.setItem('YOS_DAYSTREAM_WEB_TASK_SNAPSHOT_V1',JSON.stringify(tasks));
  return {calendarCount:calendar.eventCount,taskCount:tasks.items.length}
 });
 assert.equal(importState.calendarCount,1);
 assert.equal(importState.taskCount,1);
 await page.reload({waitUntil:'domcontentloaded'});
 assert.match(await page.locator('#yosWebSourceState').innerText(),/タスク手動取込/);
 assert.match(await page.locator('#yosWebSourceState').innerText(),/Apple予定手動取込/);
 await page.locator('[data-tab="task"]').click();
 assert.match(await page.locator('#yosTaskSourceStatus').innerText(),/手動取込のTasks写し/);
 assert.match(await page.locator('#yosSourceTasks').innerText(),/Web imported task/);
 const started=await page.evaluate(()=>{
  const web=window.YOS_DAYSTREAM_WEB,at=new Date().toISOString();
  for(let i=0;i<3;i++){
   web.markStarted({id:900001+i,day:'2026-11-13'});
   web.logCompletion({id:900001+i,title:'Started action',at:new Date(Date.now()+1000).toISOString(),day:'2026-11-13',plannedStart:600});
  }
  return web.suggestions().find(x=>x.title==='Started action')
 });
 assert.equal(started.kind,'start');
 assert.equal(started.count,3);
 const downloadTask=page.waitForEvent('download');
 await page.locator('#yosWebExport').click();
 const download=await downloadTask;
 assert.equal(download.suggestedFilename(),'YOS_DAYSTREAM_WEB_ALL_BACKUP.json');
 const packageText=await fs.readFile(await download.path(),'utf8');
 const pack=JSON.parse(packageText);
 assert.equal(pack.schema,'yos-daystream-web-all-backup-v1');
 assert.ok(pack.plan.days);
 assert.ok(Array.isArray(pack.actions));
 assert.ok(pack.actions.some(a=>a.title==='Started action'&&a.startedAt));
 assert.equal(pack.tasks.items[0].title,'Web imported task');
 assert.equal(pack.calendar.eventCount,1);
 const cancelled=await page.evaluate(()=>{
  const web=window.YOS_DAYSTREAM_WEB,day='2026-11-13';
  const before=JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_ACTIONS_V1')||'[]').length;
  const ok=web.undoCompletion({id:900001,day});
  const after=JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_ACTIONS_V1')||'[]');
  const hints=web.suggestions().find(x=>x.title==='Started action');
  const firstStart=web.markStarted({id:990123,day});
  const actual=JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_STARTS_V1'))[day+'|990123'];
  const secondStart=web.markStarted({id:990123,day});
  const unchanged=JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_STARTS_V1'))[day+'|990123']===actual;
  return {before,after:after.length,ok,remaining:after.filter(x=>x.title==='Started action').length,hints:hints??null,firstStart,secondStart,unchanged};
 });
 assert.equal(cancelled.ok,true);
 assert.equal(cancelled.before-cancelled.after,1,'undo removes one historical completion');
 assert.equal(cancelled.remaining,2);
 assert.equal(cancelled.hints,null,'cancelled completion cannot create a three-occurrence recommendation');
 assert.equal(cancelled.firstStart,true);
 assert.equal(cancelled.secondStart,true);
 assert.equal(cancelled.unchanged,true,'a duplicate start tap does not overwrite confirmed first start');


 assert.equal(await page.locator('#yosWebTaskRefresh').count(),1,'read-only YOS Tasks sign-in entry exists');
 const localSchedule=await page.evaluate(()=>{
  localStorage.removeItem('YOS_DAYSTREAM_WEB_CAL_SNAPSHOT_V1');
  localStorage.setItem('yos-life-v1',JSON.stringify({days:{'2026-11-13':{schedule:[{title:'LIFE BROWSER SMOKE',start:'2026-11-13T18:00:00+09:00',end:'2026-11-13T18:45:00+09:00'}]}}}));
  return true
 });
 assert.equal(localSchedule,true);
 await page.reload({waitUntil:'domcontentloaded'});
 const inherited=await page.evaluate(()=>window.YOS_CHARCOAL_BOOT);
 assert.equal(inherited.calendarSource,'yos-life-local');
 assert.equal(inherited.calendarDays['2026-11-13'][0].title,'LIFE BROWSER SMOKE');
 assert.match(await page.locator('#yosWebSourceState').innerText(),/保存済みMY WAY生活予定/);
 page.on('dialog',async dialog=>dialog.accept());
 const adopted=await page.evaluate(()=>{
  const title='WEB PORT STORAGE SMOKE',web=window.YOS_DAYSTREAM_WEB;
  const before=JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1'));
  const day=Object.keys(before.days)[0];
  const wrong=window.YOS_DAYSTREAM_APPLY_SUGGESTION({title,kind:'completion',count:3,suggested:'13:00'});
  const result=window.YOS_DAYSTREAM_APPLY_SUGGESTION({title,kind:'start',count:3,suggested:'13:00'});
  const saved=JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1'));
  return {wrong:wrong.ok,ok:result.ok,start:saved.days[day].find(x=>x.t===title)?.s,old:before.days[day].find(x=>x.t===title)?.s};
 });
 assert.equal(adopted.wrong,false,'completion-only history never moves task start');
 assert.equal(adopted.ok,true,'verified, user-approved start suggestion moves unambiguous task');
 assert.equal(adopted.start,780);
 assert.notEqual(adopted.start,adopted.old);
 await page.reload({waitUntil:'domcontentloaded'});
 const kept=await page.evaluate(()=>{
  const p=JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1'));
  return Object.values(p.days).flat().find(x=>x.t==='WEB PORT STORAGE SMOKE')?.s
 });
 assert.equal(kept,780,'adopted actual-start proposal survives reload');
 // Restore the downloaded package through the same file input used on iPhone.
 await Promise.all([
  page.waitForNavigation({waitUntil:'domcontentloaded'}),
  page.locator('#yosWebFile').setInputFiles({name:'restore.json',mimeType:'application/json',buffer:Buffer.from(packageText)})
 ]);
 const restored=await page.evaluate(()=>({
  plan:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1')),
  actions:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_ACTIONS_V1')),
  tasks:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_TASK_SNAPSHOT_V1')),
  calendar:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_CAL_SNAPSHOT_V1')),
  prior:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1_BACKUP'))
 }));
 assert.deepEqual(restored.plan,pack.plan,'portable backup restores the actual downloaded plan');
 assert.deepEqual(restored.actions,pack.actions);
 assert.deepEqual(restored.tasks,pack.tasks);
 assert.deepEqual(restored.calendar,pack.calendar);
 assert.equal(Object.values(restored.prior.days).flat().find(x=>x.t==='WEB PORT STORAGE SMOKE').s,780,'pre-restore plan is backed up');
 const utcICS='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:ui-utc\nSUMMARY:UTC FILE INPUT\nDTSTART:20261113T003000Z\nDTEND:20261113T010000Z\nEND:VEVENT\nEND:VCALENDAR';
 await Promise.all([
  page.waitForNavigation({waitUntil:'domcontentloaded'}),
  page.locator('#yosWebFile').setInputFiles({name:'calendar.ics',mimeType:'text/calendar',buffer:Buffer.from(utcICS)})
 ]);
 const imported=await page.evaluate(()=>JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_CAL_SNAPSHOT_V1')));
 assert.equal(imported.calendarDays['2026-11-13'][0].start,570,'file input converts UTC to Japan time');
 if(type==='chromium'){
  await page.evaluate(async()=>{await navigator.serviceWorker.ready});
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),true);
  await page.context().setOffline(true);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#timelinePanel').waitFor();
  const offline=await page.evaluate(()=>({plan:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1')),calendar:window.YOS_CHARCOAL_BOOT.calendarDays}));
  assert.deepEqual(offline.plan,pack.plan,'offline launch preserves restored plan');
  assert.equal(offline.calendar['2026-11-13'][0].start,570,'offline launch retains imported calendar');
 }
 // Authenticated Notion integration uses synthetic rows, never real credentials or data.
 const liveContext=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 const live=await liveContext.newPage();let state='次にやる',title='NOTION LIVE',version='2026-11-13T01:00:00Z',writes=0,reads=0,failRead=false;
 const sourceId='11111111222233334444555555555555';
 const row=()=>({id:sourceId,title,state,order:1000,due:'2026-11-13T15:00:00Z',dueEnd:null,area:'Work',habitCycle:'',lastEditedAt:version});
 await liveContext.addInitScript(()=>{
  window.google={accounts:{id:{initialize:settings=>{window.testGoogleCallback=settings.callback},renderButton(){}}}};
  localStorage.setItem('yos-task-dashboard-cache-v1',JSON.stringify({savedAt:Date.now(),data:{tasks:[{title:'STALE PROJECTION',state:'次にやる',order:1}]}}));
 });
 await liveContext.route('https://yskn0008-bot.github.io/**',async route=>{
  const url=new URL(route.request().url());const response=await route.fetch({url:'http://127.0.0.1:4173'+url.pathname});await route.fulfill({response});
 });
 const cors={'Access-Control-Allow-Origin':'https://yskn0008-bot.github.io','Access-Control-Allow-Methods':'GET, PATCH, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'};
 await liveContext.route('https://project-y-yos-ai.vercel.app/**',async route=>{
  if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return}
  if(route.request().url().endsWith('/public-config')){await route.fulfill({headers:cors,json:{googleClientId:'test.apps.googleusercontent.com'}});return}
  assert.match(route.request().url(),/tasks\?source=notion$/);
  assert.equal(route.request().headers().authorization,'Bearer synthetic-id-token');
  if(route.request().method()==='PATCH'){
   writes++;const body=route.request().postDataJSON();assert.equal(body.pageId,sourceId);assert.equal(body.action,'complete');
   state='完了';version='2026-11-13T02:00:00Z';await route.fulfill({headers:cors,json:{source:'notion',task:row()}});return;
  }
  reads++;await route.fulfill(failRead?{status:503,headers:cors,json:{error:'synthetic offline'}}:{headers:cors,json:{source:'notion',complete:true,tasks:[row()]}});
 });
 await live.goto('https://yskn0008-bot.github.io/yos/daystream/',{waitUntil:'domcontentloaded'});
 await live.locator('[data-tab="task"]').click();await live.locator('#yosWebTaskRefresh').click();
 await live.waitForFunction(()=>typeof window.testGoogleCallback==='function');
 await live.evaluate(()=>window.testGoogleCallback({credential:'synthetic-id-token'}));
 assert.match(await live.locator('#yosSourceTasks').textContent(),/NOTION LIVE/);
 assert.doesNotMatch(await live.locator('#yosSourceTasks').textContent(),/STALE PROJECTION/);
 await live.locator('#yosStartFrom').fill('09:00');await live.locator('#yosSourceTasks button').first().click();await live.locator('#yosPlanBox button').click();
 const planned=await live.evaluate(()=>JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1')));
 const day=Object.keys(planned.days)[0],placed=planned.days[day][0];assert.equal(placed.sourceRef,'notion:notion-'+sourceId);
 title='NOTION RENAMED';await live.evaluate(()=>window.YOS_DAYSTREAM_TASK_AUTH.refresh());
 assert.equal(await live.evaluate(()=>items.find(x=>x.sourceRef==='notion:notion-11111111222233334444555555555555').t),'NOTION RENAMED');
 assert.equal(await live.evaluate(()=>items.filter(x=>x.sourceRef==='notion:notion-11111111222233334444555555555555').length),1);
 failRead=true;await live.evaluate(()=>window.YOS_DAYSTREAM_TASK_AUTH.refresh());
 assert.equal(await live.evaluate(()=>items.find(x=>x.sourceRef==='notion:notion-11111111222233334444555555555555').done),false);
 failRead=false;
 await live.evaluate(()=>yosCompleteSource(items.find(x=>x.sourceRef==='notion:notion-11111111222233334444555555555555')));
 assert.equal(writes,1);assert.equal(await live.evaluate(()=>items.find(x=>x.sourceRef==='notion:notion-11111111222233334444555555555555').done),true);
 await live.evaluate(()=>yosCompleteSource(items.find(x=>x.sourceRef==='notion:notion-11111111222233334444555555555555')));
 assert.equal(writes,1,'repeated completion cannot issue a second mutation');
 await live.reload({waitUntil:'domcontentloaded'});
 assert.equal(await live.evaluate(()=>items.find(x=>x.sourceRef==='notion:notion-11111111222233334444555555555555').done),true);
 assert.doesNotMatch(await live.locator('#yosSourceTasks').textContent(),/STALE PROJECTION/);
 assert.ok(reads>=3);
 await liveContext.close();

 // A private JSON import merges into THIS original PWA's existing plan.
 // It must not replace native cards, existing times, or unrelated app data.
 const mergeContext=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 const mergePage=await mergeContext.newPage();
 const mergeErrors=[];mergePage.on('pageerror',e=>mergeErrors.push(e.message));
 mergePage.on('dialog',dialog=>dialog.accept());
 await mergePage.goto('http://127.0.0.1:4173/yos/daystream/',{waitUntil:'domcontentloaded'});
 const beforeMerge=await mergePage.evaluate(()=>{
  const p={version:1,days:{
   '2026-12-01':[{id:7001,t:'既存テスト',s:900,d:30,kind:'task',done:false}],
   '2026-11-17':[{id:7002,t:'別の日',s:540,d:30,kind:'task',done:false}]
  },hiddenCalendar:{}};
  if(!window.YOS_DAYSTREAM_WEB.write(p))throw Error('Cannot store original plan');
  return p;
 });
 await mergePage.reload({waitUntil:'domcontentloaded'});
 const packageData={schema:'yos-daystream-direct-task-import-v1',items:[
  {sourceId:'a'.repeat(32),day:'2026-12-01',title:'起床',s:860,d:2},
  {sourceId:'b'.repeat(32),day:'2026-12-01',title:'水を飲む',s:862,d:3}
 ]};
 await Promise.all([
  mergePage.waitForNavigation({waitUntil:'domcontentloaded'}),
  mergePage.locator('#yosWebFile').setInputFiles({name:'private-daystream.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(packageData))})
 ]);
 const firstMerge=await mergePage.evaluate(()=>({
  plan:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1')),
  backup:JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_BACKUP_V1'))
 }));
 assert.deepEqual(firstMerge.backup,beforeMerge,'the entire original plan is backed up');
 assert.equal(firstMerge.plan.days['2026-12-01'].length,3);
 assert.deepEqual(firstMerge.plan.days['2026-12-01'].map(x=>x.t),['既存テスト','起床','水を飲む']);
 assert.deepEqual(firstMerge.plan.days['2026-11-17'],beforeMerge.days['2026-11-17']);
 await mergePage.evaluate(()=>showDay('2026-12-01'));
 assert.equal(await mergePage.locator('#tl .card.task').count(),3);
 assert.equal(await mergePage.locator('#tl .yos-notion-projection').count(),0);
 const edit=await mergePage.evaluate(()=>{
  const p=JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1'));
  p.days['2026-12-01'].find(x=>x.t==='水を飲む').s=920;
  return window.YOS_DAYSTREAM_WEB.write(p);
 });
 assert.equal(edit,true);
 await mergePage.reload({waitUntil:'domcontentloaded'});
 const importAgain=await mergePage.evaluate(p=>window.YOS_DAYSTREAM_WEB.importDirectTasks(p),packageData);
 assert.equal(importAgain,true,'manual reimport is idempotent');
 const afterAgain=await mergePage.evaluate(()=>JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1')));
 assert.equal(afterAgain.days['2026-12-01'].length,3);
 assert.equal(afterAgain.days['2026-12-01'].find(x=>x.t==='水を飲む').s,920);
 assert.equal(afterAgain.days['2026-12-01'].find(x=>x.t==='既存テスト').s,900);
 const invalid=await mergePage.evaluate(p=>window.YOS_DAYSTREAM_WEB.importDirectTasks(p),
  {...packageData,items:[packageData.items[0],packageData.items[0]]});
 assert.equal(invalid,false);
 assert.deepEqual(await mergePage.evaluate(()=>JSON.parse(localStorage.getItem('YOS_DAYSTREAM_WEB_PLAN_V1'))),
  afterAgain,'invalid file cannot alter saved plan');
 assert.deepEqual(mergeErrors,[]);
 await mergeContext.close();

 // Screenshot scenario: long sleep overlaps multiple short tasks, two short tasks overlap,
 // and two tasks start at the same minute. Source times must remain unchanged.
 for(const width of [320,390,402]){
  const ctx=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
  const p=await ctx.newPage();const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://127.0.0.1:4173/yos/daystream/',{waitUntil:'domcontentloaded'});
  const before=await p.evaluate(()=>{
   const day=localISO(new Date());
   const slots=[
    [2100,'Health｜睡眠時間を確保する',0,470,'task'],
    [2101,'シャワー',100,13,'task'],
    [2102,'洗顔',345,5,'task'],
    [2103,'保湿',348,5,'task'],
    [2104,'歯磨き',353,5,'task'],
    [2105,'同じ開始時刻の長い名前を持つ確認タスク',353,5,'task'],
    [2106,'運動',600,15,'task'],
    [2107,'入浴',620,15,'task'],
    [2108,'メール',720,30,'task'],
    [2109,'記録',752,15,'habit'],
    [2110,'単独',1000,5,'task'],
    [2111,'深い作業',900,50,'task'],
    [2112,'散歩',1200,90,'task']
   ];
   const tasks=slots.map(([id,t,s,d,kind])=>({id,t,s,d,kind,done:false}));
   if(!window.YOS_DAYSTREAM_WEB.write({version:1,days:{[day]:tasks},hiddenCalendar:{}}))throw Error('fixture save failed');
   return tasks;
  });
  await p.reload({waitUntil:'domcontentloaded'});
  const cells=await p.locator('#tl .card').evaluateAll(nodes=>nodes.map(node=>{
   const r=node.getBoundingClientRect(),b=node.querySelector('b'),time=node.querySelector('small');
   return {id:Number(node.dataset.id),top:r.top,bottom:r.bottom,width:r.width,
    backdrop:node.classList.contains('yos-backdrop'),foreground:node.classList.contains('yos-foreground'),
    thickness:r.height,band:node.dataset.durationBand||'',radius:getComputedStyle(node).borderRadius,
    title:b.textContent,time:time.textContent,color:getComputedStyle(node).backgroundColor,
    whiteSpace:getComputedStyle(b).whiteSpace,
    textOK:b.scrollWidth<=b.clientWidth+2&&b.scrollHeight<=b.clientHeight+2,
    timeOK:time.scrollWidth<=time.clientWidth+2};
  }));
  assert.equal(cells.length,before.length);
  const byId=new Map(cells.map(c=>[c.id,c]));
  assert.equal(byId.get(2100).backdrop,true,'long task is background, not a narrow lane');
  for(const id of [2101,2102,2103,2104,2105,2106,2107,2108,2110,2111,2112]){
   const item=byId.get(id);
   assert.equal(item.foreground,true,'full-width task '+id);
   assert.ok(item.width>width*.6,'title and hours have enough horizontal space: '+id);
   assert.equal(item.whiteSpace,'normal','allow title line wraps: '+id);
   assert.equal(item.textOK,true,'title not cropped: '+id);
   assert.equal(item.timeOK,true,'full start-end times visible: '+id);
  }
  assert.equal(byId.get(2102).time,'05:45–05:50');
  assert.equal(byId.get(2103).time,'05:48–05:53');
  assert.equal(byId.get(2105).time,'05:53–05:58');

  // Slender short tasks, progressively thicker longer tasks; text-overflow
  // protection is always allowed to increase the height if needed.
  for(const [id,height,band] of [[2110,34,'xs'],[2101,36,'sm'],[2108,38,'md'],[2111,42,'lg'],[2112,46,'xl']]){
   assert.equal(byId.get(id).thickness,height,'duration-based visible bar height: '+id);
   assert.equal(byId.get(id).band,band,'duration class matches stored duration: '+id);
  }
  assert.ok(byId.get(2105).thickness>byId.get(2110).thickness,
   'long task title wraps instead of being cut in a slim bar');
  assert.equal(byId.get(2110).color,'rgb(153, 88, 210)','default task color is brighter casual purple');
  for(const id of [2102,2106,2108,2110]){
   const surface=await p.locator('#tl [data-id="'+id+'"]').evaluate(el=>({
    shadow:getComputedStyle(el).boxShadow,
    before:getComputedStyle(el,'::before').display
   }));
   assert.equal(surface.before,'none','left stripe must be hidden for task '+id);
   assert.ok(!surface.shadow.includes('inset 4px'),'left accent shadow absent for task '+id);
  }
  assert.equal(byId.get(2106).color,'rgb(37, 142, 112)','positive status has brighter green');
  assert.equal(byId.get(2108).color,'rgb(170, 117, 41)','negative status has brighter amber');
  assert.equal(byId.get(2102).color,'rgb(196, 94, 120)','overlap has brighter red');
  assert.equal(byId.get(2110).radius,'11px','rounded casual bars keep compact corners');

  const distinct=await p.locator('#tl [data-id="2100"], #tl [data-id="2102"], #tl [data-id="2110"]').evaluateAll(nodes=>nodes.map(el=>({
   id:Number(el.dataset.id),background:getComputedStyle(el).backgroundColor,
   border:getComputedStyle(el).borderWidth,borderStyle:getComputedStyle(el).borderStyle,
   borderColor:getComputedStyle(el).borderColor,shadow:getComputedStyle(el).boxShadow
  })));
  const appearance=new Map(distinct.map(x=>[x.id,x]));
  assert.equal(appearance.get(2100).background,'rgb(101, 71, 83)','long overlapping sleep span is muted behind cards');
  assert.equal(appearance.get(2100).borderStyle,'dashed','long backdrop has a separate outlined style');
  assert.equal(appearance.get(2102).borderStyle,'solid','short overlapping card has a crisp solid edge');
  assert.equal(appearance.get(2102).border,'1px','short task remains distinct from backdrop');
  assert.notEqual(appearance.get(2102).shadow,'none','foreground cards retain a separating shadow in any browser color notation');
  assert.notEqual(appearance.get(2100).background,appearance.get(2102).background,'background sleep does not look like the red foreground');
  assert.equal(appearance.get(2110).border,'1px','purple cards also have a border');


  const visible=cells.filter(c=>!c.backdrop).sort((a,b)=>a.top-b.top);
  for(let i=1;i<visible.length;i++)assert.ok(visible[i].top>=visible[i-1].bottom-2,'dense tasks do not cover one another: '+visible[i-1].id+'/'+visible[i].id);
  for(const id of [2102,2106,2108])assert.notEqual(byId.get(id).color,byId.get(2110).color,'semantic color '+id+' differs from unknown');
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no sideways overflow');
  const grip=p.locator('#tl [data-id="2102"] .task-drag-grip');
  // iPhone has a fixed bottom navigation bar: position the grip in the visible center,
  // not merely inside the viewport while still covered by the dock.
  await p.evaluate(()=>document.querySelector('#tl [data-id="2102"]').scrollIntoView({block:'center',behavior:'instant'}));
  const r=await grip.boundingBox();assert.ok(r&&r.width>=36,'draggable grip is reachable');
  await p.evaluate(()=>{const el=document.querySelector('#tl [data-id="2102"]');window.__yosDragTrace=[];for(const name of ['pointerdown','pointermove','pointerup','pointercancel','touchstart','touchmove','touchend'])el.addEventListener(name,e=>window.__yosDragTrace.push({event:name,y:e.clientY,pointerType:e.pointerType,button:e.button,target:e.target.className}),true)});
  await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();
  await p.mouse.move(r.x+r.width/2,r.y+r.height/2+130,{steps:12});await p.mouse.up();
  const dragState=await p.evaluate(()=>({s:items.find(x=>x.id===2102).s,note:note.textContent,events:window.__yosDragTrace,scrollY:scrollY}));
  assert.notEqual(dragState.s,345,'the grip actually moves a task: '+JSON.stringify(dragState));
  await p.locator('#yosUndoBtn').click();
  assert.equal(await p.evaluate(()=>items.find(x=>x.id===2102).s),345,'undo reverses task move');
  assert.deepEqual(errs,[]);
  await ctx.close();
 }


 // Three-finger-intent regression: short tap => complete, held-moving => move,
 // long stationary hold => editor. Does not require unavailable iPhone force data.
 const gestureContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,timezoneId:'Asia/Tokyo',serviceWorkers:'block'});
 const gp=await gestureContext.newPage();
 const gestureErrors=[];gp.on('pageerror',e=>gestureErrors.push(e.message));
 await gp.goto('http://127.0.0.1:4173/yos/daystream/',{waitUntil:'domcontentloaded'});
 await gp.evaluate(()=>{
  const day=localISO(new Date()),p={version:1,days:{[day]:[
   {id:91001,t:'THREE GESTURES',s:360,d:15,kind:'task',done:false}
  ]},hiddenCalendar:{}};
  if(!window.YOS_DAYSTREAM_WEB.write(p))throw Error('gesture fixture save failed');
 });
 await gp.reload({waitUntil:'domcontentloaded'});
 await gp.evaluate(()=>{
  window.__gestureTouch=async (id,steps,fromGrip=false)=>{
   const card=document.querySelector('#tl [data-id="'+id+'"]');
   if(!card)throw Error('gesture fixture card missing');
   const target=fromGrip?card.querySelector('.task-drag-grip'):card.querySelector('.task-copy');
   for(const [type,x,y,hold] of steps){
    // WebKit test runners do not expose constructible Touch objects. A synthetic
    // cancelable Event carrying TouchList-shaped coordinates tests the same handlers.
    const touch={identifier:1,target,clientX:x,clientY:y};
    const contacts=type==='touchend'||type==='touchcancel'?[]:[touch];
    const event=new Event(type,{bubbles:true,cancelable:true});
    Object.defineProperty(event,'touches',{value:contacts});
    Object.defineProperty(event,'targetTouches',{value:contacts});
    Object.defineProperty(event,'changedTouches',{value:[touch]});
    target.dispatchEvent(event);
    if(hold)await new Promise(ok=>setTimeout(ok,hold));
   }
   return {start:items.find(x=>x.id===id)?.s,done:!!items.find(x=>x.id===id)?.done,
    editor:document.getElementById('editor').classList.contains('show'),
    deleteVisible:!document.getElementById('gestureDelete').hidden};
  };
 });
 const g1=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,45],['touchend',200,360,0]]));
 assert.equal(g1.done,true,'brief tap completes local task');
 const g2=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,40],['touchend',200,360,0]]));
 assert.equal(g2.done,false,'second brief tap toggles local completion');
 const g3=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,320],['touchend',200,360,0]]));
 assert.equal(g3.done,false,'a held but un-dragged touch does not complete');
 const g4=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,0],['touchmove',200,420,0],['touchend',200,420,0]]));
 assert.equal(g4.start,360,'quick vertical swipe scrolls instead of changing task time');
 assert.equal(g4.done,false,'scrolling does not mark task complete');

 // While a card is armed, even an attempted viewport scroll must leave the
 // hour grid pinned. On finger release native scrolling must work again.
 const pinned=await gp.evaluate(async()=>{
  const nap=ms=>new Promise(ok=>setTimeout(ok,ms));
  const target=document.querySelector('#tl [data-id="91001"] .task-copy');
  const send=(type,x=200,y=360)=>{
   const touch={identifier:100,target,clientX:x,clientY:y};
   const touches=(type==='touchend'||type==='touchcancel')?[]:[touch];
   const e=new Event(type,{bubbles:true,cancelable:true});
   Object.defineProperty(e,'touches',{value:touches});
   Object.defineProperty(e,'changedTouches',{value:[touch]});
   target.dispatchEvent(e);return e.defaultPrevented;
  };
  window.scrollTo(0,175);await nap(55);
  const before=window.scrollY;
  send('touchstart');await nap(320);
  const touchBlocked=send('touchmove');
  window.scrollTo(0,before+125);await nap(60);
  const during=window.scrollY;
  send('touchend');
  window.scrollTo(0,before+125);await nap(60);
  const after=window.scrollY;
  return {before,during,after,touchBlocked,start:items.find(x=>x.id===91001).s};
 });
 assert.ok(pinned.before>0,'scroll-lock fixture has an actual scrollable timeline');
 assert.equal(pinned.touchBlocked,true,'armed press prevents native document scrolling');
 assert.ok(Math.abs(pinned.during-pinned.before)<=2,'background time ruler must remain still on armed press: '+JSON.stringify(pinned));
 assert.ok(pinned.after>pinned.before+40,'normal background scroll is restored on release: '+JSON.stringify(pinned));
 assert.equal(pinned.start,360,'press does not change source start');

 const canceledLock=await gp.evaluate(async()=>{
  const nap=ms=>new Promise(done=>setTimeout(done,ms));
  const target=document.querySelector('#tl [data-id="91001"] .task-copy');
  const send=(type)=>{
   const touch={identifier:101,target,clientX:200,clientY:360};
   const touches=type==='touchcancel'?[]:[touch];
   const event=new Event(type,{bubbles:true,cancelable:true});
   Object.defineProperty(event,'touches',{value:touches});
   Object.defineProperty(event,'changedTouches',{value:[touch]});
   target.dispatchEvent(event);
  };
  window.scrollTo(0,170);await nap(60);
  const before=window.scrollY;
  send('touchstart');await nap(320);
  send('touchcancel');
  window.scrollTo(0,before+100);await nap(60);
  return {before,after:window.scrollY};
 });
 assert.ok(canceledLock.after>canceledLock.before+40,
  'canceled gesture must release the global scroll lock: '+JSON.stringify(canceledLock));


 const g5=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,320],['touchmove',200,530,30],['touchend',200,530,0]]));
 assert.notEqual(g5.start,360,'hold then move on the task body actually moves time');
 assert.equal(g5.done,false,'drag must not complete a task');
 await gp.locator('#yosUndoBtn').click();
 assert.equal(await gp.evaluate(()=>items.find(x=>x.id===91001).s),360,'undo restores the original time');
 const g6=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,780],['touchend',200,360,0]]));
 assert.equal(g6.editor,true,'motionless long hold opens task editor');
 assert.equal(g6.done,false,'editing never auto-completes task');
 await gp.locator('#cancelEditor').click();
 const g7=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,320],['touchmove',200,530,0],['touchcancel',200,530,0]]));
 assert.equal(g7.start,360,'cancelled move does not overwrite saved time');
 const g8=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',240,370,35],['touchend',240,370,0]],true));
 assert.equal(g8.done,false,'tapping the drag grip never accidentally completes');
 const g9=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,0],['touchmove',120,360,0],['touchend',120,360,0]]));
 assert.equal(g9.deleteVisible,true,'swipe delete still requires confirmation');
 await gp.locator('#gestureDeleteCancel').click();
 const cancelledArmed=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,320],['touchcancel',200,360,0]]));
 assert.equal(cancelledArmed.done,false,'interrupted press does not complete a task');
 assert.equal(cancelledArmed.start,360,'interrupted press does not alter task time');
 const tinySlideTap=await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,35],['touchmove',204,364,0],['touchend',204,364,0]]));
 assert.equal(tinySlideTap.done,true,'normal finger jitter under 12px still allows deliberate brief tap');
 await gp.evaluate(()=>window.__gestureTouch(91001,[['touchstart',200,360,35],['touchend',200,360,0]]));
 assert.equal(await gp.evaluate(()=>!!items.find(x=>x.id===91001).done),false,'test restores original task state');
 assert.deepEqual(gestureErrors,[],'no browser errors in three-gesture interactions');
 await gestureContext.close();

 assert.deepEqual(errors,[],'no script errors during load, storage, reload or learning');
 console.log('DAYSTREAM Web port browser smoke PASS',type);
}finally{await browser.close()}
