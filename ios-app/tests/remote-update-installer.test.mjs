import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Update Installer.js', import.meta.url), 'utf8');
const SOURCE_SHA = '319acf06bfaa265b2d9bf8b62de564ebb36ad59e';
const TARGETS = [
  'リモコン.js','テレビリモコン.js','エアコンリモコン.js','エアコンウィジェット.js',
  '照明リモコン.js','照明ウィジェット.js','リモコン/内部/Tapo共通.js','リモコン整理.js'
];

function parent(path){ const i=path.lastIndexOf('/'); return i<=0?'/':path.slice(0,i); }
function makeManager(root,{failLiveTarget=null}={}){
  const files=new Map();
  const dirs=new Set(['/',root]);
  const fault={failLiveTarget,failedOnce:false};
  const manager={
    files,dirs,fault,
    documentsDirectory(){return root;},
    joinPath(a,b){return a.replace(/\/$/,'')+'/'+b;},
    fileExists(p){return files.has(p)||dirs.has(p);},
    createDirectory(p){const parts=p.split('/').filter(Boolean);let cur='';for(const part of parts){cur+='/'+part;dirs.add(cur);}},
    writeString(p,v){if(fault.failLiveTarget&&!fault.failedOnce&&p===`${root}/${fault.failLiveTarget}`){fault.failedOnce=true;throw new Error('synthetic live write failure');}if(!dirs.has(parent(p)))throw new Error('parent missing '+parent(p));files.set(p,String(v));},
    readString(p){if(!files.has(p))throw new Error('missing '+p);return files.get(p);},
    remove(p){files.delete(p);dirs.delete(p);for(const k of [...files.keys()])if(k.startsWith(p+'/'))files.delete(k);for(const k of [...dirs])if(k.startsWith(p+'/'))dirs.delete(k);},
    move(src,dst){
      if(files.has(src)){if(!dirs.has(parent(dst)))throw new Error('parent missing '+parent(dst));const v=files.get(src);files.delete(src);files.set(dst,v);return;}
      if(!dirs.has(src))throw new Error('move missing '+src);
      this.createDirectory(dst);
      for(const [k,v] of [...files.entries()])if(k.startsWith(src+'/')){files.delete(k);files.set(dst+k.slice(src.length),v);}
      for(const k of [...dirs].sort((a,b)=>a.length-b.length))if(k.startsWith(src+'/')){dirs.delete(k);dirs.add(dst+k.slice(src.length));}
      dirs.delete(src);
    },
    listContents(p){const prefix=p.replace(/\/$/,'')+'/';const out=new Set();for(const k of [...dirs,...files.keys()])if(k.startsWith(prefix)){const rest=k.slice(prefix.length);if(rest&&!rest.includes('/'))out.add(rest);}return [...out];},
    isFileStoredIniCloud(){return false;},
    async downloadFileFromiCloud(){}
  };
  return manager;
}
function put(manager,name,content='OLD'){const path=manager.joinPath(manager.documentsDirectory(),name);manager.createDirectory(parent(path),true);manager.writeString(path,content);}
function transformedFixture(name){return `// ${name}\nconst hub='YOS Remote Hub';const tv='YOS BRAVIA Remote';const ac='YOS AC Remote';const acw='YOS AC Widget';const light='YOS Light Remote';const lw='YOS Light Widget';const core=importModule('YOS Tapo H110 Core');`;}
async function run(iCloud,local,action=null,globalObj={}){
  const requests=[];
  class Request{constructor(url){this.url=url;this.response=null;requests.push(url);}async loadString(){this.response={statusCode:200};return transformedFixture(decodeURIComponent(this.url.split('/').pop()));}}
  const opened=[];
  const Safari={open:url=>opened.push(url)};
  class Alert{constructor(){this.title='';this.message='';}addAction(){}async presentAlert(){}}
  const Script={complete(){}};
  const FileManager={iCloud:()=>iCloud,local:()=>local};
  const args={queryParameters:action?{action}:{}};
  const fn=new Function('FileManager','Request','Safari','Alert','Script','args','globalThis',`return (async()=>{${source}})()`);
  await fn(FileManager,Request,Safari,Alert,Script,args,globalObj);
  return {opened,requests};
}
function japaneseBackupDirs(manager,prefix){const base=manager.joinPath(manager.documentsDirectory(),'リモコン/保管');if(!manager.fileExists(base))return[];return manager.listContents(base).filter(x=>x.startsWith(prefix)).sort();}
function seedInterrupted(manager,{phase='committing',mismatch=false}={}){
  const root=manager.documentsDirectory();
  const r=`${root}/リモコン更新_復旧中`;
  manager.createDirectory(`${r}/stage`,true);manager.createDirectory(`${r}/backup`,true);
  const entries=[];
  TARGETS.slice(0,3).forEach((target,i)=>{
    const old=`OLD:${target}`,neu=`NEW:${target}`;
    const stage=`${r}/stage/${target}`,backup=`${r}/backup/${target}`,live=`${root}/${target}`;
    manager.createDirectory(parent(stage),true);manager.createDirectory(parent(backup),true);manager.createDirectory(parent(live),true);
    manager.writeString(stage,neu);manager.writeString(backup,old);manager.writeString(live,i<1?neu:old);
    entries.push({source:'x',target,existed:true});
  });
  if(mismatch)manager.writeString(`${root}/${TARGETS[0]}`,'CORRUPT');
  manager.writeString(`${r}/manifest.json`,JSON.stringify({version:2,id:'2026-09-13T00-00-00-000Z',sourceSha:SOURCE_SHA,phase,entries,applied:[TARGETS[0]]}));
}

