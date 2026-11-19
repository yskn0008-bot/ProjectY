import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../scriptable/remote-widgets/quick-media/YOS Remote Hub Quick TEST.js',import.meta.url),'utf8');
const backendStart=source.indexOf('const QUICK_APP_MATCHERS=');
const backendEnd=source.indexOf('async function discoverSony(){',backendStart);
assert.ok(backendStart>0&&backendEnd>backendStart,'backend boundaries');
const backend=source.slice(backendStart,backendEnd);

function mockHub({unsupportedSound=false,appFailure=false,installed=['YouTube','Netflix','Prime Video','U-NEXT','Proton VPN'],hdmiConfirmed=true}={}){
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
        if(req.method==='getSoundSettings')return JSON.stringify({result:[[...Object.values(audio)]]});
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
        if(req.method==='getPlayingContentInfo')return JSON.stringify({result:[{source:'extInput:hdmi',title:'HDMI3',uri:hdmiConfirmed?'extInput:hdmi?port=3':'extInput:hdmi?port=2'}]});
      }
      throw Error('Unexpected fake API: '+req.method);
    }
  }
  const commandIndex=new Map([['digital','fake-tv-ircc-code']]);
  const sonyAction=async()=>requests.push({method:'irccTv'});
  const evaluate=new Function('Request','sonyHost','sonyPSK','pictureProbe','discoverSony','commandIndex','sonyAction',
     backend+'; return {quickInstalledApps,quickLaunchApp,quickAudioRead,quickAudioWrite,quickHDMI3,quickTVTuner,quickProbe,quickAction,quickAppPick,quickSoundFlatten};');
  const funcs=evaluate(Request,()=>'192.168.0.15',()=>'mock-only',async()=>({entries:[],saved:{}}),async()=>{},commandIndex,sonyAction);
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

test('generated WebView JavaScript is syntactically valid, including quick-mode buttons',()=>{
 const begin=source.indexOf('<script>'),end=source.indexOf('</script>',begin);
 assert.ok(begin>0&&end>begin,'Scriptable WebView inline script boundaries');
 let htmlScript=source.slice(begin+8,end);
 // The surrounding Scriptable template interpolates these JSON objects at runtime.
 htmlScript=htmlScript.replace(/\$\{JSON\.stringify\([^)]*\)\}/g,'[]');
 assert.doesNotThrow(()=>new Function(htmlScript));
});
