import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../scriptable/YOS Scriptable 棚卸し.js',import.meta.url),'utf8');
const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
const entry=catalog.targets.find(t=>t.id==='scriptable-inventory');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');

function store(files,cloud=false){
 const names=Object.keys(files);
 const calls={writes:0,removes:0,downloads:0};
 const fm={
  documentsDirectory(){return cloud?'/cloud':'/local'},
  joinPath(a,b){return a+'/'+b},
  listContents(dir){assert.equal(dir,cloud?'/cloud':'/local');return names},
  isDirectory(){return false},
  fileExists(p){return Object.hasOwn(files,p.split('/').at(-1))},
  modificationDate(){return new Date('2026-11-19T00:00:00Z')},
  isFileStoredIniCloud(){return cloud},
  async downloadFileFromiCloud(){calls.downloads++;await Promise.resolve()},
  readString(p){return files[p.split('/').at(-1)]},
  writeString(){calls.writes++;throw Error('write forbidden')},
  remove(){calls.removes++;throw Error('delete forbidden')},
 };
 return {fm,calls};
}
async function run(cloudFiles,localFiles){
 const cloud=store(cloudFiles,true),local=store(localFiles);
 let copied=null,alert=null,network=0;
 class Alert{constructor(){this.title='';this.message='';alert=this}addAction(){}async present(){return 0}}
 class Request{constructor(){network++;throw Error('network forbidden')}}
 const ctx={FileManager:{iCloud:()=>cloud.fm,local:()=>local.fm},Pasteboard:{copyString:x=>{copied=x}},Alert,Request,Date,Map,Set,String,Array,Promise,console};
 await new vm.Script('(async()=>{'+source+'})()').runInNewContext(ctx,{timeout:5000});
 return {copied,alert,cloud:cloud.calls,local:local.calls,network};
}

test('existing installer pins inventory under its established Japanese name',()=>{
 assert.ok(entry);
 assert.equal(entry.name,'YOS Scriptable 棚卸し');
 assert.equal(entry.path,'ios-app/scriptable/YOS Scriptable 棚卸し.js');
 assert.equal(entry.sha256,hash(source));
 assert.match(source,/^\/\/ Variables used by Scriptable\./);
 assert.match(source,/YOS_SCRIPT_NAME: YOS Scriptable 棚卸し/);
});
test('read-only scan detects duplicate differing scripts and never exports source',async()=>{
 const r=await run({'リモコン.js':'// PRIVATE SECRET iCloud','他の機能.js':'runExisting("リモコン")'},{'リモコン.js':'// PRIVATE SECRET local'});
 assert.match(r.copied,/同名グループ：1/);
 assert.match(r.copied,/【調査先】/);
 assert.match(r.copied,/【リモコン更新の安全診断】/);
 assert.match(r.copied,/このiPhone内 23文字/);
 assert.match(r.copied,/リモコン：iCloud \/ このiPhone内｜内容 相違/);
 assert.match(r.copied,/他コードから名前参照/);
 assert.doesNotMatch(r.copied,/PRIVATE SECRET/);
 assert.equal(r.cloud.downloads,2);
 assert.equal(r.cloud.writes+r.cloud.removes+r.local.writes+r.local.removes+r.network,0);
 assert.match(r.alert.title,/変更なし/);
});
test('same-code duplicates are detected without marking safe to delete',async()=>{
 const r=await run({'リモコン.js':'// SAME'},{'リモコン.js':'// SAME'});
 assert.match(r.copied,/内容 完全一致/);
 assert.match(r.copied,/削除しないでください/);
});

test('empty scan warns rather than claiming inventory is complete',async()=>{
 const r=await run({},{});
 assert.match(r.copied,/【警告】0件は正常な棚卸し結果として扱いません/);
 assert.match(r.copied,/iCloud：\/cloud｜直下 0件/);
 assert.equal(r.cloud.writes+r.local.writes+r.cloud.removes+r.local.removes,0);
});

test('large iCloud root never starves local remote detection',async()=>{
 const many=Object.fromEntries(Array.from({length:340},(_,i)=>['other-'+i+'.js','// test']));
 const r=await run({...many,'リモコン.js':'// CLOUD'}, {'リモコン.js':'// LOCAL'});
 assert.match(r.copied,/リモコン：iCloud \/ このiPhone内｜内容 相違/);
 assert.match(r.copied,/※iCloud・このiPhone内をそれぞれ独立に調査/);
 assert.equal(r.cloud.writes+r.local.writes+r.cloud.removes+r.local.removes,0);
});
