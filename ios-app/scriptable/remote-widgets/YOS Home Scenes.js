// Variables used by Scriptable.
// YOS_SCRIPT_NAME: YOS Home Scenes
// YOS Home Scenes v1.1 — five independent power presets: 外出 / 帰宅 / 就寝 / 起床 / 夜.
// Run without a parameter to edit. Shortcut parameter: one of the five scene names.
// Uses existing YOS Remote credentials and Tapo core; no existing script is changed.
const PREF_KEY='yos.home-scenes.presets.v1';
const MODES=['departure','arrival','sleep','wake','night'];
const LEGACY_MODES=['departure','arrival'];
const DEVICES=['tv','light','ac','floor'];
const CHOICES=['on','off','keep'];

function blank(){
  const row=()=>({tv:'keep',light:'keep',ac:'keep',floor:'keep'});
  return {schema:1,departure:row(),arrival:row(),sleep:row(),wake:row(),night:row()};
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
  if(raw===''||raw==='edit'||raw==='設定')return null;
  throw Error('指定は 外出 / 帰宅 / 就寝 / 起床 / 夜 / edit のいずれかです');
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
async function edit(prefs){
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
</style></head><body>
<div class="screen">
<nav class="tabs" role="tablist" aria-label="シーンの切り替え"><button type="button" class="tab active" role="tab" data-mode="departure" aria-selected="true">外出</button><button type="button" class="tab" role="tab" data-mode="arrival" aria-selected="false">帰宅</button><button type="button" class="tab" role="tab" data-mode="sleep" aria-selected="false">就寝</button><button type="button" class="tab" role="tab" data-mode="wake" aria-selected="false">起床</button><button type="button" class="tab" role="tab" data-mode="night" aria-selected="false">夜</button></nav>
<main class="panel" id="devices" aria-label="家電4台の動作設定"></main>
<button id="save" class="save" type="button">設定を保存</button>
<div id="notice" class="notice" role="status" aria-live="polite"></div>
<svg style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">
<symbol id="icon-tv" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></symbol>
<symbol id="icon-light" viewBox="0 0 24 24"><path d="M9 18h6m-6-3h6m-6-3a7 7 0 1 1 6 0l-1 3h-4l-1-3Z"/><path d="M10 21h4"/></symbol>
<symbol id="icon-ac" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="10" rx="2"/><path d="M6 11h12m-12 8v-2m6 4v-4m6 2v-2"/></symbol>
<symbol id="icon-floor" viewBox="0 0 24 24"><path d="M8 4h8l3 8H5zM12 12v9m-5 0h10"/></symbol>
</svg></div>
<script>
const data=__YOS_PREFS_JSON__;
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
document.getElementById("save").onclick=function(){this.disabled=true;document.getElementById("notice").textContent="保存中…";location.href="https://yos-scenes.local/__save?value="+encodeURIComponent(JSON.stringify(data))};draw();
</script></body></html>`.replace('__YOS_PREFS_JSON__',source);
  const web=new WebView();
  web.shouldAllowRequest=req=>{
    const url=String(req.url||'');
    if(!url.startsWith('https://yos-scenes.local/__save?'))return true;
    let ok=true,message='5シーンの設定を保存しました';
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
  if(!mode){await edit(prefs);Script.complete();return}
  const results=await execute(mode,prefs);
  const output={scene:mode,results};
  Script.setShortcutOutput(JSON.stringify(output));
  Script.complete();
}
await main();
