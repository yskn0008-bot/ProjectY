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
 assert.equal(sha(official),'0f0af090deec3c9c523ee885d37f4d5394321bd009f8e04962deff91ea3fc0b0');
 assert.equal(sha(legacy),'069c2a556fbdc5eb72ef9dfda5f545e41bb252baa45b59637a4f5d9f6d1ce547');
 assert.match(runtime,/8bb289519b0f4f6c907b27f336a623bc5669e669/);
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
 assert.equal(cat.targets.length,27);
 assert.ok(entry);
 assert.equal(entry.name,'YOS Common Installer 修復');
 assert.equal(entry.path,'ios-app/scriptable/YOS Common Installer 修復.js');
 assert.equal(entry.commit,'cc7a0f91c4e5b758b290f7098aae417b57c631c7');
 assert.equal(sha(runtime),entry.sha256);
 assert.equal(sha(official),'0f0af090deec3c9c523ee885d37f4d5394321bd009f8e04962deff91ea3fc0b0');
});
test('original 26 installer catalog registrations are not mutated',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
 const oldIds=['bravia-picture-off','home-scenes'];
 assert.equal(new Set(catalog.targets.map(x=>x.id)).size,27);
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
   if(this.url.includes('cc7a0f91c4e5b758b290f7098aae417b57c631c7')&&this.url.includes('Common%20Installer%20'))return runtime;
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
