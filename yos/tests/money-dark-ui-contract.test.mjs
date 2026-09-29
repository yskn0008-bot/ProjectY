import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL('../../' + path, import.meta.url), 'utf8');

test('MY MONEY dark UI keeps yos-money-v2 as the only Money state key', async () => {
  const [runtime,master,css,index,sw] = await Promise.all([
    read('yos/money-v2-runtime-v4.js'),
    read('yos/money-master-v1.js'),
    read('yos/money-dark-v5.css'),
    read('yos/index.html'),
    read('service-worker.js')
  ]);
  assert.match(runtime,/const KEY='yos-money-v2'/);
  assert.match(master,/const KEY='yos-money-v2'/);
  assert.doesNotMatch(runtime,/localStorage\.setItem\(['"]yos-money-dark/);
  for(const collection of ['accounts','transactions','recurring','debts','goals','assets','rules']){
    assert.match(runtime,new RegExp(collection),'Money collection missing: '+collection);
  }
  assert.match(index,/money-dark-v5\.css\?v=16/);
  assert.ok(sw.includes("'./yos/money-dark-v5.css'"),'dark Money CSS must be cached by root PWA');
  for(const color of ['#05070B','#0A1630','#0E1D3A','#F4F7FF','#AAB7D3','#D7A94B','#FF6E6E','#6EE7A7','#4DA3FF']){
    assert.ok(css.includes(color),'missing Money color token '+color);
  }
});

test('MY MONEY Home exposes the requested decision hierarchy and six Money destinations', async () => {
  const runtime=await read('yos/money-v2-runtime-v4.js');
  for(const label of ['今使えるお金','今日使える','月末不足','今月収支','次の支払い','次の入金','資金カレンダー','最近の入出金','YOSからのアドバイス','生活防衛費']){
    assert.ok(runtime.includes(label),'missing Home label '+label);
  }
  for(const label of ['現在 → このまま → 改善したら','改善プランを設定','毎月積み立てる額','改善したら増やす額 / 月']){
    assert.ok(runtime.includes(label),'missing future roadmap label '+label);
  }
  assert.match(runtime,/function futureRoadmap\(\)/);
  assert.match(runtime,/function payoffMonthsAtPayment\(/);
  assert.match(runtime,/scenarioMonthlyBoost/);
  assert.match(runtime,/monthlyContribution/);
  for(const tab of ['dashboard','transactions','calendar','categories','rules','assets']){
    assert.ok(runtime.includes(`data-money-tab="${tab}"`),'missing Money navigation tab '+tab);
  }
  for(const label of ['取引','カレンダー','カテゴリー','計画','資産']){
    assert.ok(runtime.includes(label),'missing feature entry '+label);
  }
});

test('Money keeps CRUD, inferred categories, recurring dedupe, and current-month shortage calculation', async () => {
  const runtime=await read('yos/money-v2-runtime-v4.js');
  assert.match(runtime,/function openEntryDialog/);
  assert.match(runtime,/data\.transactions=editing\?/);
  assert.match(runtime,/data\.transactions=data\.transactions\.filter/);
  assert.match(runtime,/category:clean\(fd\.get\('category'\)/);
  assert.match(runtime,/function inferredCategory/);
  assert.match(runtime,/function renderCategories/);
  assert.match(runtime,/function openRecurringDialog/);
  assert.match(runtime,/tx\.recurringId===rule\.id&&tx\.date===date/);
  assert.match(runtime,/function currentMonthShortfall/);
  assert.match(runtime,/filter\(tx=>isOutgoing\(tx\)&&!isComplete\(tx\)\)/);
});


test('Money master never restores the stale 4,588 yen live balance', async () => {
  const master=await read('yos/money-master-v1.js');
  assert.doesNotMatch(master,/currentBalance:\s*4588/);
  assert.doesNotMatch(master,/accountBreakdown:\{payPay:4033,payPayBank:133,cash:422\}/);
  assert.match(master,/liveBalance/);
  assert.match(master,/balance:1453/);
  assert.match(master,/master-repayment-2026-10-10/);
  assert.match(master,/amount:30000/);
  assert.match(master,/master-repayment-2026-09[\s\S]*status:'paid'/);
});


test('Money master seeds confirmed monthly recurring cashflow without fixed debt repayment', async () => {
  const master=await read('yos/money-master-v1.js');
  for(const label of ['家賃収入','家賃','車保険','電気','iCloud','MoneyForward','ChatGPT Plus','YouTube Premium']){
    assert.ok(master.includes("label:'"+label+"'"),'missing recurring label '+label);
  }
  for(const amount of [160485,68500,7060,3710,540,590,3000,1680]){
    assert.ok(master.includes('amount:'+amount),'missing recurring amount '+amount);
  }
  assert.match(master,/base\.recurring=Array\.isArray/);
  assert.doesNotMatch(master,/master-rec-repayment/);
  assert.match(master,/master-rec-rental-income[\s\S]*day:13/);
  assert.match(master,/master-rec-rent[\s\S]*day:27/);
  assert.match(master,/master-rec-car-insurance[\s\S]*day:26/);
  assert.match(master,/master-rec-electricity[\s\S]*day:27/);
});


test('Electricity recurring date is fixed but amount remains variable', async () => {
  const [master,runtime]=await Promise.all([read('yos/money-master-v1.js'),read('yos/money-v2-runtime-v4.js')]);
  assert.match(master,/master-rec-electricity[\s\S]*amount:null[\s\S]*variableAmount:true[\s\S]*lastKnownAmount:3710[\s\S]*day:27/);
  assert.match(runtime,/金額は毎月変動/);
  assert.match(runtime,/金額未確定/);
  assert.match(runtime,/dailyHasUnknown/);
  assert.match(runtime,/projectionHasUnknown/);
});


test('Money local-first saves immediately and keeps a file-backed JSONL history', async () => {
  const [runtime,index,importer,journal,capture,sw]=await Promise.all([
    read('yos/money-v2-runtime-v4.js'),
    read('yos/index.html'),
    read('yos/money-local-import.html'),
    read('yos/money-journal-v1.js'),
    read('yos/money-capture.html'),
    read('service-worker.js')
  ]);
  assert.match(runtime,/YOSMoneyJournalV1\?\.record/);
  assert.match(runtime,/source:'money-ui'/);
  assert.match(runtime,/source:'money-hash-import'/);
  assert.match(index,/money-journal-v1\.js\?v=1/);
  assert.match(importer,/money-journal-v1\.js\?v=1/);
  assert.match(importer,/80\);/);
  assert.match(journal,/navigator\.storage\?\.getDirectory/);
  assert.match(journal,/yos-money-history-/);
  assert.match(journal,/\.jsonl/);
  assert.match(journal,/yos-money-journal-queue-v1/);
  assert.match(capture,/money-local-import\.html#mi=/);
  assert.match(capture,/コンビニ850円/);
  assert.match(capture,/replace-liquid/);
  assert.match(runtime,/moneyQuickAdd'\)\{location\.href='\.\/money-capture\.html'/);
  assert.ok(sw.includes("'./yos/money-journal-v1.js'"));
  assert.ok(sw.includes("'./yos/money-capture.html'"));
  assert.ok(sw.includes("'./yos/money-local-import.html'"));
});


test('Gas recurring uses fixed debit day 15 with unknown variable amount', async () => {
  const master=await read('yos/money-master-v1.js');
  assert.match(master,/master-rec-gas[\s\S]*label:'ガス'[\s\S]*amount:null[\s\S]*variableAmount:true[\s\S]*day:15/);
  assert.doesNotMatch(master,/master-rec-gas[\s\S]*lastKnownAmount:/);
});
