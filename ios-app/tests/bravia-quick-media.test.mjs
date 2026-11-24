import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/quick-media/YOS Remote Hub Quick TEST.js',import.meta.url),'utf8');
const backendStart=source.indexOf('const QUICK_APP_MATCHERS=');
const backendEnd=source.indexOf('async function discoverSony(){',backendStart);
assert.ok(backendStart>0&&backendEnd>backendStart,'backend boundaries');
const backend=source.slice(backendStart,backendEnd);

function mockHub({unsupportedSound=false,aggregateSoundBlocked=false,appFailure=false,installed=['YouTube','Netflix','Prime Video','U-NEXT','Proton VPN'],hdmiConfirmed=true,delayedHDMI=false}={}){
  const requests=[];
  const audio={
    soundMode:{target:'soundMode',currentValue:'Standard',candidate:[{value:'Standard'},{value:'Cinema'}]},
    outputTerminal:{target:'outputTerminal',currentValue:'speaker',candidate:[{value:'speaker'},{value:'audioSystem'}]},
  };
  const apps=installed.map((title,i)=>({title,uri:'com.example.test.app'+i}));
  class Request {
    constructor(url){this.url=url;}
    async loadString(){
      const req=JSON.parse(this.body);requests.push({url:this.url,...req});
      if(this.url.endsWith('/sony/audio')){
        if(unsupportedSound) return JSON.stringify({error:[404,'Unknown method']});
        if(req.method==='getSoundSettings'){
          if(aggregateSoundBlocked&&req.params[0].target==='')return JSON.stringify({error:[404,'Unsupported aggregate']});
          const chosen=req.params[0].target;
          return JSON.stringify({result:[[...Object.values(audio).filter(x=>!chosen||x.target===chosen)]]});
        }
        if(req.method==='setSoundSettings'){
          const item=req.params[0].settings[0];
          if(!Object.hasOwn(audio,item.target))return JSON.stringify({error:[404,'Invalid target']});
          audio[item.target].currentValue=item.value;return JSON.stringify({result:[]});
        }
      }
      if(this.url.endsWith('/sony/appControl')){
        if(appFailure)return JSON.stringify({error:[404,'Unknown method']});
        if(req.method==='getApplicationList')return JSON.stringify({result:[apps]});
        if(req.method==='setActiveApp')return JSON.stringify({result:[]});
      }
      if(this.url.endsWith('/sony/avContent')){
        if(req.method==='setPlayContent')return JSON.stringify({result:[]});
        if(req.method==='getPlayingContentInfo'){
          const checks=requests.filter(x=>x.method==='getPlayingContentInfo').length;
          const success=hdmiConfirmed&&(!delayedHDMI||checks>=2);
          return JSON.stringify({result:[{source:'extInput:hdmi',uri:success?'extInput:hdmi?port=3':'extInput:hdmi?port=2'}]});
        }
      }
      throw Error('Unexpected fake API: '+req.method);
    }
  }
  const commandIndex=new Map([['digital','fake-tv-ircc-code']]);
  const sonyAction=async()=>requests.push({method:'irccTv'});
  const Timer={schedule(ms,repeats,fn){assert.equal(ms,450);assert.equal(repeats,false);fn();}};
  const evaluate=new Function('Request','sonyHost','sonyPSK','pictureProbe','discoverSony','commandIndex','sonyAction','Timer',
     backend+'; return {quickInstalledApps,quickLaunchApp,quickAudioRead,quickAudioWrite,quickHDMI3,quickTVTuner,quickProbe,quickAction,quickAppPick,quickSoundFlatten};');
  const funcs=evaluate(Request,()=>'192.168.0.15',()=>'mock-only',async()=>({entries:[],saved:{}}),async()=>{},commandIndex,sonyAction,Timer);
  return {funcs,requests,audio};
}
test('isolated v6.6 four-device UI and existing preset keys are preserved',()=>{
  for (const t of ['data-panel="tv"','data-panel="light"','data-panel="ac"','data-panel="floor"',
       'YOS Light Widget','YOS AC Widget','yos.tapo.floor.local-host','YOS Remote Hub v6.6',
       'yos.bravia.scriptable.picture-user-preset.v2.','YOS Remote Hub Quick TEST']) {
    if(t==='YOS Remote Hub Quick TEST')continue;
    assert.ok(source.includes(t),t);
  }
  assert.ok(!source.includes('const PICTURE_PRESET_PREFIX="yos.bravia.scriptable.picture-user-preset.v3."'));
  assert.match(source,/id="quickPictureModes"/);
  assert.match(source,/id="quickSoundModes"/);
  assert.match(source,/id="quickAudioOutputs"/);
  assert.match(source,/Fire TV（HDMI3）/);
});
test('sound mode and output expose only television-provided candidates',async()=>{
 const {funcs,requests}=mockHub();
 const vals=await funcs.quickAudioRead();
 assert.deepEqual(vals.soundMode.options,['Standard','Cinema']);
 assert.deepEqual(vals.outputTerminal.options,['speaker','audioSystem']);
 const response=await funcs.quickAudioWrite({target:'soundMode',value:'Cinema'});
 assert.equal(response.sound.soundMode.value,'Cinema');
 assert.ok(requests.some(x=>x.method==='setSoundSettings'&&x.params[0].settings[0].value==='Cinema'));
 await assert.rejects(()=>funcs.quickAudioWrite({target:'outputTerminal',value:'headphone'}),/候補値/);
 await assert.rejects(()=>funcs.quickAudioWrite({target:'brightness',value:'200'}),/未対応/);
});
test('sound unsupported stops without writing',async()=>{
 const {funcs,requests}=mockHub({unsupportedSound:true});
 assert.deepEqual(await funcs.quickAudioRead(),{});
 await assert.rejects(()=>funcs.quickAudioWrite({target:'outputTerminal',value:'audioSystem'}),/候補値/);
 assert.ok(!requests.some(x=>x.method==='setSoundSettings'));
});
test('apps launch by actual app list, not hard-coded package IDs',async()=>{
 const {funcs,requests}=mockHub();
 const available=await funcs.quickInstalledApps();
 for(const key of ['youtube','netflix','prime','unext','proton'])assert.equal(available[key],true,key);
 const out=await funcs.quickLaunchApp('unext');
 assert.match(out.message,/起動要求/);
 const set=requests.filter(x=>x.method==='setActiveApp');
 assert.equal(set.length,1);assert.equal(set[0].params[0].uri,'com.example.test.app3');
 await assert.rejects(()=>funcs.quickLaunchApp('unknown'),/未登録/);
});
test('missing apps fail closed: no fallback to invented URIs',async()=>{
 const {funcs,requests}=mockHub({installed:['YouTube']});
 await assert.rejects(()=>funcs.quickLaunchApp('netflix'),/インストール済みアプリ一覧にありません/);
 assert.ok(!requests.some(x=>x.method==='setActiveApp'));
});
test('Proton VPN is app launch only; no false VPN on/off claim',async()=>{
 const {funcs,requests}=mockHub();
 const v=await funcs.quickLaunchApp('proton');
 assert.match(v.message,/アプリ起動要求/);
 assert.equal(requests.filter(x=>x.method==='setActiveApp').length,1);
 assert.ok(!source.includes('setVpnConnection'));
 assert.match(source,/VPN接続・解除の直接操作はまだ非対応/);
});
test('Fire TV HDMI3 is selected and verified; DMM app is never falsely launched',async()=>{
 const {funcs,requests}=mockHub();
 const o=await funcs.quickHDMI3();
 assert.match(o.message,/HDMI3をテレビ側で確認/);
 const change=requests.find(x=>x.method==='setPlayContent');
 assert.deepEqual(change.params,[{uri:'extInput:hdmi?port=3'}]);
 assert.equal(requests.some(x=>x.method==='setActiveApp'),false);
});
test('HDMI3 readback mismatch must be an error',async()=>{
 const {funcs}=mockHub({hdmiConfirmed:false});
 await assert.rejects(()=>funcs.quickHDMI3(),/入力を確認できません/);
});
test('broadcast TV uses Sony IRCC only when advertised',async()=>{
 const {funcs,requests}=mockHub();
 assert.match((await funcs.quickTVTuner()).message,/送信/);
 assert.ok(requests.some(x=>x.method==='irccTv'));
});
test('quickProbe is read-only and does not mutate TV',async()=>{
 const {funcs,requests}=mockHub();
 const p=await funcs.quickProbe();
 assert.equal(p.apps.netflix,true);
 assert.equal(p.sound.outputTerminal.value,'speaker');
 assert.ok(p.picture);
 assert.ok(requests.every(x=>!['setActiveApp','setPlayContent','setSoundSettings'].includes(x.method)));
});

