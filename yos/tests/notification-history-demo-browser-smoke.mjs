import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';

const browserName=process.env.YOS_BROWSER||'chromium';
const browser=await ({chromium,webkit}[browserName]).launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},locale:'ja-JP',timezoneId:'Asia/Tokyo'});
const page=await context.newPage();
const errors=[],external=[];
page.on('pageerror',e=>errors.push(e.message));
await page.route('https://project-y-yos-ai.vercel.app/**',route=>{external.push(route.request().url());return route.abort()});
try {
  await page.goto('http://127.0.0.1:4173/yos/notification-history.html?demo=1',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelectorAll('.event').length===14);
  assert.equal(await page.locator('.event').count(),14);
  assert.equal(await page.locator('#countAction').textContent(),'5');
  assert.equal(await page.locator('#countWaiting').textContent(),'3');
  assert.equal(await page.locator('#countSaved').textContent(),'6');
  assert.equal(await page.locator('#mode').textContent(),'デモ表示');
  assert.match(await page.locator('#demoBanner').innerText(),/架空データ14件/);
  assert.equal(await page.locator('#refresh').isVisible(),false,'cannot refresh remote data in demo');
  assert.equal(await page.locator('#connect').isVisible(),false,'cannot authenticate to API in demo');
  assert.equal(external.length,0,'demo must make no external API requests');
  // Approved design: dense four-column rows must remain readable on iPhone widths.
  for(const width of [320,375,390,430]){
    await page.setViewportSize({width,height:844});
    const measure=await page.evaluate(()=>{
      const bounds=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,height:r.height,width:r.width}};
      return {screen:document.documentElement.clientWidth,
        overflow:document.documentElement.scrollWidth,
        sizes:Object.fromEntries(['.notice-title','.time','.category','.tag','.result'].map(selector=>[selector,parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])),
        rows:[...document.querySelectorAll('.event')].map(el=>{
          const r=bounds(el),parts=[...el.children].map(bounds);
          return {height:r.height,parts:parts.length,inside:parts.every(p=>p.left>=r.left-1&&p.right<=r.right+1),
            columnsSeparated:parts.every((p,i)=>i===0||p.left>=parts[i-1].right-1)};
        })};
    });
    assert.equal(measure.rows.length,14);
    assert.ok(measure.sizes['.notice-title']>=13,'title too small at '+width);
    assert.ok(measure.sizes['.time']>=12,'time too small at '+width);
    assert.ok(measure.sizes['.category']>=11,'subtitle too small at '+width);
    assert.ok(measure.sizes['.tag']>=9,'decision too small at '+width);
    assert.ok(measure.sizes['.result']>=9,'result too small at '+width);

    assert.ok(measure.overflow<=measure.screen+1,'horizontal overflow at '+width+': '+JSON.stringify(measure));
    for(const [index,row] of measure.rows.entries()){
      assert.equal(row.parts,4,'four columns at '+width+' row '+index);
      assert.ok(row.inside,'content outside its row at '+width+' row '+index);
      assert.ok(row.columnsSeparated,'overlapping columns at '+width+' row '+index);
      assert.ok(row.height>=38&&row.height<=72,'unexpected row density at '+width+' row '+index+': '+row.height);
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-filter="action"]').click();
  assert.equal(await page.locator('.event').count(),5);
  await page.locator('[data-filter="wait"]').click();
  assert.equal(await page.locator('.event').count(),3);
  await page.locator('[data-filter="done"]').click();
  assert.equal(await page.locator('.event').count(),6);
  await page.locator('[data-filter="all"]').click();
  await page.locator('#search').fill('宅配');
  assert.equal(await page.locator('.event').count(),1);
  await page.locator('#search').fill('');
  await page.locator('.event').first().click();
  assert.equal(await page.locator('#detail').isVisible(),true);
  assert.match(await page.locator('#detailState').innerText(),/DEMO/);
  assert.match(await page.locator('#detailFacts').innerText(),/架空事例/);
  assert.match(await page.locator('#detailAudit').innerText(),/実際の受信・保存・操作履歴はありません/);
  const acts=['later','reported','openSource'];
  page.on('dialog',dialog=>dialog.accept());
  for(const id of acts){await page.locator('#'+id).click()}
  assert.equal(external.length,0,'demo actions must not contact external API');
  await page.locator('#back').click();
  const geometry=await page.evaluate(()=>({scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
  assert.ok(geometry.scrollWidth<=geometry.clientWidth+1,'no horizontal overflow');
  await page.locator('#demoStart').click();
  await page.waitForURL(u=>!u.searchParams.has('demo'));
  await page.waitForFunction(()=>document.querySelectorAll('.event').length===0);
  assert.match(await page.locator('#message').textContent(),/未取得/);
  assert.equal(await page.locator('#countSaved').textContent(),'—');
  assert.equal(external.length,0);
  assert.deepEqual(errors,[]);
  console.log('Safe Alerts preview '+browserName+' OK: 14 fake rows, filters, details, no API, reset.');
}finally{await browser.close()}
