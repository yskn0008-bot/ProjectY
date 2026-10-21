import test from 'node:test';
import assert from 'node:assert/strict';
import {triageNotifications, normalizeNotification} from './notification-triage.mjs';

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
