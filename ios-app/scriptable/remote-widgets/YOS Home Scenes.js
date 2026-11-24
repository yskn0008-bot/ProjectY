// Variables used by Scriptable.
// YOS_SCRIPT_NAME: YOS Home Scenes
// YOS Home Scenes v1.2 — nine-mode scene remote and editable independent power presets.
// No parameter opens the scene remote; "設定"/"edit" opens the 9-scene editor.
// "就寝" in the remote opens the EXISTING iPhone shortcut "おやすみマン".
// Uses existing YOS Remote credentials and Tapo core; no existing script is changed.
const PREF_KEY='yos.home-scenes.presets.v1';
const MODES=['departure','arrival','sleep','wake','night','movie','relax','clean','focus'];
const LEGACY_MODES=['departure','arrival'];
const DEVICES=['tv','light','ac','floor'];
const CHOICES=['on','off','keep'];

function blank(){
  const row=()=>({tv:'keep',light:'keep',ac:'keep',floor:'keep'});
  return {schema:1,departure:row(),arrival:row(),sleep:row(),wake:row(),night:row(),movie:row(),relax:row(),clean:row(),focus:row()};
}
function validated(value){
  if(!value||value.schema!==1||typeof value!=='object')throw Error('保存形式が不正です');
  const next=blank();
  for(const mode of MODES){
    // Existing v1 settings contain only departure/arrival. Missing *new* scenes stay all-keep.
    // Do not rewrite Keychain until the user explicitly chooses Save.
    if(value[mode]===undefined&&!LEGACY_MODES.includes(mode))continue;
    if(!value[mode]||typeof value[mode]!=='object')throw Error('設定が不足しています');
    for(const device of DEVICES){
      if(!CHOICES.includes(value[mode][device]))throw Error('ON・OFF・維持以外の値は使えません');
      next[mode][device]=value[mode][device];
    }
  }
  return next;
}
function readPrefs(){
  if(!Keychain.contains(PREF_KEY))return blank();
  return validated(JSON.parse(Keychain.get(PREF_KEY)));
}
function savePrefs(value){
  const next=JSON.stringify(validated(value));
  const old=Keychain.contains(PREF_KEY)?Keychain.get(PREF_KEY):null;
  try{
    Keychain.set(PREF_KEY,next);
    if(Keychain.get(PREF_KEY)!==next)throw Error('設定の保存確認に失敗しました');
  }catch(e){
    if(old!==null){try{Keychain.set(PREF_KEY,old)}catch(_){}}
    throw e;
  }
}
function modeFromInput(){
  const raw=String(args.shortcutParameter||((args.queryParameters||{}).mode)||'').trim().toLowerCase();
  if(raw==='外出'||raw==='departure')return 'departure';
  if(raw==='帰宅'||raw==='arrival'||raw==='return')return 'arrival';
  if(raw==='就寝'||raw==='sleep'||raw==='bedtime')return 'sleep';
  if(raw==='起床'||raw==='wake'||raw==='morning')return 'wake';
  if(raw==='夜'||raw==='night')return 'night';
  if(raw==='映画'||raw==='movie')return 'movie';
  if(raw==='リラックス'||raw==='relax')return 'relax';
  if(raw==='掃除'||raw==='clean'||raw==='cleaning')return 'clean';
  if(raw==='集中'||raw==='focus')return 'focus';
  if(raw===''||raw==='remote'||raw==='リモコン')return 'remote';
  if(raw==='edit'||raw==='設定'||raw==='settings')return null;
  throw Error('指定できないモードです（外出・帰宅・就寝・起床・夜・映画・リラックス・掃除・集中・リモコン・設定）');
}
function tapoCore(){
  let last=null;
  for(const name of ['YOS Tapo H110 Core','リモコン/内部/Tapo共通']){
    try{return importModule(name)}catch(e){last=e}
  }
  throw Error('既存Tapo共通モジュールを読み込めません: '+String(last&&last.message||last));
}
async function tvPower(wanted){
  const hostKey='yos.bravia.scriptable.host',pskKey='yos.bravia.scriptable.psk';
  if(!Keychain.contains(hostKey)||!Keychain.contains(pskKey))throw Error('BRAVIA接続設定がありません');
  const host=String(Keychain.get(hostKey)).trim().replace(/^https?:\/\//,'').replace(/\/$/,'');
  const psk=Keychain.get(pskKey);
  if(!/^[a-zA-Z0-9.-]+(?::\d{1,5})?$/.test(host))throw Error('BRAVIA接続先の形式が不正です');
  async function rpc(method,params){
    const req=new Request('http://'+host+'/sony/system');
    req.method='POST';req.timeoutInterval=8;
    req.headers={'Content-Type':'application/json','X-Auth-PSK':psk};
    req.body=JSON.stringify({method,params,id:1,version:'1.0'});
    const data=JSON.parse(await req.loadString());
    if(data.error)throw Error('BRAVIA応答エラー: '+JSON.stringify(data.error));
    return data.result;
  }
  const status=(await rpc('getPowerStatus',[]))?.[0]?.status;
  if(status!=='active'&&status!=='standby')throw Error('BRAVIAの電源状態が不明なため送信しません');
  if((status==='active')===wanted)return '既に指定状態';
  await rpc('setPowerStatus',[{status:wanted}]);
  return '操作を送信';
}
async function lightPower(core,wanted){
  const predicate=r=>/ライト|light/i.test(String(r.nickname||''))||String(r.model||'').toLowerCase()==='light';
  await core.fireFriendly(predicate,wanted?['POWER ON','点灯']:['POWER OFF','消灯']);
  return '操作を送信（赤外線）';
}
function findBooleanPower(v){
  if(!v||typeof v!=='object')return null;
  if(typeof v.device_on==='boolean')return v.device_on;
  for(const child of Object.values(v)){const result=findBooleanPower(child);if(result!==null)return result}
  return null;
}
async function floorPower(core,wanted){
  const key='yos.tapo.floor.local-host';
  if(!Keychain.contains(key))throw Error('フロアランプの接続先がありません');
  const host=String(Keychain.get(key)).trim();
  if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host))throw Error('フロアランプのIP形式が不正です');
  const client=await core.clientForHost(host);
  const state=findBooleanPower(await client.query({method:'get_device_info',params:null}));
  if(state===null)throw Error('ランプの電源状態が不明なため送信しません');
  if(state===wanted)return '既に指定状態';
  await client.query({method:'set_device_info',params:{device_on:wanted}});
  return '操作を送信';
}
function objects(value,out){
  if(Array.isArray(value))for(const v of value)objects(v,out);
  else if(value&&typeof value==='object'){out.push(value);for(const v of Object.values(value))objects(v,out)}
  return out;
}
function sleep(ms){
  return new Promise((resolve,reject)=>{
    if(typeof Timer!=='undefined'&&typeof Timer.schedule==='function'){Timer.schedule(ms/1000,false,resolve);return}
    if(typeof setTimeout==='function'){setTimeout(resolve,ms);return}
    reject(Error('エアコン停止の再送タイマーを使えません'));
  });
}
async function acPower(core,wanted){
  const remote=core.findRemote(r=>String(r.model||'').toUpperCase()==='AC'||/エアコン|air.?con/i.test(String(r.nickname||'')));
  if(!remote)throw Error('既存エアコンリモコンが見つかりません');
  const client=await core.client();
  const raw=await client.query({method:'control_child',params:{device_id:remote.device_id,requestData:{method:'get_device_info',params:null}}});
  const info=objects(raw,[]).find(x=>typeof x.ac_status==='string'||typeof x.on==='boolean')||null;
  if(!info)throw Error('エアコンの運転状態が不明なため送信しません');
  const s={};
  if(typeof info.ac_status==='string')for(const item of info.ac_status.split('_')){
    const m=String(item).match(/^([PMTSD])(-?\d+)$/);
    if(m)s[m[1]]=Number(m[2]);
  }
  for(const [key,field] of [['P','on'],['M','ac_mode'],['T','current_temp'],['S','wind_speed'],['D','wind_direct']]){
    if(!Number.isFinite(s[key])&&info[field]!=null)s[key]=Number(info[field]);
  }
  if(!Number.isFinite(s.P)||!Number.isFinite(s.M))throw Error('エアコンの電源・運転モードが不明なため送信しません');
  // Tapo's cached IR status is not a physical power sensor: always send the requested AC state.
  function clamp(n,min,max,fallback){return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
  const payload={power:wanted,on:wanted,mode:s.M,temp:clamp(s.T,18,30,26),wind_speed:clamp(s.S,0,4,0),wind_direct:clamp(s.D,0,6,6)};
  await client.controlAc(remote.device_id,payload);
  if(!wanted){
    // This home's SHARP AC previously needed two OFF commands 1.2s apart.
    await sleep(1200);
    await client.controlAc(remote.device_id,payload);
  }
  return wanted?'運転モードを維持してON送信':'停止コマンドを2回送信';
}
async function execute(mode,prefs){
  const coreNeeded=DEVICES.some(device=>device!=='tv'&&prefs[mode][device]!=='keep');
  let core=null,coreError=null;
  if(coreNeeded){try{core=tapoCore()}catch(e){coreError=e}}
  const results=[];
  for(const device of DEVICES){
    const choice=prefs[mode][device];
    if(choice==='keep'){results.push({device,choice,status:'維持'});continue}
    if(device!=='tv'&&coreError){results.push({device,choice,status:'エラー',detail:String(coreError.message||coreError)});continue}
    try{
      const wanted=choice==='on';
      let detail='';
      if(device==='tv')detail=await tvPower(wanted);
      else if(device==='light')detail=await lightPower(core,wanted);
      else if(device==='ac')detail=await acPower(core,wanted);
      else detail=await floorPower(core,wanted);
      results.push({device,choice,status:'送信',detail});
    }catch(e){
      results.push({device,choice,status:'エラー',detail:String(e.message||e)});
    }
  }
  return results;
}
async function edit(prefs,showRemote){
  const source=JSON.stringify(prefs).replace(/</g,'\\u003c');
  const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{color-scheme:dark;--ink:#f5f7ff;--muted:#bac8e3;--edge:rgba(233,240,255,.24)}
*{box-sizing:border-box}
html,body{width:100%;height:100%;margin:0;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;-webkit-font-smoothing:antialiased}
body{background:radial-gradient(ellipse 90% 50% at 12% -7%,rgba(60,117,202,.5),transparent 78%),radial-gradient(ellipse 95% 85% at 95% 113%,rgba(109,77,161,.35),transparent 78%),linear-gradient(145deg,#192943,#141e35 70%,#202841);color:var(--ink)}
/* Scriptable WebView overlays native Close/Share buttons in the upper corners. */
/* Keep all five tabs below that toolbar, including when a safe-area inset is reported. */
.screen{height:100vh;height:100dvh;width:100%;max-width:530px;margin:auto;padding:max(72px,env(safe-area-inset-top)) 13px max(13px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:11px;overflow:hidden}
button{font:inherit;-webkit-tap-highlight-color:transparent;cursor:pointer}
.tabs{display:flex;flex:0 0 54px;gap:3px;padding:3px;border:1px solid var(--edge);border-radius:18px;background:rgba(208,221,255,.12);box-shadow:inset 0 1px 0 rgba(255,255,255,.09);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
.tab{flex:1;min-width:0;border:0;border-radius:14px;color:#d5def0;background:transparent;font-size:clamp(11px,3.4vw,15px);font-weight:700;transition:background .16s,color .16s}
.tab.active{background:linear-gradient(145deg,#f7f9ff,#d5e4ff);color:#293e65;box-shadow:0 3px 11px rgba(7,18,45,.22),inset 0 1px 0 #fff}
.panel{display:grid;grid-template-rows:repeat(4,minmax(0,1fr));flex:1 1 auto;min-height:0;max-height:510px;border:1px solid var(--edge);border-radius:22px;background:linear-gradient(145deg,rgba(206,220,252,.18),rgba(121,143,197,.1) 60%,rgba(188,196,249,.15));box-shadow:0 16px 28px rgba(3,11,32,.2),inset 0 1px 0 rgba(255,255,255,.12);-webkit-backdrop-filter:blur(21px);backdrop-filter:blur(21px);overflow:hidden}
.device{display:grid;grid-template-columns:minmax(100px,35%) minmax(0,1fr);align-items:center;gap:8px;min-height:0;padding:9px 12px}
.device+.device{border-top:1px solid rgba(230,237,255,.15)}
.identity{display:flex;align-items:center;gap:8px;min-width:0}
.glyph{display:flex;align-items:center;justify-content:center;flex:0 0 32px;width:32px;height:32px;border:1px solid rgba(230,238,255,.16);border-radius:10px;background:linear-gradient(140deg,rgba(226,236,255,.16),rgba(141,160,206,.08))}
.ico{width:19px;height:19px;fill:none;stroke:#e8efff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.name{font-size:14px;font-weight:700;letter-spacing:-.02em;white-space:nowrap}
.kind{font-size:10px;color:var(--muted);margin-top:3px;line-height:1.3}
.choices{display:flex;gap:3px;min-width:0;padding:3px;border-radius:13px;border:1px solid rgba(234,240,255,.16);background:rgba(6,20,48,.25)}
.option{flex:1;min-width:0;min-height:43px;border:0;border-radius:10px;background:transparent;color:#ced8ef;font-weight:700;font-size:13px;transition:background .14s,color .14s}
.option.selected{color:#253b61;background:linear-gradient(155deg,#f3f7ff,#dfe8ff);box-shadow:0 2px 7px rgba(3,14,36,.18)}
.option.selected[data-value="on"]{background:linear-gradient(130deg,#aee0ff,#96bbff)}
.option.selected[data-value="off"]{background:linear-gradient(130deg,#d5deff,#afbafa)}
.option.selected[data-value="keep"]{background:rgba(245,247,255,.92);color:#475470}
.save{flex:0 0 55px;width:100%;margin-top:auto;border:1px solid rgba(229,238,255,.48);border-radius:17px;background:linear-gradient(105deg,#90d7fb,#95b8f8 52%,#b59aeb);color:#233a64;font-size:16px;font-weight:760;box-shadow:0 8px 20px rgba(43,78,163,.22),inset 0 1px 0 rgba(255,255,255,.62)}
.save:disabled{opacity:.65}
.notice{position:absolute;bottom:calc(83px + env(safe-area-inset-bottom));left:20px;right:20px;z-index:2;padding:11px 14px;border:1px solid var(--edge);border-radius:13px;background:#253e6a;color:white;font-size:12px;text-align:center;box-shadow:0 5px 17px rgba(0,0,0,.28)}
.notice:empty{display:none}
.tab:focus-visible,.option:focus-visible,.save:focus-visible{outline:2px solid white;outline-offset:2px}
@media(max-width:359px){.screen{padding-left:9px;padding-right:9px;gap:9px}.device{grid-template-columns:minmax(91px,35%) minmax(0,1fr);gap:4px;padding:6px 8px}.identity{gap:5px}.glyph{width:27px;height:27px;flex-basis:27px}.name{font-size:12px}.kind{font-size:9px}.option{font-size:12px;min-height:39px}}
@media(max-height:550px){.screen{gap:7px;padding-bottom:7px}.tabs{flex-basis:47px}.save{flex-basis:47px}.device{padding-top:4px;padding-bottom:4px}.option{min-height:35px}}
@media(max-height:380px){html,body{overflow:auto}.screen{height:auto;min-height:380px;overflow:visible}.panel{min-height:260px}}
@media(prefers-reduced-motion:reduce){.tab,.option{transition:none}}

/* Both screens keep the native Scriptable Close/Share toolbar clearance above. */
[hidden]{display:none!important}
.shell-view{min-height:0;flex:1;display:flex;flex-direction:column;gap:10px}
.remote-view{justify-content:space-between}
.remote-head{display:flex;align-items:center;gap:13px;flex:0 0 75px;padding:0 10px}
.brand-mark{width:63px;height:63px;flex:0 0 63px;display:grid;place-items:center;border:1px solid rgba(199,218,255,.35);border-radius:19px;background:linear-gradient(145deg,rgba(154,190,255,.3),rgba(63,77,139,.23));box-shadow:inset 0 1px 0 rgba(255,255,255,.16)}
.brand-mark .ico{width:35px;height:35px;stroke:#badcff;stroke-width:1.6}
.remote-title{margin:0;font-size:clamp(20px,5.2vw,27px);font-weight:750;white-space:nowrap;letter-spacing:-.035em}
.remote-subtitle{color:#bdcbe6;font-size:14px;margin:5px 0 0}
.scene-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));gap:10px;flex:1 1 auto;min-height:0;max-height:475px}
.scene-tile{min-width:0;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:11px;border:1px solid rgba(182,202,246,.34);border-radius:23px;background:linear-gradient(152deg,rgba(143,172,230,.15),rgba(27,39,78,.7));color:#f2f6ff;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 8px 22px rgba(1,6,24,.13);transition:transform .15s,background .15s}
.scene-tile .ico{height:33px;width:33px;stroke:#d9e7ff;stroke-width:1.8}
.scene-tile .tile-label{font-size:clamp(12px,3.8vw,17px);font-weight:700;letter-spacing:-.02em}
.scene-tile.featured{background:linear-gradient(145deg,rgba(120,174,255,.67),rgba(146,121,242,.7));border:1.5px solid #c2d7ff;box-shadow:0 0 17px rgba(140,146,255,.23),inset 0 1px 0 rgba(255,255,255,.35)}
.scene-tile:active{transform:scale(.96)}
.scene-tile:disabled{opacity:.5;transform:none}
.device-summary{border:1px solid rgba(181,204,252,.32);border-radius:20px;background:linear-gradient(145deg,rgba(145,180,239,.19),rgba(66,68,123,.22));padding:13px 14px;flex:0 0 auto}
.summary-title{font-size:16px;font-weight:700}
.summary-desc{margin:5px 0 11px;color:#c6d1e6;font-size:11px;line-height:1.45}
.device-chips{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.device-chip{min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;border:1px solid rgba(181,204,252,.22);border-radius:12px;background:rgba(121,147,201,.12);padding:8px 1px 7px;font-size:11px;font-weight:650}
.device-chip .ico{width:22px;height:22px}
.remote-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:0 0 51px}
.remote-action{border:1px solid rgba(183,206,255,.37);border-radius:17px;background:linear-gradient(145deg,rgba(149,183,243,.21),rgba(111,102,190,.2));color:#f0f5ff;font-size:15px;font-weight:700}
.remote-action .ico{vertical-align:middle;height:21px;width:21px;margin-right:5px}
.settings-view .settings-back{flex:0 0 34px;border:0;background:transparent;color:#d8e9ff;text-align:left;font-weight:650;font-size:14px}
.settings-view .tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr));flex:0 0 119px;padding:4px;gap:3px}
.settings-view .tab{font-size:12px;border-radius:10px}
.settings-view .panel{max-height:none}
.settings-view .save{margin-top:0}
.scene-tile:focus-visible,.remote-action:focus-visible,.settings-back:focus-visible{outline:2px solid white;outline-offset:2px}
@media(max-width:359px){.remote-head{flex-basis:62px}.brand-mark{width:50px;height:50px;flex-basis:50px}.scene-grid{gap:7px}.scene-tile{border-radius:17px;gap:7px}.scene-tile .ico{width:27px;height:27px}.device-summary{padding:9px}.summary-desc{margin-bottom:7px}.remote-actions{flex-basis:46px}}
@media(max-height:740px){.remote-head{flex-basis:60px}.brand-mark{width:50px;height:50px;flex-basis:50px}.scene-grid{gap:7px}.scene-tile{gap:6px;border-radius:16px}.scene-tile .ico{width:27px;height:27px}.device-summary{padding:9px}.summary-desc{margin:2px 0 6px}.device-chip{padding:4px 1px;gap:2px}.remote-actions{flex-basis:45px}.settings-view .tabs{flex-basis:96px}.settings-view .settings-back{flex-basis:27px}.settings-view .panel{min-height:0}}
@media(prefers-reduced-motion:reduce){.scene-tile{transition:none}}
</style></head><body>
<div class="screen">

<section class="shell-view remote-view" id="remoteView">
  <header class="remote-head"><div class="brand-mark"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-arrival"></use></svg></div><div><h1 class="remote-title">YOS Home Scenes</h1><p class="remote-subtitle">モードリモコン</p></div></header>
  <main class="scene-grid" aria-label="生活モード9種類"><button type="button" class="scene-tile" data-scene="departure" aria-label="外出モードを実行"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-departure"></use></svg><span class="tile-label">外出</span></button><button type="button" class="scene-tile" data-scene="arrival" aria-label="帰宅モードを実行"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-arrival"></use></svg><span class="tile-label">帰宅</span></button><button type="button" class="scene-tile featured" data-scene="sleep" aria-label="就寝モードを実行"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-sleep"></use></svg><span class="tile-label">就寝</span></button><button type="button" class="scene-tile" data-scene="wake" aria-label="起床モードを実行"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-wake"></use></svg><span class="tile-label">起床</span></button><button type="button" class="scene-tile" data-scene="night" aria-label="夜モードを実行"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-night"></use></svg><span class="tile-label">夜</span></button><button type="button" class="scene-tile" data-scene="movie" aria-label="映画モードを実行"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-movie"></use></svg><span class="tile-label">映画</span></button><button type="button" class="scene-tile" data-scene="relax" aria-label="リラックスモードを実行"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-relax"></use></svg><span class="tile-label">リラックス</span></button><button type="button" class="scene-tile" data-scene="clean" aria-label="掃除モードを実行"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-clean"></use></svg><span class="tile-label">掃除</span></button><button type="button" class="scene-tile" data-scene="focus" aria-label="集中モードを実行"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-focus"></use></svg><span class="tile-label">集中</span></button></main>
  <section class="device-summary"><div class="summary-title">対象家電</div><p class="summary-desc">設定した家電をまとめて操作します。未設定は維持します。</p><div class="device-chips"><div class="device-chip"><svg class="ico" viewBox="0 0 24 24"><use href="#icon-tv"></use></svg>テレビ</div><div class="device-chip"><svg class="ico" viewBox="0 0 24 24"><use href="#icon-light"></use></svg>照明</div><div class="device-chip"><svg class="ico" viewBox="0 0 24 24"><use href="#icon-ac"></use></svg>エアコン</div><div class="device-chip"><svg class="ico" viewBox="0 0 24 24"><use href="#icon-floor"></use></svg>ランプ</div></div></section>
  <footer class="remote-actions"><button type="button" id="openSettings" class="remote-action"><svg class="ico" viewBox="0 0 24 24"><use href="#icon-gear"></use></svg>設定</button><button type="button" id="openShortcuts" class="remote-action"><svg class="ico" viewBox="0 0 24 24"><use href="#icon-stack"></use></svg>ショートカット</button></footer>
</section>
<section class="shell-view settings-view" id="settingsView" hidden>
<button class="settings-back" type="button" id="backRemote">‹ モードリモコンへ戻る</button>
<nav class="tabs" role="tablist" aria-label="シーンの切り替え"><button type="button" class="tab active" role="tab" data-mode="departure" aria-selected="true">外出</button><button type="button" class="tab" role="tab" data-mode="arrival" aria-selected="false">帰宅</button><button type="button" class="tab" role="tab" data-mode="sleep" aria-selected="false">就寝</button><button type="button" class="tab" role="tab" data-mode="wake" aria-selected="false">起床</button><button type="button" class="tab" role="tab" data-mode="night" aria-selected="false">夜</button><button type="button" class="tab" role="tab" data-mode="movie" aria-selected="false">映画</button><button type="button" class="tab" role="tab" data-mode="relax" aria-selected="false">リラックス</button><button type="button" class="tab" role="tab" data-mode="clean" aria-selected="false">掃除</button><button type="button" class="tab" role="tab" data-mode="focus" aria-selected="false">集中</button></nav>
<main class="panel" id="devices" aria-label="家電4台の動作設定"></main>
<button id="save" class="save" type="button">設定を保存</button>
</section>
<div id="notice" class="notice" role="status" aria-live="polite"></div>
<svg style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<symbol id="icon-tv" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></symbol>
<symbol id="icon-light" viewBox="0 0 24 24"><path d="M9 18h6m-6-3h6m-6-3a7 7 0 1 1 6 0l-1 3h-4l-1-3Z"/><path d="M10 21h4"/></symbol>
<symbol id="icon-ac" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="10" rx="2"/><path d="M6 11h12m-12 8v-2m6 4v-4m6 2v-2"/></symbol>
<symbol id="icon-floor" viewBox="0 0 24 24"><path d="M8 4h8l3 8H5zM12 12v9m-5 0h10"/></symbol><symbol id="icon-departure" viewBox="0 0 24 24"><path d="M5 20l4-6 3-3m-4-6a2 2 0 1 0 4 0 2 2 0 0 0-4 0m4 5 3 3 4 1m-9 1 4 2 2 5"/></symbol><symbol id="icon-arrival" viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v9H3zM9 20v-7h6v7"/></symbol><symbol id="icon-sleep" viewBox="0 0 24 24"><path d="M3 19V9m0 5h18v5M3 13h18v-2a3 3 0 0 0-3-3H7a4 4 0 0 0-4 4m8-7h3l-3 4h3M16 3h4l-4 5h4"/></symbol><symbol id="icon-wake" viewBox="0 0 24 24"><path d="M2 19h20M4 15h3m2-6 1 3m9-3-2 3m0 3h3M8 16a4 4 0 0 1 8 0M12 3v4"/></symbol><symbol id="icon-night" viewBox="0 0 24 24"><path d="M20 16a8 8 0 0 1-12-12 8 8 0 1 0 12 12Z"/></symbol><symbol id="icon-movie" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4m10 0h4M3 15h4m10 0h4m-11-9 0 0m6 4-4 3V10l4 3Z"/></symbol><symbol id="icon-relax" viewBox="0 0 24 24"><path d="M4 10h15v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM19 11h2v4l-3 2M8 3c-3 2 2 3 0 5M13 3c-3 2 2 3 0 5"/></symbol><symbol id="icon-clean" viewBox="0 0 24 24"><path d="m12 2 2.1 5.9L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-2.1L12 2ZM20 16l1 2-1 2-1-2-2-2 3 0Z"/></symbol><symbol id="icon-focus" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 21h8m-4-5v5"/></symbol><symbol id="icon-gear" viewBox="0 0 24 24"><path d="m10 2-.4 2-2 1-2-.8-2 3 1.5 1.7v2.2L3.5 13l2 3 2-.8 2 1 .5 2h4l.4-2 2-1 2 .8 2-3-1.5-1.7V9l1.5-1.8-2-3-2 .8-2-1L14 2h-4Z"/><circle cx="12" cy="10" r="2"/></symbol><symbol id="icon-stack" viewBox="0 0 24 24"><path d="m12 2 9 6-9 6-9-6 9-6Zm-9 11 9 6 9-6m-18 4 9 5 9-5"/></symbol>
</svg></div>
<script>
const data=__YOS_PREFS_JSON__;
const initialView=__YOS_INITIAL_VIEW__;
function activateView(target){
document.getElementById("remoteView").hidden=target!=="remote";
document.getElementById("settingsView").hidden=target!=="settings";
document.getElementById("notice").textContent="";
if(target==="settings")draw()
}
document.getElementById("openSettings").onclick=()=>activateView("settings");
document.getElementById("backRemote").onclick=()=>activateView("remote");
let running=false;
window.yosRunResult=function(ok,message){
running=false;
document.querySelectorAll(".scene-tile").forEach(b=>b.disabled=false);
document.getElementById("notice").textContent=message;
};
document.querySelectorAll(".scene-tile").forEach(b=>b.onclick=()=>{
 if(running)return;
 running=true;
 document.querySelectorAll(".scene-tile").forEach(x=>x.disabled=true);
 if(b.dataset.scene==="sleep"){
   location.href="https://yos-scenes.local/__shortcut?name="+encodeURIComponent("おやすみマン");
 }else{
   document.getElementById("notice").textContent="家電に指示を送っています…";
   location.href="https://yos-scenes.local/__run?mode="+encodeURIComponent(b.dataset.scene);
 }
});
document.getElementById("openShortcuts").onclick=()=>{location.href="https://yos-scenes.local/__shortcuts"};

const devices=[["tv","テレビ","BRAVIA"],["light","照明","Ceiling"],["ac","エアコン","SHARP"],["floor","フロアランプ","Tapo"]];
const labels={on:"ON",off:"OFF",keep:"維持"};let mode="departure";
function draw(){
document.querySelectorAll(".tab").forEach(x=>{const active=x.dataset.mode===mode;x.classList.toggle("active",active);x.setAttribute("aria-selected",String(active))});
const root=document.getElementById("devices");root.replaceChildren();
devices.forEach(([id,name,kind])=>{
const el=document.createElement("section");el.className="device";
const identity=document.createElement("div");identity.className="identity";
const icon=document.createElement("span");icon.className="glyph";icon.setAttribute("aria-hidden","true");
icon.innerHTML='<svg class="ico" viewBox="0 0 24 24"><use href="#icon-'+id+'"></use></svg>';
const title=document.createElement("div"),n=document.createElement("div"),k=document.createElement("div");n.className="name";n.textContent=name;k.className="kind";k.textContent=kind;title.append(n,k);identity.append(icon,title);
const row=document.createElement("div");row.className="choices";row.setAttribute("role","group");row.setAttribute("aria-label",name+"の動作");
Object.keys(labels).forEach(value=>{const b=document.createElement("button");const selected=data[mode][id]===value;b.type="button";b.className="option"+(selected?" selected":"");b.dataset.value=value;b.setAttribute("aria-pressed",String(selected));b.textContent=labels[value];b.onclick=()=>{data[mode][id]=value;draw()};row.appendChild(b)});
el.append(identity,row);root.appendChild(el)
})}
document.querySelectorAll(".tab").forEach(x=>x.onclick=()=>{mode=x.dataset.mode;draw()});
window.yosSaveResult=function(ok,msg){document.getElementById("save").disabled=false;document.getElementById("notice").textContent=msg};
document.getElementById("save").onclick=function(){this.disabled=true;document.getElementById("notice").textContent="保存中…";location.href="https://yos-scenes.local/__save?value="+encodeURIComponent(JSON.stringify(data))};draw();activateView(initialView);
</script></body></html>`.replace('__YOS_PREFS_JSON__',source).replace('__YOS_INITIAL_VIEW__',JSON.stringify(showRemote?'remote':'settings'));
  const web=new WebView();
  web.shouldAllowRequest=req=>{
    const url=String(req.url||'');

    const base='https://yos-scenes.local/';
    function report(ok,msg){Promise.resolve(web.evaluateJavaScript('window.yosRunResult('+JSON.stringify(ok)+','+JSON.stringify(msg)+')')).catch(()=>{});}
    if(url.startsWith(base+'__run?')){
      const match=url.match(/[?&]mode=([^&]+)/);
      const mode=match?decodeURIComponent(match[1]):'';
      if(!MODES.includes(mode)||mode==='sleep'){report(false,'実行モードが不正です');return false;}
      Promise.resolve().then(()=>execute(mode,readPrefs())).then(results=>{
        const failed=results.filter(r=>r.status==='エラー');
        const changed=results.filter(r=>r.choice!=='keep');
        const label=({departure:'外出',arrival:'帰宅',wake:'起床',night:'夜',movie:'映画',relax:'リラックス',clean:'掃除',focus:'集中'})[mode];
        const msg=failed.length?label+'：'+failed.length+'件エラー（'+failed.map(r=>r.device+':'+r.detail).join(' / ')+'）':changed.length?label+'：'+changed.length+'件に操作指示を送信':label+'：家電がすべて「維持」です。設定で変更できます';
        report(failed.length===0,msg);
      }).catch(e=>report(false,'操作できません: '+String(e.message||e)));
      return false;
    }
    if(url.startsWith(base+'__shortcut?')){
      const name=url.match(/[?&]name=([^&]+)/);
      if(!name||decodeURIComponent(name[1])!=='おやすみマン'){report(false,'登録されたショートカットではありません');return false;}
      try{
        if(typeof Safari==='undefined'||typeof Safari.open!=='function')throw Error('ショートカット起動機能を確認できません');
        Safari.open('shortcuts://run-shortcut?name='+encodeURIComponent('おやすみマン'));
        report(true,'「おやすみマン」を開きます');
      }catch(e){report(false,'ショートカットを開けません: '+String(e.message||e));}
      return false;
    }
    if(url===base+'__shortcuts'){
      try{
        if(typeof Safari==='undefined'||typeof Safari.open!=='function')throw Error('ショートカットアプリを開けません');
        Safari.open('shortcuts://');
        report(true,'ショートカットを開きます');
      }catch(e){report(false,String(e.message||e))}
      return false;
    }
    if(!url.startsWith(base+'__save?'))return true;
    let ok=true,message='9シーンの設定を保存しました';
    try{
      const match=url.match(/[?&]value=([^&]+)/);
      if(!match)throw Error('保存する設定がありません');
      savePrefs(JSON.parse(decodeURIComponent(match[1])));
    }catch(e){ok=false;message='保存できません: '+String(e.message||e)}
    Promise.resolve(web.evaluateJavaScript('window.yosSaveResult('+JSON.stringify(ok)+','+JSON.stringify(message)+')')).catch(()=>{});
    return false;
  };
  await web.loadHTML(html,'https://yos-scenes.local/');
  await web.present(false);
}
async function main(){
  const mode=modeFromInput();
  const prefs=readPrefs();
  if(mode==='remote'||mode===null){await edit(prefs,mode==='remote');Script.complete();return}
  const results=await execute(mode,prefs);
  const output={scene:mode,results};
  Script.setShortcutOutput(JSON.stringify(output));
  Script.complete();
}
await main();
