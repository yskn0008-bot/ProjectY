import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFileSync} from 'node:fs';
const name=process.env.YOS_BROWSER||'chromium',base=process.env.YOS_BASE_URL||'http://127.0.0.1:4173';
const browser=await ({chromium,webkit}[name]).launch({headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
await context.addInitScript(()=>{const Native=Date,now=Date.parse('2026-11-13T12:00:00+09:00');globalThis.Date=class extends Native{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}});
const page=await context.newPage();
const version=readFileSync(new URL('../money-master-v1.js',import.meta.url),'utf8').match(/MASTER_VERSION='([^']+)'/)[1];
// Synthetic context-only ledger. Never use historical personal balances as today's facts.
const fixture={version:2,masterFacts:{version},accounts:[{id:'test-cash',name:'Test Cash',type:'cash',balance:10000}],transactions:[
{id:'test-payment',type:'expense',label:'Test Payment',amount:2000,date:'2026-11-14',status:'planned'},
{id:'test-income',type:'income',label:'Test Income',amount:20000,date:'2026-11-15',status:'planned'}
],recurring:[],debts:[],goals:[],assets:[],rules:{}};
async function text(selector,value){await page.waitForSelector(selector,{state:'visible'});assert.ok((await page.locator(selector).textContent()).includes(value),selector+' expected '+value)}
const ledger=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('yos-money-v2')));
async function entry(label,amount){
for(const [key,value] of Object.entries({date:'2026-11-13',label,amount:String(amount)}))await page.locator('#money2DialogForm [name="'+key+'"]').fill(value);
for(const [key,value] of Object.entries({type:'expense',category:'food',status:'done'}))await page.locator('#money2DialogForm [name="'+key+'"]').selectOption(value);
await page.locator('#money2DialogForm button.primary').click();
}
try{
await page.goto(base+'/',{waitUntil:'networkidle'});assert.match(page.url(),/\/yos\/?$/);
await text('#brandTitle','MY WAY');await text('#taskDashboardBody','未設定');
assert.equal((await ledger()).accounts.length,0,'fresh install must not invent accounts');
assert.equal((await ledger()).masterFacts.currentBalance,null);
assert.equal(await page.evaluate(()=>window.YOSSharedStateV1.snapshot().money.balance),null);
await page.evaluate(value=>{localStorage.clear();localStorage.setItem('yos-money-v2',JSON.stringify(value));localStorage.setItem('yos-my-way-ideas-v1',JSON.stringify({text:'Fixture Idea'}))},fixture);
await page.reload({waitUntil:'networkidle'});await text('#taskDashboardBody','10,000円');
const shared=await page.evaluate(()=>window.YOSSharedStateV1.snapshot());
assert.equal(shared.money.balance,10000);assert.equal(shared.money.nextPayment.amount,2000);assert.equal(shared.money.nextIncome.amount,20000);assert.equal(shared.idea.text,'Fixture Idea');
await page.locator('.money-nav').click();await text('.money5-brand','MY MONEY');
for(const label of ['今使えるお金','今月あと使える','1日あたり','次の支払い','次の入金','今いちばん重要'])await text('#money2Body',label);
assert.equal(await page.locator('.money5-subnav [data-money-tab]').count(),6);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1),'390px layout overflow');
for(const tab of ['calendar','categories','rules','assets','dashboard','transactions']){await page.locator('[data-money-tab="'+tab+'"]').click();assert.ok((await page.locator('#money2Body').textContent()).trim())}
await page.locator('.money3-panel [data-money-action="add-entry"]').click();await entry('Test Food',1234);
assert.equal((await ledger()).transactions.find(x=>x.label==='Test Food').category,'food');
await page.reload({waitUntil:'networkidle'});
// The active Money view is persisted; navigate only if the reload returned to MY WAY.
if(await page.locator('.money-nav').isVisible())await page.locator('.money-nav').click();
await page.locator('[data-money-tab="transactions"]').click();await text('#money2Body','Test Food');
await page.locator('.money3-transaction[data-money-action="edit-entry"]').filter({hasText:'Test Food'}).click();await entry('Test Food Edited',1500);
assert.equal((await ledger()).transactions.find(x=>x.label==='Test Food Edited').amount,1500);
await page.locator('.money3-transaction[data-money-action="edit-entry"]').filter({hasText:'Test Food Edited'}).click();page.once('dialog',d=>d.accept());await page.locator('#money2DialogForm button.danger').click();
assert.equal((await ledger()).transactions.some(x=>x.label==='Test Food Edited'),false);
await page.locator('[data-money-tab="rules"]').click();await page.locator('[data-money-action="add-recurring"]').first().click();
for(const [key,value] of Object.entries({label:'Test Recurring',amount:'2000',day:'20',startDate:'2026-11-01'}))await page.locator('#money2DialogForm [name="'+key+'"]').fill(value);
for(const [key,value] of Object.entries({type:'expense',category:'utilities'}))await page.locator('#money2DialogForm [name="'+key+'"]').selectOption(value);
await page.locator('#money2DialogForm button.primary').click();assert.equal((await ledger()).recurring.some(x=>x.label==='Test Recurring'),true);
await page.locator('[data-money-tab="transactions"]').click();await page.locator('.money3-transaction[data-money-action="edit-recurring"]').filter({hasText:'Test Recurring'}).click();page.once('dialog',d=>d.accept());await page.locator('#money2DialogForm button.danger').click();
assert.equal((await ledger()).recurring.some(x=>x.label==='Test Recurring'),false);
for(const [path,object] of [['morning-brief-bridge','__yosMorningBriefBridgeV1'],['payment-alert-bridge','__yosPaymentAlertBridgeV1'],['money-alert-bridge','__yosMoneyAlertBridgeV1']]){
await page.goto(base+'/yos/'+path+'.html',{waitUntil:'networkidle'});const result=await page.evaluate(key=>window[key].build(),object);assert.ok(result);assert.equal((await ledger()).accounts[0].balance,10000);
if(path==='morning-brief-bridge'){assert.equal(result.money.next_payment.amount,2000);assert.equal(result.money.next_income.amount,20000)}
if(path==='payment-alert-bridge')assert.equal(result.payments[0].amount,2000);
if(path==='money-alert-bridge')assert.equal(result.current_balance,10000);
}
await page.goto(base+'/yos/',{waitUntil:'networkidle'});await page.locator('.idea-nav').click();await page.locator('#ideaMemo').fill('Saved Test Idea');await page.locator('#saveIdea').click();await page.reload({waitUntil:'networkidle'});await text('#recentIdea','Saved Test Idea');
const routes=[['/yos/guide.html','h1','今日は、どうする？'],['/life/','.brand h1','MY LIFE'],['/yos/hj/','.brand h1',"Hero's Journey"],['/system/','h1','Mission Control']];
for(const [path,selector,value] of routes){await page.goto(base+path,{waitUntil:'networkidle'});await text(selector,value)}
// The removed DESK dashboard is covered by the current chat-only DESK's separate browser job.
if(name==='chromium'){
await page.goto(base+'/yos/',{waitUntil:'networkidle'});await page.evaluate(async()=>{await navigator.serviceWorker.ready});await page.reload({waitUntil:'networkidle'});assert.equal(await page.evaluate(()=>Boolean(navigator.serviceWorker.controller)),true);
await context.setOffline(true);for(const [path,selector,value] of [['/yos/','#brandTitle','MY IDEA'],...routes]){await page.goto(base+path,{waitUntil:'domcontentloaded'});await text(selector,value)}
}
console.log('Unified PWA unknown/known ledger, CRUD, bridges, persistence and offline PASS',name);
}finally{await browser.close()}
