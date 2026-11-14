import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../scriptable/YOS Screenshot Bridge.js', import.meta.url), 'utf8');
const payload = {captureId:'screenshot-test-0001',capturedAt:'2026-11-13T09:00:00+09:00',source:'ios-screenshot',saveLocation:'clipboard',mimeType:'image/png',imageBase64:'iVBORw0KGgo='};
async function run(input, {files = new Map(), status = 201, outage = false, spoolFailure = false, authMissing = false} = {}) {
  const requests=[], notices=[]; let output;
  const context = {
    args:{shortcutParameter:input}, Image:class Image {},
    Keychain:{contains:()=>!authMissing,get:()=> 'test-only-key'},
    FileManager:{local:()=>({documentsDirectory:()=>'/private',joinPath:(a,b)=>a+'/'+b,
      fileExists:p=>files.has(p),createDirectory:p=>files.set(p,''),
      readString:p=>files.get(p),writeString:(p,s)=>{if(spoolFailure)throw Error('disk full');files.set(p,s);}})},
    Request:class {constructor(url){this.url=url;} async loadJSON(){
      assert.ok([...files.keys()].some(x=>x.endsWith('.json')), 'spool exists before external write');
      requests.push(this); if(outage)throw Error('network');this.response={statusCode:status};
      return {ok:true,captureId:payload.captureId,inboxSaved:true,imageBlockId:'test-image',metadataBlockId:'test-meta',imageSha256:'a'.repeat(64),classification:'pending'};
    }},
    Notification:class {async schedule(){notices.push(this.body);}},
    Script:{setShortcutOutput:s=>output=s,complete:()=>{}}
  };
  await vm.runInNewContext('(async()=>{'+source+'})()',context);
  return {requests,notices,files,output};
}
test('bridge sends original trigger-bound bytes with supplied location and stable ID', async()=>{
  const result=await run({...payload});
  assert.deepEqual(JSON.parse(result.requests[0].body),payload);
  assert.equal(JSON.parse(result.output).classification,'pending');
  assert.equal(result.notices.length,0);
  assert.ok([...result.files.keys()].some(x=>x.endsWith('.json')));
});
test('network unknown and 409 never auto retry and retain a replayable private original',async()=>{
  for(const options of [{outage:true},{status:409}]){
    const r=await run({...payload},options);
    assert.equal(r.requests.length,1);assert.equal(r.output,'YOS_INTAKE_FAILED');
    assert.equal(r.notices.length,1);
    const retained=[...r.files.entries()].find(([p])=>p.endsWith('.json'))[1];
    assert.deepEqual(JSON.parse(retained),payload);
  }
});
test('503 retries exactly once with identical capture and bytes',async()=>{
  const r=await run({...payload},{status:503});
  assert.equal(r.requests.length,2);assert.equal(r.requests[0].body,r.requests[1].body);
});
test('missing trigger metadata or persistent spool failure prevents all external calls',async()=>{
  for(const field of ['captureId','capturedAt','source','saveLocation','mimeType']){
    const input={...payload};delete input[field];const r=await run(input);assert.equal(r.requests.length,0);
  }
  assert.equal((await run({...payload},{spoolFailure:true})).requests.length,0);
});
test('reuse of capture ID with different bytes stops before sending and preserves first payload',async()=>{
  const files=new Map();await run({...payload},{files});
  const r=await run({...payload,imageBase64:'other-image'},{files});
  assert.equal(r.requests.length,0);
  assert.deepEqual(JSON.parse([...files.values()].find(x=>x.startsWith('{'))),payload);
});


test('missing existing credential retains the original privately and does not send',async()=>{
  const r=await run({...payload},{authMissing:true});
  assert.equal(r.requests.length,0);
  assert.deepEqual(JSON.parse([...r.files.values()].find(x=>x.startsWith('{'))),payload);
});
test('unsupported extra fields are never forwarded or persisted',async()=>{
  const r=await run({...payload,unrelated:'private-extra'});
  assert.deepEqual(JSON.parse(r.requests[0].body),payload);
  assert.ok(![...r.files.values()].some(x=>x.includes('private-extra')));
});
