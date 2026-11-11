import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';import vm from 'node:vm';
const read=n=>fs.readFileSync(new URL(n,import.meta.url),'utf8'),productionCode=read('YOS_DAYSTREAM_Timeline_Installer.js'),raw=read('YOS_DAYSTREAM_Timeline_Review_20261105.scriptable'),pkg=JSON.parse(raw),target=pkg.name+'.js',prior='known prior candidate fixture',prior2='known newer candidate fixture',prior3='known last distributed fixture',hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const backupTarget=target+'.'+hash(prior).slice(0,12)+'.previous.txt';
// Simulate installation of this unmerged development package using the production installer's
// safety algorithm. The Draft updater uses a pinned reviewed package commit and strict hashes.
// Keep the existing production branch untouched and preserve unknown-code protection.
const code=productionCode.replace(/async function runVerifiedPreview\(script\)\{[\s\S]*?\n\}/, 'async function runVerifiedPreview(script){previewed.push(script)}').replace("const PREVIOUS_SCRIPT_SHA='b117fcd0c29c1227ef2205866dd19a0dea2564fc9f736806a5c54bdd49d5d1ca'", "const PREVIOUS_SCRIPT_SHA='"+hash(prior)+"'").replace("380b5fad7a68027e46bcca31608101e9f94924372ed1df7b5d0d7fad6c10d809",hash(prior2)).replace("47d78c6fe61eaa5ad8b3f695250559f6e2686dafd8ff16a94eb40647e8469727",hash(prior3)).replace(/const SCRIPT_SHA='[0-9a-f]{64}'/,"const SCRIPT_SHA='"+hash(pkg.script)+"'").replace(/const SCRIPT_LENGTH=\d+/,"const SCRIPT_LENGTH="+pkg.script.length);
async function run({cloudExisting,localExisting,backup,tamper=false,network=false,badReadback=false,externalChange=false,backupFailure=false}={}){
 const cloud=new Map([[target+'.previous.txt','legacy backup preserved'],['YOS_DAYSTREAM_TIMELINE_REVIEW_v1.json','existing plan unchanged'],...(cloudExisting===undefined?[]:[[target,cloudExisting]]),...(backup===undefined?[]:[[backupTarget,backup]])]),local=new Map(localExisting===undefined?[]:[[target,localExisting]]),writes=[],removed=[],opened=[],alerts=[],previewed=[];let targetReads=0;
 const manager=(map,kind)=>({documentsDirectory:()=>'/'+kind,joinPath:(a,b)=>a+'/'+b,fileExists:p=>map.has(p.split('/').pop()),readString:p=>{const k=p.split('/').pop();if(kind==='cloud'&&k===target){targetReads++;if(externalChange&&targetReads===2)map.set(k,'external edit');if(badReadback&&map.get(k)===pkg.script)return 'invalid';}return map.get(k)},writeString:(p,s)=>{if(backupFailure&&p.endsWith('.previous.txt'))throw Error('backup fail');writes.push({kind,p});map.set(p.split('/').pop(),s)},remove:p=>{removed.push(p);map.delete(p.split('/').pop())}});
 const mocks={Request:class{constructor(){this.response={statusCode:network?503:200}}async loadString(){return tamper?JSON.stringify({...pkg,script:pkg.script+'//changed'}):raw}},FileManager:{iCloud:()=>manager(cloud,'cloud'),local:()=>manager(local,'local')},Safari:{open:u=>opened.push(u)},Alert:class{addAction(){}async presentAlert(){alerts.push(this.message)}},Script:{complete(){}}};
 const fn=new (Object.getPrototypeOf(async function(){}).constructor)(...Object.keys(mocks),'previewed',code);await fn(...Object.values(mocks),previewed);assert.equal(cloud.get('YOS_DAYSTREAM_TIMELINE_REVIEW_v1.json'),'existing plan unchanged');assert.equal(cloud.get(target+'.previous.txt'),'legacy backup preserved');return {cloud,local,writes,removed,opened,alerts,previewed};
}
test('draft updater pins the rebuilt candidate to an immutable commit, exact hash and size',()=>{
 const pinned=productionCode.match(/const SOURCE='https:\/\/raw\.githubusercontent\.com\/yskn0008-bot\/ProjectY\/([0-9a-f]{40})\/life\/calendar\/YOS_DAYSTREAM_Timeline_Review_20261105\.scriptable'/);
 assert.ok(pinned,'package must use an immutable commit, never a moving branch');
 assert.match(productionCode,new RegExp("const SCRIPT_SHA='"+hash(pkg.script)+"'"));
 assert.match(productionCode,new RegExp("const SCRIPT_LENGTH="+pkg.script.length+";"));
 assert.equal(pkg.script,read('YOS_DAYSTREAM_TimelineBridge_Dev.js'));
 assert.match(productionCode,/PREVIOUS_SCRIPT_SHA='b117fcd0c29c1227ef2205866dd19a0dea2564fc9f736806a5c54bdd49d5d1ca'/);
 assert.match(productionCode,/4e7ad93cbf8ce64c1e7b4985547caaf0ce9e949a37dfc8d73f647ca11f529c78/);
 assert.equal(pinned[1],'31fe584de7bceea11fbafc9ad6045f2685f8c00c','current package must match the reviewed fixed commit');
 assert.match(productionCode,/58b2956f64f32d04ffec9334df42391a212c5dc652e27091b43b0d905b9ff31e/,'immediate predecessor must remain a protected known-version candidate');
 const html=read('daystream-timeline.html'),bridge=read('YOS_DAYSTREAM_TimelineBridge_Dev.js');
 assert.equal(bridge.match(/const HTML_SHA256 = '([^']+)'/)[1],hash(html),'offline HTML hash must match latest HOME + EDIT');
 assert.match(html,/YOS_APPROVED_GLASS_TIME_RAIL_V1/);
 assert.match(html,/YOS_EDIT_OVERLAP_READABILITY_V2/);
});
test('fresh install reads back code before launch and leaves plan untouched',async()=>{const r=await run();assert.equal(r.writes.length,1);assert.equal(r.cloud.get(target),pkg.script);assert.equal(r.opened.length,1);assert.equal(r.alerts.length,0)});
test('known prior version backs up first and updates same candidate name',async()=>{const r=await run({cloudExisting:prior});assert.equal(r.cloud.get(backupTarget),prior);assert.equal(r.cloud.get(target),pkg.script);assert.ok(r.writes[0].p.endsWith('.previous.txt'));assert.ok(r.writes[1].p.endsWith('.js'));assert.equal(r.opened.length,1)});
test('exact version is no-op, including local storage without cloud duplicate',async()=>{for(const options of [{cloudExisting:pkg.script},{localExisting:pkg.script}]){const r=await run(options);assert.equal(r.writes.length,0);assert.equal(r.opened.length,1)}});
test('unknown same-name code is preserved and only verified new package opens directly',async()=>{for(const options of [{cloudExisting:'unknown'},{localExisting:'unknown'},{cloudExisting:'// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit.\n// icon-color: purple; icon-glyph: magic;\n'+prior}]){const r=await run(options);assert.equal(r.writes.length,0);assert.equal(r.opened.length,0);assert.equal(r.alerts.length,0);assert.deepEqual(r.previewed,[pkg.script]);const original=options.cloudExisting||options.localExisting;assert.equal((options.cloudExisting?r.cloud:r.local).get(target),original)}});
test('ambiguous double installation stays untouched without preview',async()=>{const r=await run({cloudExisting:prior,localExisting:prior});assert.equal(r.writes.length,0);assert.equal(r.opened.length,0);assert.equal(r.alerts.length,1);assert.equal(r.previewed.length,0)});
test('tampered download and HTTP failure never write or launch',async()=>{for(const options of [{tamper:true},{network:true}]){const r=await run(options);assert.equal(r.writes.length,0);assert.equal(r.opened.length,0);assert.equal(r.previewed.length,0)}});
test('unknown backup and failed backup preserve previous candidate',async()=>{for(const options of [{backup:'other'},{backupFailure:true}]){const r=await run({cloudExisting:prior,...options});assert.equal(r.cloud.get(target),prior);assert.equal(r.writes.length,0);assert.equal(r.opened.length,0)}});
test('failed readback restores prior version or removes only new candidate',async()=>{const old=await run({cloudExisting:prior,badReadback:true});assert.equal(old.cloud.get(target),prior);assert.equal(old.cloud.get(backupTarget),prior);assert.equal(old.opened.length,0);const fresh=await run({badReadback:true});assert.equal(fresh.cloud.has(target),false);assert.equal(fresh.removed.length,1);assert.equal(fresh.opened.length,0)});
test('concurrent external edit is preserved and refuses own write',async()=>{const r=await run({cloudExisting:prior,externalChange:true});assert.equal(r.cloud.get(target),'external edit');assert.equal(r.writes.length,0);assert.equal(r.opened.length,0)});

