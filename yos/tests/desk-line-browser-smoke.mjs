import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const browserName=process.env.YOS_BROWSER||'chromium';
const browserType={chromium,webkit}[browserName];
const base=process.env.YOS_BASE_URL||'http://127.0.0.1:4173';
const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});

await context.addInitScript(() => {
  if(localStorage.getItem('yosDeskIntegratedStateV1')) return;
  localStorage.setItem('yosDeskIntegratedStateV1',JSON.stringify({
    version:1,
    page:'chats',
    deskOrder:['clarity','money','clipboard'],
    board:[],
    metrics:{opens:0,taps:0,reorders:0,posts:0},
    chatRegistryVersion:'2026-09-24-real-links-v1',
    activeChatId:'external-yos',
    chats:[
      {id:'external-yos',project:'ChatGPT',title:'外部YOS',preview:'実チャット',time:'20:30',unread:0,pinned:false,avatar:'Y',tone:'gold',alias:'',url:'https://chatgpt.com/c/yos-ui-smoke'}
    ],
    chatThreads:{
      'asset-clarity':[
        {id:'old-progress',role:'system',kind:'progress',text:'進捗 65%\\n状態：実機確認待ち\\nREQUEST_DONE Router Verify Ledger E2E',at:'2026-09-28T22:41:00+09:00',progress:65}
      ]
    },
    assetThreadVersions:{clarity:'legacy-version'},
    chatProgressCopyVersion:'legacy'
  }));
});

const page=await context.newPage();
let chatRequests=0;
await page.route('**/api/yos/chat', async route => {
  chatRequests+=1;
  const authorization=route.request().headers()['authorization']||'';
  if(authorization.includes('bad-token')){
    await route.fulfill({
      status:401,
      contentType:'application/json',
      body:JSON.stringify({error:'Authentication failed',requestId:'desk-auth-retry'})
    });
    return;
  }
  await route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      requestId:'desk-live-smoke',
      answer:'テスト応答です。メッセージUIは動作しています。',
      route:'general',
      facts:[],assumptions:[],unknowns:[],conflicts:[],sources:[],
      safety:{level:'normal',notes:[]},
      nextAction:null,memoryCandidates:[]
    })
  });
});

