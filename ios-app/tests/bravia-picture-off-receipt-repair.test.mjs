import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const runtime=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS BRAVIA 消画安全復旧.js',import.meta.url),'utf8');
const oldCode=fs.readFileSync(new URL('fixtures/bravia-picture-off-legacy-cfae0db7.js',import.meta.url),'utf8');
const newCode=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS BRAVIA Picture Off.js',import.meta.url),'utf8');
const oldHash='402901e68dc2e21b6206dc0702d6d7cfdff0865b33fd0a49e589377140a6d2ce';
const newHash='a3fd9ef9193eb856ae3242626ae830d9020d8b4b2c2263cdc59d99fb8dc44a8d';
const name='YOS BRAVIA Picture Off';
const receiptFile='/icloud/YOS Common Installer Data/'+encodeURIComponent(name)+'.receipt.json';
const oldReceipt=JSON.stringify({
 schema:1,name,id:'bravia-picture-off',path:'ios-app/scriptable/remote-widgets/YOS BRAVIA Picture Off.js',
 sha256:oldHash,storage:'iCloud',commit:'cfae0db7be4e5d560242520ee9c99b04a8a08fd5'
});
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');

function fileSystem(root){
 const files=new Map(),dirs=new Set([root]),writes=[],deletes=[];
 return {
  files,dirs,writes,deletes,
  documentsDirectory:()=>root,
  joinPath:(x,y)=>x+'/'+y,
  fileExists:p=>files.has(p)||dirs.has(p),
  readString:p=>{if(!files.has(p))throw Error('missing: '+p);return files.get(p);},
  writeString:(p,v)=>{writes.push([p,v]);files.set(p,v);},
  createDirectory:p=>dirs.add(p),
  remove:p=>{deletes.push(p);files.delete(p);},
  isFileStoredIniCloud:()=>false
 };
}
function seedOld(cloud,code=oldCode,receipt=oldReceipt){
 cloud.files.set('/icloud/'+name+'.js',code);
 if(receipt!==null)cloud.files.set(receiptFile,receipt);
 cloud.files.set('/icloud/YOS Common Installer.js','USER PRIVATE CANONICAL');
 cloud.files.set('/icloud/Untitled Script 9.js','ORIGINAL FOUR DEVICE REMOTE');
 cloud.files.set('/icloud/YOS Home Scenes.js','HOME SCENES');
 return cloud;
}
async function execute({code=oldCode,receipt=oldReceipt,header=false,consent=true,duplicate=false,
 missing=false,crossReceipt=false,installerPending=false,networkError=false,apiError=false,
 failReceiptWrite=false,mutateDuringPrompt=false,repairPending=false}={}){
 const cloud=fileSystem('/icloud'),local=fileSystem('/local'),alerts=[],calls=[],opens=[],completed=[];
 const generated='// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit.\n// icon-color: purple; icon-glyph: shield-check;\n';
 seedOld(cloud,header?generated+code:code,receipt);
 if(missing)cloud.files.delete('/icloud/'+name+'.js');
 if(duplicate)local.files.set('/local/'+name+'.js','SECOND SOURCE');
 if(crossReceipt)local.files.set('/local/YOS Common Installer Data/'+encodeURIComponent(name)+'.receipt.json','cross');
 if(installerPending)cloud.files.set('/icloud/YOS Common Installer Data/'+encodeURIComponent(name)+'.pending.json','{}');
 if(repairPending)cloud.files.set('/icloud/YOS Common Installer Data/picture-off-repair.pending.json','{}');
 const FileManager={iCloud:()=>cloud,local:()=>local};
 class Request{
  constructor(url){this.url=url;this.response={statusCode:200};}
  async loadString(){calls.push(this.url);if(networkError){this.response.statusCode=503;return 'offline';}return newCode;}
  async loadJSON(){
    calls.push(this.url);
    if(apiError){this.response.statusCode=503;return {};}
    return {encoding:'base64',content:Buffer.from(newCode,'utf8').toString('base64'),size:Buffer.byteLength(newCode)};
  }
 }
 class Alert{
  addAction(a){this.action=a;}
  addCancelAction(a){this.cancel=a;}
  async presentAlert(){
    alerts.push({title:this.title,message:this.message,action:this.action});
    if(this.action==='バックアップして消画のみ更新'&&mutateDuringPrompt)
      cloud.files.set('/icloud/'+name+'.js','CONCURRENT EXTERNAL CHANGE');
    if(this.action==='バックアップして消画のみ更新')return consent?0:-1;
    if(this.action==='消画スクリプトを開く')return 0;
    return 0;
  }
 }
 const prev=cloud.writeString;
 if(failReceiptWrite){
   let injected=false;
   cloud.writeString=(p,v)=>{
     if(p===receiptFile&&v.includes(newHash)&&!injected){injected=true;throw Error('synthetic receipt failure');}
     prev(p,v);
   };
 }
 const sandbox={FileManager,Request,Alert,Data:{fromBase64String:v=>({toRawString:()=>Buffer.from(v,'base64').toString('utf8')})},
 Safari:{open:x=>opens.push(x)},Script:{complete:()=>completed.push(true)},console};
 await new vm.Script('(async()=>{\n'+runtime+'\n})()').runInNewContext(sandbox,{timeout:8000});
 return {cloud,local,alerts,calls,opens,completed};
}
test('immutable old, new, recovery and 27 original catalog pins',()=>{
 assert.equal(sha(oldCode),oldHash);
 assert.equal(sha(newCode),newHash);
 const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
 assert.equal(catalog.targets.length,28);
 assert.equal(new Set(catalog.targets.map(x=>x.id)).size,28);
 const item=catalog.targets.find(x=>x.id==='bravia-picture-off-repair');
 assert.equal(item.name,'YOS BRAVIA 消画安全復旧');
 assert.equal(item.commit,'1cad5e42fff8722dafbcdceaeaa171cbe2ae0297');
 assert.equal(item.sha256,sha(runtime));
 assert.equal(item.path,'ios-app/scriptable/remote-widgets/YOS BRAVIA 消画安全復旧.js');
 assert.ok(catalog.targets.find(x=>x.id==='common-installer-repair'));
 assert.equal(catalog.targets.find(x=>x.id==='bravia-picture-off').sha256,newHash);
});
test('verified old and old matching receipt -> only Picture Off code + receipt updated after consent',async()=>{
 const r=await execute();
 assert.equal(r.cloud.files.get('/icloud/'+name+'.js'),newCode);
 const rec=JSON.parse(r.cloud.files.get(receiptFile));
 assert.equal(rec.sha256,newHash);assert.equal(rec.id,'bravia-picture-off');
 assert.equal(r.cloud.files.get('/icloud/YOS Common Installer.js'),'USER PRIVATE CANONICAL');
 assert.equal(r.cloud.files.get('/icloud/Untitled Script 9.js'),'ORIGINAL FOUR DEVICE REMOTE');
 assert.equal(r.cloud.files.get('/icloud/YOS Home Scenes.js'),'HOME SCENES');
 assert.equal(r.local.writes.length,0);
 const backups=[...r.cloud.files.entries()].filter(([p])=>p.includes('/picture-off-repair-backups/'));
 assert.equal(backups.length,2);
 assert.ok(backups.some(([p,v])=>p.endsWith('.js')&&v===oldCode));
 assert.ok(backups.some(([p,v])=>p.endsWith('.receipt.json')&&v===oldReceipt));
 assert.equal(r.cloud.files.has('/icloud/YOS Common Installer Data/picture-off-repair.pending.json'),false);
 assert.match(r.alerts.at(-1).message,/実際に消えるかはまだ未確認/);
 assert.equal(r.completed.length,1);
});
test('Scriptable generated icon metadata is tolerated only when stripping it yields exact old GitHub bytes',async()=>{
 const r=await execute({header:true});
 assert.equal(r.cloud.files.get('/icloud/'+name+'.js'),newCode);
 const saved=[...r.cloud.files.values()].find(s=>typeof s==='string'&&s.includes('These must be at the very top'));
 assert.match(saved,/icon-color: purple/);
});
test('user cancellation leaves all source, receipt and directory state untouched',async()=>{
 const r=await execute({consent:false});
 assert.equal(r.cloud.files.get('/icloud/'+name+'.js'),oldCode);
 assert.equal(r.cloud.files.get(receiptFile),oldReceipt);
 assert.equal(r.cloud.writes.length,0);
 assert.equal(r.cloud.dirs.size,1);
});
test('unknown edited Picture Off is never overwritten',async()=>{
 const r=await execute({code:oldCode+'\nUSER EDIT'});
 assert.equal(r.cloud.files.get('/icloud/'+name+'.js'),oldCode+'\nUSER EDIT');
 assert.equal(r.cloud.writes.length,0);
 assert.equal(r.calls.length,0);
 assert.match(r.alerts.at(-1).title,/既存の消画コードを保護/);
});
test('modified receipt SHA does not acquire authority from an old code match',async()=>{
 const fake=JSON.stringify({...JSON.parse(oldReceipt),sha256:'f'.repeat(64)});
 const r=await execute({receipt:fake});
 assert.equal(r.cloud.writes.length,0);
 assert.equal(r.calls.length,0);
 assert.match(r.alerts.at(-1).title,/受領証が不明/);
});
test('receipt owner, ID, storage and path must match exactly',async()=>{
 for(const prop of [{name:'OTHER'},{storage:'local'},{id:'other'},{path:'bad'}]){
  const r=await execute({receipt:JSON.stringify({...JSON.parse(oldReceipt),...prop})});
  assert.equal(r.cloud.writes.length,0);
 }
});
test('missing script or receipt, duplicate script or orphan receipt all fail closed',async()=>{
 for(const option of [{missing:true},{receipt:null},{duplicate:true},{crossReceipt:true}]){
  const r=await execute(option);assert.equal(r.cloud.writes.length,0);
 }
});
test('existing common installer pending marker blocks the recovery',async()=>{
 const r=await execute({installerPending:true});
 assert.equal(r.cloud.writes.length,0);assert.equal(r.calls.length,0);
});
test('unexpected repair journal is never silently removed',async()=>{
 const r=await execute({repairPending:true});
 assert.equal(r.cloud.writes.length,0);
 assert.equal(r.cloud.files.get('/icloud/YOS Common Installer Data/picture-off-repair.pending.json'),'{}');
 assert.match(r.alerts.at(-1).title,/未完了/);
});
test('two-route GitHub failure does not create backup or change local scripts',async()=>{
 const r=await execute({networkError:true,apiError:true});
 assert.equal(r.calls.length,2);
 assert.equal(r.cloud.writes.length,0);
 assert.equal(r.cloud.files.get('/icloud/'+name+'.js'),oldCode);
});
test('RAW GitHub failure falls back only to hash-verified GitHub API',async()=>{
 const r=await execute({networkError:true});
 assert.equal(r.calls.length,2);
 assert.equal(r.cloud.files.get('/icloud/'+name+'.js'),newCode);
});
test('concurrent edit during confirmation never loses the new edit',async()=>{
 const r=await execute({mutateDuringPrompt:true});
 assert.equal(r.cloud.files.get('/icloud/'+name+'.js'),'CONCURRENT EXTERNAL CHANGE');
 assert.equal(r.cloud.writes.length,0);
 assert.match(r.alerts.at(-1).title,/未完了/);
});
test('receipt write error restores original and leaves verified backup',async()=>{
 const r=await execute({failReceiptWrite:true});
 assert.equal(r.cloud.files.get('/icloud/'+name+'.js'),oldCode);
 assert.equal(r.cloud.files.get(receiptFile),oldReceipt);
 assert.equal(r.cloud.files.has('/icloud/YOS Common Installer Data/picture-off-repair.pending.json'),false);
 const bk=[...r.cloud.files.entries()].filter(([p])=>p.includes('/picture-off-repair-backups/'));
 assert.equal(bk.length,2);
 assert.match(r.alerts.at(-1).title,/未完了/);
});
test('one-time recovery has no TV command, power command, Keychain usage or arbitrary deletion',()=>{
 assert.doesNotMatch(runtime,/Keychain\.|X_SendIRCC|setPowerStatus|\/sony\/ircc/);
 assert.doesNotMatch(runtime,/FileManager\.remove|fm\.remove\(p\.target\)|fm\.remove\(p\.receipt\)/);
 assert.match(runtime,/YOS BRAVIA 消画安全復旧/);
});
