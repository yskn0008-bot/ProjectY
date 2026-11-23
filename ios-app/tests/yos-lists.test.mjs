import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const SCRIPT=new URL('../scriptable/YOS Lists.js',import.meta.url);
const CATALOG=new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url);
const source=readFileSync(SCRIPT,'utf8');
const marker="try{await main()}catch(e){await showError(e)}finally{Script.complete()}";
assert.ok(source.includes(marker),'only remove the Scriptable launch statement for tests');
const testSource=source.slice(0,source.indexOf(marker))+
  '\nreturn {readAll,perform,htmlWithData};';
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;

const sources={
 task:'965c6086-32c1-463d-93b4-87a9cb69b3ad',
 shopping:'d0ed2cf0-c84e-4770-b77c-3a1a9e11bcfc'
};
const ids={task:'a'.repeat(32),shopping:'b'.repeat(32)};
function row(kind){
 const shopping=kind==='shopping';
 return {created_time:'2026-11-23T13:00:00.000Z',id:ids[kind],parent:{data_source_id:sources[kind]},last_edited_time:'2026-11-23T14:00:00.000Z',
  properties:shopping?{
   '商品名':{title:[{plain_text:'確認商品'}]},'購入済':{checkbox:false},
   '買い物状態':{select:{name:'購入候補'}},'区分':{select:{name:'欲しいもの'}}
  }:{
   'やること':{title:[{plain_text:'確認タスク'}]},'状態':{select:{name:'次にやる'}},
   '種類':{select:{name:'Task'}}
  }};
}
async function harness(errors={},extras=[]){
 const records={ [ids.task]:row('task'), [ids.shopping]:row('shopping')};
 for(const row of extras)records[row.id]=row;
 let writes=0,queries=0,cursorAttempts=0;
 class RequestMock{
  constructor(url){this.url=url;this.response={statusCode:200};this.method='GET'}
  async loadJSON(){
   const p=this.url.split('/v1/')[1];
   if(p.startsWith('data_sources/')){
    const kind=p.includes(sources.task)?'task':'shopping';
    queries++;
    if(errors[kind]){this.response.statusCode=errors[kind].status||400;return {code:errors[kind].code||'validation_error',message:errors[kind].message||'invalid query'};}
    const q=JSON.parse(this.body);
    if(q.start_cursor){cursorAttempts++;this.response.statusCode=400;return {code:'validation_error',message:'The start_cursor provided is invalid: s:opaque'};}
    let rows=Object.values(records).filter(r=>r.parent?.data_source_id===sources[kind]);
    if(q.filter){
     assert.equal(q.filter.and?.length,2,'time partitions use a bounded AND');
     assert.equal(q.filter.and[0].timestamp,'created_time');
     assert.equal(q.filter.and[1].timestamp,'created_time');
     const start=q.filter.and[0].created_time.on_or_after;
     const end=q.filter.and[1].created_time.before;
     rows=rows.filter(r=>r.created_time>=start&&r.created_time<end);
    }
    const returned=rows.slice(0,q.page_size||100);
    return {results:returned,has_more:rows.length>returned.length,
      next_cursor:rows.length>returned.length?'s:server-invalid-cursor':null};
   }
   const id=p.split('/')[1];
   if(!records[id])throw Error('Unknown test ID');
   if(this.method==='PATCH'){
    writes++;
    Object.assign(records[id].properties,JSON.parse(this.body).properties);
    records[id].last_edited_time='2026-11-23T14:01:00.000Z';
   }
   return JSON.parse(JSON.stringify(records[id]));
  }
 }
 let sleeps=0;
 const TimerMock={schedule(_seconds,repeats,callback){assert.equal(repeats,false);sleeps++;callback();}};
 const app=await new AsyncFunction('Keychain','Request','Timer',testSource)(
  {contains:()=>true,get:()=>'mock-only-token-not-a-secret'},RequestMock,TimerMock);
 return {app,records,get writes(){return writes},get queries(){return queries},
   get cursorAttempts(){return cursorAttempts},get sleeps(){return sleeps}};
}
test('both Notion data sources load and token never enters HTML',async()=>{
 const h=await harness();
 const rows=await h.app.readAll();
 assert.equal(rows.tasks.length,1);
 assert.equal(rows.shopping.length,1);
 const page=h.app.htmlWithData(rows);
 assert.match(page,/確認タスク/);
 assert.doesNotMatch(page,/mock-only-token-not-a-secret/);
 const body=page.split('<script>')[1].split('</script>')[0];
 assert.doesNotThrow(()=>new Function(body));
});
test('task completion and shopping purchase require Notion readback',async()=>{
 const h=await harness();
 const snap=await h.app.readAll();
 const result1=await h.app.perform({action:'complete',kind:'task',id:ids.task,expected:snap.tasks[0].updatedAt});
 const result2=await h.app.perform({action:'purchase',kind:'shopping',id:ids.shopping,expected:snap.shopping[0].updatedAt});
 assert.equal(result1.item.state,'完了');
 assert.equal(result2.item.purchased,true);
 assert.equal(h.writes,2);
});
test('stale writes and crossed database IDs fail closed',async()=>{
 const h=await harness();
 const snap=await h.app.readAll();
 await h.app.perform({action:'complete',kind:'task',id:ids.task,expected:snap.tasks[0].updatedAt});
 await assert.rejects(()=>h.app.perform({action:'complete',kind:'task',id:ids.task,expected:snap.tasks[0].updatedAt}),/更新/);
 await assert.rejects(()=>h.app.perform({action:'purchase',kind:'shopping',id:ids.task,expected:snap.tasks[0].updatedAt}),/対象|確認/);
 assert.equal(h.writes,1);
});
test('installer pins exact source and preserves existing target',()=>{
 const manifest=JSON.parse(readFileSync(CATALOG,'utf8'));
 const entry=manifest.targets.find(x=>x.id==='yos-lists');
 assert.ok(entry);
 assert.equal(entry.name,'YOS Lists');
 assert.equal(entry.path,'ios-app/scriptable/YOS Lists.js');
 assert.match(entry.commit,/^[a-f0-9]{40}$/);
 assert.equal(entry.sha256,createHash('sha256').update(source,'utf8').digest('hex'));
 assert.ok(manifest.targets.find(x=>x.id==='shopping'&&x.name==='YOS Shopping'));
});

