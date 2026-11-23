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
 return {id:ids[kind],parent:{data_source_id:sources[kind]},last_edited_time:'2026-11-23T14:00:00.000Z',
  properties:shopping?{
   '商品名':{title:[{plain_text:'確認商品'}]},'購入済':{checkbox:false},
   '買い物状態':{select:{name:'購入候補'}},'区分':{select:{name:'欲しいもの'}}
  }:{
   'やること':{title:[{plain_text:'確認タスク'}]},'状態':{select:{name:'次にやる'}},
   '種類':{select:{name:'Task'}}
  }};
}
async function harness(errors={}){
 const records={ [ids.task]:row('task'), [ids.shopping]:row('shopping')};
 let writes=0;
 class RequestMock{
  constructor(url){this.url=url;this.response={statusCode:200};this.method='GET'}
  async loadJSON(){
   const p=this.url.split('/v1/')[1];
   if(p.startsWith('data_sources/')){
    const kind=p.includes(sources.task)?'task':'shopping';
    if(errors[kind]){this.response.statusCode=errors[kind].status||400;return {code:errors[kind].code||'validation_error',message:errors[kind].message||'invalid query'};}
    return {results:[records[ids[kind]]],has_more:false,next_cursor:null};
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
 const app=await new AsyncFunction('Keychain','Request',testSource)(
  {contains:()=>true,get:()=>'mock-only-token-not-a-secret'},RequestMock);
 return {app,records,get writes(){return writes}};
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