try{
  await page.goto(base+'/yos/desk/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.deskLiveChat==='ready');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.deskChatMode),'live');
  await page.waitForFunction(()=>document.documentElement.dataset.deskChatSync==='ok');
  await page.waitForSelector('#chatsPage.active');
  assert.match((await page.locator('#chatsPage .brand strong').textContent())||'',/チャット/);

  const count=await page.locator('#chatList .chat').count();
  assert.ok(count>=6,'built-in YOS rooms should populate CHATS without manual links');
  assert.equal(await page.locator('#projects').evaluate(el=>getComputedStyle(el).display),'none','project pills stay hidden for LINE-like scanability');
  assert.equal(await page.locator('#sourceSummary').isVisible(),true,'source summary should be visible');
  assert.match((await page.locator('#sourceSummary').textContent())||'',/GPT原文 1/);
  assert.match((await page.locator('#sourceSummary').textContent())||'',/YOS内 5/);
  assert.equal(await page.locator('#addGptChatBtn').isVisible(),true,'one-tap GPT original add should be visible');
  assert.equal(await page.locator('#currentChatBanner').isVisible(),true,'active chat banner should stay visible across projects');
  assert.match((await page.locator('#currentChatBanner').textContent())||'',/会話中/);
  assert.match((await page.locator('#currentChatBanner').textContent())||'',/外部YOS/);
  const externalRow=page.locator('.chat[data-id="external-yos"]');
  assert.equal(await externalRow.evaluate(el=>el.classList.contains('currentChat')),true,'last active GPT chat should be marked as current');
  assert.match((await externalRow.locator('.sourceBadge').textContent())||'',/GPT原文/);
  assert.match((await externalRow.locator('.readState').textContent())||'',/既読/);
  assert.match((await externalRow.locator('.preview').textContent())||'',/ChatGPTの元チャットを開く/,'GPT rows must not show a divergent copied transcript');

  const row=page.locator('#chatList .chat:not(.currentChat)').first();
  const ui=await row.evaluate(row=>{
    const avatar=row.querySelector('.avatar');
    const preview=row.querySelector('.preview');
    const activeTab=document.querySelector('#chatsPage .tab.active');
    const rs=getComputedStyle(row),as=getComputedStyle(avatar),ps=getComputedStyle(preview);
    return {
      rowRadius:rs.borderRadius,rowBackground:rs.backgroundColor,rowMinHeight:parseFloat(rs.minHeight),
      avatarRadius:as.borderRadius,avatarWidth:parseFloat(as.width),
      previewSize:parseFloat(ps.fontSize),previewWhiteSpace:ps.whiteSpace,
      underlineHeight:parseFloat(getComputedStyle(activeTab,'::after').height)
    };
  });
  assert.equal(ui.rowRadius,'0px');
  assert.equal(ui.rowBackground,'rgba(0, 0, 0, 0)');
  assert.ok(ui.rowMinHeight>=72);
  assert.equal(ui.avatarRadius,'50%');
  assert.ok(ui.avatarWidth>=48);
  assert.ok(ui.previewSize>=15);
  assert.equal(ui.previewWhiteSpace,'nowrap');
  assert.ok(ui.underlineHeight>=3);

  await page.evaluate((localBase)=>{
    globalThis.YOS_AI_BASE_URL=localBase;
    let token='bad-token';
    globalThis.__deskAuthResetCount=0;
    globalThis.YOS_AUTH={
      getGoogleIdToken:async()=>token,
      resetGoogleIdToken:()=>{
        globalThis.__deskAuthResetCount+=1;
        token='good-token';
      }
    };
  },base);

  await page.locator('.chat[data-id="asset-clarity"]').click();
  await page.waitForSelector('#threadPage.active');
  assert.match((await page.locator('#threadTitle').textContent())||'',/Clarity/);
  const friendlyProgress=(await page.locator('#messageStream').textContent())||'';
  assert.match(friendlyProgress,/いまの状況/);
  assert.match(friendlyProgress,/予定の登録/);
  assert.match(friendlyProgress,/Googleマップ/);
  assert.match(friendlyProgress,/残っていること/);
  assert.match(friendlyProgress,/全部通れば進捗は85%/);
  assert.doesNotMatch(friendlyProgress,/REQUEST_DONE|Router|Verify|Ledger|E2E|destination/,'technical implementation terms should not be shown to the user');
  assert.doesNotMatch(friendlyProgress,/進捗 65%\\s*状態/,'progress/status should not be duplicated inside the message body');
  assert.match((await page.locator('#threadStatus').textContent())||'',/\d+%/);
  assert.equal(await page.locator('#bottom').evaluate(el=>getComputedStyle(el).display),'none');

  await page.locator('#threadInput').fill('YOS DESKから送信テスト');
  await page.locator('#threadSend').click();
  await page.waitForFunction(()=>document.querySelector('#messageStream')?.textContent?.includes('テスト応答です'));
  const streamText=(await page.locator('#messageStream').textContent())||'';
  assert.match(streamText,/YOS DESKから送信テスト/);
  assert.match(streamText,/テスト応答です。メッセージUIは動作しています。/);
  assert.equal(await page.evaluate(()=>globalThis.__deskAuthResetCount),1,'401 should reset Google auth once and retry the same message');
  assert.equal(chatRequests,2,'one user message should retry once after auth reset');
  assert.equal(await page.locator('#bottom').evaluate(el=>getComputedStyle(el).display),'none','bottom navigation must stay hidden while the thread is open');

  await page.locator('#threadBack').click();
  await page.waitForSelector('#chatsPage.active');
  assert.equal(await page.locator('.chat[data-id="asset-clarity"]').evaluate(el=>el.classList.contains('currentChat')),true,'opened room should become current');
  assert.match((await page.locator('#currentChatBanner').textContent())||'',/Clarity/);
  const clarityPreview=(await page.locator('.chat[data-id="asset-clarity"] .preview').textContent())||'';
  assert.match(clarityPreview,/テスト応答です/);

  await page.reload({waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.deskChatSync==='ok');
  await page.locator('.chat[data-id="asset-clarity"]').click();
  await page.waitForSelector('#threadPage.active');
  const persisted=(await page.locator('#messageStream').textContent())||'';
  assert.match(persisted,/YOS DESKから送信テスト/,'user message should survive reload');
  assert.match(persisted,/テスト応答です/,'YOS answer should survive reload');
  await page.locator('#threadBack').click();

  await page.locator('.tab[data-mode="pinned"]').click();
  assert.ok(await page.locator('#chatList .chat').count()>=3,'core pinned rooms remain filterable');
  await page.locator('.tab[data-mode="all"]').click();
  await page.locator('#searchInput').fill('Money');
  assert.ok(await page.locator('#chatList .chat').count()>=1,'chat search still works');

  await page.evaluate(()=>setPage('desk'));
  await page.waitForSelector('#deskPage.active');
  await page.waitForFunction(()=>document.documentElement.dataset.liveSync==='ok'||document.documentElement.dataset.liveSync==='local-only');
  const deskFit=await page.evaluate(()=>{
    const app=document.getElementById('app');
    const hero=document.querySelector('#deskPage .hero');
    const main=document.querySelector('#deskPage .heroMain');
    const side=document.querySelector('#deskPage .heroSide');
    const sub=document.querySelector('#deskPage .heroSub');
    const next=document.querySelector('#deskPage .next');
    const ar=app.getBoundingClientRect(),hr=hero.getBoundingClientRect(),mr=main.getBoundingClientRect(),sr=side.getBoundingClientRect();
    return {
      viewport:innerWidth,
      docScrollWidth:document.documentElement.scrollWidth,
      appClientWidth:app.clientWidth,
      appScrollWidth:app.scrollWidth,
      heroClientWidth:hero.clientWidth,
      heroScrollWidth:hero.scrollWidth,
      appLeft:ar.left,appRight:ar.right,
      heroLeft:hr.left,heroRight:hr.right,
      mainLeft:mr.left,mainRight:mr.right,
      sideLeft:sr.left,sideRight:sr.right,
      subText:(sub?.textContent||'').trim(),
      nextText:(next?.textContent||'').trim()
    };
  });
  assert.ok(deskFit.docScrollWidth<=deskFit.viewport+1,'DESK must never exceed the viewport width');
  assert.ok(deskFit.appScrollWidth<=deskFit.appClientWidth+1,'DESK app must not scroll horizontally');
  assert.ok(deskFit.heroScrollWidth<=deskFit.heroClientWidth+1,'hero grid must not overflow horizontally');
  assert.ok(deskFit.heroLeft>=deskFit.appLeft-1&&deskFit.heroRight<=deskFit.appRight+1,'hero must stay inside app');
  assert.ok(deskFit.mainRight<=deskFit.appRight+1&&deskFit.sideRight<=deskFit.appRight+1,'both hero cards must stay on-screen');
  assert.ok(deskFit.subText.endsWith('。')||deskFit.subText.endsWith('！')||deskFit.subText.endsWith('？'),'hero status should end at a sentence boundary');
  assert.ok(deskFit.nextText.endsWith('。')||deskFit.nextText.endsWith('！')||deskFit.nextText.endsWith('？'),'hero next action should end at a sentence boundary');
} finally {
  await browser.close();
}
