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
      {id:'yos',project:'One Enter',title:'YOS',preview:'生活全体の相談と判断',time:'20:30',unread:2,pinned:true,avatar:'Y',tone:'gold',alias:'',url:'https://chatgpt.com/c/yos-ui-smoke'},
      {id:'clarity',project:'One Enter',title:'Clarity',preview:'自然文からiPhone機能へ',time:'19:42',unread:0,pinned:false,avatar:'C',tone:'blue',alias:'',url:'https://chatgpt.com/c/clarity-ui-smoke'},
      {id:'money',project:'MY WAY',title:'Money',preview:'使える金・次の支払いを確認',time:'昨日',unread:0,pinned:false,avatar:'¥',tone:'green',alias:'',url:'https://chatgpt.com/c/money-ui-smoke'}
    ]
  }));
});

const page=await context.newPage();
try{
  await page.goto(base+'/yos/desk/',{waitUntil:'networkidle'});
  await page.waitForSelector('#chatsPage.active');
  assert.match((await page.locator('#chatsPage .brand strong').textContent())||'',/チャット/);
  assert.equal(await page.locator('#chatList .chat').count(),3);

  const ui=await page.evaluate(()=>{
    const row=document.querySelector('#chatList .chat');
    const avatar=row.querySelector('.avatar');
    const preview=row.querySelector('.preview');
    const tag=row.querySelector('.tag');
    const list=document.getElementById('chatList');
    const app=document.getElementById('app');
    const activeTab=document.querySelector('#chatsPage .tab.active');
    const rowStyle=getComputedStyle(row);
    const avatarStyle=getComputedStyle(avatar);
    const previewStyle=getComputedStyle(preview);
    const tagStyle=getComputedStyle(tag);
    const underline=getComputedStyle(activeTab,'::after');
    const rowRect=row.getBoundingClientRect();
    const appRect=app.getBoundingClientRect();
    return {
      rowRadius:rowStyle.borderRadius,
      rowBackground:rowStyle.backgroundColor,
      rowMinHeight:parseFloat(rowStyle.minHeight),
      avatarRadius:avatarStyle.borderRadius,
      avatarWidth:parseFloat(avatarStyle.width),
      previewSize:parseFloat(previewStyle.fontSize),
      previewWhiteSpace:previewStyle.whiteSpace,
      tagDisplay:tagStyle.display,
      underlineHeight:parseFloat(underline.height),
      listGap:parseFloat(getComputedStyle(list).gap)||0,
      rowLeft:rowRect.left,
      rowRight:rowRect.right,
      appLeft:appRect.left,
      appRight:appRect.right
    };
  });

  assert.equal(ui.rowRadius,'0px','conversation rows should be flat, not cards');
  assert.equal(ui.rowBackground,'rgba(0, 0, 0, 0)','conversation rows should use the page background');
  assert.ok(ui.rowMinHeight>=72,'conversation rows need a familiar touch target');
  assert.equal(ui.avatarRadius,'50%','avatars should be circular');
  assert.ok(ui.avatarWidth>=48,'avatars should remain easy to scan');
  assert.ok(ui.previewSize>=15,'message previews must be readable');
  assert.equal(ui.previewWhiteSpace,'nowrap','message previews should scan as one line');
  assert.equal(ui.tagDisplay,'none','project labels belong in filters, not inside every row');
  assert.ok(ui.underlineHeight>=3,'active filter should use a simple underline');
  assert.equal(ui.listGap,0,'conversation rows should form one continuous list');
  assert.ok(Math.abs(ui.rowLeft-ui.appLeft)<=1&&Math.abs(ui.rowRight-ui.appRight)<=1,'conversation rows should run edge to edge');

  await page.locator('.tab[data-mode="pinned"]').click();
  assert.equal(await page.locator('#chatList .chat').count(),1,'pinned filter should still work');
  await page.locator('.tab[data-mode="all"]').click();
  await page.locator('#searchInput').fill('Money');
  assert.equal(await page.locator('#chatList .chat').count(),1,'chat search should still work');

  await page.evaluate(()=>{
    document.getElementById('searchInput').value='';
    state.chats=[];
    projectFilter='すべて';
    chatMode='all';
    renderChats();
  });
  assert.equal((await page.locator('#selectBtn').textContent())?.trim(),'編集','top-right action should read 編集');
  assert.equal(await page.locator('#projects').evaluate(el=>getComputedStyle(el).display),'none','redundant project pills should be hidden when there are no multiple projects');
  await page.waitForSelector('#emptyAdd',{state:'visible'});
  assert.match((await page.locator('#empty').textContent())||'',/まだチャットがありません/);
  assert.match((await page.locator('#emptyAdd').textContent())||'',/コピーしたリンクを追加/);
} finally {
  await browser.close();
}
