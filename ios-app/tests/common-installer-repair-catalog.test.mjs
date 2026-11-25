import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const runtime=fs.readFileSync(new URL('../scriptable/YOS Common Installer 修復.js',import.meta.url),'utf8');
const official=fs.readFileSync(new URL('../scriptable/YOS Common Installer.js',import.meta.url),'utf8');
const legacy=fs.readFileSync(new URL('fixtures/yos-common-installer-legacy-69ca7064.js',import.meta.url),'utf8');
const name='YOS Common Installer.js';
const picture='YOS BRAVIA Picture Off.js';
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
// Existing registrations must remain present; additions are permitted only within
// the real installer's 30-target limit, with unique IDs and names.
const protectedCatalogIds=["timeline-auto","journal","daystream-preview","daystream-glass-20261111","timeline-charcoal-20261111","bravia-smart-power","remote-direct-actions","remote-power-toggle","tapo-h110-core","sleep-scene","journal-book","journal-notion-bridge","life-calendar-sync","calendar-notion","clarity-inbox-bridge","daystream-notion","ikemen-magazine","bravia-picture-check","health-automation","bravia-picture-off","remote-hub","shopping","scriptable-inventory","bravia-picture-integration","yos-lists","home-scenes","common-installer-repair","bravia-picture-off-repair"];
function assertCatalogPreserved(targets){
 assert.ok(targets.length>=protectedCatalogIds.length&&targets.length<=30);
 assert.equal(new Set(targets.map(x=>x.id)).size,targets.length);
 assert.equal(new Set(targets.map(x=>x.name)).size,targets.length);
 for(const id of protectedCatalogIds)assert.ok(targets.some(x=>x.id===id),'missing protected target: '+id);
}


function store(root,initial={}){
 const files=new Map(Object.entries(initial).map(([name,value])=>[root+'/'+name,value]));
 const dirs=new Set([root]);const writes=[];const deletions=[];
 return {
  files,dirs,writes,deletions,root,
  documentsDirectory:()=>root,
  joinPath:(a,b)=>a+'/'+b,
  fileExists:p=>files.has(p)||dirs.has(p),
  createDirectory:(p)=>{dirs.add(p);},
  readString:p=>{if(!files.has(p))throw Error('not present '+p);return files.get(p);},
  writeString:(p,v)=>{writes.push({p,v});files.set(p,v);},
  isFileStoredIniCloud:()=>false,
  downloadFileFromiCloud:async()=>{},
 };
}

async function execute({script=legacy,place='cloud',duplicate=false,missing=false,latestAlternative=false,
 pictureContent='USER-SAVED-PICTURE',cloudPictureReceipt='receipt-stays-untouched',consent=true,
 failRaw=false,failAPI=false,race=false,failWrite=false,extraHeader=false}={}){
 const cloud=store('/cloud'),local=store('/local'),alerts=[],requests=[],completes=[];
 const chosen=place==='cloud'?cloud:local;
 if(!missing)chosen.files.set(chosen.root+'/'+name,(extraHeader?
   '// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit.\n// icon-color: blue; icon-glyph: wand-magic;\n':'')+script);
 if(duplicate) (chosen===cloud?local:cloud).files.set((chosen===cloud?local:cloud).root+'/'+name,'OTHER SCRIPT');
 if(latestAlternative)cloud.files.set('/cloud/YOS Common Installer 最新版.js','alt-protected');
 cloud.files.set('/cloud/'+picture,pictureContent);
 cloud.files.set('/cloud/YOS Common Installer Data/'+encodeURIComponent('YOS BRAVIA Picture Off')+'.receipt.json',cloudPictureReceipt);
 const FileManager={iCloud:()=>cloud,local:()=>local};
 class Request{
  constructor(url){this.url=url;this.response={statusCode:200};}
  async loadString(){
    requests.push(this.url);
    if(failRaw){this.response.statusCode=503;return 'temporary network issue';}
    return official;
  }
  async loadJSON(){
    requests.push(this.url);
    if(failAPI){this.response.statusCode=503;return {};}
    return {encoding:'base64',content:Buffer.from(official,'utf8').toString('base64'),size:Buffer.byteLength(official)};
  }
 }
 class Alert{
  addAction(text){this.button=text;}
  addCancelAction(text){this.cancel=text;}
  async presentAlert(){
   alerts.push({title:this.title,message:this.message,button:this.button});
   if(this.button==='バックアップして更新'){
    if(race)local.files.set('/local/'+name,'RACE');
    return consent?0:-1;
   }
   return 0;
  }
 }
 if(failWrite){
  const original=chosen.writeString;
  chosen.writeString=(p,v)=>{
   if(p===chosen.root+'/'+name&&v===official)throw Error('synthetic incomplete write');
   return original(p,v);
  };
 }
 const Data={fromBase64String:(value)=>({toRawString:()=>Buffer.from(value,'base64').toString('utf8')})};
 const Script={complete:()=>completes.push(true)};
 const ctx={FileManager,Request,Alert,Data,Script,console};
 const code=new vm.Script('(async()=>{\n'+runtime+'\n})()');
 await code.runInNewContext(ctx,{timeout:6000});
 return {cloud,local,chosen,alerts,requests,completes};
}

