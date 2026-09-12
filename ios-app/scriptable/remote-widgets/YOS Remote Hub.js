// YOS Remote Hub v6.3 — play-anchored adaptive cross + real center swipe overlay + original-action fallback + user layout editor.
// The 12 visible BRAVIA slots are user-configurable and persisted in WebView localStorage.
// The adaptive cursor cross is geometric: the Play button is always the center anchor.
// Navigation: Above/Left/Play/Right/Below => Up/Left/OK/Right/Down.
// Playback: every slot keeps the user's configured button.
// Hybrid (playback overlay / paused cursor): Above/Below => Up/Down; Left/Play/Right keep configured media actions.
// Swipe is owned by one transparent center touchpad whose hit area overlaps the four surrounding cursor keys.
// The overlay handles iOS touch events directly; taps are forwarded to the underlying visible key and swipes send cursor movement.
// Configured buttons hidden by cursor mode remain available by long-press.

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
  { action:"menu", icon:"≡", label:"MENU" },
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

const CROSS_NAV = { up:"up", left:"left", center:"confirm", right:"right", down:"down" }
const HYBRID_CURSOR_ROLES = new Set(["up","down"])

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
.tv-card{position:relative}
.tv-card:before{content:"";position:absolute;left:20%;right:20%;top:-35px;height:36px;border:1px solid #45484e;border-bottom:0;border-radius:22px 22px 0 0;background:linear-gradient(155deg,#101215,#050506);pointer-events:none}
.head{height:28px;display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.title{display:inline-flex;align-items:center;gap:6px;padding:2px 3px 2px 0;font-size:18px;font-weight:800;touch-action:manipulation}
.title:after{content:"›";font-size:19px;color:#5b8fdc}
.tools,.ac-meta{display:flex;align-items:center;gap:5px}
.mode-badge{font-size:9px;font-weight:700;color:#8e8e93;min-width:44px;text-align:right}
.tool{height:28px;padding:0 8px;border:1px solid #353941;border-radius:10px;background:#15171b;color:#438eff;font-size:11px;font-weight:750}
.grid{display:grid;gap:6px}.grid-3{grid-template-columns:repeat(3,1fr)}.grid-4{grid-template-columns:repeat(4,1fr)}
#tvGrid{position:relative}
.key{position:relative;min-width:0;height:62px;padding:7px;border:1px solid #26292f;border-radius:18px;background:linear-gradient(145deg,#1c1e22,#15171a);color:#fff;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px;touch-action:manipulation;-webkit-touch-callout:none;user-select:none}
.key:active{transform:scale(.97);background:#25282d}.key.adaptive{border-color:#343942}.key.ok{background:#24384f}
.icon{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif;font-size:23px;font-weight:500;line-height:1;color:#438eff;font-variant-emoji:text}
.label{font-size:11px;font-weight:700;white-space:nowrap}.alt-label{position:absolute;right:7px;bottom:5px;font-size:7px;font-weight:700;color:#777b83;line-height:1;white-space:nowrap}.brand{font-size:10px;color:#8d8f95}.ac-temp{font-size:17px;font-weight:800;color:#fff;min-width:34px;text-align:right}
.swipe-pad{display:none;position:fixed;z-index:40;background:transparent;touch-action:none;-webkit-touch-callout:none;user-select:none}
.config-layer{display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.94);padding:max(58px,calc(env(safe-area-inset-top) + 4px)) 10px max(12px,env(safe-area-inset-bottom));overflow:auto}
.config-layer.open{display:block}
.config-card{width:100%;max-width:500px;margin:0 auto;padding:12px;border:1px solid #45484e;border-radius:22px;background:#0d0f12}
.config-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.config-title{font-size:20px;font-weight:800}.config-actions{display:flex;gap:6px}
.config-help{font-size:11px;line-height:1.4;color:#a4a6ab;margin:0 0 10px}
.config-grid,.palette{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.config-grid{margin-bottom:12px}
.config-slot,.palette-key{height:54px;border:1px solid #2d3137;border-radius:15px;background:#17191d;color:#fff;display:flex;align-items:center;justify-content:center;gap:5px;font-weight:700;font-size:11px}
.config-slot.selected{border-color:#438eff;background:#24384f}.palette-key.used{opacity:.45}.palette-key:disabled{opacity:.25}.palette-key .picon{font-size:18px;color:#438eff}.palette-key .plabel{font-size:10px}
.section-label{font-size:11px;font-weight:800;color:#8e8e93;margin:4px 0 7px}
@media(max-height:800px){.page{padding-top:max(52px,calc(env(safe-area-inset-top) + 2px));gap:4px}.tv-card:before{top:-29px;height:30px}.card{padding:6px 8px 7px}.head{height:24px;margin-bottom:4px}.title{font-size:17px}.grid{gap:5px}}
</style></head><body><div class="page">
<section class="card tv-card"><div class="head"><div class="title" onclick="openRemote('tv')">BRAVIA</div><div class="tools"><span id="modeBadge" class="mode-badge">判定中</span><button class="tool" onclick="openLayoutEditor(event)">配置</button><button class="tool" onclick="sendMenu(event)">MENU</button></div></div><div id="tvGrid" class="grid grid-3"></div></section>
<section class="card"><div class="head"><div class="title" onclick="openRemote('light')">照明</div><div class="brand">Panasonic</div></div><div class="grid grid-3">${makeButtons("light", LIGHT_BUTTONS)}</div></section>
<section class="card"><div class="head"><div class="title" onclick="openRemote('ac')">エアコン</div><div class="ac-meta"><span id="acTemp" class="ac-temp">--°</span><span class="brand">SHARP</span></div></div><div class="grid grid-4">${makeButtons("ac", AC_BUTTONS)}</div></section>
</div>
<div id="centerSwipePad" class="swipe-pad" aria-hidden="true"></div>
<div id="configLayer" class="config-layer"><div class="config-card"><div class="config-head"><div class="config-title">BRAVIA 配置</div><div class="config-actions"><button class="tool" onclick="resetLayout(event)">初期化</button><button class="tool" onclick="closeLayoutEditor(event)">完了</button></div></div><p class="config-help">12枠内は「移動元 → 移動先」で入れ替え。再生位置が自動カーソルの中心。中央には上下左右へ重なる透明スワイプ面があり、スワイプで移動・タップなら下のボタンをそのまま実行します。切替中の長押しは元機能です。</p><div class="section-label">表示中の12枠</div><div id="configGrid" class="config-grid"></div><div class="section-label">使えるBRAVIAボタン</div><div id="palette" class="palette"></div></div></div>
<script>
const REMOTES=${JSON.stringify(REMOTES)},ACTIONS=${JSON.stringify(TV_ACTIONS)},DEFAULT=${JSON.stringify(TV_DEFAULT)},CROSS_NAV=${JSON.stringify(CROSS_NAV)}
const LAYOUT_KEY="yos.remote.tv.buttons.v52"
let mode="navigation",nonce=0,pollTimer=null,acTimer=null,selectedSlot=null,gestureSuppressUntil=0
function meta(action){return ACTIONS.find(item=>item.action===action)}
function validAction(action){return ACTIONS.some(item=>item.action===action)}
function loadLayout(){let saved=[];try{saved=JSON.parse(localStorage.getItem(LAYOUT_KEY))}catch(_){}const clean=Array.isArray(saved)?saved.filter(validAction).slice(0,12):[];for(const action of DEFAULT){if(clean.length>=12)break;if(!clean.includes(action))clean.push(action)}for(const item of ACTIONS){if(clean.length>=12)break;if(!clean.includes(item.action))clean.push(item.action)}return clean.slice(0,12)}
let layout=loadLayout()
function saveLayout(){try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(layout))}catch(_){}}
function crossRole(index){
  const center=layout.indexOf("play")
  if(center<0)return null
  const cr=Math.floor(center/3),cc=center%3,r=Math.floor(index/3),c=index%3
  if(index===center)return "center"
  if(r===cr-1&&c===cc)return "up"
  if(r===cr+1&&c===cc)return "down"
  if(r===cr&&c===cc-1)return "left"
  if(r===cr&&c===cc+1)return "right"
  return null
}
function displayAction(index,baseAction){
  const role=crossRole(index)
  if(!role)return baseAction
  if(mode==="navigation")return CROSS_NAV[role]
  if(mode==="hybrid"&&(role==="up"||role==="down"))return CROSS_NAV[role]
  return baseAction
}
function nativeAction(device,action,label,slot=""){nonce++;window.location.href="/__action?device="+encodeURIComponent(device)+"&action="+encodeURIComponent(action||"")+"&label="+encodeURIComponent(label||"")+"&slot="+encodeURIComponent(slot||"")+"&n="+nonce}
function swipeAction(dx,dy){
  if(Math.max(Math.abs(dx),Math.abs(dy))<18)return null
  return Math.abs(dx)>Math.abs(dy)?(dx>0?"right":"left"):(dy>0?"down":"up")
}
function makeTVKey(baseAction,index){
  const role=crossRole(index),action=displayAction(index,baseAction),item=meta(action),base=meta(baseAction),b=document.createElement("button"),overridden=action!==baseAction
  b.className="key"+(role?" adaptive":"")+(action==="confirm"?" ok":"")
  b.dataset.index=String(index)
  b.dataset.baseAction=baseAction
  b.dataset.baseLabel=base.label
  b.dataset.overridden=overridden?"1":"0"
  b.innerHTML='<span class="icon">'+item.icon+'</span><span class="label">'+item.label+'</span>'+(overridden?'<span class="alt-label">長押し '+base.label+'</span>':'')
  let holdTimer=null,suppressUntil=0,startX=0,startY=0,tracking=false
  const cancelHold=()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null}}
  if(overridden){
    b.addEventListener("touchstart",e=>{
      const t=e.touches&&e.touches[0];if(!t)return
      startX=t.clientX;startY=t.clientY;tracking=true
      cancelHold();holdTimer=setTimeout(()=>{holdTimer=null;suppressUntil=Date.now()+900;nativeAction("tvOriginal",baseAction,base.label)},550)
    },{passive:true})
    b.addEventListener("touchmove",e=>{
      if(!tracking)return
      const t=e.touches&&e.touches[0];if(!t)return
      if(Math.max(Math.abs(t.clientX-startX),Math.abs(t.clientY-startY))>10)cancelHold()
    },{passive:true})
    b.addEventListener("touchend",()=>{tracking=false;cancelHold()},{passive:true})
    b.addEventListener("touchcancel",()=>{tracking=false;cancelHold()},{passive:true})
    b.oncontextmenu=e=>{e.preventDefault();return false}
  }
  b.onclick=e=>{e.preventDefault();e.stopPropagation();if(Date.now()<gestureSuppressUntil||Date.now()<suppressUntil)return;if(role)nativeAction("tvAdaptive",baseAction,item.label,role);else nativeAction("tv",baseAction,item.label)}
  return b
}
function tvButtonAt(x,y){
  const root=document.getElementById("tvGrid")
  if(!root)return null
  for(const b of root.children){
    const r=b.getBoundingClientRect()
    if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)return b
  }
  return null
}
function updateCenterSwipePad(){
  const root=document.getElementById("tvGrid"),pad=document.getElementById("centerSwipePad"),configOpen=document.getElementById("configLayer").classList.contains("open")
  if(!root||!pad||mode==="media"||configOpen){if(pad)pad.style.display="none";return}
  const center=layout.indexOf("play"),el=root.children[center]
  if(center<0||!el){pad.style.display="none";return}
  const r=el.getBoundingClientRect(),rr=root.getBoundingClientRect()
  const wantedW=r.width*1.82,wantedH=r.height*2.42
  const left=Math.max(rr.left,r.left+r.width/2-wantedW/2),right=Math.min(rr.right,r.left+r.width/2+wantedW/2)
  const top=Math.max(rr.top,r.top+r.height/2-wantedH/2),bottom=Math.min(rr.bottom,r.top+r.height/2+wantedH/2)
  pad.style.left=left+"px";pad.style.top=top+"px";pad.style.width=Math.max(1,right-left)+"px";pad.style.height=Math.max(1,bottom-top)+"px";pad.style.display="block"
}
function installCenterSwipePad(){
  const pad=document.getElementById("centerSwipePad")
  if(!pad||pad.dataset.bound==="1")return
  pad.dataset.bound="1"
  let active=false,moved=false,longPressed=false,startX=0,startY=0,startButton=null,holdTimer=null
  const cancelHold=()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null}}
  pad.addEventListener("touchstart",e=>{
    if(mode==="media"){active=false;return}
    const t=e.touches&&e.touches[0];if(!t)return
    e.preventDefault();e.stopPropagation()
    active=true;moved=false;longPressed=false;startX=t.clientX;startY=t.clientY;startButton=tvButtonAt(startX,startY)
    cancelHold()
    if(startButton&&startButton.dataset.overridden==="1"){
      holdTimer=setTimeout(()=>{
        holdTimer=null;longPressed=true;gestureSuppressUntil=Date.now()+900
        nativeAction("tvOriginal",startButton.dataset.baseAction||"",startButton.dataset.baseLabel||"")
      },550)
    }
  },{passive:false})
  pad.addEventListener("touchmove",e=>{
    if(!active)return
    const t=e.touches&&e.touches[0];if(!t)return
    e.preventDefault();e.stopPropagation()
    const dx=t.clientX-startX,dy=t.clientY-startY
    if(Math.max(Math.abs(dx),Math.abs(dy))>=8){moved=true;cancelHold()}
  },{passive:false})
  pad.addEventListener("touchend",e=>{
    if(!active)return
    const t=e.changedTouches&&e.changedTouches[0]
    e.preventDefault();e.stopPropagation();cancelHold();active=false
    if(!t||longPressed)return
    const swipe=moved?swipeAction(t.clientX-startX,t.clientY-startY):null
    if(swipe){
      gestureSuppressUntil=Date.now()+900
      const badge=document.getElementById("modeBadge"),spec=meta(swipe)
      if(badge)badge.textContent=(spec?spec.icon:"")+" スワイプ"
      nativeAction("tvCursor",swipe,spec?spec.label:swipe)
      return
    }
    if(startButton){gestureSuppressUntil=0;startButton.click()}
  },{passive:false})
  pad.addEventListener("touchcancel",()=>{active=false;moved=false;longPressed=false;startButton=null;cancelHold()},{passive:true})
}
function modeLabel(){return mode==="media"?"動画":mode==="hybrid"?"動画＋操作":"カーソル"}
function renderTV(){const root=document.getElementById("tvGrid");root.innerHTML="";layout.forEach((action,index)=>root.appendChild(makeTVKey(action,index)));document.getElementById("modeBadge").textContent=modeLabel();installCenterSwipePad();requestAnimationFrame(updateCenterSwipePad)}
function setMode(value){if(!["navigation","hybrid","media"].includes(value))return;if(mode!==value){mode=value;renderTV()}else{document.getElementById("modeBadge").textContent=modeLabel();requestAnimationFrame(updateCenterSwipePad)}}
function renderConfig(){
  const grid=document.getElementById("configGrid"),palette=document.getElementById("palette")
  if(!grid||!palette)return
  grid.innerHTML=""
  layout.forEach((action,index)=>{
    const item=meta(action),b=document.createElement("button")
    b.className="config-slot"+(index===selectedSlot?" selected":"")
    b.innerHTML='<span class="picon">'+item.icon+'</span><span class="plabel">'+item.label+'</span>'
    b.onclick=e=>{
      e.preventDefault()
      if(selectedSlot===null){selectedSlot=index;renderConfig();return}
      if(selectedSlot===index){selectedSlot=null;renderConfig();return}
      const temporary=layout[selectedSlot]
      layout[selectedSlot]=layout[index]
      layout[index]=temporary
      selectedSlot=null
      saveLayout();renderTV();renderConfig()
    }
    grid.appendChild(b)
  })
  palette.innerHTML=""
  ACTIONS.forEach(item=>{
    const b=document.createElement("button")
    b.className="palette-key"+(layout.includes(item.action)?" used":"")
    b.disabled=selectedSlot===null
    b.innerHTML='<span class="picon">'+item.icon+'</span><span class="plabel">'+item.label+"</span>"
    b.onclick=e=>{
      e.preventDefault();if(selectedSlot===null)return
      const current=layout[selectedSlot],other=layout.indexOf(item.action)
      if(other>=0&&other!==selectedSlot)layout[other]=current
      layout[selectedSlot]=item.action
      selectedSlot=null
      saveLayout();renderTV();renderConfig()
    }
    palette.appendChild(b)
  })
}
function openLayoutEditor(e){if(e){e.preventDefault();e.stopPropagation()}selectedSlot=null;document.getElementById("configLayer").classList.add("open");updateCenterSwipePad();renderConfig()}
function closeLayoutEditor(e){if(e){e.preventDefault();e.stopPropagation()}selectedSlot=null;document.getElementById("configLayer").classList.remove("open");renderTV()}
function resetLayout(e){if(e){e.preventDefault();e.stopPropagation()}layout=DEFAULT.slice();selectedSlot=null;saveLayout();renderTV();renderConfig()}
function setACState(s){const el=document.getElementById("acTemp");if(!el)return;if(!s){el.textContent="--°";return}el.textContent=s.dry?"—":(Number.isFinite(Number(s.temp))?Math.round(Number(s.temp))+"°":"--°")}
function nativeResult(result){if(result&&result.mode)setMode(result.mode);if(result&&Object.prototype.hasOwnProperty.call(result,"ac"))setACState(result.ac)}
function requestMode(){nativeAction("system","refreshMode","")}function requestAC(){nativeAction("system","refreshAC","")}
function sendMenu(e){e.preventDefault();e.stopPropagation();nativeAction("tv","menu","MENU")}function sendOther(e,device,action,label){e.preventDefault();e.stopPropagation();nativeAction(device,action,label)}function openRemote(device){window.location.href=REMOTES[device]}
renderTV();requestMode();requestAC();pollTimer=setInterval(requestMode,1600);acTimer=setInterval(requestAC,30000);window.addEventListener("resize",()=>requestAnimationFrame(updateCenterSwipePad));window.addEventListener("beforeunload",()=>{if(pollTimer)clearInterval(pollTimer);if(acTimer)clearInterval(acTimer)})
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
async function sonyAction(action,trackMode=true){await discoverSony();if(trackMode)noteAction(action);let code=null;if(action==="quick"&&Keychain.contains(STORAGE.quick)){const saved=String(Keychain.get(STORAGE.quick)).toLowerCase();if(commandIndex.has(saved))code=commandIndex.get(saved)}for(const alias of ALIASES[action]||[]){if(!code&&commandIndex.has(alias.toLowerCase()))code=commandIndex.get(alias.toLowerCase())}if(!code)throw new Error("BRAVIA未対応："+action);const r=new Request("http://"+sonyHost()+"/sony/ircc");r.method="POST";r.headers={"Content-Type":"text/xml; charset=UTF-8","X-Auth-PSK":sonyPSK(),SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'};r.body='<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+xmlEscape(code)+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>';await r.loadString()}
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
async function processQueue(){if(running)return;running=true;while(queue.length){const item=queue.shift();let result;try{if(item.device==="system"&&item.action==="refreshMode")result={ok:true,mode:await inferMode()};else if(item.device==="system"&&item.action==="refreshAC")result={ok:true,ac:await readACSummary()};else if(item.device==="tvCursor"){await sonyAction(item.action,false);result={ok:true,label:item.label,action:item.action,mode:await inferMode()}}else if(item.device==="tvAdaptive"){const currentMode=await inferMode();let action=item.action;if(currentMode==="navigation"&&CROSS_NAV[item.slot])action=CROSS_NAV[item.slot];else if(currentMode==="hybrid"&&HYBRID_CURSOR_ROLES.has(item.slot))action=CROSS_NAV[item.slot];await sonyAction(action);result={ok:true,label:item.label,action,mode:await inferMode()}}else if(item.device==="tvOriginal"){await sonyAction(item.action,false);result={ok:true,label:item.label,action:item.action,mode:await inferMode()}}else if(item.device==="tv"){await sonyAction(item.action);result={ok:true,label:item.label,mode:await inferMode()}}else if(item.device==="light"){await runExisting(CONFIG.light.actionScript,item.action);result={ok:true,label:item.label}}else if(item.device==="ac"){await runExisting(CONFIG.ac.actionScript,item.action);result={ok:true,label:item.label,ac:await readACSummary()}}else throw new Error("不明なデバイスです")}catch(error){result={ok:false,message:error&&error.message?error.message:String(error)}}try{await web.evaluateJavaScript("nativeResult("+JSON.stringify(result)+")")}catch(_){}}running=false}
web=new WebView();web.shouldAllowRequest=request=>{const url=String(request.url||"");if(!url.startsWith("https://yos-remote.local/__action?"))return true;const query=parseQuery(url);queue.push({device:query.device,action:query.action,label:query.label,slot:query.slot});processQueue();return false}
await web.loadHTML(html,"https://yos-remote.local/");try{await web.evaluateJavaScript("setMode("+JSON.stringify(await inferMode())+")")}catch(_){}try{await web.evaluateJavaScript("setACState("+JSON.stringify(await readACSummary())+")")}catch(_){}await web.present(true);Script.complete()
