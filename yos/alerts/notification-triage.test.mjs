import test from 'node:test';
import assert from 'node:assert/strict';
import {triageNotifications, normalizeNotification, formatYosNotification, planYosDeliveries} from './notification-triage.mjs';

const base = {sourceId:'mail:123', sourceApp:'Mail', title:'Payment reminder', receivedAt:'2026-10-20T09:00:00+09:00', summary:'Due tomorrow'};
const reviewed = {...base, needsReview:false, confirmedByYOS:true};

test('raw notification stays in records but never triggers another notification', () => {
  const result = triageNotifications([base]);
  assert.equal(result.records.length, 1);
  assert.equal(result.alerts.length, 0);
});
test('review flag without trusted confirmation cannot emit alerts', () => {
  assert.equal(triageNotifications([{...base, needsReview:false, category:'payment'}]).alerts.length, 0);
});
test('reviewed event gets the correct channel', () => {
  assert.equal(triageNotifications([reviewed]).alerts[0].channel,'morning');
});
test('emergency requires all three flags and trusted review', () => {
  const input={...reviewed, requiresImmediateAwareness:true, requiresImmediateAction:true, delayCausesMaterialHarm:true};
  assert.equal(triageNotifications([input]).alerts[0].channel,'emergency');
  assert.equal(triageNotifications([{...input, delayCausesMaterialHarm:false}]).alerts[0].channel,'morning');
  assert.equal(triageNotifications([{...input, confirmedByYOS:false}]).alerts.length,0);
});
test('stable IDs dedupe both within run and against receipts', () => {
  assert.equal(triageNotifications([reviewed,reviewed]).alerts.length,1);
  assert.equal(triageNotifications([reviewed],{notifiedKeys:['mail:123']}).alerts.length,0);
});
test('sensitive code is redacted and unsafe URLs discarded', () => {
  const n=normalizeNotification({...base, summary:'Code 123456',sourceUrl:'javascript:alert(1)'});
  assert.match(n.summary,/redacted/);
  assert.equal(n.sourceUrl,'');
});
test('invalid identity fails closed',()=>assert.throws(()=>normalizeNotification({...base,sourceId:''})));
test('four-digit authentication codes never appear in output', () => {
  const n=normalizeNotification({...base,title:'Security code 1234',summary:'Use PIN 1234'});
  assert.doesNotMatch(n.title + n.summary,/1234/);
  assert.match(n.title,/元アプリで確認/);
});
test('self-generated notification never loops back, even if falsely marked reviewed',()=>{
  for(const app of ['Shortcuts','ショートカット','Actions','Scriptable','ChatGPT','YOS Alerts','Clarity Notification']){
    const input={...reviewed,sourceId:'self:'+app,sourceApp:app,category:'payment'};
    assert.equal(triageNotifications([input]).alerts.length,0,app);
  }
});
test('unreviewed payment and emergency candidates never trigger immediate channels', () => {
  assert.equal(triageNotifications([{...base,category:'payment'}]).alerts.length,0);
  assert.equal(triageNotifications([{...base,category:'payment',requiresImmediateAwareness:true,requiresImmediateAction:true,delayCausesMaterialHarm:true}]).alerts.length,0);
  assert.equal(triageNotifications([{...reviewed,category:'payment'}]).alerts[0].channel,'payment');
});

test('AI explanation exposes what/impact/action/source but never invents an unverified deadline', () => {
  const payload={...reviewed,category:'task',analysis:{
    what:'提出書類の案内',impact:'申請を進める必要がある',deadline:'明日',
    nextAction:'元メールで提出期限を確認',deadlineConfirmedBySource:false
  }};
  const p=formatYosNotification(payload);
  assert.match(p.detail,/何が起きた：提出書類の案内/);
  assert.match(p.detail,/影響：申請を進める必要がある/);
  assert.match(p.detail,/期限：未確認/);
  assert.match(p.detail,/次の行動：元メールで提出期限を確認/);
  assert.match(p.detail,/原本：Mailアプリで確認/);
});
test('explicit verified deadline survives classification to presentation', () => {
  const item={...reviewed,category:'payment',analysis:{
    what:'期限付き案内',impact:'要確認',deadline:'2026-10-25',
    deadlineConfirmedBySource:true,nextAction:'原本を確認'
  }};
  const plan=planYosDeliveries([item]);
  assert.equal(plan.held.length,1);
  assert.match(plan.held[0].detail,/期限：2026-10-25/);
});
test('non-actionable raw notification never reaches delivery', () => {
  assert.equal(planYosDeliveries([base]).send.length,0);
  assert.equal(planYosDeliveries([reviewed]).send.length,0);
});
test('classified payment held while original app notification is active', () => {
  const item={...reviewed,category:'payment',deliveryApproved:true,materiallyMoreUseful:true};
  assert.equal(planYosDeliveries([item]).send.length,0);
  assert.equal(planYosDeliveries([item]).held.length,1);
});
test('only explicitly approved useful nonduplicate payment qualifies for delivery', () => {
  const item={...reviewed,category:'payment',deliveryApproved:true,materiallyMoreUseful:true,originalNoticeDisabled:true};
  const plan=planYosDeliveries([item]);
  assert.equal(plan.send.length,1);
  assert.doesNotMatch(plan.send[0].lockScreenBody,/Payment reminder/);
  assert.equal(plan.send[0].sourceId,'mail:123');
});
test('ordinary information remains digest-only despite explicit delivery flags', () => {
  const item={...reviewed,deliveryApproved:true,materiallyMoreUseful:true,originalNoticeDisabled:true};
  assert.equal(planYosDeliveries([item]).send.length,0);
  assert.equal(planYosDeliveries([item]).held.length,1);
});
test('native Reminder notification suppresses second task alert', () => {
  const item={...reviewed,category:'task',nativeReminderNotifies:true,deliveryApproved:true,materiallyMoreUseful:true,originalNoticeDisabled:true};
  assert.equal(planYosDeliveries([item]).send.length,0);
});
test('security code in AI explanation is never reflected in rendered details', () => {
  const item={...reviewed,analysis:{
    what:'Your sign-in code 9876',impact:'ログインの検証',nextAction:'OTP 9876 を入力'
  },category:'payment',deliveryApproved:true,materiallyMoreUseful:true,originalNoticeDisabled:true};
  const plan=planYosDeliveries([item]);
  assert.equal(plan.send.length,0);
  assert.equal(plan.held.length,1);
  assert.doesNotMatch(plan.held[0].detail,/9876/);
  assert.doesNotMatch(plan.held[0].lockScreenBody,/9876/);
});
test('an untrusted object with ignored field cannot bypass presentation redaction', () => {
  const p=formatYosNotification({...base,ignored:true,title:'Security code 1234',summary:'PIN 1234'});
  assert.doesNotMatch(p.detail,/1234/);
});
