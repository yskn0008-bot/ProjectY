import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const script=readFileSync(new URL('../scriptable/YOS DAYSTREAM Notion.js',import.meta.url),'utf8');
const root=new URL('../../',import.meta.url);
const text=path=>readFileSync(new URL(path,root),'utf8');
export function api(overrides={}){
 const context=vm.createContext({Intl,Date,console,...overrides});
 vm.runInContext(script.split('// SCRIPTABLE_ENTRY')[0]+
  '\nglobalThis.api={project,readTasks,buildHTML,main,nativeDirectRows,dayProjection,readDeviceCalendar};',context);
 return context.api;
}
export const row=(start=null,end=null,name='架空タスク',id='a'.repeat(32),key='')=>({
 id,last_edited_time:'2026-11-17T00:00:00Z',
 properties:{
  'やること':{title:[{plain_text:name}]},'状態':{select:{name:'次にやる'}},
  '期限':{date:start?{start,end}:null},
  '同期キー':{rich_text:key?[{plain_text:key}]:[]}
 }
});
export function htmlFor(tasks){
 const a=api(),rows=tasks.map(x=>a.project(x));
 const scope={};
 vm.runInNewContext(text('yos/daystream/source-adapters.js'),{window:scope,Intl,Date});
 const snapshot=scope.YOS_DAYSTREAM_SOURCES.fromYosTaskDashboardCache({
  savedAt:Date.now(),data:{source:'notion',complete:true,tasks:rows}
 });
 assert.ok(snapshot);
 return a.buildHTML(text('yos/daystream/index.html'),
  text('yos/daystream/source-adapters.js'),
  text('life/calendar/native-bridge.js'),
  text('yos/daystream/task-wizard.js'),snapshot,a.nativeDirectRows(rows));
}
test('Notion direct seeds preserve independent morning and night task titles',()=>{
 const a=api();
 const p=[
  row('2026-12-01T05:20:00Z','2026-12-01T05:22:00Z','起床','a'.repeat(32),'yos-daystream-routine-202612-wake'),
  row('2026-12-01T05:22:00Z','2026-12-01T05:25:00Z','水を飲む','b'.repeat(32),'yos-daystream-routine-202612-wake-water'),
  row('2026-11-30T21:10:00Z','2026-12-01T05:20:00Z','睡眠','c'.repeat(32),'yos-daystream-routine-202612-sleep')
 ];
 const out=a.nativeDirectRows(p.map(r=>a.project(r)));
 assert.equal(out.length,3);
 assert.deepEqual([...out].map(x=>[x.title,x.s,x.d]),[
  ['睡眠',370,490],['起床',860,2],['水を飲む',862,3]
 ]);
 assert.ok(out.every(x=>x.day==='2026-12-01'&&!x.done));
});
test('only explicitly approved routine sources are direct-imported',()=>{
 const a=api();
 const approved=row('2026-12-01T05:30:00Z','2026-12-01T05:35:00Z',
  '歯磨き','a'.repeat(32),'yos-daystream-routine-202612-night-brush');
 const calendar=row('2026-12-01T17:00:00+09:00','2026-12-02T02:00:00+09:00',
  '夜勤','b'.repeat(32),'yos-shift-2026-12-01');
 calendar.properties['状態']={select:null};
 const ordinary=row('2026-12-01T09:00:00Z',null,'未登録タスク','c'.repeat(32));
 assert.deepEqual([...a.nativeDirectRows([approved,calendar,ordinary].map(r=>a.project(r)))].map(x=>x.title),['歯磨き']);
});
test('invalid or ambiguous direct time source fails safely',()=>{
 const a=api(),wrong=row('2026-12-01',null,'起床','a'.repeat(32),'yos-daystream-routine-202612-wake');
 assert.throws(()=>a.nativeDirectRows([a.project(wrong)]));
 const cross=row('2026-12-01T22:00:00+09:00','2026-12-02T02:00:00+09:00',
  '起床','b'.repeat(32),'yos-daystream-routine-202612-wake');
 assert.throws(()=>a.nativeDirectRows([a.project(cross)]));
});
test('invalid state or date or id stops complete-source read',()=>{
 const a=api();assert.throws(()=>a.project(row('2026-02-30')));
 const r=row();r.properties['状態'].select.name='unknown';assert.throws(()=>a.project(r));
 assert.throws(()=>a.project(row(null,null,'bad','not-id')));
});
test('read-only Notion pagination remains complete',async()=>{
 let count=0;
 const a=api({Request:class{
  constructor(url){assert.match(url,/data_sources\/965c6086-32c1-463d-93b4-87a9cb69b3ad\/query$/)}
  async loadJSON(){
   assert.equal(this.method,'POST');assert.equal(this.headers.Authorization,'Bearer test-token');
   this.response={statusCode:200};
   return ++count===1?{results:[row()],has_more:true,next_cursor:'next'}:
    {results:[row('2026-11-17',null,'second','b'.repeat(32))],has_more:false};
  }
 }});
 assert.equal((await a.readTasks('test-token')).tasks.length,2);
 assert.equal(count,2);
});
test('web output uses existing purple native cards, not added Notion overlays',()=>{
 const h=htmlFor([
  row('2026-12-01T05:20:00Z','2026-12-01T05:22:00Z',
  '起床','a'.repeat(32),'yos-daystream-routine-202612-wake')
 ]);
 assert.match(h,/YOS_DAYSTREAM_DIRECT_IMPORTED_V1/);
 assert.match(h,/className='card '/);
 assert.doesNotMatch(h,/yos-notion-projection|yosNotionMoveBar|Scriptableの日時変更|method='PATCH'/);
 assert.doesNotMatch(h,/<script[^>]+src=|accounts\.google\.com\/gsi/);
 for(const m of h.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
});
test('missing iPhone Keychain does not edit any source data',async()=>{
 const labels=[];class Alert{addAction(){}async presentAlert(){labels.push(this.title)}}
 const a=api({Keychain:{contains:()=>false},Alert,Request:class{constructor(){throw Error('unexpected Request')}}});
 await a.main();
 assert.deepEqual(labels,['Notion未接続']);
});
test('Siri mode does not invoke unsupported Alerts',async()=>{
 const outputs=[];const a=api({
  config:{runsWithSiri:true},Keychain:{contains:()=>false},
  Script:{setShortcutOutput:x=>outputs.push(x)},
  Alert:class{constructor(){throw Error('No Siri Alert')}}
 });
 await a.main();assert.equal(outputs.length,1);
 assert.match(outputs[0],/Notion未接続/);
});
test('new Scriptable source cannot PATCH or DELETE original Notion records',()=>{
 assert.doesNotMatch(script,/method\s*=\s*['"](?:PATCH|DELETE)['"]/);
 assert.doesNotMatch(script,/scriptable:\/\/\/run\?scriptName=YOS%20DAYSTREAM%20Notion&/);
});

test('device-local Notion read displays an explicit Clarity time window without Google',()=>{
 const r=row('2026-11-19T10:00:00Z','2026-11-19T10:30:00Z','買い物');
 r.properties['正本・根拠']={rich_text:[{plain_text:'YOS Inbox clarity:test-window-0001'}]};
 const h=htmlFor([r]);
 assert.match(h,/"clarityWindow":true/);
 assert.match(h,/scriptable:\/\/\/run\?scriptName=YOS%20DAYSTREAM%20Notion/);
 assert.doesNotMatch(h,/accounts\.google\.com|yosWebGoogleButton/);
});


test('existing Scriptable DAYSTREAM reads a new iPhone calendar event without a task write',async()=>{
 const now=new Date(),when=new Date(now.getTime()+86400000),to=new Date(when.getTime()+30*60000);
 const a=api({CalendarEvent:{between:async()=>[{
  identifier:'clarity-calendar-001',title:'Clarity連携テスト',startDate:when,endDate:to,isAllDay:false
 }]}});
 const native=text('life/calendar/native-bridge.js');
 const mirror=await a.readDeviceCalendar(native,[],now);
 assert.equal(mirror?.status,'ok');
 assert.equal(mirror?.source,'scriptable-on-device');
 assert.equal(Object.values(mirror.calendarDays).flat().length,1);
 assert.equal(Object.values(mirror.calendarDays).flat()[0].title,'Clarity連携テスト');
 const h=htmlFor([]);
 const combined=a.buildHTML(text('yos/daystream/index.html'),text('yos/daystream/source-adapters.js'),
  native,text('yos/daystream/task-wizard.js'),{schema:'yos-daystream-source-snapshot-v1',kind:'tasks',
  status:'ok',items:[],checkedAt:new Date().toISOString(),source:'yos-auth-cache',origin:'notion',complete:true},[],mirror);
 assert.match(combined,/const nativeCalendar=\{"status":"ok","source":"scriptable-on-device"/);
 for(const m of combined.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
 assert.ok(h.includes('YOS_DAYSTREAM_DIRECT_IMPORTED_V1'));
});
test('device calendar mirror skips an exact Notion Clarity task instead of showing two cards',async()=>{
 const now=new Date(),start=new Date(now.getTime()+86400000),end=new Date(start.getTime()+30*60000);
 const events=[{identifier:'same-event',title:'買い物',startDate:start,endDate:end,isAllDay:false}];
 const a=api({CalendarEvent:{between:async()=>events}});
 const notionTask={sourceKind:'task',title:'買い物',due:start.toISOString(),dueEnd:end.toISOString(),
  evidence:'YOS Inbox clarity:test-window-0001'};
 const result=await a.readDeviceCalendar(text('life/calendar/native-bridge.js'),[notionTask],now);
 assert.equal(result?.status,'ok');
 assert.deepEqual([...Object.keys(result.calendarDays)],[]);
 assert.equal(events.length,1,'source calendar was not edited');
});
test('device calendar read failure or incomplete source cannot erase Notion tasks',async()=>{
 const now=new Date();
 const error=api({CalendarEvent:{between:async()=>{throw Error('Calendar access denied')}}});
 assert.equal(await error.readDeviceCalendar(text('life/calendar/native-bridge.js'),[],now),null);
 const tooMany=api({CalendarEvent:{between:async()=>Array.from({length:81},(_,i)=>({
  identifier:'item-'+i,title:'予定',startDate:now,endDate:new Date(now.getTime()+600000),isAllDay:false
 }))}});
 assert.equal(await tooMany.readDeviceCalendar(text('life/calendar/native-bridge.js'),[],now),null);
 const bad=api({CalendarEvent:{between:async()=>[{identifier:'broken',title:'予約',startDate:now,endDate:now}]}});
 assert.equal(await bad.readDeviceCalendar(text('life/calendar/native-bridge.js'),[],now),null);
});
