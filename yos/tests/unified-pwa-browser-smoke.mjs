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
  await page.evaluate(() => {
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date());
    const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
    const tomorrowKey=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(tomorrow);
    localStorage.setItem('yos-life-v1',JSON.stringify({activeLifeDate:today,days:{[today]:{schedule:[],tasks:[]}}}));
    localStorage.setItem('yos-money-v2',JSON.stringify({version:2,privacy:false,accounts:[{id:'test',name:'test',balance:12345}],transactions:[{id:'pay',type:'expense',label:'連携テスト支払い',amount:500,date:tomorrowKey,status:'planned'}],goals:[],debts:[],assets:[],updatedAt:new Date().toISOString()}));
    localStorage.setItem('hj-domain-journeys-v1',JSON.stringify([{id:'main',name:'人生',stage:'日常世界',theme:'',quest:'連携された次の一手'}]));
    localStorage.setItem('hj-user-profile-v1',JSON.stringify({focusDomain:'main'}));
    localStorage.setItem('yos-my-way-ideas-v1',JSON.stringify({text:'連携されたIdea',savedAt:new Date().toISOString()}));
  });
  await page.reload({waitUntil:'networkidle'});
  await page.waitForSelector('#taskDashboardBody',{state:'visible'});
  await expectText('#taskDashboardBody','12,345円');
  await expectText('#taskDashboardBody','Life連携済み');
  await expectText('#taskDashboardBody','連携された次の一手');
  const shared=await page.evaluate(()=>window.YOSSharedStateV1?.snapshot?.());
  assert.equal(shared?.idea?.text,'連携されたIdea','all five YOS domains share state');
  assert.equal(shared?.money?.balance,12345,'Money must feed shared YOS state');

  await page.locator('.money-nav').click();
  await expectText('#brandTitle','MY MONEY');

  await page.locator('.idea-nav').click();
  await expectText('#brandTitle','MY IDEA');
  await page.locator('#ideaMemo').fill('YOS unified PWA smoke');
  await page.locator('#saveIdea').click();
  await expectText('#recentIdea','YOS unified PWA smoke');
  await page.reload({waitUntil:'networkidle'});
  await expectText('#brandTitle','MY IDEA');
  await expectText('#recentIdea','YOS unified PWA smoke');

  await page.locator('.journey-nav').click();
  await expectText('#brandTitle','MY JOURNEY');

  await page.goto(base+'/life/',{waitUntil:'networkidle'});
  await expectText('.brand h1','MY LIFE');

  await page.goto(base+'/yos/hj/',{waitUntil:'networkidle'});
  await expectText('.brand h1',"Hero's Journey");

  await page.goto(base+'/system/',{waitUntil:'networkidle'});
  await expectText('h1','Mission Control');

  if(browserName==='chromium'){
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
  }
} finally {
  await browser.close();
}
