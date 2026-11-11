import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const engine=process.env.YOS_BROWSER||'chromium';
const browserType={chromium,webkit}[engine];
if(!browserType)throw new Error('Unsupported browser engine: '+engine);
const origin=process.env.YOS_BASE_URL||'http://127.0.0.1:4173';
const apiHost='https://notifications.test';
const bearer='synthetic-viewer-browser-token-only';
const manualBearer='synthetic-manual-browser-token';
const requestLog=[];
const notifications=[
  {id:'a'.repeat(24),at:'2026-11-07T10:00:00.000Z',category:'missed-call',
    status:'unread',source:'Clarity Notification',text:'電話：不在着信 1件'},
  {id:'b'.repeat(24),at:'2026-11-07T09:00:00.000Z',category:'money-review',
    status:'pending',source:'Native Notification',
    text:'引落の案内 <img src=x onerror="window.__notificationXss=true">'}
];
let history=notifications;
const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error.message||error)));

try {
  await page.route(apiHost+'/api/yos/notification*',async route=>{
    const req=route.request(),method=req.method();
    const headers={
      'access-control-allow-origin':origin,
      'access-control-allow-methods':'GET,POST,OPTIONS',
      'access-control-allow-headers':'authorization,content-type',
      'cache-control':'no-store'
    };
    if(method==='OPTIONS'){
      await route.fulfill({status:204,headers});
      return;
    }
    const authorization=req.headers()['authorization']||'';
    requestLog.push({method,authorization});
    if(authorization!=='Bearer '+bearer&&authorization!=='Bearer '+manualBearer){
      await route.fulfill({status:401,headers,contentType:'application/json',body:JSON.stringify({error:'Unauthorized'})});
      return;
    }
    if(method==='GET'){
      const params=new URL(req.url()).searchParams;
      const id=params.get('id');
      if(id){
        const event=history.find(e=>e.id===id);
        await route.fulfill({status:event?200:404,headers,contentType:'application/json',
          body:JSON.stringify(event?{ok:true,event,complete:true}:{error:'Notification not found'})});
        return;
      }
      const q=params.get('q')||'';
      const matching=history.filter(e=>!q||e.text.includes(q));
      const after=params.get('cursor');
      const offset=after?matching.findIndex(e=>e.id===after)+1:0;
      assert.ok(offset>=0,'cursor must exist in filtered mock history');
      const events=matching.slice(offset,offset+120);
      const hasMore=offset+events.length<matching.length;
      await route.fulfill({status:200,headers,contentType:'application/json',
        body:JSON.stringify({ok:true,complete:true,events,hasMore,
          nextCursor:hasMore?events.at(-1).id:null,totalMatched:matching.length})});
      return;
    }
    if(method==='POST'){
      const data=req.postDataJSON();
      assert.equal(data.action,'mark');
      assert.ok(['read','pending','done'].includes(data.status));
      const found=history.find(e=>e.id===data.id);
      assert.ok(found,'must not update a missing event');
      found.status=data.status;
      await route.fulfill({status:200,headers,contentType:'application/json',
        body:JSON.stringify({ok:true,id:found.id,status:found.status,duplicate:false})});
      return;
    }
    await route.fulfill({status:405,headers,body:'method not allowed'});
  });

  await page.goto(origin+'/yos/notification-box.html',{waitUntil:'domcontentloaded'});
  assert.equal(await page.locator('h1').textContent(),'通知ボックス');
  await page.locator('#api').fill(apiHost+'/');

  // Reuse the existing ephemeral YOS identity interface; never contact live Google.
  await page.evaluate(token=>{
    globalThis.YOS_AUTH=Object.freeze({
      getGoogleIdToken:async()=>token,
      resetGoogleIdToken:()=>{globalThis.__yosAuthReset=(globalThis.__yosAuthReset||0)+1}
    });
  },bearer);
  await page.getByRole('button',{name:'既存のGoogleアカウントで接続'}).click();
  await page.locator('#timeline').waitFor({state:'visible'});
  await page.locator('.event').first().waitFor({state:'visible'});
  assert.equal(await page.locator('.event').count(),2);
  assert.equal((await page.locator('#total').textContent()).trim(),'2');
  assert.equal((await page.locator('#unread').textContent()).trim(),'1');
  assert.equal((await page.locator('#pending').textContent()).trim(),'1');
  assert.ok((await page.locator('.event').first().textContent()).includes('不在着信'));

  // Notification text must never be parsed as HTML.
  assert.equal(await page.locator('.event img').count(),0);
  assert.equal(await page.evaluate(()=>globalThis.__notificationXss),undefined);
  assert.match(await page.locator('.excerpt').last().textContent(),/<img src=x onerror=/);

  await page.locator('[data-filter="missed-call"]').click();
  assert.equal(await page.locator('.event').count(),1);
  await page.locator('.event').getByRole('button',{name:'既読',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#unread')?.textContent?.trim()==='0');
  assert.equal((await page.locator('#unread').textContent()).trim(),'0');
  assert.match(await page.locator('.event .state').textContent(),/既読/);

  await page.locator('[data-filter="all"]').click();
  await page.locator('#search').fill('引落の案内');
  assert.equal(await page.locator('.event').count(),1);
  await page.locator('.event').getByRole('button',{name:'完了',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.event .state')?.textContent?.trim()==='完了');
  assert.match(await page.locator('.event .state').textContent(),/完了/);
  await page.locator('#search').fill('');
  await page.locator('[data-filter="done"]').click();
  assert.equal(await page.locator('.event').count(),1);

  await page.getByRole('button',{name:'切断'}).click();
  await page.locator('#connect').waitFor({state:'visible'});
  assert.equal(await page.locator('#timeline').isHidden(),true);
  assert.equal(await page.evaluate(()=>globalThis.__yosAuthReset),1);
  assert.equal(await page.evaluate(()=>localStorage.getItem('yos-notification-api-origin')),apiHost);
  assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(bearer));

  // The existing manual connection path is also supported, without persisting the token.
  await page.locator('#api').fill(apiHost);
  await page.locator('#key').fill(manualBearer);
  await page.locator('#connectBtn').click();
  await page.locator('#timeline').waitFor({state:'visible'});
  // A reconnect preserves the user's current filter; switch to All to inspect the full list.
  assert.equal(await page.locator('.event').count(),1);
  await page.locator('[data-filter="all"]').click();
  assert.equal(await page.locator('.event').count(),2);
  assert.equal(await page.locator('#key').inputValue(),'');
  assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(manualBearer));
  assert.ok(requestLog.some(r=>r.authorization==='Bearer '+bearer));
  assert.ok(requestLog.some(r=>r.authorization==='Bearer '+manualBearer));
  assert.ok(requestLog.some(r=>r.method==='POST'));

  // Older records remain reachable and searchable without loading them all at once.
  history=Array.from({length:125},(_,i)=>({id:i.toString(16).padStart(24,'0'),
    at:new Date(Date.parse('2026-11-07T00:00:00.000Z')+i*1000).toISOString(),
    category:'information',status:'unread',source:'Native Notification',
    text:i===0?'古い対象の通知':'普通のお知らせ'})).reverse();
  await page.getByRole('button',{name:'更新'}).click();
  await page.waitForFunction(()=>document.querySelector('#total')?.textContent?.trim()==='120+');
  await page.getByRole('button',{name:'古い通知を読み込む'}).click();
  await page.waitForFunction(()=>document.querySelector('#total')?.textContent?.trim()==='125');
  await page.locator('.event').last().getByRole('button',{name:'対応待ち'}).click();
  await page.waitForFunction(()=>document.querySelector('.event:last-child .state')?.textContent?.trim()==='対応待ち');
  assert.equal((await page.locator('#total').textContent()).trim(),'125',
    'updating an older record must retain the loaded history');
  assert.match(await page.locator('#actionStatus').textContent(),/Notionへの反映を確認/);
  assert.ok(requestLog.some(r=>r.method==='GET'));
  await page.locator('#search').fill('古い対象');
  await page.getByRole('button',{name:'全履歴から検索'}).click();
  await page.waitForFunction(()=>document.querySelector('#total')?.textContent?.trim()==='1');
  assert.match(await page.locator('.event').textContent(),/古い対象の通知/);
  assert.deepEqual(pageErrors,[]);
  console.log('notification-box browser smoke passed: '+engine);
} finally {
  await browser.close();
}
