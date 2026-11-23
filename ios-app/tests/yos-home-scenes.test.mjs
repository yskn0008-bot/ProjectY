import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Home Scenes.js',import.meta.url),'utf8');
const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const program=new AsyncFunction('args','Keychain','Script','Request','importModule','Timer','WebView',source);
const key='yos.home-scenes.presets.v1';
const blank=()=>({schema:1,departure:{tv:'keep',light:'keep',ac:'keep',floor:'keep'},arrival:{tv:'keep',light:'keep',ac:'keep',floor:'keep'}});
function harness(options={}){
  const data=new Map(),events=[],outputs=[],webs=[];
  if(options.prefs!==undefined)data.set(key,typeof options.prefs==='string'?options.prefs:JSON.stringify(options.prefs));
  data.set('yos.bravia.scriptable.host','192.168.1.5');
  data.set('yos.bravia.scriptable.psk','TEST');
  data.set('yos.tapo.floor.local-host','192.168.1.6');
  const Keychain={contains:k=>data.has(k),get:k=>data.get(k),set:(k,v)=>data.set(k,v)};
  const Script={setShortcutOutput:x=>outputs.push(JSON.parse(x)),complete:()=>{}};
  class Request {
    constructor(url){this.url=url;this.body=''}
    async loadString(){
      const payload=JSON.parse(this.body);
      events.push({name:'tv',method:payload.method,params:payload.params});
      if(payload.method==='getPowerStatus')return JSON.stringify({result:[{status:options.tvStatus||'standby'}]});
      return JSON.stringify({result:[]});
    }
  }
  const client={
    query:async data=>{
      events.push({name:'tapo',method:data.method});
      if(data.method==='get_device_info')return {device_on:options.floorOn??false};
      if(data.method==='control_child')return {result:{ac_status:options.acStatus||'P0_M1_T24_S0_D6'}};
      return {};
    },
    controlAc:async(id,payload)=>events.push({name:'ac',id,payload})
  };
  const core={
    findRemote:()=>({device_id:'test-ac'}),
    client:async()=>client,
    clientForHost:async()=>client,
    fireFriendly:async(pred,keys)=>events.push({name:'light',keys})
  };
  class WebView {
    constructor(){webs.push(this)}
    async loadHTML(html){this.html=html}
    async present(){}
    async evaluateJavaScript(code){this.resultCode=code}
  }
  const Timer={schedule:(seconds,repeats,resolve)=>{events.push({name:'timer',seconds});resolve()}};
  const execute=async param=>program({shortcutParameter:param,queryParameters:{}},Keychain,Script,Request,()=>core,Timer,WebView);
  return {execute,events,outputs,data,webs};
}
test('shared installer pins file, hash and canonical Scriptable name',()=>{
  const entry=catalog.targets.find(x=>x.id==='home-scenes');
  assert.ok(entry);
  assert.equal(entry.name,'YOS Home Scenes');
  assert.equal(entry.path,'ios-app/scriptable/remote-widgets/YOS Home Scenes.js');
  assert.match(source,/^\/\/ YOS_SCRIPT_NAME: YOS Home Scenes$/m);
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'),entry.sha256);
});
test('unconfigured scene does not touch any device',async()=>{
  const h=harness();await h.execute('外出');
  assert.deepEqual(h.events,[]);
  assert.deepEqual(h.outputs[0].results.map(x=>x.status),['維持','維持','維持','維持']);
});
test('departure off is idempotent for TV/floor and repeats SHARP stop',async()=>{
  const p=blank();for(const key of Object.keys(p.departure))p.departure[key]='off';
  const h=harness({prefs:p,tvStatus:'active',acStatus:'P1_M1_T24_S0_D6',floorOn:false});
  await h.execute('外出');
  assert.equal(h.events.filter(x=>x.name==='tv'&&x.method==='setPowerStatus').length,1);
  assert.equal(h.events.filter(x=>x.name==='ac').length,2);
  assert.equal(h.events.find(x=>x.name==='timer').seconds,1.2);
  assert.equal(h.events.filter(x=>x.name==='tapo'&&x.method==='set_device_info').length,0);
});
test('AC off sends commands even when the IR hub cached state says OFF',async()=>{
  const p=blank();p.departure.ac='off';
  const h=harness({prefs:p,acStatus:'P0_M1_T24_S0_D6'});
  await h.execute('外出');
  assert.equal(h.events.filter(x=>x.name==='ac').length,2);
  assert.equal(h.events.filter(x=>x.name==='timer').length,1);
});
test('arrival ON preserves AC stored mode and does not toggle already-on TV',async()=>{
  const p=blank();for(const key of Object.keys(p.arrival))p.arrival[key]='on';
  const h=harness({prefs:p,tvStatus:'active',acStatus:'P0_M1_T24_S0_D6'});
  await h.execute('帰宅');
  assert.equal(h.events.filter(x=>x.name==='tv'&&x.method==='setPowerStatus').length,0);
  const ac=h.events.find(x=>x.name==='ac');
  assert.equal(ac.payload.mode,1);
  assert.equal(ac.payload.temp,24);
  assert.equal(h.events.filter(x=>x.name==='tapo'&&x.method==='set_device_info').length,1);
});
test('malformed settings fail closed without touching devices',async()=>{
  const h=harness({prefs:'{"schema":2}'});await assert.rejects(h.execute('外出'));
  assert.deepEqual(h.events,[]);
});
test('editor displays both modes and saves without dispatching device commands',async()=>{
  const h=harness();await h.execute('');
  assert.equal(h.webs.length,1);
  assert.match(h.webs[0].html,/Home Scenes/);
  assert.match(h.webs[0].html,/フロアランプ/);
  const p=blank();p.departure.tv='off';p.arrival.ac='on';
  const accepted=h.webs[0].shouldAllowRequest({url:'https://yos-scenes.local/__save?value='+encodeURIComponent(JSON.stringify(p))});
  assert.equal(accepted,false);
  assert.equal(JSON.parse(h.data.get(key)).departure.tv,'off');
  assert.equal(JSON.parse(h.data.get(key)).arrival.ac,'on');
  assert.deepEqual(h.events,[]);
});
test('compact one-screen design has only mode, four appliance rows and save',async()=>{
  const h=harness();await h.execute('');
  const html=h.webs[0].html;
  assert.doesNotMatch(html,/HOME AUTOMATION|Home Scenes|YOS Home|外出シーン|帰宅シーン|class="hero"|class="scenehead"/);
  assert.match(html,/height:100dvh/);
  assert.match(html,/overflow:hidden/);
  assert.match(html,/grid-template-rows:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(html,/<nav class="tabs"/);
  assert.match(html,/>外出<\/button>/);
  assert.match(html,/>帰宅<\/button>/);
  assert.match(html,/id="devices"/);
  assert.match(html,/aria-label="家電4台の動作設定"/);
  assert.match(html,/>設定を保存<\/button>/);
  assert.match(html,/const devices=\[\["tv","テレビ","BRAVIA"\]/);
  assert.match(html,/\["light","照明","Ceiling"\]/);
  assert.match(html,/\["ac","エアコン","SHARP"\]/);
  assert.match(html,/\["floor","フロアランプ","Tapo"\]/);
  assert.match(html,/button\.dataset\.value=value/);
  assert.match(html,/aria-pressed/);
  assert.match(html,/replaceChildren\(\)/);
  assert.match(html,/--ink:#f5f7ff/);
  assert.match(html,/backdrop-filter:blur/);
  assert.match(html,/prefers-reduced-motion:reduce/);
  const embedded=html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(embedded);
  assert.doesNotThrow(()=>new Function(embedded[1]));
  assert.deepEqual(h.events,[]);
});
