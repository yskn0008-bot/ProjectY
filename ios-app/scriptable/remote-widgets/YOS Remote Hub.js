// YOS Remote Hub v5.3
// 12-button BRAVIA hub + smart navigation/transport pad + live button settings + long-press repeat

const CONFIG = {
  tv: { remoteScript: "YOS BRAVIA Remote" },
  light: { remoteScript: "YOS Light Remote", actionScript: "YOS Light Widget" },
  ac: { remoteScript: "YOS AC Remote", actionScript: "YOS AC Widget" }
}

const TV_ACTIONS = [
  { action:"power",       icon:"⏻",  label:"電源",       color:"red" },
  { action:"input",       icon:"↪",  label:"入力",       color:"blue" },
  { action:"home",        icon:"⌂",  label:"ホーム",     color:"blue" },
  { action:"back",        icon:"‹",  label:"戻る",       color:"blue" },
  { action:"up",          icon:"↑",  label:"上",         color:"blue" },
  { action:"down",        icon:"↓",  label:"下",         color:"blue" },
  { action:"left",        icon:"←",  label:"左",         color:"blue" },
  { action:"right",       icon:"→",  label:"右",         color:"blue" },
  { action:"confirm",     icon:"○",  label:"OK",         color:"blue" },
  { action:"volumeDown",  icon:"−",  label:"音量−",      color:"blue" },
  { action:"mute",        icon:"⊘",  label:"ミュート",   color:"blue" },
  { action:"volumeUp",    icon:"+",  label:"音量＋",     color:"blue" },
  { action:"channelDown", icon:"−",  label:"CH−",        color:"blue" },
  { action:"channelUp",   icon:"+",  label:"CH＋",       color:"blue" },
  { action:"rewind",      icon:"⏪", label:"巻き戻し",   color:"blue" },
  { action:"play",        icon:"▶",  label:"再生",       color:"blue" },
  { action:"fastForward", icon:"⏩", label:"早送り",     color:"blue" },
  { action:"pause",       icon:"Ⅱ",  label:"一時停止",   color:"blue" },
  { action:"stop",        icon:"■",  label:"停止",       color:"blue" },
  { action:"flashMinus",  icon:"↶",  label:"10秒戻し",   color:"blue" },
  { action:"flashPlus",   icon:"↷",  label:"15秒送り",   color:"blue" },
  { action:"prev",        icon:"◀|", label:"前",         color:"blue" },
  { action:"next",        icon:"|▶", label:"次",         color:"blue" }
]

const TV_DEFAULT = [
  "power", "input", "home",
  "volumeDown", "mute", "volumeUp",
  "rewind", "play", "fastForward",
  "back", "pause", "stop"
]

const LIGHT_BUTTONS = [
  ["on",     "⏻", "点灯",   "blue"],
  ["off",    "○", "消灯",   "blue"],
  ["all",    "☼", "全灯",   "blue"],
  ["bright", "☼", "明るい", "blue"],
  ["dark",   "◉", "暗い",   "blue"],
  ["night",  "☾", "常夜灯", "blue"]
]

const AC_BUTTONS = [
  ["cool",     "❄︎", "冷房",      "blue"],
  ["dry",      "◇", "除湿",       "blue"],
  ["heat",     "♨︎", "暖房",       "blue"],
  ["stop",     "⏻", "停止",       "red"],
  ["tempDown", "−", "温度−",      "blue"],
  ["tempUp",   "+", "温度＋",      "blue"],
  ["fan",      "✤", "風量 自動",  "blue"],
  ["wind",     "↕", "風向",       "blue"]
]

function runURL(scriptName) {
  return "scriptable:///run?scriptName=" + encodeURIComponent(scriptName)
}

const REMOTES = {
  tv: runURL(CONFIG.tv.remoteScript),
  light: runURL(CONFIG.light.remoteScript),
  ac: runURL(CONFIG.ac.remoteScript)
}

