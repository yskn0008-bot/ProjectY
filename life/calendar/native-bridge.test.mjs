import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Buffer} from 'node:buffer';
import {TextDecoder} from 'node:util';

const js=readFileSync(new URL('./native-bridge.js',import.meta.url),'utf8');
const ctx={window:{atob:base64=>Buffer.from(base64,'base64').toString('binary')},Intl,Date,Number,String,Object,Array,Uint8Array,TextDecoder};
new Function('window','Intl','Date','Number','String','Object','Array','Uint8Array','TextDecoder',js)(ctx.window,Intl,Date,Number,String,Object,Array,Uint8Array,TextDecoder);
const api=ctx.window.YOS_CALENDAR_NATIVE;
const now=Date.parse('2026-11-14T00:00:00Z');
const snap=(patch={})=>({
 schema:'yos-calendar-native-snapshot-v1',source:'scriptable-on-device',
 checkedAt:'2026-11-14T00:00:00Z',windowStart:'2026-11-14',windowEnd:'2026-11-28',
 completeCalendar:true,remindersStatus:'ok',
 events:[{id:'event-a',title:'美容室',start:'2026-11-14T01:00:00Z',
 end:'2026-11-14T01:45:00Z',allDay:false}],
 reminders:[{id:'rem-a',title:'納税の確認',dueAt:'2026-11-14T06:00:00Z',completed:false}],
 ...patch
});
function store(initial={}){
 const map=new Map(Object.entries(initial)),s={map};
 s.getItem=k=>map.has(k)?map.get(k):null;
 s.setItem=(k,v)=>map.set(k,v);
 s.removeItem=k=>map.delete(k);
 return s;
}
test('on-device snapshot retains source IDs, Tokyo time and Reminder without mutating originals',()=>{
 const s=store(),saved=api.save(s,snap(),now);
 assert.equal(saved.ok,true);
 const result=api.read(s,now);
 assert.equal(result.status,'ready');
 assert.equal(result.items.length,2);
 assert.equal(result.items[0].subtitle,'10:00 – 10:45');
 assert.equal(result.items[0].sourceId,'event-a');
 assert.equal(result.items[1].subtitle,'リマインダー期限 15:00');
 assert.equal(result.details.remindersStatus,'ok');
});
test('multi-day across midnight segments exactly and respects an all-day exclusive end',()=>{
 const x=snap({events:[
  {id:'late',title:'夜勤',start:'2026-11-14T14:30:00Z',end:'2026-11-14T16:00:00Z',allDay:false},
  {id:'day',title:'休み',start:'2026-11-14T15:00:00Z',end:'2026-11-15T15:00:00Z',allDay:true}
 ],reminders:[]});
 const s=store();assert.equal(api.save(s,x,now).ok,true);
 const items=api.read(s,now).items;
 assert.deepEqual(Array.from(items.map(v=>v.subtitle)),['23:30 – 24:00','00:00 – 01:00','終日']);
 assert.deepEqual(Array.from(items.map(v=>v.date)),['2026-11-14','2026-11-15','2026-11-15']);
});
test('date-only reminder never fabricates a 00:00 clock',()=>{
 const s=store();const d=snap({events:[],reminders:[{id:'one',title:'手続き',dueAt:'2026-11-14T15:00:00Z',dueAllDay:true,completed:false}]});
 assert.equal(api.save(s,d,now).ok,true);
 assert.equal(api.read(s,now).items[0].subtitle,'リマインダー期限（日付のみ）');
});
test('permission failure is unavailable not falsely reported as zero reminders',()=>{
 const s=store();assert.equal(api.save(s,snap({remindersStatus:'unavailable',reminders:[]}),now).ok,true);
 const d=api.read(s,now);assert.equal(d.items.length,1);assert.equal(d.details.remindersStatus,'unavailable');
});
test('stale snapshot is never silently displayed even though storage remains intact',()=>{
 const s=store();
 assert.equal(api.save(s,snap(),now).ok,true);
 const next=api.read(s,now+86400000+1);
 assert.equal(next.status,'stale');assert.equal(next.items.length,0);
 assert.ok(s.getItem(api.keys.snapshot));
});
test('incomplete, malformed, duplicate and over-capacity inputs preserve existing verified snapshot',()=>{
 const s=store();const good=snap();
 assert.equal(api.save(s,good,now).ok,true);
 const before=s.getItem(api.keys.snapshot);
 for(const invalid of [
  snap({completeCalendar:false}),
  snap({events:[good.events[0],good.events[0]]}),
  snap({events:[{id:'bad',title:'broken',start:'2026-11-14T01:00',end:'2026-11-14T02:00',allDay:false}]}),
  snap({remindersStatus:'unavailable'}),
  snap({events:[...Array(81)].map((_,i)=>({...good.events[0],id:String(i)}))}),
  snap({windowEnd:'2026-11-13'}),
 ]){
  assert.equal(api.save(s,invalid,now).ok,false);
  assert.equal(s.getItem(api.keys.snapshot),before);
 }
});
test('readback/backup failure restores the prior saved data',()=>{
 const s=store(),old=snap();assert.equal(api.save(s,old,now).ok,true);
 const expected=s.getItem(api.keys.snapshot),originalSet=s.setItem;
 s.setItem=(k,v)=>{if(k===api.keys.snapshot)throw Error('quota');originalSet(k,v)};
 const next=snap({events:[]});
 assert.equal(api.save(s,next,now).ok,false);
 assert.equal(s.getItem(api.keys.snapshot),expected);
});
test('private URL fragment imported and erased before any result; invalid fragment erased but never saved',()=>{
 const nonce='f'.repeat(32),s=store({[api.keys.pending]:JSON.stringify({nonce,createdAt:now})});
 const payload=Buffer.from(JSON.stringify(snap({requestNonce:nonce})),'utf8').toString('base64url');
 let cleared='',calls=0;
 const location={pathname:'/ProjectY/life/calendar/',search:'?mode=glance',hash:'#yos-native='+payload};
 const history={replaceState:(_a,_b,url)=>{cleared=url;calls++}};
 const r=api.consume(s,location,history,now);
 assert.equal(r.ok,true);assert.equal(calls,1);assert.equal(cleared,'/ProjectY/life/calendar/?mode=glance');
 assert.equal(api.read(s,now).items.length,2);
 const invalid=api.consume(s,{pathname:'/',search:'',hash:'#yos-native=%%'},history,now);
 assert.equal(invalid.ok,false);assert.equal(invalid.reason,'invalid');
 assert.equal(api.read(s,now).items.length,2);
});
test('cannot persist credentials in bridge, existing Scriptable default Life route is unchanged',()=>{
 const script=readFileSync(new URL('../calendar-sync-scriptable.js',import.meta.url),'utf8');
 assert.match(script,/target==='calendar'/);
 assert.match(script,/else await run\(\)/);
 assert.match(script,/CalendarEvent\.between/);
 assert.match(script,/Reminder\.allIncomplete/);
 assert.match(script,/YOS_CALENDAR_NATIVE_URL/);
 assert.doesNotMatch(js,/notionToken|Bearer|api\.notion|localStorage\.setItem/);
});

