// YOS BRAVIA Remote — automatic navigation/media mode with physical D-pad.

const STORAGE = Object.freeze({
  host: "yos.bravia.scriptable.host",
  psk: "yos.bravia.scriptable.psk",
  quick: "yos.bravia.scriptable.quick-command",
  mode: "yos.bravia.scriptable.auto-mode-v1"
})

const ALIASES = Object.freeze({
  power: ["poweroff", "power"],
  input: ["input"],
  home: ["home"],
  quick: ["quick", "options", "actionmenu", "settings"],
  menu: ["actionmenu", "options", "androidmenu"],
  back: ["return", "back"],
  up: ["up"],
  down: ["down"],
  left: ["left"],
  right: ["right"],
  confirm: ["confirm", "enter"],
  volumeDown: ["volumedown"],
  mute: ["mute"],
  volumeUp: ["volumeup"],
  channelDown: ["channeldown"],
  channelUp: ["channelup"],
  rewind: ["rewind", "backward"],
  play: ["play"],
  fastForward: ["forward", "fastforward"],
  pause: ["pause"],
  stop: ["stop"],
  prev: ["prev"],
  next: ["next"]
})

const NAV_ACTIONS = new Set([
  "input", "home", "quick", "menu", "back",
  "up", "down", "left", "right", "confirm"
])
const MEDIA_ACTIONS = new Set([
  "play", "pause", "stop", "rewind", "fastForward", "prev", "next"
])
const NAVIGATION_GRACE_MS = 10000

function secure(key) {
  return Keychain.contains(key) ? Keychain.get(key) : ""
}

