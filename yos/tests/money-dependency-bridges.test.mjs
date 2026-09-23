import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [shared,moneyUi,moneyMaster,dashboard,morning,payment,moneyAlert] = await Promise.all([
  readFile(new URL('../shared-state-v1.js',import.meta.url),'utf8'),
  readFile(new URL('../money-v2.js',import.meta.url),'utf8'),
  readFile(new URL('../money-master-v1.js',import.meta.url),'utf8'),
  readFile(new URL('../task-dashboard.js',import.meta.url),'utf8'),
  readFile(new URL('../morning-brief-bridge-v1.js',import.meta.url),'utf8'),
  readFile(new URL('../payment-alert-bridge-v1.js',import.meta.url),'utf8'),
  readFile(new URL('../money-alert-bridge-v1.js',import.meta.url),'utf8')
]);

test('Money shared projection exposes dependency facts from yos-money-v2',()=>{
  for(const token of ['upcomingIncomes','nextIncomeText','projectedAfterNextPayment','shortagePossible','shortfall','spentToday','todayBudget']) assert.match(shared,new RegExp(token));
  assert.match(shared,/done','paid','completed','received/);
  assert.match(shared,/!completeStatus\(tx\)/);
});

test('Emergency fund goal stays in yos-money-v2, separate from liquid balance, and is projected to both UIs',()=>{
  assert.match(moneyMaster,/name:'生活防衛費'/);
  assert.match(moneyMaster,/target:600000/);
  assert.match(moneyMaster,/current:0/);
  assert.match(moneyMaster,/checkpoint:100000/);
  assert.match(moneyMaster,/priority:5/);
  assert.match(moneyMaster,/priorityLabel:'高'/);
  assert.match(moneyMaster,/purpose:'収入減・急な支払い・入金遅延があっても生活を維持するため'/);
  const liquid=moneyUi.match(/function currentLiquid\(\)\{([\s\S]*?)\n  \}/)?.[1]||'';
  assert.match(liquid,/data\.accounts/);
  assert.doesNotMatch(liquid,/goals|goal/);
  assert.match(moneyUi,/goal\.checkpoint/);
  assert.match(shared,/goalProgressPercent/);
  assert.match(dashboard,/goalProgressLabel/);
});

test('Money UI reads future data beyond current month and has live verification',()=>{
  assert.match(moneyUi,/futureAll/);
  assert.match(moneyUi,/!isComplete\(tx\)/);
  assert.match(moneyUi,/Money 実データ確認/);
  assert.match(moneyUi,/今日使える金額/);
  assert.match(moneyUi,/次の入金/);
  assert.match(moneyUi,/支払い後の不足判定/);
});

test('Morning Brief reads only existing Money projection',()=>{
  assert.match(morning,/next_payment/);
  assert.match(morning,/next_income/);
  assert.match(morning,/shortage_possible/);
  assert.doesNotMatch(morning,/localStorage\.setItem|indexedDB|sessionStorage/);
});

test('Payment Alert bridge is read-only and returns only near-term Money payments',()=>{
  assert.match(payment,/source:'yos-money-v2'/);
  assert.match(payment,/days_until/);
  assert.match(payment,/days_until<=3/);
  assert.match(payment,/YOS_PAYMENT_ALERT_V1/);
  assert.match(payment,/alertText/);
  assert.match(payment,/p\.get\('shortcut'\)\|\|'PaymentAlert'/);
  assert.match(payment,/format.*alert-text/);
  assert.match(payment,/setTimeout\(\(\)=>location\.replace\(url\),1200\)/);
  assert.doesNotMatch(payment,/localStorage\.setItem|indexedDB|sessionStorage/);
});

test('Money Alert bridge emits only Money anomalies and deduplicates delivery without mutating Money SSOT',()=>{
  assert.match(moneyAlert,/shortagePossible===true/);
  assert.match(moneyAlert,/spent>budget/);
  assert.match(moneyAlert,/YOS_MONEY_ALERT_V1/);
  assert.match(moneyAlert,/alertText/);
  assert.match(moneyAlert,/format.*alert-text/);
  assert.match(moneyAlert,/DELIVERY_KEY='yos-money-alert-delivery-v1'/);
  assert.match(moneyAlert,/DIRECT_MIGRATION_KEY='yos-money-alert-direct-v1'/);
  assert.match(moneyAlert,/deliveryDecision/);
  assert.match(moneyAlert,/renderDirect/);
  assert.match(moneyAlert,/params\.get\('format'\)==='alert-text'.*renderDirect/s);
  assert.doesNotMatch(moneyAlert,/location\.replace\('\.\/'\)/);
  assert.doesNotMatch(moneyAlert,/localStorage\.setItem\([^\n]*yos-money-v2/);
  assert.doesNotMatch(moneyAlert,/indexedDB|sessionStorage/);
});

test('Money UI syncs only a derived shadow for silent Money Alert and keeps yos-money-v2 as the SSOT',()=>{
  for(const token of ['MONEY_SHADOW_TOKEN_KEY','MONEY_SHADOW_ENDPOINT','X-YOS-Money-Token','syncMoneyShadow','moneyShadowPayload','Money Alert 接続コードをコピー']) assert.match(moneyUi,new RegExp(token));
  assert.match(moneyUi,/project-y-yos-ai\\.vercel\\.app\\/api\\/yos\\/widget\\?mode=money-shadow/);
  assert.match(moneyUi,/window\.YOSSharedStateV1\?\.refresh\?\.\('money'\)/);
  assert.match(moneyUi,/localStorage\.setItem\(MONEY_SHADOW_TOKEN_KEY/);
  assert.match(moneyUi,/write\(KEY,data\)/);
});
