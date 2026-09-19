import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const browserName=process.env.YOS_BROWSER||'chromium';
const browserType={chromium,webkit}[browserName];
const base=process.env.YOS_BASE_URL||'http://127.0.0.1:4173';
const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();

async function expectText(selector,text){
  await page.waitForSelector(selector,{state:'visible'});
  const value=((await page.locator(selector).textContent())||'').trim();
  assert.ok(value.includes(text),selector+' expected '+text+', got '+value);
}

try{
  await page.goto(base+'/',{waitUntil:'networkidle'});
  assert.match(page.url(),/\/yos\/?$/);
  await expectText('#brandTitle','MY WAY');

  await page.locator('.money-nav').click();
  await expectText('#brandTitle','MY MONEY');

  await page.locator('.idea-nav').click();
  await expectText('#brandTitle','MY IDEA');
  await page.locator('#ideaMemo').fill('YOS unified PWA smoke');
  await page.locator('#saveIdea').click();
  await expectText('#recentIdea','YOS unified PWA smoke');

  await page.locator('.journey-nav').click();
  await expectText('#brandTitle','MY JOURNEY');

  await page.goto(base+'/life/',{waitUntil:'networkidle'});
  await expectText('.brand h1','MY LIFE');

  await page.goto(base+'/yos/hj/',{waitUntil:'networkidle'});
  await expectText('.brand h1',"Hero's Journey");

  await page.goto(base+'/system/',{waitUntil:'networkidle'});
  await expectText('h1','Mission Control');

  await page.goto(base+'/yos/',{waitUntil:'networkidle'});
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),true,'root service worker should control YOS');

  await context.setOffline(true);

  await page.goto(base+'/yos/',{waitUntil:'domcontentloaded'});
  await expectText('#brandTitle','MY WAY');
  await page.goto(base+'/life/',{waitUntil:'domcontentloaded'});
  await expectText('.brand h1','MY LIFE');
  await page.goto(base+'/yos/hj/',{waitUntil:'domcontentloaded'});
  await expectText('.brand h1',"Hero's Journey");
  await page.goto(base+'/system/',{waitUntil:'domcontentloaded'});
  await expectText('h1','Mission Control');
} finally {
  await browser.close();
}