test('runtime and historical fixture are immutable official SHA-256 releases',()=>{
 assert.equal(sha(official),'1fd8e27aab18c267569312689d206899ba9713eb654e7dbdd41dd2cf7b77b8d4');
 assert.equal(sha(legacy),'069c2a556fbdc5eb72ef9dfda5f545e41bb252baa45b59637a4f5d9f6d1ce547');
 assert.match(runtime,/510fa3f2f032eecc062df9d7d2033cf6057c6d04/);
});

test('unknown user-modified code fails closed, without network or local changes',async()=>{
 const r=await execute({script:'USER PRIVATE EDIT'});
 assert.equal(r.chosen.files.get('/cloud/'+name),'USER PRIVATE EDIT');
 assert.equal(r.requests.length,0);
 assert.equal(r.cloud.writes.length,0);
 assert.match(r.alerts.at(-1).title,/保護して停止/);
 assert.doesNotMatch(JSON.stringify(r.alerts),/USER PRIVATE EDIT/);
});
test('duplicate exact official names across local/iCloud fail closed',async()=>{
 const r=await execute({duplicate:true});
 assert.equal(r.requests.length,0);assert.equal(r.cloud.writes.length+r.local.writes.length,0);
 assert.match(r.alerts.at(-1).message,/2件/);
});
test('noncanonical latest installer is protected and never silently renamed or replaced',async()=>{
 const r=await execute({missing:true,latestAlternative:true});
 assert.equal(r.requests.length,0);assert.equal(r.cloud.files.get('/cloud/YOS Common Installer 最新版.js'),'alt-protected');
 assert.equal(r.cloud.writes.length,0);assert.match(r.alerts.at(-1).title,/保護/);
});
test('current official source requires no backup or overwrites',async()=>{
 const r=await execute({script:official,latestAlternative:true});
 assert.equal(r.requests.length,0);assert.equal(r.chosen.writes.length,0);
 assert.match(r.alerts.at(-1).title,/最新版/);
});
test('exact generated Scriptable icon header does not create false modified-script error',async()=>{
 const r=await execute({script:official,extraHeader:true});
 assert.equal(r.requests.length,0);assert.equal(r.chosen.writes.length,0);
 assert.match(r.alerts.at(-1).title,/最新版/);
});
test('cancel at confirmation never creates a backup directory or changes scripts',async()=>{
 const r=await execute({consent:false});
 assert.equal(r.chosen.files.get('/cloud/'+name),legacy);
 assert.equal(r.chosen.writes.length,0);assert.equal(r.chosen.dirs.size,1);
 assert.ok(r.alerts.some(x=>x.button==='バックアップして更新'));
});
test('trusted legacy upgrades ONLY canonical source, with exact backup and readback',async()=>{
 const r=await execute({latestAlternative:true});
 assert.equal(r.chosen.files.get('/cloud/'+name),official);
 assert.equal(r.chosen.files.get('/cloud/YOS Common Installer 最新版.js'),'alt-protected');
 assert.equal(r.cloud.files.get('/cloud/'+picture),'USER-SAVED-PICTURE');
 assert.equal(r.cloud.files.get('/cloud/YOS Common Installer Data/'+encodeURIComponent('YOS BRAVIA Picture Off')+'.receipt.json'),'receipt-stays-untouched');
 const b=[...r.chosen.files.entries()].filter(([p])=>p.includes('bootstrap-backups'));
 assert.equal(b.length,1);assert.equal(b[0][1],legacy);
 assert.match(r.alerts.at(-1).title,/更新完了/);
 assert.equal(r.local.writes.length,0);assert.equal(r.completes.length,1);
});
test('recognized legacy code with generated icon metadata preserves raw exact original',async()=>{
 const r=await execute({extraHeader:true,place:'local'});
 assert.equal(r.local.files.get('/local/'+name),official);
 const b=[...r.local.files.entries()].filter(([p])=>p.includes('bootstrap-backups'));
 assert.equal(b.length,1);assert.match(b[0][1],/These must be at the very top/);
 assert.equal(r.cloud.writes.length,0);
});
test('GitHub raw failure falls back to matching immutable GitHub API bytes',async()=>{
 const r=await execute({failRaw:true});
 assert.equal(r.requests.length,2);assert.equal(r.chosen.files.get('/cloud/'+name),official);
});
test('two-route network failure changes no scripts and creates no backup',async()=>{
 const r=await execute({failRaw:true,failAPI:true});
 assert.equal(r.requests.length,2);assert.equal(r.chosen.writes.length,0);
 assert.equal(r.chosen.files.get('/cloud/'+name),legacy);
 assert.match(r.alerts.at(-1).title,/未完了/);
});
test('cross-storage collision appearing after confirmation cancels before writing',async()=>{
 const r=await execute({race:true});
 assert.equal(r.chosen.files.get('/cloud/'+name),legacy);
 assert.equal(r.chosen.writes.length,0);
 assert.match(r.alerts.at(-1).title,/未完了/);
});
test('failed target write restores original, and verified backup remains',async()=>{
 const r=await execute({failWrite:true});
 assert.equal(r.chosen.files.get('/cloud/'+name),legacy);
 const backups=[...r.cloud.files.entries()].filter(([p])=>p.includes('bootstrap-backups'));
 assert.equal(backups.length,1);assert.equal(backups[0][1],legacy);
 assert.match(r.alerts.at(-1).title,/未完了/);
});
test('one-time repair is packaged for existing Scriptable installer and never runs directly on import',()=>{
 assert.match(runtime,/^\/\/ Variables used by Scriptable\.\n/);
 assert.match(runtime,/^\/\/ YOS_SCRIPT_NAME: YOS Common Installer 修復$/m);
 assert.doesNotMatch(runtime,/Keychain\.|setPowerStatus|X_SendIRCC|\.remove\(|\.move\(/);
 assert.match(runtime,/bootstrap-backups/);
 const cat=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
 const entry=cat.targets.find(x=>x.id==='common-installer-repair');
 assertCatalogPreserved(cat.targets);
 assert.ok(entry);
 assert.equal(entry.name,'YOS Common Installer 修復');
 assert.equal(entry.path,'ios-app/scriptable/YOS Common Installer 修復.js');
 assert.equal(entry.commit,'607484f37f28eba407c5493c2d90e085a40db1ad');
 assert.equal(sha(runtime),entry.sha256);
 assert.equal(sha(official),'1fd8e27aab18c267569312689d206899ba9713eb654e7dbdd41dd2cf7b77b8d4');
});
test('all existing installer catalog registrations remain present with unique identities',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
 const oldIds=['bravia-picture-off','home-scenes'];
 assertCatalogPreserved(catalog.targets);
 for(const id of oldIds){
  const e=catalog.targets.find(x=>x.id===id);
  assert.ok(e);
  assert.match(e.commit,/^[a-f0-9]{40}$/);
  assert.match(e.sha256,/^[a-f0-9]{64}$/);
 }
});


test('actual historical Common Installer accepts new pinned helper through the existing catalog and leaves original unchanged',async()=>{
 const legacyInstaller=fs.readFileSync(new URL('fixtures/yos-common-installer-legacy-69ca7064.js',import.meta.url),'utf8');
 const catalog=fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8');
 const cloud=store('/cloud'),local=store('/local'),alerts=[],opened=[],requests=[],completed=[];
 cloud.files.set('/cloud/YOS Common Installer.js',legacyInstaller);
 cloud.remove=p=>{cloud.deletions.push(p);cloud.files.delete(p);};
 local.remove=p=>{local.deletions.push(p);local.files.delete(p);};
 const FileManager={iCloud:()=>cloud,local:()=>local};
 class Request{
  constructor(url){this.url=url;this.response={statusCode:200};}
  async loadString(){
   requests.push(this.url);
   if(this.url.endsWith('yos-common-installer-catalog.json'))return catalog;
   if(this.url.includes('607484f37f28eba407c5493c2d90e085a40db1ad')&&this.url.includes('Common%20Installer%20'))return runtime;
   this.response.statusCode=404;
   return 'unapproved resource';
  }
 }
 class Alert{
  addAction(a){this.action=a;}
  addCancelAction(c){this.cancel=c;}
  async presentAlert(){alerts.push({title:this.title,message:this.message});return 0;}
 }
 const context={FileManager,Request,Alert,Script:{complete:()=>completed.push(true)},
  args:{queryParameters:{script:'common-installer-repair'}},Safari:{open:x=>opened.push(x)}};
 const script=new vm.Script('(async()=>{\n'+legacyInstaller+'\n})()');
 await script.runInNewContext(context,{timeout:6000});
 assert.equal(cloud.files.get('/cloud/YOS Common Installer.js'),legacyInstaller);
 assert.equal(cloud.files.get('/cloud/YOS Common Installer 修復.js'),runtime);
 assert.equal(local.writes.length,0);
 assert.equal(requests.length,2);
 assert.match(alerts.at(-1).title,/登録完了/);
 assert.equal(completed.length,1);
 assert.ok(opened[0].startsWith('scriptable:///open/'));
 const record=cloud.files.get('/cloud/YOS Common Installer Data/'+encodeURIComponent('YOS Common Installer 修復')+'.receipt.json');
 assert.ok(record);
 assert.equal(JSON.parse(record).id,'common-installer-repair');
});

test('new installer validates the extension globally and installs only the pinned TAXI source',async()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
 const taxi=fs.readFileSync(new URL('../scriptable/YOS TAXI.js',import.meta.url),'utf8');
 const extension=catalog.additional_targets;
 assert.equal(catalog.targets.length,30);
 assert.ok(extension.length>=2&&extension.length<=30);
 const entry=extension.find(x=>x.id==='yos-taxi');
 assert.ok(entry);
 const memory=extension.find(x=>x.id==='aion-memory-read');
 assert.ok(memory);
 assert.equal(memory.name,'YOS CORE Memory Read');
 assert.equal(memory.path,'ios-app/scriptable/YOS CORE Memory Read.js');
 const memorySource=fs.readFileSync(new URL('../scriptable/YOS CORE Memory Read.js',import.meta.url),'utf8');
 assert.equal(sha(memorySource),memory.sha256);
 assert.match(memorySource,/^\/\/ YOS_SCRIPT_NAME: YOS CORE Memory Read$/m);
 assert.equal(entry.id,'yos-taxi');assert.equal(entry.name,'YOS TAXI');
 assert.equal(sha(taxi),entry.sha256);
 assert.match(taxi,/^\/\/ YOS_SCRIPT_NAME: YOS TAXI$/m);
 assert.doesNotMatch(taxi,/const SEED|43050|21950|14750/);
 const getValidation=(source)=>vm.runInNewContext(source.slice(0,source.indexOf('async function get('))+';validateCatalog');
 assert.equal(getValidation(legacy)(catalog).length,30);
 assert.equal(getValidation(official)(catalog).length,30+extension.length);
 assert.throws(()=>getValidation(official)({...catalog,additional_targets:[catalog.targets[0]]}));
 assert.throws(()=>getValidation(official)({...catalog,additional_targets:[null]}));
 assert.throws(()=>getValidation(official)({...catalog,additional_targets:'bad'}));
 const cloud=store('/cloud'),local=store('/local'),alerts=[],opened=[],requests=[];
 cloud.files.set('/cloud/YOS Common Installer.js',official);
 cloud.files.set('/cloud/unrelated.js','protected');
 cloud.remove=p=>{cloud.deletions.push(p);cloud.files.delete(p);};
 local.remove=p=>{local.deletions.push(p);local.files.delete(p);};
 class Request{constructor(url){this.url=url;this.response={statusCode:200};}async loadString(){requests.push(this.url);if(this.url.endsWith('yos-common-installer-catalog.json'))return JSON.stringify(catalog);if(this.url.includes(entry.commit)&&this.url.includes('YOS%20TAXI.js'))return taxi;this.response.statusCode=404;return 'unapproved';}}
 class Alert{addAction(){}addCancelAction(){}async presentAlert(){alerts.push(this.title);return 0;}}
 const ctx={FileManager:{iCloud:()=>cloud,local:()=>local},Request,Alert,Script:{complete:()=>{}},args:{queryParameters:{script:'yos-taxi'}},Safari:{open:x=>opened.push(x)}};
 await new vm.Script('(async()=>{\n'+official+'\n})()').runInNewContext(ctx,{timeout:6000});
 assert.equal(cloud.files.get('/cloud/YOS TAXI.js'),taxi);
 assert.equal(cloud.files.get('/cloud/unrelated.js'),'protected');
 assert.equal(cloud.files.get('/cloud/YOS Common Installer.js'),official);
 assert.equal(local.writes.length,0);assert.equal(requests.length,2);
 assert.match(alerts.at(-1),/登録完了/);
});

