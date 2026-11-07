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
// Only fictional balances are used below; never restore a historical personal balance.
const TEST_BALANCE=6000;
const REQUIRED_BEFORE_INCOME=7060+68500+3710+590+3000+1680+30000;
const EXPECTED_SHORTFALL=REQUIRED_BEFORE_INCOME-TEST_BALANCE;
const EXPECTED_MONTH_SHORTFALL=7060+68500+3710+590+3000+1680-TEST_BALANCE;

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
  // A blank device must never invent a spendable balance.
  await page.reload({waitUntil:'networkidle'});
  await page.waitForSelector('#taskDashboardBody',{state:'visible'});
  await expectText('.money-decision-current','未設定');
  const unknown=await page.evaluate(()=>window.YOSSharedStateV1?.snapshot?.()?.money);
  assert.equal(unknown?.balance,null,'unconfigured Money must stay unknown rather than reuse an old balance');

  // Seed a clearly fictional test-only balance; real personal balances are never test fixtures.
  await page.evaluate(balance=>{
    const money=JSON.parse(localStorage.getItem('yos-money-v2')||'{}');
    money.accounts=[{id:'smoke-test-cash',name:'テスト用現金',type:'cash',balance,source:'browser-smoke-fixture'}];
    localStorage.setItem('yos-money-v2',JSON.stringify(money));
  },TEST_BALANCE);
  await page.reload({waitUntil:'networkidle'});
  await expectText('#taskDashboardBody','今使える');
  await expectText('.money-decision-current',TEST_BALANCE.toLocaleString('ja-JP')+'円');
  await expectText('.money-decision-payment','次の支払い');
  await expectText('.money-decision-payment','9/26');
  await expectText('.money-decision-payment','車保険 7,060円');
  await expectText('.money-decision-warning','不足見込み');
  await expectText('.money-decision-warning','次の入金まで');
  await expectText('.money-decision-warning',EXPECTED_SHORTFALL.toLocaleString('ja-JP')+'円不足');
  await expectText('.money-decision-income','次の入金');
  await expectText('.money-decision-income','10/13');
  await expectText('.money-decision-income','家賃収入 約160,485円');
  await expectText('#taskDashboardBody','時系列');
  await expectText('#taskDashboardBody','9/27 電気・家賃');
  await expectText('#taskDashboardBody','9/29 MoneyForward');
  await expectText('#taskDashboardBody','連携された次の一手');
  const shared=await page.evaluate(()=>window.YOSSharedStateV1?.snapshot?.());
  assert.equal(shared?.idea?.text,'連携されたIdea','all five YOS domains share state');
  assert.equal(shared?.money?.balance,TEST_BALANCE,'Money must read the fictional explicit account, not historical defaults');
  assert.equal(shared?.money?.balanceAfterRequiredPayments,-EXPECTED_SHORTFALL,'Money must subtract all unpaid items before next income');
  assert.equal(shared?.money?.nextIncome?.date,'2026-10-13','Money date must win over Calendar supplement');
  const moneyFacts=await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2')));
  assert.deepEqual(moneyFacts.accounts.map(({name,balance})=>[name,balance]),[['テスト用現金',TEST_BALANCE]],'test-only account must survive Money migration without stale balance reseeding');
  assert.equal(moneyFacts.transactions.find(tx=>tx.id==='master-rental-income-2026-09')?.status,'received','9/10 income remains received');
  assert.equal(moneyFacts.transactions.find(tx=>tx.id==='master-icloud-2026-09')?.status,'paid','9/14 iCloud remains paid');
  assert.equal(moneyFacts.transactions.find(tx=>tx.id==='master-repayment-2026-09')?.status,'paid','paid repayment must not be charged again');
  assert.equal(moneyFacts.transactions.find(tx=>tx.id==='master-rental-income-2026-10')?.date,'2026-10-13','next rent income remains a separate future transaction');
  const timelineText=await page.locator('.money-mini-timeline').innerText();
  assert.equal((timelineText.match(/車保険/g)||[]).length,1,'Money and Calendar must not duplicate the same event');
  assert.doesNotMatch(timelineText,/9\/28 返済/,'already-paid repayment must not be shown as unpaid');
  const homeGeometry=await page.evaluate(()=>({
    bottom:document.getElementById('taskDashboard').getBoundingClientRect().bottom,
    navTop:document.querySelector('.bottom-nav').getBoundingClientRect().top,
    scrollWidth:document.documentElement.scrollWidth,
    clientWidth:document.documentElement.clientWidth
  }));
  assert.ok(homeGeometry.bottom<=homeGeometry.navTop+1,'Money Home must fit above navigation');
  assert.ok(homeGeometry.scrollWidth<=homeGeometry.clientWidth+1,'Money Home must not overflow horizontally');

  // Independent bridges start from empty storage and must fail closed on missing balances.
  await page.evaluate(()=>localStorage.clear());
  await page.goto(base.replace(/\/$/,'')+'/yos/morning-brief-bridge.html',{waitUntil:'networkidle'});
  const morning=await page.evaluate(()=>window.__yosMorningBriefBridgeV1?.build?.());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2'))?.masterFacts?.version),'2026-09-29-v10','Morning Bridge must use the current master migration');
  assert.equal(morning?.source?.money,'yos-money-v2','Morning Brief must read the existing Money SSOT');
  assert.equal(morning?.money?.today_usable,null,'unknown balance must not create a daily spending allowance');
  assert.equal(morning?.money?.next_payment?.amount,7060,'Morning Brief must still show a known payment');
  assert.equal(morning?.money?.next_income?.date,'2026-10-13','Morning Brief must still identify estimated next income');
  assert.equal(morning?.money?.next_income?.amount,160485,'Morning Brief must preserve the estimated incoming amount');
  assert.equal(morning?.money?.shortage_possible,false,'unknown balance must not be labeled confirmed shortage');
  assert.equal(morning?.money?.shortfall,0,'unknown shortage must not create a fictional number');

  await page.evaluate(()=>localStorage.clear());
  await page.goto(base.replace(/\/$/,'')+'/yos/payment-alert-bridge.html',{waitUntil:'networkidle'});
  const paymentAlert=await page.evaluate(()=>window.__yosPaymentAlertBridgeV1?.build?.());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2'))?.masterFacts?.version),'2026-09-29-v10','Payment Bridge must use the current master migration');
  assert.equal(paymentAlert?.source,'yos-money-v2','Payment Alert must use existing Money SSOT');
  assert.equal(paymentAlert?.payments?.length,1,'Payment Alert must include only payments due within three days');
  assert.equal(paymentAlert?.payments?.[0]?.id,'master-car-insurance-2026-09','Payment Alert must surface car insurance first');
  assert.equal(paymentAlert?.payments?.[0]?.amount,7060,'Payment Alert must preserve confirmed payment amount');

  await page.evaluate(()=>localStorage.clear());
  await page.goto(base.replace(/\/$/,'')+'/yos/money-alert-bridge.html',{waitUntil:'networkidle'});
  const moneyAlert=await page.evaluate(()=>window.__yosMoneyAlertBridgeV1?.build?.());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2'))?.masterFacts?.version),'2026-09-29-v10','Money Alert must use the current master migration');
  assert.equal(moneyAlert?.source,'yos-money-v2','Money Alert must use existing Money SSOT');
  assert.equal(moneyAlert?.current_balance,null,'Money Alert must not invent an unconfigured current balance');
  assert.equal(moneyAlert?.next_payment?.amount,7060,'Money Alert must preserve next known payment');
  assert.equal(moneyAlert?.next_income?.date,'2026-10-13','Money Alert must preserve next estimated income date');
  assert.equal(moneyAlert?.alerts?.some(alert=>alert.kind==='projected_shortage'),false,'unknown balance cannot produce a confirmed shortage alert');

  // Return to a funded synthetic test scenario; never change real or production storage.
  await page.evaluate(balance=>{
    const money=JSON.parse(localStorage.getItem('yos-money-v2')||'{}');
    money.accounts=[{id:'smoke-test-cash',name:'テスト用現金',type:'cash',balance,source:'browser-smoke-fixture'}];
    localStorage.setItem('yos-money-v2',JSON.stringify(money));
  },TEST_BALANCE);
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
    money.accounts=money.accounts.map(account=>({...account,balance:200000}));
    localStorage.setItem('yos-money-v2',JSON.stringify(money));
    window.YOSSharedStateV1.refresh('smoke-funded');
  });
  await page.waitForTimeout(50);
  assert.equal(await page.locator('.money-decision-warning').count(),0,'shortage warning must disappear when the synthetic balance covers known payments');
  await page.evaluate(balance=>{
    const money=JSON.parse(localStorage.getItem('yos-money-v2'));
    money.accounts=money.accounts.map(account=>({...account,balance}));
    localStorage.setItem('yos-money-v2',JSON.stringify(money));
    window.YOSSharedStateV1.refresh('smoke-restore');
  },TEST_BALANCE);
  await page.waitForTimeout(50);
  await expectText('.money-decision-warning',EXPECTED_SHORTFALL.toLocaleString('ja-JP')+'円不足');

  await page.locator('.money-decision-card').click();
  await expectText('.money5-brand','MY MONEY');
  await page.locator('.money5-brand').click();
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
  await expectText('.money5-brand','MY MONEY');
  await expectText('#money2Body','今使えるお金');
  await expectText('#money2Body',TEST_BALANCE.toLocaleString('ja-JP'));
  await expectText('#money2Body','月末不足');
  await expectText('#money2Body',EXPECTED_MONTH_SHORTFALL.toLocaleString('ja-JP'));
  await expectText('#money2Body','今月収支');
  await expectText('#money2Body','65,405');
  // The actual calendar subtab is exercised below; the compact Home need not duplicate its link.
  await expectText('#money2Body','生活防衛費');
  assert.equal(await page.locator('.money5-subnav [data-money-tab]').count(),6,'Money must expose six internal destinations');
  const moneyGeometry=await page.evaluate(()=>({
    scrollWidth:document.documentElement.scrollWidth,
    clientWidth:document.documentElement.clientWidth,
    balanceSize:parseFloat(getComputedStyle(document.querySelector('.money6-balance strong')).fontSize)
  }));
  assert.ok(moneyGeometry.scrollWidth<=moneyGeometry.clientWidth+1,'MY MONEY must not overflow horizontally at 390px');
  assert.ok(moneyGeometry.balanceSize>=40,'usable balance must be the strongest numeric hierarchy');

  await page.locator('[data-money-tab="categories"]').click();
  await expectText('#money2Body','カテゴリー別支出');
  await page.locator('[data-money-tab="calendar"]').click();
  await expectText('#money2Body','支払い・入金・定期収支を月で確認');
  await page.locator('[data-money-tab="dashboard"]').click();
  await expectText('#money2Body','口座・資産の内訳');

  await page.locator('[data-money-tab="transactions"]').click();
  await expectText('#money2Body','取引履歴');
  await page.locator('.money3-panel [data-money-action="add-entry"]').click();
  await page.locator('#money2DialogForm [name="date"]').fill('2026-09-28');
  await page.locator('#money2DialogForm [name="type"]').selectOption('expense');
  await page.locator('#money2DialogForm [name="category"]').selectOption('food');
  await page.locator('#money2DialogForm [name="label"]').fill('テスト食費');
  await page.locator('#money2DialogForm [name="amount"]').fill('1234');
  await page.locator('#money2DialogForm [name="status"]').selectOption('done');
  await page.locator('#money2DialogForm button.primary').click();
  await expectText('#money2Body','テスト食費');
  const addedLedger=await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2')).transactions.find(tx=>tx.label==='テスト食費'));
  assert.equal(addedLedger?.category,'food','Money transaction category must persist in yos-money-v2');

  await page.locator('.money3-transaction[data-money-action="edit-entry"]').filter({hasText:'テスト食費'}).click();
  await expectText('#money2DialogForm','取引を編集');
  page.once('dialog',d=>d.accept());
  await page.locator('#money2DialogForm button.danger').click();
  assert.equal(await page.locator('.money3-transaction').filter({hasText:'テスト食費'}).count(),0,'deleted Money transaction must leave history');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2')).transactions.some(tx=>tx.label==='テスト食費')),false,'deleted Money transaction must leave yos-money-v2');

  await page.locator('[data-money-tab="rules"]').click();
  await expectText('#money2Body','毎月決まってる収支');
  await page.locator('[data-money-action="add-recurring"]').first().click();
  await page.locator('#money2DialogForm [name="type"]').selectOption('expense');
  await page.locator('#money2DialogForm [name="category"]').selectOption('utilities');
  await page.locator('#money2DialogForm [name="label"]').fill('テスト定期');
  await page.locator('#money2DialogForm [name="amount"]').fill('2000');
  await page.locator('#money2DialogForm [name="day"]').fill('29');
  await page.locator('#money2DialogForm [name="startDate"]').fill('2026-09-01');
  await page.locator('#money2DialogForm button.primary').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2')).recurring.some(rule=>rule.label==='テスト定期')),true,'Money recurring rule must persist in yos-money-v2');
  await page.locator('[data-money-tab="transactions"]').click();
  await expectText('#money2Body','テスト定期');
  await page.locator('.money3-transaction[data-money-action="edit-recurring"]').filter({hasText:'テスト定期'}).click();
  page.once('dialog',d=>d.accept());
  await page.locator('#money2DialogForm button.danger').click();
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2')).recurring.some(rule=>rule.label==='テスト定期')),false,'deleted recurring Money rule must leave yos-money-v2');

  await page.locator('.money5-brand').click();
  await expectText('#brandTitle','MY WAY');
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

  // DESK is now chat-only; its detailed mobile rendering is covered by dedicated DESK CI.
  await page.goto(base+'/yos/desk/',{waitUntil:'networkidle'});
  await expectText('.chatOnlyTopbar','チャット');
  assert.equal(await page.locator('.chat').count(),0,'new DESK storage must contain no fabricated conversations');
  await page.locator('#searchInput').fill('存在しない会話');
  assert.equal(await page.locator('.chat').count(),0,'search must not fabricate matching conversations');
  const deskGeometry=await page.evaluate(()=>({
    width:document.documentElement.scrollWidth,
    client:document.documentElement.clientWidth,
    search:document.querySelector('#searchInput')?.getBoundingClientRect().width||0
  }));
  assert.ok(deskGeometry.width<=deskGeometry.client+1,'chat-only DESK must not overflow at 390px');
  assert.ok(deskGeometry.search>0,'chat-only DESK search must remain available');

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
