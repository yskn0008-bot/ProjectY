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
   'rgb(245, 248, 255)');
  // Single casual fill: no left accent or alternate shift color.
  const appearance=await page.locator('#tl .yos-notion-projection').evaluateAll(els=>
   els.map(el=>({background:getComputedStyle(el).backgroundColor,
    leftWidth:getComputedStyle(el).borderLeftWidth,
    rightWidth:getComputedStyle(el).borderRightWidth,
    leftColor:getComputedStyle(el).borderLeftColor,
    rightColor:getComputedStyle(el).borderRightColor})));
  assert.equal(new Set(appearance.map(x=>x.background)).size,1);
  assert.ok(appearance.every(x=>x.leftWidth===x.rightWidth&&x.leftColor===x.rightColor));

  await page.locator('#tl button.yos-notion-projection').first().click();
  assert.equal(await page.locator('#yosNotionEditSheet').isVisible(),true);
  assert.equal(await page.locator('#yosNotionNewTime').isEnabled(),true);
  await page.locator('#yosNotionClose').click();
  assert.equal(await page.locator('#yosNotionEditSheet').isVisible(),false);
  await page.locator('#tl button.yos-notion-projection').filter({hasText:'夜勤'}).click();
  assert.equal(await page.locator('#yosNotionNewTime').isDisabled(),true);
  assert.match(await page.locator('#yosNotionSheetNote').innerText(),/読み取り専用/);
  await page.locator('#yosNotionClose').click();
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
   row(date+'T10:05:00+09:00',date+'T10:10:00+09:00','歯磨き','3'.repeat(32))
  ]));
  await microPage.waitForFunction(()=>!document.getElementById('yosNativeBoot'));
  await microPage.waitForFunction(()=>document.querySelectorAll('#tl .yos-notion-projection').length===3);
  const separate=await microPage.locator('#tl .yos-notion-projection').evaluateAll(nodes=>nodes.map(n=>({
   title:n.textContent,top:n.offsetTop,height:n.offsetHeight,width:n.offsetWidth,left:n.offsetLeft
  })));
  assert.equal(separate.length,3);
  assert.ok(separate[1].top>=separate[0].top+separate[0].height);
  assert.ok(separate[2].top>=separate[1].top+separate[1].height);
  assert.equal(new Set(separate.map(x=>x.left)).size,1);
  assert.equal(new Set(separate.map(x=>x.width)).size,1);
  assert.match(separate.map(x=>x.title).join('|'),/起床.*水を飲む.*歯磨き/s);
  await microPage.close();
  await page.close();
 }
}finally{await browser.close()}
console.log('DAYSTREAM Notion browser: 320/390/402px PASS');
