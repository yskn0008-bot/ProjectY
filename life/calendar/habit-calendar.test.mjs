import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
const scope={};vm.runInNewContext(readFileSync(new URL('./habit-calendar.js',import.meta.url),'utf8'),scope);const api=scope.YOS_CALENDAR_HABITS;
const e={id:'template',sourceId:'notion-'+'a'.repeat(32),type:'habit',date:'2026-11-16',habitCycle:'毎日',done:false,title:'洗顔'};
test('a receipt completes one date and never the next day or template',()=>{
 const receipt={id:'receipt',habitTaskId:'a'.repeat(32),type:'habit',date:'2026-11-16',done:true};
 assert.equal(api.forDay([e,receipt],'2026-11-16').length,1);assert.equal(api.forDay([e,receipt],'2026-11-16')[0].done,true);
 assert.equal(api.forDay([e,receipt],'2026-11-17')[0].done,false);assert.equal(e.done,false);
});
test('undated or uncertain recurrence is not invented, weekly/monthly keep anchor dates',()=>{
 assert.equal(api.forDay([{...e,habitCycle:'毎週'}],'2026-11-17').length,0);
 assert.equal(api.forDay([{...e,habitCycle:'毎週'}],'2026-11-23').length,1);
 assert.equal(api.forDay([{...e,date:'2026-10-31',habitCycle:'毎月'}],'2026-11-30').length,0);
 assert.equal(api.forDay([{...e,date:''}],'2026-11-16').length,0);
 assert.equal(api.forDay([{...e,done:true}],'2026-11-17').length,0);
});
