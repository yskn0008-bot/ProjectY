/* Read-only browser acceptance: existing YOS Calendar preview + verified DAYSTREAM snapshots.
 * The test uses entirely fictional data in one browser origin, no Notion or Apple writes.
 */
const assert=require('node:assert/strict');
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
    calendarDays:{[today]:[{title:'美容室',start:600,duration:60},{title:'写真撮影',start:780,duration:45}]},allDayDays:{}};
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
  assert.equal((await page.locator('#glanceExpense').innerText()).trim(),'¥0','planned money is not actual');
  assert.match(await page.locator('#glanceExpenseNote').innerText(),/7,000/,'planned money is labeled planned');
  await page.locator('[data-mode="month"]').click();
  assert.equal(await page.locator('#dates .cell').count()>27,true,'month rendered');
  await page.locator('[data-mode="week"]').click();
  assert.equal(await page.locator('#dates .cell').count(),7,'week rendered');
  await page.locator('[data-mode="day"]').click();
  assert.equal(await page.locator('#dates .cell').count(),1,'day rendered');
  assert.match(await page.locator('#dayItems .entry').filter({hasText:'UTC午前予定'}).locator('small').innerText(),/10:30/,'UTC event is shown in Tokyo time');
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
  assert.deepEqual(failures,[],'no JS runtime exceptions');
  console.log('YOS unified calendar '+kind+' browser tests PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