test('device-reported pink magic legacy header and missing final LF upgrade safely',async()=>{
 const raw=legacy.slice(0,-1);
 const header='// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit.\n// icon-color: pink; icon-glyph: magic;\n';
 const installed=header+raw;
 assert.equal(sha(installed),'88e8803881057a50fc743a57b6c770586d4b8c2b6f3e14999a9bc2150b1475de');
 const r=await execute({script:installed});
 assert.equal(r.chosen.files.get('/cloud/'+name),official);
 const backups=[...r.chosen.files.entries()].filter(([p])=>p.includes('bootstrap-backups'));
 assert.equal(backups.length,1);assert.equal(backups[0][1],installed);
 const rejected=await execute({script:installed+'\n// user edit'});
 assert.equal(rejected.chosen.writes.length,0);
 assert.equal(rejected.requests.length,0);
});

test('installer installs only the pinned AION memory reader and preserves TAXI and Clarity',async()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
 const entry=catalog.additional_targets.find(x=>x.id==='aion-memory-read');
 const source=fs.readFileSync(new URL('../scriptable/YOS CORE Memory Read.js',import.meta.url),'utf8');
 assert.equal(sha(source),entry.sha256);
 const cloud=store('/cloud'),local=store('/local'),alerts=[],requests=[];
 cloud.files.set('/cloud/YOS Common Installer.js',official);
 cloud.files.set('/cloud/YOS TAXI.js','protected-taxi');
 cloud.files.set('/cloud/YOS Clarity Inbox Bridge.js','protected-clarity');
 cloud.remove=p=>{cloud.deletions.push(p);cloud.files.delete(p);};
 local.remove=p=>{local.deletions.push(p);local.files.delete(p);};
 class Request{constructor(url){this.url=url;this.response={statusCode:200};}async loadString(){requests.push(this.url);if(this.url.endsWith('yos-common-installer-catalog.json'))return JSON.stringify(catalog);if(this.url.includes(entry.commit)&&this.url.includes('YOS%20CORE%20Memory%20Read.js'))return source;this.response.statusCode=404;return 'unapproved';}}
 class Alert{addAction(){}addCancelAction(){}async presentAlert(){alerts.push(this.title);return 0;}}
 const ctx={FileManager:{iCloud:()=>cloud,local:()=>local},Request,Alert,Script:{complete:()=>{}},args:{queryParameters:{script:'aion-memory-read'}},Safari:{open:()=>{}}};
 await new vm.Script('(async()=>{\n'+official+'\n})()').runInNewContext(ctx,{timeout:6000});
 assert.equal(cloud.files.get('/cloud/YOS CORE Memory Read.js'),source);
 assert.equal(cloud.files.get('/cloud/YOS TAXI.js'),'protected-taxi');
 assert.equal(cloud.files.get('/cloud/YOS Clarity Inbox Bridge.js'),'protected-clarity');
 assert.equal(cloud.files.get('/cloud/YOS Common Installer.js'),official);
 assert.equal(local.writes.length,0);
 assert.equal(requests.length,2);
 assert.match(alerts.at(-1),/登録完了/);
});