test('ACTUAL rendered Scriptable WebView script parses and starts the remote buttons',()=>{
  const tick=String.fromCharCode(96);
  const start=source.indexOf('const html = '+tick);
  const end=source.indexOf('</html>'+tick,start);
  assert.ok(start>0&&end>start,'HTML template boundaries');
  const template=source.slice(start+'const html = '.length,end+'</html>'.length+1);
  const render=new Function('REMOTES','TV_ACTIONS','TV_DEFAULT','CROSS_NAV','SWIPE_THRESHOLD','makeButtons','LIGHT_BUTTONS','AC_BUTTONS','return '+template);
  const actions=[{action:'play',icon:'▶',label:'再生'},{action:'up',icon:'↑',label:'上'}];
  const html=render({tv:'scriptable://run'},actions,['play','up'],{up:'up',down:'up',left:'up',right:'up',center:'play'},24,()=>'',[],[]);
  const begin=html.indexOf('<script>'),finish=html.indexOf('</script>',begin);
  assert.ok(begin>0&&finish>begin,'rendered script boundaries');
  const runtime=html.slice(begin+8,finish);
  assert.doesNotThrow(()=>new Function(runtime),'the rendered HTML must have valid JS');
  const nodes=new Map();
  class Node{
    constructor(){this.children=[];this.textContent='';this.style={};this.classList={add(){},remove(){},toggle(){}};this.dataset={};}
    set innerHTML(s){this._html=s;this.children=[]}
    get innerHTML(){return this._html||''}
    appendChild(node){this.children.push(node);return node}
    addEventListener(type,handler){this.handlers=this.handlers||{};this.handlers[type]=handler}
    setAttribute(){}
  }
  const document={
    getElementById(id){if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id)},
    createElement(){return new Node()},querySelectorAll(){return []},
    addEventListener(){},hidden:false
  };
  const window={location:{href:''},addEventListener(){}};
  const localStorage={getItem(){return null},setItem(){}};
  const launch=new Function('window','document','localStorage','setInterval','clearInterval','setTimeout','clearTimeout',
    runtime+'; return {showQuickStatus,quickModeButtons,quickAppButtons};');
  const timers=[];const ui=launch(window,document,localStorage,()=>1,()=>{},fn=>{timers.push(fn);return timers.length},()=>{});
  assert.ok(nodes.get('tvGrid').children.length>=2,'navigation buttons must render');
  assert.equal(nodes.get('modeBadge').textContent,'カーソル','mode must not stay 判定中');
  assert.equal(window.location.href,'','initial render must not navigate');
  let events=[];const receive=raw=>{events.push(...JSON.parse(raw))};
  window.YOS_REMOTE_EXCHANGE([],receive);
  timers.shift()();
  window.YOS_REMOTE_EXCHANGE([],receive);
  assert.ok(events.some(x=>x.device==='system'&&x.action==='refreshMode'),'status request after bridge opens');
  ui.showQuickStatus({ok:true,quick:{
    picture:{entries:[{target:'pictureMode',value:'custom',available:true,
      options:['custom','standard'],min:null,max:null,step:null}],saved:{day:false},message:'読取成功'},
    sound:{soundMode:{available:true,value:'Standard',options:['Standard','Cinema']},
      outputTerminal:{available:true,value:'speaker',options:['speaker','audioSystem']}},
    apps:{youtube:true,netflix:true}
  }});
  assert.equal(nodes.get('quickPictureModes').children.length,2,'one-tap picture modes must appear');
  assert.equal(nodes.get('quickPictureModesPanel').children.length,2);
  assert.equal(nodes.get('quickSoundModes').children.length,2,'sound mode choices must appear');
  assert.equal(nodes.get('quickAudioOutputs').children.length,2,'audio output choices must appear');
  assert.equal(nodes.get('quickApps').children.length,5,'all app names must appear');
  ui.showQuickStatus({ok:true,quick:{apps:{youtube:true,netflix:true}}});
  assert.equal(nodes.get('quickSoundModes').children.length,2,'launching app must not clear sound choices');
  assert.equal(nodes.get('quickAudioOutputs').children.length,2,'launching app must not clear output choices');
  window.location.href='';
  nodes.get('quickPictureModes').children[1].handlers.click({
    preventDefault(){},stopPropagation(){}
  });
  window.YOS_REMOTE_EXCHANGE([],receive);
  assert.equal(window.location.href,'','picture click must not navigate');
  assert.ok(events.some(x=>x.device==='picture'&&x.action==='set'&&JSON.parse(x.slot).target==='pictureMode'),'picture click must preserve target');
});

