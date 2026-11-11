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
 cloud.files.set(target,'PERSONAL');r=await run({cloud,local});assert.equal(cloud.files.get(target),'PERSONAL');assert.match(r.alerts.at(-1).title,/管理記録の安全診断/);
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

test('interrupted managed update restores exact previous code and receipt',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');await run({cloud,local});
 const old=cloud.files.get(target),oldReceipt=cloud.files.get(receipt);
 const changed=old+'\n// AFTER INTERRUPT\n';
 const catalog=clone(shipped);catalog.targets[0].sha256=hash(changed);catalog.targets[0].commit='f'.repeat(40);
 const folder='/icloud/YOS Common Installer Data/backups';cloud.createDirectory(folder);
 const backup=folder+'/YOS%20Timeline%20Auto-'+hash(old)+'.txt';
 cloud.files.set(backup,old);cloud.files.set(target,changed);
 cloud.files.set(receipt,JSON.stringify({...JSON.parse(oldReceipt),sha256:hash(changed),commit:'f'.repeat(40)}));
 cloud.files.set(marker,JSON.stringify({schema:1,name:'YOS Timeline Auto',oldHash:hash(old),newHash:hash(changed),backup,receiptFile:receipt,oldReceipt}));
 const r=await run({cloud,local,catalog,sources:{...fixtures,'timeline-auto':changed}});
 assert.equal(cloud.files.get(target),old);
 assert.equal(cloud.files.get(receipt),oldReceipt);
 assert.equal(cloud.files.has(marker),false);
 assert.match(r.alerts.at(-1).message,/復旧しました/);
});
test('interrupted first install is cleaned only when bytes match the known pending hash',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');
 const base='/icloud/YOS Common Installer Data';cloud.createDirectory(base);
 cloud.files.set(target,fixtures['timeline-auto']);
 cloud.files.set(marker,JSON.stringify({schema:1,name:'YOS Timeline Auto',oldHash:null,newHash:hash(fixtures['timeline-auto']),backup:null,receiptFile:receipt,oldReceipt:null}));
 let r=await run({cloud,local});
 assert.equal(cloud.files.has(target),false);
 assert.equal(cloud.files.has(receipt),false);
 assert.equal(cloud.files.has(marker),false);
 assert.match(r.alerts.at(-1).message,/復旧しました/);
 cloud.files.set(target,'UNKNOWN USER CONTENT');
 cloud.files.set(marker,JSON.stringify({schema:1,name:'YOS Timeline Auto',oldHash:null,newHash:hash(fixtures['timeline-auto']),backup:null,receiptFile:receipt,oldReceipt:null}));
 r=await run({cloud,local});
 assert.equal(cloud.files.get(target),'UNKNOWN USER CONTENT');
 assert.equal(cloud.files.has(marker),true);
 assert.match(r.alerts.at(-1).message,/不明です/);
});

test('explicit YOS_SCRIPT_NAME header wins over filename and requires exact manifest agreement',async()=>{
 const custom='// Variables used by Scriptable.\n// YOS_SCRIPT_NAME: YOS 正式表示名\nconst answer=42;\n';
 const catalog=clone(shipped);
 catalog.targets[0].name='YOS 正式表示名';
 catalog.targets[0].sha256=hash(custom);
 catalog.targets[0].commit='f'.repeat(40);
 const r=await run({catalog,sources:{...fixtures,'timeline-auto':custom}});
 assert.equal(r.cloud.files.get('/icloud/YOS 正式表示名.js'),custom);
 assert.equal(r.cloud.files.has(target),false);
 const wrong=custom.replace('YOS 正式表示名','YOS 誤った名前');
 const changed=clone(catalog);changed.targets[0].sha256=hash(wrong);
 const r2=await run({catalog:changed,sources:{...fixtures,'timeline-auto':wrong}});
 assert.equal(r2.cloud.files.has('/icloud/YOS 誤った名前.js'),false);
 assert.match(r2.alerts.at(-1).message,/正式名称が一致/);
});

