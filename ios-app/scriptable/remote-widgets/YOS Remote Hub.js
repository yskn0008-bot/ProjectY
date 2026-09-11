// YOS Remote Hub v5.4 — adaptive BRAVIA media/cursor cross.
// The existing 3-column BRAVIA grid stays in place.
// Outside playback, the five media-position buttons become a D-pad centered on the Play slot:
//   Mute=Up, Rewind=Left, Play=OK, FastForward=Right, Pause=Down.
// During playback, those same physical buttons keep their media functions.

const CONFIG = {
  tv: { remoteScript: "YOS BRAVIA Remote" },
  light: { remoteScript: "YOS Light Remote", actionScript: "YOS Light Widget" },
  ac: { remoteScript: "YOS AC Remote", actionScript: "YOS AC Widget" }
}

const TV_ACTIONS = [
  { action:"power", icon:"⏻", label:"電源" },
  { action:"input", icon:"↪︎", label:"入力" },
  { action:"home", icon:"⌂", label:"ホーム" },
  { action:"quick", icon:"⚙︎", label:"クイック" },
  { action:"back", icon:"‹", label:"戻る" },
  { action:"up", icon:"↑", label:"上" },
  { action:"down", icon:"↓", label:"下" },
  { action:"left", icon:"←", label:"左" },
  { action:"right", icon:"→", label:"右" },
  { action:"confirm", icon:"○", label:"OK" },
  { action:"volumeDown", icon:"−", label:"音量−" },
  { action:"mute", icon:"⊘", label:"ミュート" },
  { action:"volumeUp", icon:"＋", label:"音量＋" },
  { action:"channelDown", icon:"↓", label:"CH−" },
  { action:"channelUp", icon:"↑", label:"CH＋" },
  { action:"rewind", icon:"≪", label:"巻き戻し" },
  { action:"play", icon:"▷", label:"再生" },
  { action:"fastForward", icon:"≫", label:"早送り" },
  { action:"pause", icon:"Ⅱ", label:"一時停止" },
  { action:"stop", icon:"□", label:"停止" },
  { action:"prev", icon:"|‹", label:"前" },
  { action:"next", icon:"›|", label:"次" }
]

const TV_DEFAULT = [
  "input", "home", "quick",
  "volumeDown", "mute", "volumeUp",
  "rewind", "play", "fastForward",
  "back", "pause", "stop"
]

const ADAPTIVE_NAV = {
  mute: "up",
  rewind: "left",
  play: "confirm",
  fastForward: "right",
  pause: "down"
}
const ADAPTIVE_SLOTS = new Set(Object.keys(ADAPTIVE_NAV))

const LIGHT_BUTTONS = [
  ["on","⏻","点灯"],["off","○","消灯"],["all","◎","全灯"],
  ["bright","＋","明るい"],["dark","−","暗い"],["night","◐","常夜灯"]
]
const AC_BUTTONS = [
  ["cool","❄︎","冷房"],["dry","◌","除湿"],["heat","≋","暖房"],["stop","⏻","停止"],
  ["tempDown","−","温度−"],["tempUp","＋","温度＋"],["fan","◎","風量 自動"],["wind","≈","風向"]
]

const STORAGE = {
  host:"yos.bravia.scriptable.host",
  psk:"yos.bravia.scriptable.psk",
  quick:"yos.bravia.scriptable.quick-command",
  mode:"yos.bravia.scriptable.auto-mode-v1"
}
const ALIASES = {
  power:["poweroff","power"], input:["input"], home:["home"],
  quick:["quick","options","actionmenu","settings"], menu:["actionmenu","options","androidmenu"],
  back:["return","back"], up:["up"], down:["down"], left:["left"], right:["right"], confirm:["confirm","enter"],
  volumeDown:["volumedown"], volumeUp:["volumeup"], mute:["mute"], channelDown:["channeldown"], channelUp:["channelup"],
  play:["play"], pause:["pause"], stop:["stop"], prev:["prev"], next:["next"], rewind:["rewind","backward"], fastForward:["forward","fastforward"]
}
const NAV_ACTIONS = new Set(["input","home","quick","menu","back","up","down","left","right","confirm"])
const MEDIA_ACTIONS = new Set(["play","pause","stop","rewind","fastForward","prev","next"])
const NAVIGATION_GRACE_MS = 2200