test('Tasks HTTP 400 is attributed to Tasks and Shopping still opens',async()=>{
 const h=await harness({task:{status:400,code:'validation_error',message:'body.page_size is not accepted'}});
 const result=await h.app.readAll();
 assert.equal(result.loaded.task,false);
 assert.equal(result.loaded.shopping,true);
 assert.equal(result.tasks.length,0);
 assert.equal(result.shopping.length,1);
 assert.match(result.errors.task,/YOS Tasks/);
 assert.match(result.errors.task,/HTTP 400/);
 assert.match(result.errors.task,/validation_error/);
 assert.match(result.errors.task,/page_size/);
 assert.ok(h.app.htmlWithData(result).includes('body.page_size'));
 assert.equal(h.writes,0);
});
test('both Notion sources failing still produce a diagnostic UI without writes',async()=>{
 const h=await harness({
  task:{status:400,code:'invalid_request',message:'task query invalid'},
  shopping:{status:403,code:'restricted_resource',message:'shopping not shared'}
 });
 const data=await h.app.readAll();
 assert.deepEqual(data.loaded,{task:false,shopping:false});
 assert.match(data.errors.task,/400/);
 assert.match(data.errors.shopping,/403/);
 assert.doesNotThrow(()=>new Function(h.app.htmlWithData(data).split('<script>')[1].split('</script>')[0]));
 assert.equal(h.writes,0);
});

