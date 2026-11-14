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
 const x=read(tasks([task({timing:'fixed',status:'完了',lastSynced:'2026-11-13T23:00:00Z'})]));
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

test('old upstream iPhone calendar mirrors remain excluded even after a fresh Notion GET',()=>{
 const old=task({title:'予定｜古い予約',timing:'fixed',lastSynced:'2026-11-01T06:56:00Z'});
 const current=task({id:'notion-'+'b'.repeat(32),title:'現在の通常タスク'});
 const x=read(tasks([old,current]));
 assert.equal(x.status.tasks,'ready','Notion task snapshot was freshly fetched');
 assert.equal(x.items.length,1,'stale native calendar mirror was not scheduled');
 assert.equal(x.items[0].title,'現在の通常タスク');
 assert.equal(x.details.tasks.staleCalendar,1);
 assert.equal(x.details.tasks.freshCalendar,0);
});
test('missing or timezone-free upstream source timestamp fails closed without hiding normal tasks',()=>{
 const noTime=task({title:'予定｜不明',timing:'fixed'});
 const ambiguous=task({id:'notion-'+'b'.repeat(32),title:'予定｜日時未指定',timing:'fixed',lastSynced:'2026-11-13T23:00:00'});
 const todo=task({id:'notion-'+'c'.repeat(32),title:'普通のTODO',lastSynced:null});
 const x=read(tasks([noTime,ambiguous,todo]));
 assert.equal(x.items.length,1);
 assert.equal(x.items[0].title,'普通のTODO');
 assert.equal(x.details.tasks.unknownCalendar,2);
});
test('fresh mirror keeps real Tokyo time and strips generated 予定 prefix for cross-source dedupe',()=>{
 const t=task({title:'予定｜美容室',timing:'fixed',
   due:'2026-11-14',dueAt:'2026-11-14T10:00:00+09:00',
   lastSynced:'2026-11-13T23:00:00Z',action:'10:00'});
 const x=read(tasks([t]),calendar({allDayDays:{},calendarDays:{'2026-11-14':[{title:'美容室',start:600,duration:60}]}}));
 assert.equal(x.details.tasks.freshCalendar,1);
 assert.equal(x.details.tasks.staleCalendar,0);
 const selected=api.merge([],x.items);
 assert.equal(selected.filter(e=>e.title==='美容室').length,1);
 assert.equal(selected[0].source,'予定取込写し','full calendar time wins over Notion mirror with unknown end');
});
test('upstream all-day marker keeps an event all-day, with no fabricated midnight appointment',()=>{
 const t=task({title:'予定｜休み',timing:'fixed',action:'終日・沖縄',
   due:'2026-11-14',dueAt:'2026-11-14T00:00:00+09:00',
   lastSynced:'2026-11-13T23:00:00Z'});
 const x=read(tasks([t]));
 assert.equal(x.items.length,1);
 assert.equal(x.items[0].subtitle,'終日');
 assert.equal(x.items[0].title,'休み');
});
test('Notion source adapter preserves mirror lastSynced; Notion GET cannot replace it',()=>{
 const original=readFileSync(new URL('../../yos/daystream/source-adapters.js',import.meta.url),'utf8');
 const sandbox2={window:{},Intl,Date,Set,Number,Object,String,Array};
 vm.runInNewContext(original,sandbox2,{timeout:1000});
 const convert=sandbox2.window.YOS_DAYSTREAM_SOURCES.fromYosTaskDashboardCache;
 const cached=convert({savedAt:Date.now(),data:{source:'notion',complete:true,tasks:[{
  id:'a'.repeat(32),title:'予定｜元データ',state:'保留',
  due:'2026-11-14T10:00:00+09:00',sourceKind:'calendar',dueEnd:null,
  lastSynced:'2026-11-01T06:56:00Z',lastEditedAt:'2026-11-14T00:00:00Z'
 }]}});
 assert.equal(cached.items.length,1);
 assert.equal(cached.items[0].lastSynced,'2026-11-01T06:56:00Z');
 assert.equal(cached.items[0].lastEditedAt,'2026-11-14T00:00:00Z');
 assert.equal(cached.items[0].timing,'fixed');
});

