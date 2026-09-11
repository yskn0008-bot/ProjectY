// YOS Remote Hub v5.5 — hybrid BRAVIA media/cursor controls + one-screen layout.
// Adaptive five-button cross:
// Navigation: Mute=Up, Rewind=Left, Play=OK, FastForward=Right, Pause=Down.
// Playback: Mute/Rewind/Play/FastForward/Pause.
// Playback overlay / paused cursor: Up=Up, Rewind=Rewind, Play=Play, FastForward=FastForward, Down=Down.

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

const ADAPTIVE_NAV = { mute:"up", rewind:"left", play:"confirm", fastForward:"right", pause:"down" }
const ADAPTIVE_HYBRID = { mute:"up", rewind:"rewind", play:"play", fastForward:"fastForward", pause:"down" }
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
const HYBRID_KEEP_ACTIONS = new Set(["up","down","rewind","fastForward","prev","next"])
const NAVIGATION_GRACE_MS = 2200
const RECENT_MEDIA_MS = 120000

function runURL(name){ return "scriptable:///run?scriptName=" + encodeURIComponent(name) }
const REMOTES = { tv:runURL(CONFIG.tv.remoteScript), light:runURL(CONFIG.light.remoteScript), ac:runURL(CONFIG.ac.remoteScript) }
function makeButtons(device, items){
  return items.map(([action,icon,label]) =>
    `<button class="key" onclick="sendOther(event,'${device}','${action}','${label}')"><span class="icon">${icon}</span><span class="label">${label}</span></button>`
  ).join("")
}

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif}
body{padding:0 8px}
.page{width:100%;max-width:500px;height:100dvh;margin:0 auto;padding:max(58px,calc(env(safe-area-inset-top) + 4px)) 0 max(8px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px;overflow:hidden}
.card{margin:0;padding:8px 10px 9px;border:1px solid #45484e;border-radius:22px;background:linear-gradient(155deg,#101215,#050506)}
.head{height:28px;display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.title{display:inline-flex;align-items:center;gap:6px;padding:2px 3px 2px 0;font-size:18px;font-weight:800;touch-action:manipulation}
.title:after{content:"›";font-size:19px;color:#5b8fdc}
.tools,.ac-meta{display:flex;align-items:center;gap:6px}
.mode-badge{font-size:9px;font-weight:700;color:#8e8e93;min-width:48px;text-align:right}
.tool{height:28px;padding:0 9px;border:1px solid #353941;border-radius:10px;background:#15171b;color:#438eff;font-size:11px;font-weight:750}
.grid{display:grid;gap:6px}.grid-3{grid-template-columns:repeat(3,1fr)}.grid-4{grid-template-columns:repeat(4,1fr)}
.key{min-width:0;height:62px;padding:7px;border:1px solid #26292f;border-radius:18px;background:linear-gradient(145deg,#1c1e22,#15171a);color:#fff;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px;touch-action:manipulation}
.key:active{transform:scale(.97);background:#25282d}.key.adaptive{border-color:#343942}.key.ok{background:#24384f}
.icon{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif;font-size:23px;font-weight:500;line-height:1;color:#438eff;font-variant-emoji:text}
.label{font-size:11px;font-weight:700;white-space:nowrap}.brand{font-size:10px;color:#8d8f95}.ac-temp{font-size:17px;font-weight:800;color:#fff;min-width:34px;text-align:right}
@media(max-height:800px){.page{padding-top:max(52px,calc(env(safe-area-inset-top) + 2px));gap:4px}.card{padding:6px 8px 7px}.head{height:24px;margin-bottom:4px}.title{font-size:17px}.grid{gap:5px}}
</style></head><body><div class="page">
<section class="card"><div class="head"><div class="title" onclick="openRemote('tv')">BRAVIA</div><div class="tools"><span id="modeBadge" class="mode-badge">判定中</span><button class="tool" onclick="sendMenu(event)">MENU</button></div></div><div id="tvGrid" class="grid grid-3"></div></section>
<section class="card"><div class="head"><div class="title" onclick="openRemote('light')">照明</div><div class="brand">Panasonic</div></div><div class="grid grid-3">${makeButtons("light", LIGHT_BUTTONS)}</div></section>
<section class="card"><div class="head"><div class="title" onclick="openRemote('ac')">エアコン</div><div class="ac-meta"><span id="acTemp" class="ac-temp">--°</span><span class="brand">SHARP</span></div></div><div class="grid grid-4">${makeButtons("ac", AC_BUTTONS)}</div></section>
</div><script>
const REMOTES=${JSON.stringify(REMOTES)},ACTIONS=${JSON.stringify(TV_ACTIONS)},DEFAULT=${JSON.stringify(TV_DEFAULT)},ADAPTIVE_NAV=${JSON.stringify(ADAPTIVE_NAV)},ADAPTIVE_HYBRID=${JSON.stringify(ADAPTIVE_HYBRID)},ADAPTIVE=new Set(Object.keys(ADAPTIVE_NAV))
let mode="navigation",nonce=0,pollTimer=null,acTimer=null
function meta(action){return ACTIONS.find(item=>item.action===action)}
function displayAction(slot){if(!ADAPTIVE.has(slot))return slot;if(mode==="navigation")return ADAPTIVE_NAV[slot];if(mode==="hybrid")return ADAPTIVE_HYBRID[slot];return slot}
function nativeAction(device,action,label,slot=""){nonce++;window.location.href="/__action?device="+encodeURIComponent(device)+"&action="+encodeURIComponent(action)+"&label="+encodeURIComponent(label||"")+"&slot="+encodeURIComponent(slot||"")+"&n="+nonce}
function makeTVKey(slot){const action=displayAction(slot),item=meta(action),b=document.createElement("button");b.className="key"+(ADAPTIVE.has(slot)?" adaptive":"")+(action==="confirm"?" ok":"");b.innerHTML='<span class="icon">'+item.icon+'</span><span class="label">'+item.label+"</span>";b.onclick=e=>{e.preventDefault();e.stopPropagation();if(ADAPTIVE.has(slot))nativeAction("tvAdaptive","",item.label,slot);else nativeAction("tv",action,item.label)};return b}
function modeLabel(){return mode==="media"?"動画":mode==="hybrid"?"動画＋操作":"カーソル"}
function renderTV(){const root=document.getElementById("tvGrid");root.innerHTML="";DEFAULT.forEach(slot=>root.appendChild(makeTVKey(slot)));document.getElementById("modeBadge").textContent=modeLabel()}
function setMode(value){if(!["navigation","hybrid","media"].includes(value))return;if(mode!==value){mode=value;renderTV()}else document.getElementById("modeBadge").textContent=modeLabel()}
function setACState(s){const el=document.getElementById("acTemp");if(!el)return;if(!s){el.textContent="--°";return}el.textContent=s.dry?"—":(Number.isFinite(Number(s.temp))?Math.round(Number(s.temp))+"°":"--°")}
function nativeResult(result){if(result&&result.mode)setMode(result.mode);if(result&&Object.prototype.hasOwnProperty.call(result,"ac"))setACState(result.ac)}
function requestMode(){nativeAction("system","refreshMode","")}function requestAC(){nativeAction("system","refreshAC","")}
function sendMenu(e){e.preventDefault();e.stopPropagation();nativeAction("tv","menu","MENU")}function sendOther(e,device,action,label){e.preventDefault();e.stopPropagation();nativeAction(device,action,label)}function openRemote(device){window.location.href=REMOTES[device]}
renderTV();requestMode();requestAC();pollTimer=setInterval(requestMode,1600);acTimer=setInterval(requestAC,30000);window.addEventListener("beforeunload",()=>{if(pollTimer)clearInterval(pollTimer);if(acTimer)clearInterval(acTimer)})
</script></body></html>`

function secure(key){return Keychain.contains(key)?Keychain.get(key):""}
function sonyHost(){const value=secure(STORAGE.host).trim().replace(/^https?:\/\//i,"").replace(/:\d+$/,"");if(!value)throw new Error("BRAVIA IP設定なし");return value}
function sonyPSK(){const value=secure(STORAGE.psk);if(!value)throw new Error("BRAVIA PSK設定なし");return value}
function loadMode(){try{if(Keychain.contains(STORAGE.mode)){const value=JSON.parse(Keychain.get(STORAGE.mode));if(value&&["navigation","hybrid","media"].includes(value.mode))return value}}catch(_){}return{mode:"navigation",navigationUntil:0,updatedAt:0,lastAction:""}}
let modeState=loadMode(),commandIndex=null
function rememberMode(mode,action){const now=Date.now();modeState={mode,navigationUntil:mode==="navigation"?now+NAVIGATION_GRACE_MS:0,lastAction:action||"",updatedAt:now};Keychain.set(STORAGE.mode,JSON.stringify(modeState));return mode}
function noteAction(action){if(action==="pause"){rememberMode("hybrid",action);return}if(action==="play"){rememberMode("media",action);return}if(action==="stop"){rememberMode("navigation",action);return}if(modeState.mode==="hybrid"&&HYBRID_KEEP_ACTIONS.has(action)){rememberMode("hybrid",action);return}if(NAV_ACTIONS.has(action))rememberMode("navigation",action);else if(MEDIA_ACTIONS.has(action))rememberMode("media",action)}
async function sonyJSON(service,method){const r=new Request("http://"+sonyHost()+"/sony/"+service);r.method="POST";r.headers={"Content-Type":"application/json","X-Auth-PSK":sonyPSK()};r.body=JSON.stringify({method,params:[],id:1,version:"1.0"});return JSON.parse(await r.loadString())}
async function discoverSony(){if(commandIndex)return;const data=await sonyJSON("system","getRemoteControllerInfo"),commands=data&&data.result&&data.result[1];if(!Array.isArray(commands))throw new Error("BRAVIAコマンド取得失敗");commandIndex=new Map();commands.forEach(item=>{if(item&&item.name&&item.value)commandIndex.set(String(item.name).toLowerCase(),String(item.value))})}
function xmlEscape(v){return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}
async function sonyAction(action){await discoverSony();noteAction(action);let code=null;if(action==="quick"&&Keychain.contains(STORAGE.quick)){const saved=String(Keychain.get(STORAGE.quick)).toLowerCase();if(commandIndex.has(saved))code=commandIndex.get(saved)}for(const alias of ALIASES[action]||[]){if(!code&&commandIndex.has(alias.toLowerCase()))code=commandIndex.get(alias.toLowerCase())}if(!code)throw new Error("BRAVIA未対応："+action);const r=new Request("http://"+sonyHost()+"/sony/ircc");r.method="POST";r.headers={"Content-Type":"text/xml; charset=UTF-8","X-Auth-PSK":sonyPSK(),SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'};r.body='<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+xmlEscape(code)+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>';await r.loadString()}
function hasNavigationStatus(data){const list=data&&data.result&&data.result[0];return Array.isArray(list)&&list.some(item=>item&&["cursorDisplay","textInput","webBrowse"].includes(String(item.name||""))&&String(item.status||"").toLowerCase()==="on")}
function hasPlaybackInfo(data){const info=data&&data.result&&data.result[0];return Boolean(info&&typeof info==="object"&&(info.uri||info.source||info.title||info.programTitle))}
async function inferMode(){const now=Date.now();if(modeState.mode==="navigation"&&now<Number(modeState.navigationUntil||0))return "navigation";let nav=false,playback=false;try{nav=hasNavigationStatus(await sonyJSON("appControl","getApplicationStatusList"))}catch(_){}try{playback=hasPlaybackInfo(await sonyJSON("avContent","getPlayingContentInfo"))}catch(_){}const recentMedia=["media","hybrid"].includes(modeState.mode)&&now-Number(modeState.updatedAt||0)<RECENT_MEDIA_MS;if(nav){if(playback||recentMedia)return rememberMode("hybrid","status");return rememberMode("navigation","status")}if(playback)return rememberMode("media","status");return modeState.mode}

function walk(value,out=[]){if(Array.isArray(value))for(const v of value)walk(v,out);else if(value&&typeof value==="object"){out.push(value);for(const v of Object.values(value))walk(v,out)}return out}
async function readACSummary(){try{const tapo=importModule("YOS Tapo H110 Core");const remote=tapo.findRemote(r=>String(r.model||"").toUpperCase()==="AC"||/エアコン|air.?con/i.test(String(r.nickname||"")));if(!remote)return null;const client=await tapo.client();const raw=await client.query({method:"control_child",params:{device_id:remote.device_id,requestData:{method:"get_device_info",params:null}}});const info=walk(raw,[]).find(x=>typeof x.ac_status==="string")||{};const s={};if(typeof info.ac_status==="string")for(const part of info.ac_status.split("_")){const m=String(part).match(/^([PMTSD])(-?\d+)$/);if(m)s[m[1]]=Number(m[2])}if(s.M==null&&info.ac_mode!=null)s.M=Number(info.ac_mode);if(s.T==null&&info.current_temp!=null)s.T=Number(info.current_temp);return{temp:Number.isFinite(s.T)?s.T:null,dry:s.M===4}}catch(_){return null}}

function normalizeName(value){return String(value).replace(/\.js$/i,"").replace(/\s+/g," ").trim().toLowerCase()}
async function readScript(scriptName){for(const manager of [FileManager.iCloud(),FileManager.local()]){const directory=manager.documentsDirectory();let files=[];try{files=manager.listContents(directory)}catch(_){}for(const file of files){if(normalizeName(file)!==normalizeName(scriptName)&&normalizeName(file)!==normalizeName(scriptName+".js"))continue;const path=manager.joinPath(directory,file);try{if(manager.isFileStoredIniCloud(path))await manager.downloadFileFromiCloud(path)}catch(_){}return manager.readString(path)}}throw new Error(scriptName+" が見つかりません")}
async function runExisting(scriptName,action){const source=await readScript(scriptName);const fakeArgs={queryParameters:{action},shortcutParameter:null,widgetParameter:null,plainTexts:[],urls:[],fileURLs:[],images:[],notification:null};const fakeScript={name:()=>scriptName,complete:()=>{},setShortcutOutput:()=>{},setWidget:()=>{}};const fakeConfig={runsInApp:true,runsInWidget:false,runsWithSiri:false,runsInNotification:false};const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;await new AsyncFunction("args","Script","config",source)(fakeArgs,fakeScript,fakeConfig)}
function parseQuery(url){const output={},position=String(url).indexOf("?");if(position<0)return output;String(url).slice(position+1).split("&").forEach(pair=>{const sep=pair.indexOf("="),key=sep>=0?pair.slice(0,sep):pair,value=sep>=0?pair.slice(sep+1):"";output[decodeURIComponent(key)]=decodeURIComponent(value)});return output}
const queue=[];let running=false,web=null
async function processQueue(){if(running)return;running=true;while(queue.length){const item=queue.shift();let result;try{if(item.device==="system"&&item.action==="refreshMode")result={ok:true,mode:await inferMode()};else if(item.device==="system"&&item.action==="refreshAC")result={ok:true,ac:await readACSummary()};else if(item.device==="tvAdaptive"){const currentMode=await inferMode();const map=currentMode==="navigation"?ADAPTIVE_NAV:currentMode==="hybrid"?ADAPTIVE_HYBRID:null;const action=map?(map[item.slot]||item.slot):item.slot;await sonyAction(action);result={ok:true,label:item.label,action,mode:await inferMode()}}else if(item.device==="tv"){await sonyAction(item.action);result={ok:true,label:item.label,mode:await inferMode()}}else if(item.device==="light"){await runExisting(CONFIG.light.actionScript,item.action);result={ok:true,label:item.label}}else if(item.device==="ac"){await runExisting(CONFIG.ac.actionScript,item.action);result={ok:true,label:item.label,ac:await readACSummary()}}else throw new Error("不明なデバイスです")}catch(error){result={ok:false,message:error&&error.message?error.message:String(error)}}try{await web.evaluateJavaScript("nativeResult("+JSON.stringify(result)+")")}catch(_){}}running=false}
web=new WebView();web.shouldAllowRequest=request=>{const url=String(request.url||"");if(!url.startsWith("https://yos-remote.local/__action?"))return true;const query=parseQuery(url);queue.push({device:query.device,action:query.action,label:query.label,slot:query.slot});processQueue();return false}
await web.loadHTML(html,"https://yos-remote.local/");try{await web.evaluateJavaScript("setMode("+JSON.stringify(await inferMode())+")")}catch(_){}try{await web.evaluateJavaScript("setACState("+JSON.stringify(await readACSummary())+")")}catch(_){}await web.present(true);Script.complete()
