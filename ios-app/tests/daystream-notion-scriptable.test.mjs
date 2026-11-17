import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../scriptable/YOS DAYSTREAM Notion.js',import.meta.url),'utf8');
const root=new URL('../../',import.meta.url);
const text=path=>readFileSync(new URL(path,root),'utf8');
export function api(overrides={}){
 const context=vm.createContext({Intl,Date,console,...overrides});
 vm.runInContext(script.split('// SCRIPTABLE_ENTRY')[0]+'\nglobalThis.api={project,dayProjection,readTasks,buildHTML,main,validateMoveInput,moveNotion};',context);
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
test('Notion calendar shifts without task status remain scheduled, not completed or paused',()=>{
 const a=api();
 for(const [name,kind] of [['夜勤','yos-shift-2026-11-20'],['日勤','calendar:manual-2026-11-21']]){
  const r=row('2026-11-20T17:00:00+09:00','2026-11-21T05:00:00+09:00',name);
  r.properties['状態']={select:null};
  r.properties['同期キー']={rich_text:[{plain_text:kind}]};
  const t=a.project(r);
  assert.equal(t.sourceKind,'calendar');
  assert.equal(t.state,'次にやる'); // Browser adapter placeholder; not persisted to Notion.
  const projected=a.dayProjection([{id:'notion-'+t.id,title:t.title,status:t.state,
   sourceFamily:t.sourceKind,dueAt:t.due,dueEnd:t.dueEnd}],'2026-11-20');
  assert.equal(projected.length,1);
  assert.equal(projected[0].sourceFamily,'calendar');
 }
 const normal=row('2026-11-20',null,'通常タスク');
 normal.properties['状態']={select:null};
 assert.throws(()=>a.project(normal),/タスクの状態を確認できません：通常タスク/);
 const unexpected=row('2026-11-20',null,'夜勤');
 unexpected.properties['状態']={select:{name:'不明'}};
 unexpected.properties['同期キー']={rich_text:[{plain_text:'yos-shift-2026-11-20'}]};
 assert.throws(()=>a.project(unexpected),/タスクの状態を確認できません/);
});
test('Notion blank-title record is skipped without misleading status failure',()=>{
 const r=row();r.properties['やること']={title:[]};r.properties['状態']={select:null};
 assert.equal(api().project(r),null);
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

test('Siri error uses runsWithSiri and returns shortcut output without Alert',async()=>{
 const outputs=[];
 const a=api({
  config:{runsWithSiri:true},
  Script:{setShortcutOutput:value=>outputs.push(value)},
  Alert:class{constructor(){throw Error('Siri Alert should never be constructed')}},
  Keychain:{contains:()=>false},
  Request:class{constructor(){throw Error('should not request without token')}}
 });
 await a.main();
 assert.equal(outputs.length,1);
 assert.match(outputs[0],/Notion未接続/);
});
test('Siri still renders its WebView with a valid read-only Notion response',async()=>{
 const outputs=[];let renders=0;
 const assets=['yos/daystream/index.html','yos/daystream/source-adapters.js','life/calendar/native-bridge.js','yos/daystream/task-wizard.js'];
 const a=api({
  config:{runsWithSiri:true},
  Script:{setShortcutOutput:value=>outputs.push(value)},
  Alert:class{constructor(){throw Error('unexpected Siri alert')}},
  Keychain:{contains:()=>true,get:()=> 'fake-token'},
  Request:class{
   constructor(url){this.url=url}
   async loadJSON(){this.response={statusCode:200};return {results:[row('2026-11-17')],has_more:false}}
   async loadString(){this.response={statusCode:200};const p=assets.find(x=>this.url.endsWith('/'+x));assert.ok(p);return text(p)}
  },
  WebView:{async loadHTML(html){renders++;assert.match(html,/Notionを更新/);assert.match(html,/yosNativeBoot/)}}
 });
 await a.main();
 assert.equal(renders,1);
 assert.deepEqual(outputs,[]);
});
test('Notion HTTP failures are categorized without exposing server or token contents',async()=>{
 for(const [http,hint] of [[401,'認証情報'],[403,'閲覧権限'],[404,'共有設定'],[429,'アクセス制限'],[503,'一時的']]){
  const a=api({Request:class{
   async loadJSON(){this.response={statusCode:http};return {message:'raw-token-should-not-leak'}}
  }});
  await assert.rejects(a.readTasks('fake-secret'),e=>{
   assert.match(e.message,new RegExp('HTTP '+http));assert.match(e.message,new RegExp(hint));
   assert.doesNotMatch(e.message,/raw-token|fake-secret/);return true;
  });
 }
});
test('malformed success and offline requests yield distinct read errors',async()=>{
 const malformed=api({Request:class{async loadJSON(){this.response={statusCode:200};return {results:'unexpected',has_more:false}}}});
 await assert.rejects(malformed.readTasks('fake-secret'),/HTTP 200：応答の形式/);
 const offline=api({Request:class{async loadJSON(){throw Error('private exception contents')}}});
 await assert.rejects(offline.readTasks('fake-secret'),/HTTP 不明：応答がありません/);
});

test('native Notion move validates same-day timestamps and rejects unrelated input',()=>{
 const a=api();
 const base={id:'a'.repeat(32),old:'2026-11-20T17:00:00+09:00',
  end:'2026-11-20T18:00:00+09:00',edited:'2026-11-17T00:00:00Z',next:'2026-11-20T19:00:00+09:00'};
 assert.equal(a.validateMoveInput(base).duration,3600000);
 assert.throws(()=>a.validateMoveInput({...base,id:'not-a-notion-id'}));
 assert.throws(()=>a.validateMoveInput({...base,next:'2026-11-21T19:00:00+09:00'}));
 assert.throws(()=>a.validateMoveInput({...base,next:base.old}));
 assert.throws(()=>a.validateMoveInput({...base,end:'2026-11-21T22:00:00+09:00'}));
});
function mockMove({confirmation=0,calendar=false,changed=false,foreign=false}={}){
 const calls={get:0,patch:0,refresh:0,bodies:[],alerts:0};
 const old='2026-11-20T17:00:00+09:00',end='2026-11-20T18:00:00+09:00',
  edited='2026-11-17T00:00:00Z',next='2026-11-20T19:00:00+09:00';
 const rowdata=row(old,end,'変更テスト');
 if(calendar){
  rowdata.properties['状態']={select:null};
  rowdata.properties['同期キー']={rich_text:[{plain_text:'yos-shift-2026-11-20'}]};
 }
 const page={object:'page',id:'a'.repeat(32),parent:foreign?{database_id:'b'.repeat(32)}:
   {data_source_id:'965c6086-32c1-463d-93b4-87a9cb69b3ad'},
  last_edited_time:changed?'2026-11-17T00:02:00Z':edited,properties:rowdata.properties};
 const a=api({
  config:{runsWithSiri:false},
  Keychain:{contains:()=>true,get:()=> 'private-placeholder-token'},
  Alert:class{
   addAction(){} addCancelAction(){}
   async presentAlert(){calls.alerts++;return confirmation}
  },
  Request:class{
   constructor(url){this.url=url;this.response=null}
   async loadJSON(){
    assert.match(this.headers.Authorization,/^Bearer private-placeholder-token$/);
    if(this.method==='GET'){
     calls.get++;this.response={statusCode:200};return structuredClone(page);
    }
    if(this.method==='PATCH'){
     calls.patch++;const body=JSON.parse(this.body);calls.bodies.push(body);
     page.properties['期限']=body.properties['期限'];
     page.last_edited_time='2026-11-17T00:03:00Z';
     this.response={statusCode:200};
     return structuredClone(page);
    }
    throw Error('unexpected request');
   }
  }
 });
 return {a,calls,params:{id:'a'.repeat(32),old,end,edited,next},refresh:async()=>{calls.refresh++}};
}
test('explicitly approved edit updates only Notion deadline and checks read-back',async()=>{
 const f=mockMove();
 await f.a.moveNotion(f.params,f.refresh);
 assert.equal(f.calls.patch,1);assert.equal(f.calls.refresh,1);
 assert.equal(f.calls.get,3);assert.equal(f.calls.alerts,1);
 assert.deepEqual(Object.keys(f.calls.bodies[0].properties),['期限']);
 assert.equal(f.calls.bodies[0].properties['期限'].date.start,f.params.next);
 assert.equal(Date.parse(f.calls.bodies[0].properties['期限'].date.end)-Date.parse(f.params.next),3600000);
});
test('no Notion write on cancelled action or stale/foreign/calendar source',async()=>{
 const cancelled=mockMove({confirmation:-1});
 await cancelled.a.moveNotion(cancelled.params,cancelled.refresh);
 assert.equal(cancelled.calls.patch,0);assert.equal(cancelled.calls.refresh,1);
 for(const scenario of [{changed:true},{foreign:true},{calendar:true}]){
  const f=mockMove(scenario);
  await assert.rejects(f.a.moveNotion(f.params,f.refresh));
  assert.equal(f.calls.patch,0);assert.equal(f.calls.refresh,0);
 }
});
