// Variables used by Scriptable.
// YOS_SCRIPT_NAME: YOS Home Scenes
// YOS Home Scenes v1.0 — configurable 外出 / 帰宅 power presets.
// Run without a parameter to edit. Shortcut parameter: "外出" / "帰宅".
// Uses existing YOS Remote credentials and Tapo core; no existing script is changed.
const PREF_KEY='yos.home-scenes.presets.v1';
const MODES=['departure','arrival'];
const DEVICES=['tv','light','ac','floor'];
const CHOICES=['on','off','keep'];

function blank(){
  const row=()=>({tv:'keep',light:'keep',ac:'keep',floor:'keep'});
  return {schema:1,departure:row(),arrival:row()};
}
function validated(value){
  if(!value||value.schema!==1||typeof value!=='object')throw Error('保存形式が不正です');
  const next=blank();
  for(const mode of MODES){
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
  if(raw===''||raw==='edit'||raw==='設定')return null;
  throw Error('指定は 外出 / 帰宅 / edit のいずれかです');
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
  const html=[
'<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
'<style>',
':root{color-scheme:dark;--bg:#151e32;--ink:#f8f9ff;--sub:#c5cee4;--quiet:#9caac9;--edge:rgba(221,229,255,.22);--blue:#a2d4ff;--violet:#c3adff;--glow:rgba(128,157,255,.28)}',
'*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--bg);color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;-webkit-font-smoothing:antialiased}',
'body{background:radial-gradient(ellipse 92% 37% at 24% 5%,rgba(61,119,210,.59),transparent 82%),radial-gradient(ellipse 78% 40% at 98% 20%,rgba(120,76,144,.35),transparent 81%),radial-gradient(ellipse 110% 85% at 22% 110%,rgba(63,82,136,.56),transparent 92%),linear-gradient(155deg,#17243e 0%,#141d32 56%,#18213c 100%);padding:calc(27px + env(safe-area-inset-top)) 18px calc(35px + env(safe-area-inset-bottom));min-height:100vh}',
'.wrap{max-width:480px;margin:0 auto}.top{display:flex;align-items:center;gap:10px;margin:0 0 25px;color:#edf3ff;font-size:14px;font-weight:670;letter-spacing:.012em}.top-icon{display:flex;align-items:center;justify-content:center;width:27px;height:27px;border:1px solid rgba(239,244,255,.32);border-radius:9px;background:rgba(245,248,255,.07)}',
'.hero{padding:0 6px 20px}.eyebrow{font-size:10px;letter-spacing:.2em;font-weight:750;color:#aab9dc;margin:0 0 8px}.heading{font-size:33px;line-height:1.1;font-weight:740;letter-spacing:-.045em;margin:0 0 10px;text-shadow:0 2px 18px rgba(162,192,255,.15)}',
'.intro{color:#d7def2;font-size:13px;line-height:1.7;letter-spacing:.02em;margin:0}.tabs{display:flex;gap:5px;padding:5px;margin:18px 0 20px;border-radius:22px;background:linear-gradient(150deg,rgba(217,227,255,.16),rgba(142,156,202,.09));border:1px solid rgba(232,239,255,.28);box-shadow:inset 0 1px 0 rgba(255,255,255,.08);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}',
'button{font:inherit;-webkit-tap-highlight-color:transparent;cursor:pointer}.tab{flex:1;min-height:48px;border:0;border-radius:17px;color:#d3dcf3;background:transparent;font-size:14px;font-weight:670;transition:background .18s,color .18s,box-shadow .18s}.tab.active{background:linear-gradient(148deg,#f4f7ff,#d5e6ff);color:#263d63;box-shadow:0 4px 12px rgba(3,13,37,.23),inset 0 1px 0 #fff}',
'.glass{border:1px solid rgba(231,236,255,.24);border-radius:26px;background:linear-gradient(142deg,rgba(200,211,246,.19),rgba(111,134,188,.1) 55%,rgba(196,201,251,.16));box-shadow:0 17px 40px rgba(3,10,30,.26),inset 0 1px 0 rgba(255,255,255,.12);-webkit-backdrop-filter:blur(24px);backdrop-filter:blur(24px);overflow:hidden}',
'.scenehead{display:flex;align-items:center;gap:13px;padding:21px 18px 15px}.sceneicon{height:49px;width:49px;flex:0 0 49px;border-radius:17px;display:flex;align-items:center;justify-content:center;color:#fff;background:linear-gradient(135deg,#7194ea,#a383c4 65%,#d6a7ba);box-shadow:inset 0 1px 1px rgba(255,255,255,.35),0 7px 18px rgba(21,26,72,.24)}',
'.scenename{font-size:20px;font-weight:730;letter-spacing:-.035em;margin:0 0 4px}.scenedesc{font-size:11px;color:#c5cde2;margin:0;line-height:1.5}.list{margin:0 12px 12px;border-radius:20px;border:1px solid rgba(230,239,255,.15);background:linear-gradient(140deg,rgba(20,33,65,.28),rgba(23,31,58,.17));overflow:hidden}',
'.device{padding:16px 14px}.device+.device{border-top:1px solid rgba(240,245,255,.13)}.devicehead{display:flex;gap:10px;align-items:center;margin-bottom:12px}.glyph{display:flex;align-items:center;justify-content:center;width:35px;height:35px;border-radius:11px;background:rgba(236,244,255,.1);border:1px solid rgba(238,243,255,.09);color:#e3edff;flex:0 0 35px}.ico{display:block;width:21px;height:21px;stroke:currentColor;stroke-width:1.7;fill:none;stroke-linecap:round;stroke-linejoin:round}',
'.name{font-size:14px;font-weight:690;color:#f3f5ff;letter-spacing:-.012em}.kind{font-size:10px;color:#9eadd0;letter-spacing:.04em;margin-top:2px}.choices{display:flex;gap:4px;padding:4px;border:1px solid rgba(244,249,255,.16);border-radius:14px;background:rgba(4,15,38,.17)}',
'.option{min-height:40px;flex:1;min-width:0;background:transparent;border:0;border-radius:10px;color:#d2d9ee;font-size:13px;font-weight:670;transition:background .14s,color .14s,box-shadow .14s}.option.selected{background:linear-gradient(155deg,#f5f7ff,#e0e7f9);color:#2c3e60;box-shadow:0 2px 9px rgba(10,20,48,.18)}',
'.option.selected[data-value="on"]{background:linear-gradient(135deg,#a9ddff,#8cbaff);color:#213961}.option.selected[data-value="off"]{background:linear-gradient(135deg,#c2d6ff,#a9bff6);color:#283d65}.option.selected[data-value="keep"]{background:rgba(243,246,255,.92);color:#43506d}',
'.hint{margin:15px 7px 0;color:#c0cbe2;font-size:11px;line-height:1.65}.save{display:block;width:100%;min-height:57px;margin:23px 0 0;padding:15px 16px;border-radius:18px;border:1px solid rgba(232,241,255,.55);background:linear-gradient(104deg,#8ed5fa 0%,#92b7f8 51%,#b397ec 100%);color:#253a64;font-size:16px;font-weight:760;letter-spacing:.01em;box-shadow:0 11px 28px rgba(64,98,197,.24),inset 0 1px 0 rgba(255,255,255,.55)}',
'.save:disabled{opacity:.64}.notice{margin:13px 0 0;min-height:22px;text-align:center;color:#d5e8ff;font-size:12px}.foot{text-align:center;color:#aeb9d2;font-size:11px;line-height:1.75;margin:16px 9px 0}',
'.tab:focus-visible,.option:focus-visible,.save:focus-visible{outline:2px solid #e0efff;outline-offset:3px}',
'@media(max-width:365px){body{padding-left:12px;padding-right:12px}.hero{padding-left:3px}.heading{font-size:29px}.scenehead{padding-left:14px;padding-right:14px}}@media(prefers-reduced-motion:reduce){.tab,.option{transition:none}}',
'</style></head><body><div class="wrap">',
'<div class="top"><span class="top-icon" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24"><path d="M3 11 12 3l9 8v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-7h6v7"/></svg></span>YOS Home</div>',
'<header class="hero"><div class="eyebrow">HOME AUTOMATION</div><h1 class="heading">Home Scenes</h1><p class="intro">外出・帰宅の家電を、自分のスタイルで。</p></header>',
'<nav class="tabs" role="tablist" aria-label="シーンの切り替え"><button type="button" class="tab active" data-mode="departure" role="tab" aria-selected="true">外出時の設定</button><button type="button" class="tab" data-mode="arrival" role="tab" aria-selected="false">帰宅時の設定</button></nav>',
'<main class="glass"><div class="scenehead"><div class="sceneicon" aria-hidden="true"><svg class="ico" viewBox="0 0 24 24" style="width:27px;height:27px"><circle cx="13" cy="4" r="2"/><path d="m7 21 2-6 3-4 2 3 3 2m-12-7 4-3 4 2 3 4m-4 9 1-6"/></svg></div><div><h2 class="scenename" id="scenename">外出シーン</h2><p class="scenedesc" id="scenedesc">家を離れるときに実行する家電の設定</p></div></div>',
'<div id="devices" class="list"></div></main>',
'<p class="hint">ON・OFF・維持を家電ごとに設定。「維持」は操作しません。保存だけでは家電は動きません。</p>',
'<button type="button" id="save" class="save">✓　設定を保存</button><div class="notice" id="notice" role="status" aria-live="polite"></div>',
'<p class="foot">設定はこのiPhone内に保存されます。自動実行には既存の外出・帰宅オートメーションとの接続が必要です。</p>',
'<svg style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">',
'<symbol id="icon-tv" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></symbol>',
'<symbol id="icon-light" viewBox="0 0 24 24"><path d="M9 18h6m-6-3h6m-6-3a7 7 0 1 1 6 0l-1 3h-4l-1-3Z"/><path d="M10 21h4"/></symbol>',
'<symbol id="icon-ac" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="10" rx="2"/><path d="M6 11h12m-12 8v-2m6 4v-4m6 2v-2"/></symbol>',
'<symbol id="icon-floor" viewBox="0 0 24 24"><path d="M8 4h8l3 8H5zM12 12v9m-5 0h10"/></symbol></svg>',
'</div><script>',
'const data=',source,';',
'const names={tv:"テレビ",light:"照明",ac:"エアコン",floor:"フロアランプ"};',
'const kinds={tv:"BRAVIA",light:"Ceiling light",ac:"SHARP",floor:"Tapo"};',
'const labels={on:"ON",off:"OFF",keep:"維持"};let mode="departure";',
'function draw(){document.querySelectorAll(".tab").forEach(x=>{const active=x.dataset.mode===mode;x.classList.toggle("active",active);x.setAttribute("aria-selected",String(active))});',
'document.getElementById("scenename").textContent=mode==="departure"?"外出シーン":"帰宅シーン";',
'document.getElementById("scenedesc").textContent=mode==="departure"?"家を離れるときに実行する家電の設定":"家に戻ったときに実行する家電の設定";',
'const root=document.getElementById("devices");root.textContent="";Object.keys(names).forEach(device=>{const card=document.createElement("section");card.className="device";',
'const header=document.createElement("div");header.className="devicehead";const glyph=document.createElement("span");glyph.className="glyph";glyph.setAttribute("aria-hidden","true");glyph.innerHTML="<svg class=\\"ico\\" viewBox=\\"0 0 24 24\\"><use href=\\"#icon-"+device+"\\"></use></svg>";',
'const titleBox=document.createElement("div");const title=document.createElement("div");title.className="name";title.textContent=names[device];const kind=document.createElement("div");kind.className="kind";kind.textContent=kinds[device];titleBox.append(title,kind);header.append(glyph,titleBox);card.appendChild(header);',
'const row=document.createElement("div");row.className="choices";row.setAttribute("role","group");row.setAttribute("aria-label",names[device]+"の動作");Object.keys(labels).forEach(value=>{const b=document.createElement("button");',
'const selected=data[mode][device]===value;b.type="button";b.className="option"+(selected?" selected":"");b.dataset.value=value;b.setAttribute("aria-pressed",String(selected));b.textContent=labels[value];b.onclick=()=>{data[mode][device]=value;draw()};row.appendChild(b)});card.appendChild(row);root.appendChild(card)})}',
'document.querySelectorAll(".tab").forEach(x=>x.onclick=()=>{mode=x.dataset.mode;draw()});',
'window.yosSaveResult=function(ok,msg){document.getElementById("save").disabled=false;document.getElementById("notice").textContent=msg;};',
'document.getElementById("save").onclick=function(){this.disabled=true;document.getElementById("notice").textContent="保存中…";',
'location.href="https://yos-scenes.local/__save?value="+encodeURIComponent(JSON.stringify(data));};draw();',
'</script></body></html>'
  ].join('');
  const web=new WebView();
  web.shouldAllowRequest=req=>{
    const url=String(req.url||'');
    if(!url.startsWith('https://yos-scenes.local/__save?'))return true;
    let ok=true,message='外出・帰宅の設定を保存しました';
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