test('newer reviewed version uses own backup while legacy backup remains intact',async()=>{const r=await run({cloudExisting:prior2});assert.equal(r.cloud.get(target),pkg.script);assert.equal(r.cloud.get(target+'.'+hash(prior2).slice(0,12)+'.previous.txt'),prior2);assert.equal(r.opened.length,1)});

test('last distributed glass candidate updates with its own verified backup',async()=>{const r=await run({cloudExisting:prior3});assert.equal(r.cloud.get(target),pkg.script);assert.equal(r.cloud.get(target+'.'+hash(prior3).slice(0,12)+'.previous.txt'),prior3);assert.equal(r.opened.length,1)});

test('unrecognized target plus tampered payload never executes any code or changes files',async()=>{const r=await run({cloudExisting:'unknown',tamper:true});assert.equal(r.writes.length,0);assert.equal(r.previewed.length,0);assert.equal(r.opened.length,0);assert.equal(r.cloud.get(target),'unknown');assert.equal(r.alerts.length,1)});
test('direct preview helper executes async package text in its own function',async()=>{const helper=productionCode.match(/async function runVerifiedPreview\(script\)\{[\s\S]*?\n\}/)[0];const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;const probe=new AsyncFunction(helper+'\nawait runVerifiedPreview(\'await Promise.resolve(); throw new Error("verified-preview-probe");\');');await assert.rejects(probe(),/verified-preview-probe/)});

