import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Remote Hub.js',import.meta.url),'utf8');

function makeHarness({unsupported=false,brightness=80,mode='standard',writeFails=false,modes=['standard','cinema']}={}){
  const begin=source.indexOf('const PICTURE_BACKUP_KEY=');
  const end=source.indexOf('async function discoverSony(){',begin);
  assert.ok(begin>0&&end>begin,'picture module extraction markers must exist');
  const values={pictureMode:mode,brightness:String(brightness)};
  const keyStore=new Map(),writes=[],reads=[];
  const Keychain={
    contains:k=>keyStore.has(k),
    get:k=>keyStore.get(k),
    set:(k,v)=>keyStore.set(k,v),
    remove:k=>keyStore.delete(k)
  };
  class Request{
    constructor(url){this.url=url;}
    async loadString(){
      assert.equal(this.url,'http://television/sony/video');
      assert.equal(this.headers['X-Auth-PSK'],'private-on-device');
      const request=JSON.parse(this.body);
      if(unsupported)return JSON.stringify({error:[404,'Unknown method']});
      if(request.method==='getPictureQualitySettings'){
        const target=request.params[0].target;
        reads.push(target);
        const candidate=target==='pictureMode'?modes.map(value=>({value})):[{min:0,max:100,step:1}];
        return JSON.stringify({result:[[{target,currentValue:values[target],isAvailable:true,candidate}]]});
      }
      if(request.method==='setPictureQualitySettings'){
        const settings=request.params[0].settings;
        assert.equal(settings.length,1,'only one picture setting may be written per call');
        writes.push(settings[0]);
        if(!writeFails)values[settings[0].target]=settings[0].value;
        return JSON.stringify({result:[]});
      }
      throw new Error('unexpected API method '+request.method);
    }
  }
  const get=new Function('Request','sonyHost','sonyPSK','Keychain',
    'return (async()=>{'+source.slice(begin,end)+'\nreturn {pictureCapabilities,applyPicturePreset};})()');
  const api=get(Request,()=> 'television',()=> 'private-on-device',Keychain);
  return{api,values,writes,reads,keyStore};
}

test('existing remote remains a single unchanged-entry interface with picture overlay',()=>{
  assert.match(source,/YOS Remote Hub v6\.5/);
  assert.match(source,/function installCenterGesture/);
  assert.match(source,/const LIGHT_HOLD_BURST=2/);
  assert.match(source,/const LAYOUT_KEY="yos\.remote\.tv\.buttons\.v52"/);
  assert.match(source,/onclick="openPictureEditor\(event\)"/);
  assert.match(source,/data-picture="day"/);
  assert.match(source,/data-picture="night"/);
  assert.match(source,/data-picture="movie"/);
  assert.match(source,/else if\(item\.device==="picture"\)/);
  assert.match(source,/if\(item\.action==="probe"\)result=\{ok:true,picture:await pictureCapabilities\(\)\}/);
  assert.doesNotMatch(source,/const\s+PSK\s*=\s*["']/);
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
  assert.doesNotThrow(()=>new AsyncFunction(source),'Scriptable script is valid JavaScript');
});

test('probe only reads television settings, and exposes supported choices',async()=>{
  const h=makeHarness();
  const p=await (await h.api).pictureCapabilities();
  assert.deepEqual(p.support,{day:true,night:true,movie:true});
  assert.deepEqual(h.reads,['pictureMode','brightness']);
  assert.equal(h.writes.length,0);
});

test('night reduces brightness one time and day restores its exact previous value',async()=>{
  const h=makeHarness();
  const {applyPicturePreset}=await h.api;
  await applyPicturePreset('night');
  assert.equal(h.values.brightness,'25');
  assert.deepEqual(h.writes,[{target:'brightness',value:'25'}]);
  assert.equal(h.keyStore.size,1);
  await applyPicturePreset('night');
  assert.equal(h.writes.length,1,'night is not repeatedly dimmed');
  await applyPicturePreset('day');
  assert.equal(h.values.brightness,'80');
  assert.deepEqual(h.writes[1],{target:'brightness',value:'80'});
  assert.equal(h.keyStore.size,0,'backup is cleared after successful restoration');
});

test('cinema uses only the model-reported candidate and does not overwrite brightness',async()=>{
  const h=makeHarness();
  await (await h.api).applyPicturePreset('movie');
  assert.equal(h.values.pictureMode,'cinema');
  assert.equal(h.values.brightness,'80');
  assert.deepEqual(h.writes,[{target:'pictureMode',value:'cinema'}]);
});

test('already-dim display is never increased by Night',async()=>{
  const h=makeHarness({brightness:12});
  const result=await (await h.api).applyPicturePreset('night');
  assert.match(result.message,/変更していません/);
  assert.equal(h.values.brightness,'12');
  assert.equal(h.writes.length,0);
});

test('unsupported Sony picture API does not send any modifying request',async()=>{
  const h=makeHarness({unsupported:true});
  const api=await h.api;
  const probe=await api.pictureCapabilities();
  assert.deepEqual(probe.support,{day:false,night:false,movie:false});
  await assert.rejects(api.applyPicturePreset('night'),/直接設定できません/);
  await assert.rejects(api.applyPicturePreset('movie'),/直接切り替えられません/);
  assert.equal(h.writes.length,0);
});

test('read-back mismatch is not reported as successful and backup is retained',async()=>{
  const h=makeHarness({writeFails:true});
  await assert.rejects((await h.api).applyPicturePreset('night'),/反映確認できませんでした/);
  assert.equal(h.values.brightness,'80');
  assert.equal(h.keyStore.size,1,'backup is retained for safe recovery');
});

test('picture preset matches mixed-case Sony values and writes the exact reported value',async()=>{
  const h=makeHarness({modes:['Standard','Cinema home'],mode:'Standard'});
  const api=await h.api;
  const p=await api.pictureCapabilities();
  assert.deepEqual(p.support,{day:true,night:true,movie:true});
  await api.applyPicturePreset('movie');
  assert.equal(h.values.pictureMode,'Cinema home');
  assert.deepEqual(h.writes,[{target:'pictureMode',value:'Cinema home'}]);
});
