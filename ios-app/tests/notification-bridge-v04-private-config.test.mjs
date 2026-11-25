import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const source=fs.readFileSync(new URL('../scriptable/Notification Bridge.js',import.meta.url),'utf8');

function makeNoticeMock(options={}){
 const files=new Map(),cloud=new Map(),keys=new Map([['YOS_NOTION_INTEGRATION_TOKEN','mock-token-only']]),blocks=[];
 let output,patches=0,reads=0;
 const id='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const cfg="const CFG = Object.freeze({\n inboxId: '"+id+"',\n tokenKey: 'YOS_NOTION_INTEGRATION_TOKEN',\n version: '2025-09-03',\n});";
 const fm=(map,root)=>({documentsDirectory:()=>root,joinPath:(a,b)=>a+'/'+b,fileExists:p=>map.has(p),readString:p=>{if(!map.has(p))throw Error('missing');return map.get(p)},writeString:(p,v)=>map.set(p,v),isFileStoredIniCloud:()=>false});
 if(!options.noConfig)files.set('/local/YOS Clarity Inbox Bridge.js',cfg);
 if(options.conflict)cloud.set('/cloud/YOS Clarity Inbox Bridge.js',cfg.replace(id,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'));
 class Request{
  constructor(url){this.url=url;this.response={statusCode:200}}
  async loadJSON(){
   if(this.method==='PATCH'){
    patches++;
    const rows=JSON.parse(this.body).children.map((x,i)=>({...x,id:(blocks.length+i+1).toString(16).padStart(32,'0')}));
    blocks.push(...rows);return {results:rows}
   }
   if(this.url.includes('/children?')){reads++;return {results:blocks,has_more:false}}
   reads++;
   const b=blocks.find(x=>this.url.endsWith('/'+x.id));
   return options.badRead?{paragraph:{rich_text:[]}}:b;
  }
 }
 return {files,blocks,keys,get patches(){return patches},get reads(){return reads},run:async (source,input)=>{
  const F=Object.getPrototypeOf(async function(){}).constructor;
  output=undefined;
  await F('args','FileManager','Keychain','Request','Script',source)({shortcutParameter:input},{local:()=>fm(files,'/local'),iCloud:()=>fm(cloud,'/cloud')},{contains:k=>keys.has(k),get:k=>keys.get(k),set:(k,v)=>keys.set(k,v)},Request,{setShortcutOutput:v=>output=v,complete(){}});
  return output;
 }};
}
const input={yosAction:'capture',notification:'報告書を提出してください'};
test('notification structured capture confirms exact readback and retains stable key',async()=>{const m=makeNoticeMock();const a=await m.run(source,input);assert.equal(a.saveState,'confirmed');assert.equal(m.patches,1);assert.ok(m.reads>=2);const b=await m.run(source,input);assert.equal(b.key,a.key);assert.equal(b.saveState,'confirmed');assert.equal(m.patches,1)});
test('missing or conflicting config retains local queue without external writes',async()=>{for(const options of [{noConfig:true},{conflict:true}]){const m=makeNoticeMock(options);const r=await m.run(source,input);assert.equal(r.saveState,'pending');assert.equal(m.patches,0);assert.ok(m.files.has('/local/YOS_Notification_Pending.json'))}});
test('readback mismatch does not confirm',async()=>{const m=makeNoticeMock({badRead:true});assert.equal((await m.run(source,input)).saveState,'pending');assert.equal(m.patches,1)});
test('OTP scrub and legacy output preserved',async()=>{const m=makeNoticeMock();await m.run(source,{yosAction:'capture',notification:'認証コード 123456'});assert.ok(!JSON.stringify(m.blocks).includes('123456'));const n=makeNoticeMock();assert.equal(typeof await n.run(source,'従来の通知'),'string');assert.equal(n.patches,1)});
test('notification distribution uses exact pin without expanding primary catalog',()=>{const c=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));assert.equal(c.targets.length,30);const n=c.additional_targets.find(x=>x.id==='notification-bridge');assert.ok(n);assert.equal(n.name,'Notification Bridge');assert.equal(n.sha256,crypto.createHash('sha256').update(source).digest('hex'));assert.ok(!/[0-9a-f]{32}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i.test(source))});
