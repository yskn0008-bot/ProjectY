import test from 'node:test';
import assert from 'node:assert/strict';
import {triageNotifications, normalizeNotification} from './notification-triage.mjs';

const base = {sourceId:'mail:123', title:'Payment reminder', receivedAt:'2026-10-20T09:00:00+09:00', summary:'Due tomorrow'};
test('ordinary notice goes to morning, not emergency', () => {
 const {alerts}=triageNotifications([base]);
 assert.equal(alerts[0].channel,'morning');
});
test('emergency requires all three explicit flags', () => {
 const input={...base, requiresImmediateAwareness:true, requiresImmediateAction:true, delayCausesMaterialHarm:true};
 assert.equal(triageNotifications([input]).alerts[0].channel,'emergency');
 assert.equal(triageNotifications([{...input, delayCausesMaterialHarm:false}]).alerts[0].channel,'morning');
});
test('stable IDs dedupe against previous receipts', () => {
 assert.equal(triageNotifications([base,base]).alerts.length,1);
 assert.equal(triageNotifications([base],{notifiedKeys:['mail:123']}).alerts.length,0);
});
test('sensitive code is redacted and unsafe URLs discarded', () => {
 const n=normalizeNotification({...base, summary:'Code 123456',sourceUrl:'javascript:alert(1)'});
 assert.match(n.summary,/redacted/);
 assert.equal(n.sourceUrl,'');
});
test('invalid identity fails closed',()=>assert.throws(()=>normalizeNotification({...base,sourceId:''})));

test('sensitive numeric tokens in notification titles are redacted', () => {
 const n=normalizeNotification({...base,title:'Security code 123456'});
 assert.equal(n.title,'Security code [redacted]');
});
