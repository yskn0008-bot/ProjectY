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
 assert.deepEqual(errors,[],'no script errors during load, storage, reload or learning');
 console.log('DAYSTREAM Web port browser smoke PASS',type);
}finally{await browser.close()}
