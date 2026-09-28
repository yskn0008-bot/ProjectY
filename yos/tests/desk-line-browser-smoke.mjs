import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const browserName=process.env.YOS_BROWSER||'chromium';
const browserType={chromium,webkit}[browserName];
const base=process.env.YOS_BASE_URL||'http://127.0.0.1:4173';
const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});

await context.addInitScript(() => {
  localStorage.setItem('yosDeskIntegratedStateV1',JSON.stringify({
    version:1,
    page:'chats',
    deskOrder:['clarity','money','clipboard'],
    board:[],
    metrics:{opens:0,taps:0,reorders:0,posts:0},
    chatRegistryVersion:'2026-09-24-real-links-v1',
    chats:[
      {id:'external-yos',project:'ChatGPT',title:'外部YOS',preview:'実チャット',time:'20:30',unread:0,pinned:false,avatar:'Y',tone:'gold',alias:'',url:'https://chatgpt.com/c/yos-ui-smoke'}
    ]
  }));
});

const page=await context.newPage();
await page.route('**/api/yos/chat', async route => {
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
  await page.waitForFunction(()=>document.documentElement.dataset.deskChatSync==='ok');
  await page.waitForSelector('#chatsPage.active');
  assert.match((await page.locator('#chatsPage .brand strong').textContent())||'',/チャット/);

  const count=await page.locator('#chatList .chat').count();
  assert.ok(count>=6,'built-in YOS rooms should populate CHATS without manual links');
  assert.equal(await page.locator('#projects').evaluate(el=>getComputedStyle(el).display),'none','project pills stay hidden for LINE-like scanability');

  const row=page.locator('#chatList .chat').first();
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
    globalThis.YOS_AUTH={getGoogleIdToken:async()=> 'header.payload.signature'};
  },base);

  await page.locator('.chat[data-id="asset-clarity"]').click();
  await page.waitForSelector('#threadPage.active');
  assert.match((await page.locator('#threadTitle').textContent())||'',/Clarity/);
  assert.match((await page.locator('#messageStream').textContent())||'',/進捗 65%/);
  assert.match((await page.locator('#threadStatus').textContent())||'',/65%/);
  assert.equal(await page.locator('#bottom').evaluate(el=>getComputedStyle(el).display),'none');

  await page.locator('#threadInput').fill('YOS DESKから送信テスト');
  await page.locator('#threadSend').click();
  await page.waitForFunction(()=>document.querySelector('#messageStream')?.textContent?.includes('テスト応答です'));
  const streamText=(await page.locator('#messageStream').textContent())||'';
  assert.match(streamText,/YOS DESKから送信テスト/);
  assert.match(streamText,/テスト応答です。メッセージUIは動作しています。/);

  await page.locator('#threadBack').click();
  await page.waitForSelector('#chatsPage.active');
  const clarityPreview=(await page.locator('.chat[data-id="asset-clarity"] .preview').textContent())||'';
  assert.match(clarityPreview,/テスト応答です/);

  await page.locator('.tab[data-mode="pinned"]').click();
  assert.ok(await page.locator('#chatList .chat').count()>=3,'core pinned rooms remain filterable');
  await page.locator('.tab[data-mode="all"]').click();
  await page.locator('#searchInput').fill('Money');
  assert.ok(await page.locator('#chatList .chat').count()>=1,'chat search still works');
} finally {
  await browser.close();
}
