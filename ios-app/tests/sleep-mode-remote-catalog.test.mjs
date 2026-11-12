import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';

const root=new URL('../scriptable/',import.meta.url);
const load=path=>fs.readFileSync(new URL(path,root),'utf8');
const catalog=JSON.parse(load('yos-common-installer-catalog.json'));
const byId=id=>catalog.targets.find(entry=>entry.id===id);
const digest=source=>crypto.createHash('sha256').update(source).digest('hex');

test('sleep remote package uses verified pins and original script names',()=>{
  for(const id of ['tapo-h110-core','remote-direct-actions','bravia-smart-power']){
    const entry=byId(id);
    assert.ok(entry,id+' missing from common catalog');
    assert.equal(entry.name,entry.path.split('/').pop().replace(/\.js$/,''));
    assert.match(entry.commit,/^[a-f0-9]{40}$/);
    assert.equal(digest(load(entry.path.replace('ios-app/scriptable/',''))),entry.sha256);
  }
  assert.equal(new Set(catalog.targets.map(x=>x.id)).size,catalog.targets.length);
  assert.equal(new Set(catalog.targets.map(x=>x.name)).size,catalog.targets.length);
});

test('Tapo H110 core offers optional host client without changing default client',async()=>{
  const source=load('remote-widgets/YOS Tapo H110 Core.js');
  const storage={
    'yos.tapo.h110.host':'192.168.1.2',
    'yos.tapo.h110.user':'account',
    'yos.tapo.h110.pass':'password'
  };
  const mod={exports:{}};
  class WebView{
    async loadURL(){}
    async evaluateJavaScript(){return 'true'}
  }
  vm.runInNewContext(source,{
    module:mod,WebView,
    Keychain:{contains:key=>Object.hasOwn(storage,key),get:key=>storage[key]},
    Data:{fromString:()=>({getBytes:()=>[]}),fromBytes:()=>({toBase64String:()=>''})}
  },{filename:'YOS Tapo H110 Core.js',timeout:2000});
  assert.equal(typeof mod.exports.client,'function');
  assert.equal(typeof mod.exports.clientForHost,'function');
  assert.equal(typeof mod.exports.fireFriendly,'function');
  const original=await mod.exports.client();
  const lamp=await mod.exports.clientForHost('192.168.1.44');
  assert.equal(original.host,'192.168.1.2');
  assert.equal(lamp.host,'192.168.1.44');
  assert.equal(lamp.username,'account');
  await assert.rejects(()=>mod.exports.clientForHost('999.168.1.44'),/IPアドレス不正/);
});

async function runRemote(parameter,state){
  const source=load('remote-widgets/YOS Remote Direct Actions.js');
  const calls=[];
  const core={
    fireFriendly:async(predicate,keys)=>{calls.push(['ir',keys]);return {}},
    clientForHost:async host=>{
      calls.push(['host',host]);
      return {query:async input=>{
        calls.push(['request',input]);
        if(input.method==='get_device_info')return {result:{device_on:state}};
        return {result:{}};
      }}
    }
  };
  const settings={'yos.tapo.floor.local-host':'192.168.1.44'};
  const ctx={
    args:{shortcutParameter:parameter},
    importModule:name=>{assert.equal(name,'YOS Tapo H110 Core');return core},
    Keychain:{contains:key=>Object.hasOwn(settings,key),get:key=>settings[key]},
    Script:{setShortcutOutput:s=>calls.push(['output',s]),complete:()=>{}}
  };
  await vm.runInNewContext('(async()=>{'+source+'\n})()',ctx,{timeout:2000});
  return calls;
}

test('floor on changes device only if needed',async()=>{
  const off=await runRemote('floor on',false);
  assert.equal(off.filter(x=>x[0]==='request').length,2);
  assert.equal(off[2][1].method,'set_device_info');
  assert.equal(off[2][1].params.device_on,true);
  const on=await runRemote('floor on',true);
  assert.equal(on.filter(x=>x[0]==='request').length,1);
});

test('floor on refuses unknown state; ceiling light uses explicit off command',async()=>{
  await assert.rejects(()=>runRemote('floor on',undefined),/電源状態不明/);
  const light=await runRemote('light off',false);
  assert.equal(light[0][0],'ir');
  assert.deepEqual(Array.from(light[0][1]),['POWER OFF','消灯']);
});

test('BRAVIA off reads current state before sending a state change',async()=>{
  const src=load('remote-widgets/YOS BRAVIA Smart Power.js');
  async function run(state){
    const requests=[];
    class Request{
      constructor(url){this.url=url}
      async loadString(){
        const body=JSON.parse(this.body);
        requests.push(body);
        if(body.method==='getPowerStatus')return JSON.stringify({result:[{status:state}]});
        return JSON.stringify({result:[{}]});
      }
    }
    const settings={'yos.bravia.scriptable.host':'192.168.1.5','yos.bravia.scriptable.psk':'demo'};
    await vm.runInNewContext('(async()=>{'+src+'\n})()',{
      Request,args:{shortcutParameter:'off'},
      Keychain:{contains:key=>Object.hasOwn(settings,key),get:key=>settings[key]},
      Script:{setShortcutOutput(){},complete(){}}
    },{timeout:2000});
    return requests;
  }
  assert.deepEqual((await run('active')).map(x=>x.method),['getPowerStatus','setPowerStatus']);
  assert.deepEqual((await run('standby')).map(x=>x.method),['getPowerStatus']);
  await assert.rejects(()=>run('unknown'),/電源状態不明/);
});