test('285 Tasks in many days load in full without any start_cursor despite invalid server cursors',async()=>{
 const extras=[];
 for(let i=1;i<285;i++){
  const item=row('task');
  item.id=(1000+i).toString(16).padStart(32,'0');
  item.created_time=new Date(Date.UTC(2026,8,1)+Math.floor(i/36)*86400000+(i%36)*60000).toISOString();
  item.properties['やること']={title:[{plain_text:'タスク '+i}]};
  extras.push(item);
 }
 const base=await harness({},extras);
 const data=await base.app.readAll();
 assert.equal(data.loaded.task,true);
 assert.equal(data.loaded.shopping,true);
 assert.equal(data.tasks.length,285,'never return only the first 100 Tasks');
 assert.equal(new Set(data.tasks.map(x=>x.id)).size,285,'no overlapping date windows');
 assert.equal(base.cursorAttempts,0,'never submit Notion invalid cursor');
 assert.ok(base.queries>3&&base.queries<35,'partitioned dataset is queried across disjoint windows');
 assert.ok(base.sleeps>0,'reads are paced for Notion integration limits');
 assert.equal(base.writes,0,'read-only operations');
});
test('large same-timestamp Task batches fail closed instead of silently truncating',async()=>{
 const extras=[];
 for(let i=1;i<140;i++){
  const item=row('task');
  item.id=(2000+i).toString(16).padStart(32,'0');
  item.created_time='2026-11-23T13:00:00.000Z';
  extras.push(item);
 }
 const h=await harness({},extras);
 const data=await h.app.readAll();
 assert.equal(data.loaded.task,false);
 assert.equal(data.loaded.shopping,true);
 assert.equal(data.tasks.length,0,'partial results are never presented as complete');
 assert.match(data.errors.task,/全件|上限|分割|表示/);
 assert.equal(h.cursorAttempts,0);
 assert.equal(h.writes,0);
});

test('read-only 429 retries are bounded and never update a Task',async()=>{
 const h=await harness({task:{status:429,code:'rate_limited',message:'try later'}});
 const data=await h.app.readAll();
 assert.equal(data.loaded.task,false);
 assert.equal(data.loaded.shopping,true);
 assert.match(data.errors.task,/HTTP 429/);
 assert.equal(h.cursorAttempts,0);
 assert.equal(h.writes,0);
 assert.equal(h.sleeps,2);
});


