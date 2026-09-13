import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Update Installer.js', import.meta.url), 'utf8');
const FILES = [
  'YOS Tapo H110 Core.js','YOS AC Remote.js','YOS AC Widget.js','YOS BRAVIA Remote.js',
  'YOS Light Remote.js','YOS Light Widget.js','YOS Remote Hub.js'
];
const SOURCE_SHA = '71d6832551d63a1b0f0eda2e9f1d67b1d012369a';

function parent(path){ const i=path.lastIndexOf('/'); return i<=0?'/':path.slice(0,i); }
function makeEnv({failLiveName=null}={}){
  const files = new Map();
  const dirs = new Set(['/','/docs']);
  const fault={failLiveName,failedOnce:false};
  const fm = {
    documentsDirectory(){return '/docs';},
    joinPath(a,b){return a.replace(/\/$/,'')+'/'+b;},
    fileExists(p){return files.has(p)||dirs.has(p);},
    createDirectory(p){
      const parts=p.split('/').filter(Boolean); let cur='';
      for(const part of parts){cur+='/'+part;dirs.add(cur);}
    },
    writeString(p,v){
      if(fault.failLiveName && !fault.failedOnce && p===`/docs/${fault.failLiveName}`){fault.failedOnce=true;throw new Error('synthetic live write failure');}
      if(!dirs.has(parent(p))) throw new Error('parent missing '+parent(p));
      files.set(p,String(v));
    },
    readString(p){if(!files.has(p)) throw new Error('missing '+p);return files.get(p);},
    remove(p){
      files.delete(p); dirs.delete(p);
      for(const k of [...files.keys()]) if(k.startsWith(p+'/')) files.delete(k);
      for(const k of [...dirs]) if(k.startsWith(p+'/')) dirs.delete(k);
    },
    move(src,dst){
      if(files.has(src)){ const v=files.get(src); files.delete(src); this.createDirectory(parent(dst)); files.set(dst,v); return; }
      if(!dirs.has(src)) throw new Error('move missing '+src);
      this.createDirectory(dst);
      for(const [k,v] of [...files.entries()]) if(k.startsWith(src+'/')){files.delete(k);files.set(dst+k.slice(src.length),v);}
      for(const k of [...dirs].sort((a,b)=>a.length-b.length)) if(k.startsWith(src+'/')){dirs.delete(k);dirs.add(dst+k.slice(src.length));}
      dirs.delete(src);
    },
    listContents(p){
      const prefix=p.replace(/\/$/,'')+'/';
      const out=new Set();
      for(const k of [...dirs,...files.keys()]) if(k.startsWith(prefix)){const rest=k.slice(prefix.length);if(rest&&!rest.includes('/'))out.add(rest);}
      return [...out];
    },
    isFileStoredIniCloud(){return false;},
    async downloadFileFromiCloud(){}
  };
  const requests=[];
  class Request {
    constructor(url){this.url=url;this.timeoutInterval=0;this.response=null;requests.push(url);}
    async loadString(){
      this.response={statusCode:200};
      const name=decodeURIComponent(this.url.split('/').pop());
      return `NEW:${name}:`+'x'.repeat(30);
    }
  }
  const opened=[];
  const Safari={open:url=>opened.push(url)};
  class Alert {constructor(){this.title='';this.message='';} addAction(){} async presentAlert(){} }
  const Script={complete(){}};
  return {fm,files,dirs,Request,Safari,Alert,Script,opened,requests,fault};
}

function seedOld(env){for(const name of FILES) env.fm.writeString(`/docs/${name}`,`OLD:${name}`);}
async function run(env,action=null,globalObj={}){
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  const fn=new AsyncFunction('FileManager','Request','Safari','Alert','Script','args','globalThis',source);
  await fn({iCloud:()=>env.fm},env.Request,env.Safari,env.Alert,env.Script,{queryParameters:action?{action}:{}},globalObj);
}
function listDocDirs(env,prefix){return env.fm.listContents('/docs').filter(x=>x.startsWith(prefix)).sort();}

function seedInterrupted(env,{phase='committing',mismatch=false}={}){
  const r='/docs/YOS Remote Update Recovery';
  env.fm.createDirectory(`${r}/stage`,true);env.fm.createDirectory(`${r}/backup`,true);
  const entries=[];
  FILES.forEach((name,i)=>{
    const old=`OLD:${name}`, neu=`NEW:${name}:`+'x'.repeat(30);
    env.fm.writeString(`${r}/backup/${name}`,old);
    env.fm.writeString(`${r}/stage/${name}`,neu);
    env.fm.writeString(`/docs/${name}`, i<2 ? neu : old);
    entries.push({name,existed:true});
  });
  if(mismatch) env.fm.writeString(`/docs/${FILES[0]}`,'CORRUPT');
  env.fm.writeString(`${r}/manifest.json`,JSON.stringify({version:1,id:'2026-09-13T00-00-00-000Z',sourceSha:SOURCE_SHA,phase,entries,applied:FILES.slice(0,2)}));
}

test('source is pinned to a verified commit, not a moving branch',()=>{
  assert.match(source,new RegExp(SOURCE_SHA));
  assert.doesNotMatch(source,/const BRANCH\s*=/);
});

test('successful update stages all files, switches complete set, and preserves rollback snapshot',async()=>{
  const env=makeEnv();seedOld(env);await run(env);
  for(const name of FILES) assert.equal(env.files.get(`/docs/${name}`),`NEW:${name}:`+'x'.repeat(30));
  assert.equal(env.fm.fileExists('/docs/YOS Remote Update Recovery'),false);
  assert.equal(listDocDirs(env,'YOS Remote Backup ').length,1);
  assert.equal(env.opened.length,1);
  assert.equal(env.requests.length,FILES.length);
});

test('synthetic mid-commit write failure restores the complete old set (no mixed version)',async()=>{
  const env=makeEnv();seedOld(env);env.fault.failLiveName='YOS AC Widget.js';await run(env);
  for(const name of FILES) assert.equal(env.files.get(`/docs/${name}`),`OLD:${name}`);
  assert.equal(env.fm.fileExists('/docs/YOS Remote Update Recovery'),false);
  assert.equal(listDocDirs(env,'YOS Remote Failed Update ').length,1);
  assert.equal(env.opened.length,0);
});

test('interrupted mixed commit is recovered before any new update is attempted',async()=>{
  const env=makeEnv();seedInterrupted(env,{phase:'committing'});await run(env,'recover');
  for(const name of FILES) assert.equal(env.files.get(`/docs/${name}`),`OLD:${name}`);
  assert.equal(env.fm.fileExists('/docs/YOS Remote Update Recovery'),false);
  assert.equal(listDocDirs(env,'YOS Remote Failed Update ').length,1);
  assert.equal(env.requests.length,0);
  assert.equal(env.opened.length,0);
});

test('unknown committed result with mismatch rolls back instead of repeating update',async()=>{
  const env=makeEnv();seedInterrupted(env,{phase:'committed',mismatch:true});await run(env,'recover');
  for(const name of FILES) assert.equal(env.files.get(`/docs/${name}`),`OLD:${name}`);
  assert.equal(env.requests.length,0);
});

test('manual rollback restores the snapshot from the latest successful update',async()=>{
  const env=makeEnv();seedOld(env);await run(env);await run(env,'rollback');
  for(const name of FILES) assert.equal(env.files.get(`/docs/${name}`),`OLD:${name}`);
  assert.equal(env.opened.length,1);
});
