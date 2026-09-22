import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const [shared,moneyUi,morning,payment,moneyAlert] = await Promise.all([
  readFile(new URL('../shared-state-v1.js',import.meta.url),'utf8'),
  readFile(new URL('../money-v2.js',import.meta.url),'utf8'),
  readFile(new URL('../morning-brief-bridge-v1.js',import.meta.url),'utf8'),
  readFile(new URL('../payment-alert-bridge-v1.js',import.meta.url),'utf8'),
  readFile(new URL('../money-alert-bridge-v1.js',import.meta.url),'utf8')
]);

test('Money shared projection exposes dependency facts from yos-money-v2',()=>{
  for(const token of ['upcomingIncomes','nextIncomeText','projectedAfterNextPayment','shortagePossible','shortfall','spentToday','todayBudget']) assert.match(shared,new RegExp(token));
  assert.match(shared,/done','paid','completed','received/);
  assert.match(shared,/!completeStatus\(tx\)/);
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
  assert.doesNotMatch(payment,/localStorage\.setItem|indexedDB|sessionStorage/);
});

test('Money Alert bridge is read-only and emits only Money anomalies',()=>{
  assert.match(moneyAlert,/shortagePossible===true/);
  assert.match(moneyAlert,/spent>budget/);
  assert.match(moneyAlert,/YOS_MONEY_ALERT_V1/);
  assert.doesNotMatch(moneyAlert,/localStorage\.setItem|indexedDB|sessionStorage/);
});
