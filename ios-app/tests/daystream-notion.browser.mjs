import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {htmlFor,row} from './daystream-notion-scriptable.test.mjs';
const browser=await (process.env.LIFE_BROWSER==='webkit'?webkit:chromium).launch({headless:true});
try{
 for(const width of [320,390,402]){
  const page=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Tokyo'});
  const errors=[],network=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{network.push(route.request().url());return route.abort()});
  const date=await page.evaluate(()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')});
  const shift=row(date+'T17:00:00+09:00',date+'T23:00:00+09:00','夜勤','e'.repeat(32));
  shift.properties['状態']={select:null};
  shift.properties['同期キー']={rich_text:[{plain_text:'yos-shift-'+date}]};
  await page.setContent(htmlFor([
   row(date+'T10:00:00+09:00',date+'T11:00:00+09:00','架空の時間範囲'),
   row(date+'T14:00:00+09:00',null,'架空の期限','b'.repeat(32)),
   row(date,null,'架空の日付タスク','c'.repeat(32)),
   row(null,null,'架空の日付なし','d'.repeat(32)),
   shift
  ]));
  await page.waitForFunction(()=>!document.getElementById('yosNativeBoot'));
  assert.equal(await page.locator('#tl .yos-notion-projection').count(),3);
  assert.match(await page.locator('#tl .yos-notion-projection').last().innerText(),/予定.*夜勤/s);
  // Source cards are controls, never anchors: long press cannot open a Notion login preview.
  assert.equal(await page.locator('#tl a.yos-notion-projection').count(),0);
  assert.equal(await page.locator('#tl button.yos-notion-projection').count(),3);
  const shortCard=page.locator('#tl button.yos-notion-projection').filter({hasText:'架空の期限'});
  assert.equal(await shortCard.getAttribute('data-compact'),'true');
  assert.match(await shortCard.locator('small').innerText(),/^14:00$/);
  assert.equal(await page.locator('#tl .yos-notion-projection').first().evaluate(el=>getComputedStyle(el).color),
   'rgb(246, 248, 253)');
  // Single casual fill: no left accent or alternate shift color.
  const appearance=await page.locator('#tl .yos-notion-projection').evaluateAll(els=>
   els.map(el=>({background:getComputedStyle(el).backgroundColor,
    leftWidth:getComputedStyle(el).borderLeftWidth,
    rightWidth:getComputedStyle(el).borderRightWidth,
    leftColor:getComputedStyle(el).borderLeftColor,
    rightColor:getComputedStyle(el).borderRightColor})));
  assert.equal(new Set(appearance.filter((x,i)=>i<2).map(x=>x.background)).size,1);
  assert.ok(appearance.every(x=>x.leftWidth==='0px'&&x.rightWidth==='0px'));

  await page.locator('#tl button.yos-notion-projection').first().click();
  assert.equal(await page.locator('#yosNotionEditSheet').isVisible(),true);
  assert.equal(await page.locator('#yosNotionNewTime').isEnabled(),true);
  await page.locator('#yosNotionClose').click();
  assert.equal(await page.locator('#yosNotionEditSheet').isVisible(),false);
  await page.locator('#tl button.yos-notion-projection').filter({hasText:'夜勤'}).click();
  assert.equal(await page.locator('#yosNotionNewTime').isDisabled(),true);
  assert.match(await page.locator('#yosNotionSheetNote').innerText(),/読み取り専用/);
  await page.locator('#yosNotionClose').click();
  // A tap edit also uses an inline confirmation, never a Scriptable URL jump.
  await page.locator('#tl button.yos-notion-projection').first().click();
  await page.locator('#yosNotionNewTime').fill('11:15');
  await page.locator('#yosNotionSave').click();
  assert.equal(await page.locator('#yosNotionEditSheet').isVisible(),false);
  assert.equal(await page.locator('#yosNotionMoveBar').isVisible(),true);
  assert.equal(await page.locator('#yosNotionMoveBar').innerText().then(x=>x.includes('保存')),true);
  await page.locator('#yosMoveCancel').click();
  assert.equal(await page.locator('#yosNotionMoveBar').isVisible(),false);
  assert.match(await page.locator('#dayAllDay').innerText(),/時間未設定.*架空の日付タスク/s);
  assert.match(await page.locator('#yosWebSourceState').innerText(),/Notion 5件取得/);
  assert.equal(await page.locator('#taskCount').innerText(),'0/3');
  await page.locator('[data-tab="task"]').click();
  assert.match(await page.locator('#yosSourceTasks').innerText(),/架空の日付なし/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  assert.equal(network.filter(u=>/api\.notion|accounts\.google|vercel/.test(u)).length,0);
  // The separate 2-5 minute steps must not collapse into narrow lanes or overlap.
  const microPage=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Tokyo'});
  await microPage.setContent(htmlFor([
   row(date+'T10:00:00+09:00',date+'T10:02:00+09:00','起床','1'.repeat(32)),
   row(date+'T10:02:00+09:00',date+'T10:05:00+09:00','水を飲む','2'.repeat(32)),
   row(date+'T10:05:00+09:00',date+'T10:10:00+09:00','歯磨き','3'.repeat(32)),
   row(date+'T10:10:00+09:00',date+'T11:00:00+09:00','睡眠','4'.repeat(32))
  ]));
  await microPage.waitForFunction(()=>!document.getElementById('yosNativeBoot'));
  await microPage.waitForFunction(()=>document.querySelectorAll('#tl .yos-notion-projection').length===4);
  const separate=await microPage.locator('#tl .yos-notion-projection').evaluateAll(nodes=>nodes.map(n=>({
   title:n.textContent,top:n.offsetTop,height:n.offsetHeight,width:n.offsetWidth,left:n.offsetLeft
  })));
  assert.equal(separate.length,4);
  assert.ok(separate[1].top>=separate[0].top+separate[0].height);
  assert.ok(separate[2].top>=separate[1].top+separate[1].height);
  assert.ok(separate[3].top>=separate[2].top+separate[2].height);
  // Hour ticks must follow the same elastic axis as microtasks AND sleep.
  const ticks=await microPage.locator('#tl .hour').evaluateAll(nodes=>[nodes[10].offsetTop,nodes[11].offsetTop]);
  assert.ok(Math.abs(separate[0].top-ticks[0])<=2);
  assert.ok(ticks[1]>=separate[3].top+separate[3].height-3);
  assert.equal(await microPage.locator('#tl .card[data-id^="-200000"]').count(),0);
  assert.equal(new Set(separate.map(x=>x.left)).size,1);
  assert.equal(new Set(separate.map(x=>x.width)).size,1);
  assert.match(separate.map(x=>x.title).join('|'),/起床.*水を飲む.*歯磨き.*睡眠/s);
  await microPage.close();
  // In Scriptable bridge mode, explicit Save only sends a local native message.
  const livePage=await browser.newPage({viewport:{width,height:844},timezoneId:'Asia/Tokyo'});
  await livePage.setContent(htmlFor([
   row(date+'T10:00:00+09:00',date+'T10:20:00+09:00','歯磨き','5'.repeat(32))
  ],true));
  await livePage.waitForFunction(()=>!document.getElementById('yosNativeBoot'));
  const beforeUrl=livePage.url();
  await livePage.locator('#tl button.yos-notion-projection').first().click();
  await livePage.locator('#yosNotionNewTime').fill('10:30');
  await livePage.locator('#yosNotionSave').click();
  await livePage.locator('#yosMoveSave').click();
  assert.equal(livePage.url(),beforeUrl);
  const queued=await livePage.evaluate(()=>window.YOS_DAYSTREAM_OUTBOX.slice());
  assert.equal(queued.length,1);
  assert.equal(queued[0].type,'move');
  assert.equal(queued[0].values.id,'5'.repeat(32));
  assert.equal(queued[0].values.next,date+'T10:30:00+09:00');
  await livePage.evaluate(()=>window.YOS_DAYSTREAM_NATIVE_REPLY({
   requestId:window.YOS_DAYSTREAM_OUTBOX[0].requestId,ok:false,message:'再確認が必要です'
  }));
  assert.match(await livePage.locator('#yosNotionMoveBar').innerText(),/再確認が必要/);
  assert.equal(await livePage.locator('#yosMoveSave').isDisabled(),true);
  assert.equal(livePage.url(),beforeUrl);
  await livePage.close();
  await page.close();
 }
}finally{await browser.close()}
console.log('DAYSTREAM Notion browser: 320/390/402px PASS');
