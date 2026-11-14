import test from 'node:test';
import assert from 'node:assert/strict';
import {loadNotionTaskDashboard} from '../dist/widget/notion-source.js';
import {createTaskDashboardHandler} from '../dist/tasks/handler.js';

const ds='965c608632c1463d93b487a9cb69b3ad';
const id='11111111222233334444555555555555';
const rich=(value,type='rich_text')=>({[type]:[{plain_text:value}]});
const select=name=>({select:{name}});
const page=(overrides={})=>({id,last_edited_time:'2026-11-13T01:00:00Z',properties:{
 'やること':rich('Task','title'),'状態':select('次にやる'),'実行順':{number:null},
 '期限':{date:{start:'2026-11-12T23:00:00Z',end:'2026-11-13T00:00:00Z',time_zone:null}},
 '領域':select('Work'),'習慣周期':select('毎週'),...overrides
}});
const payload=results=>Response.json({results,has_more:false,next_cursor:null});
const load=fetchImpl=>loadNotionTaskDashboard({notionToken:'private-test-token',notionDataSourceId:ds,calendar:true,fetchImpl});

test('calendar read includes unordered tasks, stable page IDs, exact dates and existing habit cycle',async()=>{
 const raw=page();const original=JSON.stringify(raw);
 const result=await load(async()=>payload([raw]));
 assert.equal(result.source,'notion');assert.equal(result.complete,true);
 assert.equal(result.tasks[0].id,id);assert.equal(result.tasks[0].order,1000);
 assert.equal(result.tasks[0].due,'2026-11-12T23:00:00Z');
 assert.equal(result.tasks[0].dueEnd,'2026-11-13T00:00:00Z');
 assert.equal(result.tasks[0].habitCycle,'毎週');assert.equal(result.tasks[0].area,'Work');
 assert.equal(JSON.stringify(raw),original);
 const renamed=await load(async()=>payload([page({'やること':rich('Renamed','title'),'実行順':{number:1}})]));
 assert.equal(renamed.tasks[0].id,id);
});
test('pagination is complete and bounded, malformed pagination never returns success',async()=>{
 const calls=[];
 const result=await load(async(url,init)=>{
  calls.push(JSON.parse(init.body));
  return calls.length===1?Response.json({results:[page()],has_more:true,next_cursor:'next'}):payload([{...page(),id:'aaaaaaaa222233334444555555555555'}]);
 });
 assert.equal(result.tasks.length,2);assert.equal(calls[1].start_cursor,'next');
 for(const bad of [{},{results:[]}, {results:[],has_more:true}, {results:[],has_more:true,next_cursor:''}]){
  await assert.rejects(()=>load(async()=>Response.json(bad)));
 }
 let count=0;
 await assert.rejects(()=>load(async()=>Response.json({results:[],has_more:true,next_cursor:String(++count)})),/limit/);
 assert.equal(count,5);
});
test('duplicates, invalid state, missing ID and capacity overflow fail closed; archives are excluded',async()=>{
 await assert.rejects(()=>load(async()=>payload([page(),page()])),/duplicate/);
 await assert.rejects(()=>load(async()=>payload([{...page(),id:''}])),/page ID/);
 await assert.rejects(()=>load(async()=>payload([page({'状態':select('unknown')})])),/state/);
 const items=Array.from({length:401},(_,i)=>({...page(),id:i.toString(16).padStart(32,'0')}));
 await assert.rejects(()=>load(async()=>payload(items)),/capacity/);
 assert.equal((await load(async()=>payload([{...page(),archived:true}]))).tasks.length,0);
});
const origin='https://yskn0008-bot.github.io';
const request=(source='notion',headers={Origin:origin,Authorization:'Bearer test-id-token'},method='GET')=>new Request('https://existing.example/api/yos/tasks?source='+source,{headers,method});
function handler(fetchImpl,extra={}){
 return createTaskDashboardHandler({allowedOrigins:[origin],identityVerifier:{verify:async()=>({})},identityGate:{authorize:async()=>({})},googleWorkloadAuth:{mode:'application_default'},notionToken:'private-test-token',notionDataSourceId:ds,fetchImpl,...extra});
}
test('existing authenticated Tasks endpoint reads Notion only when explicitly requested',async()=>{
 const calls=[];const h=handler(async(url,init)=>{calls.push(String(url));assert.equal(init.headers.Authorization,'Bearer private-test-token');return payload([page()]);});
 const response=await h(request());assert.equal(response.status,200);
 const data=await response.json();assert.equal(data.source,'notion');assert.equal(data.tasks[0].id,id);
 assert.equal(calls.length,1);assert.match(calls[0],/api.notion.com\/v1\/data_sources/);
 assert.match(response.headers.get('Cache-Control'),/no-store/);
});
test('Notion unavailable returns 503 without Google fallback or secrets',async()=>{
 const h=handler(async()=>{throw Error('private-test-token')});
 const response=await h(request());assert.equal(response.status,503);
 assert.doesNotMatch(await response.text(),/private-test-token/);
 let calls=0;const missing=handler(async()=>{calls++;return payload([])},{notionToken:''});
 assert.equal((await missing(request())).status,503);assert.equal(calls,0);
});
test('origin, identity, method and source validation block unauthorized reads and all writes',async()=>{
 let calls=0;const h=handler(async()=>{calls++;return payload([])});
 assert.equal((await h(request('notion',{Origin:'https://bad.example',Authorization:'Bearer token'}))).status,403);
 assert.equal((await h(request('notion',{Origin:origin}))).status,401);
 const denied=handler(async()=>{calls++;return payload([])},{identityGate:{authorize:async()=>{throw Error('denied')}}});
 assert.equal((await denied(request())).status,401);
 assert.equal((await h(request('notion',undefined,'POST'))).status,405);
 assert.equal((await h(request('other'))).status,400);assert.equal(calls,0);
});