test('read-only duplicate diagnosis identifies two identical copies and preserves them',async()=>{
 const cloud=fm('/icloud'),local=fm('/local'),payload=fixtures['timeline-auto'];
 cloud.files.set(target,payload);local.files.set('/local/YOS Timeline Auto.js',payload);
 const previousCloud=[...cloud.files],previousLocal=[...local.files];
 const r=await run({cloud,local});
 assert.deepEqual([...cloud.files],previousCloud);assert.deepEqual([...local.files],previousLocal);
 assert.equal(r.opened.length,0);assert.equal(r.alerts.at(-1).title,'同名スクリプトの安全診断');
 assert.match(r.alerts.at(-1).message,/両方とも配布正本と同一/);
 assert.match(r.alerts.at(-1).message,/iCloud：検証値/);
 assert.match(r.alerts.at(-1).message,/このiPhone内：検証値/);
 assert.ok(!r.alerts.at(-1).message.includes(payload),'never show script content');
});
test('read-only duplicate diagnosis recognizes which storage matches the official version',async()=>{
 for(const isCloud of [true,false]){
  const cloud=fm('/icloud'),local=fm('/local'),unknown='USER PERSONAL SCRIPT \nSECRET TOKEN 1234';
  cloud.files.set(target,isCloud?fixtures['timeline-auto']:unknown);
  local.files.set('/local/YOS Timeline Auto.js',isCloud?unknown:fixtures['timeline-auto']);
  const beforeCloud=[...cloud.files],beforeLocal=[...local.files];
  const r=await run({cloud,local});
  assert.deepEqual([...cloud.files],beforeCloud);assert.deepEqual([...local.files],beforeLocal);
  assert.match(r.alerts.at(-1).message,new RegExp('配布正本と一致するのは'+(isCloud?'iCloud':'このiPhone内')+'側'));
  assert.ok(!r.alerts.at(-1).message.includes('SECRET TOKEN'));
  assert.equal(r.opened.length,0);
 }
});
test('different unknown duplicate scripts remain intact with only short hashes revealed',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');
 cloud.files.set(target,'PERSONAL-A-PRIVATE');local.files.set('/local/YOS Timeline Auto.js','PERSONAL-B-PRIVATE');
 const prevCloud=[...cloud.files],prevLocal=[...local.files];
 const r=await run({cloud,local});
 assert.deepEqual([...cloud.files],prevCloud);assert.deepEqual([...local.files],prevLocal);
 assert.match(r.alerts.at(-1).message,/両方とも配布正本とは一致しません/);
 assert.ok(!r.alerts.at(-1).message.includes('PERSONAL-A-PRIVATE'));
 assert.ok(!r.alerts.at(-1).message.includes('PERSONAL-B-PRIVATE'));
 assert.equal(r.opened.length,0);
});
test('an iCloud duplicate that cannot be read remains protected and is explicitly inconclusive',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');
 cloud.files.set(target,'CLOUD-UNKNOWN');local.files.set('/local/YOS Timeline Auto.js',fixtures['timeline-auto']);
 const originals=[...cloud.files];
 cloud.readString=()=>{throw Error('iCloud sync is unavailable')};
 const r=await run({cloud,local});
 assert.deepEqual([...cloud.files],originals);
 assert.equal(local.files.get('/local/YOS Timeline Auto.js'),fixtures['timeline-auto']);
 assert.match(r.alerts.at(-1).message,/読み取り不可/);
 assert.match(r.alerts.at(-1).message,/原因は未確定/);
 assert.equal(r.opened.length,0);
});