test('staged .js script stays identical to native bridge and uses the shared installer name contract',()=>{
 const name='YOS DAYSTREAM Timeline 開発確認 20261105';
 const js=read('../../ios-app/scriptable/'+name+'.js');
 const bridge=read('YOS_DAYSTREAM_TimelineBridge_Dev.js');
 const expected='// Variables used by Scriptable.\n// icon-color: gray; icon-glyph: calendar;\n// YOS_SCRIPT_NAME: '+name+'\n'+bridge;
 assert.equal(js,expected,'shared distribution must be generated from the native bridge, not a divergent copy');
 assert.equal(js.split(/\r?\n/).slice(0,20).find(x=>x.startsWith('// YOS_SCRIPT_NAME: ')),'// YOS_SCRIPT_NAME: '+name);
 assert.match(js,/YOS_DAYSTREAM_TIMELINE_REVIEW_v1\.json/);
 assert.ok(js.length<1200000,'must stay inside the existing common installer download limit');
 new (Object.getPrototypeOf(async function(){}).constructor)(js);
 const catalog=JSON.parse(read('../../ios-app/scriptable/yos-common-installer-catalog.json'));
 const registered=catalog.targets.filter(x=>x.name===name);
 assert.ok(registered.length<=1,'main catalog must not duplicate the same formal script name');
 if(registered.length){
   const e=registered[0];
   assert.equal(e.id,'daystream-preview','catalog entry must reuse the approved preview ID');
   assert.equal(e.path,'ios-app/scriptable/'+name+'.js','catalog must point to the existing staged script');
   assert.equal(e.sha256,hash(js),'catalog hash must match staged bytes, not an unrelated package');
   assert.match(e.commit,/^[0-9a-f]{40}$/u,'catalog must use an immutable reviewed commit');
 }
});

