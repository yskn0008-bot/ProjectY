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
const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
const page=await context.newPage();
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error.message||error)));

try {
  await page.route(apiHost+'/api/yos/notification',async route=>{
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
      await route.fulfill({status:200,headers,contentType:'application/json',
        body:JSON.stringify({ok:true,complete:true,events:notifications})});
      return;
    }
    if(method==='POST'){
      const data=req.postDataJSON();
      assert.equal(data.action,'mark');
      assert.ok(['read','pending','done'].includes(data.status));
      const found=notifications.find(e=>e.id===data.id);
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
  assert.equal(await page.locator('.event').count(),2);
  assert.equal(await page.locator('#key').inputValue(),'');
  assert.ok(!(await page.evaluate(()=>JSON.stringify(localStorage))).includes(manualBearer));
  assert.ok(requestLog.some(r=>r.authorization==='Bearer '+bearer));
  assert.ok(requestLog.some(r=>r.authorization==='Bearer '+manualBearer));
  assert.ok(requestLog.some(r=>r.method==='POST'));
  assert.deepEqual(pageErrors,[]);
  console.log('notification-box browser smoke passed: '+engine);
} finally {
  await browser.close();
}