test('daystream preview installs alongside preserved conflicting old timeline files without overwrite or autoexecute',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');
 const legacyCloud='/icloud/YOS Timeline Auto.js',legacyLocal='/local/YOS Timeline Auto.js';
 cloud.files.set(legacyCloud,'USER LEGACY CLOUD');local.files.set(legacyLocal,'USER LEGACY LOCAL');
 const r=await run({cloud,local,id:'daystream-preview',choices:[-1]});
 const preview=shipped.targets.find(t=>t.id==='daystream-preview');
 assert.ok(preview,'release manifest should expose a distinct preview choice');
 assert.equal(preview.name,'YOS DAYSTREAM Timeline 開発確認 20261105');
 assert.equal(preview.path,'ios-app/scriptable/YOS DAYSTREAM Timeline 開発確認 20261105.js');
 assert.match(preview.commit,/^[0-9a-f]{40}$/);
 assert.equal(hash(fixtures['daystream-preview']),preview.sha256);
 assert.equal(r.cloud.files.get('/icloud/'+preview.name+'.js'),fixtures['daystream-preview']);
 assert.equal(r.cloud.files.get(legacyCloud),'USER LEGACY CLOUD');
 assert.equal(r.local.files.get(legacyLocal),'USER LEGACY LOCAL');
 assert.equal(r.opened.length,0);
 const receipt=JSON.parse(r.cloud.files.get('/icloud/YOS Common Installer Data/'+encodeURIComponent(preview.name)+'.receipt.json'));
 assert.equal(receipt.commit,preview.commit);assert.equal(receipt.sha256,preview.sha256);
 assert.match(r.alerts.at(-1).title,/登録完了/);
});
test('daystream preview never overwrites a preexisting unknown same-name candidate',async()=>{
 const cloud=fm('/icloud');
 const existing='/icloud/YOS DAYSTREAM Timeline 開発確認 20261105.js';
 cloud.files.set(existing,'PERSONAL CUSTOM SCRIPT');
 const r=await run({cloud,id:'daystream-preview'});
 assert.equal(r.cloud.files.get(existing),'PERSONAL CUSTOM SCRIPT');
 assert.match(r.alerts.at(-1).message,/管理記録/);
 assert.equal(r.opened.length,0);
});

test('receipt metadata mismatch on byte-identical verified code stays read-only and offers only editor',async()=>{
 const cloud=fm('/icloud'),local=fm('/local');
 cloud.createDirectory('/icloud/YOS Common Installer Data');
 cloud.files.set(target,fixtures['timeline-auto']);
 const oldReceipt=JSON.stringify({schema:1,name:'YOS Timeline Auto',id:'WRONG',path:shipped.targets[0].path,storage:'iCloud',sha256:hash(fixtures['timeline-auto'])});
 cloud.files.set(receipt,oldReceipt);
 const filesBefore=[...cloud.files];
 const r=await run({cloud,local,id:'timeline-auto',choices:[0]});
 assert.deepEqual([...cloud.files],filesBefore,'code and receipt should be unchanged');
 assert.match(r.alerts.at(-1).title,/管理記録の安全診断/);
 assert.match(r.alerts.at(-1).message,/GitHubの検証済み配布版と一致/);
 assert.match(r.alerts.at(-1).message,/対象：YOS Timeline Auto/);
 assert.deepEqual(r.opened,['scriptable:///open/YOS%20Timeline%20Auto']);
});
test('unknown same-name code with no receipt displays target and reason, never modifies or opens',async()=>{
 const cloud=fm('/icloud'),local=fm('/local'),user='USER PROTECTED SECRET';
 cloud.files.set(target,user);
 const before=[...cloud.files];
 const r=await run({cloud,local});
 assert.deepEqual([...cloud.files],before);
 assert.match(r.alerts.at(-1).title,/管理記録の安全診断/);
 assert.match(r.alerts.at(-1).message,/対象：YOS Timeline Auto/);
 assert.match(r.alerts.at(-1).message,/管理記録がありません/);
 assert.match(r.alerts.at(-1).message,/配布版とは内容が異なります/);
 assert.equal(r.opened.length,0);
 assert.ok(!r.alerts.at(-1).message.includes(user));
});
test('unknown same-name code with another ID receipt is preserved in both locations',async()=>{
 for(const location of ['cloud','local']){
  const cloud=fm('/icloud'),local=fm('/local'),fmgr=location==='cloud'?cloud:local;
  const file=fmgr.documentsDirectory()+'/YOS Timeline Auto.js',met=fmgr.documentsDirectory()+'/YOS Common Installer Data/YOS%20Timeline%20Auto.receipt.json';
  fmgr.createDirectory(fmgr.documentsDirectory()+'/YOS Common Installer Data');
  fmgr.files.set(file,'LOCAL CUSTOM CODE');
  fmgr.files.set(met,JSON.stringify({schema:1,name:'YOS Timeline Auto',id:'WRONG',path:shipped.targets[0].path,storage:location==='cloud'?'iCloud':'local',sha256:'f'.repeat(64)}));
  const beforeCloud=[...cloud.files],beforeLocal=[...local.files];
  const r=await run({cloud,local});
  assert.deepEqual([...cloud.files],beforeCloud);
  assert.deepEqual([...local.files],beforeLocal);
  assert.match(r.alerts.at(-1).message,/管理記録の名前・配布ID・保存場所/);
  assert.equal(r.opened.length,0);
 }
});


