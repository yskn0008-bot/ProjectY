import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const browserName=process.env.YOS_BROWSER||'chromium';
const browser=await ({chromium,webkit}[browserName]).launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'ja-JP',timezoneId:'Asia/Tokyo'});
const page=await context.newPage();
const base='http://127.0.0.1:4173';
const endpoint='https://project-y-yos-ai.vercel.app';
const logs=[];
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const groups=(n,offset=0)=>Array.from({length:n},(_,i)=>{
  const id=(i+offset+1).toString(16).padStart(8,'0');
  const historyKey=(i+offset+1).toString(16).padStart(32,'0');
  return {id,historyKey,at:new Date(Date.UTC(2026,10,12,9,0)-((offset+i)*60000)).toISOString(),
    text:i%3===0?'支払期限を確認':'確認済み通知 '+(offset+i+1),category:i%3===0?'money-review':'information',
    aiSummary:i%3===0?'支払いの確認が必要':'受信内容を記録 '+(offset+i+1),
    aiState:i%3===0?'complete':i%3===1?'pending':'complete',
    aiDecision:i%3===0?'YOS_ALERT':i%3===2?'YOS_SILENT':undefined,
    status:'unread'};
});
const all=[...groups(120),...groups(9,120)];
let apiAvailable=true;
await page.route('**/yos/hj/yos-auth.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:"window.YOS_AUTH={getGoogleIdToken:async()=> 'synthetic-browser-only-test-token'};"}));
await page.route('**/data/yos-runtime-providers.json',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({providers:[{id:'vercel',enabled:true,base_url:endpoint,certified_routes:['notification']} ]})}));
await page.route(endpoint+'/api/yos/notification**',async route=>{
  const url=new URL(route.request().url());
  logs.push({method:route.request().method(),url:url.pathname+url.search,auth:route.request().headers()['authorization']});
  if(!apiAvailable)return route.fulfill({status:503,contentType:'application/json',body:'{"error":"unavailable"}'});
  if(url.searchParams.has('id')){
    const item=all.find(x=>x.historyKey===url.searchParams.get('id'));
    return route.fulfill({status:item?200:404,contentType:'application/json',body:JSON.stringify(item?{ok:true,event:item,complete:true}:{ok:false})});
  }
  if(route.request().method()==='POST')return route.fulfill({status:403,contentType:'application/json',body:'{"error":"read-only test"}'});
  const cursor=url.searchParams.get('cursor');
  const start=cursor?all.findIndex(x=>x.historyKey===cursor)+1:0;
  const events=all.slice(start,start+120);
  const end=start+events.length;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,events,complete:true,nextCursor:end<all.length?events.at(-1).historyKey:null})});
});

try{
  // Exercise the real offline-safe initial state.
  await page.goto(base+'/yos/notification-history.html',{waitUntil:'domcontentloaded'});
  await page.locator('#message').waitFor({state:'visible'});
  assert.match(await page.locator('#message').innerText(),/未取得/);
  assert.equal(await page.locator('#countSaved').innerText(),'—');
  assert.equal(await page.locator('.event').count(),0);
  await page.locator('#connect').click();
  await page.waitForFunction(()=>document.querySelectorAll('.event').length===129);
  assert.match(await page.locator('#status').innerText(),/129件/);
  assert.equal(await page.locator('#mode').innerText(),'接続済み');
  assert.equal(await page.locator('.event').count(),129);
  assert.equal(logs.filter(x=>x.method==='GET').length,2,'must retrieve second page');
  assert.ok(logs.every(x=>x.auth==='Bearer synthetic-browser-only-test-token'));

  // UI still fits iPhone width, not horizontally scrollable.
  const size=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:document.documentElement.clientWidth}));
  assert.ok(size.scroll<=size.width+1,JSON.stringify(size));

  await page.locator('[data-filter="action"]').click();
  assert.equal(await page.locator('.event').count(),43);
  await page.locator('[data-filter="all"]').click();
  await page.locator('#search').fill('受信内容を記録 2');
  assert.ok(await page.locator('.event').count()>=1);
  await page.locator('#search').fill('');
  await page.locator('.event').first().click();
  assert.equal(await page.locator('#detail').isVisible(),true);
  assert.match(await page.locator('#detailTitle').innerText(),/支払いの確認/);
  assert.match(await page.locator('#detailFacts').innerText(),/未確認/);
  await page.locator('#reported').click();
  assert.equal(await page.locator('#detail').isVisible(),true,'reported must not pretend to save');
  await page.locator('#back').click();
  assert.equal(await page.locator('#detail').isVisible(),false);

  apiAvailable=false;
  await page.locator('#refresh').click();
  await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('接続未完了'));
  assert.equal(await page.locator('.event').count(),129,'error must not erase verified rows');
  assert.ok(errors.length===0,'browser exceptions: '+errors.join(' | '));
  console.log('YOS Alerts Pages '+browserName+' pass: 129 rows, pagination, filters, detail, failure fallback, zero pageerrors');
}finally{
  await browser.close();
}
