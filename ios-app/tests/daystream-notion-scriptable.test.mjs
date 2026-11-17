import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../scriptable/YOS DAYSTREAM Notion.js',import.meta.url),'utf8');
const root=new URL('../../',import.meta.url);
const text=path=>readFileSync(new URL(path,root),'utf8');
export function api(overrides={}){
 const context=vm.createContext({Intl,Date,console,...overrides});
 vm.runInContext(script.split('// SCRIPTABLE_ENTRY')[0]+'\nglobalThis.api={project,dayProjection,readTasks,buildHTML,main};',context);
 return context.api;
}
export const row=(start=null,end=null,name='架空タスク',id='a'.repeat(32))=>({id,last_edited_time:'2026-11-17T00:00:00Z',properties:{
 'やること':{title:[{plain_text:name}]},'状態':{select:{name:'次にやる'}},
 '期限':{date:start?{start,end}:null}
}});
export function htmlFor(tasks){
 const scope={};vm.runInNewContext(text('yos/daystream/source-adapters.js'),{window:scope,Intl,Date});
 const snapshot=scope.YOS_DAYSTREAM_SOURCES.fromYosTaskDashboardCache({savedAt:Date.now(),data:{source:'notion',complete:true,tasks:tasks.map(r=>api().project(r))}});
 assert.ok(snapshot);
 return api().buildHTML(text('yos/daystream/index.html'),text('yos/daystream/source-adapters.js'),text('life/calendar/native-bridge.js'),text('yos/daystream/task-wizard.js'),snapshot);
}
test('date-only and no-date tasks retain their meaning',()=>{
 const a=api();assert.equal(a.project(row()).due,null);
 assert.equal(a.project(row('2026-11-17')).due,'2026-11-17');
});
test('invalid state/date/id rejects complete-source result',()=>{
 const a=api();
 assert.throws(()=>a.project(row('2026-02-30')));
 assert.throws(()=>a.project(row('2026-11-17T25:00:00+09:00')));
 const r=row();r.properties['状態'].select.name='unknown';assert.throws(()=>a.project(r));
 assert.throws(()=>a.project(row(null,null,'bad','not-id')));
});
test('night shift is split at Tokyo midnight without phantom end-day block',()=>{
 const a=api(),t={id:'notion-'+'a'.repeat(32),title:'夜勤',dueAt:'2026-11-20T17:00:00+09:00',dueEnd:'2026-11-21T05:00:00+09:00'};
 assert.equal(a.dayProjection([t],'2026-11-20')[0].s,1020);
 assert.equal(a.dayProjection([t],'2026-11-20')[0].d,420);
 assert.equal(a.dayProjection([t],'2026-11-21')[0].d,300);
 t.dueEnd='2026-11-21T00:00:00+09:00';assert.equal(a.dayProjection([t],'2026-11-21').length,0);
});
test('timestamp without end is a deadline point, no invented duration',()=>{
 const a=api(),r=a.dayProjection([{id:'notion-'+'a'.repeat(32),title:'期限',dueAt:'2026-11-17T02:00:00Z'}],'2026-11-17')[0];
 assert.equal(r.type,'deadline');assert.equal(r.s,660);assert.equal(r.d,0);
});
test('date-only ranges inclusive; undated never assigned today',()=>{
 const a=api(),t={id:'notion-'+'a'.repeat(32),title:'終日',due:'2026-11-17',dueAt:'2026-11-17',dueEnd:'2026-11-18'};
 assert.equal(a.dayProjection([t],'2026-11-18')[0].type,'undated');
 assert.equal(a.dayProjection([{...t,dueAt:null}],'2026-11-17').length,0);
});
test('complete pagination and read-only query contract',async()=>{
 let count=0;
 const a=api({Request:class{
  constructor(url){assert.match(url,/data_sources\/965c6086-32c1-463d-93b4-87a9cb69b3ad\/query$/)}
  async loadJSON(){assert.equal(this.method,'POST');assert.equal(this.headers.Authorization,'Bearer fake-token');this.response={statusCode:200};return ++count===1?{results:[row()],has_more:true,next_cursor:'next'}:{results:[row('2026-11-17',null,'second','b'.repeat(32))],has_more:false}}
 }});
 assert.equal((await a.readTasks('fake-token')).tasks.length,2);assert.equal(count,2);
});
test('permission failures, repeated cursor and over-limit abort without partial result',async()=>{
 for(const mode of ['permission','cursor','limit']){
  let n=0;const a=api({Request:class{
   async loadJSON(){n++;this.response={statusCode:mode==='permission'?403:200};return {results:[],has_more:true,next_cursor:mode==='cursor'?'same':'page'+n}}
  }});
  await assert.rejects(a.readTasks('fake-token'));assert.ok(n<=4);
 }
});
test('complete HTML has inline scripts only and no credential or Google auth',()=>{
 const html=htmlFor([row('2026-11-17',null,'</script><script>alert(1)</script>')]);
 assert.doesNotMatch(html,/<script[^>]+src=|Bearer fake-token|accounts\.google\.com\/gsi/);
 assert.match(html,/Notionを更新/);assert.match(html,/yosNativeBoot/);
 for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
});
test('missing Keychain stops before source or UI requests',async()=>{
 const alerts=[];class Alert{addAction(){}async presentAlert(){alerts.push(this.title)}}
 const a=api({Keychain:{contains:()=>false},Alert,Request:class{constructor(){throw Error('unexpected request')}}});
 await a.main();assert.deepEqual(alerts,['Notion未接続']);
});
