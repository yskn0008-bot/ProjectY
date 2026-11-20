import test from 'node:test';
import assert from 'node:assert/strict';
import {selectProactiveAction} from './proactive-action.mjs';
const today='2026-10-20';
test('returns only one highest-priority verified action',()=>{
 const action=selectProactiveAction([
  {id:'a',title:'Pay rent',kind:'payment',dueDate:'2026-10-21',verified:true,shortfallConfirmed:true},
  {id:'b',title:'Prepare appointment',kind:'appointment',dueDate:'2026-10-20',verified:true}
 ],{today});
 assert.equal(action.id,'a');
});
test('unknown shortfall never becomes confirmed',()=>{
 const action=selectProactiveAction([{id:'a',title:'Bill',kind:'payment',dueDate:today}],{today});
 assert.equal(action.requiresReview,true);
 assert.equal(action.severity,3);
});
test('completed, malformed and distant records ignored',()=>{
 assert.equal(selectProactiveAction([{id:'a',title:'Done',kind:'task',dueDate:today,completed:true},{id:'b',title:'Future',kind:'task',dueDate:'2026-11-20'}],{today}),null);
 assert.throws(()=>selectProactiveAction([],{today:'2026-02-30'}));
});