const sharedEntryName='YOS DAYSTREAM Timeline 開発確認 20261105';
const sharedEntryPath='ios-app/scriptable/'+sharedEntryName+'.js';
const sharedEntryPin='eed19ab2b6cec79162abe3958e2b43ed4d8207d6';
const sharedCandidate=read('../../'+sharedEntryPath);
function sharedFM(root){
 const files=new Map(),dirs=new Set([root]);
 return {files,dirs,documentsDirectory:()=>root,joinPath:(a,b)=>a.replace(/\/$/,'')+'/'+b,
  fileExists:p=>files.has(p)||dirs.has(p),
  createDirectory(p){let x='';for(const s of p.split('/').filter(Boolean)){x+='/'+s;dirs.add(x)}},
  readString(p){if(!files.has(p))throw Error('file missing '+p);return files.get(p)},
  writeString(p,v){if(!dirs.has(p.slice(0,p.lastIndexOf('/'))))throw Error('parent missing');files.set(p,String(v))},
  remove(p){files.delete(p)},isFileStoredIniCloud(){return false},async downloadFileFromiCloud(){}
 };
}
async function runSharedTimeline({cloud=sharedFM('/icloud'),local=sharedFM('/local'),offline=false,tamper=false}={}){
 const code=read('../../ios-app/scriptable/YOS Common Installer.js');
 const entry={id:'daystream-candidate',name:sharedEntryName,path:sharedEntryPath,commit:sharedEntryPin,sha256:hash(sharedCandidate)};
 const catalog={schema:1,repository:'yskn0008-bot/ProjectY',targets:[entry]};
 const opened=[],alerts=[],requests=[],expectedUrl='https://raw.githubusercontent.com/yskn0008-bot/ProjectY/'+sharedEntryPin+'/'+sharedEntryPath.split('/').map(encodeURIComponent).join('/');
 class Request{
  constructor(url){this.url=url;this.response=null;requests.push(url)}
  async loadString(){
   if(offline)throw Error('offline');this.response={statusCode:200};
   if(this.url.endsWith('/main/ios-app/scriptable/yos-common-installer-catalog.json'))return JSON.stringify(catalog);
   if(this.url===expectedUrl)return tamper?sharedCandidate+'\n// tampered':sharedCandidate;
   throw Error('unexpected URL: '+this.url);
  }
 }
 class Alert{constructor(){this.title='';this.message=''}addAction(){}addCancelAction(){}async presentAlert(){alerts.push({title:this.title,message:this.message});return -1}}
 const globals={Request,Alert,FileManager:{iCloud:()=>cloud,local:()=>local},Safari:{open:x=>opened.push(x)},Script:{complete(){}},args:{shortcutParameter:'daystream-candidate',queryParameters:{}},console};
 await vm.runInNewContext('(async()=>{'+code+'})()',globals,{timeout:10000});
 return {cloud,local,entry,opened,alerts,requests,expectedUrl};
}
test('the real YOS Common Installer accepts the staged timeline, verifies SHA and stores it under its formal name without auto-running',async()=>{
 const r=await runSharedTimeline();
 const target='/icloud/'+sharedEntryName+'.js';
 const receipt='/icloud/YOS Common Installer Data/'+encodeURIComponent(sharedEntryName)+'.receipt.json';
 assert.equal(r.cloud.files.get(target),sharedCandidate,'installed script must equal immutable pinned candidate');
 const saved=JSON.parse(r.cloud.files.get(receipt));
 assert.equal(saved.name,sharedEntryName);assert.equal(saved.sha256,hash(sharedCandidate));
 assert.equal(saved.commit,sharedEntryPin);assert.equal(r.opened.length,0);
 assert.ok(r.requests.includes(r.expectedUrl),'installer must request exact immutable URL with encoded name');
 assert.match(r.alerts.at(-1).title,/登録完了/);
});
test('shared installer protects an unknown same-name timeline in either storage and refuses a double collision',async()=>{
 const c=sharedFM('/icloud'),l=sharedFM('/local'),target='/icloud/'+sharedEntryName+'.js';
 c.files.set(target,'PERSONAL USER CODE');
 let r=await runSharedTimeline({cloud:c,local:l});
 assert.equal(c.files.get(target),'PERSONAL USER CODE');
 assert.equal(r.opened.length,0);assert.match(r.alerts.at(-1).message,/管理情報|変更された/);
 l.files.set('/local/'+sharedEntryName+'.js','OTHER USER CODE');
 r=await runSharedTimeline({cloud:c,local:l});
 assert.equal(c.files.get(target),'PERSONAL USER CODE');assert.equal(l.files.get('/local/'+sharedEntryName+'.js'),'OTHER USER CODE');
 assert.match(r.alerts.at(-1).message,/両方/);assert.equal(r.opened.length,0);
});
test('shared installer rejects altered timeline downloads and offline failures without creating a candidate',async()=>{
 for(const opts of [{tamper:true},{offline:true}]){
  const r=await runSharedTimeline(opts);
  assert.equal(r.cloud.files.has('/icloud/'+sharedEntryName+'.js'),false);
  assert.equal(r.local.files.has('/local/'+sharedEntryName+'.js'),false);
  assert.equal(r.opened.length,0);
  assert.match(r.alerts.at(-1).title,/未完了/);
 }
});