test('source is pinned and Japanese package layout is explicit',()=>{
  assert.match(source,new RegExp(SOURCE_SHA));
  assert.doesNotMatch(source,/const BRANCH\s*=/);
  for(const target of TARGETS)assert.ok(source.includes(target),target);
});

test('successful update writes Japanese scripts, internal folder, transformed links and organizer',async()=>{
  const iCloud=makeManager('/icloud'),local=makeManager('/local');
  put(iCloud,'YOS Remote Hub.js','OLD HUB');put(iCloud,'YOS Light Widget.js','OLD WIDGET');
  const {opened,requests}=await run(iCloud,local);
  for(const target of TARGETS)assert.equal(iCloud.fileExists(`/icloud/${target}`),true,target);
  const hub=iCloud.readString('/icloud/リモコン.js');
  assert.match(hub,/テレビリモコン/);assert.match(hub,/リモコン\/内部\/Tapo共通/);assert.doesNotMatch(hub,/YOS BRAVIA Remote/);
  assert.match(iCloud.readString('/icloud/リモコン整理.js'),/リモコン整理 v2\.0/);
  assert.equal(requests.length,7);
  assert.equal(opened.length,1);assert.match(opened[0],/scriptName=%E3%83%AA%E3%83%A2%E3%82%B3%E3%83%B3/);
  assert.equal(iCloud.fileExists('/icloud/YOS Remote Hub.js'),false);
  assert.equal(iCloud.fileExists('/icloud/YOS Light Widget.js'),false);
  assert.equal(japaneseBackupDirs(iCloud,'更新前 ').length,1);
  assert.equal(japaneseBackupDirs(iCloud,'英語旧版 ').length,1);
});

test('synthetic mid-commit failure restores pre-existing Japanese targets and leaves English originals',async()=>{
  const iCloud=makeManager('/icloud',{failLiveTarget:'照明リモコン.js'}),local=makeManager('/local');
  put(iCloud,'リモコン.js','OLDJP');put(iCloud,'YOS Remote Hub.js','OLDEN');
  const {opened}=await run(iCloud,local);
  assert.equal(iCloud.readString('/icloud/リモコン.js'),'OLDJP');
  assert.equal(iCloud.readString('/icloud/YOS Remote Hub.js'),'OLDEN');
  assert.equal(iCloud.fileExists('/icloud/照明リモコン.js'),false);
  assert.equal(opened.length,0);
  assert.equal(japaneseBackupDirs(iCloud,'更新失敗 ').length,1);
});

test('interrupted mixed commit is recovered before a new update',async()=>{
  const iCloud=makeManager('/icloud'),local=makeManager('/local');seedInterrupted(iCloud,{phase:'committing'});
  const {requests,opened}=await run(iCloud,local,'recover');
  for(const target of TARGETS.slice(0,3))assert.equal(iCloud.readString(`/icloud/${target}`),`OLD:${target}`);
  assert.equal(requests.length,0);assert.equal(opened.length,0);assert.equal(iCloud.fileExists('/icloud/リモコン更新_復旧中'),false);
  assert.equal(japaneseBackupDirs(iCloud,'更新失敗 ').length,1);
});

test('committed mismatch rolls back instead of repeating update',async()=>{
  const iCloud=makeManager('/icloud'),local=makeManager('/local');seedInterrupted(iCloud,{phase:'committed',mismatch:true});
  const {requests}=await run(iCloud,local,'recover');
  for(const target of TARGETS.slice(0,3))assert.equal(iCloud.readString(`/icloud/${target}`),`OLD:${target}`);
  assert.equal(requests.length,0);
});

test('manual rollback restores latest Japanese snapshot',async()=>{
  const iCloud=makeManager('/icloud'),local=makeManager('/local');
  for(const target of TARGETS)put(iCloud,target,`OLD:${target}`);
  await run(iCloud,local);
  await run(iCloud,local,'rollback');
  for(const target of TARGETS)assert.equal(iCloud.readString(`/icloud/${target}`),`OLD:${target}`);
});
