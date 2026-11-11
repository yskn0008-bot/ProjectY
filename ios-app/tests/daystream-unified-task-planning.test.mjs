import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const script=fs.readFileSync(new URL('../scriptable/YOS Timeline Charcoal 確認 20261111.js',import.meta.url),'utf8');
const html=script.match(/const html=\x60([\s\S]*?)\x60;\s*const payload=/)?.[1]||'';
const client=html.match(/<script>([\s\S]*?)<\\\/script>/)?.[1]||'';
const native=script.slice(script.indexOf('const YOS_TASK_SOURCE='),script.indexOf('async function main(){'));
const slotSource=client.match(/\/\/ YOS_UNIFIED_SLOT_START([\s\S]*?)\/\/ YOS_UNIFIED_SLOT_END/)?.[1]||'';
const batchSource=client.match(/\/\/ YOS_UNIFIED_BATCH_START([\s\S]*?)\/\/ YOS_UNIFIED_BATCH_END/)?.[1]||'';

const row=(id,title,status='次にやる',area='Work',due='2026-11-12')=>({
 id,properties:{
 'やること':{title:[{plain_text:title}]},
 '状態':{select:{name:status}},
 '領域':{select:{name:area}},
 '優先度':{select:{name:'P1'}},
 '期限':due?{date:{start:due}}:null,
 '次の一手':{rich_text:[{plain_text:'本人判断が必要'}]},
 }});
const sample=[
 row('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','応募書類を作成'),
 row('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','部屋を片付ける','次にやる','Life',''),
 row('cccccccccccccccccccccccccccccccc','完了済み','完了','Money')
];
function hooks({token='LOCAL_ONLY_SECRET',results=[{results:sample,has_more:false}],code=200,habit}={}){
 const requests=[];
 class Request{
  constructor(url){this.url=url;this.response=null;requests.push(this)}
  async loadJSON(){this.response={statusCode:code};return results.shift()||{results:[],has_more:false}}
 }
 const keychain={contains:()=>Boolean(token),get:()=>token};
 const files=new Map();if(habit)files.set('/local/YOS_HABIT_FLOW_v1.json',JSON.stringify(habit));
 const FileManager={local:()=>({documentsDirectory:()=>'/local',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p),readString:p=>files.get(p)})};
 const api=vm.runInNewContext(native+'\n({yosParseTask,yosReadTaskSource,yosReadHabits})',{Request,Keychain:keychain,FileManager,Date});
 return {...api,requests,files};
}

test('standalone Scriptable source and embedded WebView JS have valid syntax',()=>{
 assert.ok(html&&client&&native);
 new (Object.getPrototypeOf(async function(){}).constructor)(script);
 new vm.Script(client);
 assert.match(script,/YOS_SCRIPT_NAME: YOS Timeline Charcoal 確認 20261111/);
});

test('source task records preserve domain, deadline and next action; omit completed tasks',()=>{
 const h=hooks();
 const first=h.yosParseTask(sample[0]);
 assert.equal(first.area,'Work');
 assert.equal(first.due,'2026-11-12');
 assert.equal(first.priority,'P1');
 assert.equal(first.action,'本人判断が必要');
 assert.equal(first.status,'次にやる');
 assert.equal(h.yosParseTask(sample[1]).due,'');
 assert.equal(h.yosParseTask(sample[2]),null);
 assert.equal(h.yosParseTask({id:'malformed',properties:sample[0].properties}),null);
});

