import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright';
const engine=process.env.HJ_BROWSER||'chromium';
const browser=await ({chromium,webkit}[engine]).launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'ja-JP',timezoneId:'Asia/Tokyo',serviceWorkers:'allow'});
const page=await context.newPage();const result=[];await mkdir('test-results',{recursive:true});
const base='http://127.0.0.1:4173';
// First-visit and revisited pages must have the same title geometry.
for(const [route,title,name] of [['/yos/','MY WAY','home'],['/life/','MY LIFE','life'],['/yos/#money','MY MONEY','money'],['/yos/#journey','MY JOURNEY','journey'],['/yos/#idea','MY IDEA','idea'],['/yos/hj/','MY JOURNEY','journey-detail']]){
 await page.goto(base+route);await page.waitForFunction(()=>document.querySelector('#mywayTitle')&&document.querySelector('#mywayThemeDialog'));
 if(name==='life')await page.waitForFunction(()=>!document.documentElement.classList.contains('life-booting'));
 if(name==='money')await page.locator('#money2Body').waitFor();
 assert.equal(await page.locator('#mywayTitle').textContent(),title);
 const box=await page.locator('#mywayTitle').boundingBox();const font=await page.locator('#mywayTitle').evaluate(e=>({family:getComputedStyle(e).fontFamily,size:getComputedStyle(e).fontSize}));
 result.push({name,box,font});assert.equal(font.size,'22px');assert.ok(Math.abs(box.x-16)<1);assert.ok(Math.abs(box.y-result[0].box.y)<1);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${name}: horizontal overflow`);
 await page.screenshot({path:`test-results/myway-${name}-${engine}.png`,fullPage:true});
}
await page.goto(base+'/yos/');await page.getByRole('button',{name:'配色を選ぶ'}).click();await page.getByRole('button',{name:'ミスト 静かなブルー'}).click();await page.getByRole('button',{name:'閉じる',exact:true}).click();
await page.goto(base+'/life/');await page.waitForFunction(()=>!document.documentElement.classList.contains('life-booting'));assert.equal(await page.locator('html').getAttribute('data-myway-theme'),'mist');
await page.goto(base+'/yos/#money');await page.locator('#money2Body').waitFor();assert.equal(await page.locator('html').getAttribute('data-myway-theme'),'mist');
assert.equal(await page.locator('.money2-heading').evaluate(e=>getComputedStyle(e,'::after').content),'none');
// Horizontal gestures navigate; vertical gestures and dialog gestures do not.
async function swipe(dx,dy){await page.evaluate(({dx,dy})=>{const el=document.querySelector('#money2Body')||document.querySelector('main.app');const start=new Touch({identifier:1,target:el,clientX:240,clientY:300});el.dispatchEvent(new TouchEvent('touchstart',{touches:[start],bubbles:true}));const end=new Touch({identifier:1,target:el,clientX:240+dx,clientY:300+dy});el.dispatchEvent(new TouchEvent('touchmove',{touches:[end],bubbles:true}));el.dispatchEvent(new TouchEvent('touchend',{touches:[],changedTouches:[end],bubbles:true}));},{dx,dy});}
await swipe(-120,100);assert.equal(await page.locator('#mywayTitle').textContent(),'MY MONEY');
await swipe(-120,5);assert.equal(await page.locator('#mywayTitle').textContent(),'MY JOURNEY');
await page.getByRole('button',{name:'配色を選ぶ'}).click();await swipe(-120,5);assert.equal(await page.locator('#mywayTitle').textContent(),'MY JOURNEY');await page.getByRole('button',{name:'閉じる',exact:true}).click();
// A delayed Life init must stay hidden, including after the old 3 second reveal timeout.
const slowContext=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});const slow=await slowContext.newPage();await slow.route('**/home-v1.js*',async route=>{await new Promise(r=>setTimeout(r,4200));await route.continue()});await slow.goto(base+'/life/',{waitUntil:'commit'});await slow.waitForTimeout(3200);assert.equal(await slow.locator('main.app').evaluate(e=>getComputedStyle(e).visibility),'hidden');await slow.waitForFunction(()=>!document.documentElement.classList.contains('life-booting'));await slowContext.close();
await writeFile(`test-results/myway-ui-${engine}.json`,JSON.stringify(result,null,2));await browser.close();console.log('MY WAY UI harmony: PASS');
