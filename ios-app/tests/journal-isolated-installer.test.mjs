import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const installer=readFileSync(new URL('../scriptable/YOS JOURNAL Installer.js',import.meta.url),'utf8');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const verified='// Variables used by Scriptable.\n// YOS JOURNAL v1.6 — test\nconst web=new WebView();';

async function run({initial={},status=200,response=verified}={}){
  const files=new Map(Object.entries(initial)),alerts=[];
  const fm={
    documentsDirectory:()=>'/local',
    joinPath:(a,b)=>a+'/'+b,
    fileExists:p=>files.has(p),
    readString:p=>files.get(p),
    writeString:(p,v)=>files.set(p,v)
  };
  const FileManager={local:()=>fm};
  class Request{
    constructor(url){this.url=url;this.response=null}
    async loadString(){this.response={statusCode:status};return response}
  }
  class Alert{
    constructor(){this.title='';this.message=''}
    addAction(){}
    async presentAlert(){alerts.push({title:this.title,message:this.message})}
  }
  await new AsyncFunction('FileManager','Request','Alert','Script',installer)(
    FileManager,Request,Alert,{complete(){}}
  );
  return {files,alerts};
}

test('test installer installs only a separately named v1.6 script',async()=>{
  const {files,alerts}=await run();
  assert.equal(files.get('/local/YOS JOURNAL v1.6 検証.js'),verified);
  assert.equal(files.size,1);
  assert.match(alerts.at(-1).title,/登録完了/);
});

test('existing JOURNAL and YOS JOURNAL versions are never replaced or renamed',async()=>{
  const originals={
    '/local/JOURNAL.js':'USER v1.5 SCRIPT',
    '/local/YOS JOURNAL.js':'ORIGINAL v1.4 SCRIPT'
  };
  const {files}=await run({initial:originals});
  for(const [name,source] of Object.entries(originals))assert.equal(files.get(name),source);
  assert.equal(files.get('/local/YOS JOURNAL v1.6 検証.js'),verified);
});

test('repeat run recognizes already installed v1.6 and does not create duplicates',async()=>{
  const existing={'/local/YOS JOURNAL v1.6 検証.js':verified};
  const {files,alerts}=await run({initial:existing});
  assert.equal(files.size,1);
  assert.match(alerts.at(-1).title,/導入済み/);
});

test('unknown code under first test name is not overwritten',async()=>{
  const existing={'/local/YOS JOURNAL v1.6 検証.js':'MY PERSONAL SCRIPT'};
  const {files}=await run({initial:existing});
  assert.equal(files.get('/local/YOS JOURNAL v1.6 検証.js'),'MY PERSONAL SCRIPT');
  assert.equal(files.get('/local/YOS JOURNAL v1.6 検証 2.js'),verified);
});

test('HTTP failure and version mismatch do not create a file',async()=>{
  for(const opts of [{status:500},{response:'// untrusted code'}]){
    const files=new Map();
    await assert.rejects(()=>run(opts));
    assert.equal(files.size,0);
  }
});

test('download target uses immutable reviewed commit',()=>{
  assert.match(installer,/fe08d4ebd8f0d75e88ab0eb9a46740b6d6fa1b8f/);
  assert.doesNotMatch(installer,/const raw="[^"]+\/main\//);
  assert.doesNotMatch(installer,/const names=\["YOS JOURNAL"/);
});