test('existing 12-key adaptive cursor/playback switching remains BYTE-FOR-BYTE identical to v6.6',()=>{
  const original=fs.readFileSync(new URL('../scriptable/remote-widgets/picture-v66/YOS Remote Hub.js',import.meta.url),'utf8');
  const segments=[
    ['const TV_ACTIONS =','const LIGHT_BUTTONS ='],
    ['function makeTVKey(','function modeLabel('],
    ['function setMode(','function renderConfig('],
    ['function loadMode()','async function sonyJSON('],
    ['async function inferMode()','function walk(']
  ];
  for(const [start,end] of segments){
    const i=original.indexOf(start),j=original.indexOf(end,i+1);
    const k=source.indexOf(start),m=source.indexOf(end,k+1);
    assert.ok(i>=0&&j>i&&k>=0&&m>k,'required existing source segment: '+start);
    assert.equal(source.slice(k,m),original.slice(i,j),'do not change adaptive control: '+start);
  }
  assert.match(source,/const CROSS_NAV = \{ up:"up", left:"left", center:"confirm", right:"right", down:"down" \}/);
  assert.ok(!source.includes('カーソル操作</button>'));
  assert.ok(!source.includes('再生操作</button>'));
});

test('Sony TVs rejecting aggregate getSoundSettings still expose individual supported targets',async()=>{
 const {funcs,requests}=mockHub({aggregateSoundBlocked:true});
 const sound=await funcs.quickAudioRead();
 assert.equal(sound.soundMode.value,'Standard');
 assert.equal(sound.outputTerminal.value,'speaker');
 assert.ok(requests.some(x=>x.method==='getSoundSettings'&&x.params[0].target==='soundMode'));
 assert.ok(requests.some(x=>x.method==='getSoundSettings'&&x.params[0].target==='outputTerminal'));
});
test('HDMI3 asynchronous switching is read back before reporting success',async()=>{
 const {funcs,requests}=mockHub({delayedHDMI:true});
 const result=await funcs.quickHDMI3();
 assert.match(result.message,/HDMI3をテレビ側で確認/);
 assert.equal(requests.filter(x=>x.method==='getPlayingContentInfo').length,2);
});
test('quick UI partial update does not wipe audio selection after launching app',()=>{
 assert.match(source,/hasOwnProperty\.call\(result\.quick,"sound"\)/);
 assert.match(source,/hasOwnProperty\.call\(result\.quick,"apps"\)/);
});
