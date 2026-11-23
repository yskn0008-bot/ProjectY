import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Sleep Scene.js',import.meta.url),'utf8');
const CHOICE='yos.sleep.scene.choice.v1';
const USED='yos.sleep.scene.choice-used.v1';
const remoteMap=[{nickname:'ライト',keys:[{name:'POWER OFF'}]}];
const saved={
  'yos.tapo.h110.host':'192.168.1.2',
  'yos.tapo.h110.user':'test',
  'yos.tapo.h110.pass':'test',
  'yos.tapo.floor.local-host':'192.168.1.3',
  'yos.bravia.scriptable.host':'192.168.1.4',
  'yos.bravia.scriptable.psk':'test',
  'yos.tapo.h110.remote-map':JSON.stringify(remoteMap)
};
async function run(mode,{store=new Map(Object.entries(saved)),clicks=[],now=Date.now()}={}){
  const outputs=[],requests=[],alerts=[];let table;
  class MockTable{
    constructor(){this.rows=[];table=this;}
    removeAllRows(){this.rows=[];}
    addRow(x){this.rows.push(x);}
    reload(){}
    async present(){
      for(const i of clicks){
        const row=this.rows[i];
        assert.equal(typeof row?.onSelect,'function', 'table row '+i+' exists');
        row.onSelect();
      }
    }
  }
  class MockRow{addText(title,subtitle){this.title=title;this.subtitle=subtitle;}}
  class MockRequest{constructor(url){requests.push(url);throw Error('unexpected physical request');}}
  class MockAlert{addAction(){}async presentAlert(){alerts.push({title:this.title,message:this.message});return 0;}}
  const context={
    args:{shortcutParameter:mode,queryParameters:{}},
    Keychain:{
      contains:k=>store.has(k),get:k=>store.get(k),
      set:(k,v)=>store.set(k,v),remove:k=>store.delete(k)
    },
    UITable:MockTable,UITableRow:MockRow,Request:MockRequest,Alert:MockAlert,
    WebView:class{},Data:class{},
    Script:{complete(){},setShortcutOutput:x=>outputs.push(x)},
    config:{runsInApp:false},
    Date:class extends Date{static now(){return now;}}
  };
  let error=null;
  try{await vm.runInNewContext('(async()=>{\n'+source+'\n})()',context,{timeout:10000});}
  catch(e){error=String(e.message||e);}
  return {outputs,requests,alerts,error,store,table};
}

test('choice UI starts with the proven sleep profile and AC kept unchanged',async()=>{
  const r=await run('choose',{clicks:[5]});
  assert.equal(r.outputs[0],'READY');
  assert.deepEqual(JSON.parse(r.store.get(CHOICE)).choices,{tv:'off',light:'off',floor:'on',ac:'keep'});
  assert.equal(r.requests.length,0);
});

test('all keep transmits no commands and consumes the choice on first Focus ON',async()=>{
  const store=new Map(Object.entries(saved));
  const chosen=await run('choose',{store,clicks:[1,2,3,3,5]});
  assert.equal(chosen.outputs[0],'READY');
  const r=await run('sleep',{store});
  assert.equal(r.error,null);
  assert.equal(r.requests.length,0);
  assert.match(r.outputs.join(' '),/家電操作なし/);
  assert.equal(store.has(CHOICE),false);
  assert.ok(store.has(USED));
});

test('repeated Focus ON skips the legacy fixed scene after a choice',async()=>{
  const store=new Map(Object.entries(saved));
  await run('choose',{store,clicks:[1,2,3,3,5]});
  await run('sleep',{store});
  const repeat=await run('sleep',{store});
  assert.equal(repeat.requests.length,0);
  assert.match(repeat.outputs.join(' '),/重複実行しません/);
});

test('cancel and swipe-dismiss do not leave a pending choice',async()=>{
  for(const clicks of [[6],[]]){
    const r=await run('choose',{clicks});
    assert.equal(r.outputs[0],'CANCEL');
    assert.equal(r.store.has(CHOICE),false);
    assert.equal(r.requests.length,0);
  }
});

test('expired or malformed plans fail closed without touching any devices',async()=>{
  for(const stored of [
    JSON.stringify({ts:Date.now()-300000,choices:{tv:'off',light:'off',floor:'on',ac:'keep'}}),
    '{"ts":'
  ]){
    const store=new Map(Object.entries(saved));
    store.set(CHOICE,stored);
    const r=await run('sleep',{store});
    assert.ok(r.error);
    assert.equal(r.requests.length,0);
    assert.equal(store.has(CHOICE),false);
  }
});

test('original Focus-only sleep and individual device modes remain available',()=>{
  assert.match(source,/if\(selected===null\)/);
  assert.match(source,/if\(MODE==="floor"\)/);
  assert.match(source,/if\(MODE==="choose"\)/);
  assert.match(source,/const CHOICE_TTL_MS=120000/);
});

test('focus-only prepares a one-use all-keep plan with no appliance credentials',async()=>{
  const store=new Map();
  const ready=await run('focus-only',{store});
  assert.equal(ready.error,null);
  assert.equal(ready.outputs[0],'READY');
  assert.equal(ready.requests.length,0);
  assert.deepEqual(JSON.parse(store.get(CHOICE)).choices,{tv:'keep',light:'keep',floor:'keep',ac:'keep'});
  const started=await run('sleep',{store});
  assert.equal(started.error,null);
  assert.equal(started.requests.length,0);
  assert.match(started.outputs.join(' '),/家電操作なし/);
  assert.equal(store.has(CHOICE),false);
  assert.ok(store.has(USED));
});

test('focus-only skips a duplicate Focus event and does not replay the legacy fixed scene',async()=>{
  const store=new Map();
  await run('focus-only',{store});
  await run('sleep',{store});
  const repeat=await run('sleep',{store});
  assert.equal(repeat.error,null);
  assert.equal(repeat.requests.length,0);
  assert.match(repeat.outputs.join(' '),/重複実行しません/);
});

test('focus-only replaces a pending appliance selection',async()=>{
  const store=new Map(Object.entries(saved));
  await run('choose',{store,clicks:[5]});
  const ready=await run('focus-only',{store});
  assert.equal(ready.outputs[0],'READY');
  const done=await run('sleep',{store});
  assert.equal(done.error,null);
  assert.equal(done.requests.length,0);
  assert.match(done.outputs.join(' '),/家電操作なし/);
});

test('expired focus-only plan fails closed and cannot touch devices',async()=>{
  const store=new Map();
  await run('focus-only',{store,now:1000000});
  const late=await run('sleep',{store,now:1120001});
  assert.ok(late.error);
  assert.equal(late.requests.length,0);
  assert.equal(store.has(CHOICE),false);
});
