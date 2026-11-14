import test from 'node:test';
import assert from 'node:assert/strict';
import {dueReminderCandidates} from './due-reminder-candidates.mjs';
const item={id:'payment-1',dueDate:'2026-10-22',kind:'payment'};
test('day-before and due-today have separate stable delivery keys',()=>{
 const before=dueReminderCandidates([item],{today:'2026-10-21'})[0];
 const today=dueReminderCandidates([item],{today:'2026-10-22'})[0];
 assert.equal(before.reminderStage,'day-before');
 assert.equal(today.reminderStage,'due-today');
 assert.notEqual(before.sourceId,today.sourceId);
 assert.equal(dueReminderCandidates([item],{today:'2026-10-22',notifiedKeys:[today.sourceId]}).length,0);
});
test('completed payments do not remind',()=>assert.equal(dueReminderCandidates([{...item,paid:true}],{today:'2026-10-22'}).length,0));
test('unknown or invalid due dates fail closed',()=>{
 assert.equal(dueReminderCandidates([{...item,dueDate:'2026-02-30'}],{today:'2026-10-22'}).length,0);
 assert.throws(()=>dueReminderCandidates([item],{today:'invalid'}));
});
