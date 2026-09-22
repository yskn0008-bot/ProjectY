import test from 'node:test'; import assert from 'node:assert/strict';
import {selectAlerts,paymentCandidates,moneyCandidates} from './alert-engine.mjs';
test('paid payment is suppressed',()=>assert.equal(selectAlerts([{id:'p',kind:'payment',paid:true}]).length,0));
test('native Reminder wins by suppressing duplicate YOS task alert',()=>assert.equal(selectAlerts([{id:'t',kind:'task',nativeReminderNotifies:true}]).length,0));
test('existing routine Automation suppresses duplicate',()=>assert.equal(selectAlerts([{id:'r',kind:'routine',existingAutomationNotifies:true}]).length,0));
test('emergency outranks payment for same source',()=>assert.equal(selectAlerts([{id:'x',kind:'payment'},{id:'x',kind:'payment',emergency:true}])[0].channel,'emergency'));
test('already notified fingerprint is suppressed',()=>assert.equal(selectAlerts([{id:'x',kind:'payment'}],{notifiedKeys:['x']}).length,0));
test('payment window is today through three days',()=>assert.deepEqual(paymentCandidates([{id:'a',type:'expense',date:'2026-09-23',amount:1},{id:'b',type:'expense',date:'2026-09-26',amount:1},{id:'c',type:'expense',date:'2026-09-27',amount:1}],{now:new Date('2026-09-23T02:00:00+09:00')}).map(x=>x.id),['a','b']));
test('money alert only on anomaly',()=>assert.equal(moneyCandidates({currentBalance:1000,todayBudget:500,spentToday:700,transactions:[{type:'expense',amount:1500}]}).length,2));