test('a forged native URL without a browser-initiated nonce cannot replace stored tasks',()=>{
 const s=store(),old=snap();
 assert.equal(api.save(s,old,now).ok,true);
 const previous=s.getItem(api.keys.snapshot);
 const forged=snap({requestNonce:'a'.repeat(32),events:[]});
 const payload=Buffer.from(JSON.stringify(forged),'utf8').toString('base64url');
 let cleared=0;
 const result=api.consume(s,{pathname:'/ProjectY/life/calendar/',search:'',hash:'#yos-native='+payload},
   {replaceState:()=>cleared++},now);
 assert.equal(result.ok,false);
 assert.equal(result.reason,'unrequested');
 assert.equal(cleared,1);
 assert.equal(s.getItem(api.keys.snapshot),previous);
});
test('expired import nonce cannot be reused',()=>{
 const nonce='b'.repeat(32);
 const s=store({[api.keys.pending]:JSON.stringify({nonce,createdAt:now-6*60000})});
 const encoded=Buffer.from(JSON.stringify(snap({requestNonce:nonce})),'utf8').toString('base64url');
 const r=api.consume(s,{pathname:'/',search:'',hash:'#yos-native='+encoded},{replaceState:()=>{}},now);
 assert.equal(r.reason,'unrequested');
 assert.equal(s.getItem(api.keys.snapshot),null);
});
