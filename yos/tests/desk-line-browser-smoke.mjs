import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const browserName=process.env.YOS_BROWSER||'chromium';
const browserType={chromium,webkit}[browserName];
const base=process.env.YOS_BASE_URL||'http://127.0.0.1:4173';
const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});

await context.addInitScript(() => {
  globalThis.__badgeCalls=[];
  try{
    Object.defineProperty(navigator,'setAppBadge',{configurable:true,value:async count=>{globalThis.__badgeCalls.push(['set',count])}});
    Object.defineProperty(navigator,'clearAppBadge',{configurable:true,value:async()=>{globalThis.__badgeCalls.push(['clear',0])}});
  }catch(e){}
  if(localStorage.getItem('yosDeskIntegratedStateV1')) return;
  localStorage.setItem('yosDeskIntegratedStateV1',JSON.stringify({
    version:2,
    page:'chats',
    metrics:{opens:0,taps:0},
    chatRegistryVersion:'2026-09-24-real-links-v1',
    activeChatId:'external-yos',
    chats:[
      {id:'external-yos',project:'ChatGPT',title:'外部YOS',preview:'実チャット',time:'20:30',unread:2,pinned:false,avatar:'Y',tone:'gold',alias:'',url:'https://chatgpt.com/c/yos-ui-smoke',source:'chatgpt'}
    ],
    chatThreads:{
      'asset-clarity':[
        {id:'old-progress',role:'system',kind:'progress',text:'進捗 65%\n状態：実機確認待ち\nREQUEST_DONE Router Verify Ledger E2E',at:'2026-09-28T22:41:00+09:00',progress:65}
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
      body:JSON.stringify({error:'Authentication failed',requestId:'chat-auth-retry'})
    });
    return;
  }
  await route.fulfill({
    status:200,
    contentType:'application/json',
    body:JSON.stringify({
      requestId:'chat-live-smoke',
      answer:'テスト応答です。チャットUIは動作しています。',
      route:'general',
      facts:[],assumptions:[],unknowns:[],conflicts:[],sources:[],
      safety:{level:'normal',notes:[]},
      nextAction:null,memoryCandidates:[]
    })
  });
});

async function stubAuth(badFirst=false){
  await page.evaluate(({localBase,badFirst})=>{
    globalThis.YOS_AI_BASE_URL=localBase;
    let token=badFirst?'bad-token':'good-token';
    globalThis.__chatAuthResetCount=0;
    globalThis.YOS_AUTH={
      getGoogleIdToken:async()=>token,
      resetGoogleIdToken:()=>{
        globalThis.__chatAuthResetCount+=1;
        token='good-token';
      }
    };
  },{localBase:base,badFirst});
}

try{
  await page.goto(base+'/yos/desk/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.deskLiveChat==='ready');
  await page.waitForFunction(()=>document.documentElement.dataset.deskUnifiedInbox==='ready');
  await page.waitForFunction(()=>document.documentElement.dataset.deskChatOnly==='ready');
  await page.waitForFunction(()=>document.documentElement.dataset.deskChatSync==='ok');
  await page.waitForSelector('#chatsPage.active');

  assert.equal(await page.locator('#deskPage').count(),0,'DESK page must not exist');
  assert.equal(await page.locator('.bottom').count(),0,'bottom DESK navigation must not exist');
  assert.equal(await page.locator('#newBtn').isVisible(),true,'new-chat icon must live in the chat header');
  assert.match((await page.locator('#newBtn').textContent())||'',/＋/);
  assert.equal(await page.locator('#selectBtn').count(),0,'management should move to long press instead of a permanent edit button');
  assert.equal(await page.locator('.tab[data-mode="pinned"]').count(),0,'pinned chats should stay at the top without a dedicated tab');
  assert.match((await page.locator('#chatsPage .brand strong').textContent())||'',/チャット/);
  assert.equal(await page.locator('link[rel="manifest"]').getAttribute('href'),'./manifest.webmanifest');
  assert.equal(await page.locator('meta[name="apple-mobile-web-app-title"]').getAttribute('content'),'YOS Chat');
  const chatManifest=await page.evaluate(async()=>fetch('./manifest.webmanifest',{cache:'no-store'}).then(r=>r.json()));
  assert.equal(chatManifest.name,'YOS Chat');
  assert.equal(chatManifest.start_url,'./');
  assert.equal(chatManifest.scope,'./');
  assert.equal(chatManifest.display,'standalone');
  await page.waitForFunction(()=>document.documentElement.dataset.deskBadgeCount==='2');
  assert.equal(await page.evaluate(()=>globalThis.__badgeCalls.some(x=>x[0]==='set'&&x[1]===2)),true,'unread total should be sent to the app badge API');

  const count=await page.locator('#chatList .chat').count();
  assert.ok(count>=6,'fixed YOS rooms plus registered GPT originals should populate the chat-only list');
  assert.equal(await page.locator('#projects').evaluate(el=>getComputedStyle(el).display),'none');

  const externalRow=page.locator('.chat[data-id="external-yos"]');
  assert.equal(await externalRow.evaluate(el=>el.classList.contains('currentChat')),true);
  assert.equal(await externalRow.evaluate(el=>el.classList.contains('unread')),true);
  assert.equal(await externalRow.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)','active chat must stay flat');
  assert.equal(await externalRow.evaluate(el=>parseFloat(getComputedStyle(el.querySelector('.chatName')).fontWeight)>=700),true,'unread chat title should be emphasized');
  assert.equal(await externalRow.evaluate(el=>getComputedStyle(el,'::after').backgroundColor),'rgb(10, 132, 255)','unread row should use a small iOS-blue dot');
  assert.match((await externalRow.locator('.preview').textContent())||'',/ChatGPTの元チャットを開く/);

  const row=page.locator('#chatList .chat:not(.currentChat)').first();
  const ui=await row.evaluate(row=>{
    const avatar=row.querySelector('.avatar');
    const meta=row.querySelector('.chatMeta');
    const preview=row.querySelector('.preview');
    const activeTab=document.querySelector('#chatsPage .tab.active');
    return {
      rowBackground:getComputedStyle(row).backgroundColor,
      rowMinHeight:parseFloat(getComputedStyle(row).minHeight),
      avatarDisplay:getComputedStyle(avatar).display,
      metaDisplay:getComputedStyle(meta).display,
      previewSize:parseFloat(getComputedStyle(preview).fontSize),
      previewWhiteSpace:getComputedStyle(preview).whiteSpace,
      tabRadius:getComputedStyle(activeTab).borderRadius,
      tabBackground:getComputedStyle(activeTab).backgroundColor,
      pageBackground:getComputedStyle(document.querySelector('#chatsPage')).backgroundColor
    };
  });
  assert.equal(ui.rowBackground,'rgba(0, 0, 0, 0)');
  assert.ok(ui.rowMinHeight>=64);
  assert.equal(ui.avatarDisplay,'none');
  assert.equal(ui.metaDisplay,'none');
  assert.ok(ui.previewSize>=15);
  assert.equal(ui.previewWhiteSpace,'nowrap');
  assert.ok(parseFloat(ui.tabRadius)>=20);
  assert.notEqual(ui.tabBackground,'rgba(0, 0, 0, 0)');
  assert.equal(ui.pageBackground,'rgb(0, 0, 0)');

  await stubAuth(true);
  await page.locator('.chat[data-id="asset-clarity"]').click();
  await page.waitForSelector('#threadPage.active');
  assert.match((await page.locator('#threadTitle').textContent())||'',/Clarity/);
  const friendlyProgress=(await page.locator('#messageStream').textContent())||'';
  assert.match(friendlyProgress,/いまの状況/);
  assert.match(friendlyProgress,/Googleマップ/);
  assert.doesNotMatch(friendlyProgress,/REQUEST_DONE|Router|Verify|Ledger|E2E|destination/);

  await page.locator('#threadInput').fill('チャットだけの画面から送信テスト');
  await page.locator('#threadSend').click();
  await page.waitForFunction(()=>document.querySelector('#messageStream')?.textContent?.includes('テスト応答です'));
  assert.equal(await page.evaluate(()=>globalThis.__chatAuthResetCount),1,'401 should retry once');
  assert.equal(chatRequests,2,'fixed-room message should retry once after auth reset');

  await page.locator('#threadBack').click();
  await page.waitForSelector('#chatsPage.active');
  assert.equal(await page.locator('.chat[data-id="asset-clarity"]').evaluate(el=>el.classList.contains('currentChat')),true);
  assert.match((await page.locator('.chat[data-id="asset-clarity"] .preview').textContent())||'',/^YOS：テスト応答です/,'list preview should prefer the latest real conversation over progress text');

  const firstTitles=await page.locator('#chatList .chat .chatName').evaluateAll(nodes=>nodes.slice(0,3).map(n=>n.textContent));
  assert.deepEqual([...firstTitles].sort(),['Clarity','Money','YOS'],'pinned rooms should stay in the first three positions without a fixed filter');
  await page.locator('#searchInput').fill('Money');
  assert.ok(await page.locator('#chatList .chat').count()>=1);
  await page.locator('#searchInput').fill('');

  await stubAuth(false);
  await page.locator('#newBtn').click();
  await page.waitForSelector('#createYosChat');
  assert.equal(await page.locator('#createTemporaryChat').isVisible(),true);
  await page.locator('#createYosChat').click();
  await page.waitForSelector('#threadPage.active');
  assert.match((await page.locator('#threadTitle').textContent())||'',/新しいチャット/);
  const createdChatId=await page.evaluate(()=>state.chats.find(x=>x.liveAi&&!x.assetId&&!x.temporary)?.id||'');
  assert.ok(createdChatId);
  assert.equal(await page.evaluate(id=>{
    const saved=JSON.parse(localStorage.getItem('yosDeskIntegratedStateV1')||'{}');
    return (saved.chats||[]).some(x=>x.id===id);
  },createdChatId),true,'normal new chat should persist');

  await page.locator('#threadInput').fill('自由に相談する新しい会話');
  await page.locator('#threadSend').click();
  await page.waitForFunction(()=>document.querySelector('#messageStream')?.textContent?.includes('テスト応答です'));
  assert.match((await page.locator('#threadTitle').textContent())||'',/自由に相談する新しい会話/);
  assert.equal(chatRequests,3,'new YOS chat should use the same live AI transport');
  await page.locator('#threadBack').click();
  await page.waitForSelector('#chatsPage.active');
  assert.equal(await page.locator('.chat[data-id="'+createdChatId+'"]').count(),1);

  await page.locator('#newBtn').click();
  await page.waitForSelector('#createTemporaryChat');
  await page.locator('#createTemporaryChat').click();
  await page.waitForSelector('#threadPage.active');
  assert.match((await page.locator('#threadStatus').textContent())||'',/履歴に残しません/);
  const tempId=await page.evaluate(()=>state.chats.find(x=>x.temporary)?.id||'');
  assert.ok(tempId);
  assert.equal(await page.evaluate(id=>{
    const saved=JSON.parse(localStorage.getItem('yosDeskIntegratedStateV1')||'{}');
    return (saved.chats||[]).some(x=>x.id===id)||Boolean(saved.chatThreads&&saved.chatThreads[id]);
  },tempId),false,'temporary chat must never enter localStorage');
  await page.locator('#threadBack').click();
  await page.waitForSelector('#chatsPage.active');
  assert.equal(await page.evaluate(id=>state.chats.some(x=>x.id===id),tempId),false);

  const autoUrl='https://chatgpt.com/g/g-p-smoke/c/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  await page.goto(base+'/yos/desk/?url='+encodeURIComponent(autoUrl)+'&title='+encodeURIComponent('自動取得GPT'),{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.deskAutoOriginal==='ready');
  await page.waitForSelector('#chatsPage.active');
  const automatic=await page.evaluate(url=>{
    const s=JSON.parse(localStorage.getItem('yosDeskIntegratedStateV1')||'{}');
    return (s.chats||[]).find(x=>x.url===url)||null;
  },autoUrl);
  assert.equal(automatic?.title,'自動取得GPT','canonical original handed to YOS should register automatically');
  assert.equal(automatic?.source,'chatgpt');
  assert.equal(await page.evaluate(()=>location.search),'','handoff URL should be cleaned after automatic capture');

  const importerUrl='https://chatgpt.com/g/g-p-import-smoke/c/ffffffff-1111-2222-3333-444444444444';
  await page.goto(base+'/yos/desk/import-gpt.html?text='+encodeURIComponent('元チャット '+importerUrl)+'&title='+encodeURIComponent('共有経路GPT'),{waitUntil:'networkidle'});
  await page.waitForURL(base+'/yos/desk/');
  await page.waitForFunction(()=>document.documentElement.dataset.deskUnifiedInbox==='ready');
  const imported=await page.evaluate(url=>{
    const s=JSON.parse(localStorage.getItem('yosDeskIntegratedStateV1')||'{}');
    return (s.chats||[]).find(x=>x.url===url)||null;
  },importerUrl);
  assert.equal(imported?.title,'共有経路GPT');
  assert.equal(imported?.source,'chatgpt');

  const fit=await page.evaluate(()=>{
    const app=document.getElementById('app');
    return {
      viewport:innerWidth,
      docScrollWidth:document.documentElement.scrollWidth,
      appClientWidth:app.clientWidth,
      appScrollWidth:app.scrollWidth
    };
  });
  assert.ok(fit.docScrollWidth<=fit.viewport+1,'chat-only UI must never overflow the iPhone viewport');
  assert.ok(fit.appScrollWidth<=fit.appClientWidth+1,'chat-only app must not scroll horizontally');
} finally {
  await browser.close();
}
