import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const runtime=fs.readFileSync(new URL('../inline/common-installer-2-bootstrap.js',import.meta.url),'utf8');
const source=fs.readFileSync(new URL('../../../ios-app/scriptable/YOS Common Installer 2.js',import.meta.url),'utf8');
const name='YOS Common Installer 2.js',path='/cloud/'+name;
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
function store(root){const files=new Map([[root+'/YOS Common Installer.js','KEEP']]);return {files,documentsDirectory:()=>root,joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p),readString:p=>{if(!files.has(p))throw Error('missing');return files.get(p)},writeString:(p,v)=>files.set(p,v),remove:p=>files.delete(p),move:(a,b)=>{if(files.has(b))throw Error('collision');files.set(b,files.get(a));files.delete(a)}}}
async function run({existing=null,duplicate=false,cancel=false,bad=false,race=false,moveFail=false,cloudFail=false}={}){
 const cloud=store('/cloud'),local=store('/local'),alerts=[],requests=[];
 if(existing!==null)cloud.files.set(path,existing);
 if(duplicate)local.files.set('/local/'+name,'PRIVATE');
 if(moveFail)cloud.move=()=>{throw Error('move failed')};
 class Request{constructor(url){this.url=url;this.response={statusCode:200}}async loadString(){requests.push(this.url);return bad?'bad':source}async loadJSON(){return {encoding:'base64',content:Buffer.from('bad').toString('base64'),size:3}}}
 class Alert{addAction(){}addCancelAction(){}async presentAlert(){alerts.push(this.title);if(this.title==='2号機の初回登録'){if(race)local.files.set('/local/'+name,'RACE');return cancel?-1:0}return 0}}
 await new vm.Script('(async()=>{\n'+runtime+'\n})()').runInNewContext({FileManager:{iCloud:()=>{if(cloudFail)throw Error('offline');return cloud},local:()=>local},Request,Alert,Data:{fromBase64String:s=>({toRawString:()=>Buffer.from(s,'base64').toString()})},Script:{complete(){}}});
 assert.equal(cloud.files.get('/cloud/YOS Common Installer.js'),'KEEP');assert.equal(local.files.get('/local/YOS Common Installer.js'),'KEEP');
 return {cloud,local,alerts,requests};
}
test('exact source pin',()=>assert.equal(sha(source),'c113d032e377be85acb8767672a67ebd5c473e66fa0b3b0ee34d90dc6681c301'));
test('fresh registration readback',async()=>{const r=await run();assert.equal(r.cloud.files.get(path),source);assert.equal(r.alerts.at(-1),'登録完了')});
test('identical already installed',async()=>{const r=await run({existing:source});assert.equal(r.requests.length,0);assert.equal(r.alerts.at(-1),'登録済み')});
test('private same-name file protected',async()=>{const r=await run({existing:'PRIVATE'});assert.equal(r.cloud.files.get(path),'PRIVATE');assert.equal(r.requests.length,0)});
test('two stores protected',async()=>{const r=await run({existing:source,duplicate:true});assert.equal(r.local.files.get('/local/'+name),'PRIVATE');assert.equal(r.requests.length,0)});
test('cancel no file',async()=>assert.equal((await run({cancel:true})).cloud.files.has(path),false));
test('hash mismatch no file',async()=>assert.equal((await run({bad:true})).cloud.files.has(path),false));
test('race protected',async()=>{const r=await run({race:true});assert.equal(r.cloud.files.has(path),false);assert.equal(r.local.files.get('/local/'+name),'RACE')});
test('failed move removes only verified staging file',async()=>{const r=await run({moveFail:true});assert.equal(r.cloud.files.size,1);assert.equal(r.alerts.at(-1),'安全停止')});
test('iCloud unavailable stops safely',async()=>{const r=await run({cloudFail:true});assert.equal(r.requests.length,0);assert.equal(r.cloud.files.size,1)});
