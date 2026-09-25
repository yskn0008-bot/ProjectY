import assert from 'node:assert/strict';
import { chromium, webkit } from 'playwright';

const browserName=process.env.YOS_BROWSER||'chromium';
const browserType={chromium,webkit}[browserName];
const base=process.env.YOS_BASE_URL||'http://127.0.0.1:4173';
const browser=await browserType.launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const fixedNow=Date.parse('2026-09-23T03:00:00+09:00');
await context.addInitScript(now=>{
  const NativeDate=Date;
  globalThis.Date=class extends NativeDate{
    constructor(...args){super(...(args.length?args:[now]))}
    static now(){return now}
  };
},fixedNow);
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
    localStorage.setItem('yos-life-v1',JSON.stringify({
      activeLifeDate:today,
      days:{[today]:{schedule:[],tasks:[]}},
      lifeCalendar:[
        {id:'payment-car-insurance',title:'車保険',category:'payment',rule:{type:'monthly',day:26}},
        {id:'payment-rent',title:'家賃',category:'payment',rule:{type:'monthly',day:27}},
        {id:'income-rent',title:'家賃収入',category:'income',rule:{type:'monthly-next-weekday',day:10}}
      ]
    }));
    localStorage.removeItem('yos-money-v2');
    localStorage.setItem('hj-domain-journeys-v1',JSON.stringify([{id:'main',name:'人生',stage:'日常世界',theme:'',quest:'連携された次の一手'}]));
    localStorage.setItem('hj-user-profile-v1',JSON.stringify({focusDomain:'main'}));
    localStorage.setItem('yos-my-way-ideas-v1',JSON.stringify({text:'連携されたIdea',savedAt:new Date().toISOString()}));
  });
  await page.reload({waitUntil:'networkidle'});
  await page.waitForSelector('#taskDashboardBody',{state:'visible'});
  await expectText('#taskDashboardBody','今使える');
  await expectText('#taskDashboardBody','4,588円');
  await expectText('#taskDashboardBody','次の支払い');
  await expectText('#taskDashboardBody','9/26 車保険 7,060円');
  await expectText('#taskDashboardBody','不足見込み');
  await expectText('#taskDashboardBody','月末まで 89,952円不足');
  await expectText('#taskDashboardBody','次の入金');
  await expectText('#taskDashboardBody','10/13 家賃収入 約160,485円');
  await expectText('#taskDashboardBody','時系列');
  await expectText('#taskDashboardBody','9/27 電気・家賃');
  await expectText('#taskDashboardBody','9/28 返済');
  await expectText('#taskDashboardBody','連携された次の一手');
  const shared=await page.evaluate(()=>window.YOSSharedStateV1?.snapshot?.());
  assert.equal(shared?.idea?.text,'連携されたIdea','all five YOS domains share state');
  assert.equal(shared?.money?.balance,4588,'Money must feed the latest confirmed usable amount');
  assert.equal(shared?.money?.balanceAfterRequiredPayments,-89952,'Money must preserve the confirmed balance after required payments');
  assert.equal(shared?.money?.nextIncome?.date,'2026-10-13','Money date must win over Calendar supplement');
  const moneyFacts=await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2')));
  assert.deepEqual(moneyFacts.accounts.map(({name,balance})=>[name,balance]),[['PayPay',4033],['PayPay銀行',133],['現金',422]],'confirmed account breakdown must be written to existing yos-money-v2');
  assert.equal(moneyFacts.transactions.find(tx=>tx.id==='master-rental-income-2026-09')?.status,'received','9/10 rent income must remain received');
  assert.equal(moneyFacts.transactions.find(tx=>tx.id==='master-icloud-2026-09')?.status,'paid','9/14 iCloud must remain paid');
  assert.equal(moneyFacts.transactions.find(tx=>tx.id==='master-rental-income-2026-10')?.date,'2026-10-13','next rent income must be a separate future transaction');
  const timelineText=await page.locator('.money-mini-timeline').innerText();
  assert.equal((timelineText.match(/車保険/g)||[]).length,1,'Money and Calendar must not duplicate the same event');
  const homeGeometry=await page.evaluate(()=>({
    bottom:document.getElementById('taskDashboard').getBoundingClientRect().bottom,
    navTop:document.querySelector('.bottom-nav').getBoundingClientRect().top,
    scrollWidth:document.documentElement.scrollWidth,
    clientWidth:document.documentElement.clientWidth
  }));
  assert.ok(homeGeometry.bottom<=homeGeometry.navTop+1,`Money Home must fit above navigation: ${homeGeometry.bottom}/${homeGeometry.navTop}`);
  assert.ok(homeGeometry.scrollWidth<=homeGeometry.clientWidth+1,'Money Home must not overflow horizontally');

  await page.evaluate(()=>localStorage.clear());
  await page.goto(base.replace(/\/$/,'')+'/yos/morning-brief-bridge.html',{waitUntil:'networkidle'});
  const morning=await page.evaluate(()=>window.__yosMorningBriefBridgeV1?.build?.());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2'))?.masterFacts?.version),'2026-09-23-v5','Morning Brief bridge must refresh current Money facts without opening MY WAY first');
  assert.equal(morning?.source?.money,'yos-money-v2','Morning Brief must read existing Money SSOT');
  assert.equal(morning?.money?.next_payment?.amount,7060,'Morning Brief must read next payment amount');
  assert.equal(morning?.money?.next_income?.date,'2026-10-13','Morning Brief must read next income date');
  assert.equal(morning?.money?.next_income?.amount,160485,'Morning Brief must read next income amount');
  assert.equal(morning?.money?.shortage_possible,true,'Morning Brief must read shortage state');
  assert.equal(morning?.money?.shortfall,89952,'Morning Brief must read confirmed shortfall');

  await page.evaluate(()=>localStorage.clear());
  await page.goto(base.replace(/\/$/,'')+'/yos/payment-alert-bridge.html',{waitUntil:'networkidle'});
  const paymentAlert=await page.evaluate(()=>window.__yosPaymentAlertBridgeV1?.build?.());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2'))?.masterFacts?.version),'2026-09-23-v5','Payment Alert bridge must refresh current Money facts independently');
  assert.equal(paymentAlert?.source,'yos-money-v2','Payment Alert must read existing Money SSOT');
  assert.equal(paymentAlert?.payments?.length,1,'Payment Alert must include only payments due within three days');
  assert.equal(paymentAlert?.payments?.[0]?.id,'master-car-insurance-2026-09','Payment Alert must surface car insurance first');
  assert.equal(paymentAlert?.payments?.[0]?.amount,7060,'Payment Alert must surface confirmed amount');

  await page.evaluate(()=>localStorage.clear());
  await page.goto(base.replace(/\/$/,'')+'/yos/money-alert-bridge.html',{waitUntil:'networkidle'});
  const moneyAlert=await page.evaluate(()=>window.__yosMoneyAlertBridgeV1?.build?.());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2'))?.masterFacts?.version),'2026-09-23-v5','Money Alert bridge must refresh current Money facts independently');
  assert.equal(moneyAlert?.source,'yos-money-v2','Money Alert must read existing Money SSOT');
  assert.equal(moneyAlert?.current_balance,4588,'Money Alert must read confirmed current balance');
  assert.equal(moneyAlert?.next_payment?.amount,7060,'Money Alert must read next payment');
  assert.equal(moneyAlert?.next_income?.date,'2026-10-13','Money Alert must read next income');
  assert.ok(moneyAlert?.alerts?.some(alert=>alert.kind==='projected_shortage'&&alert.amount===89952),'Money Alert must emit confirmed projected shortage');

  await page.goto(base.replace(/\/$/,'')+'/yos/',{waitUntil:'networkidle'});
  await page.waitForSelector('#taskDashboardBody',{state:'visible'});

  await page.evaluate(()=>{
    const money=JSON.parse(localStorage.getItem('yos-money-v2'));
    money.transactions.find(tx=>tx.id==='master-car-insurance-2026-09').status='paid';
    localStorage.setItem('yos-money-v2',JSON.stringify(money));
    window.YOSSharedStateV1.refresh('smoke-paid');
  });
  await page.waitForTimeout(50);
  assert.doesNotMatch(await page.locator('.money-decision-next>div:first-child strong').innerText(),/車保険/,'paid payment must be excluded');
  await page.evaluate(()=>{
    const money=JSON.parse(localStorage.getItem('yos-money-v2'));
    money.transactions.find(tx=>tx.id==='master-car-insurance-2026-09').status='planned';
    money.accounts=money.accounts.map(account=>({...account,balance:100000}));
    localStorage.setItem('yos-money-v2',JSON.stringify(money));
    window.YOSSharedStateV1.refresh('smoke-funded');
  });
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.money-decision-warning').count(),0,'shortage warning must disappear when there is no shortage');
  await page.evaluate(()=>{
    const money=JSON.parse(localStorage.getItem('yos-money-v2'));
    const balances={'master-account-paypay':4033,'master-account-paypay-bank':133,'master-account-cash':422};
    money.accounts=money.accounts.map(account=>({...account,balance:balances[account.id]??account.balance}));
    localStorage.setItem('yos-money-v2',JSON.stringify(money));
    window.YOSSharedStateV1.refresh('smoke-restore');
  });
  await page.waitForTimeout(50);
  await expectText('.money-decision-warning','89,952円不足');

  await page.locator('.money-decision-card').click();
  await expectText('#brandTitle','MY MONEY');
  await page.locator('.home-nav').click();
  await expectText('#brandTitle','MY WAY');

  await page.locator('.yos-companion[href="./guide.html"]').click();
  await page.waitForURL(/\/yos\/guide\.html$/);
  await expectText('h1','今日は、どうする？');
  const guidePrompt=await page.evaluate(()=>window.YOSGuideV1?.buildPrompt('エアコンの風量が変わらない','normal'));
  assert.match(guidePrompt,/original_input: エアコンの風量が変わらない/);
  assert.match(guidePrompt,/必要ならProjectY/);
  assert.match(guidePrompt,/必要ならSCOUT/);
  assert.equal(await page.locator('[data-mode]').count(),3);
  await page.locator('.back-link').click();
  await page.waitForURL(/\/yos\/?$/);
  await expectText('#brandTitle','MY WAY');

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

  await page.evaluate(()=>localStorage.setItem('yos-home-settings-v2',JSON.stringify({yosUrl:'https://chatgpt.com/c/yos-smoke-chat'})));
  await page.goto(base+'/yos/desk/',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.documentElement.dataset.liveSync==='ok');
  await expectText('.heroTitle','Clarity');
  await expectText('.heroSide .big','65%');
  await expectText('#devList','Money');
  await expectText('#devList','MY WAY Widget');
  await expectText('.stats','未完了');
  await expectText('.stats','本人確認待ち');
  await expectText('.stats','YOS全体進捗');
  await expectText('#nightSuggest','本人確認待ち');
  await expectText('#nightSuggest','Clarity');
  await page.locator('[data-quick="Money"]').click();
  await expectText('#sheetBody','4,588円');
  await expectText('#sheetBody','9/26 車保険 7,060円');
  await expectText('#sheetBody','89,952円');
  await expectText('#sheetBody','10/13 家賃収入 約160,485円');
  await page.locator('#closeSheetBtn').click();
  await page.locator('[data-page="chats"]').click();
  await expectText('#chatList','YOS Chat');
  assert.equal(await page.locator('.chat').count(),1,'YOS DESK CHATS must not ship demo conversations');
  await expectText('#countAll','1');
  await expectText('#countUnread','0');
  await expectText('#countPinned','1');
  assert.equal((await page.locator('#chatList').innerText()).includes('YOS DESK UI修正'),false,'demo chat titles must be removed');
  assert.equal((await page.locator('#chatList').innerText()).includes('収入チャンス監視'),false,'demo project chat titles must be removed');
  await page.locator('[data-page="desk"]').click();
  const deskType=await page.evaluate(()=>({
    heroSub:parseFloat(getComputedStyle(document.querySelector('.heroSub')).fontSize),
    devNext:parseFloat(getComputedStyle(document.querySelector('.devNext')).fontSize),
    chatName:parseFloat(getComputedStyle(document.querySelector('.chatName')).fontSize),
    preview:parseFloat(getComputedStyle(document.querySelector('.preview')).fontSize),
    nav:parseFloat(getComputedStyle(document.querySelector('.nav')).fontSize)
  }));
  assert.ok(deskType.heroSub>=17,'YOS DESK hero secondary text must be readable');
  assert.ok(deskType.devNext>=15,'YOS DESK development secondary text must be readable');
  assert.ok(deskType.chatName>=18,'YOS DESK chat titles must be readable');
  assert.ok(deskType.preview>=15,'YOS DESK chat previews must be readable');
  assert.ok(deskType.nav>=14,'YOS DESK navigation labels must be readable');
  const firstFoldGeometry=await page.evaluate(()=>{
    const app=document.getElementById('app');
    app.scrollTop=0;
    const appRect=app.getBoundingClientRect();
    const pinRect=document.getElementById('pinSection').getBoundingClientRect();
    const developmentRect=document.getElementById('developmentSection').getBoundingClientRect();
    return {
      appTop:appRect.top,
      appBottom:appRect.bottom,
      pinBottom:pinRect.bottom,
      bottomGap:appRect.bottom-pinRect.bottom,
      developmentTop:developmentRect.top
    };
  });
  assert.ok(firstFoldGeometry.pinBottom<=firstFoldGeometry.appBottom+1,'YOS DESK pinned section must fit completely in the initial viewport');
  assert.ok(firstFoldGeometry.bottomGap>=0&&firstFoldGeometry.bottomGap<=24,'YOS DESK must not leave a large blank area below pinned entries');
  assert.ok(firstFoldGeometry.developmentTop>=firstFoldGeometry.appBottom-1,'YOS DESK development section must not appear before scrolling');

  const secondFoldGeometry=await page.evaluate(async()=>{
    const app=document.getElementById('app');
    const fold=document.getElementById('deskSecondFold');
    app.scrollTop=fold.offsetTop;
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const appRect=app.getBoundingClientRect();
    const foldRect=fold.getBoundingClientRect();
    const developmentRect=document.getElementById('developmentSection').getBoundingClientRect();
    const composerRect=document.querySelector('#deskSecondFold .composer').getBoundingClientRect();
    return {
      appTop:appRect.top,
      appBottom:appRect.bottom,
      foldTop:foldRect.top,
      foldBottom:foldRect.bottom,
      developmentTop:developmentRect.top,
      composerBottom:composerRect.bottom,
      foldScrollHeight:fold.scrollHeight,
      foldClientHeight:fold.clientHeight
    };
  });
  assert.ok(secondFoldGeometry.developmentTop>=secondFoldGeometry.appTop-1,'YOS DESK second screen must start with development');
  assert.ok(secondFoldGeometry.composerBottom<=secondFoldGeometry.appBottom+1,'YOS DESK second screen must show through the composer without a third screen');
  assert.ok(secondFoldGeometry.foldScrollHeight<=secondFoldGeometry.foldClientHeight+1,'YOS DESK development-through-end must fit in one screen');

  const deskGeometry=await page.evaluate(()=>({
    appBottom:document.getElementById('app').getBoundingClientRect().bottom,
    navTop:document.getElementById('bottom').getBoundingClientRect().top,
    navBottom:document.getElementById('bottom').getBoundingClientRect().bottom,
    viewport:window.innerHeight,
    scrollHeight:document.getElementById('app').scrollHeight,
    clientHeight:document.getElementById('app').clientHeight
  }));
  assert.ok(deskGeometry.appBottom<=deskGeometry.navTop+1,`YOS DESK content viewport must end above navigation: ${deskGeometry.appBottom}/${deskGeometry.navTop}`);
  assert.ok(deskGeometry.navBottom<=deskGeometry.viewport+1,'YOS DESK navigation must stay inside viewport');
  assert.ok(deskGeometry.scrollHeight>=deskGeometry.clientHeight,'YOS DESK content should remain independently scrollable');

  if(browserName==='chromium'){
    await page.goto(base+'/yos/',{waitUntil:'networkidle'});
    await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),true,'root service worker should control YOS');

    await context.setOffline(true);

    await page.goto(base+'/yos/',{waitUntil:'domcontentloaded'});
    await expectText('#brandTitle','MY WAY');
    await page.goto(base+'/yos/guide.html',{waitUntil:'domcontentloaded'});
    await expectText('h1','今日は、どうする？');
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
