// Real-browser 390px visual and interaction gate for the existing DAYSTREAM candidate.
// Synthetic test events only; no Apple/Notion credentials, live sources, or production writes.
const { chromium }=require(process.env.YOS_PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..');
const OUTPUT=path.join(ROOT,'test-results');
fs.mkdirSync(OUTPUT,{recursive:true});
const url=process.env.YOS_TIMELINE_TEST_URL || 'http://127.0.0.1:4173/life/calendar/daystream-timeline.html';
const FIXED='2026-11-11T09:00:00+09:00';
(async()=>{
 const browser=await chromium.launch({headless:true});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo',reducedMotion:'reduce'});
  await context.addInitScript(timestamp=>{
   const NativeDate=Date,epoch=NativeDate.parse(timestamp);
   globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[epoch]))}static now(){return epoch}};
  },FIXED);
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async dialog=>{if(dialog.type()==='confirm')await dialog.accept();else await dialog.dismiss()});
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.YOS_TIMELINE_DEBUG));
  const root=page.locator('#tlFrame');
  assert.equal(await page.locator('#tlCalendar svg').count(),1,'glass calendar icon must be visible');
  assert.equal(await page.locator('#tlExitEdit svg').count(),1,'editor back icon must be visible');

  assert.equal(await root.getAttribute('data-view'),'home','first screen must be timeline home');
  assert.equal(await root.getAttribute('data-skin'),'glass','approved glass reference is the default');
  assert.equal(await page.locator('#demoBanner').isHidden(),true,'no example schedule becomes real data');
  assert.equal(await page.locator('#tlGrid').isHidden(),true,'full 24h editor is not stacked on the home screen');
  assert.equal(await page.locator('#tlAgenda .tlAgendaRow').count(),0,'no invented personal events');
  const bounds=await root.boundingBox();
  assert.ok(bounds&&bounds.width<=391&&bounds.width>=350&&bounds.height>=750,'timeline should fill the iPhone width');
  await root.screenshot({path:path.join(OUTPUT,'timeline-390px-glass-empty.png')});

  await page.locator('#tlEnterEdit').click();
  assert.equal(await root.getAttribute('data-view'),'edit');
  assert.equal(await page.locator('#tlGrid').isVisible(),true);
  assert.equal(await page.locator('#tlGrid .tlHour').count(),25,'0:00 through 24:00 grid');
  assert.equal(await page.locator('#tlGrid').evaluate(el=>el.offsetHeight),2880,'1 minute = 2px');
  const initialEditScroll=await page.locator('#tlViewport').evaluate(el=>el.scrollTop);
  assert.ok(initialEditScroll>=960 && initialEditScroll<=1020,'first editor opening focuses 09:00 instead of midnight: '+initialEditScroll);

  async function add(title,time,duration,kind){
   await page.locator('#tlAdd').click();
   await page.locator('#tlTitle').fill(title);
   await page.locator('#tlDate').fill('2026-11-11');
   await page.locator('#tlTime').fill(time);
   await page.locator('#tlDuration').fill(String(duration));
   await page.locator('#tlKind').selectOption(kind);
   await page.locator('#tlRepeat').selectOption('none');
   await page.locator('#tlForm button[type="submit"]').click();
  }
  await add('試験：食事','09:00',30,'meal');
  await add('試験：歩行','09:20',30,'walk');
  assert.equal(await page.locator('#tlGrid .tlBlock').count(),2,'both overlapping activities must remain');
  const notes=await page.locator('#tlNotes').innerText();
  assert.match(notes,/重複/,'detect overlapping items before save');
  const before=await page.evaluate(()=>window.YOS_TIMELINE_DEBUG.getData());
  assert.equal(before.events.length,2);
  assert.equal(before.events[0].date,'2026-11-11');
  // A second visual state: deliberately scroll to planned events for layout review.
  // Do not mistake this test-only focus for automatic first-open behavior.
  const reviewScroll=await page.locator('#tlViewport').evaluate(el=>{el.scrollTop=(9*60-45)*2;return el.scrollTop});
  assert.ok(reviewScroll>=900,'the editable 24h grid supports scrolling to 09:00');
  await root.screenshot({path:path.join(OUTPUT,'timeline-390px-edit-overlap.png')});

  const fixed={schema:'yos-daystream-native-v1',generatedAt:FIXED,range:{start:'2026-10-16',end:'2027-01-13'},sources:{apple:{status:'ok'},tasks:{status:'unavailable'},money:{status:'unavailable'}},items:[{id:'fixture',type:'schedule',title:'試験：変更不可',date:'2026-11-11',source:'Appleカレンダー',startISO:'2026-11-11T11:00:00+09:00',endISO:'2026-11-11T12:00:00+09:00'}]};
  await page.evaluate(data=>window.YOS_DAYSTREAM_NATIVE_V1(data),fixed);
  assert.equal(await page.locator('#tlGrid .tlBlock.fixed').count(),1);
  const immovable=page.locator('#tlGrid .tlBlock.fixed').first(),pos=await immovable.evaluate(el=>el.style.top);
  await immovable.focus();await page.keyboard.press('ArrowDown');
  assert.equal(await immovable.evaluate(el=>el.style.top),pos,'fixed Apple event must not move');

  let captured=null;
  await page.exposeFunction('_yosTimelineCapture',data=>{captured=data});
  await page.evaluate(()=>window.YOS_DAYSTREAM_ATTACH_SAVE(v=>window._yosTimelineCapture(v)));
  await page.locator('#tlSave').click();
  await page.waitForFunction(()=>document.querySelector('#tlState')?.textContent?.includes('保存確認中'));
  assert.ok(captured?.timeline?.events?.length===2,'save must include real user-made plan, not reference image');
  assert.equal(captured.completedKeys.length,0,'planning does not mark task completed');
  await page.evaluate(()=>window.YOS_TIMELINE_SAVED(true));
  assert.match(await page.locator('#tlState').innerText(),/読み戻し確認済み/);
  await page.locator('#tlExitEdit').click();
  assert.equal(await root.getAttribute('data-view'),'home');
  assert.equal(await page.locator('#tlAgenda .tlAgendaRow').count(),3,'home must include both flexible and fixed events');
  assert.equal(await page.locator('#tlAgenda .tlAgendaRow').first().evaluate(el=>getComputedStyle(el).position),'absolute','glass HOME must align events to the time rail');
  assert.equal(await page.locator('#tlAgenda .tlAgendaRow').first().evaluate(el=>el.style.top),'432px','09:00 event should align to 0.8px per minute');
  const overlapRail=await page.locator('#tlAgenda .tlAgendaRow').nth(1).evaluate(el=>({
   start:el.dataset.actualStart,shift:el.style.getPropertyValue('--rail-shift-px'),
   realStart:Number.parseFloat(el.style.top)-Number.parseFloat(el.style.getPropertyValue('--rail-shift-px')),
   line:getComputedStyle(el.querySelector('.tlAgendaDot'),'::after').display
  }));
  assert.deepEqual(overlapRail,{start:'09:20',shift:'52px',realStart:448,line:'block'},'overlap dot must remain on 09:20 while readable card moves');
  assert.match(await page.locator('#tlScaleLabel').innerText(),/時刻軸/);

  assert.match(await page.locator('#tlAgenda').evaluate(el=>getComputedStyle(el,'::before').content),/06:00/,'home hour ruler must show the approved morning axis');
  const cardReadability=await page.locator('#tlAgenda .tlAgendaCard').first().evaluate(el=>({clientHeight:el.clientHeight,scrollHeight:el.scrollHeight,titleSize:getComputedStyle(el.querySelector('strong')).fontSize}));
  assert.equal(cardReadability.titleSize,'14px','small time slots must use compact, readable title text');
  assert.ok(cardReadability.scrollHeight<=cardReadability.clientHeight+2,'card text must fit without vertical clipping: '+JSON.stringify(cardReadability));

  await root.screenshot({path:path.join(OUTPUT,'timeline-390px-glass-planned.png')});

  const footerOverflow=await page.evaluate(()=>({documentWidth:document.documentElement.scrollWidth,innerWidth:innerWidth,rootWidth:document.getElementById('tlFrame').getBoundingClientRect().width}));
  assert.ok(footerOverflow.documentWidth<=footerOverflow.innerWidth+2,'horizontal overflow '+JSON.stringify(footerOverflow));
  assert.deepEqual(errors,[],'browser runtime errors');
  console.log('PASS mobile Chromium 390px: glass default, no fake schedule, 24h scale, overlap, immutable fixed event, save/readback, home return, no errors; 3 screenshots. Not an iPhone Scriptable test.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
