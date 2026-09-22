import test from 'node:test'; import assert from 'node:assert/strict';
import {selectAlerts,paymentCandidates,moneyCandidates,classifyAlert,isEmergencyCandidate} from './alert-engine.mjs';
test('paid payment is suppressed',()=>assert.equal(selectAlerts([{id:'p',kind:'payment',paid:true}]).length,0));
test('native Reminder wins by suppressing duplicate YOS task alert',()=>assert.equal(selectAlerts([{id:'t',kind:'task',nativeReminderNotifies:true}]).length,0));
test('existing routine Automation suppresses duplicate',()=>assert.equal(selectAlerts([{id:'r',kind:'routine',existingAutomationNotifies:true}]).length,0));
test('Emergency requires immediate awareness, action, and material harm if delayed',()=>{
  assert.equal(isEmergencyCandidate({emergency:true}),false);
  assert.equal(classifyAlert({id:'x',kind:'payment',emergency:true}),'payment');
  assert.equal(isEmergencyCandidate({requiresImmediateAwareness:true,requiresImmediateAction:true,delayCausesMaterialHarm:true}),true);
});
test('emergency outranks payment for same source only when the full gate is satisfied',()=>{
  const regular={id:'x',kind:'payment'};
  const emergency={id:'x',kind:'payment',requiresImmediateAwareness:true,requiresImmediateAction:true,delayCausesMaterialHarm:true};
  assert.equal(selectAlerts([regular,emergency]).length,1);
  assert.equal(selectAlerts([regular,emergency])[0].channel,'emergency');
});
test('already notified fingerprint is suppressed',()=>assert.equal(selectAlerts([{id:'x',kind:'payment'}],{notifiedKeys:['x']}).length,0));
test('payment window is today through three days',()=>assert.deepEqual(paymentCandidates([{id:'a',type:'expense',date:'2026-09-23',amount:1},{id:'b',type:'expense',date:'2026-09-26',amount:1},{id:'c',type:'expense',date:'2026-09-27',amount:1}],{now:new Date('2026-09-23T02:00:00+09:00')}).map(x=>x.id),['a','b']));
test('money alert only on anomaly',()=>assert.equal(moneyCandidates({currentBalance:1000,todayBudget:500,spentToday:700,transactions:[{type:'expense',amount:1500}]}).length,2));
test('unknown balance does not create a false shortage',()=>assert.equal(moneyCandidates({currentBalance:null,transactions:[{type:'expense',amount:1500}]}).length,0));
test('completed and boolean-paid outflows are excluded from Payment Alert candidates',()=>assert.deepEqual(paymentCandidates([{id:'done',type:'expense',date:'2026-09-23',amount:1,status:'completed'},{id:'paid',type:'debt',date:'2026-09-23',amount:2,paid:true},{id:'open',type:'debt',date:'2026-09-23',amount:3}],{now:new Date('2026-09-23T02:00:00+09:00')}).map(x=>x.id),['open']));
test('unknown daily budget does not create a false over-budget alert',()=>assert.equal(moneyCandidates({currentBalance:1000,todayBudget:null,spentToday:700,transactions:[]}).length,0));
