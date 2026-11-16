import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('./area-task-pages.js',import.meta.url),'utf8');
function storage(){
 const values=new Map();
 return {getItem:k=>values.has(k)?values.get(k):null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}
}
const store=storage();
const sandbox={window:{localStorage:store},Date,Intl,Number,Object,String,Array,Set,JSON,Error,RegExp};
vm.runInNewContext(source,sandbox,{timeout:1000});
const api=sandbox.window.YOS_CALENDAR_AREAS;
const NOW=Date.parse('2026-11-17T07:00:00Z');
const task=(id,title,patch={})=>({id:'notion-'+id.repeat(32),title,status:'次にやる',due:'2026-11-18',...patch});
const snapshot=(items,patch={})=>({schema:'yos-daystream-source-snapshot-v1',kind:'tasks',status:'ok',
 source:'yos-auth-cache',origin:'notion',complete:true,checkedAt:'2026-11-17T06:00:00Z',items,...patch});
test('no private source means an empty page, never a fabricated 84-item task list',()=>{
 assert.equal(api.readNotion(store,NOW).status,'missing');
 assert.equal(api.readNotion(store,NOW).tasks.length,0);
});
test('Notion tasks are classified by their real titles, not the old Life bucket',()=>{
 store.setItem('YOS_DAYSTREAM_WEB_TASK_SNAPSHOT_V1',JSON.stringify(snapshot([
  task('a','90day｜眉毛の比較',{due:'' ,area:'Life'}),
  task('b','Health｜軽い柔軟',{area:'Life'}),
  task('c','返済｜金額を確認',{area:'Life'}),
  task('d','タクシー乗務前確認',{area:'Life'}),
  task('e','掃除',{area:'Life'})
 ])));
 const result=api.readNotion(store,NOW);
 assert.equal(result.status,'ready');
 assert.deepEqual(Array.from(result.tasks.map(x=>x.area)),['Self','Health','Money','Work','Life']);
 assert.equal(result.tasks[0].due,'','no due date must remain undated');
 assert.equal(result.tasks[0].url,'https://www.notion.so/'+ 'a'.repeat(32));
});
test('stale, incomplete, duplicate and malformed snapshots fail closed',()=>{
 const key='YOS_DAYSTREAM_WEB_TASK_SNAPSHOT_V1';
 for(const broken of [
  snapshot([task('a','A')],{checkedAt:'2026-11-15T06:00:00Z'}),
  snapshot([task('a','A')],{complete:false}),
  snapshot([task('a','A'),task('a','B')]),
  snapshot([{...task('a','A'),status:'unknown'}]),
  snapshot([task('a','A')],{origin:'public'})
 ]){
  store.setItem(key,JSON.stringify(broken));
  assert.notEqual(api.readNotion(store,NOW).status,'ready');
  assert.equal(api.readNotion(store,NOW).tasks.length,0);
 }
});
test('valid daily routines are only marked done when checked for the exact date',()=>{
 const local=api.readLocal(store);
 local.rows.push({id:'12345678-1234-1234-1234-123456789abc',title:'洗顔',kind:'habit',area:'Self',due:'',done:false});
 assert.equal(api.saveLocal(store,local),true);
 assert.equal(api.itemsForDay('2026-11-17').length,1);
 assert.equal(api.itemsForDay('2026-11-17')[0].done,false);
 local.checks['12345678-1234-1234-1234-123456789abc|2026-11-17']=true;
 assert.equal(api.saveLocal(store,local),true);
 assert.equal(api.itemsForDay('2026-11-17')[0].done,true);
 assert.equal(api.itemsForDay('2026-11-18')[0].done,false);
});
test('invalid local payload is never overwritten and never imported',()=>{
 const key='YOS_CALENDAR_AREA_LOCAL_V1';
 store.setItem(key,'{not-json');
 const o=api.readLocal(store);
 assert.equal(o.ok,false);
 assert.equal(api.saveLocal(store,o),false);
 assert.equal(store.getItem(key),'{not-json');
});
test('public integration contains no private extracted Notion task ID',()=>{
 assert.doesNotMatch(source,/40[a-f0-9]{30}|41[a-f0-9]{30}/);
 assert.ok(source.includes('Notion未同期'));
});
