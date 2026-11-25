import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const read=n=>fs.readFileSync(new URL('../scriptable/'+n,import.meta.url),'utf8');
const old=read('YOS Common Installer.js'),src=read('YOS Common Installer 2.js');
const primary=JSON.parse(read('yos-common-installer-catalog.json')),secondary=JSON.parse(read('yos-common-installer-2-catalog.json'));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const payload='// Variables used by Scriptable.\n// YOS_SCRIPT_NAME: Test New App\nScript.complete()\n';
const entry={id:'test-new-app',name:'Test New App',path:'ios-app/scriptable/Test New App.js',commit:'a'.repeat(40),sha256:hash(payload)};
function store(root){const files=new Map(),dirs=new Set([root]);return {files,dirs,documentsDirectory:()=>root,joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p)||dirs.has(p),createDirectory:p=>dirs.add(p),readString:p=>files.get(p),writeString:(p,v)=>files.set(p,v),remove:p=>files.delete(p),isFileStoredIniCloud:()=>false};}
async function run({targets=[],selected='',initial='',bad=false,duplicate=false,offline=false,previous=null,failReceipt=false}={}){
 const cloud=store('/cloud'),local=store('/local'),alerts=[],requests=[],opens=[];
 const target='/cloud/Test New App.js',receipt='/cloud/YOS Common Installer Data/Test%20New%20App.receipt.json';
 if(initial)cloud.files.set(target,initial);
 if(previous)cloud.files.set(receipt,JSON.stringify(previous));
 if(duplicate)local.files.set('/local/Test New App.js','protected local copy');
 if(failReceipt){const write=cloud.writeString;cloud.writeString=(p,v)=>{if(p===receipt)throw Error('test write failure');write(p,v)}}
 class Request{constructor(url){this.url=url;this.response={statusCode:200}}async loadString(){requests.push(this.url);if(this.url.endsWith('/yos-common-installer-catalog.json')){if(offline)throw Error('offline');return JSON.stringify(primary)}if(this.url.endsWith('/yos-common-installer-2-catalog.json'))return JSON.stringify({...secondary,targets});return bad?'different content':payload}async loadJSON(){this.response.statusCode=503;return {}}}
 class Alert{addAction(){}addCancelAction(){}async presentAlert(){alerts.push(this.title+' '+this.message);return 0}}
 await new vm.Script('(async()=>{\n'+src+'\n})()').runInNewContext({Request,Alert,FileManager:{iCloud:()=>cloud,local:()=>local},Safari:{open:x=>opens.push(x)},Script:{complete(){}},args:{shortcutParameter:selected},console},{timeout:5000});
 return {cloud,local,alerts,requests,opens,target,receipt};
}
test('catalogs are disjoint and each stays within the legacy capacity',()=>{assert.equal(primary.targets.length,30);assert.ok(secondary.targets.length<=30);assert.equal(secondary.repository,primary.repository);for(const field of ['id','name','path']){const all=[...primary.targets,...secondary.targets].map(x=>x[field]);assert.equal(new Set(all).size,all.length);}});
test('same guarded installation engine and same receipts path',()=>{const start='async function install(entry){',end='\ntry{\n  const targets=';assert.equal(src.slice(src.indexOf(start),src.indexOf('\ntry{\n  const primaryData=')),old.slice(old.indexOf(start),old.indexOf(end)));assert.match(src,/const DATA_DIR='YOS Common Installer Data'/);});
test('empty list gives honest status',async()=>{const r=await run();assert.match(r.alerts.join(),/まだ登録されていません/);assert.equal(r.cloud.files.size,0);});
for(const field of ['id','name','path'])test('duplicate '+field+' across catalogs stops before code download',async()=>{const r=await run({targets:[{...entry,[field]:primary.targets[0][field]}]});assert.equal(r.requests.length,2);assert.equal(r.cloud.files.size,0);assert.match(r.alerts.join(),/重複/);});
test('installer self name protected',async()=>{const r=await run({targets:[{...entry,name:'YOS Common Installer'}]});assert.equal(r.cloud.files.size,0);assert.match(r.alerts.join(),/重複/);});
test('old catalog unavailable fails closed',async()=>{const r=await run({targets:[entry],selected:entry.id,offline:true});assert.equal(r.cloud.files.size,0);assert.match(r.alerts.join(),/未完了/);});
test('first install verifies code, writes receipt and does not execute installed code',async()=>{const r=await run({targets:[entry],selected:entry.id});assert.equal(r.cloud.files.get(r.target),payload);assert.equal(JSON.parse(r.cloud.files.get(r.receipt)).sha256,entry.sha256);assert.match(r.alerts.join(),/登録完了/);});
test('wrong code hash fails closed',async()=>{const r=await run({targets:[entry],selected:entry.id,bad:true});assert.equal(r.cloud.files.size,0);assert.match(r.alerts.join(),/不一致/);});
test('unmanaged different file remains untouched',async()=>{const r=await run({targets:[entry],selected:entry.id,initial:'PRIVATE'});assert.equal(r.cloud.files.get(r.target),'PRIVATE');assert.equal(r.cloud.files.size,1);});
test('duplicate iCloud and local copies remain untouched',async()=>{const r=await run({targets:[entry],selected:entry.id,initial:'PRIVATE',duplicate:true});assert.equal(r.cloud.files.get(r.target),'PRIVATE');assert.equal(r.local.files.get('/local/Test New App.js'),'protected local copy');});
test('write failure removes new script and preserves existing files',async()=>{const r=await run({targets:[entry],selected:entry.id,failReceipt:true});assert.equal(r.cloud.files.has(r.target),false);assert.equal(r.cloud.files.has(r.receipt),false);assert.match(r.alerts.join(),/復元/);});
