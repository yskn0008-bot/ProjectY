// Variables used by Scriptable.
// YOS_SCRIPT_NAME: YOS Sleep Scene
// YOS Sleep Scene v1.1. Existing choice modes preserved; focus-only prepares an all-keep plan.
// Existing YOS Remote, BRAVIA, Tapo Core scripts, keys and files are never modified.
const tapo=(()=>{
  const module={exports:{}};
  // Variables used by Scriptable.
  // YOS_SCRIPT_NAME: YOS Tapo H110 Core
  // Shared Tapo H110 KLAP v2 core for Scriptable.
  // Credentials and remote map are stored only in Scriptable Keychain.
  
  const K = Object.freeze({
    host: 'yos.tapo.h110.host',
    user: 'yos.tapo.h110.user',
    pass: 'yos.tapo.h110.pass',
    map: 'yos.tapo.h110.remote-map'
  });
  
  function kc(key) { return Keychain.contains(key) ? Keychain.get(key) : ''; }
  function concat(...parts) { return parts.flatMap(x => Array.from(x || [])); }
  function utf8(s) { return Data.fromString(String(s)).getBytes(); }
  function b64(bytes) { return Data.fromBytes(Array.from(bytes)).toBase64String(); }
  function fromB64(s) { const d = Data.fromBase64String(s); return d ? d.getBytes() : []; }
  function eq(a,b){ if(!a||!b||a.length!==b.length)return false; let x=0; for(let i=0;i<a.length;i++)x|=a[i]^b[i]; return x===0; }
  function int32be(n){n|=0;return[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];}
  function readInt32be(bytes,off=0){return((bytes[off]<<24)|(bytes[off+1]<<16)|(bytes[off+2]<<8)|bytes[off+3])|0;}
  
  class WebCryptoBox {
    constructor(){ this.web = new WebView(); }
    async init(){
      await this.web.loadURL('https://example.com/');
      const injected = await this.web.evaluateJavaScript(`(() => {
        window.b2u=function(s){const x=atob(s),a=new Uint8Array(x.length);for(let i=0;i<x.length;i++)a[i]=x.charCodeAt(i);return a};
        window.u2b=function(a){let s='';const u=new Uint8Array(a);for(let i=0;i<u.length;i++)s+=String.fromCharCode(u[i]);return btoa(s)};
        window.dg=async function(alg,s){return u2b(await crypto.subtle.digest(alg,b2u(s)))};
        window.ae=async function(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['encrypt']);return u2b(await crypto.subtle.encrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))};
        window.ad=async function(k,iv,d){const key=await crypto.subtle.importKey('raw',b2u(k),'AES-CBC',false,['decrypt']);return u2b(await crypto.subtle.decrypt({name:'AES-CBC',iv:b2u(iv)},key,b2u(d)))};
        window.rnd=function(n){const a=new Uint8Array(n);crypto.getRandomValues(a);return u2b(a)};
        return String(!!(window.crypto&&crypto.subtle));
      })()`, false);
      if(String(injected)!=='true') throw new Error('暗号処理を初期化できませんでした。');
    }
    async call(expr){
      const js=`(() => {(async()=>{try{const value=await (${expr});completion(JSON.stringify({ok:1,v:value}));}catch(e){completion(JSON.stringify({ok:0,e:String(e)}));}})();return 'pending';})()`;
      const raw=await this.web.evaluateJavaScript(js,true);
      const out=JSON.parse(String(raw));
      if(!out.ok) throw new Error('暗号処理エラー: '+out.e);
      return out.v;
    }
    async digest(alg,bytes){return fromB64(await this.call(`dg(${JSON.stringify(alg)},${JSON.stringify(b64(bytes))})`));}
    async sha1(bytes){return this.digest('SHA-1',bytes);}
    async sha256(bytes){return this.digest('SHA-256',bytes);}
    async random(n){return fromB64(await this.call(`rnd(${Number(n)})`));}
    async aesEncrypt(key,iv,bytes){return fromB64(await this.call(`ae(${JSON.stringify(b64(key))},${JSON.stringify(b64(iv))},${JSON.stringify(b64(bytes))})`));}
    async aesDecrypt(key,iv,bytes){return fromB64(await this.call(`ad(${JSON.stringify(b64(key))},${JSON.stringify(b64(iv))},${JSON.stringify(b64(bytes))})`));}
  }
  
  class KlapV2 {
    constructor(host,username,password,crypto){this.host=host;this.username=username;this.password=password;this.crypto=crypto;this.cookie='';this.key=null;this.ivPrefix=null;this.sig=null;this.seq=0;}
    async post(path,bytes,cookie='',query=''){
      const r=new Request(`http://${this.host}/app/${path}${query}`);r.method='POST';r.timeoutInterval=8;r.headers={'Content-Type':'application/octet-stream'};if(cookie)r.headers.Cookie=cookie;r.body=Data.fromBytes(bytes);
      const data=await r.load();const status=r.response?r.response.statusCode:0;if(status<200||status>=300){const e=new Error(`H110通信エラー HTTP ${status}`);e.status=status;throw e;}return{bytes:data?data.getBytes():[],response:r.response||{}};
    }
    async authHash(){const u=await this.crypto.sha1(utf8(this.username));const p=await this.crypto.sha1(utf8(this.password));return this.crypto.sha256(concat(u,p));}
    async handshake(){
      const auth=await this.authHash();const local=await this.crypto.random(16);const h1=await this.post('handshake1',local);if(h1.bytes.length<48)throw new Error('H110のKLAP応答が不完全です。');
      const remote=h1.bytes.slice(0,16),serverHash=h1.bytes.slice(16,48),expected=await this.crypto.sha256(concat(local,remote,auth));if(!eq(expected,serverHash))throw new Error('Tapoアカウント認証に失敗しました。');
      const cookies=(h1.response&&h1.response.cookies)||[];const session=cookies.find(c=>c&&c.name==='TP_SESSIONID');if(!session)throw new Error('H110からセッションCookieを取得できませんでした。');this.cookie=`TP_SESSIONID=${session.value}`;
      await this.post('handshake2',await this.crypto.sha256(concat(remote,local,auth)),this.cookie);
      const keyHash=await this.crypto.sha256(concat(utf8('lsk'),local,remote,auth));const ivHash=await this.crypto.sha256(concat(utf8('iv'),local,remote,auth));const sigHash=await this.crypto.sha256(concat(utf8('ldk'),local,remote,auth));
      this.key=keyHash.slice(0,16);this.ivPrefix=ivHash.slice(0,12);this.seq=readInt32be(ivHash,28);this.sig=sigHash.slice(0,28);
    }
    async query(payload,retry=true){
      if(!this.key)await this.handshake();this.seq=(this.seq+1)|0;const seqBytes=int32be(this.seq),iv=concat(this.ivPrefix,seqBytes),clear=utf8(JSON.stringify(payload)),cipher=await this.crypto.aesEncrypt(this.key,iv,clear),signature=await this.crypto.sha256(concat(this.sig,seqBytes,cipher));
      try{const resp=await this.post('request',concat(signature,cipher),this.cookie,`?seq=${this.seq}`);if(resp.bytes.length<33)throw new Error('H110の暗号化応答が不完全です。');const plain=await this.crypto.aesDecrypt(this.key,iv,resp.bytes.slice(32)),text=Data.fromBytes(plain).toRawString();if(!text)throw new Error('H110応答を復号できませんでした。');const obj=JSON.parse(text);if(obj&&obj.error_code&&obj.error_code!==0)throw new Error(`Tapo error_code ${obj.error_code}`);return obj;}catch(e){if(retry&&(e.status===403||/session|security|403/i.test(String(e.message)))){this.key=null;this.cookie='';await this.handshake();return this.query(payload,false);}throw e;}
    }
    fire(deviceId,keyName){return this.fireBurst(deviceId,keyName,1);}
    fireBurst(deviceId,keyName,count=1){
      const n=Math.max(1,Math.min(6,Number(count)||1));
      const requests=Array.from({length:n},()=>({method:'sendIrCmdById',params:{name:keyName}}));
      return this.query({method:'control_child',params:{device_id:deviceId,requestData:{method:'multipleRequest',params:{requests}}}});
    }
    controlAc(deviceId,state){return this.query({method:'control_child',params:{device_id:deviceId,requestData:{method:'multipleRequest',params:{requests:[{method:'sendIrCmdByStatus',params:state}]}}}});}
  }
  
  function getCredentials(){
    const host=kc(K.host),user=kc(K.user),pass=kc(K.pass);if(!host||!user||!pass)throw new Error('先に YOS Tapo H110 Setup を実行してください。');return{host,user,pass};
  }
  function getMap(){try{return JSON.parse(kc(K.map)||'[]');}catch(_){return[];}}
  function findRemote(predicate){const map=getMap();return map.find(predicate)||null;}
  function findKey(remote,candidates){
    if(!remote||!Array.isArray(remote.keys))return null;
    const norm=s=>String(s||'').trim().toLowerCase();
    for(const c of candidates){const n=norm(c);const k=remote.keys.find(x=>norm(x.name)===n||norm(x.label)===n);if(k)return k;}
    return null;
  }
  async function client(){const c=getCredentials();const crypto=new WebCryptoBox();await crypto.init();return new KlapV2(c.host,c.user,c.pass,crypto);}
  // Optional device-specific local connection. Keep the existing H110 client unchanged.
  async function clientForHost(host){
    const name=String(host||'').trim();
    if(!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(name)||name.split('.').some(x=>Number(x)>255))throw Error('IPアドレス不正');
    const c=getCredentials();
    const crypto=new WebCryptoBox();
    await crypto.init();
    return new KlapV2(name,c.user,c.pass,crypto);
  }
  
  async function fireFriendly(remotePredicate,keyCandidates){
    const remote=findRemote(remotePredicate);if(!remote)throw new Error('対象リモコンが見つかりません。Setupを再実行してください。');const key=findKey(remote,keyCandidates);if(!key)throw new Error('対象ボタンが見つかりません。');const c=await client();await c.fire(remote.device_id,key.name);return{remote,key};
  }
  
  module.exports={K,getCredentials,getMap,findRemote,findKey,client,clientForHost,fireFriendly};
  
  return module.exports;
})();
const MODE=String(args.shortcutParameter||args.queryParameters?.action||"check").trim().toLowerCase();
const KEYS=Object.freeze({
  tvHost:"yos.bravia.scriptable.host",tvPsk:"yos.bravia.scriptable.psk",
  hHost:"yos.tapo.h110.host",hUser:"yos.tapo.h110.user",hPass:"yos.tapo.h110.pass",
  map:"yos.tapo.h110.remote-map",floor:"yos.tapo.floor.local-host"
});
function has(k){return Keychain.contains(k)&&Boolean(String(Keychain.get(k)||"").trim());}
function ceilingRemote(){return tapo.findRemote(r=>/ライト|light/i.test(String(r.nickname||""))||String(r.model||"").toLowerCase()==="light");}
function prerequisites(){
  const missing=[];
  for(const [k,label] of [[KEYS.hHost,"Tapo H110接続先"],[KEYS.hUser,"Tapoログイン名"],[KEYS.hPass,"Tapoパスワード"],[KEYS.map,"Tapoリモコン設定"],[KEYS.floor,"フロアランプ接続先"],[KEYS.tvHost,"BRAVIA接続先"],[KEYS.tvPsk,"BRAVIA認証情報"]])if(!has(k))missing.push(label);
  if(has(KEYS.map)){
    const remote=ceilingRemote();
    if(!remote)missing.push("天井照明リモコン");
    else if(!tapo.findKey(remote,["POWER OFF","消灯"]))missing.push("天井照明の消灯ボタン");
  }
  return missing;
}
function findOn(value){
  if(!value||typeof value!=="object")return null;
  if(typeof value.device_on==="boolean")return value.device_on;
  for(const v of Object.values(value)){const result=findOn(v);if(result!==null)return result;}
  return null;
}
async function floorOn(){
  const c=await tapo.clientForHost(Keychain.get(KEYS.floor));
  const current=findOn(await c.query({method:"get_device_info",params:null}));
  if(current===null)throw Error("フロアランプの現在状態が不明のため中止");
  if(current===false)await c.query({method:"set_device_info",params:{device_on:true}});
  return current?"既に点灯":"点灯指令送信";
}
async function tvOff(){
  const host=String(Keychain.get(KEYS.tvHost)).replace(/^https?:\/\//,"").replace(/\/$/,"");
  async function rpc(method,params){
    const req=new Request("http://"+host+"/sony/system");
    req.method="POST";req.timeoutInterval=8;
    req.headers={"Content-Type":"application/json","X-Auth-PSK":Keychain.get(KEYS.tvPsk)};
    req.body=JSON.stringify({method,params,id:1,version:"1.0"});
    const json=JSON.parse(await req.loadString());
    if(json.error)throw Error("BRAVIA応答エラー");
    return json.result;
  }
  const state=(await rpc("getPowerStatus",[]))?.[0]?.status;
  if(!["active","standby"].includes(state))throw Error("BRAVIA電源状態が不明のため中止");
  if(state==="active")await rpc("setPowerStatus",[{status:false}]);
  return state==="active"?"OFF指令送信":"既に待機中";
}
async function ceilingOff(){
  await tapo.fireFriendly(r=>/ライト|light/i.test(String(r.nickname||""))||String(r.model||"").toLowerCase()==="light",["POWER OFF","消灯"]);
  return "消灯指令送信（実際の照明状態は未計測）";
}
function finish(message){if(typeof Script.setShortcutOutput==="function")Script.setShortcutOutput(message);}
async function show(title,message){
  const dialog=new Alert();dialog.title=title;dialog.message=message;dialog.addAction("OK");await dialog.presentAlert();
}

/* Sleep Choice: ephemeral, one-use instructions. Do not change other saved scripts/keys. */
const CHOICE_KEY="yos.sleep.scene.choice.v1";
const CHOICE_USED_KEY="yos.sleep.scene.choice-used.v1";
const CHOICE_TTL_MS=120000;
const CHOICE_DEFAULT=Object.freeze({tv:"off",light:"off",floor:"on",ac:"keep"});
const FOCUS_ONLY=Object.freeze({tv:"keep",light:"keep",floor:"keep",ac:"keep"});
function prepareFocusOnly(){
  // One-use all-keep plan: the existing iOS Focus automation must not touch appliances.
  clearChoice();
  Keychain.set(CHOICE_KEY,JSON.stringify({ts:Date.now(),choices:{...FOCUS_ONLY}}));
  finish("READY");
}
function clearChoice(){if(Keychain.contains(CHOICE_KEY))Keychain.remove(CHOICE_KEY);}
function consumeChoice(){
  if(!Keychain.contains(CHOICE_KEY)){
    // A repeated Focus event must not replay the old fixed scene after choices were applied.
    if(Keychain.contains(CHOICE_USED_KEY)){
      const t=Number(Keychain.get(CHOICE_USED_KEY));
      if(Number.isFinite(t)&&Date.now()>=t&&Date.now()-t<CHOICE_TTL_MS)return {skip:true};
    }
    return null; // Ordinary manual Focus ON still uses the original scene.
  }
  const raw=Keychain.get(CHOICE_KEY);
  clearChoice(); // Consume before controlling anything, so duplicate Focus triggers cannot reuse choices.
  Keychain.set(CHOICE_USED_KEY,String(Date.now()));
  let data;
  try{data=JSON.parse(raw);}catch(_){throw Error("就寝設定が破損しています。家電は操作しません");}
  if(!data||!Number.isFinite(data.ts)||Date.now()-data.ts<0||Date.now()-data.ts>CHOICE_TTL_MS)
    throw Error("就寝設定の有効期限が切れました。家電は操作しません");
  const values=data.choices||{};
  const valid={tv:["keep","off"],light:["keep","off"],floor:["keep","on","off"],ac:["keep","off"]};
  for(const key of Object.keys(valid))if(!valid[key].includes(values[key]))throw Error("無効な就寝設定です。家電は操作しません");
  return values;
}
async function chooseSleepScene(){
  // Native Scriptable table; settings are stored only when the final Start row is tapped.
  clearChoice();
  const choices={...CHOICE_DEFAULT},table=new UITable();
  table.showSeparators=true;
  let accepted=false;
  const items=[
    {key:"tv",title:"テレビ",values:["off","keep"]},
    {key:"light",title:"天井照明",values:["off","keep"]},
    {key:"floor",title:"フロアランプ",values:["on","off","keep"]},
    {key:"ac",title:"エアコン",values:["keep","off"]}
  ];
  const words={keep:"そのまま",off:"OFF",on:"ON"};
  function draw(){
    table.removeAllRows();
    const header=new UITableRow();header.isHeader=true;header.addText("YOS 就寝モード","各行を押すと変更できます");table.addRow(header);
    for(const item of items){
      const row=new UITableRow();
      row.height=64;row.dismissOnSelect=false;
      row.addText(item.title,words[choices[item.key]]);
      row.onSelect=()=>{
        const next=(item.values.indexOf(choices[item.key])+1)%item.values.length;
        choices[item.key]=item.values[next];draw();table.reload();
      };
      table.addRow(row);
    }
    const start=new UITableRow();start.height=62;
    start.addText("就寝モード開始","選択を保存してショートカットに戻る");
    start.onSelect=()=>{Keychain.set(CHOICE_KEY,JSON.stringify({ts:Date.now(),choices}));accepted=true;};
    table.addRow(start);
    const cancel=new UITableRow();cancel.height=54;cancel.addText("キャンセル");
    cancel.onSelect=()=>{accepted=false;clearChoice();};
    table.addRow(cancel);
  }
  draw();await table.present(false);
  finish(accepted?"READY":"CANCEL");
}
async function floorOff(){
  const c=await tapo.clientForHost(Keychain.get(KEYS.floor));
  const current=findOn(await c.query({method:"get_device_info",params:null}));
  if(current===null)throw Error("フロアランプの現在状態が不明のため中止");
  if(current)await c.query({method:"set_device_info",params:{device_on:false}});
  return current?"消灯指令送信":"既に消灯";
}
function findAcStatus(v){
  if(!v||typeof v!=="object")return null;
  if(typeof v.ac_status==="string")return v.ac_status;
  for(const x of Object.values(v)){const s=findAcStatus(x);if(s!==null)return s;}
  return null;
}
async function acOff(){
  const remote=tapo.findRemote(r=>String(r.model||"").toUpperCase()==="AC"||/エアコン|air.?con/i.test(String(r.nickname||"")));
  if(!remote)throw Error("エアコンのリモコンが未設定です");
  const c=await tapo.client();
  const raw=await c.query({method:"control_child",params:{device_id:remote.device_id,requestData:{method:"get_device_info",params:null}}});
  const status=findAcStatus(raw);
  if(!status)throw Error("エアコンの設定状態が未取得のため停止しません");
  const s={};
  for(const part of status.split("_")){const m=part.match(/^([PMTSD])(-?\d+)$/);if(m)s[m[1]]=Number(m[2]);}
  if(!["P","M","T","S","D"].every(k=>Number.isFinite(s[k])))
    throw Error("エアコンの設定情報が不足しています");
  if(s.P===0)return "既に停止の記録（実機状態は未確認）";
  const range=(n,a,b)=>Math.max(a,Math.min(b,n));
  await c.controlAc(remote.device_id,{power:false,on:false,mode:s.M,temp:range(s.T,18,30),wind_speed:range(s.S,0,4),wind_direct:range(s.D,0,6)});
  return "停止指令送信（IRのため実機反映は未確認）";
}

try{
  if(!["check","choose","focus-only","sleep","floor","tv","light"].includes(MODE))throw Error("check/choose/focus-only/sleep/floor/tv/light のいずれかを指定してください");
  const missing=prerequisites();
  if(MODE==="focus-only"){
    prepareFocusOnly();
  }else if(MODE==="choose"){
    await chooseSleepScene();
  }else if(MODE==="check"){
    const message=missing.length?"未設定または未検出：\n・"+missing.join("\n・")+"\n既存の設定は変更していません。":"必要な設定項目が見つかりました。\n家電との通信と実動作は、まだ未検証です。\n自動実行は有効にしないでください。";
    finish(missing.length?"未設定 "+missing.join(" / "):"設定項目OK");
    await show("YOS Sleep Scene｜設定確認",message);
  }else{
    const results=[];
    // The existing Sleep Focus trigger still passes "sleep". Consume only a fresh, one-use choice.
    if(MODE==="sleep"){
      const selected=consumeChoice();
      // An all-keep plan needs no credentials, connection check or appliance request.
      const needsDevices=selected===null||(selected&&!selected.skip&&Object.values(selected).some(v=>v!=="keep"));
      if(needsDevices&&missing.length)throw Error("未設定または未検出："+missing.join("、"));
      if(selected&&selected.skip){
        results.push("直前の就寝操作を重複実行しません");
      }else if(selected===null){
        // Existing direct Focus ON continues to use the original proven scene.
        results.push("ランプ："+await floorOn());
        results.push("BRAVIA："+await tvOff());
        results.push("天井照明："+await ceilingOff());
      }else{
        if(selected.floor==="on")results.push("ランプ："+await floorOn());
        else if(selected.floor==="off")results.push("ランプ："+await floorOff());
        if(selected.tv==="off")results.push("BRAVIA："+await tvOff());
        if(selected.light==="off")results.push("天井照明："+await ceilingOff());
        if(selected.ac==="off")results.push("エアコン："+await acOff());
        if(results.length===0)results.push("家電操作なし（すべてそのまま）");
      }
    }else{
      if(missing.length)throw Error("未設定または未検出："+missing.join("、"));
      if(MODE==="floor")results.push("ランプ："+await floorOn());
      else if(MODE==="tv")results.push("BRAVIA："+await tvOff());
      else if(MODE==="light")results.push("天井照明："+await ceilingOff());
    }
    finish(results.join(" / "));
    if(typeof config!=="undefined"&&config.runsInApp)await show("YOS Sleep Scene｜操作結果",results.join("\n"));
  }
}catch(e){
  const message="睡眠シーンを停止しました："+String(e.message||e);
  finish(message);
  if(typeof config==="undefined"||config.runsInApp)await show("YOS Sleep Scene｜安全停止",message);
  else throw e;
}finally{Script.complete();}
