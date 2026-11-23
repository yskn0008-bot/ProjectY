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
'<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta charset="utf-8">',
'<style>*{box-sizing:border-box}body{margin:0;background:#f5f8fb;color:#1c3443;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:24px 16px 60px}',
'.wrap{max-width:520px;margin:auto}h1{font-size:24px;letter-spacing:-.04em;margin:12px 0}p{color:#607785;font-size:13px;line-height:1.7}.tabs{display:flex;gap:8px;margin:20px 0}',
'button{font:inherit;cursor:pointer}.tab{flex:1;padding:13px;border:0;border-radius:14px;background:#e2ebf1;color:#496471;font-weight:700}.tab.active{background:#c5e9e0;color:#155c51}',
'.card{background:white;border:1px solid #e2ebf1;border-radius:17px;margin:10px 0;padding:14px}',
'.name{font-size:15px;font-weight:700;margin-bottom:11px}.choices{display:flex;gap:8px}.option{flex:1;border-radius:10px;border:1px solid #e3eaee;padding:10px 0;background:#f7f9fa;color:#425867;font-weight:700}',
'.option.selected{background:#d9f0e9;border-color:#74b9ab;color:#126458}.save{position:sticky;bottom:16px;margin-top:24px;width:100%;border:0;border-radius:14px;padding:16px;background:#225c66;color:#fff;font-weight:700;font-size:16px}',
'.notice{min-height:24px;text-align:center;color:#406778;font-size:13px}</style></head><body><div class="wrap">',
'<h1>外出・帰宅｜家電設定</h1><p>ON / OFF / 維持を保存。維持は家電に信号を送信しません。保存だけでは家電は動きません。</p>',
'<div class="tabs"><button class="tab active" data-mode="departure">外出</button><button class="tab" data-mode="arrival">帰宅</button></div>',
'<div id="devices"></div><button id="save" class="save">この設定を保存</button><div class="notice" id="notice"></div>',
'<p>設定はこのiPhone内に保存。オートメーションは別途、既存の「外出」「帰宅」へこのスクリプトの実行を接続します。</p>',
'</div><script>',
'const data=',source,';',
'const names={tv:"テレビ（BRAVIA）",light:"照明",ac:"エアコン（前回の運転モード）",floor:"フロアランプ"};',
'const labels={on:"ON",off:"OFF",keep:"維持"};let mode="departure";',
'function draw(){document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x.dataset.mode===mode));',
'const root=document.getElementById("devices");root.textContent="";Object.keys(names).forEach(device=>{const card=document.createElement("div");card.className="card";',
'const title=document.createElement("div");title.className="name";title.textContent=names[device];card.appendChild(title);',
'const row=document.createElement("div");row.className="choices";Object.keys(labels).forEach(value=>{const b=document.createElement("button");',
'b.className="option"+(data[mode][device]===value?" selected":"");b.textContent=labels[value];b.onclick=()=>{data[mode][device]=value;draw()};row.appendChild(b)});card.appendChild(row);root.appendChild(card)})}',
'document.querySelectorAll(".tab").forEach(x=>x.onclick=()=>{mode=x.dataset.mode;draw()});',
'window.yosSaveResult=function(ok,msg){document.getElementById("save").disabled=false;document.getElementById("notice").textContent=msg;};',
'document.getElementById("save").onclick=function(){this.disabled=true;document.getElementById("notice").textContent="保存中";',
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
