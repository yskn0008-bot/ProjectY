import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
const src=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Sleep Scene.js',import.meta.url),'utf8');
const cat=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
const sleep=cat.targets.find(t=>t.id==='sleep-scene');
const hash=x=>crypto.createHash('sha256').update(x).digest('hex');

test('existing installer pins a named, format-compatible standalone sleep scene',()=>{
  assert.ok(sleep);
  assert.equal(sleep.name,'YOS Sleep Scene');
  assert.equal(sleep.path,'ios-app/scriptable/remote-widgets/YOS Sleep Scene.js');
  assert.equal(sleep.sha256,hash(src));
  assert.match(sleep.commit,/^[a-f0-9]{40}$/);
  assert.ok(src.startsWith('// Variables used by Scriptable.\n// YOS_SCRIPT_NAME: YOS Sleep Scene\n'));
  assert.equal(cat.targets.length,9);
});

async function run(mode,settings={}){
  const requests=[],alerts=[],outputs=[];
  class Request{
    constructor(url){this.url=url;requests.push(url)}
    async loadString(){throw Error('Unexpected network request')}
    async load(){throw Error('Unexpected network request')}
  }
  class Alert{
    addAction(){}
    async presentAlert(){alerts.push({title:this.title,message:this.message});return 0}
  }
  const context={
    args:{shortcutParameter:mode},
    config:{runsInApp:true},
    Keychain:{contains:k=>Object.hasOwn(settings,k),get:k=>settings[k]},
    Request,Alert,WebView:class{},Data:class{},
    Script:{setShortcutOutput:x=>outputs.push(x),complete(){}}
  };
  await vm.runInNewContext('(async()=>{\n'+src+'\n})()',context,{timeout:10000});
  return {requests,alerts,outputs};
}
test('first run and dry check never touch TV/lights or mutate scripts',async()=>{
  const r=await run(undefined);
  assert.equal(r.requests.length,0);
  assert.equal(r.alerts.length,1);
  assert.match(r.alerts[0].title,/設定確認/);
  assert.match(r.alerts[0].message,/未設定/);
});
test('all operation modes fail safely when connection settings are missing',async()=>{
  for(const mode of ['sleep','floor','tv','light']){
    const r=await run(mode);
    assert.equal(r.requests.length,0);
    assert.match(r.alerts[0].title,/安全停止/);
  }
});
test('the procedure turns on floor lamp before BRAVIA and ceiling, never automatically restarts them',()=>{
  const text=src.slice(src.indexOf('const results=[];'));
  assert.ok(text.indexOf('floorOn()')<text.indexOf('tvOff()'));
  assert.ok(text.indexOf('tvOff()')<text.indexOf('ceilingOff()'));
  assert.match(src,/if\(current===false\)await c\.query/);
  assert.match(src,/if\(state==="active"\)await rpc/);
  assert.ok(!src.includes('FileManager.'));
  assert.ok(!src.includes('importModule('));
});
