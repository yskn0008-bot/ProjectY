import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';

const code=fs.readFileSync(new URL('../scriptable/YOS BRAVIA 画質統合.js',import.meta.url),'utf8');
const hub=fs.readFileSync(new URL('../scriptable/remote-widgets/picture-v66/YOS Remote Hub.js',import.meta.url),'utf8');
const manifest=[
 ['YOS Remote Hub.js','7640359fe0bf3aec3e512fe7689e5f2a1a3ebd64ce088af872cdfce06ec34c7f'],
 ['YOS Tapo H110 Core.js','810e7536920e991ce49728cf03b6be9092b9f3f0539d231dd214852c20778e1d'],
 ['YOS Light Widget.js','b43652b3835adcce9581810a0aa63768ac95b8c0a6d317f23362028308e8b0ec'],
 ['YOS AC Widget.js','b1ce685b69206371501a65b2dd955ca2f01630be6827b0867c05529f200a7a89']
];
const sources=Object.fromEntries(manifest.map(([n])=>[n,fs.readFileSync(new URL('../scriptable/remote-widgets/picture-v66/'+n,import.meta.url),'utf8')]));
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const target='/icloud/Untitled Script 9.js';
const OLD='fb1316a915ed8b0194a14fc40db5e2736f18c009',NEXT='af58747da86a12bde07ade94b38df4a320675408';

function makeLauncher(){
 const base=['// YOS Remote 4台版 v6.6 直接起動',
 'const RELEASE = "'+OLD+'";',
 'const BASE = "https://raw.githubusercontent.com/yskn0008-bot/ProjectY/" + RELEASE + "/ios-app/scriptable/remote-widgets/";',
 'const FILES = {hub:"YOS Remote Hub.js",core:"YOS Tapo H110 Core.js",light:"YOS Light Widget.js",ac:"YOS AC Widget.js"};',
 'const cache = "YOS_Remote_v66_cache.json";',''].join('\n');
 assert.ok(base.length<4003);return base+' '.repeat(4003-base.length);
}
function storage(root){
 const files=new Map(),dirs=new Set([root]);let writes=0;
 return {files,dirs,documentsDirectory:()=>root,joinPath:(a,b)=>a+'/'+b,
  fileExists:p=>files.has(p)||dirs.has(p),isDirectory:p=>dirs.has(p),
  createDirectory(p){let q='';for(const seg of p.split('/').filter(Boolean)){q+='/'+seg;dirs.add(q)}},
  writeString(p,s){writes++;if(!dirs.has(p.slice(0,p.lastIndexOf('/'))))throw Error('bad dir '+p);files.set(p,s)},
  readString(p){if(!files.has(p))throw Error('missing '+p);return files.get(p)},
  remove(p){files.delete(p)},isFileStoredIniCloud(){return false},
  async downloadFileFromiCloud(){},get writes(){return writes}};
}
async function run({cloud=storage('/icloud'),local=storage('/local'),consent=true,tamper=false}={}){
 const alerts=[],urls=[];
 class Request{constructor(url){this.url=url;this.response=null;urls.push(url)}
  async loadString(){this.response={statusCode:200};const name=decodeURIComponent(this.url.split('/').at(-1));return tamper?'tampered!':sources[name];}
  async loadJSON(){this.response={statusCode:200};const name=decodeURIComponent(this.url.split('/').at(-1).split('?')[0]);const value=tamper?'tampered!':sources[name];return {encoding:'base64',content:Buffer.from(value,'utf8').toString('base64')}}
 }
 class Alert{constructor(){this.title='';this.message='';this.actions=[];this.cancelled=false}
 addAction(s){this.actions.push(s)}addCancelAction(){this.cancelled=true}
 async presentAlert(){alerts.push({title:this.title,message:this.message});return this.cancelled&&!consent?-1:0}}
 const Data={fromBase64String(s){return{toRawString(){return Buffer.from(s,'base64').toString('utf8')}}}};
 const ctx={FileManager:{iCloud:()=>cloud,local:()=>local},Request,Alert,Data,Script:{complete(){}},unescape,encodeURIComponent,console};
 await vm.runInNewContext('(async()=>{'+code+'})()',ctx,{timeout:15000});
 return {cloud,local,alerts,urls};
}