test('Notion Tasks read-only source uses existing data-source ID and never sends credentials to WebView',async()=>{
 const h=hooks();const x=await h.yosReadTaskSource();
 assert.equal(x.status,'ok');assert.equal(x.items.length,2);
 assert.deepEqual(Array.from(x.items.map(t=>t.area)),['Work','Life']);
 assert.equal(h.requests.length,1);
 const req=h.requests[0];
 assert.match(req.url,/\/v1\/data_sources\/965c6086-32c1-463d-93b4-87a9cb69b3ad\/query$/);
 assert.equal(req.method,'POST');
 assert.equal(req.headers.Authorization,'Bearer LOCAL_ONLY_SECRET');
 assert.doesNotMatch(script,/\/v1\/pages\/|req\.method\s*=\s*['"](?:PATCH|PUT|DELETE)['"]/);
 assert.match(script,/const payload=JSON\.stringify\(\{days:state\.days,calendarDays,taskSource,habitSource/);
 assert.doesNotMatch(script,/JSON\.stringify\(\{days:state\.days,calendarDays,token/);
 assert.equal(JSON.stringify(x).includes('LOCAL_ONLY_SECRET'),false);
});

test('without Notion token or with read error, the source is clearly unavailable, never empty-but-confirmed',async()=>{
 const missing=hooks({token:''});const a=await missing.yosReadTaskSource();
 assert.equal(a.status,'unavailable');assert.equal(a.items.length,0);assert.equal(missing.requests.length,0);
 const blocked=hooks({code:401});const b=await blocked.yosReadTaskSource();
 assert.equal(b.status,'error');assert.equal(b.items.length,0);
});

test('read pagination and duplicate source IDs do not create additional task copies',async()=>{
 const a=row('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','Task A'),b=row('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','Task B');
 const h=hooks({results:[{results:[a],has_more:true,next_cursor:'cursor1'},{results:[a,b],has_more:false}]});
 const out=await h.yosReadTaskSource();
 assert.equal(out.status,'ok');assert.equal(out.items.length,2);
 assert.equal(JSON.parse(h.requests[1].body).start_cursor,'cursor1');
});

test('habit entries come only from the existing habit source, with no synthetic completed status',()=>{
 const habit={schema:'yos-habit-flow-v1',version:1,lists:{
  daily:[{id:'walk_after_meal',kind:'habit',title:'食後5分歩く',timing:'食後'}],
  weekly:[],monthly:[],yearly:[]}};
 const h=hooks({habit});const out=h.yosReadHabits();
 assert.equal(out.status,'ok');assert.equal(out.items.length,1);
 assert.equal(out.items[0].trigger,'食後');assert.equal(out.items[0].title,'食後5分歩く');
 assert.equal(out.items[0].done,undefined);
 assert.equal(h.files.size,1);
 const missing=hooks().yosReadHabits();assert.equal(missing.status,'unavailable');
});

test('15-minute slot planning never moves fixed or previously accepted events and preserves buffer',()=>{
 const find=vm.runInNewContext(slotSource+'\nyosFindSlot',{});
 assert.equal(find([{s:540,d:60,f:1}],540,30),615);
 assert.equal(find([{s:540,d:60,f:1},{s:615,d:45,kind:'task'}],540,30),675);
 assert.equal(find([],542,30),555);
 assert.equal(find([{s:0,d:1440,f:1}],0,30),null);
 assert.equal(find([],1430,30),null);
 assert.equal(find([],540,241),null);
});

test('slot acceptance requires explicit click, exact reviewed day/time, and local-only storage',()=>{
 assert.match(client,/この配置を採用/);
 assert.match(client,/selectedDay!==proposedDay/);
 assert.match(client,/fresh!==at/);
 assert.match(client,/sourceRef:ref/);
 assert.match(client,/savedDays\[selectedDay\]=items\.filter\(x=>x\.source!=='Apple Calendar'\)/);
 assert.match(client,/元の期限と予定は変更しません/);
 assert.match(client,/端末内で仮完了/);
 assert.doesNotMatch(client,/localStorage\.(getItem|setItem)/);
 assert.ok(html.includes('id="yosSourceTasks"'));
 assert.ok(html.includes('id="yosHabitTasks"'));
 assert.ok(html.includes('id="yosStartFrom"'));
});

test('old separate user data and reference calendars remain protected',()=>{
 assert.match(script,/const STORE_NAME='YOS_TIMELINE_CHARCOAL_VERIFY_20261111_v1\.json'/);
 assert.match(script,/const dayItems=day=>\[\.\.\.calendarItems\(day\)/);
 assert.match(script,/YOS_NOTION_KEY='YOS_NOTION_INTEGRATION_TOKEN'/);
 assert.doesNotMatch(script,/YOS_DAYSTREAM_GLASS_VERIFY_20261111_v1\.json|YOS_DAYSTREAM_TIMELINE_REVIEW_v1\.json/);
 assert.doesNotMatch(script,/CalendarEvent\.create|CalendarEvent\.remove|CalendarEvent\.save/);
});


test('batch prioritizes near due dates over undated tasks without inventing fixed appointments',()=>{
 const logic=vm.runInNewContext(slotSource+batchSource+'\n({yosFindSlot,yosBatchPlan})',{Date});
 const tasks=[
  {id:'undated',title:'long term',priority:'P0',status:'次にやる',due:'',area:'Work'},
  {id:'today',title:'payment check',priority:'P2',status:'次にやる',due:'2026-11-11',area:'Money'},
  {id:'tomorrow',title:'appointment prep',priority:'P1',status:'実行中',due:'2026-11-12',area:'Life'},
  {id:'waiting',title:'blocked',priority:'P0',status:'待ち',due:'2026-11-11',area:'Life'}
 ];
 const plans=logic.yosBatchPlan(tasks,[{s:540,d:60,f:1}],540,'2026-11-11');
 assert.deepEqual(Array.from(plans.map(x=>x.task.id)),['today','tomorrow','undated']);
 assert.deepEqual(Array.from(plans.map(x=>x.at)),[615,660,705]);
 assert.ok(plans.every(x=>x.d===30));
 assert.equal(plans.find(x=>x.task.id==='waiting'),undefined);
});

test('batch declines to consume the last 30 percent of available time',()=>{
 const logic=vm.runInNewContext(slotSource+batchSource+'\n({yosFindSlot,yosBatchPlan})',{Date});
 const tasks=Array.from({length:4},(_,i)=>({id:String(i),title:'task '+i,status:'次にやる',priority:'P1',due:'2026-11-11'}));
 assert.equal(logic.yosBatchPlan(tasks,[],1380,'2026-11-11').length,0);
 assert.equal(logic.yosBatchPlan(tasks,[{s:0,d:1320,f:1}],1320,'2026-11-11').length,1);
 assert.equal(logic.yosBatchPlan(tasks,[],1440,'2026-11-11').length,0);
});

test('stale overdue items are not silently auto-replanned and batch requires review before mutation',()=>{
 const logic=vm.runInNewContext(slotSource+batchSource+'\n({yosFindSlot,yosBatchPlan})',{Date});
 const tasks=[
  {id:'stale',title:'old task',status:'実行中',priority:'P0',due:'2026-10-01'},
  {id:'recent',title:'recent task',status:'実行中',priority:'P1',due:'2026-11-10'}
 ];
 const result=logic.yosBatchPlan(tasks,[],600,'2026-11-11');
 assert.deepEqual(Array.from(result.map(x=>x.task.id)),['recent']);
 assert.match(client,/この配置を採用/);
 assert.match(client,/まとめてこの配置を採用/);
 assert.match(client,/selectedDay!==day/);
 assert.match(client,/JSON\.stringify\(proposed\.map/);
 assert.match(client,/元の期限や状態は変更していません/);
});

test('native plan storage verifies previous-content backup before replacement, restores on write failure',()=>{
 assert.match(script,/const backup=path\+'\.previous'/);
 assert.match(script,/backup verification failed/);
 assert.match(script,/restore verification failed/);
 assert.match(script,/if\(fm\.readString\(path\)!==after\)throw Error\('readback failed'\)/);
 assert.match(script,/if\(!validPlan\(changed\)\|\|current!==expected\)throw Error/);
});
