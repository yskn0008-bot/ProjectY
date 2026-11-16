/* Read-only browser acceptance: existing YOS Calendar preview + verified DAYSTREAM snapshots.
 * The test uses entirely fictional data in one browser origin, no Notion or Apple writes.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {chromium,webkit}=require('playwright');
(async()=>{
 const kind=process.env.LIFE_BROWSER==='webkit'?'webkit':'chromium';
 const browser=await (kind==='webkit'?webkit:chromium).launch({headless:true});
 const failures=[];
 try{
  const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  page.on('pageerror',e=>failures.push(String(e)));
  await page.goto('http://127.0.0.1:4173/life/calendar/',{waitUntil:'domcontentloaded'});
  const ready=await page.locator('#calendarTasksRefresh').count();
  assert.equal(ready,1,'calendar route loaded');
  await page.evaluate(()=>{
   const now=new Date(),today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
   window.__testDay=today;
   const schema='yos-daystream-source-snapshot-v1';
   const tasks={schema,kind:'tasks',status:'ok',source:'yos-auth-cache',origin:'notion',complete:true,
    checkedAt:now.toISOString(),items:[{id:'notion-'+'a'.repeat(32),title:'面接予定の確認',status:'次にやる',due:today,dueAt:today,timing:'flexible'},
     {id:'notion-'+'b'.repeat(32),title:'予定｜固定予定テスト',status:'保留',due:today,dueAt:today+'T03:00:00Z',timing:'fixed',lastSynced:now.toISOString()},
     {id:'notion-'+'c'.repeat(32),title:'予定｜古い通知',status:'保留',due:today,dueAt:today+'T03:00:00Z',timing:'fixed',lastSynced:'2026-11-01T06:56:00Z'}]};
   const next=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now.getTime()+86400000));
   tasks.calendarMoney={status:'ok',complete:true,checkedAt:now.toISOString(),items:[
      {id:'f'.repeat(32),date:next,title:'確認済み翌日支払',amount:1200,kind:'expense'}]};
   const calendar={schema,kind:'calendar',status:'ok',source:'user-file',checkedAt:now.toISOString(),
    calendarDays:{[today]:[{title:'美容室',start:600,duration:60},{title:'写真撮影',start:780,duration:45}],
     [next]:[{title:'既存の翌日予定',start:540,duration:60}]},allDayDays:{}};
   const life={days:{[today]:{lastSync:now.toISOString(),schedule:[{id:'orig-1',date:today,title:'美容室',start:today+'T01:00:00Z',end:today+'T02:00:00Z'},
     {id:'utc-1',date:today,title:'UTC午前予定',start:today+'T01:30:00Z',end:today+'T02:30:00Z'}]}}};
   const money={updatedAt:now.toISOString(),privacy:false,transactions:[{id:'payment-1',date:today,label:'確認済支払い例',type:'expense',amount:7000,completed:false}]};
   localStorage.setItem('YOS_DAYSTREAM_WEB_TASK_SNAPSHOT_V1',JSON.stringify(tasks));
   localStorage.setItem('YOS_DAYSTREAM_WEB_CAL_SNAPSHOT_V1',JSON.stringify(calendar));
   localStorage.setItem('yos-life-v1',JSON.stringify(life));
   localStorage.setItem('yos-money-v2',JSON.stringify(money));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal((await page.locator('#calendarTasksState').textContent()).trim(),'要確認');
  assert.match(await page.locator('#calendarTasksFreshness').innerText(),/予定1件/);
  assert.doesNotMatch(await page.locator('#glanceScheduleItems').innerText(),/古い通知/);
  assert.equal((await page.locator('#calendarEventsState').textContent()).trim(),'取込済み');
  assert.equal((await page.locator('#notionMoneyConnection').textContent()).trim(),'確認済','confirmed Notion money source is disclosed');
  const schedules=await page.locator('#glanceScheduleItems').innerText();
  assert.equal((schedules.match(/美容室/g)||[]).length,1,'same event in two views must not duplicate');
  assert.match(schedules,/写真撮影/);
  const timed=page.locator('#glanceScheduleItems .glance-line').filter({hasText:'固定予定テスト'});
  assert.equal((await timed.locator('.line-time').innerText()).trim(),'12:00','Notion fixed event retains Tokyo time');
  assert.match(await page.locator('#glanceTaskItems').innerText(),/面接予定の確認/);
  // Category task pages reuse the private in-browser Notion snapshot, including
  // dates that DAYSTREAM cannot schedule. No source update is attempted.
  await page.locator('.cal-areas-nav').click();
  assert.equal(await page.locator('#calAreasPanel').isVisible(),true,'domain task page is accessible');
  await page.locator('#calAreasPanel .cal-area-tabs button').filter({hasText:'Work'}).click();
  assert.match(await page.locator('#calAreasPanel').innerText(),/面接予定の確認/);
  await page.locator('#calAreasPanel .cal-area-tabs button').filter({hasText:'Self'}).click();
  await page.locator('#calAreasPanel .cal-area-add input[aria-label="タスク名"]').fill('一時テストの習慣');
  await page.locator('#calAreasPanel .cal-area-add select').selectOption('habit');
  await page.locator('#calAreasPanel .cal-area-add button[type="submit"]').click();
  const local=page.locator('#calAreasPanel .cal-area-task').filter({hasText:'一時テストの習慣'});
  assert.equal(await local.count(),1,'added habit appears once');
  await local.locator('.cal-area-check').click();
  assert.equal(await local.locator('.cal-area-check').innerText(),'✓','area local completion verified');
  assert.match(await page.locator('#calAreasPanel').innerText(),/Notion未同期/,'no false Notion sync claim');
  page.once('dialog',dialog=>dialog.accept());
  await local.locator('.cal-area-delete').click();
  assert.equal(await page.locator('#calAreasPanel .cal-area-task').filter({hasText:'一時テストの習慣'}).count(),0);
  await page.locator('[data-view="month"]').click();
  assert.equal(await page.locator('#calGrid').isVisible(),true,'return to original month');

  assert.equal(await page.locator('#nativeRefresh').count(),1,'existing Scriptable refresh is available without creating a new installer');
  // Simulate a direct, private on-device read from the existing Scriptable script.
  // The URL fragment must be erased before browser storage is marked successful.
  const privateUrl=await page.evaluate(()=>{
   const now=new Date(),day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),nonce='f'.repeat(32),body={schema:'yos-calendar-native-snapshot-v1',source:'scriptable-on-device',requestNonce:nonce,
     checkedAt:now.toISOString(),windowStart:day,windowEnd:day,completeCalendar:true,remindersStatus:'ok',
     events:[{id:'native-1',title:'iPhone予約',start:day+'T02:00:00Z',end:day+'T02:30:00Z',allDay:false}],
     reminders:[{id:'native-reminder-1',title:'電話する',dueAt:day+'T03:00:00Z',completed:false,dueAllDay:false}]};
   localStorage.setItem('YOS_CALENDAR_NATIVE_PENDING_V1',JSON.stringify({nonce,createdAt:now.getTime()}));
   const bytes=new TextEncoder().encode(JSON.stringify(body));
   let raw='';for(const b of bytes)raw+=String.fromCharCode(b);
   return location.origin+location.pathname+location.search+'#yos-native='+btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
  });
  // Navigating only to another hash on the same document does not re-run its startup handler.
  await page.goto('about:blank');
  await page.goto(privateUrl,{waitUntil:'domcontentloaded'});
  assert.equal((await page.locator('#nativeConnection').textContent()).trim(),'取込済み','native source now explicit: '+await page.locator('#nativeImportStatus').innerText());
  assert.equal(await page.evaluate(()=>location.hash),'','private fragment erased from URL/history');
  assert.match(await page.locator('#nativeImportStatus').innerText(),/保存・確認/);
  assert.match(await page.locator('#glanceScheduleItems').innerText(),/iPhone予約/);
  assert.match(await page.locator('#glanceTaskItems').innerText(),/電話する/);
  // Safari and a Home Screen PWA can be separate storage containers. A browser
  // arriving without the original nonce may never import silently.
  const anotherBrowserUrl=await page.evaluate(()=>{
    const key='YOS_CALENDAR_NATIVE_SNAPSHOT_V1';
    const raw=localStorage.getItem(key);
    localStorage.removeItem(key);
    const bytes=new TextEncoder().encode(raw);
    let text='';for(const n of bytes)text+=String.fromCharCode(n);
    return location.origin+location.pathname+'#yos-native='+btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
  });
  await page.goto('about:blank');
  await page.goto(anotherBrowserUrl,{waitUntil:'domcontentloaded'});
  assert.match(await page.locator('#nativeImportStatus').innerText(),/別のブラウザからの取込/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('YOS_CALENDAR_NATIVE_SNAPSHOT_V1')),null,'no silent cross-app data write');
  await page.locator('[aria-label="接続と設定"]').click();
  assert.equal(await page.locator('#nativeConfirm').isVisible(),true);
  await page.locator('#nativeConfirm').click();
  assert.equal((await page.locator('#nativeConnection').textContent()).trim(),'取込済み');
  assert.equal((await page.locator('#nativeConfirm').isVisible()),false);
  assert.match(await page.locator('#nativeImportStatus').innerText(),/保存・読戻し/);
  await page.locator('#calSettings .sheet-head button').click();

  assert.equal((await page.locator('#glanceExpense').innerText()).trim(),'¥0','planned money is not actual');
  assert.match(await page.locator('#glanceExpenseNote').innerText(),/7,000/,'planned money is labeled planned');
  assert.equal(await page.locator('#calGrid .cal-day').count(),42,'approved six-week month rendered');
  const selectedDay=await page.locator('.cal-day.selected').getAttribute('data-date');
  await page.locator('.cal-day[data-date="'+selectedDay+'"]').click();
  assert.equal(await page.locator('#calDaily').isVisible(),true,'date opens separate daily screen');
  assert.equal(await page.locator('.cal-month').isVisible(),false,'month is not stacked with daily');
  assert.equal((await page.locator('.cal-time-row').filter({hasText:'UTC午前予定'}).locator('.cal-time').innerText()).trim(),'10:30','UTC event shown in Tokyo time');
  await page.locator('[data-view="month"]').click();
  assert.equal(await page.locator('#calGrid').isVisible(),true,'return to calendar');
  await page.evaluate(()=>{
   const key='YOS_DAYSTREAM_WEB_CAL_SNAPSHOT_V1',c=JSON.parse(localStorage.getItem(key));
   c.checkedAt=new Date(Date.now()-8*86400000).toISOString();
   localStorage.setItem(key,JSON.stringify(c));
   const m=JSON.parse(localStorage.getItem('yos-money-v2'));m.privacy=true;
   localStorage.setItem('yos-money-v2',JSON.stringify(m));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal((await page.locator('#calendarEventsState').textContent()).trim(),'期限切れ');
  assert.doesNotMatch(await page.locator('#glanceScheduleItems').innerText(),/写真撮影/);
  assert.equal((await page.locator('#glanceExpense').textContent()).trim(),'—','Money privacy respected');
  assert.equal((await page.locator('#moneyConnection').textContent()).trim(),'非表示');
  assert.equal((await page.locator('#notionMoneyConnection').textContent()).trim(),'非表示','Notion Money is hidden by the existing privacy setting');
  // Fresh again for this separate coverage test; stale imported records must
  // remain excluded (as confirmed above), while fresh out-of-window dates survive.
  await page.evaluate(()=>{
   const key='YOS_DAYSTREAM_WEB_CAL_SNAPSHOT_V1',p=JSON.parse(localStorage.getItem(key));
   p.checkedAt=new Date().toISOString();
   localStorage.setItem(key,JSON.stringify(p));
  });
  // DAYSTREAM is a separate route but the same authenticated website origin.
  // It must see the recently validated native calendar and Reminder deadlines
  // without writing the original Apple Calendar or another Notion collection.
  await page.goto('http://127.0.0.1:4173/yos/daystream/',{waitUntil:'domcontentloaded'});
  const linked=await page.evaluate(()=>({
    source:window.YOS_CHARCOAL_BOOT?.calendarSource,
    coverage:window.YOS_CHARCOAL_BOOT?.calendarCoverage,
    rows:Object.values(window.YOS_CHARCOAL_BOOT?.calendarDays||{}).flat(),
    reminders:window.YOS_CHARCOAL_BOOT?.nativeReminders
  }));
  assert.equal(linked.source.startsWith('scriptable-on-device'),true,'DAYSTREAM uses verified native data without deleting outside dates');
  assert.equal(linked.coverage?.status,'ok','native Calendar coverage is not inferred from event count');
  assert.equal(linked.rows.some(r=>r.title==='iPhone予約'),true,'native appointment appears in DAYSTREAM');
  assert.equal(linked.rows.some(r=>r.title==='既存の翌日予定'),true,'previously imported date outside native window is preserved');
  assert.equal(linked.reminders?.some(r=>r.title==='電話する'),true,'native reminder deadline appears in DAYSTREAM');
  assert.deepEqual(failures,[],'no JS runtime exceptions');
  // Rendered acceptance of the approved two-screen UI with fictional data.
  // The harness cannot run on the production origin.
  for(const [width,height] of [[402,874],[390,844],[320,667]]){
   for(const view of ['month','day']){
    await page.goto('http://127.0.0.1:4173/life/calendar/tests/approved-calendar.browser.html?w='+width+'&h='+height+'&view='+view,{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>/DONE|ERROR/.test(document.getElementById('result').textContent),{timeout:10000});
    const report=await page.locator('#result').innerText();
    assert.doesNotMatch(report,/FAIL|ERROR/,'approved '+view+' '+width+'px: '+report);
    assert.equal((report.match(/PASS /g)||[]).length,20,'twenty rendered assertions per screen');
    if(width===390){
     fs.mkdirSync('test-results',{recursive:true});
     await page.locator('#phone').screenshot({path:'test-results/calendar-minimal-'+view+'-390-'+kind+'.png'});
    }
   }
  }
  await page.goto('http://127.0.0.1:4173/life/calendar/tests/habit-occurrence.browser.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>/DONE|ERROR/.test(document.getElementById('result').textContent));
  const habits=await page.locator('#result').innerText();assert.doesNotMatch(habits,/FAIL|ERROR/);assert.equal((habits.match(/PASS /g)||[]).length,5);
  assert.deepEqual(failures,[],'approved render has no runtime exceptions');
  console.log('YOS unified calendar '+kind+' browser tests PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