function runURL(name){ return "scriptable:///run?scriptName=" + encodeURIComponent(name) }
const REMOTES = {
  tv:runURL(CONFIG.tv.remoteScript),
  light:runURL(CONFIG.light.remoteScript),
  ac:runURL(CONFIG.ac.remoteScript)
}
function makeButtons(device, items){
  return items.map(([action,icon,label]) =>
    `<button class="key" onclick="sendOther(event,'${device}','${action}','${label}')"><span class="icon">${icon}</span><span class="label">${label}</span></button>`
  ).join("")
}

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif}
body{min-height:100vh;padding:10px 12px max(20px,env(safe-area-inset-bottom))}
.page{width:100%;max-width:500px;margin:0 auto;padding-top:92px}
.card{margin-bottom:12px;padding:15px 14px;border:1px solid #45484e;border-radius:27px;background:linear-gradient(155deg,#101215,#050506)}
.head{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}
.title{display:inline-flex;align-items:center;gap:7px;padding:6px 4px 6px 0;font-size:22px;font-weight:800;touch-action:manipulation}
.title:after{content:"›";font-size:22px;color:#5b8fdc}
.tools{display:flex;align-items:center;gap:7px}
.mode-badge{font-size:10px;font-weight:700;color:#8e8e93;min-width:34px;text-align:right}
.tool{height:32px;padding:0 11px;border:1px solid #353941;border-radius:11px;background:#15171b;color:#438eff;font-weight:750}
.grid{display:grid;gap:9px}.grid-3{grid-template-columns:repeat(3,1fr)}.grid-4{grid-template-columns:repeat(4,1fr)}
.key{min-width:0;min-height:62px;padding:8px;border:1px solid #26292f;border-radius:19px;background:linear-gradient(145deg,#1c1e22,#15171a);color:#fff;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:5px;touch-action:manipulation}
.key:active{transform:scale(.97);background:#25282d}
.key.adaptive{border-color:#343942}
.key.ok{background:#24384f}
.icon{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif;font-size:25px;font-weight:500;line-height:1;color:#438eff;font-variant-emoji:text}
.label{font-size:12px;font-weight:700;white-space:nowrap}
.brand{font-size:12px;color:#8d8f95}
</style></head><body><div class="page">
<section class="card">
  <div class="head">
    <div class="title" onclick="openRemote('tv')">BRAVIA</div>
    <div class="tools"><span id="modeBadge" class="mode-badge">判定中</span><button class="tool" onclick="sendMenu(event)">MENU</button></div>
  </div>
  <div id="tvGrid" class="grid grid-3"></div>
</section>
<section class="card"><div class="head"><div class="title" onclick="openRemote('light')">照明</div><div class="brand">Panasonic</div></div><div class="grid grid-3">${makeButtons("light", LIGHT_BUTTONS)}</div></section>
<section class="card"><div class="head"><div class="title" onclick="openRemote('ac')">エアコン</div><div class="brand">SHARP</div></div><div class="grid grid-4">${makeButtons("ac", AC_BUTTONS)}</div></section>
</div><script>
const REMOTES=${JSON.stringify(REMOTES)}
const ACTIONS=${JSON.stringify(TV_ACTIONS)}
const DEFAULT=${JSON.stringify(TV_DEFAULT)}
const ADAPTIVE_NAV=${JSON.stringify(ADAPTIVE_NAV)}
const ADAPTIVE=new Set(Object.keys(ADAPTIVE_NAV))
let mode="navigation"
let nonce=0
let pollTimer=null

function meta(action){return ACTIONS.find(item=>item.action===action)}
function displayAction(slot){return mode==="navigation"&&ADAPTIVE.has(slot)?ADAPTIVE_NAV[slot]:slot}
function nativeAction(device,action,label,slot=""){
  nonce++
  window.location.href="/__action?device="+encodeURIComponent(device)+
    "&action="+encodeURIComponent(action)+
    "&label="+encodeURIComponent(label||"")+
    "&slot="+encodeURIComponent(slot||"")+
    "&n="+nonce
}
function makeTVKey(slot){
  const action=displayAction(slot)
  const item=meta(action)
  const b=document.createElement("button")
  b.className="key"+(ADAPTIVE.has(slot)?" adaptive":"")+(action==="confirm"?" ok":"")
  b.innerHTML='<span class="icon">'+item.icon+'</span><span class="label">'+item.label+"</span>"
  b.onclick=e=>{
    e.preventDefault();e.stopPropagation()
    if(ADAPTIVE.has(slot)) nativeAction("tvAdaptive","",item.label,slot)
    else nativeAction("tv",action,item.label)
  }
  return b
}
function renderTV(){
  const root=document.getElementById("tvGrid")
  root.innerHTML=""
  DEFAULT.forEach(slot=>root.appendChild(makeTVKey(slot)))
  const badge=document.getElementById("modeBadge")
  if(badge)badge.textContent=mode==="media"?"動画":"カーソル"
}
function setMode(value){
  if(value!=="navigation"&&value!=="media")return
  if(mode!==value){mode=value;renderTV()}
  else{
    const badge=document.getElementById("modeBadge")
    if(badge)badge.textContent=mode==="media"?"動画":"カーソル"
  }
}
function nativeResult(result){
  if(result&&result.mode)setMode(result.mode)
}
function requestMode(){nativeAction("system","refreshMode","")}
function sendMenu(e){e.preventDefault();e.stopPropagation();nativeAction("tv","menu","MENU")}
function sendOther(e,device,action,label){e.preventDefault();e.stopPropagation();nativeAction(device,action,label)}
function openRemote(device){window.location.href=REMOTES[device]}

renderTV()
requestMode()
pollTimer=setInterval(requestMode,1400)
window.addEventListener("beforeunload",()=>{if(pollTimer)clearInterval(pollTimer)})
</script></body></html>`

function secure(key){return Keychain.contains(key)?Keychain.get(key):""}
function sonyHost(){const value=secure(STORAGE.host).trim().replace(/^https?:\/\//i,"").replace(/:\d+$/,"");if(!value)throw new Error("BRAVIA IP設定なし");return value}
function sonyPSK(){const value=secure(STORAGE.psk);if(!value)throw new Error("BRAVIA PSK設定なし");return value}
function loadMode(){try{if(Keychain.contains(STORAGE.mode)){const value=JSON.parse(Keychain.get(STORAGE.mode));if(value&&(value.mode==="navigation"||value.mode==="media"))return value}}catch(_){}return{mode:"navigation",navigationUntil:0}}
let modeState=loadMode(),commandIndex=null
function rememberMode(mode,action){const now=Date.now();modeState={mode,navigationUntil:mode==="navigation"?now+NAVIGATION_GRACE_MS:0,lastAction:action||"",updatedAt:now};Keychain.set(STORAGE.mode,JSON.stringify(modeState))}
function noteAction(action){if(NAV_ACTIONS.has(action))rememberMode("navigation",action);else if(MEDIA_ACTIONS.has(action))rememberMode("media",action)}
async function sonyJSON(service,method){const r=new Request("http://"+sonyHost()+"/sony/"+service);r.method="POST";r.headers={"Content-Type":"application/json","X-Auth-PSK":sonyPSK()};r.body=JSON.stringify({method,params:[],id:1,version:"1.0"});return JSON.parse(await r.loadString())}
async function discoverSony(){if(commandIndex)return;const data=await sonyJSON("system","getRemoteControllerInfo"),commands=data&&data.result&&data.result[1];if(!Array.isArray(commands))throw new Error("BRAVIAコマンド取得失敗");commandIndex=new Map();commands.forEach(item=>{if(item&&item.name&&item.value)commandIndex.set(String(item.name).toLowerCase(),String(item.value))})}
function xmlEscape(v){return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}
async function sonyAction(action){await discoverSony();noteAction(action);let code=null;if(action==="quick"&&Keychain.contains(STORAGE.quick)){const saved=String(Keychain.get(STORAGE.quick)).toLowerCase();if(commandIndex.has(saved))code=commandIndex.get(saved)}for(const alias of ALIASES[action]||[]){if(!code&&commandIndex.has(alias.toLowerCase()))code=commandIndex.get(alias.toLowerCase())}if(!code)throw new Error("BRAVIA未対応："+action);const r=new Request("http://"+sonyHost()+"/sony/ircc");r.method="POST";r.headers={"Content-Type":"text/xml; charset=UTF-8","X-Auth-PSK":sonyPSK(),SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'};r.body='<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+xmlEscape(code)+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>';await r.loadString()}
function hasNavigationStatus(data){const list=data&&data.result&&data.result[0];return Array.isArray(list)&&list.some(item=>item&&["cursorDisplay","textInput","webBrowse"].some(key=>{const value=item[key];return value===true||value==="true"||value==="active"||value==="available"}))}
function hasPlaybackInfo(data){const info=data&&data.result&&data.result[0];return Boolean(info&&typeof info==="object"&&(info.uri||info.source||info.title||info.programTitle))}
async function inferMode(){
  if(Date.now()<Number(modeState.navigationUntil||0))return modeState.mode
  try{
    if(hasNavigationStatus(await sonyJSON("appControl","getApplicationStatusList"))){
      rememberMode("navigation","status")
      return modeState.mode
    }
  }catch(_){}
  try{
    if(hasPlaybackInfo(await sonyJSON("avContent","getPlayingContentInfo"))){
      rememberMode("media","status")
      return modeState.mode
    }
  }catch(_){}
  return modeState.mode
}

function normalizeName(value){return String(value).replace(/\.js$/i,"").replace(/\s+/g," ").trim().toLowerCase()}
async function readScript(scriptName){for(const manager of [FileManager.iCloud(),FileManager.local()]){const directory=manager.documentsDirectory();let files=[];try{files=manager.listContents(directory)}catch(_){}for(const file of files){if(normalizeName(file)!==normalizeName(scriptName)&&normalizeName(file)!==normalizeName(scriptName+".js"))continue;const path=manager.joinPath(directory,file);try{if(manager.isFileStoredIniCloud(path))await manager.downloadFileFromiCloud(path)}catch(_){}return manager.readString(path)}}throw new Error(scriptName+" が見つかりません")}
async function runExisting(scriptName,action){const source=await readScript(scriptName);const fakeArgs={queryParameters:{action},shortcutParameter:null,widgetParameter:null,plainTexts:[],urls:[],fileURLs:[],images:[],notification:null};const fakeScript={name:()=>scriptName,complete:()=>{},setShortcutOutput:()=>{},setWidget:()=>{}};const fakeConfig={runsInApp:true,runsInWidget:false,runsWithSiri:false,runsInNotification:false};const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;await new AsyncFunction("args","Script","config",source)(fakeArgs,fakeScript,fakeConfig)}
function parseQuery(url){const output={},position=String(url).indexOf("?");if(position<0)return output;String(url).slice(position+1).split("&").forEach(pair=>{const sep=pair.indexOf("="),key=sep>=0?pair.slice(0,sep):pair,value=sep>=0?pair.slice(sep+1):"";output[decodeURIComponent(key)]=decodeURIComponent(value)});return output}

const queue=[]
let running=false,web=null
async function processQueue(){
  if(running)return
  running=true
  while(queue.length){
    const item=queue.shift()
    let result
    try{
      if(item.device==="system"){
        result={ok:true,mode:await inferMode()}
      }else if(item.device==="tvAdaptive"){
        const currentMode=await inferMode()
        const action=currentMode==="navigation"?(ADAPTIVE_NAV[item.slot]||item.slot):item.slot
        await sonyAction(action)
        result={ok:true,label:item.label,action,mode:await inferMode()}
      }else if(item.device==="tv"){
        await sonyAction(item.action)
        result={ok:true,label:item.label,mode:await inferMode()}
      }else if(item.device==="light"){
        await runExisting(CONFIG.light.actionScript,item.action)
        result={ok:true,label:item.label}
      }else if(item.device==="ac"){
        await runExisting(CONFIG.ac.actionScript,item.action)
        result={ok:true,label:item.label}
      }else{
        throw new Error("不明なデバイスです")
      }
    }catch(error){
      result={ok:false,message:error&&error.message?error.message:String(error)}
    }
    try{await web.evaluateJavaScript("nativeResult("+JSON.stringify(result)+")")}catch(_){}
  }
  running=false
}

web=new WebView()
web.shouldAllowRequest=request=>{
  const url=String(request.url||"")
  if(!url.startsWith("https://yos-remote.local/__action?"))return true
  const query=parseQuery(url)
  queue.push({device:query.device,action:query.action,label:query.label,slot:query.slot})
  processQueue()
  return false
}
await web.loadHTML(html,"https://yos-remote.local/")
try{await web.evaluateJavaScript("setMode("+JSON.stringify(await inferMode())+")")}catch(_){}
await web.present(true)
Script.complete()