test('isolated glass preview preserves legacy scripts and receipts in both storages',async()=>{
 const entry=shipped.targets.find(x=>x.id==='daystream-glass-20261111');
 assert.ok(entry,'fourth opt-in preview must appear in existing catalog');
 assert.equal(shipped.targets.length,4);
 assert.equal(entry.name,'YOS DAYSTREAM Glass 検証 20261111');
 assert.equal(entry.path,'ios-app/scriptable/'+entry.name+'.js');
 assert.match(entry.commit,/^[0-9a-f]{40}$/);
 assert.equal(hash(fixtures[entry.id]),entry.sha256);
 const cloud=fm('/icloud'),local=fm('/local');
 cloud.createDirectory('/icloud/YOS Common Installer Data');
 local.createDirectory('/local/YOS Common Installer Data');
 for(const legacy of shipped.targets.slice(0,3)){
  const name=legacy.name;
  cloud.files.set('/icloud/'+name+'.js','USER-CLOUD-OLD '+name);
  local.files.set('/local/'+name+'.js','USER-LOCAL-OLD '+name);
  cloud.files.set('/icloud/YOS Common Installer Data/'+encodeURIComponent(name)+'.receipt.json','KEEP-RECEIPT '+name);
 }
 const originalCloud=[...cloud.files],originalLocal=[...local.files];
 const r=await run({cloud,local,id:entry.id,choices:[-1]});
 assert.equal(r.cloud.files.get('/icloud/'+entry.name+'.js'),fixtures[entry.id]);
 for(const [key,value] of originalCloud)assert.equal(cloud.files.get(key),value,'must not edit cloud legacy '+key);
 for(const [key,value] of originalLocal)assert.equal(local.files.get(key),value,'must not edit local legacy '+key);
 const receiptPath='/icloud/YOS Common Installer Data/'+encodeURIComponent(entry.name)+'.receipt.json';
 const receipt=JSON.parse(cloud.files.get(receiptPath));
 assert.equal(receipt.sha256,entry.sha256);assert.equal(receipt.commit,entry.commit);
 assert.equal(receipt.name,entry.name);assert.equal(receipt.id,entry.id);
 assert.equal(r.opened.length,0,'new preview never autoruns');
 assert.match(r.alerts.at(-1).title,/登録完了/);
});
test('isolated glass preview uses its own plan file and never imports legacy plans',()=>{
 const legacy=fixtures['daystream-preview'],glass=fixtures['daystream-glass-20261111'];
 const fromName='// YOS_SCRIPT_NAME: YOS DAYSTREAM Timeline 開発確認 20261105';
 const toName='// YOS_SCRIPT_NAME: YOS DAYSTREAM Glass 検証 20261111';
 const fromPlan="const PLAN_FILE='YOS_DAYSTREAM_TIMELINE_REVIEW_v1.json';";
 const toPlan="const PLAN_FILE='YOS_DAYSTREAM_GLASS_VERIFY_20261111_v1.json';";
 const legacyFallback="if(!prior.value&&!prior.blocked&&store){const legacy={fm:store.fm,path:store.fm.joinPath(store.fm.documentsDirectory(),'YOS_DAYSTREAM_PLAN_STATE_v1.json')};prior=readLocalPlan(legacy);}";
 const expected=legacy.replace(fromName,toName).replace(fromPlan,toPlan).replace(legacyFallback,'// This isolated glass preview never imports legacy DAYSTREAM plan files.').replace('// YOS DAYSTREAM native preview bridge — Scriptable (development only)','// YOS DAYSTREAM native glass preview — separate Scriptable test version; legacy files protected');
 assert.equal(glass,expected,'glass candidate must be a minimal, audited transformation of the reviewed UI source');
 assert.ok(glass.includes(toPlan));
 assert.ok(!glass.includes(fromPlan));
 assert.ok(!glass.includes('YOS_DAYSTREAM_PLAN_STATE_v1.json'));
 assert.ok(!glass.includes('const PLAN_FILE='+'YOS_DAYSTREAM_TIMELINE_REVIEW_v1.json'));
 assert.ok(legacy.includes(fromPlan),'old preview still retains its historical data path');
 new (Object.getPrototypeOf(async function(){}).constructor)(glass);
});
test('isolated glass preview refuses an unmanaged exact-name file in iCloud or local',async()=>{
 const name='YOS DAYSTREAM Glass 検証 20261111',id='daystream-glass-20261111';
 for(const where of ['cloud','local']){
  const cloud=fm('/icloud'),local=fm('/local'),chosen=where==='cloud'?cloud:local,root=where==='cloud'?'/icloud':'/local';
  chosen.files.set(root+'/'+name+'.js','PERSONAL EXISTING GLASS CODE');
  const snapshot=[...chosen.files];
  const r=await run({cloud,local,id});
  assert.deepEqual([...chosen.files],snapshot);
  assert.match(r.alerts.at(-1).message,/管理記録/);
  assert.equal(r.opened.length,0);
 }
});
test('isolated glass preview fails closed when tampered or offline and preserves legacy content',async()=>{
 const id='daystream-glass-20261111',name='YOS DAYSTREAM Glass 検証 20261111';
 for(const changed of [{offline:true},{sources:{...fixtures,[id]:fixtures[id]+'\n// invalid modification'}}]){
  const cloud=fm('/icloud'),local=fm('/local');
  cloud.files.set('/icloud/YOS DAYSTREAM Timeline 開発確認 20261105.js','PRESERVE OLD');
  const r=await run({cloud,local,id,...changed});
  assert.equal(cloud.files.get('/icloud/YOS DAYSTREAM Timeline 開発確認 20261105.js'),'PRESERVE OLD');
  assert.equal(cloud.files.has('/icloud/'+name+'.js'),false);
  assert.equal(local.files.has('/local/'+name+'.js'),false);
  assert.equal(r.opened.length,0);
  assert.match(r.alerts.at(-1).title,/未完了/);
 }
});
test('second run of installed glass preview does not modify an already verified script',async()=>{
 const id='daystream-glass-20261111',entry=shipped.targets.find(t=>t.id===id);
 const cloud=fm('/icloud'),local=fm('/local');
 await run({cloud,local,id});
 const before=[...cloud.files];
 const r=await run({cloud,local,id,choices:[-1]});
 assert.deepEqual([...cloud.files],before);
 assert.match(r.alerts.at(-1).title,/登録済み/);
 assert.equal(r.opened.length,0);
 assert.equal(cloud.files.get('/icloud/'+entry.name+'.js'),fixtures[id]);
});

