import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../scriptable/YOS Common Installer.js',import.meta.url),'utf8');
const shipped=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
const fixtures=Object.fromEntries(shipped.targets.map(t=>[t.id,fs.readFileSync(new URL('../scriptable/'+t.path.slice('ios-app/scriptable/'.length),import.meta.url),'utf8')]));
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const clone=x=>JSON.parse(JSON.stringify(x));
function fm(root){
 const files=new Map(),dirs=new Set([root]);
 return {files,dirs,documentsDirectory(){return root},joinPath(a,b){return a.replace(/\/$/,'')+'/'+b},
 fileExists(p){return files.has(p)||dirs.has(p)},
 createDirectory(p){let x='';for(const s of p.split('/').filter(Boolean)){x+='/'+s;dirs.add(x)}},
 writeString(p,s){if(!dirs.has(p.slice(0,p.lastIndexOf('/'))))throw Error('parent missing');files.set(p,String(s))},
 readString(p){if(!files.has(p))throw Error('missing '+p);return files.get(p)},
 remove(p){files.delete(p)},isFileStoredIniCloud(){return false},async downloadFileFromiCloud(){}};
}
async function run(options={}){
 const cloud=options.cloud||fm('/icloud'),local=options.local||fm('/local'),catalog=options.catalog||shipped;
 const sources=options.sources||fixtures,choices=[...(options.choices||[0,-1])],alerts=[],opened=[],requests=[];
 class Request{constructor(url){this.url=url;this.response=null;requests.push(url)}
 async loadString(){if(options.offline)throw Error('network offline');this.response={statusCode:options.status||200};if(this.url.includes('yos-common-installer-catalog.json'))return JSON.stringify(catalog);
 for(const t of catalog.targets)if(this.url.includes('/'+t.commit+'/')&&this.url.endsWith(t.path.split('/').map(encodeURIComponent).join('/')))return sources[t.id];
 throw Error('unexpected '+this.url)}}
 class Alert{constructor(){this.title='';this.message='';this.actions=[]}addAction(x){this.actions.push(x)}addCancelAction(x){this.actions.push(x)}
 async presentAlert(){alerts.push({title:this.title,message:this.message});return choices.length?choices.shift():-1}}
 const globals={Request,Alert,FileManager:{iCloud:()=>cloud,local:()=>local},Safari:{open:x=>opened.push(x)},Script:{complete(){}},args:{shortcutParameter:options.id||'',queryParameters:{}},console};
 await vm.runInNewContext('(async()=>{'+script+'})()',globals,{timeout:10000});
 return {cloud,local,alerts,opened,requests};
}
const target='/icloud/YOS Timeline Auto.js',receipt='/icloud/YOS Common Installer Data/YOS%20Timeline%20Auto.receipt.json',marker='/icloud/YOS Common Installer Data/YOS%20Timeline%20Auto.pending.json';
test('catalog pins original bytes, canonical script names and SHA256',()=>{
 assert.equal(shipped.schema,1);
 for(const t of shipped.targets){assert.equal(hash(fixtures[t.id]),t.sha256);assert.equal(t.name,t.path.split('/').pop().slice(0,-3));assert.match(t.commit,/^[0-9a-f]{40}$/)}});
test('first install is automatic-name, hashed, recorded and does not autoexecute',async()=>{
 const r=await run();assert.equal(r.cloud.files.get(target),fixtures['timeline-auto']);
 assert.equal(JSON.parse(r.cloud.files.get(receipt)).sha256,shipped.targets[0].sha256);assert.equal(r.cloud.files.has(marker),false);assert.equal(r.opened.length,0)});
test('optional open sends only editor deep link',async()=>{
 const r=await run({choices:[0,0]});assert.deepEqual(r.opened,['scriptable:///open/YOS%20Timeline%20Auto'])});
