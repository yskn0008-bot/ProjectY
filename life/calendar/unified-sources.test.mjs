import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const code=readFileSync(new URL('./unified-sources.js',import.meta.url),'utf8');
const sandbox={window:{},Intl,Date,Set,Number,Object,String,Array};
vm.runInNewContext(code,sandbox,{timeout:1000});
const api=sandbox.window.YOS_UNIFIED_CALENDAR;
const NOW=Date.parse('2026-11-14T00:00:00Z');
const store=o=>({getItem:k=>Object.hasOwn(o,k)?o[k]:null});
const task=(patch={})=>({
 id:'notion-'+'a'.repeat(32),title:'面接',status:'次にやる',due:'2026-11-13',
 dueAt:'2026-11-12T15:30:00Z',timing:'timed-deadline',...patch
});
const tasks=(items,patch={})=>({
 schema:'yos-daystream-source-snapshot-v1',kind:'tasks',status:'ok',
 source:'yos-auth-cache',origin:'notion',complete:true,
 checkedAt:'2026-11-13T23:00:00Z',items,...patch
});
const calendar=(patch={})=>({
 schema:'yos-daystream-source-snapshot-v1',kind:'calendar',status:'ok',
 source:'user-file',checkedAt:'2026-11-13T23:00:00Z',
 calendarDays:{'2026-11-14':[{title:'美容室',start:600,duration:45}]},
 allDayDays:{'2026-11-15':['旅行']},...patch
});
const read=(t,c)=>api.read(store({
 [api.keys.tasks]:t===undefined?null:JSON.stringify(t),
 [api.keys.calendar]:c===undefined?null:JSON.stringify(c)
}),NOW);

test('real Notion IDs and Tokyo time are preserved; deadlines never become fixed appointments',()=>{
 const x=read(tasks([task()]));
 assert.equal(x.status.tasks,'ready');
 assert.equal(x.items.length,1);
 assert.equal(x.items[0].date,'2026-11-13');
 assert.equal(x.items[0].type,'task');
 assert.match(x.items[0].subtitle,/期限 00:30/);
 assert.equal(x.items[0].source,'Notion Tasks写し');
});
test('only source calendar records become fixed and completion never guesses a duration',()=>{
 const x=read(tasks([task({timing:'fixed',status:'完了'})]));
 assert.equal(x.items[0].type,'schedule');
 assert.equal(x.items[0].fixed,true);
 assert.equal(x.items[0].done,true);
});
test('date-only tasks remain untimed; tasks without due date remain DAYSTREAM unplaced',()=>{
 const x=read(tasks([task({due:'2026-11-14',dueAt:'2026-11-14'}),task({id:'notion-'+'b'.repeat(32),due:'',dueAt:null})]));
 assert.equal(x.items.length,1);
 assert.equal(x.items[0].subtitle,'期限');
});
test('imported calendar shows exact boundaries, all day without fabricating calendar permissions',()=>{
 const x=read(undefined,calendar());
 assert.equal(x.status.calendar,'ready');
 assert.deepEqual(Array.from(x.items.map(e=>e.date)),['2026-11-14','2026-11-15']);
 assert.equal(x.items[0].subtitle,'10:00 – 10:45');
 assert.equal(x.items[1].subtitle,'終日');
 assert.equal(x.details.calendar.origin,'manual');
});
test('stale authentic and old manual snapshots are excluded, not shown as current',()=>{
 const a=read(tasks([task()],{checkedAt:'2026-11-12T10:00:00Z'}),calendar({checkedAt:'2026-11-01T00:00:00Z'}));
 assert.equal(a.status.tasks,'stale');
 assert.equal(a.status.calendar,'stale');
 assert.equal(a.items.length,0);
});
test('incomplete Notion snapshot and malformed UID fail closed',()=>{
 for(const snapshot of [tasks([task()],{complete:false}),tasks([task({id:'bad'})]),tasks([task(),task()])]){
  const a=read(snapshot);
  assert.equal(a.status.tasks,'invalid');
  assert.equal(a.items.length,0);
 }
});
test('invalid calendar entry prevents partial visibility',()=>{
 const x=read(undefined,calendar({calendarDays:{'2026-11-14':[{title:'Valid',start:100,duration:30},{title:'Invalid',start:1430,duration:30}]}}));
 assert.equal(x.items.length,0);
 assert.equal(x.status.calendar,'invalid');
});
test('same date/title/explicit start is one display; different times and untimed records survive',()=>{
 const external=read(undefined,calendar()).items;
 const base=[
  {id:'life:event:1',type:'schedule',date:'2026-11-14',title:'美容室',subtitle:'10:00',source:'MY LIFE'},
  {id:'life:event:2',type:'schedule',date:'2026-11-14',title:'美容室',subtitle:'11:00',source:'MY LIFE'},
  {id:'life:event:3',type:'schedule',date:'2026-11-14',title:'美容室',subtitle:'日時未確認',source:'MY LIFE'}
 ];
 const x=api.merge(base,external);
 assert.equal(x.length,4);
 assert.equal(x.filter(e=>e.title==='美容室').length,3);
 assert.equal(x[0].source,'予定取込写し');
});
test('missing/corrupt storage does not fabricate entries and does not throw',()=>{
 const a=api.read(store({[api.keys.tasks]:'{bad', [api.keys.calendar]:'false'}),NOW);
 assert.equal(a.items.length,0);
 assert.equal(a.status.tasks,'missing');
 assert.equal(a.status.calendar,'missing');
});
test('a Money item is not deduplicated or imported by this bridge',()=>{
 const r=api.merge([{id:'money:1',type:'money',date:'2026-11-14',title:'家賃',amount:1000}],[]);
 assert.equal(r.length,1);
 assert.equal(r[0].amount,1000);
});
