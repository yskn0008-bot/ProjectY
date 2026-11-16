import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const code=readFileSync(new URL('./local-entries.js',import.meta.url),'utf8');
function harness(){
 const db=new Map(),id=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333'];
 const window={crypto:{randomUUID:()=>id.shift()||'44444444-4444-4444-8444-444444444444'}};
 const storage={
  getItem:key=>db.has(key)?db.get(key):null,
  setItem:(key,val)=>db.set(key,String(val)),
  removeItem:key=>db.delete(key)
 };
 runInNewContext(code,{window,Date,Set,JSON,String,Number,Uint8Array});
 return {api:window.YOS_CALENDAR_LOCAL,storage,db};
}
const entry={date:'2026-11-17',title:'電話の確認',type:'task',area:'Work',clock:''};
test('login-free local Calendar: empty state is real, not a sample record',()=>{
 const {api,storage}=harness();
 assert.equal(api.items(storage).items.length,0);
});
test('create one local task and mark complete without touching any Notion fields',()=>{
 const {api,storage}=harness();
 const saved=api.create(storage,entry);assert.equal(saved.ok,true);
 let found=api.items(storage).items[0];
 assert.equal(found.title,entry.title);assert.equal(found.sourceKind,'local');
 assert.match(found.source,/Notion未同期/);assert.equal(found.done,false);
 assert.equal(api.complete(storage,saved.entry.id).ok,true);
 found=api.items(storage).items[0];assert.equal(found.done,true);
 assert.equal(api.complete(storage,saved.entry.id).alreadyDone,true);
 assert.equal(api.read(storage).records.length,1);
});
test('task, habit and schedule save only explicit dates, titles and optional clock',()=>{
 const {api,storage}=harness();
 for(const type of ['task','habit','schedule'])assert.equal(api.create(storage,{...entry,type,clock:'12:35'}).ok,true);
 assert.equal(api.items(storage).items.filter(x=>x.clock==='12:35').length,3);
 assert.equal(api.complete(storage,api.read(storage).records[2].id).ok,false);
});
test('invalid date, unsupported kind or missing title cannot create entries',()=>{
 const {api,storage}=harness();
 for(const value of [{...entry,date:'2026-02-30'},{...entry,type:'money'},{...entry,title:''},{...entry,clock:'26:99'}])
  assert.equal(api.create(storage,value).ok,false);
 assert.equal(api.read(storage).records.length,0);
});
test('corrupt stored content fails closed and is not overwritten',()=>{
 const {api,storage,db}=harness();
 db.set(api.KEY,'{"schema":"tampered","records":[]}');
 assert.equal(api.create(storage,entry).ok,false);
 assert.equal(db.get(api.KEY),'{"schema":"tampered","records":[]}');
});
test('delete only explicit local record after caller approval',()=>{
 const {api,storage}=harness();
 const first=api.create(storage,entry).entry.id;
 const next=api.create(storage,{...entry,title:'別件'}).entry.id;
 assert.equal(api.remove(storage,first).ok,true);
 assert.equal(api.read(storage).records.length,1);
 assert.equal(api.read(storage).records[0].id,next);
});
test('readback failure restores original content, including prior valid entries',()=>{
 const {api,storage,db}=harness();
 api.create(storage,entry);
 const before=db.get(api.KEY);let failNext=true;
 const flaky={...storage,setItem:(key,val)=>{
  if(key===api.KEY&&failNext){failNext=false;throw Error('quota')}
  return storage.setItem(key,val);
 }};
 assert.equal(api.create(flaky,{...entry,title:'失敗する記録'}).ok,false);
 assert.equal(db.get(api.KEY),before);
});
test('module has no identity provider, API endpoint, cookies or network transport',()=>{
 assert.doesNotMatch(code,/accounts\.google\.com|PublicKeyCredential|fetch\(|XMLHttpRequest|\/api\/yos\/tasks|document\.cookie/);
});