test('verified receipt-only script restoration writes only missing original body after explicit consent',async()=>{
 const cloud=fm('/icloud'),local=fm('/local'),entry=shipped.targets.find(t=>t.id==='daystream-glass-20261111');
 const code=fixtures[entry.id],targetPath='/icloud/'+entry.name+'.js',receiptPath='/icloud/YOS Common Installer Data/'+encodeURIComponent(entry.name)+'.receipt.json';
 cloud.createDirectory('/icloud/YOS Common Installer Data');
 const existingReceipt={schema:1,name:entry.name,id:entry.id,path:entry.path,sha256:entry.sha256,storage:'iCloud',commit:entry.commit};
 const original=JSON.stringify(existingReceipt);
 cloud.files.set(receiptPath,original);
 cloud.files.set('/icloud/YOS DAYSTREAM Timeline 開発確認 20261105.js','PRESERVE PRIOR SCRIPT');
 local.files.set('/local/YOS Timeline Auto.js','PRESERVE OTHER SCRIPT');
 const cloudBefore=new Map(cloud.files),localBefore=new Map(local.files);
 const r=await run({cloud,local,id:entry.id,choices:[0,-1]});
 assert.equal(cloud.files.get(targetPath),code,'restore exactly pinned code bytes');
 for(const [name,value] of cloudBefore)assert.equal(cloud.files.get(name),value,'must not alter any older cloud file or receipt');
 assert.deepEqual([...local.files],[...localBefore]);
 assert.equal(cloud.files.get(receiptPath),original,'receipt must remain byte-identical');
 assert.equal(r.opened.length,0,'no code runs automatically');
 assert.equal(r.alerts[0].title,'検証済みコードの本体だけ復元');
 assert.equal(r.alerts.at(-1).title,'本体の復元完了');
});
test('unapproved orphan restore does not create script or change receipt',async()=>{
 const cloud=fm('/icloud'),local=fm('/local'),entry=shipped.targets[3],root='/icloud',where=root+'/YOS Common Installer Data/'+encodeURIComponent(entry.name)+'.receipt.json';
 cloud.createDirectory(root+'/YOS Common Installer Data');
 cloud.files.set(where,JSON.stringify({schema:1,name:entry.name,id:entry.id,path:entry.path,storage:'iCloud',commit:entry.commit,sha256:entry.sha256}));
 const before=[...cloud.files];
 const r=await run({cloud,local,id:entry.id,choices:[-1]});
 assert.deepEqual([...cloud.files],before);
 assert.equal(r.opened.length,0);
 assert.equal(r.alerts.at(-1).title,'検証済みコードの本体だけ復元');
});
test('orphan receipt is recovered in the storage where it actually exists, never moved to iCloud',async()=>{
 const cloud=fm('/icloud'),local=fm('/local'),entry=shipped.targets[3],p='/local/YOS Common Installer Data/'+encodeURIComponent(entry.name)+'.receipt.json';
 local.createDirectory('/local/YOS Common Installer Data');
 const old=JSON.stringify({schema:1,name:entry.name,id:entry.id,path:entry.path,storage:'local',commit:entry.commit,sha256:entry.sha256});
 local.files.set(p,old);
 const r=await run({cloud,local,id:entry.id,choices:[0,-1]});
 assert.equal(local.files.get('/local/'+entry.name+'.js'),fixtures[entry.id]);
 assert.equal(local.files.get(p),old);
 assert.equal(cloud.files.size,0,'must not create unrelated iCloud file');
 assert.match(r.alerts.at(-1).title,/復元完了/);
});
test('orphan metadata with changed commit, hash, ID or storage is never used to create a script',async()=>{
 const entry=shipped.targets[3],where='/icloud/YOS Common Installer Data/'+encodeURIComponent(entry.name)+'.receipt.json';
 const expected={schema:1,name:entry.name,id:entry.id,path:entry.path,storage:'iCloud',commit:entry.commit,sha256:entry.sha256};
 for(const [field,value] of [['commit','f'.repeat(40)],['sha256','e'.repeat(64)],['id','unknown'],['storage','local']]){
  const cloud=fm('/icloud'),local=fm('/local');
  cloud.createDirectory('/icloud/YOS Common Installer Data');
  cloud.files.set(where,JSON.stringify({...expected,[field]:value}));
  const before=[...cloud.files];
  const r=await run({cloud,local,id:entry.id});
  assert.deepEqual([...cloud.files],before,field+' receipt must remain untouched');
  assert.equal(r.opened.length,0);
  assert.equal(cloud.files.has('/icloud/'+entry.name+'.js'),false);
  assert.match(r.alerts.at(-1).title,/保存本体が見つからない安全診断/);
 }
});
test('two orphan receipts in iCloud and local prevent any restore',async()=>{
 const cloud=fm('/icloud'),local=fm('/local'),entry=shipped.targets[3];
 for(const [fm,root,storage] of [[cloud,'/icloud','iCloud'],[local,'/local','local']]){
  fm.createDirectory(root+'/YOS Common Installer Data');
  fm.files.set(root+'/YOS Common Installer Data/'+encodeURIComponent(entry.name)+'.receipt.json',
   JSON.stringify({schema:1,name:entry.name,id:entry.id,path:entry.path,storage,commit:entry.commit,sha256:entry.sha256}));
 }
 const c=[...cloud.files],l=[...local.files];
 const r=await run({cloud,local,id:entry.id,choices:[0,-1]});
 assert.deepEqual([...cloud.files],c);assert.deepEqual([...local.files],l);
 assert.equal(r.opened.length,0);
 assert.match(r.alerts.at(-1).message,/管理記録が両方/);
});