test('stale Notion Reminders mirrors are NOT treated as current tasks even on a fresh Notion GET',()=>{
 const old=task({title:'Task｜期限が古い',timing:'timed-deadline',
  sourceFamily:'reminder',action:'Remindersで確認',lastSynced:'2026-11-01T07:00:00Z'});
 const ordinary=task({id:'notion-'+'b'.repeat(32),title:'通常のタスク',sourceFamily:'task'});
 const x=read(tasks([old,ordinary]));
 assert.equal(x.items.length,1);
 assert.equal(x.items[0].title,'通常のタスク');
 assert.equal(x.details.tasks.staleReminders,1);
});
test('old Notion endpoint fallback identifies legacy Reminder mirrors conservatively',()=>{
 const old=task({title:'Task｜旧ミラー',action:'Remindersで確認',lastSynced:'2026-11-01T07:00:00Z'});
 const x=read(tasks([old]));
 assert.equal(x.items.length,0);
 assert.equal(x.details.tasks.staleReminders,1);
});
test('a verified current Reminder copy remains marked Reminder and source-aware dedupe suppresses identical native record',()=>{
 const current=task({title:'Task｜電話する',sourceFamily:'reminder',
  due:'2026-11-14',dueAt:'2026-11-14T03:00:00Z',
  lastSynced:'2026-11-13T23:00:00Z',action:'Remindersで確認'});
 const x=read(tasks([current]));
 assert.equal(x.items.length,1);
 assert.equal(x.details.tasks.freshReminders,1);
 assert.equal(x.items[0].title,'電話する');
 assert.equal(x.items[0].sourceKind,'reminder');
 assert.match(x.items[0].subtitle,/リマインダー期限 12:00/);
 const native={id:'native:reminder:1',type:'task',sourceKind:'reminder',
  title:'電話する',date:'2026-11-14',subtitle:'リマインダー期限 12:00'};
 const merged=api.merge([x.items[0]],[native]);
 assert.equal(merged.length,1);
 assert.equal(merged[0].id,native.id);
});
test('Notion mirrored Money current summary is never mistaken for confirmed payment',()=>{
 const x=read(tasks([task({sourceFamily:'money',title:'使えるお金 3万円'})]));
 assert.equal(x.items.length,0);
});

test('confirmed Notion Money future items display as planned, not actual, never a raw balance',()=>{
 const data=tasks([task({title:'通常タスク'})],{calendarMoney:{status:'ok',complete:true,checkedAt:'2026-11-13T23:30:00Z',
  items:[{id:'1'.repeat(32),title:'家賃',date:'2026-11-14',amount:55000,kind:'expense'},
         {id:'2'.repeat(32),title:'収入予定',date:'2026-11-15',amount:120000,kind:'income'}]}});
 const x=read(data);
 assert.equal(x.status.money,'ready');
 assert.equal(x.details.money.count,2);
 assert.equal(x.items.filter(e=>e.type==='money').length,2);
 assert.equal(x.items.find(e=>e.type==='money').complete,false);
 assert.equal(x.items.find(e=>e.type==='money').source,'Notion家計確認済');
});
test('malformed, stale or unavailable Money never hides existing Notion tasks',()=>{
 for(const m of [
  {status:'ok',complete:true,checkedAt:'2026-11-01T00:00:00Z',items:[]},
  {status:'ok',complete:true,checkedAt:'2026-11-13T23:00:00Z',items:[{id:'bad',title:'bad',date:'2026-11-14',amount:500,kind:'expense'}]},
  {status:'unavailable',items:[]}
 ]){
  const x=read(tasks([task()],{calendarMoney:m}));
  assert.equal(x.items.length,1);
  assert.notEqual(x.status.money,'ready');
 }
});
test('DAYSTREAM source adapter preserves only bounded typed Notion Money events',()=>{
 const raw=readFileSync(new URL('../../yos/daystream/source-adapters.js',import.meta.url),'utf8');
 const sub={window:{},Intl,Date,Set,Number,Object,String,Array};
 vm.runInNewContext(raw,sub,{timeout:1000});
 const fn=sub.window.YOS_DAYSTREAM_SOURCES.fromYosTaskDashboardCache;
 const data=fn({savedAt:Date.now(),data:{source:'notion',complete:true,tasks:[],
 calendarMoney:{status:'ok',complete:true,checkedAt:new Date().toISOString(),items:[{id:'a'.repeat(32),title:'支払い',date:'2026-11-14',amount:1200,kind:'expense'}]}}});
 assert.equal(data.calendarMoney.status,'ok');
 assert.equal(data.calendarMoney.items[0].amount,1200);
 const bad=fn({savedAt:Date.now(),data:{source:'notion',complete:true,tasks:[],
  calendarMoney:{status:'ok',complete:true,checkedAt:new Date().toISOString(),
   items:[{id:'bad',title:'坏',date:'2026-11-14',amount:-1200,kind:'expense'}]}}});
 assert.equal(bad.calendarMoney.status,'invalid');
 assert.equal(bad.items.length,0);
});

test('existing YOS menu links to unified calendar without adding a seventh main screen',()=>{
 const home=readFileSync(new URL('../../yos/index.html',import.meta.url),'utf8');
 assert.match(home,/<a href="\.\.\/life\/calendar\/">統合カレンダー/);
 assert.match(home,/<a href="\.\/daystream\/">DAYSTREAM/);
});