function normalizeHost(value) {
  const host = String(value || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/:\d+$/, "")
  if (!host || /[\s/?#]/.test(host)) {
    throw new Error("テレビのIPアドレスまたはホスト名を確認してください。")
  }
  return host
}

let host = secure(STORAGE.host)
let psk = secure(STORAGE.psk)
let commandIndex = new Map()

function loadMode() {
  try {
    if (Keychain.contains(STORAGE.mode)) {
      const value = JSON.parse(Keychain.get(STORAGE.mode))
      if (value && (value.mode === "navigation" || value.mode === "media")) {
        return value
      }
    }
  } catch (_) {}
  return { mode: "navigation", navigationUntil: 0 }
}

let modeState = loadMode()

function rememberMode(mode, action) {
  const now = Date.now()
  modeState = {
    mode,
    navigationUntil: mode === "navigation" ? now + NAVIGATION_GRACE_MS : 0,
    lastAction: action || "",
    updatedAt: now
  }
  Keychain.set(STORAGE.mode, JSON.stringify(modeState))
}

function noteAction(action) {
  if (NAV_ACTIONS.has(action)) rememberMode("navigation", action)
  else if (MEDIA_ACTIONS.has(action)) rememberMode("media", action)
}

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

async function configure() {
  const alert = new Alert()
  alert.title = "BRAVIA接続設定"
  alert.addTextField("テレビのIPまたはホスト名", host)
  alert.addSecureTextField(psk ? "PSK（変更しないなら空欄）" : "PSK", "")
  alert.addAction("保存")
  alert.addCancelAction("キャンセル")
  if (await alert.presentAlert() < 0) return false

  host = normalizeHost(alert.textFieldValue(0))
  psk = alert.textFieldValue(1).trim() || psk
  if (!psk) throw new Error("PSKを入力してください。")
  Keychain.set(STORAGE.host, host)
  Keychain.set(STORAGE.psk, psk)
  return true
}

async function ensureConfigured() {
  if (host && psk) {
    host = normalizeHost(host)
    return true
  }
  return configure()
}

async function sonyJSON(service, method) {
  const request = new Request("http://" + host + "/sony/" + service)
  request.method = "POST"
  request.headers = {
    "Content-Type": "application/json",
    "X-Auth-PSK": psk
  }
  request.body = JSON.stringify({
    method,
    params: [],
    id: 1,
    version: "1.0"
  })
  return JSON.parse(await request.loadString())
}

async function discover() {
  const data = await sonyJSON("system", "getRemoteControllerInfo")
  const commands = data && data.result && data.result[1]
  if (!Array.isArray(commands)) throw new Error("BRAVIAコマンド取得失敗")
  commandIndex = new Map()
  commands.forEach(item => {
    if (item && item.name && item.value) {
      commandIndex.set(String(item.name).toLowerCase(), String(item.value))
    }
  })
}

function resolve(action) {
  const aliases = ALIASES[action] || []
  if (action === "quick" && Keychain.contains(STORAGE.quick)) {
    const saved = String(Keychain.get(STORAGE.quick)).toLowerCase()
    if (commandIndex.has(saved)) return commandIndex.get(saved)
  }
  for (const alias of aliases) {
    if (commandIndex.has(alias.toLowerCase())) {
      return commandIndex.get(alias.toLowerCase())
    }
  }
  return null
}

async function send(action) {
  const code = resolve(action)
  if (!code) throw new Error("このテレビでは未対応です：" + action)

  noteAction(action)
  const request = new Request("http://" + host + "/sony/ircc")
  request.method = "POST"
  request.headers = {
    "Content-Type": "text/xml; charset=UTF-8",
    "X-Auth-PSK": psk,
    SOAPACTION: '"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'
  }
  request.body =
    '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">' +
    "<IRCCCode>" + xmlEscape(code) + "</IRCCCode>" +
    "</u:X_SendIRCC></s:Body></s:Envelope>"
  await request.loadString()
}

function hasNavigationStatus(data) {
  const list = data && data.result && data.result[0]
  if (!Array.isArray(list)) return false
  return list.some(item => item && ["cursorDisplay", "textInput", "webBrowse"].some(key => {
    const value = item[key]
    return value === true || value === "true" ||
      value === "active" || value === "available"
  }))
}

function hasPlaybackInfo(data) {
  const info = data && data.result && data.result[0]
  return Boolean(
    info && typeof info === "object" &&
    (info.uri || info.source || info.title || info.programTitle)
  )
}

async function inferMode() {
  if (Date.now() < Number(modeState.navigationUntil || 0)) {
    return modeState.mode
  }

  try {
    if (hasNavigationStatus(
      await sonyJSON("appControl", "getApplicationStatusList")
    )) {
      rememberMode("navigation", "status")
      return modeState.mode
    }
  } catch (_) {}

  try {
    if (hasPlaybackInfo(
      await sonyJSON("avContent", "getPlayingContentInfo")
    )) {
      rememberMode("media", "status")
      return modeState.mode
    }
  } catch (_) {}

  return modeState.mode
}

async function showError(error) {
  const alert = new Alert()
  alert.title = "BRAVIA"
  alert.message = error && error.message ? error.message : String(error)
  alert.addAction("OK")
  await alert.presentAlert()
}

if (!await ensureConfigured()) {
  Script.complete()
  return
}

try {
  await discover()
} catch (error) {
  await showError(error)
  Script.complete()
  return
}

const initialMode = await inferMode()
const support = Object.fromEntries(
  Object.keys(ALIASES).map(action => [action, Boolean(resolve(action))])
)
const state = JSON.stringify({
  mode: initialMode,
  support
}).replace(/</g, "\\u003c")

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}
body{overscroll-behavior:none}
main{height:100dvh;padding:68px 10px max(10px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:10px;overflow:hidden}
header{display:flex;align-items:center;justify-content:space-between}
h1{margin:0;font-size:24px}
.status{color:#8e8e93;font-size:11px}
.top,.media,.bottom{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
button{min-width:0;height:58px;border:1px solid #303238;border-radius:17px;background:linear-gradient(145deg,#1c1e22,#111315);color:#0a84ff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif;font-size:14px;font-weight:750;font-variant-emoji:text;touch-action:manipulation}
button:active{transform:scale(.97);background:#272a30}
button:disabled{opacity:.25}
.power{color:#ff453a}
.mode{flex:1;min-height:0;display:flex;align-items:center;justify-content:center}
.dpad{width:min(260px,80vw);height:min(250px,34dvh);display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:8px}
.dpad button{height:auto}
.up{grid-column:2}
.left{grid-column:1;grid-row:2}
.ok{grid-column:2;grid-row:2;border-radius:50%;background:#24384f;color:#fff}
.right{grid-column:3;grid-row:2}
.down{grid-column:2;grid-row:3}
.media{width:100%}
.media button{height:68px}
@media(max-height:700px){
  main{padding-top:54px;gap:6px}
  button{height:46px}
  .dpad{height:min(180px,30dvh)}
  .media button{height:50px}
}
</style>
</head>
<body>
<main>
<header><h1>BRAVIA</h1><span class="status">自動モード</span></header>
<div id="top" class="top"></div>
<div id="mode" class="mode"></div>
<div id="bottom" class="bottom"></div>
</main>
<script>
const STATE=${state}
const NAV=new Set(["input","home","quick","menu","back","up","down","left","right","confirm"])
const MEDIA=new Set(["play","pause","stop","rewind","fastForward","prev","next"])
let mode=STATE.mode

// Same monochrome symbol set as MY REMOTE Hub.
const definitions={
  power:["⏻","電源","power"],input:["↪︎","入力"],home:["⌂","ホーム"],
  quick:["⚙︎","クイック"],menu:["≡","MENU"],back:["‹","戻る"],
  up:["↑","上"],down:["↓","下"],left:["←","左"],right:["→","右"],
  confirm:["○","OK"],volumeDown:["−","音量−"],mute:["⊘","ミュート"],
  volumeUp:["＋","音量＋"],channelDown:["↓","CH−"],channelUp:["↑","CH＋"],
  rewind:["≪","巻き戻し"],play:["▷","再生"],fastForward:["≫","早送り"],
  pause:["Ⅱ","一時停止"],stop:["□","停止"],prev:["|‹","前"],next:["›|","次"]
}

function invoke(action){
  if(NAV.has(action))mode="navigation"
  else if(MEDIA.has(action))mode="media"
  renderMode()
  const frame=document.createElement("iframe")
  frame.style.display="none"
  frame.src="yosbravia://action?name="+encodeURIComponent(action)+"&_="+Date.now()
  document.body.appendChild(frame)
  setTimeout(()=>frame.remove(),1000)
}

function button(action,extra=""){
  const spec=definitions[action]
  const element=document.createElement("button")
  element.className=extra+(action==="power"?" power":"")
  element.textContent=spec[0]+" "+spec[1]
  element.disabled=!STATE.support[action]
  element.onclick=()=>invoke(action)
  return element
}

function renderList(id,actions){
  const root=document.getElementById(id)
  root.innerHTML=""
  actions.forEach(action=>root.appendChild(button(action)))
}

function renderMode(){
  const root=document.getElementById("mode")
  root.innerHTML=""
  if(mode==="media"){
    const media=document.createElement("div")
    media.className="media"
    ;["prev","play","next","rewind","pause","fastForward","stop"].forEach(
      action=>media.appendChild(button(action))
    )
    root.appendChild(media)
    return
  }
  const pad=document.createElement("div")
  pad.className="dpad"
  ;[
    ["up","up"],["left","left"],["confirm","ok"],
    ["right","right"],["down","down"]
  ].forEach(item=>pad.appendChild(button(item[0],item[1])))
  root.appendChild(pad)
}

renderList("top",["input","home","quick","menu","back","power"])
renderList("bottom",["volumeDown","mute","volumeUp","channelDown","pause","channelUp"])
renderMode()
</script>
</body>
</html>`

function parseURL(url) {
  const match = String(url || "").match(/^yosbravia:\/\/([^?]+)(?:\?(.*))?$/i)
  if (!match) return null
  const params = {}
  String(match[2] || "").split("&").forEach(pair => {
    if (!pair) return
    const position = pair.indexOf("=")
    const key = position >= 0 ? pair.slice(0, position) : pair
    const value = position >= 0 ? pair.slice(position + 1) : ""
    params[decodeURIComponent(key)] = decodeURIComponent(value)
  })
  return { path: match[1], params }
}

let queue = Promise.resolve()
const web = new WebView()

web.shouldAllowRequest = request => {
  const event = parseURL(request && request.url)
  if (!event) return true
  if (event.path === "action") {
    queue = queue
      .then(() => send(event.params.name))
      .catch(showError)
  }
  return false
}

await web.loadHTML(html)
await web.present(true)
await queue
Script.complete()