test('selected A YOS Lists UI keeps accessible contrast, touch targets and existing actions',()=>{
 const css=source.slice(source.indexOf('<style>'),source.indexOf('</style>')+8);
 const ratio=(fg,bg)=>{
  const l=h=>{const v=h.slice(1).match(/../g).map(x=>parseInt(x,16)/255)
   .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
   return .2126*v[0]+.7152*v[1]+.0722*v[2];};
  const a=l(fg),b=l(bg);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 };
 for(const [role,fg,bg] of [
  ['body','#294054','#F3F4F2'],
  ['header','#294054','#E6ECF0'],
  ['header subtitle','#53697D','#E6ECF0'],
  ['selected tab','#FFFFFF','#526F89'],
  ['task number','#294054','#A9C6D9'],
  ['shopping number','#294054','#AACAB9'],
  ['attention number','#294054','#DCC4A6'],
  ['task caption','#395268','#A9C6D9'],
  ['shopping caption','#395268','#AACAB9'],
  ['attention caption','#395268','#DCC4A6'],
  ['action','#526F89','#E7F0F4'],
  ['task details','#5E7183','#FFFFFF'],
  ['search placeholder','#526779','#FFFFFF'],
  ['P0 tag','#A63C34','#FFE8E4'],
  ['P1 tag','#91601C','#FFF0D8']
 ]) assert.ok(ratio(fg,bg)>=4.5,role+' text needs contrast ratio >= 4.5');
 assert.match(css,/header\{\s*background:#E6ECF0;color:var\(--ink\)/);
 assert.match(css,/\.tabs\{[^}]*background:var\(--tab-bg\)/);
 assert.match(css,/\.tab\[aria-selected=true\]\{background:var\(--accent\);color:#FFFFFF/);
 assert.match(css,/\.stat:nth-child\(2\)\{background:var\(--stat-shopping\)/);
 assert.match(css,/\.stat:nth-child\(3\)\{background:var\(--stat-attention\)/);
 assert.match(css,/\.action\{[^}]*min-height:44px/);
 assert.match(css,/\.refresh\{[^}]*min-height:44px/);
 assert.match(css,/\.tools input\{[^}]*min-height:48px/);
 assert.match(css,/button:focus-visible,input:focus-visible/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.doesNotMatch(css,/border-left:4px/);
 assert.doesNotMatch(source,/const emphasis=/);
 assert.match(source,/id="search" type="search"/);
 assert.match(source,/classList\.toggle\('is-ready'/);
 assert.match(source,/'P1'\?' high'/);
});

test('compact row layout keeps high-value fields and an independent 44px completion action',async()=>{
 const css=source.slice(source.indexOf('<style>'),source.indexOf('</style>')+8);
 assert.match(css,/\.list\{[^}]*gap:6px/);
 assert.match(css,/\.item\{[^}]*padding:7px 10px/);
 assert.match(css,/\.item-name\{[^}]*-webkit-line-clamp:2/);
 assert.match(css,/\.item-details\[open\] \.item-name\{[^}]*-webkit-line-clamp:unset/);
 assert.match(css,/\.action\{[^}]*min-height:44px/);
 assert.match(css,/\.tag\{[^}]*padding:2px 5px/);
 assert.doesNotMatch(css,/\.item\{[^}]*padding:16px 14px/);
 assert.match(source,/<details class="item-details"><summary aria-label=/);
 assert.match(source,/<\/details><\/div>'\+action\+'<\/article>/);
 assert.match(source,/tags\.map\(t=>/);
 const h=await harness();
 const data=await h.app.readAll();
 const html=h.app.htmlWithData(data);
 assert.match(html,/class="item-details"/);
 assert.doesNotMatch(html,/mock-only-token-not-a-secret/);
 assert.doesNotThrow(()=>new Function(html.split('<script>')[1].split('</script>')[0]));
 assert.equal(h.writes,0,'compact display does not mutate Notion');
});

test('tap-to-complete row uses full width, preserves details control and purchase button',async()=>{
 const css=source.slice(source.indexOf('<style>'),source.indexOf('</style>')+8);
 assert.match(css,/\.item--task\{display:block;position:relative/);
 assert.match(css,/\.item-complete\{[^}]*width:100%;min-height:44px/);
 assert.match(css,/\.item--task \.item-details summary\{[^}]*min-height:44px/);
 assert.match(css,/#undo\{[^}]*min-height:44px/);
 assert.match(source,/<button type="button" class="item-complete" data-action="complete"/);
 assert.match(source,/e\.target\.closest\('\.item-details'\)/,'detail chevron never completes');
 assert.match(source,/class="item-details"><summary aria-label="詳細を表示/);
 assert.doesNotMatch(source,/<button class="action" data-action="complete"/,'old separate task completion button is removed');
 assert.match(source,/<button class="action" data-action="purchase"/,'Shopping purchase UI preserved');
 const h=await harness();
 const html=h.app.htmlWithData(await h.app.readAll());
 assert.match(html,/id="undo"/);
 assert.doesNotThrow(()=>new Function(html.split('<script>')[1].split('</script>')[0]));
 assert.equal(h.writes,0);
});
test('single tap completion is readback-verified and undo restores original Task state',async()=>{
 const h=await harness();
 const data=await h.app.readAll();
 const initial=data.tasks[0];
 const completed=await h.app.perform({action:'complete',kind:'task',id:initial.id,expected:initial.updatedAt});
 assert.equal(completed.item.state,'完了');
 assert.equal(completed.canUndo,true);
 assert.equal(h.writes,1);
 const restored=await h.app.perform({action:'undo-complete',kind:'task',id:completed.item.id,expected:completed.item.updatedAt});
 assert.equal(restored.item.state,'次にやる');
 assert.equal(h.writes,2);
 await assert.rejects(()=>h.app.perform({action:'undo-complete',kind:'task',id:completed.item.id,expected:completed.item.updatedAt}),/元に戻せる/);
 assert.equal(h.writes,2);
});
test('undo rejects forged target and changed Notion state without a PATCH',async()=>{
 const h=await harness();
 const task=(await h.app.readAll()).tasks[0];
 const done=await h.app.perform({action:'complete',kind:'task',id:task.id,expected:task.updatedAt});
 await assert.rejects(()=>h.app.perform({action:'undo-complete',kind:'task',id:ids.shopping,expected:done.item.updatedAt}),/元に戻せる/);
 h.records[ids.task].last_edited_time='2026-11-23T14:02:00.000Z';
 await assert.rejects(()=>h.app.perform({action:'undo-complete',kind:'task',id:task.id,expected:done.item.updatedAt}),/他の画面/);
 assert.equal(h.writes,1);
});
test('priority/overdue/date order is deterministic and drag-and-drop is not pretended',()=>{
 assert.match(source,/const overdue=x=>x\.due&&x\.due\.slice\(0,10\)</);
 assert.match(source,/const order=\(a,b\)=>Number\(overdue\(b\)\)-Number\(overdue\(a\)\)/);
 assert.match(source,/items\.sort\(\(a,b\)=>a\.kind==='task'&&b\.kind==='task'\?order\(a,b\)/);
 assert.doesNotMatch(source,/draggable="true"|data-drag-handle|dragstart/);
});