test('identical existing never overwritten; unknown content and cross-storage collision protected',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');cloud.files.set(target,fixtures['timeline-auto']);
 let r=await run({cloud,local});assert.equal(cloud.files.has(receipt),false);assert.match(r.alerts.at(-1).title,/登録済み/);
 cloud.files.set(target,'PERSONAL');r=await run({cloud,local});assert.equal(cloud.files.get(target),'PERSONAL');assert.match(r.alerts.at(-1).title,/未完了/);
 local.files.set('/local/YOS Timeline Auto.js','SECOND');r=await run({cloud,local});
 assert.equal(cloud.files.get(target),'PERSONAL');assert.equal(local.files.get('/local/YOS Timeline Auto.js'),'SECOND');assert.match(r.alerts.at(-1).message,/両方/)});
test('managed update has explicit consent, backup and new receipt',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');await run({cloud,local});
 const old=cloud.files.get(target),changed=old+'\n// UPDATED\n';
 const catalog=clone(shipped);catalog.targets[0].sha256=hash(changed);catalog.targets[0].commit='f'.repeat(40);
 await run({cloud,local,catalog,sources:{...fixtures,'timeline-auto':changed},choices:[0,0,-1]});
 assert.equal(cloud.files.get(target),changed);assert.equal(JSON.parse(cloud.files.get(receipt)).sha256,hash(changed));
 const backup='/icloud/YOS Common Installer Data/backups/YOS%20Timeline%20Auto-'+hash(old)+'.txt';
 assert.equal(cloud.files.get(backup),old);assert.equal(cloud.files.has(marker),false)});
test('declining update or local manual edits do not overwrite script',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');await run({cloud,local});
 const old=cloud.files.get(target),changed=old+'\n// UPDATED\n',catalog=clone(shipped);
 catalog.targets[0].sha256=hash(changed);catalog.targets[0].commit='f'.repeat(40);
 await run({cloud,local,catalog,sources:{...fixtures,'timeline-auto':changed},choices:[0,-1]});assert.equal(cloud.files.get(target),old);
 cloud.files.set(target,'USER MODIFICATION');
 const r=await run({cloud,local,catalog,sources:{...fixtures,'timeline-auto':changed}});
 assert.equal(cloud.files.get(target),'USER MODIFICATION');assert.match(r.alerts.at(-1).message,/変更されたコード/)});
test('bad code hash, bad manifest and offline all fail closed',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');
 let r=await run({cloud,local,sources:{...fixtures,'timeline-auto':'// Variables used by Scriptable.\ncorrupted'}});
 assert.equal(cloud.files.has(target),false);assert.match(r.alerts.at(-1).title,/未完了/);
 const bad=clone(shipped);bad.targets[0].path='../unknown.js';r=await run({cloud,local,catalog:bad});
 assert.equal(cloud.files.has(target),false);assert.match(r.alerts.at(-1).title,/未完了/);
 r=await run({cloud,local,offline:true});assert.equal(cloud.files.has(target),false);assert.match(r.alerts.at(-1).title,/未完了/)});
test('failed write immediately rolls back without leaving a wrong code or receipt',async()=>{
 const cloud=fm('/icloud'),local=fm('/local'),original=cloud.writeString.bind(cloud);
 let fail=true;cloud.writeString=(path,value)=>{if(path===target&&fail){fail=false;throw Error('synthetic error')}original(path,value)};
 const r=await run({cloud,local});assert.equal(cloud.files.has(target),false);assert.equal(cloud.files.has(receipt),false);assert.equal(cloud.files.has(marker),false);assert.match(r.alerts.at(-1).message,/復元/)});
test('unmanaged journaled interruption is not blindly overwritten',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');await run({cloud,local});
 cloud.files.set(marker,JSON.stringify({schema:1,name:'YOS Timeline Auto'}));
 const r=await run({cloud,local});assert.equal(cloud.files.get(target),fixtures['timeline-auto']);assert.equal(cloud.files.has(marker),true);assert.match(r.alerts.at(-1).message,/中断/)});
test('shortcut parameter selects without manual name, and iCloud unavailable safely uses local',async()=>{
 const r=await run({id:'journal',choices:[-1]});assert.equal(r.cloud.files.get('/icloud/YOS JOURNAL.js'),fixtures.journal);
 const l=fm('/local');const r2=await run({cloud:{documentsDirectory(){throw Error('not available')}},local:l});
 assert.equal(r2.local.files.get('/local/YOS Timeline Auto.js'),fixtures['timeline-auto'])});