test('catalogued package and all four dependency snapshots have immutable SHA-256 values',()=>{
 const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
 const entry=catalog.targets.find(t=>t.id==='bravia-picture-integration');
 assert.ok(entry);assert.equal(entry.name,'YOS BRAVIA 画質統合');
 assert.equal(entry.path,'ios-app/scriptable/YOS BRAVIA 画質統合.js');
 assert.equal(entry.sha256,sha(code));
 for(const [name,hash] of manifest)assert.equal(sha(sources[name]),hash);
 assert.match(code,/YOS_SCRIPT_NAME: YOS BRAVIA 画質統合/);
 assert.match(hub,/const PICTURE_TARGETS=/);
 for(const tab of ['tv','light','ac','floor'])assert.ok(hub.includes('data-panel="'+tab+'"'));
});
test('upgrades exact launcher in-place, keeps all other remotes, preserves old code backup',async()=>{
 const cloud=storage('/icloud'),local=storage('/local'),old=makeLauncher();
 cloud.files.set(target,old);cloud.files.set('/icloud/リモコン.js','KEEP CLOUD V6.6');local.files.set('/local/リモコン.js','KEEP LOCAL V6.5');
 const r=await run({cloud,local});
 const updated=cloud.files.get(target);
 assert.equal(updated.length,old.length+'/picture-v66'.length);
 assert.ok(updated.includes(NEXT));assert.ok(updated.includes('/remote-widgets/picture-v66/'));
 assert.ok(!updated.includes(OLD));assert.ok(!updated.includes('"/ios-app/scriptable/remote-widgets/"'));
 assert.equal(cloud.files.get('/icloud/リモコン.js'),'KEEP CLOUD V6.6');
 assert.equal(local.files.get('/local/リモコン.js'),'KEEP LOCAL V6.5');
 const backup=[...cloud.files.entries()].find(([p])=>p.includes('before-picture-v66.txt'));
 assert.ok(backup);assert.equal(backup[1],old);
 assert.ok(![...cloud.files.keys()].some(p=>p.endsWith('.picture-pending.json')));
 assert.equal(r.urls.length,4);
 assert.match(r.alerts.at(-1).title,/完了/);
});
test('declined confirmation writes no files',async()=>{
 const cloud=storage('/icloud'),local=storage('/local'),old=makeLauncher();
 cloud.files.set(target,old);
 const r=await run({cloud,local,consent:false});
 assert.equal(cloud.files.get(target),old);assert.equal(cloud.writes,0);
 assert.equal(r.alerts.length,1);
});
test('local duplicate, modified launcher and failed integrity all stop safely',async()=>{
 for(const type of ['local','modified','tampered']){
  const cloud=storage('/icloud'),local=storage('/local'),original=makeLauncher();
  cloud.files.set(target,type==='modified'?original+'changed':original);
  if(type==='local')local.files.set('/local/Untitled Script 9.js','collision');
  const r=await run({cloud,local,tamper:type==='tampered'});
  assert.equal(cloud.files.get(target),type==='modified'?original+'changed':original);
  assert.equal(cloud.writes,0);
  assert.match(r.alerts.at(-1).title,/未完了/);
 }
});
test('idempotent repeat does not rewrite already upgraded launcher',async()=>{
 const cloud=storage('/icloud'),local=storage('/local'),old=makeLauncher();cloud.files.set(target,old);
 await run({cloud,local});const previous=cloud.writes,updated=cloud.files.get(target);
 const r=await run({cloud,local});assert.equal(cloud.writes,previous);
 assert.equal(cloud.files.get(target),updated);assert.match(r.alerts.at(-1).title,/導入済み/);
});
test('failed live write restores the exact source without touching other files',async()=>{
 const cloud=storage('/icloud'),local=storage('/local'),old=makeLauncher();cloud.files.set(target,old);
 const write=cloud.writeString.bind(cloud);let once=true;cloud.writeString=(p,s)=>{if(p===target&&once){once=false;throw Error('simulated write failed')}write(p,s)};
 const r=await run({cloud,local});
 assert.equal(cloud.files.get(target),old);assert.match(r.alerts.at(-1).title,/未完了/);
 assert.ok([...cloud.files.keys()].some(p=>p.includes('before-picture-v66.txt')));
 assert.ok(![...cloud.files.keys()].some(p=>p.endsWith('.picture-pending.json')));
});
