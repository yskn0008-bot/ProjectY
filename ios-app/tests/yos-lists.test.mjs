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


test('high-contrast YOS Lists visual system preserves readable Japanese task UI',()=>{
 const css=source.slice(source.indexOf('<style>'),source.indexOf('</style>')+8);
 const ratio=(fg,bg)=>{
  const luminance=hex=>{
   const v=hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255)
    .map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
   return .2126*v[0]+.7152*v[1]+.0722*v[2];
  };
  const a=luminance(fg),b=luminance(bg);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 };
 for(const [name,fg,bg] of [
  ['body','#18293B','#F1F4F5'],
  ['header','#FFFFFF','#536F84'],
  ['header description','#F3F8FF','#536F84'],
  ['active tab','#FFFFFF','#416785'],
  ['task count card','#223A51','#D6E5F2'],
  ['shopping count card','#223A51','#D5E9E0'],
  ['attention count card','#223A51','#F1DFC9'],
  ['task count caption','#455B6A','#D6E5F2'],
  ['shopping count caption','#455B6A','#D5E9E0'],
  ['attention count caption','#455B6A','#F1DFC9'],
  ['task title','#172A3B','#FFFEFC'],
  ['task detail','#475E77','#FFFEFC'],
  ['confirm action','#FFFFFF','#3E688B'],
  ['footer','#4A5F6F','#EFF1F1'],
  ['urgent priority','#A72A22','#FCE7E3']
 ]) assert.ok(ratio(fg,bg)>=4.5,name+' needs contrast ratio >= 4.5');
 assert.match(css,/\.tab\[aria-selected=true\]\{background:#416785;color:#FFFFFF/);
 assert.match(css,/\.action\{[^}]*min-height:44px/);
 assert.match(css,/\.refresh\{[^}]*min-height:44px/);
 assert.match(css,/\.tools input\{[^}]*min-height:48px/);
 assert.match(css,/button:focus-visible,input:focus-visible/);
 assert.match(css,/@media\(max-width:360px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:no-preference\)/);
 assert.doesNotMatch(css,/border-left:4px/);
 assert.doesNotMatch(css,/\.item\.priority-(?:zero|one)/);
 assert.doesNotMatch(source,/const emphasis=/);
 assert.match(css,/\.stat\{background:#D6E5F2;color:#223A51/);
 assert.match(css,/\.stat:nth-child\(2\)\{background:#D5E9E0/);
 assert.match(css,/\.stat:nth-child\(3\)\{background:#F1DFC9/);
 assert.match(source,/'P1'\?' high'/);
});
