import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/YOS Home Scenes.js',import.meta.url),'utf8');
const catalog=JSON.parse(fs.readFileSync(new URL('../scriptable/yos-common-installer-catalog.json',import.meta.url),'utf8'));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const program=new AsyncFunction('args','Keychain','Script','Request','importModule','Timer','WebView','Safari',source);
const key='yos.home-scenes.presets.v1';
const row=()=>({tv:'keep',light:'keep',ac:'keep',floor:'keep'});
const blank=()=>({schema:1,departure:row(),arrival:row(),sleep:row(),wake:row(),night:row(),movie:row(),relax:row(),clean:row(),focus:row()});
const legacyBlank=()=>({schema:1,departure:row(),arrival:row()});
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
  const Safari={open:url=>events.push({name:'open',url})};
  const execute=async param=>program({shortcutParameter:param,queryParameters:{}},Keychain,Script,Request,()=>core,Timer,WebView,Safari);
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
test('editor displays nine scenes and saves without dispatching device commands',async()=>{
  const h=harness();await h.execute('edit');
  assert.equal(h.webs.length,1);
  for(const mode of ['外出','帰宅','就寝','起床','夜','映画','リラックス','掃除','集中'])assert.match(h.webs[0].html,new RegExp('>'+mode+'<\\/button>'));
  assert.match(h.webs[0].html,/const initialView="settings"/);
  assert.match(h.webs[0].html,/フロアランプ/);
  const p=blank();p.departure.tv='off';p.arrival.ac='on';p.sleep.light='off';p.wake.floor='on';p.night.ac='keep';p.movie.tv='on';p.relax.floor='on';p.clean.light='on';p.focus.ac='off';
  const accepted=h.webs[0].shouldAllowRequest({url:'https://yos-scenes.local/__save?value='+encodeURIComponent(JSON.stringify(p))});
  assert.equal(accepted,false);
  assert.equal(JSON.parse(h.data.get(key)).departure.tv,'off');
  assert.equal(JSON.parse(h.data.get(key)).arrival.ac,'on');
  assert.equal(JSON.parse(h.data.get(key)).sleep.light,'off');
  assert.equal(JSON.parse(h.data.get(key)).wake.floor,'on');
  assert.equal(JSON.parse(h.data.get(key)).movie.tv,'on');
  assert.equal(JSON.parse(h.data.get(key)).relax.floor,'on');
  assert.equal(JSON.parse(h.data.get(key)).clean.light,'on');
  assert.equal(JSON.parse(h.data.get(key)).focus.ac,'off');
  assert.deepEqual(h.events,[]);
});
test('native Scriptable Close and Share toolbar cannot overlap scene tabs',async()=>{
  const h=harness();await h.execute('');
  const html=h.webs[0].html;
  assert.match(html,/viewport-fit=cover/);
  assert.match(html,/padding:max\(72px,env\(safe-area-inset-top\)\) 13px max\(13px,env\(safe-area-inset-bottom\)\)/);
  assert.match(html,/height:100dvh/);
  assert.match(html,/overflow:hidden/);
  assert.match(html,/@media\(max-height:550px\)\{\.screen\{gap:7px;padding-bottom:7px\}/);
  assert.doesNotMatch(html,/padding-top:7px/,'compact iPhone layout must not remove native toolbar clearance');
  for(const label of ['外出','帰宅','就寝','起床','夜'])assert.match(html,new RegExp('>'+label+'<\\/button>'));
  assert.match(html,/>設定を保存<\/button>/);
  assert.deepEqual(h.events,[],'opening the editor is read-only for appliances');
});

test('compact one-screen layout retains four appliance rows and save',async()=>{
  const h=harness();await h.execute('');
  const html=h.webs[0].html;
  assert.doesNotMatch(html,/HOME AUTOMATION|外出シーン|帰宅シーン|class="hero"|class="scenehead"/);
  assert.match(html,/height:100dvh/);
  assert.match(html,/overflow:hidden/);
  assert.match(html,/grid-template-rows:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(html,/<nav class="tabs"/);
  assert.match(html,/>外出<\/button>/);
  assert.match(html,/>帰宅<\/button>/);
  assert.match(html,/>就寝<\/button>/);
  assert.match(html,/>起床<\/button>/);
  assert.match(html,/>夜<\/button>/);
  assert.equal((html.match(/data-mode="(?:departure|arrival|sleep|wake|night|movie|relax|clean|focus)"/g)||[]).length,9);
  assert.match(html,/id="devices"/);
  assert.match(html,/aria-label="家電4台の動作設定"/);
  assert.match(html,/>設定を保存<\/button>/);
  assert.match(html,/const devices=\[\["tv","テレビ","BRAVIA"\]/);
  assert.match(html,/\["light","照明","Ceiling"\]/);
  assert.match(html,/\["ac","エアコン","SHARP"\]/);
  assert.match(html,/\["floor","フロアランプ","Tapo"\]/);
  assert.match(html,/b\.dataset\.value=value/);
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

test('all nine scene names and aliases route to independent plans',async()=>{
  const names=[['外出','departure'],['departure','departure'],['帰宅','arrival'],['return','arrival'],['就寝','sleep'],['bedtime','sleep'],['起床','wake'],['morning','wake'],['夜','night'],['night','night'],['映画','movie'],['movie','movie'],['リラックス','relax'],['relax','relax'],['掃除','clean'],['cleaning','clean'],['集中','focus'],['focus','focus']];
  for(const [alias,mode] of names){
    const p=blank();p[mode].tv='off';
    const h=harness({prefs:p,tvStatus:'active'});
    await h.execute(alias);
    assert.equal(h.outputs[0].scene,mode);
    assert.equal(h.events.filter(e=>e.name==='tv'&&e.method==='setPowerStatus').length,1);
    assert.equal(h.events.filter(e=>e.name==='ac'||e.name==='light'||e.name==='tapo').length,0);
  }
});
test('newly added seven scenes start all-keep, with no appliance commands',async()=>{
  for(const mode of ['就寝','起床','夜','映画','リラックス','掃除','集中']){
    const h=harness();
    await h.execute(mode);
    assert.deepEqual(h.events,[]);
    assert.deepEqual(h.outputs[0].results.map(x=>x.status),['維持','維持','維持','維持']);
  }
});
test('legacy two-scene settings are read without mutation, then explicitly saved with nine scenes',async()=>{
  const old=legacyBlank();old.departure.tv='off';old.arrival.ac='on';
  const h=harness({prefs:old,tvStatus:'active'});
  const exactOriginal=h.data.get(key);
  await h.execute('起床');
  assert.deepEqual(h.events,[],'migrated wake is all-keep');
  assert.equal(h.data.get(key),exactOriginal,'read must not rewrite existing preferences');
  await h.execute('外出');
  assert.equal(h.events.filter(x=>x.name==='tv'&&x.method==='setPowerStatus').length,1);
  await h.execute('');
  const html=h.webs.at(-1).html;
  for(const mode of ['departure','arrival','sleep','wake','night','movie','relax','clean','focus'])assert.match(html,new RegExp('"'+mode+'":\\{'));
  const newPrefs=blank();newPrefs.departure.tv='off';newPrefs.arrival.ac='on';newPrefs.sleep.light='off';
  h.webs.at(-1).shouldAllowRequest({url:'https://yos-scenes.local/__save?value='+encodeURIComponent(JSON.stringify(newPrefs))});
  const saved=JSON.parse(h.data.get(key));
  assert.equal(saved.departure.tv,'off');
  assert.equal(saved.arrival.ac,'on');
  assert.equal(saved.sleep.light,'off');
  assert.equal(saved.wake.floor,'keep');
  assert.equal(saved.movie.tv,'keep');
  assert.equal(saved.relax.floor,'keep');
});
test('different sleep, wake and night settings never leak between scenes',async()=>{
  const p=blank();p.sleep.tv='off';p.wake.floor='on';p.night.light='on';
  for(const [mode,expectedName] of [['就寝','tv'],['起床','tapo'],['夜','light']]){
    const h=harness({prefs:p,tvStatus:'active',floorOn:false});
    await h.execute(mode);
    const significant=h.events.filter(x=>x.name==='tv'&&x.method==='setPowerStatus'||x.name==='light'||x.name==='tapo'&&x.method==='set_device_info');
    assert.equal(significant.length,1);
    assert.equal(significant[0].name,expectedName);
    assert.equal(h.outputs[0].results.filter(r=>r.choice!=='keep').length,1);
  }
});
test('unrecognized parameter and invalid new-mode setting fail closed without sending commands',async()=>{
  const h=harness();await assert.rejects(h.execute('外泊'));assert.deepEqual(h.events,[]);
  const broken=blank();broken.sleep.ac='toggle';
  const bad=harness({prefs:broken});
  await assert.rejects(bad.execute('外出'));
  assert.deepEqual(bad.events,[],'invalid new-scene preferences must stop even legacy scene');
  const old=legacyBlank();old.departure.tv='on';delete old.arrival;
  const badLegacy=harness({prefs:old});
  await assert.rejects(badLegacy.execute('夜'));
  assert.deepEqual(badLegacy.events,[]);
});
test('editor does not execute appliance commands even if all nine scenes contain on/off',async()=>{
  const p=blank();for(const mode of ['departure','arrival','sleep','wake','night','movie','relax','clean','focus'])for(const device of ['tv','light','ac','floor'])p[mode][device]='on';
  const h=harness({prefs:p});await h.execute('edit');
  assert.deepEqual(h.events,[]);
  assert.equal(h.webs.length,1);
  assert.match(h.webs[0].html,/aria-label="シーンの切り替え"/);
});

test('default entry opens remote with 9 scene buttons without touching appliances',async()=>{
  const h=harness({prefs:blank()});await h.execute('');
  assert.equal(h.webs.length,1);
  const html=h.webs[0].html;
  assert.match(html,/const initialView="remote"/);
  assert.match(html,/>YOS Home Scenes<\/h1>/);
  assert.match(html,/>モードリモコン<\/p>/);
  for(const id of ['departure','arrival','sleep','wake','night','movie','relax','clean','focus'])assert.match(html,new RegExp('data-scene="'+id+'"'));
  assert.equal((html.match(/class="scene-tile(?: featured)?"/g)||[]).length,9);
  assert.match(html,/id="openSettings"/);
  assert.match(html,/id="openShortcuts"/);
  assert.match(html,/id="settingsView" hidden/);
  assert.deepEqual(h.events,[]);
});
test('remote runs configured non-sleep scene and reports commands sent',async()=>{
  const p=blank();p.movie.tv='off';
  const h=harness({prefs:p,tvStatus:'active'});await h.execute('');
  assert.equal(h.webs[0].shouldAllowRequest({url:'https://yos-scenes.local/__run?mode=movie'}),false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.events.filter(x=>x.name==='tv'&&x.method==='setPowerStatus').length,1);
  assert.equal(h.events.filter(x=>x.name==='ac'||x.name==='light'||x.name==='tapo').length,0);
  assert.match(h.webs[0].resultCode,/window.yosRunResult\(true,/);
});
test('sleep tile launches existing おやすみマン shortcut exactly once',async()=>{
  const p=blank();p.sleep.tv='off';const h=harness({prefs:p,tvStatus:'active'});
  await h.execute('');
  assert.equal(h.webs[0].shouldAllowRequest({url:'https://yos-scenes.local/__shortcut?name='+encodeURIComponent('おやすみマン')}),false);
  assert.deepEqual(h.events,[{name:'open',url:'shortcuts://run-shortcut?name='+encodeURIComponent('おやすみマン')}]);
  assert.equal(h.webs[0].shouldAllowRequest({url:'https://yos-scenes.local/__run?mode=sleep'}),false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.events.length,1,'no duplicate appliance scene');
});
test('shortcuts app entry opens native Shortcuts; unexpected request is rejected',async()=>{
  const h=harness();await h.execute('');
  assert.equal(h.webs[0].shouldAllowRequest({url:'https://yos-scenes.local/__shortcuts'}),false);
  assert.deepEqual(h.events,[{name:'open',url:'shortcuts://'}]);
  assert.equal(h.webs[0].shouldAllowRequest({url:'https://yos-scenes.local/__run?mode=unknown'}),false);
  assert.equal(h.webs[0].shouldAllowRequest({url:'https://yos-scenes.local/__shortcut?name=Untrusted'}),false);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(h.events.length,1);
});
test('five-scene legacy record survives remote visit and gains four all-keep modes only on save',async()=>{
  const old=blank();for(const k of ['movie','relax','clean','focus'])delete old[k];
  old.departure.tv='off';old.arrival.ac='on';old.sleep.light='off';old.wake.floor='on';
  const h=harness({prefs:old,tvStatus:'active'}),previous=h.data.get(key);
  await h.execute('映画');assert.deepEqual(h.events,[]);
  await h.execute('リモコン');assert.equal(h.data.get(key),previous);
  await h.execute('設定');assert.match(h.webs.at(-1).html,/const initialView="settings"/);
  assert.equal(h.data.get(key),previous);
  const next=blank();Object.assign(next,old);next.clean.tv='off';
  h.webs.at(-1).shouldAllowRequest({url:'https://yos-scenes.local/__save?value='+encodeURIComponent(JSON.stringify(next))});
  assert.equal(JSON.parse(h.data.get(key)).sleep.light,'off');
  assert.equal(JSON.parse(h.data.get(key)).wake.floor,'on');
  assert.equal(JSON.parse(h.data.get(key)).clean.tv,'off');
});
