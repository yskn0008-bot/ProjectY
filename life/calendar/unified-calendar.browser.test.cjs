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
     {id:'notion-'+'b'.repeat(32),title:'固定予定テスト',status:'保留',due:today,dueAt:today+'T03:00:00Z',timing:'fixed'}]};
   const calendar={schema,kind:'calendar',status:'ok',source:'user-file',checkedAt:now.toISOString(),
    calendarDays:{[today]:[{title:'美容室',start:600,duration:60},{title:'写真撮影',start:780,duration:45}]},allDayDays:{}};
   const life={days:{[today]:{lastSync:now.toISOString(),schedule:[{id:'orig-1',date:today,title:'美容室',start:today+'T10:00:00+09:00',end:today+'T11:00:00+09:00'}]}}};
   const money={updatedAt:now.toISOString(),privacy:false,transactions:[{id:'payment-1',date:today,label:'確認済支払い例',type:'expense',amount:7000,completed:false}]};
   localStorage.setItem('YOS_DAYSTREAM_WEB_TASK_SNAPSHOT_V1',JSON.stringify(tasks));
   localStorage.setItem('YOS_DAYSTREAM_WEB_CAL_SNAPSHOT_V1',JSON.stringify(calendar));
   localStorage.setItem('yos-life-v1',JSON.stringify(life));
   localStorage.setItem('yos-money-v2',JSON.stringify(money));
  });
  await page.reload({waitUntil:'domcontentloaded'});
  assert.equal((await page.locator('#calendarTasksState').textContent()).trim(),'取込済み');
  assert.equal((await page.locator('#calendarEventsState').textContent()).trim(),'取込済み');
  const schedules=await page.locator('#glanceScheduleItems').innerText();
  assert.equal((schedules.match(/美容室/g)||[]).length,1,'same event in two views must not duplicate');
  assert.match(schedules,/写真撮影/);
  assert.match(schedules,/12:00[^\n]*固定予定テスト/,'Notion fixed event retains local time, not all-day');
  assert.match(await page.locator('#glanceTaskItems').innerText(),/面接予定の確認/);
  assert.equal((await page.locator('#glanceExpense').innerText()).trim(),'¥0','planned money is not actual');
  assert.match(await page.locator('#glanceExpenseNote').innerText(),/7,000/,'planned money is labeled planned');
  await page.locator('[data-mode="month"]').click();
  assert.equal(await page.locator('#dates .cell').count()>27,true,'month rendered');
  await page.locator('[data-mode="week"]').click();
  assert.equal(await page.locator('#dates .cell').count(),7,'week rendered');
  await page.locator('[data-mode="day"]').click();
  assert.equal(await page.locator('#dates .cell').count(),1,'day rendered');
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
  assert.deepEqual(failures,[],'no JS runtime exceptions');
  console.log('YOS unified calendar '+kind+' browser tests PASS');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