test('subsequent reads reflect source title, status and date updates without writing or duplicating',async()=>{
 let current=page();const calls=[];
 const h=handler(async(url,init)=>{calls.push({url:String(url),method:init.method});return payload([current]);});
 const before=await (await h(request())).json();
 current=page({'やること':rich('Updated title','title'),'状態':select('完了'),'期限':{date:{start:'2026-11-20',end:null}}});
 const after=await (await h(request())).json();
 assert.equal(after.tasks.length,1);assert.equal(after.tasks[0].id,before.tasks[0].id);
 assert.equal(after.tasks[0].state,'完了');assert.equal(after.tasks[0].due,'2026-11-20');
 assert.equal(after.tasks[0].title,'Updated title');
 assert.equal(calls.length,2);assert.ok(calls.every(x=>x.method==='POST'&&x.url.endsWith('/query')));
});

test('empty Notion placeholder rows are reported without hiding partially populated tasks',async()=>{
 const blank={id:'aaaaaaaa222233334444555555555555',properties:{'やること':{title:[]},'状態':{select:null},'実行順':{number:null}}};
 const result=await load(async()=>payload([blank,page()]));
 assert.equal(result.tasks.length,1);assert.equal(result.ignoredBlankCount,1);
 await assert.rejects(()=>load(async()=>payload([{...blank,properties:{...blank.properties,'期限':{date:{start:'2026-11-13'}}}}])),/no title/);
});

function mutationHarness({state='次にやる',version='2026-11-13T01:00:00Z',parent=ds,cycle='',syncKey='',uncertain=false}={}){
 let current={...page({'状態':select(state),'習慣周期':select(cycle),'同期キー':rich(syncKey)}),parent:{data_source_id:parent},last_edited_time:version};
 const calls=[];
 const h=handler(async(url,init)=>{
  calls.push({url:String(url),method:init.method,body:init.body});
  if(init.method==='PATCH'){
   assert.deepEqual(JSON.parse(init.body),{properties:{'状態':{select:{name:'完了'}}}});
   current={...current,last_edited_time:'2026-11-13T02:00:00Z',properties:{...current.properties,'状態':select('完了')}};
   if(uncertain)throw Error('connection lost after write');
  }
  return Response.json(current);
 });
 const complete=(overrides={})=>h(new Request('https://existing.example/api/yos/tasks?source=notion',{method:'PATCH',headers:{Origin:origin,Authorization:'Bearer test-id-token','Content-Type':'application/json'},body:JSON.stringify({action:'complete',pageId:id,expectedEditedAt:'2026-11-13T01:00:00Z',expectedState:'次にやる',...overrides})}));
 return {complete,calls};
}
test('completion verifies parent, version and readback, replay only reads already completed page',async()=>{
 const h=mutationHarness();
 assert.equal((await h.complete()).status,200);assert.deepEqual(h.calls.map(x=>x.method),['GET','PATCH','GET']);
 const second=await h.complete();assert.equal(second.status,200);assert.equal((await second.json()).task.state,'完了');
 assert.deepEqual(h.calls.map(x=>x.method),['GET','PATCH','GET','GET']);
});
test('changed, unrelated, recurring and waiting tasks cannot be accidentally completed',async()=>{
 for(const options of [{version:'2026-11-13T01:01:00Z'},{parent:'aaaaaaaa222233334444555555555555'},{cycle:'毎日'},{state:'待ち'}]){
  const h=mutationHarness(options);assert.equal((await h.complete()).status,409);
  assert.equal(h.calls.some(x=>x.method==='PATCH'),false);
 }
 const h=mutationHarness();assert.equal((await h.complete({action:'reopen'})).status,400);assert.equal(h.calls.length,0);
});
test('unknown completion result is resolved on explicit retry without a second write',async()=>{
 const h=mutationHarness({uncertain:true});
 assert.equal((await h.complete()).status,409);
 assert.equal((await h.complete()).status,200);
 assert.equal(h.calls.filter(x=>x.method==='PATCH').length,1);
});

test('Notion calendar API preserves mirror source types so stale reminders and money are never plain tasks',async()=>{
 const rows=[
  {...page({'同期キー':rich('calendar:aaa')}),id:'a'.repeat(32)},
  {...page({'同期キー':rich('reminder:bbb')}),id:'b'.repeat(32)},
  {...page({'同期キー':rich('money:current')}),id:'c'.repeat(32)},
  {...page({'同期キー':rich('')}),id:'d'.repeat(32)}
 ];
 const x=await load(async()=>payload(rows));
 assert.deepEqual(x.tasks.map(t=>t.sourceKind),['calendar','reminder','money','task']);
});
test('calendar, reminder and money mirrors are source-owned and cannot be completed through YOS Tasks',async()=>{
 for(const syncKey of ['calendar:abc','reminder:abc','money:current']){
  const h=mutationHarness({syncKey});
  assert.equal((await h.complete()).status,409);
  assert.equal(h.calls.some(c=>c.method==='PATCH'),false);
 }
});