function makeButtons(device, items) {
  return items.map(item => {
    const [action, icon, label, color] = item
    return '<button class="key" onclick="pressOther(event,\'' + device + '\',\'' + action + '\',this)">' +
      '<span class="icon ' + color + '">' + icon + '</span>' +
      '<span class="label">' + label + '</span>' +
      '</button>'
  }).join("")
}

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;padding:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif}
body{min-height:100vh;padding:10px 12px 20px}
.remote-page{width:100%;max-width:500px;margin:0 auto;padding-top:92px}
.card{width:100%;margin-bottom:12px;padding:15px 14px 14px;border:1px solid #45484e;border-radius:27px;background:linear-gradient(155deg,#101215 0%,#08090b 60%,#050506 100%)}
.card-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;gap:8px}
.title{font-size:22px;font-weight:800;line-height:1}.remote-title{display:inline-flex;align-items:center;gap:7px;padding:6px 4px 6px 0;touch-action:manipulation}.remote-title:after{content:"›";font-size:22px;color:#5b8fdc;font-weight:600}.brand{font-size:12px;color:#8d8f95}.head-tools{display:flex;align-items:center;gap:6px}
.ac-head-right{display:flex;align-items:baseline;gap:7px;white-space:nowrap}.temperature{font-size:27px;font-weight:800}.ac-state{color:#438eff;font-size:11px;font-weight:700}
.tool{height:32px;padding:0 11px;border:1px solid #353941;border-radius:11px;background:#15171b;color:#438eff;font-size:11px;font-weight:750}.tool.active{background:#438eff;border-color:#438eff;color:#fff}
.grid{display:grid;gap:9px}.grid-3{grid-template-columns:repeat(3,1fr)}.grid-4{grid-template-columns:repeat(4,1fr)}
.key{position:relative;min-width:0;min-height:68px;padding:8px;border:1px solid #26292f;border-radius:19px;background:linear-gradient(145deg,#1c1e22,#15171a);color:#fff;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:5px;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:manipulation}
.key:active,.key.pressed{transform:scale(.97);background:#22252a}.icon{font-size:27px;line-height:.9}.icon.blue{color:#438eff}.icon.red{color:#ff554f}.label{font-size:13px;font-weight:700;white-space:nowrap}
.smart-pad{position:relative;height:62px;margin-top:10px;border:1px solid #343840;border-radius:19px;background:linear-gradient(145deg,#14171b,#0d0f12);overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}.pad-dot{position:absolute;left:50%;top:50%;width:34px;height:34px;margin:-17px;border-radius:50%;background:#24384f;border:1px solid #438eff;pointer-events:none;transition:transform .06s linear}.pad-copy{position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:center;padding-bottom:7px;color:#767b84;font-size:9.5px;font-weight:650;pointer-events:none}.pad-status{position:absolute;left:0;right:0;top:7px;text-align:center;color:#438eff;font-size:10px;font-weight:800;pointer-events:none}.tv-edit{border:1px dashed #438eff}.tv-edit:after{content:"変更";position:absolute;right:7px;top:6px;color:#438eff;font-size:8px;font-weight:800}.tv-selected{border:2px solid #438eff;background:rgba(67,142,255,.18)}
.chooser{position:fixed;z-index:1000;left:8px;right:8px;bottom:max(10px,env(safe-area-inset-bottom));display:none;max-width:500px;margin:0 auto;padding:14px;border:1px solid #50535a;border-radius:25px;background:rgba(17,19,23,.98)}.chooser.show{display:block}.chooser-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.chooser-title{font-size:15px;font-weight:800}.close-choice{width:30px;height:30px;border:0;border-radius:50%;background:#292c31;color:#ddd;font-size:18px}.choice-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;max-height:265px;overflow-y:auto}.choice{height:50px;min-width:0;border:1px solid #343840;border-radius:14px;background:#1a1d22;color:#fff;padding:0 7px;display:flex;align-items:center;gap:7px}.choice.current{border-color:#438eff;background:rgba(67,142,255,.18)}.choice-icon{width:23px;flex:none;color:#438eff;text-align:center;font-size:19px}.choice-icon.red{color:#ff554f}.choice-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700}
.toast{position:fixed;z-index:2000;left:50%;bottom:25px;transform:translateX(-50%) translateY(15px);padding:9px 14px;border:1px solid #4e5158;border-radius:999px;background:rgba(35,36,40,.97);color:#fff;font-size:12px;font-weight:650;opacity:0;pointer-events:none;transition:.18s;white-space:nowrap}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>
</head>
<body>
<div class="remote-page">
<section class="card">
  <div class="card-head">
    <div class="title remote-title" onclick="openRemote('tv')">BRAVIA</div>
    <div class="head-tools">
      <button id="menuButton" class="tool" onclick="sendMenu(event)">MENU</button>
      <button id="editButton" class="tool" onclick="toggleEdit(event)">設定</button>
    </div>
  </div>
  <div id="tvGrid" class="grid grid-3"></div>
  <div id="smartPad" class="smart-pad" aria-label="BRAVIAスマート操作">
    <div id="padStatus" class="pad-status">タップ＝決定</div>
    <div id="padDot" class="pad-dot"></div>
    <div class="pad-copy">短スワイプ＝カーソル　横長押し＝動画操作</div>
  </div>
</section>
<section class="card">
  <div class="card-head"><div class="title remote-title" onclick="openRemote('light')">照明</div><div class="brand">Panasonic</div></div>
  <div class="grid grid-3">${makeButtons("light", LIGHT_BUTTONS)}</div>
</section>
<section class="card">
  <div class="card-head"><div class="title remote-title" onclick="openRemote('ac')">エアコン</div><div class="ac-head-right"><span class="temperature">25°</span><span class="ac-state">風量 自動</span><span class="brand">SHARP</span></div></div>
  <div class="grid grid-4">${makeButtons("ac", AC_BUTTONS)}</div>
</section>
</div>
<div id="chooser" class="chooser">
  <div class="chooser-head"><div id="chooserTitle" class="chooser-title">ボタンを選択</div><button class="close-choice" onclick="closeChooser()">×</button></div>
  <div id="choiceGrid" class="choice-grid"></div>
</div>
<div id="toast" class="toast"></div>
<script>
const REMOTES=${JSON.stringify(REMOTES)};
const TV_ACTIONS=${JSON.stringify(TV_ACTIONS)};
const TV_DEFAULT=${JSON.stringify(TV_DEFAULT)};
const TV_KEY="yos.remote.tv.buttons.v52";
const HOLD_DELAY=450;
const HOLD_REPEAT=230;
let currentTV=loadTV();
let editMode=false;
let selectedSlot=null;
let holdTimer=null;
let repeatTimer=null;
let longPressed=false;
let toastTimer=null;
let nonce=0;

function validAction(action){return TV_ACTIONS.some(function(x){return x.action===action})}
function loadTV(){
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem(TV_KEY))}catch(e){}
  let source=Array.isArray(saved)?saved.slice(0,12):[];
  source=source.filter(validAction);
  for(let i=0;i<TV_DEFAULT.length && source.length<12;i++){
    if(source.indexOf(TV_DEFAULT[i])===-1) source.push(TV_DEFAULT[i]);
  }
  for(let i=0;i<TV_ACTIONS.length && source.length<12;i++){
    if(source.indexOf(TV_ACTIONS[i].action)===-1) source.push(TV_ACTIONS[i].action);
  }
  return source.slice(0,12);
}
function meta(action){return TV_ACTIONS.find(function(x){return x.action===action})||TV_ACTIONS[0]}
function resolved(index){
  const original=currentTV[index];
  const data=meta(original);
  return {action:original,icon:data.icon,label:data.label,color:data.color};
}
function renderTV(){
  const grid=document.getElementById("tvGrid");
  grid.innerHTML="";
  for(let i=0;i<12;i++){
    const item=resolved(i);
    const b=document.createElement("button");
    b.className="key"+(editMode?" tv-edit":"")+(selectedSlot===i?" tv-selected":"");
    b.innerHTML='<span class="icon '+item.color+'">'+item.icon+'</span><span class="label">'+item.label+'</span>';
    b.addEventListener("pointerdown",function(e){tvDown(e,i,b)});
    b.addEventListener("pointerup",function(e){tvUp(e,i,b)});
    b.addEventListener("pointercancel",function(e){tvCancel(e,b)});
    b.addEventListener("contextmenu",function(e){e.preventDefault()});
    grid.appendChild(b);
  }
}
function toggleEdit(event){
  event.preventDefault();event.stopPropagation();clearHold();editMode=!editMode;selectedSlot=null;closeChooser(false);
  const b=document.getElementById("editButton");b.classList.toggle("active",editMode);b.textContent=editMode?"完了":"設定";renderTV();showToast(editMode?"変更したいボタンをタップ":"設定完了");
}
function isRepeatable(action){return ["up","down","left","right","volumeDown","volumeUp","channelDown","channelUp","rewind","fastForward","flashMinus","flashPlus"].indexOf(action)!==-1}
function tvDown(event,index,button){
  event.preventDefault();event.stopPropagation();
  if(editMode)return;
  clearHold();longPressed=false;button.classList.add("pressed");
  holdTimer=setTimeout(function(){
    longPressed=true;sendTV(index,true);
    const action=resolved(index).action;
    if(isRepeatable(action)) repeatTimer=setInterval(function(){sendTV(index,true)},HOLD_REPEAT);
  },HOLD_DELAY);
}
function tvUp(event,index,button){
  event.preventDefault();event.stopPropagation();button.classList.remove("pressed");
  if(editMode){selectSlot(index);return}
  const wasLong=longPressed;clearHold();
  if(!wasLong) sendTV(index,false);
}
function tvCancel(event,button){event.preventDefault();event.stopPropagation();button.classList.remove("pressed");clearHold()}
function clearHold(){if(holdTimer)clearTimeout(holdTimer);if(repeatTimer)clearInterval(repeatTimer);holdTimer=null;repeatTimer=null;longPressed=false}
function sendTV(index,silent){const item=resolved(index);nativeAction("tv",item.action,item.label,silent)}
function sendMenu(event){event.preventDefault();event.stopPropagation();if(editMode)return;nativeAction("tv","menu","MENU",false)}
const smartPad=document.getElementById("smartPad"),padDot=document.getElementById("padDot"),padStatus=document.getElementById("padStatus");
let padStart=null,padLast=null,padSeekTimer=null,padSeekRepeat=null,padSeekDir=null,padSeeking=false;
function clearPadTimers(){if(padSeekTimer)clearTimeout(padSeekTimer);if(padSeekRepeat)clearInterval(padSeekRepeat);padSeekTimer=null;padSeekRepeat=null}
function padReset(){clearPadTimers();padStart=null;padLast=null;padSeekDir=null;padSeeking=false;padDot.style.transform="translate(0px,0px)";padStatus.textContent="タップ＝決定"}
function padBegin(e){if(editMode)return;e.preventDefault();e.stopPropagation();const p=e.touches?e.touches[0]:e;padStart={x:p.clientX,y:p.clientY,t:Date.now()};padLast={x:p.clientX,y:p.clientY};padSeekDir=null;padSeeking=false;clearPadTimers();padStatus.textContent="操作を判定中"}
function armPadSeek(dir){
  if(!padStart||padSeeking)return;
  if(padSeekDir===dir&&padSeekTimer)return;
  clearPadTimers();padSeekDir=dir;
  const elapsed=Date.now()-padStart.t;
  padSeekTimer=setTimeout(function(){
    if(!padStart||padSeekDir!==dir)return;
    padSeeking=true;padStatus.textContent=dir==="fastForward"?"▶▶ 早送り":"◀◀ 巻き戻し";
    nativeAction("tv",dir,dir==="fastForward"?"早送り":"巻き戻し",true);
    padSeekRepeat=setInterval(function(){if(padStart&&padSeeking)nativeAction("tv",dir,dir==="fastForward"?"早送り":"巻き戻し",true)},850);
  },Math.max(0,520-elapsed));
}
function padMove(e){
  if(!padStart)return;e.preventDefault();e.stopPropagation();const p=e.touches?e.touches[0]:e;padLast={x:p.clientX,y:p.clientY};
  const dx=p.clientX-padStart.x,dy=p.clientY-padStart.y,ax=Math.abs(dx),ay=Math.abs(dy);
  padDot.style.transform="translate("+Math.max(-105,Math.min(105,dx))+"px,"+Math.max(-22,Math.min(22,dy))+"px)";
  if(ax>42&&ax>ay*1.3)armPadSeek(dx>0?"fastForward":"rewind");else if(!padSeeking){clearPadTimers();padSeekDir=null;padStatus.textContent="カーソル";}
}
function padFinish(e){
  if(!padStart)return;e.preventDefault();e.stopPropagation();const p=(e.changedTouches&&e.changedTouches[0])||padLast||padStart;
  const dx=p.clientX-padStart.x,dy=p.clientY-padStart.y,ax=Math.abs(dx),ay=Math.abs(dy),wasSeeking=padSeeking;
  clearPadTimers();
  if(wasSeeking){nativeAction("tv","play","再生",true);padReset();return}
  if(ax<18&&ay<18) nativeAction("tv","confirm","決定",false);
  else {const dir=ax>ay?(dx>0?"right":"left"):(dy>0?"down":"up");nativeAction("tv",dir,meta(dir).label,false)}
  padReset();
}
smartPad.addEventListener("touchstart",padBegin,{passive:false});smartPad.addEventListener("touchmove",padMove,{passive:false});smartPad.addEventListener("touchend",padFinish,{passive:false});smartPad.addEventListener("touchcancel",function(e){if(padStart){e.preventDefault();e.stopPropagation();padReset()}},{passive:false});smartPad.addEventListener("contextmenu",function(e){e.preventDefault()});
function pressOther(event,device,action,button){event.preventDefault();event.stopPropagation();const label=button.querySelector(".label").textContent.trim();nativeAction(device,action,label,false)}
function nativeAction(device,action,label,silent){
  nonce++;
  window.location.href="/__action?device="+encodeURIComponent(device)+"&action="+encodeURIComponent(action)+"&label="+encodeURIComponent(label)+"&silent="+(silent?"1":"0")+"&n="+nonce;
}
function nativeResult(result){if(result&&result.silent)return;if(result&&result.ok)showToast(result.label);else showToast(result&&result.message?result.message:"操作できませんでした")}
function selectSlot(index){selectedSlot=index;renderTV();renderChoices();document.getElementById("chooser").classList.add("show")}
function renderChoices(){
  if(selectedSlot===null)return;
  const oldAction=currentTV[selectedSlot];
  document.getElementById("chooserTitle").textContent=meta(oldAction).label+" を変更";
  const root=document.getElementById("choiceGrid");root.innerHTML="";
  TV_ACTIONS.forEach(function(item){
    const b=document.createElement("button");
    b.className="choice"+(item.action===oldAction?" current":"");
    b.innerHTML='<span class="choice-icon '+item.color+'">'+item.icon+'</span><span class="choice-label">'+item.label+'</span>';
    b.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();chooseAction(item.action)});
    root.appendChild(b);
  });
}
function chooseAction(action){
  if(selectedSlot===null)return;
  const old=currentTV[selectedSlot];
  const other=currentTV.indexOf(action);
  if(other!==-1 && other!==selectedSlot) currentTV[other]=old;
  currentTV[selectedSlot]=action;
  saveTV();selectedSlot=null;closeChooser(false);renderTV();showToast(meta(action).label+" に変更");
}
function saveTV(){try{localStorage.setItem(TV_KEY,JSON.stringify(currentTV.slice(0,12)))}catch(e){}}
function closeChooser(redraw=true){document.getElementById("chooser").classList.remove("show");selectedSlot=null;if(redraw)renderTV()}
function openRemote(device){if(device==="tv"&&editMode)return;window.location.href=REMOTES[device]}
function showToast(text){const t=document.getElementById("toast");t.textContent=text;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove("show")},900)}
renderTV();
</script>
</body>
</html>`

// ---------------- BRAVIA direct IRCC ----------------
const SONY_STORAGE = { host:"yos.bravia.scriptable.host", psk:"yos.bravia.scriptable.psk" }
const SONY_ALIASES = {
  power:["poweroff","power"], input:["input"], home:["home"], back:["return","back"], menu:["actionmenu","options","androidmenu"],
  up:["up"], down:["down"], left:["left"], right:["right"], confirm:["confirm","enter"],
  volumeDown:["volumedown"], volumeUp:["volumeup"], mute:["mute"],
  channelDown:["channeldown"], channelUp:["channelup"],
  play:["play"], pause:["pause"], stop:["stop"], flashMinus:["flashminus"], flashPlus:["flashplus"], prev:["prev"], next:["next"],
  rewind:["rewind","backward"], fastForward:["forward","fastforward"]
}
let sonyIndex=null
function xmlEscape(value){return String(value).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&apos;")}
function sonyHost(){if(!Keychain.contains(SONY_STORAGE.host))throw new Error("BRAVIA IP設定なし");return Keychain.get(SONY_STORAGE.host).trim().replace(/^https?:\/\//i,"").replace(/:\d+$/,"")}
function sonyPSK(){if(!Keychain.contains(SONY_STORAGE.psk))throw new Error("BRAVIA PSK設定なし");return Keychain.get(SONY_STORAGE.psk)}
async function discoverSony(){
  if(sonyIndex)return;
  const req=new Request("http://"+sonyHost()+"/sony/system");req.method="POST";req.headers={"Content-Type":"application/json","X-Auth-PSK":sonyPSK()};
  req.body=JSON.stringify({method:"getRemoteControllerInfo",params:[],id:1,version:"1.0"});
  const text=await req.loadString();const data=JSON.parse(text);const list=data&&data.result&&data.result[1];
  if(!Array.isArray(list))throw new Error("BRAVIAコマンド取得失敗");
  sonyIndex=new Map();list.forEach(item=>{if(item&&item.name&&item.value)sonyIndex.set(String(item.name).toLowerCase(),item.value)})
}
async function sonyAction(action){
  await discoverSony();const aliases=SONY_ALIASES[action]||[];let code=null;
  for(const alias of aliases){if(sonyIndex.has(alias.toLowerCase())){code=sonyIndex.get(alias.toLowerCase());break}}
  if(!code)throw new Error("BRAVIA未対応："+action);
  const req=new Request("http://"+sonyHost()+"/sony/ircc");req.method="POST";
  req.headers={"Content-Type":"text/xml; charset=UTF-8","X-Auth-PSK":sonyPSK(),SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'};
  req.body='<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+xmlEscape(code)+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>';
  await req.loadString();
}

// ---------------- existing Light / AC action scripts ----------------
function normalizeName(value){return String(value).replace(/\.js$/i,"").replace(/\s+/g," ").trim().toLowerCase()}
async function readScript(scriptName){
  for(const fm of [FileManager.iCloud(),FileManager.local()]){
    const dir=fm.documentsDirectory();let files=[];try{files=fm.listContents(dir)}catch(e){}
    for(const file of files){
      if(normalizeName(file)!==normalizeName(scriptName) && normalizeName(file)!==normalizeName(scriptName+".js"))continue;
      const path=fm.joinPath(dir,file);try{if(fm.isFileStoredIniCloud(path))await fm.downloadFileFromiCloud(path)}catch(e){}
      return fm.readString(path)
    }
  }
  throw new Error(scriptName+" が見つかりません")
}
async function runExisting(scriptName,action){
  const source=await readScript(scriptName)
  const fakeArgs={queryParameters:{action},shortcutParameter:null,widgetParameter:null,plainTexts:[],urls:[],fileURLs:[],images:[],notification:null}
  const fakeScript={name:()=>scriptName,complete:()=>{},setShortcutOutput:()=>{},setWidget:()=>{}}
  const fakeConfig={runsInApp:true,runsInWidget:false,runsWithSiri:false,runsInNotification:false}
  const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor
  const runner=new AsyncFunction("args","Script","config",source)
  await runner(fakeArgs,fakeScript,fakeConfig)
}
function parseQuery(url){
  const out={};const pos=String(url).indexOf("?");if(pos<0)return out;
  String(url).slice(pos+1).split("&").forEach(pair=>{const eq=pair.indexOf("=");const k=eq>=0?pair.slice(0,eq):pair;const v=eq>=0?pair.slice(eq+1):"";out[decodeURIComponent(k)]=decodeURIComponent(v)});return out
}
const queue=[];let running=false;let web=null
async function processQueue(){
  if(running)return;running=true;
  while(queue.length){
    const item=queue.shift();let result;
    try{
      if(item.device==="tv")await sonyAction(item.action)
      else if(item.device==="light")await runExisting(CONFIG.light.actionScript,item.action)
      else if(item.device==="ac")await runExisting(CONFIG.ac.actionScript,item.action)
      else throw new Error("不明なデバイスです")
      result={ok:true,label:item.label,silent:item.silent}
    }catch(error){result={ok:false,message:error&&error.message?error.message:String(error),silent:false}}
    try{await web.evaluateJavaScript("nativeResult("+JSON.stringify(result)+")")}catch(e){}
  }
  running=false
}
web=new WebView()
web.shouldAllowRequest=request=>{
  const url=String(request.url||"");
  if(!url.startsWith("https://yos-remote.local/__action?"))return true;
  const q=parseQuery(url);queue.push({device:q.device,action:q.action,label:q.label,silent:q.silent==="1"});processQueue();return false
}
await web.loadHTML(html,"https://yos-remote.local/")
await web.present(true)
Script.complete()
