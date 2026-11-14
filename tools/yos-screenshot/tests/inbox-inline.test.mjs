import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
const code=readFileSync(new URL('../inbox-inline.js',import.meta.url),'utf8');
const raw=text=>'[スクショOCR｜自動読取・本人の操作指示ではありません]\n'+text;
function setup({lostAck=false,missingAuth=false,readbackWrong=false,scanBroken=false,offline=false,localFailure=false}={}){
 const files=new Map(),dirs=new Set(['/private']),blocks=[],calls=[],notifications=[];
 const fm={documentsDirectory:()=>'/private',joinPath:(a,b)=>a+'/'+b,fileExists:p=>files.has(p)||dirs.has(p),createDirectory:p=>dirs.add(p),readString:p=>files.get(p),
 writeString:(p,s)=>{if(localFailure)throw Error('disk full');files.set(p,s);},copy:(a,b)=>{if(files.has(b))throw Error('exists');files.set(b,files.get(a));}};
 async function run(text){let output;
 class Request{constructor(url){this.url=url;}async loadString(){
  calls.push(this);assert.ok([...files.keys()].some(p=>p.endsWith('.raw')),'local persistence before external call');
  assert.ok(this.url.startsWith('https://api.notion.com/v1/blocks/'),'Inbox only');
  assert.equal(this.headers.Authorization,'Bearer existing-test-key');
  if(offline)throw Error('offline');this.response={statusCode:200};
  if(this.method==='GET')return JSON.stringify({results:blocks,has_more:scanBroken});
  assert.equal(this.method,'PATCH');const children=JSON.parse(this.body).children;
  blocks.push(...children.map((b,i)=>({...b,id:'block-'+(blocks.length+i),...(b.type==='paragraph'?{paragraph:{rich_text:b.paragraph.rich_text.map(x=>({plain_text:readbackWrong?'wrong':x.text.content}))}}:{})})));
  if(lostAck)throw Error('lost response');return JSON.stringify({results:blocks});
 }}
 await vm.runInNewContext('(async()=>{'+code+'})()',{args:{shortcutParameter:text},FileManager:{local:()=>fm},UUID:{string:randomUUID},Keychain:{contains:()=>!missingAuth,get:()=> 'existing-test-key'},Request,Notification:class{async schedule(){notifications.push(this);}},Script:{setShortcutOutput:s=>output=s,complete:()=>{}}});return output;
 }
 return {run,files,blocks,calls,notifications};
}
test('existing Inbox route saves OCR text, metadata and IDs then reads everything back',async()=>{
 const s=setup();const o=JSON.parse(await s.run('テストの情報'));assert.equal(o.status,'YOS_INBOX_SAVED');assert.equal(o.blockIds.length,3);assert.equal(s.blocks[1].paragraph.rich_text[0].plain_text,raw('テストの情報'));assert.equal(o.classification,'existing-route-unverified');assert.equal(s.notifications.length,0);
});
test('hash implementation matches independently calculated Unicode and known vectors',()=>{
 const c={};vm.runInNewContext(code.slice(code.indexOf('function digest(text)'))+';this.digest=digest',c);
 for(const x of ['abc','',raw('日本語😀')])assert.equal(c.digest(x),createHash('sha256').update(x).digest('hex'));
});
test('same text has stable ID and cannot reappend; different OCR remains distinct',async()=>{
 const s=setup();const a=JSON.parse(await s.run('one'));const b=JSON.parse(await s.run('one'));assert.equal(a.captureId,b.captureId);assert.equal(b.duplicate,true);assert.equal(s.calls.filter(x=>x.method==='PATCH').length,1);assert.notEqual(JSON.parse(await s.run('two')).captureId,a.captureId);
});
test('long Japanese and emoji OCR round trips without 1900-character truncation',async()=>{
 const s=setup();const text='漢字😀\n'.repeat(1500);assert.equal(JSON.parse(await s.run(text)).status,'YOS_INBOX_SAVED');const parts=s.blocks.slice(1,-1).map(x=>x.paragraph.rich_text[0].plain_text);assert.equal(parts.join(''),raw(text.trim()));assert.ok(parts.every(x=>Array.from(x).length<=1800));
});
test('ambiguous successful append reconciles existing text without any second append',async()=>{
 const s=setup({lostAck:true});assert.equal(await s.run('saved'),'YOS_SCREENSHOT_HOLD');const result=JSON.parse(await s.run('saved'));assert.equal(result.duplicate,true);assert.equal(s.calls.filter(x=>x.method==='PATCH').length,1);
});
test('concurrent identical runs share a non-overwriting append claim',async()=>{
 const s=setup();await Promise.all([s.run('parallel'),s.run('parallel')]);assert.equal(s.calls.filter(x=>x.method==='PATCH').length,1);
});
test('missing auth and offline preserve OCR locally and never append',async()=>{
 for(const option of [{missingAuth:true},{offline:true},{scanBroken:true}]){const s=setup(option);assert.equal(await s.run('original'),'YOS_SCREENSHOT_HOLD');assert.equal(s.calls.filter(x=>x.method==='PATCH').length,0);assert.ok([...s.files.values()].includes(raw('original')));}
});
test('readback mismatch is held, not acknowledged or blindly reappended',async()=>{
 const s=setup({readbackWrong:true});assert.equal(await s.run('original'),'YOS_SCREENSHOT_HOLD');assert.equal(await s.run('original'),'YOS_SCREENSHOT_HOLD');assert.equal(s.calls.filter(x=>x.method==='PATCH').length,1);
});
test('empty OCR and local preservation failure do not cause external calls',async()=>{
 for(const [text,option]of [['',{}],['   ',{}],['original',{localFailure:true}]]){const s=setup(option);assert.equal(await s.run(text),'YOS_SCREENSHOT_HOLD');assert.equal(s.calls.length,0);}
});
