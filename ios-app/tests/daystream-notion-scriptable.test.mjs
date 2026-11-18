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
  '\nglobalThis.api={project,readTasks,buildHTML,main,nativeDirectRows,dayProjection};',context);
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
test('only approved routines and explicitly timed Clarity Inbox tasks become native cards',()=>{
 const a=api();
 const approved=row('2026-12-01T05:30:00Z','2026-12-01T05:35:00Z',
  '歯磨き','a'.repeat(32),'yos-daystream-routine-202612-night-brush');
 const calendar=row('2026-12-01T17:00:00+09:00','2026-12-02T02:00:00+09:00',
  '夜勤','b'.repeat(32),'yos-shift-2026-12-01');
 calendar.properties['状態']={select:null};
 const ordinary=row('2026-12-01T09:00:00Z',null,'未登録タスク','c'.repeat(32));
 const clarity=row('2026-12-01T06:30:00Z','2026-12-01T07:00:00Z',
  '買い物','d'.repeat(32),'inbox:clarity:bridge-routing-001:01');
 const missingTime=row(null,null,'いつか掃除する','e'.repeat(32),'inbox:clarity:bridge-routing-002:01');
 const unrelated=row('2026-12-01T07:00:00Z','2026-12-01T07:30:00Z',
  '既存の別タスク','f'.repeat(32),'other-source');
 const projected=[approved,calendar,ordinary,clarity,missingTime,unrelated].map(r=>a.project(r));
 const imported=[...a.nativeDirectRows(projected)];
 assert.deepEqual(imported.map(x=>x.title),['歯磨き','買い物']);
 assert.equal(imported[1].day,'2026-12-01');
 assert.equal(imported[1].s,930);
 assert.equal(imported[1].d,30);
 assert.equal(imported[1].id,'d'.repeat(32));
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
