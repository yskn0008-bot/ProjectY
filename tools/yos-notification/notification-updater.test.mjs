import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const updater=readFileSync(new URL('./YOS-Update-Diagnose-v0.4.js',import.meta.url),'utf8');
const v03=readFileSync(new URL('./Notification-Context-v0.3.js',import.meta.url),'utf8');
const v04=readFileSync(new URL('./Notification-Context-v0.4.js',import.meta.url),'utf8');
const filter=readFileSync(new URL('./Notification-Decision-Filter-v0.5.js',import.meta.url),'utf8');
const fnv=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return(h>>>0).toString(16).padStart(8,'0');};
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
async function simulate(initial,{tamper='',failWrite='',location='local'}={}){
  const files={local:{},cloud:{}};Object.assign(files[location],initial);
  const requests=[];let complete=0,alert='';
  function fs(where){return {
    documentsDirectory:()=>'/'+where,joinPath:(a,b)=>a+'/'+b,
    fileExists:p=>Object.hasOwn(files[where],p.split('/').at(-1)),
    readString:p=>files[where][p.split('/').at(-1)],
    writeString(p,value){if(failWrite&&p.endsWith(failWrite))throw Error('mock write failure');files[where][p.split('/').at(-1)]=value;},
    remove:p=>{delete files[where][p.split('/').at(-1)]},
    isFileStoredIniCloud:()=>false
  }}
  const FileManager={local:()=>fs('local'),iCloud:()=>fs('cloud')};
  const Request=class{
    constructor(url){this.url=url;this.response={statusCode:200};requests.push(url)}
    async loadString(){if(tamper&&this.url.includes(tamper))return '// modified body';
      return this.url.endsWith('Notification-Context-v0.4.js')?v04:filter;}
    async loadJSON(){return {results:[]}}
  };
  const Alert=class{addAction(){}async present(){alert=this.message}};
  const Script={complete(){complete++}};
  await new AsyncFunction('FileManager','Request','Keychain','Alert','Script','Date',updater)(
    FileManager,Request,{contains:()=>false},Alert,Script,Date);
  assert.equal(complete,1);
  return {files,requests,alert};
}
test('existing hashes match the fixed content of both real Scriptable source files',()=>{
  assert.equal(fnv(v03),'28db70dd');
  assert.equal(fnv(v04),'12587c15');
  assert.equal(fnv(filter),'cffeba75');
  assert.match(updater,/12587c15/);
  assert.match(updater,/cffeba75/);
  assert.match(updater,/891fadea7aa2e60239ce56c717dfd9a504b680c4/);
});
test('v0.3 upgrades to v0.4 and installs filter, preserving a local backup',async()=>{
  const x=await simulate({'Notification Context.js':v03});
  assert.equal(x.files.local['Notification Context.js'],v04);
  assert.equal(x.files.local['Notification Decision Filter.js'],filter);
  assert.equal(Object.keys(x.files.local).filter(k=>k.endsWith('.backup')).length,1);
  assert.match(x.alert,/Filter v0\.5：追加済み/);
});
test('v0.4 installs only the missing filter without overwriting Context',async()=>{
  const x=await simulate({'Notification Context.js':v04});
  assert.equal(x.files.local['Notification Context.js'],v04);
  assert.equal(x.files.local['Notification Decision Filter.js'],filter);
  assert.equal(Object.keys(x.files.local).filter(k=>k.endsWith('.backup')).length,0);
  assert.equal(x.requests.length,1);
});
test('rerun with verified current files is idempotent and needs no network',async()=>{
  const x=await simulate({'Notification Context.js':v04,'Notification Decision Filter.js':filter});
  assert.equal(x.requests.length,0);
  assert.equal(Object.keys(x.files.local).length,2);
});
test('never overwrites a conflicting filter installed by the user',async()=>{
  const x=await simulate({'Notification Context.js':v03,'Notification Decision Filter.js':'// customized'});
  assert.equal(x.files.local['Notification Context.js'],v03);
  assert.equal(x.files.local['Notification Decision Filter.js'],'// customized');
  assert.equal(x.requests.length,0);
  assert.match(x.alert,/上書きせず未更新/);
});
test('never changes unexpected Context contents',async()=>{
  const raw='// Custom YOS Notification Context';
  const x=await simulate({'Notification Context.js':raw});
  assert.equal(x.files.local['Notification Context.js'],raw);
  assert.equal(x.requests.length,0);
  assert.equal(x.files.local['Notification Decision Filter.js'],undefined);
});
test('modified filter download aborts before writing original Context',async()=>{
  const x=await simulate({'Notification Context.js':v03},{tamper:'Notification-Decision-Filter-v0.5.js'});
  assert.equal(x.files.local['Notification Context.js'],v03);
  assert.equal(x.files.local['Notification Decision Filter.js'],undefined);
  assert.equal(Object.keys(x.files.local).length,1);
});
test('modified Context download aborts before creating the filter',async()=>{
  const x=await simulate({'Notification Context.js':v03},{tamper:'Notification-Context-v0.4.js'});
  assert.equal(x.files.local['Notification Context.js'],v03);
  assert.equal(x.files.local['Notification Decision Filter.js'],undefined);
});
test('filter write failure restores old Context and keeps no partial new filter',async()=>{
  const x=await simulate({'Notification Context.js':v03},{failWrite:'Notification Decision Filter.js'});
  assert.equal(x.files.local['Notification Context.js'],v03);
  assert.equal(x.files.local['Notification Decision Filter.js'],undefined);
  assert.match(x.alert,/復旧試行済/);
});
test('iCloud Scriptable storage stays in the original iCloud location',async()=>{
  const x=await simulate({'Notification Context.js':v03},{location:'cloud'});
  assert.equal(x.files.cloud['Notification Context.js'],v04);
  assert.equal(x.files.cloud['Notification Decision Filter.js'],filter);
  assert.equal(Object.keys(x.files.local).length,0);
});
