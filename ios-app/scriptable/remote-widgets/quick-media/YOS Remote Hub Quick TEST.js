// YOS Remote Hub v6.6 + BRAVIA picture integration + quick AV controls (ISOLATED TEST, NO ACTIVE UPDATE)
// YOS Remote Hub v6.6 — tap-first adaptive cross + reliable center gesture + top quick actions + user layout editor.
// Reliability rule: a center tap must always win over gesture convenience.
// Navigation: Above/Left/Play/Right/Below => Up/Left/OK/Right/Down.
// Playback: every slot keeps the user's configured button.
// Hybrid: Above/Below => Up/Down; Left/Play/Right keep configured media actions.
// Center swipe is handled directly by the real center button; no transparent overlay can swallow OK taps.
// Top safe-frame space is used for fixed Input/Home quick actions.
// Light brightness: tap stays one step; sustained hold uses two IR commands per round trip after the first step.

const CONFIG = {
  tv: { remoteScript: "YOS BRAVIA Remote" },
  light: { remoteScript: "YOS Light Remote", actionScript: "YOS Light Widget" },
  floor: { key: "yos.tapo.floor.local-host" },
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
const TOP_TV_ACTIONS = ["input","home"]
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
  quick:["quick","options","actionmenu","settings"], pictureOff:["pictureoff","picoff"], menu:["actionmenu","options","androidmenu"],
  broadcast:["dtv","digital","tv","tvinput"],
  back:["return","back"], up:["up"], down:["down"], left:["left"], right:["right"], confirm:["confirm","enter"],
  volumeDown:["volumedown"], volumeUp:["volumeup"], mute:["mute"], channelDown:["channeldown"], channelUp:["channelup"],
  play:["play"], pause:["pause"], stop:["stop"], prev:["prev"], next:["next"], rewind:["rewind","backward"], fastForward:["forward","fastforward"]
}
const NAV_ACTIONS = new Set(["input","home","quick","menu","back","up","down","left","right","confirm"])
const MEDIA_ACTIONS = new Set(["play","pause","stop","rewind","fastForward","prev","next"])
const HYBRID_KEEP_ACTIONS = new Set(["up","down","rewind","fastForward","prev","next"])
const NAVIGATION_GRACE_MS = 2200
const RECENT_MEDIA_MS = 120000
const SWIPE_THRESHOLD = 24
const TV_SEEK_ACTIONS = new Set(["rewind","fastForward"])

function assertHubIntegrity(){
  const actionNames=new Set(TV_ACTIONS.map(item=>item.action))
  const required=[...TV_DEFAULT,...TOP_TV_ACTIONS,"confirm","up","down","left","right"]
  for(const action of required)if(!actionNames.has(action))throw new Error("Remote Hub action定義不足: "+action)
  if(TV_DEFAULT.filter(action=>action==="play").length!==1)throw new Error("再生ボタンは12枠に1つ必要です")
  if(CROSS_NAV.center!=="confirm")throw new Error("中央キーはconfirm固定です")
  if(!(ALIASES.confirm||[]).some(x=>["confirm","enter"].includes(String(x).toLowerCase())))throw new Error("BRAVIA confirm alias不足")
}
assertHubIntegrity()

function runURL(name){ return "scriptable:///run?scriptName=" + encodeURIComponent(name) }
const REMOTES = { tv:runURL(CONFIG.tv.remoteScript), light:runURL(CONFIG.light.remoteScript), ac:runURL(CONFIG.ac.remoteScript) }
function makeButtons(device, items){
  return items.map(([action,icon,label]) => {
    if(device==="light"&&(action==="bright"||action==="dark")){
      return `<button class="key light-hold-key" data-light-hold="${action}" data-light-label="${label}"><span class="icon">${icon}</span><span class="label">${label}</span></button>`
    }
    const labelId=device==="ac"&&action==="fan"?' id="acFanLabel"':""
    return `<button class="key" onclick="sendOther(event,'${device}','${action}','${label}')"><span class="icon">${icon}</span><span class="label"${labelId}>${label}</span></button>`
  }).join("")
}

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif}
body{padding:0 8px}
.device-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin:0 2px 4px;flex:0 0 54px}
.device-tab{border:1px solid #343944;border-radius:15px;background:#15181c;color:#8995a5;font-weight:750;font-size:11px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}
.device-tab .tab-icon{font-size:20px;line-height:1.1;color:#438eff}
.device-tab.active{background:#24384f;border-color:#548deb;color:white}
.remote-panel{display:none;min-height:0}
.remote-panel.active{display:block}
.tv-card:before{display:none}.tv-card .top-shortcuts{position:relative;top:auto;left:auto;right:auto;height:32px;margin-bottom:8px}
.floor-card{padding:13px}
.floor-power{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0}
.floor-power button,.floor-temp button{border:1px solid #373d48;border-radius:14px;background:#1b1f24;color:white;min-height:49px;font-weight:750;font-size:13px}
.floor-power button:active,.floor-temp button:active{background:#274265}
.floor-heading{font-size:13px;font-weight:800;margin:17px 2px 9px;color:#c0c7d0}
.floor-presets{display:flex;justify-content:space-between;gap:7px}
.floor-swatch{width:43px;height:43px;min-width:0;border-radius:100%;border:2px solid #50545c;box-shadow:0 2px 10px #0005}
.floor-slider{width:100%;height:36px;accent-color:#438eff;touch-action:pan-x}
.floor-temp{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.floor-rainbow{appearance:none;-webkit-appearance:none;width:100%;height:56px;border-radius:18px;border:0;background:linear-gradient(90deg,#f44,#ff0,#0f0,#0ff,#00f,#f0f,#f44);margin-top:4px;touch-action:pan-x}
.floor-rainbow::-webkit-slider-thumb{appearance:none;-webkit-appearance:none;width:24px;height:66px;background:#ffffff80;border:2px solid #fff;border-radius:12px;box-shadow:0 0 6px #0008}
.floor-footnote{font-size:11px;line-height:1.5;color:#8995a5;margin:16px 0}
.floor-state{font-size:11px;color:#a9b5c5;min-height:18px}
.floor-card .tool{height:33px}

.page{width:100%;max-width:500px;height:100dvh;margin:0 auto;padding:max(58px,calc(env(safe-area-inset-top) + 4px)) 0 max(8px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:6px;overflow:hidden}
.card{margin:0;padding:8px 10px 9px;border:1px solid #45484e;border-radius:22px;background:linear-gradient(155deg,#101215,#050506)}
.tv-card{position:relative}
.tv-card:before{content:"";position:absolute;left:20%;right:20%;top:-35px;height:36px;border:1px solid #45484e;border-bottom:0;border-radius:22px 22px 0 0;background:linear-gradient(155deg,#101215,#050506);pointer-events:none}
.top-shortcuts{position:absolute;z-index:3;left:24%;right:24%;top:-31px;height:27px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
.top-shortcut{min-width:0;border:1px solid #353941;border-radius:9px;background:#15171b;color:#438eff;font-size:10px;font-weight:800;touch-action:manipulation}
.top-shortcut:active{transform:scale(.97);background:#25282d}
.head{height:28px;display:flex;align-items:center;justify-content:space-between;margin-bottom:6px}
.title{display:inline-flex;align-items:center;gap:6px;padding:2px 3px 2px 0;font-size:18px;font-weight:800;touch-action:manipulation}
.title:after{content:"›";font-size:19px;color:#5b8fdc}
.tools,.ac-meta{display:flex;align-items:center;gap:5px}
.mode-badge{font-size:9px;font-weight:700;color:#8e8e93;min-width:44px;text-align:right}
.tool{height:28px;padding:0 8px;border:1px solid #353941;border-radius:10px;background:#15171b;color:#438eff;font-size:11px;font-weight:750}
.grid{display:grid;gap:6px}.grid-3{grid-template-columns:repeat(3,1fr)}.grid-4{grid-template-columns:repeat(4,1fr)}
.key{position:relative;min-width:0;height:62px;padding:7px;border:1px solid #26292f;border-radius:18px;background:linear-gradient(145deg,#1c1e22,#15171a);color:#fff;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;gap:4px;touch-action:manipulation;-webkit-touch-callout:none;user-select:none}
.key.gesture-center,.key.light-hold-key{touch-action:none}.key.gesture-center{z-index:2}
.key:active,.key.holding{transform:scale(.97);background:#25282d}.key.adaptive{border-color:#343942}.key.ok{background:#24384f}
.icon{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif;font-size:23px;font-weight:500;line-height:1;color:#438eff;font-variant-emoji:text}
.label{font-size:11px;font-weight:700;white-space:nowrap}.alt-label{position:absolute;right:7px;bottom:5px;font-size:7px;font-weight:700;color:#777b83;line-height:1;white-space:nowrap}.brand{font-size:10px;color:#8d8f95}.ac-temp{font-size:17px;font-weight:800;color:#fff;min-width:34px;text-align:right}
.picture-quick{display:grid;grid-template-columns:1.35fr 1.25fr 0.8fr;gap:5px;margin-top:6px}
.picture-quick button{min-height:31px;border:1px solid #41464d;border-radius:10px;background:#181b21;color:#fff;font-size:11px;font-weight:650}
.quick-modes{display:flex;gap:5px;overflow-x:auto;margin-top:5px;min-height:29px;scrollbar-width:none}
.quick-modes button,.quick-action{padding:8px 9px;min-height:32px;white-space:nowrap;border-radius:10px;border:1px solid #414b58;background:#1d2631;color:#e4ecfa;font-size:11px;font-weight:650}
.quick-modes button.selected,.quick-action.selected{background:#305a88;border-color:#82b4ed}
.quick-modes button:disabled,.quick-action:disabled{opacity:.35}
.quick-buttons{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;padding:8px 0}
.quick-action{white-space:normal;min-height:45px;text-align:center;font-size:13px}
.quick-info{font-size:12px;color:#a1afc2;line-height:1.6}
.quick-section{border-top:1px solid #313740;margin-top:10px;padding-top:10px}
.quick-section h3{font-size:14px;margin:0 0 8px;color:#c4d6ef}
.pic-section{padding:10px 0 2px;border-top:1px solid #2e3138}
.pic-section h3{font-size:13px;letter-spacing:.02em;margin:0 0 8px;color:#bdc5d0}
.pic-item{padding:9px 0;border-top:1px solid #25282d;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px}
.pic-name{font-size:13px;min-width:110px;flex:1;color:#e4e8ee}
.pic-manual{color:#747c87;font-size:11px}
.pic-slider-wrap{display:flex;align-items:center;gap:8px;width:100%}
.pic-slider-wrap input[type=range]{width:100%;height:30px;accent-color:#6b9fff;flex:1}
.pic-slider-wrap output{min-width:44px;text-align:right;font-size:13px;color:#a5c2ff}
.pic-enum{min-width:145px;max-width:200px;padding:9px 6px;background:#202832;border:1px solid #414854;border-radius:10px;color:#eef1f7}
.pic-preset{display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:7px;padding:10px 0;border-top:1px solid #2e3138}
.pic-preset button{border:1px solid #464d58;color:#fff;background:#151c26;border-radius:10px;padding:10px 11px}
.pic-preset button:disabled{opacity:.35}
.pic-status{font-size:12px;line-height:1.6;color:#9db0c7;white-space:pre-line;padding:10px;background:#121924;border-radius:10px;margin:10px 0}
.pic-big-bar{width:100%;height:52px;accent-color:#7aa5ff}
.config-layer{display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.94);padding:max(58px,calc(env(safe-area-inset-top) + 4px)) 10px max(12px,env(safe-area-inset-bottom));overflow:auto}
.config-layer.open{display:block}
.config-card{width:100%;max-width:500px;margin:0 auto;padding:12px;border:1px solid #45484e;border-radius:22px;background:#0d0f12}
.config-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}.config-title{font-size:20px;font-weight:800}.config-actions{display:flex;gap:6px}
.config-help{font-size:11px;line-height:1.4;color:#a4a6ab;margin:0 0 10px}
.config-grid,.palette{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.config-grid{margin-bottom:12px}
.config-slot,.palette-key{height:54px;border:1px solid #2d3137;border-radius:15px;background:#17191d;color:#fff;display:flex;align-items:center;justify-content:center;gap:5px;font-weight:700;font-size:11px}
.config-slot.selected{border-color:#438eff;background:#24384f}.palette-key.used{opacity:.45}.palette-key:disabled{opacity:.25}.palette-key .picon{font-size:18px;color:#438eff}.palette-key .plabel{font-size:10px}
.section-label{font-size:11px;font-weight:800;color:#8e8e93;margin:4px 0 7px}
@media(max-height:800px){.page{padding-top:max(52px,calc(env(safe-area-inset-top) + 2px));gap:4px}.tv-card:before{top:-29px;height:30px}.top-shortcuts{top:-26px;height:23px}.card{padding:6px 8px 7px}.head{height:24px;margin-bottom:4px}.title{font-size:17px}.grid{gap:5px}}
</style></head><body><div class="page"><nav class="device-tabs" aria-label="リモコン切り替え"><button class="device-tab active" data-tab="tv" onclick="setPanel('tv')"><span class="tab-icon">▣</span>テレビ</button><button class="device-tab" data-tab="light" onclick="setPanel('light')"><span class="tab-icon">☀</span>照明</button><button class="device-tab" data-tab="ac" onclick="setPanel('ac')"><span class="tab-icon">❄</span>エアコン</button><button class="device-tab" data-tab="floor" onclick="setPanel('floor')"><span class="tab-icon">◉</span>ランプ</button></nav>
<section class="card tv-card remote-panel active" data-panel="tv"><div class="top-shortcuts"><button class="top-shortcut" onclick="sendTVShortcut(event,'input','入力')">↪︎ 入力</button><button class="top-shortcut" onclick="sendTVShortcut(event,'home','ホーム')">⌂ ホーム</button></div><div class="head"><div class="title" onclick="openRemote('tv')">BRAVIA</div><div class="tools"><span id="modeBadge" class="mode-badge">判定中</span><button class="tool" onclick="openPictureEditor(event)">画質</button><button class="tool" onclick="openLayoutEditor(event)">配置</button><button class="tool" onclick="sendMenu(event)">MENU</button></div></div><div id="tvGrid" class="grid grid-3"></div>
<div class="picture-quick">
  <button onclick="openQuickEditor(event)">⚡ メディア</button>
  <button onclick="openBrightnessBar(event)">☀ 明るさバー</button>
  <button onclick="openShortcuts(event)">☆ 保存画質</button>
</div>
<div id="quickPictureModes" class="quick-modes" aria-label="画質モード切替"><span class="pic-manual">画質モードを確認中…</span></div></section>
<section class="card remote-panel" data-panel="light"><div class="head"><div class="title" onclick="openRemote('light')">照明</div><div class="brand">Panasonic</div></div><div class="grid grid-3">${makeButtons("light", LIGHT_BUTTONS)}</div></section>
<section class="card remote-panel" data-panel="ac"><div class="head"><div class="title" onclick="openRemote('ac')">エアコン</div><div class="ac-meta"><span id="acTemp" class="ac-temp">--°</span><span class="brand">SHARP</span></div></div><div class="grid grid-4">${makeButtons("ac", AC_BUTTONS)}</div></section>
<section class="card floor-card remote-panel" data-panel="floor">
<div class="head"><div class="title">フロアランプ</div><div class="tools"><span class="brand">Tapo / Matter</span><button class="tool" onclick="nativeAction('floor','configure','設定')">接続設定</button></div></div>
<div id="floorStatus" class="floor-state">接続を確認してください</div>
<div class="floor-power"><button onclick="sendFloor('on')">⏻　点灯</button><button onclick="sendFloor('off')">○　消灯</button></div>
<div class="floor-heading">カラープリセット</div>
<div class="floor-presets">
<button class="floor-swatch" aria-label="電球色" style="background:#ffd4a4" onclick="sendFloor('temp',2700)"></button>
<button class="floor-swatch" aria-label="青" style="background:#243bff" onclick="sendFloor('color',240)"></button>
<button class="floor-swatch" aria-label="赤" style="background:#ff2525" onclick="sendFloor('color',0)"></button>
<button class="floor-swatch" aria-label="緑" style="background:#00dd38" onclick="sendFloor('color',125)"></button>
<button class="floor-swatch" aria-label="紫" style="background:#ab30ff" onclick="sendFloor('color',275)"></button>
<button class="floor-swatch" aria-label="黄" style="background:#fff04c" onclick="sendFloor('color',53)"></button>
</div>
<div class="floor-heading">明るさ <span id="floorBrightnessLabel">--%</span></div>
<input id="floorBrightness" class="floor-slider" type="range" min="1" max="100" value="50" aria-label="明るさ" oninput="document.getElementById('floorBrightnessLabel').textContent=this.value+'%'" onchange="sendFloor('brightness',this.value)">
<div class="floor-heading">白色・色温度</div>
<div class="floor-temp"><button onclick="sendFloor('temp',2500)">暖色</button><button onclick="sendFloor('temp',3500)">自然色</button><button onclick="sendFloor('temp',5000)">昼白色</button><button onclick="sendFloor('temp',6500)">昼光色</button></div>
<div class="floor-heading">カラー <span id="floorHueLabel"></span></div>
<input id="floorHue" class="floor-rainbow" type="range" min="0" max="359" value="0" aria-label="色相" onchange="sendFloor('color',this.value)">
<p class="floor-footnote">色・調光は自宅Wi-Fiで直接操作。エフェクト・自動バイオリズムはTapoアプリで設定してください。Matter対応だけではScriptableへの直接接続はできません。</p>
</section>
</div>
<div id="configLayer" class="config-layer"><div class="config-card"><div class="config-head"><div class="config-title">BRAVIA 配置</div><div class="config-actions"><button class="tool" onclick="resetLayout(event)">初期化</button><button class="tool" onclick="closeLayoutEditor(event)">完了</button></div></div><p class="config-help">12枠内は「移動元 → 移動先」で入れ替え。再生位置が自動カーソルの中心。中央キーはタップ最優先で決定、24px以上動かした時だけスワイプとして上下左右へ移動します。切替中の長押しは元機能です。</p><div class="section-label">表示中の12枠</div><div id="configGrid" class="config-grid"></div><div class="section-label">使えるBRAVIAボタン</div><div id="palette" class="palette"></div></div></div>
<div id="quickLayer" class="config-layer" role="dialog" aria-modal="true" aria-label="BRAVIAワンタップ操作"><div class="config-card">
  <div class="config-head"><div class="config-title">BRAVIA クイック操作</div><button class="tool" onclick="closeQuickEditor(event)">閉じる</button></div>
  <p class="quick-info">テレビから取得できた設定のみ直接変更。各操作は本人が押したときだけ送信します。</p>
  <div class="quick-section"><h3>画質モード・明るさ</h3>
    <div id="quickPictureModesPanel" class="quick-modes">画質モードを確認中</div>
    <div class="quick-buttons"><button class="quick-action" onclick="openBrightnessBar(event)">☀ 明るさバー</button><button class="quick-action" onclick="openPictureEditor(event)">⚙ 画質詳細</button></div>
  </div>
  <div class="quick-section"><h3>音質モード</h3><div id="quickSoundModes" class="quick-buttons">テレビの対応状況を確認中</div></div>
  <div class="quick-section"><h3>音声出力</h3><div id="quickAudioOutputs" class="quick-buttons">テレビの対応状況を確認中</div></div>
  <div class="quick-section"><h3>アプリ・放送・HDMI</h3><div id="quickApps" class="quick-buttons">アプリ一覧を取得中</div>
    <div class="quick-buttons">
      <button class="quick-action" onclick="nativeAction('quick','tv','テレビ放送')">テレビ放送</button>
      <button class="quick-action" onclick="nativeAction('quick','hdmi3','Fire TV HDMI3')">Fire TV（HDMI3）</button>
    </div>
    <p class="quick-info">DMM.comはHDMI3に切り替えてFire TV側で起動。Proton VPNもテレビ内のアプリを開きます。VPN接続・解除の直接操作はまだ非対応です。</p>
  </div>
  <p class="pic-status" id="quickStatus">接続と対応状況を確認中…</p>
  <button class="tool" onclick="probeQuickEditor(event)">テレビから再取得</button>
</div></div>
<div id="pictureLayer" class="config-layer" role="dialog" aria-modal="true" aria-label="BRAVIA画質設定"><div class="config-card">
  <div class="config-head"><div class="config-title">BRAVIA 画質設定</div><button class="tool" onclick="closePictureEditor(event)">閉じる</button></div>
  <p class="config-help">画質項目を一覧化。実際に変更できるものはテレビから取得した値と範囲を使用します。非対応項目はテレビ本体で設定してください。</p>
  <div id="pictureGroups"></div>
  <p id="pictureStatus" class="pic-status" aria-live="polite">未接続。画質の確認中です。</p>
  <button class="tool" onclick="probePictureScene(event)">現在の設定を再取得</button>
  <button class="tool" onclick="sendTVShortcut(event,'quick','クイック設定')">テレビのクイック設定</button>
</div></div>
<div id="brightLayer" class="config-layer" role="dialog" aria-modal="true" aria-label="BRAVIA明るさバー"><div class="config-card">
  <div class="config-head"><div class="config-title">明るさ</div><button class="tool" onclick="closeBrightnessBar(event)">閉じる</button></div>
  <p class="config-help">1本のバーを左右に動かして調整。指を離したときだけBRAVIAに送信します。</p>
  <input class="pic-big-bar" id="brightnessRange" type="range" disabled min="0" max="100" step="1" value="0" oninput="previewBrightness(event)" onchange="commitBrightness(event)">
  <p id="brightnessValue" class="pic-status" aria-live="polite">接続確認中</p>
  <button class="tool" onclick="probePictureScene(event)">現在の明るさを再取得</button>
</div></div>
<div id="shortcutsLayer" class="config-layer" role="dialog" aria-modal="true" aria-label="BRAVIA画質ショートカット"><div class="config-card">
  <div class="config-head"><div class="config-title">画質ショートカット</div><button class="tool" onclick="closeShortcuts(event)">閉じる</button></div>
  <p class="config-help">テレビで好きな画質に調整して「保存」。保存対象は今の映像入力でAPIから取得できた項目だけです。明るさが未取得なら保存・復元できません。YOSが数値を勝手に決めることはありません。</p>
  <div id="picturePresets"></div>
  <p id="shortcutsStatus" class="pic-status" aria-live="polite">設定を確認中</p>
  <button class="tool" onclick="probePictureScene(event)">登録状況を再取得</button>
</div></div>
<script>
const REMOTES=${JSON.stringify(REMOTES)},ACTIONS=${JSON.stringify(TV_ACTIONS)},DEFAULT=${JSON.stringify(TV_DEFAULT)},CROSS_NAV=${JSON.stringify(CROSS_NAV)},SWIPE_THRESHOLD=${SWIPE_THRESHOLD},TV_SEEK_ACTIONS=new Set(["rewind","fastForward"])
const LAYOUT_KEY="yos.remote.tv.buttons.v52"
let mode="navigation",nonce=0,pollTimer=null,acTimer=null,selectedSlot=null,gestureSuppressUntil=0
const PANEL_KEY="yos.remote.selected-panel.v1"
let activePanel="tv"
function setPanel(name){if(!["tv","light","ac","floor"].includes(name))return;stopActiveHolds();activePanel=name;document.querySelectorAll(".remote-panel").forEach(el=>el.classList.toggle("active",el.dataset.panel===name));document.querySelectorAll(".device-tab").forEach(el=>{const active=el.dataset.tab===name;el.classList.toggle("active",active);el.setAttribute("aria-selected",active?"true":"false")});try{localStorage.setItem(PANEL_KEY,name)}catch(_){}if(name==="floor")nativeAction("floor","refresh","状態取得")}
function sendFloor(action,value=""){nativeAction("floor",action,String(value))}
function stopActiveHolds(){nativeAction("tvHoldStop","","");nativeAction("lightHoldStop","","")}
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
  if(Math.max(Math.abs(dx),Math.abs(dy))<SWIPE_THRESHOLD)return null
  return Math.abs(dx)>Math.abs(dy)?(dx>0?"right":"left"):(dy>0?"down":"up")
}
function fireTVKey(baseAction,role,label){
  if(role)nativeAction("tvAdaptive",baseAction,label,role)
  else nativeAction("tv",baseAction,label)
}
function installCenterGesture(button,baseAction,role,label,baseLabel,overridden){
  if(!button||role!=="center"||mode==="media")return
  button.classList.add("gesture-center")
  let active=false,longPressed=false,startX=0,startY=0,holdTimer=null
  const cancelHold=()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null}}
  button.addEventListener("touchstart",e=>{
    const t=e.touches&&e.touches[0];if(!t)return
    active=true;longPressed=false;startX=t.clientX;startY=t.clientY
    cancelHold()
    if(overridden){
      holdTimer=setTimeout(()=>{
        holdTimer=null;longPressed=true;gestureSuppressUntil=Date.now()+900
        nativeAction("tvOriginal",baseAction,baseLabel)
      },550)
    }
  },{passive:true})
  button.addEventListener("touchmove",e=>{
    if(!active)return
    const t=e.touches&&e.touches[0];if(!t)return
    const dx=t.clientX-startX,dy=t.clientY-startY
    if(Math.max(Math.abs(dx),Math.abs(dy))>=SWIPE_THRESHOLD){cancelHold();e.preventDefault()}
  },{passive:false})
  button.addEventListener("touchend",e=>{
    if(!active)return
    active=false;cancelHold();e.preventDefault();e.stopPropagation()
    const t=e.changedTouches&&e.changedTouches[0]
    if(!t||longPressed)return
    const swipe=swipeAction(t.clientX-startX,t.clientY-startY)
    gestureSuppressUntil=Date.now()+500
    if(swipe){
      const badge=document.getElementById("modeBadge"),spec=meta(swipe)
      if(badge)badge.textContent=(spec?spec.icon:"")+" スワイプ"
      nativeAction("tvCursor",swipe,spec?spec.label:swipe)
      return
    }
    const badge=document.getElementById("modeBadge")
    if(badge)badge.textContent=mode==="navigation"?"○ 決定":"▷ 再生"
    fireTVKey(baseAction,role,label)
  },{passive:false})
  button.addEventListener("touchcancel",()=>{active=false;longPressed=false;cancelHold()},{passive:true})
}
function bindTVSeekHold(button,baseAction,role,label){
  let active=false,held=false,holdTimer=null,heartbeat=null,pointerId=null,startX=0,startY=0
  const clear=()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null}if(heartbeat){clearInterval(heartbeat);heartbeat=null}}
  function end(event){
    if(!active)return
    if(event){event.preventDefault();event.stopPropagation()}
    active=false;clear();button.classList.remove("holding")
    if(pointerId!==null){try{button.releasePointerCapture(pointerId)}catch(_){}pointerId=null}
    if(held){held=false;nativeAction("tvHoldStop",baseAction,label)}
    else if(Date.now()>=gestureSuppressUntil)fireTVKey(baseAction,role,label)
  }
  button.addEventListener("pointerdown",event=>{
    if(active)return
    event.preventDefault();event.stopPropagation()
    active=true;held=false;pointerId=event.pointerId;startX=event.clientX;startY=event.clientY
    button.classList.add("holding");try{button.setPointerCapture(pointerId)}catch(_){}
    holdTimer=setTimeout(()=>{holdTimer=null;if(!active)return;held=true
      nativeAction("tvHoldStart",baseAction,label)
      heartbeat=setInterval(()=>{if(active&&held)nativeAction("tvHoldHeartbeat",baseAction,label)},170)
    },420)
  })
  button.addEventListener("pointermove",event=>{if(active&&!held&&Math.hypot(event.clientX-startX,event.clientY-startY)>18){active=false;clear();button.classList.remove("holding")}})
  button.addEventListener("pointerup",end)
  button.addEventListener("pointercancel",()=>{if(held)nativeAction("tvHoldStop",baseAction,label);active=false;held=false;clear();button.classList.remove("holding")})
  button.addEventListener("lostpointercapture",()=>{if(active)end()})
  button.addEventListener("click",event=>{event.preventDefault();event.stopPropagation()})
  button.addEventListener("contextmenu",event=>event.preventDefault())
  window.addEventListener("blur",()=>{if(active)end()})
}
function makeTVKey(baseAction,index){
  const role=crossRole(index),action=displayAction(index,baseAction),item=meta(action),base=meta(baseAction),b=document.createElement("button"),overridden=action!==baseAction
  b.className="key"+(role?" adaptive":"")+(action==="confirm"?" ok":"")
  b.innerHTML='<span class="icon">'+item.icon+'</span><span class="label">'+item.label+'</span>'+(overridden?'<span class="alt-label">長押し '+base.label+'</span>':'')
  if(TV_SEEK_ACTIONS.has(baseAction)){bindTVSeekHold(b,baseAction,role,item.label);return b}
  let holdTimer=null,suppressUntil=0,startX=0,startY=0,tracking=false
  const cancelHold=()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null}}
  if(overridden&&role!=="center"){
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
  b.onclick=e=>{e.preventDefault();e.stopPropagation();if(Date.now()<gestureSuppressUntil||Date.now()<suppressUntil)return;fireTVKey(baseAction,role,item.label)}
  installCenterGesture(b,baseAction,role,item.label,base.label,overridden)
  return b
}
function modeLabel(){return mode==="media"?"動画":mode==="hybrid"?"動画＋操作":"カーソル"}
function renderTV(){const root=document.getElementById("tvGrid");root.innerHTML="";layout.forEach((action,index)=>root.appendChild(makeTVKey(action,index)));document.getElementById("modeBadge").textContent=modeLabel()}
function setMode(value){if(!["navigation","hybrid","media"].includes(value))return;if(mode!==value){mode=value;renderTV()}else document.getElementById("modeBadge").textContent=modeLabel()}
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
function openLayoutEditor(e){if(e){e.preventDefault();e.stopPropagation()}selectedSlot=null;document.getElementById("configLayer").classList.add("open");renderConfig()}
function closeLayoutEditor(e){if(e){e.preventDefault();e.stopPropagation()}selectedSlot=null;document.getElementById("configLayer").classList.remove("open");renderTV()}
function resetLayout(e){if(e){e.preventDefault();e.stopPropagation()}layout=DEFAULT.slice();selectedSlot=null;saveLayout();renderTV();renderConfig()}
const PICTURE_MENU=[
 ["基本設定",[["画質モード","pictureMode"],["オート画質モード","autoPictureMode"],["明るさセンサー","lightSensor"],["画質設定リセット",null],["アプリ専用画質モード",null]]],
 ["明るさ",[["明るさ","brightness"],["コントラスト","contrast"],["ガンマ補正",null],["黒レベル",null],["黒伸長",null],["自動コントラスト補正",null],["ローカルディミング","autoLocalDimming"],["ピーク輝度","xtendedDynamicRange"]]],
 ["色",[["色の濃さ","color"],["色あい",null],["色温度","colorTemperature"],["ライブカラー",null],["色空間","colorSpace"]]],
 ["くっきりすっきり",[["シャープネス","sharpness"],["リアリティクリエーション",null],["ランダムノイズリダクション",null],["デジタルノイズリダクション",null],["スムースグラデーション",null]]],
 ["動き",[["モーションフロー",null],["なめらかさ",null],["くっきりさ",null],["シネマドライブ",null],["残像低減",null]]],
 ["映像信号",[["HDRモード","hdrMode"],["HDMIビデオレンジ",null]]],
 ["色詳細設定",[["色温度詳細設定：ベーシック",null],["色温度詳細設定：マルチポイント",null],["各色詳細設定",null]]]
]
const PIC_PRESET_IDS=["day","night","movie"],PIC_PRESET_NAMES={day:"昼",night:"夜",movie:"映画"}
let pictureMap={},savedPresets={day:false,night:false,movie:false},pictureConnected=false
function pictureEscape(t){return String(t==null?"":t).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}

const QUICK_APPS=[["youtube","YouTube"],["netflix","Netflix"],["prime","Amazonプライム"],["unext","U-NEXT"],["proton","Proton VPNを開く"]]
let quickAppsAvailable={},quickSound={}
function quickModeButtons(targetId){
 const box=document.getElementById(targetId);if(!box)return
 const info=pictureEntry("pictureMode")
 const opts=info&&info.available&&Array.isArray(info.options)?info.options:[]
 box.innerHTML=""
 if(!opts.length){box.textContent="画質モードの直接切替は未対応";return}
 for(const value of opts){
  const button=document.createElement("button")
  button.className=String(value)===String(info.value)?"selected":""
  button.textContent=pictureOptionLabel("pictureMode",value)
  button.addEventListener("click",e=>selectQuickPicture(e,value))
  box.appendChild(button)
 }
}
function selectQuickPicture(e,value){
 if(e){e.preventDefault();e.stopPropagation()}
 const info=pictureEntry("pictureMode")
 if(!info||!info.available||!Array.isArray(info.options)||!info.options.includes(value))return
 nativeAction("picture","set","画質モード",JSON.stringify({target:"pictureMode",value}))
}
function quickSoundButtons(id,target){
 const box=document.getElementById(id);if(!box)return
 const data=quickSound[target],opts=data&&data.available&&Array.isArray(data.options)?data.options:[]
 box.innerHTML=""
 if(!opts.length){box.textContent="テレビから操作可能な音声項目を取得できません";return}
 for(const value of opts){
  const button=document.createElement("button")
  button.className="quick-action"+(String(value)===String(data.value)?" selected":"")
  button.textContent=target==="outputTerminal"?quickAudioLabel(value):value
  button.addEventListener("click",e=>selectQuickSound(e,target,value))
  box.appendChild(button)
 }
}
function quickAudioLabel(v){const x={speaker:"テレビスピーカー",speaker_hdmi:"スピーカー＋HDMI",hdmi:"HDMI",audioSystem:"オーディオシステム"};return x[v]||v}
function selectQuickSound(e,target,value){
 if(e){e.preventDefault();e.stopPropagation()}
 const item=quickSound[target]
 if(!item||!item.available||!item.options.includes(value))return
 nativeAction("quick","soundSet","音声設定",JSON.stringify({target,value}))
}
function quickAppButtons(){
 const box=document.getElementById("quickApps");if(!box)return
 box.innerHTML=""
 for(const [id,label] of QUICK_APPS){
  const button=document.createElement("button")
  button.className="quick-action"
  button.disabled=!quickAppsAvailable[id]
  button.textContent=label
  button.addEventListener("click",()=>nativeAction("quick","app",label,id))
  box.appendChild(button)
 }
}
function openQuickEditor(e){if(e){e.preventDefault();e.stopPropagation()}document.getElementById("quickLayer").classList.add("open");quickModeButtons("quickPictureModesPanel");probeQuickEditor()}
function closeQuickEditor(e){if(e){e.preventDefault();e.stopPropagation()}document.getElementById("quickLayer").classList.remove("open")}
function probeQuickEditor(e){if(e){e.preventDefault();e.stopPropagation()}const el=document.getElementById("quickStatus");if(el)el.textContent="テレビの対応項目を取得しています…";nativeAction("quick","probe","クイック操作")}
function showQuickStatus(result){
 const status=document.getElementById("quickStatus")
 if(result&&result.picture){quickModeButtons("quickPictureModes");quickModeButtons("quickPictureModesPanel")}
 if(result&&result.quick){
   if(result.quick.picture)showPictureStatus({picture:result.quick.picture})
   quickSound=result.quick.sound||{}
   quickAppsAvailable=result.quick.apps||{}
   quickSoundButtons("quickSoundModes","soundMode")
   quickSoundButtons("quickAudioOutputs","outputTerminal")
   quickAppButtons()
   if(status)status.textContent=result.quick.message||"対応項目を取得しました"
 }else if(result&&result.ok===false&&document.getElementById("quickLayer").classList.contains("open")){
   if(status)status.textContent="操作できませんでした："+String(result.message||"テレビとの接続を確認してください")
 }
}
function openPictureEditor(e){if(e){e.preventDefault();e.stopPropagation()}document.getElementById("pictureLayer").classList.add("open");renderPictureMenu();probePictureScene()}
function closePictureEditor(e){if(e){e.preventDefault();e.stopPropagation()}document.getElementById("pictureLayer").classList.remove("open")}
function openBrightnessBar(e){if(e){e.preventDefault();e.stopPropagation()}document.getElementById("brightLayer").classList.add("open");probePictureScene()}
function closeBrightnessBar(e){if(e){e.preventDefault();e.stopPropagation()}document.getElementById("brightLayer").classList.remove("open")}
function openShortcuts(e){if(e){e.preventDefault();e.stopPropagation()}document.getElementById("shortcutsLayer").classList.add("open");renderPicturePresets();probePictureScene()}
function closeShortcuts(e){if(e){e.preventDefault();e.stopPropagation()}document.getElementById("shortcutsLayer").classList.remove("open")}
function probePictureScene(e){if(e){e.preventDefault();e.stopPropagation()}for(const id of ["pictureStatus","shortcutsStatus"]){const el=document.getElementById(id);if(el)el.textContent="テレビから設定を読み取り中…"}nativeAction("picture","probe","画質対応確認")}
function pictureEntry(target){return pictureMap[target]||null}
function pictureModeLabel(target,value){
 if(target!=="pictureMode")return String(value)
 const labels={vivid:"ダイナミック",standard:"スタンダード",cinema:"シネマ",imax:"IMAX",custom:"カスタム"}
 const raw=String(value),key=raw.trim().toLowerCase()
 return Object.prototype.hasOwnProperty.call(labels,key)?labels[key]:raw
}
function pictureOptionLabel(target,value){
 const raw=String(value),key=raw.trim().toLowerCase()
 if(target==="pictureMode")return pictureModeLabel(target,value)
 const maps={
  lightSensor:{on:"入",off:"切"},
  autoPictureMode:{auto:"自動",auto24p:"自動（24p）",off:"切"},
  autoLocalDimming:{high:"強",medium:"中",low:"弱",off:"切"},
  xtendedDynamicRange:{high:"強",medium:"中",low:"弱",off:"切"},
  hdrMode:{auto:"自動",hdr10:"HDR10",hlg:"HLG",off:"切"},
  colorSpace:{auto:"自動",dci:"DCI",adobergb:"Adobe RGB",bt2020:"BT.2020","srgb/bt709":"sRGB／BT.709"},
  colorTemperature:{cool:"クール",neutral:"ニュートラル",warm:"ウォーム",expert1:"エキスパート1",expert2:"エキスパート2"}
 }
 const names=maps[target]
 return names&&Object.prototype.hasOwnProperty.call(names,key)?names[key]:raw
}
function renderPictureMenu(){
 const root=document.getElementById("pictureGroups");if(!root)return
 let html=""
 for(const group of PICTURE_MENU){
   html+='<section class="pic-section"><h3>'+pictureEscape(group[0])+'</h3>'
   for(const [name,target] of group[1]){
     const info=target?pictureEntry(target):null
     html+='<div class="pic-item"><span class="pic-name">'+pictureEscape(name)+'</span>'
     if(info&&info.available&&Number.isFinite(Number(info.min))&&Number.isFinite(Number(info.max))&&Number(info.max)>Number(info.min)&&Number(info.step)>0){
       html+='<div class="pic-slider-wrap"><input type="range" min="'+info.min+'" max="'+info.max+'" step="'+info.step+'" value="'+info.value+'" oninput="previewPicValue(event)" onchange="commitPictureSlider(event,&quot;'+target+'&quot;)"><output>'+pictureEscape(info.value)+'</output></div>'
     }else if(info&&info.available&&info.options&&info.options.length){
       html+='<select class="pic-enum" aria-label="'+pictureEscape(name)+'" onchange="commitPictureSelect(event,&quot;'+target+'&quot;)">'
       for(const option of info.options)html+='<option value="'+pictureEscape(option)+'"'+(String(option)===String(info.value)?' selected':'')+'>'+pictureEscape(pictureOptionLabel(target,option))+'</option>'
       html+='</select>'
     }else html+='<span class="pic-manual">テレビで設定</span>'
     html+='</div>'
   }
   html+='</section>'
 }
 root.innerHTML=html
}
function previewPicValue(e){const output=e.target.parentNode.querySelector("output");if(output)output.textContent=e.target.value}
function commitPictureSlider(e,target){sendPictureValue(target,e.target.value)}
function commitPictureSelect(e,target){sendPictureValue(target,e.target.value)}
function sendPictureValue(target,value){
 if(!pictureConnected||!pictureEntry(target)||!pictureEntry(target).available)return
 const status=document.getElementById("pictureStatus");if(status)status.textContent="設定を送信して、テレビ側の値を確認中…"
 nativeAction("picture","set","画質変更",JSON.stringify({target,value}))
}
function previewBrightness(e){const v=document.getElementById("brightnessValue");if(v)v.textContent="明るさ "+e.target.value+"（指を離すと反映）"}
function commitBrightness(e){
 const v=pictureEntry("brightness");if(!v||!v.available)return
 const txt=document.getElementById("brightnessValue");if(txt)txt.textContent="送信・反映確認中…"
 nativeAction("picture","set","明るさ",JSON.stringify({target:"brightness",value:e.target.value}))
}
function renderBrightness(){
 const input=document.getElementById("brightnessRange"),v=document.getElementById("brightnessValue"),data=pictureEntry("brightness")
 if(!input||!v)return
 const okay=data&&data.available&&Number.isFinite(Number(data.min))&&Number.isFinite(Number(data.max))&&Number(data.max)>Number(data.min)&&Number(data.step)>0
 input.disabled=!okay
 if(okay){input.min=data.min;input.max=data.max;input.step=data.step;input.value=data.value;v.textContent="現在の明るさ "+data.value}
 else v.textContent="明るさの直接操作は未対応。テレビのクイック設定で調整してください。"
}
function renderPicturePresets(){
 const root=document.getElementById("picturePresets");if(!root)return
 root.innerHTML=PIC_PRESET_IDS.map(key=>{
 const isSaved=Boolean(savedPresets[key])
 return '<div class="pic-preset"><div><strong>'+PIC_PRESET_NAMES[key]+'</strong><div class="pic-manual">'+(isSaved?'登録済み':'未登録')+'</div></div><button '+(!pictureConnected?'disabled':'')+' onclick="savePicturePreset(event,&quot;'+key+'&quot;)">保存</button><button '+(!pictureConnected||!isSaved?'disabled':'')+' onclick="loadPicturePreset(event,&quot;'+key+'&quot;)">呼出</button></div>'
 }).join("")
}
function savePicturePreset(e,key){
 if(e){e.preventDefault();e.stopPropagation()}
 if(!pictureConnected||!PIC_PRESET_IDS.includes(key))return
 if(savedPresets[key]&&!window.confirm("既存の「"+PIC_PRESET_NAMES[key]+"」設定を上書き保存しますか？"))return
 const status=document.getElementById("shortcutsStatus");if(status)status.textContent="現在の画質を保存中…"
 nativeAction("picture","save","保存",key)
}
function loadPicturePreset(e,key){
 if(e){e.preventDefault();e.stopPropagation()}
 if(!pictureConnected||!savedPresets[key]||!PIC_PRESET_IDS.includes(key))return
 const status=document.getElementById("shortcutsStatus");if(status)status.textContent="テレビへ反映し、値を確認中…"
 nativeAction("picture","load","呼出",key)
}
function showPictureStatus(result){
 const status=document.getElementById("pictureStatus"),shortStatus=document.getElementById("shortcutsStatus")
 if(result&&result.picture){
  pictureConnected=true
  const picture=result.picture
  pictureMap={};for(const item of picture.entries||[])pictureMap[item.target]=item
  savedPresets=picture.saved||savedPresets
  if(status)status.textContent=picture.message||"現在値を取得しました"
  if(shortStatus)shortStatus.textContent=picture.message||"ショートカットを確認しました"
  renderPictureMenu();renderBrightness();renderPicturePresets();quickModeButtons('quickPictureModes');quickModeButtons('quickPictureModesPanel')
 }else if(result&&result.ok===false){
  const msg="実行できませんでした："+String(result.message||"通信に失敗しました")
  if(status)status.textContent=msg
  if(shortStatus)shortStatus.textContent=msg
  const txt=document.getElementById("brightnessValue");if(txt)txt.textContent=msg
  if(!pictureConnected){renderPictureMenu();renderBrightness();renderPicturePresets()}
 }
}
function setACState(s){const el=document.getElementById("acTemp"),fan=document.getElementById("acFanLabel");if(!s){if(el)el.textContent="--°";if(fan)fan.textContent="風量 --";return}if(el)el.textContent=s.dry?"—":(Number.isFinite(Number(s.temp))?Math.round(Number(s.temp))+"°":"--°");if(fan)fan.textContent="風量 "+(s.fan||"--")}
function setFloorState(s){
  const status=document.getElementById("floorStatus"),brightness=document.getElementById("floorBrightness"),label=document.getElementById("floorBrightnessLabel"),hue=document.getElementById("floorHue")
  if(!status)return
  if(!s||!s.ready){status.textContent="接続未設定：接続設定で電球のIPアドレスを登録";return}
  status.textContent=(s.on?"点灯中":"消灯中")+(s.model?" · "+s.model:"")+(s.colorTemp?" · "+s.colorTemp+"K":"")
  if(Number.isFinite(Number(s.brightness))){brightness.value=s.brightness;label.textContent=s.brightness+"%"}
  if(Number.isFinite(Number(s.hue)))hue.value=s.hue
}
function nativeResult(result){
  showPictureStatus(result)
  showQuickStatus(result)
  const badge=document.getElementById("modeBadge")
  if(result&&result.ok===false){if(badge)badge.textContent="エラー";if(activePanel==="floor")document.getElementById("floorStatus").textContent="操作失敗："+(result.message||"接続を確認してください");return}
  if(result&&result.mode)setMode(result.mode)
  if(result&&Object.prototype.hasOwnProperty.call(result,"ac"))setACState(result.ac)
  if(result&&Object.prototype.hasOwnProperty.call(result,"floor"))setFloorState(result.floor)
}
function requestMode(){nativeAction("system","refreshMode","")}function requestAC(){nativeAction("system","refreshAC","")}
function sendMenu(e){e.preventDefault();e.stopPropagation();nativeAction("tv","menu","MENU")}
function sendTVShortcut(e,action,label){e.preventDefault();e.stopPropagation();nativeAction("tv",action,label)}
function sendOther(e,device,action,label){e.preventDefault();e.stopPropagation();nativeAction(device,action,label)}
function bindLightHoldButtons(){
  document.querySelectorAll("[data-light-hold]").forEach(b=>{
    const action=b.dataset.lightHold,label=b.dataset.lightLabel||action
    let active=false,holdStarted=false,holdTimer=null,heartbeat=null,pointerId=null
    const clearHoldTimer=()=>{if(holdTimer){clearTimeout(holdTimer);holdTimer=null}}
    const releasePointer=()=>{if(pointerId!==null){try{b.releasePointerCapture(pointerId)}catch(_){}pointerId=null}}
    const stop=e=>{
      if(e){e.preventDefault();e.stopPropagation()}
      if(!active)return
      active=false;clearHoldTimer();b.classList.remove("holding")
      if(heartbeat){clearInterval(heartbeat);heartbeat=null}
      releasePointer()
      if(holdStarted){holdStarted=false;nativeAction("lightHoldStop",action,label)}
      else nativeAction("light",action,label)
    }
    const start=e=>{
      e.preventDefault();e.stopPropagation();if(active)return
      active=true;holdStarted=false;pointerId=e.pointerId;b.classList.add("holding")
      try{b.setPointerCapture(pointerId)}catch(_){}
      holdTimer=setTimeout(()=>{
        holdTimer=null;if(!active)return
        holdStarted=true;nativeAction("lightHoldStart",action,label)
        heartbeat=setInterval(()=>{if(active&&holdStarted)nativeAction("lightHoldHeartbeat",action,label)},150)
      },180)
    }
    b.addEventListener("pointerdown",start)
    b.addEventListener("pointerup",stop)
    b.addEventListener("pointercancel",stop)
    b.addEventListener("lostpointercapture",stop)
    b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation()})
    b.addEventListener("contextmenu",e=>e.preventDefault())
    window.addEventListener("blur",stop)
    document.addEventListener("visibilitychange",()=>{if(document.hidden)stop()})
  })
}
function openRemote(device){window.location.href=REMOTES[device]}
bindLightHoldButtons();renderTV();requestMode();requestAC();try{setPanel(localStorage.getItem(PANEL_KEY)||"tv")}catch(_){setPanel("tv")}pollTimer=setInterval(requestMode,1600);acTimer=setInterval(requestAC,30000);window.addEventListener("beforeunload",()=>{if(pollTimer)clearInterval(pollTimer);if(acTimer)clearInterval(acTimer)})
</script></body></html>`

function secure(key){return Keychain.contains(key)?Keychain.get(key):""}
function sonyHost(){const value=secure(STORAGE.host).trim().replace(/^https?:\/\//i,"").replace(/:\d+$/,"");if(!value)throw new Error("BRAVIA IP設定なし");return value}
function sonyPSK(){const value=secure(STORAGE.psk);if(!value)throw new Error("BRAVIA PSK設定なし");return value}
function loadMode(){try{if(Keychain.contains(STORAGE.mode)){const value=JSON.parse(Keychain.get(STORAGE.mode));if(value&&["navigation","hybrid","media"].includes(value.mode))return value}}catch(_){}return{mode:"navigation",navigationUntil:0,updatedAt:0,lastAction:""}}
let modeState=loadMode(),commandIndex=null
function rememberMode(mode,action){const now=Date.now();modeState={mode,navigationUntil:mode==="navigation"?now+NAVIGATION_GRACE_MS:0,lastAction:action||"",updatedAt:now};Keychain.set(STORAGE.mode,JSON.stringify(modeState));return mode}
function noteAction(action){if(action==="pause"){rememberMode("hybrid",action);return}if(action==="play"){rememberMode("media",action);return}if(action==="stop"){rememberMode("navigation",action);return}if(modeState.mode==="hybrid"&&HYBRID_KEEP_ACTIONS.has(action)){rememberMode("hybrid",action);return}if(NAV_ACTIONS.has(action))rememberMode("navigation",action);else if(MEDIA_ACTIONS.has(action))rememberMode("media",action)}
async function sonyJSON(service,method){const r=new Request("http://"+sonyHost()+"/sony/"+service);r.method="POST";r.headers={"Content-Type":"application/json","X-Auth-PSK":sonyPSK()};r.body=JSON.stringify({method,params:[],id:1,version:"1.0"});return JSON.parse(await r.loadString())}
const PICTURE_TARGETS=["pictureMode","autoPictureMode","lightSensor","brightness","contrast","autoLocalDimming","xtendedDynamicRange","color","colorTemperature","colorSpace","sharpness","hdrMode"]
const PICTURE_PRESET_KEYS=["day","night","movie"]
const PICTURE_PRESET_PREFIX="yos.bravia.scriptable.picture-user-preset.v2."
async function sonyVideoJSON(method,params){
 const r=new Request("http://"+sonyHost()+"/sony/video");r.method="POST";r.timeoutInterval=8
 r.headers={"Content-Type":"application/json","X-Auth-PSK":sonyPSK()}
 r.body=JSON.stringify({method,params,id:1,version:"1.0"})
 const data=JSON.parse(await r.loadString())
 if(data&&data.error)throw Error("BRAVIA画質API拒否："+String(data.error[0]||"不明"))
 if(!data||!Array.isArray(data.result))throw Error("BRAVIA画質応答が不明です")
 return data
}
function flattenPicture(v,out=[]){if(Array.isArray(v)){for(const x of v)flattenPicture(x,out)}else if(v&&typeof v==="object"&&typeof v.target==="string"){out.push(v)}return out}
async function pictureAll(){
 const all=new Map(),seen=new Set()
 let aggregateError=null
 try{
  const data=await sonyVideoJSON("getPictureQualitySettings",[{target:""}])
  for(const entry of flattenPicture(data.result)){
   if(!PICTURE_TARGETS.includes(entry.target))continue
   seen.add(entry.target)
   if(entry.isAvailable!==false&&!all.has(entry.target))all.set(entry.target,entry)
  }
 }catch(error){aggregateError=error}
 // Consumer BRAVIA firmware can provide a specific target even if the aggregate query fails.
 // The mode was verified on this user's real television; brightness must remain read-only until valid.
 for(const target of ["pictureMode","brightness"]){
  if(seen.has(target))continue
  try{
   const data=await sonyVideoJSON("getPictureQualitySettings",[{target}])
   for(const entry of flattenPicture(data.result)){
    if(entry.target!==target)continue
    seen.add(target)
    if(entry.isAvailable!==false)all.set(target,entry)
    break
   }
  }catch(_){}
 }
 if(!all.size&&aggregateError)throw aggregateError
 return all
}
function pictureOptions(entry){return entry&&Array.isArray(entry.candidate)?entry.candidate.filter(x=>x&&typeof x.value==="string"&&x.value!=="").map(x=>x.value):[]}
function pictureRange(entry){
 if(!entry||!Array.isArray(entry.candidate))return null
 const c=entry.candidate.find(x=>x&&Number.isFinite(Number(x.min))&&Number.isFinite(Number(x.max))&&Number.isFinite(Number(x.step))&&Number(x.step)>0&&Number(x.max)>Number(x.min))
 if(!c)return null
 const min=Number(c.min),max=Number(c.max),step=Number(c.step)
 return{min,max,step}
}
function validPictureValue(entry,value){
 if(!entry||entry.isAvailable===false||!PICTURE_TARGETS.includes(String(entry.target||"")))return false
 const str=String(value),range=pictureRange(entry)
 if(range){
  const n=Number(str),precision=(n-range.min)/range.step
  return str.trim()!==""&&Number.isFinite(n)&&n>=range.min-1e-7&&n<=range.max+1e-7&&Math.abs(precision-Math.round(precision))<1e-5
 }
 return pictureOptions(entry).includes(str)
}
function picturePublic(entry){
 const range=pictureRange(entry),opts=pictureOptions(entry)
 const valid=validPictureValue(entry,entry.currentValue)
 return{target:entry.target,value:String(entry.currentValue??""),available:valid,
  min:range?range.min:null,max:range?range.max:null,step:range?range.step:null,options:range?[]:opts}
}
function pictureSavedFlags(){return Object.fromEntries(PICTURE_PRESET_KEYS.map(k=>[k,Keychain.contains(PICTURE_PRESET_PREFIX+k)]))}
async function pictureProbe(message){
 const map=await pictureAll()
 const entries=PICTURE_TARGETS.filter(t=>map.has(t)).map(t=>picturePublic(map.get(t)))
 return{entries,saved:pictureSavedFlags(),message:message||("BRAVIAから"+entries.length+"項目を取得。調整できない項目はテレビのクイック設定を使用してください。")}
}
async function writePicture(target,value){
 if(!PICTURE_TARGETS.includes(target))throw Error("この画質項目は安全な直接操作に非対応です")
 const settings=await pictureAll(),entry=settings.get(target)
 if(!validPictureValue(entry,value))throw Error("テレビが許可していない設定値です："+target)
 if(String(entry.currentValue)===String(value))return
 await sonyVideoJSON("setPictureQualitySettings",[{settings:[{target,value:String(value)}]}])
 const checked=(await pictureAll()).get(target)
 if(!checked||(String(checked.currentValue)!==String(value)&&!(Number.isFinite(Number(value))&&Number(checked.currentValue)===Number(value))))throw Error("テレビ側で反映確認できませんでした："+target)
}
async function pictureSave(key){
 if(!PICTURE_PRESET_KEYS.includes(key))throw Error("保存先が不明です")
 const settings=await pictureAll(),saved=[]
 for(const target of PICTURE_TARGETS){
  const e=settings.get(target)
  if(e&&validPictureValue(e,e.currentValue))saved.push({target,value:String(e.currentValue)})
 }
 if(!saved.length)throw Error("保存可能な画質項目を取得できません。保存を行いません")
 Keychain.set(PICTURE_PRESET_PREFIX+key,JSON.stringify({schema:2,created:new Date().toISOString(),settings:saved}))
 return pictureProbe("現在の画質"+saved.length+"項目を「"+({day:"昼",night:"夜",movie:"映画"}[key])+"」に保存しました。設定変更はしていません。")
}
async function pictureLoad(key){
 if(!PICTURE_PRESET_KEYS.includes(key)||!Keychain.contains(PICTURE_PRESET_PREFIX+key))throw Error("保存済み設定がありません")
 let saved
 try{saved=JSON.parse(Keychain.get(PICTURE_PRESET_PREFIX+key))}catch(_){throw Error("画質保存データが破損しています")}
 if(!saved||saved.schema!==2||!Array.isArray(saved.settings)||saved.settings.length<1||saved.settings.length>PICTURE_TARGETS.length)throw Error("画質保存データが不正です")
 const targets=new Set(),list=[]
 const supported=await pictureAll()
 for(const item of saved.settings){
  if(!item||!PICTURE_TARGETS.includes(item.target)||targets.has(item.target)||typeof item.value!=="string")throw Error("不明な保存データのため変更しません")
  targets.add(item.target)
  if(!validPictureValue(supported.get(item.target),item.value))throw Error("テレビ側で現在使えない項目を含むため変更しません："+item.target)
  list.push({target:item.target,value:item.value})
 }
 list.sort((a,b)=>Number(b.target==="pictureMode")-Number(a.target==="pictureMode"))
 let changed=0
 try{for(const item of list){if(String(supported.get(item.target).currentValue)===item.value)continue;await writePicture(item.target,item.value);changed++}}
 catch(e){throw Error("画質の一部だけ変更された可能性があります（"+changed+"件確認済み）。"+String(e.message||e))}
 return pictureProbe("保存済み「"+({day:"昼",night:"夜",movie:"映画"}[key])+"」を呼び出しました。"+changed+"項目を変更・読戻し確認しました。")
}
async function pictureAction(action,slot){
 if(action==="probe")return pictureProbe()
 if(action==="set"){
  let payload
  try{payload=JSON.parse(String(slot||""))}catch(_){throw Error("設定内容が不正です")}
  if(!payload||typeof payload.target!=="string"||typeof payload.value!=="string")throw Error("設定内容が不正です")
  await writePicture(payload.target,payload.value)
  return pictureProbe("「"+payload.target+"」を変更し、テレビの値を確認しました")
 }
 if(action==="save")return pictureSave(slot)
 if(action==="load")return pictureLoad(slot)
 throw Error("不明な画質操作です")
}

const QUICK_APP_MATCHERS=Object.freeze({
 youtube:[/^youtube$/i,/^youtube\s*for\s*android\s*tv$/i],
 netflix:[/^netflix$/i],
 prime:[/^prime\s*video$/i,/^amazon\s*prime\s*video$/i],
 unext:[/^u[-\s]?next$/i],
 proton:[/^proton\s*vpn(?:\b|\s*[:：])/i]
})
function quickFlatten(value,output=[]){
 if(Array.isArray(value)){for(const x of value)quickFlatten(x,output)}
 else if(value&&typeof value==="object"){if(typeof value.uri==="string"&&typeof(value.title||value.name)==="string")output.push(value);else for(const x of Object.values(value))if(x&&typeof x==="object")quickFlatten(x,output)}
 return output
}
function quickSoundFlatten(value,out=[]){
 if(Array.isArray(value)){for(const item of value)quickSoundFlatten(item,out)}
 else if(value&&typeof value==="object"){
   if(typeof value.target==="string"&&["soundMode","outputTerminal"].includes(value.target))out.push(value)
   else for(const item of Object.values(value))if(item&&typeof item==="object")quickSoundFlatten(item,out)
 }
 return out
}
async function sonyQuickJSON(service,method,params=[],version="1.0"){
 const r=new Request("http://"+sonyHost()+"/sony/"+service);r.method="POST";r.timeoutInterval=8
 r.headers={"Content-Type":"application/json","X-Auth-PSK":sonyPSK()}
 r.body=JSON.stringify({method,params,id:1,version})
 const data=JSON.parse(await r.loadString())
 if(data&&Array.isArray(data.error))throw Error("テレビがこの操作に非対応（"+String(data.error[0])+"）")
 if(!data||!Array.isArray(data.result))throw Error("BRAVIAの応答形式が不正です")
 return data
}
function quickAppPick(entries,id){
 const patterns=QUICK_APP_MATCHERS[id]
 if(!patterns)return null
 return entries.find(x=>typeof x.uri==="string"&&x.uri.length>3&&x.uri.length<700&&patterns.some(rx=>rx.test(String(x.title||x.name||"").trim())))||null
}
async function quickInstalledApps(){
 const list=quickFlatten((await sonyQuickJSON("appControl","getApplicationList",[],"1.0")).result)
 return Object.fromEntries(Object.keys(QUICK_APP_MATCHERS).map(id=>[id,Boolean(quickAppPick(list,id))]))
}
async function quickLaunchApp(id){
 if(!Object.prototype.hasOwnProperty.call(QUICK_APP_MATCHERS,id))throw Error("未登録のアプリです")
 const list=quickFlatten((await sonyQuickJSON("appControl","getApplicationList",[],"1.0")).result)
 const selected=quickAppPick(list,id)
 if(!selected)throw Error("テレビのインストール済みアプリ一覧にありません")
 await sonyQuickJSON("appControl","setActiveApp",[{uri:selected.uri}],"1.0")
 return {message:"テレビへアプリ起動要求を送りました（表示は実機で確認）。",apps:Object.fromEntries(Object.keys(QUICK_APP_MATCHERS).map(k=>[k,Boolean(quickAppPick(list,k))]))}
}
async function quickAudioRead(){
 const sound={}
 try{
   const rows=quickSoundFlatten((await sonyQuickJSON("audio","getSoundSettings",[{target:""}],"1.1")).result)
   for(const r of rows){
     if(!["soundMode","outputTerminal"].includes(r.target))continue
     const options=Array.isArray(r.candidate)?r.candidate.filter(c=>c&&typeof c.value==="string").map(c=>c.value):[]
     const current=String(r.currentValue??r.value??"")
     sound[r.target]={target:r.target,value:current,options,available:options.includes(current)}
   }
 }catch(_){}
 return sound
}
async function quickAudioWrite(payload){
 if(!payload||!["soundMode","outputTerminal"].includes(payload.target)||typeof payload.value!=="string")throw Error("未対応の音声変更")
 const before=(await quickAudioRead())[payload.target]
 if(!before||!before.available||!before.options.includes(payload.value))throw Error("テレビが音声の候補値を提供していません")
 if(before.value!==payload.value){
   await sonyQuickJSON("audio","setSoundSettings",[{settings:[{target:payload.target,value:payload.value}]}],"1.1")
   const after=(await quickAudioRead())[payload.target]
   if(!after||after.value!==payload.value)throw Error("音声設定のテレビ側反映を確認できません")
 }
 return {message:"音声設定をテレビへ反映し、値を確認しました",sound:await quickAudioRead()}
}
async function quickHDMI3(){
 const uri="extInput:hdmi?port=3"
 // Only the user's explicitly designated input is sent; do not guess Fire TV internal apps.
 await sonyQuickJSON("avContent","setPlayContent",[{uri}],"1.0")
 const active=(await sonyQuickJSON("avContent","getPlayingContentInfo",[],"1.0")).result
 const observed=quickFlatten(active).some(x=>x.uri===uri)
 if(!observed)throw Error("HDMI3への切替要求後にテレビ側の入力を確認できません")
 return {message:"HDMI3をテレビ側で確認しました。Fire TVのDMM.comはFire TV画面から起動してください。"}
}
async function quickTVTuner(){
 await discoverSony()
 const entry=["dtv","digital","tv","tvinput"].find(x=>commandIndex.has(x))
 if(!entry)throw Error("テレビ放送への専用切替コマンドは未対応です。入力メニューから選んでください")
 await sonyAction("broadcast",false)
 return {message:"テレビ放送の切替コマンドを送信しました"}
}
async function quickProbe(){
 const values=await Promise.allSettled([pictureProbe(),quickAudioRead(),quickInstalledApps()])
 return {picture:values[0].status==="fulfilled"?values[0].value:null,sound:values[1].status==="fulfilled"?values[1].value:{},apps:values[2].status==="fulfilled"?values[2].value:{},
   message:"利用できる項目だけ表示します。音質・アプリが取得できなければテレビ側で変更してください。"}
}
async function quickAction(action,slot){
 if(action==="probe")return quickProbe()
 if(action==="app")return quickLaunchApp(String(slot||""))
 if(action==="hdmi3")return quickHDMI3()
 if(action==="tv")return quickTVTuner()
 if(action==="soundSet"){
   let payload
   try{payload=JSON.parse(String(slot||""))}catch(_){throw Error("音声設定形式が不正")}
   return quickAudioWrite(payload)
 }
 throw Error("不明なクイック操作")
}
async function discoverSony(){if(commandIndex)return;const data=await sonyJSON("system","getRemoteControllerInfo"),commands=data&&data.result&&data.result[1];if(!Array.isArray(commands))throw new Error("BRAVIAコマンド取得失敗");commandIndex=new Map();commands.forEach(item=>{if(item&&item.name&&item.value)commandIndex.set(String(item.name).toLowerCase(),String(item.value))})}
function xmlEscape(v){return String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;")}
async function sonyAction(action,trackMode=true){await discoverSony();if(trackMode)noteAction(action);let code=null;if(action==="quick"&&Keychain.contains(STORAGE.quick)){const saved=String(Keychain.get(STORAGE.quick)).toLowerCase();if(commandIndex.has(saved))code=commandIndex.get(saved)}for(const alias of ALIASES[action]||[]){if(!code&&commandIndex.has(alias.toLowerCase()))code=commandIndex.get(alias.toLowerCase())}if(!code)throw new Error("BRAVIA未対応："+action);const r=new Request("http://"+sonyHost()+"/sony/ircc");r.method="POST";r.headers={"Content-Type":"text/xml; charset=UTF-8","X-Auth-PSK":sonyPSK(),SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'};r.body='<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+xmlEscape(code)+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>';await r.loadString()}
function hasNavigationStatus(data){const list=data&&data.result&&data.result[0];return Array.isArray(list)&&list.some(item=>item&&["cursorDisplay","textInput","webBrowse"].includes(String(item.name||""))&&String(item.status||"").toLowerCase()==="on")}
function hasPlaybackInfo(data){const info=data&&data.result&&data.result[0];return Boolean(info&&typeof info==="object"&&(info.uri||info.source||info.title||info.programTitle))}
async function inferMode(){const now=Date.now();if(modeState.mode==="navigation"&&now<Number(modeState.navigationUntil||0))return "navigation";let nav=false,playback=false;try{nav=hasNavigationStatus(await sonyJSON("appControl","getApplicationStatusList"))}catch(_){}try{playback=hasPlaybackInfo(await sonyJSON("avContent","getPlayingContentInfo"))}catch(_){}const recentMedia=["media","hybrid"].includes(modeState.mode)&&now-Number(modeState.updatedAt||0)<RECENT_MEDIA_MS;if(nav){if(playback||recentMedia)return rememberMode("hybrid","status");return rememberMode("navigation","status")}if(playback)return rememberMode("media","status");return modeState.mode}

function walk(value,out=[]){if(Array.isArray(value))for(const v of value)walk(v,out);else if(value&&typeof value==="object"){out.push(value);for(const v of Object.values(value))walk(v,out)}return out}
const AC_FAN_LABELS=Object.freeze({0:"自動",1:"弱",3:"強"})
function acFanName(value){const n=Number(value);return Object.prototype.hasOwnProperty.call(AC_FAN_LABELS,n)?AC_FAN_LABELS[n]:(Number.isFinite(n)?String(n):"--")}
async function readACSummary(){try{const tapo=importModule("YOS Tapo H110 Core");const remote=tapo.findRemote(r=>String(r.model||"").toUpperCase()==="AC"||/エアコン|air.?con/i.test(String(r.nickname||"")));if(!remote)return null;const client=await tapo.client();const raw=await client.query({method:"control_child",params:{device_id:remote.device_id,requestData:{method:"get_device_info",params:null}}});const info=walk(raw,[]).find(x=>typeof x.ac_status==="string")||{};const s={};if(typeof info.ac_status==="string")for(const part of info.ac_status.split("_")){const m=String(part).match(/^([PMTSD])(-?\d+)$/);if(m)s[m[1]]=Number(m[2])}if(s.M==null&&info.ac_mode!=null)s.M=Number(info.ac_mode);if(s.T==null&&info.current_temp!=null)s.T=Number(info.current_temp);if(s.S==null&&info.wind_speed!=null)s.S=Number(info.wind_speed);return{temp:Number.isFinite(s.T)?s.T:null,dry:s.M===4,fan:acFanName(s.S),fanRaw:Number.isFinite(s.S)?s.S:null}}catch(_){return null}}

function normalizeName(value){return String(value).replace(/\.js$/i,"").replace(/\s+/g," ").trim().toLowerCase()}
async function readScript(scriptName){for(const manager of [FileManager.iCloud(),FileManager.local()]){const directory=manager.documentsDirectory();let files=[];try{files=manager.listContents(directory)}catch(_){}for(const file of files){if(normalizeName(file)!==normalizeName(scriptName)&&normalizeName(file)!==normalizeName(scriptName+".js"))continue;const path=manager.joinPath(directory,file);try{if(manager.isFileStoredIniCloud(path))await manager.downloadFileFromiCloud(path)}catch(_){}return manager.readString(path)}}throw new Error(scriptName+" が見つかりません")}
async function runExisting(scriptName,action){const source=await readScript(scriptName);const fakeArgs={queryParameters:{action},shortcutParameter:null,widgetParameter:null,plainTexts:[],urls:[],fileURLs:[],images:[],notification:null};const fakeScript={name:()=>scriptName,complete:()=>{},setShortcutOutput:()=>{},setWidget:()=>{}};const fakeConfig={runsInApp:true,runsInWidget:false,runsWithSiri:false,runsInNotification:false};const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;await new AsyncFunction("args","Script","config",source)(fakeArgs,fakeScript,fakeConfig)}
function parseQuery(url){const output={},position=String(url).indexOf("?");if(position<0)return output;String(url).slice(position+1).split("&").forEach(pair=>{const sep=pair.indexOf("="),key=sep>=0?pair.slice(0,sep):pair,value=sep>=0?pair.slice(sep+1):"";output[decodeURIComponent(key)]=decodeURIComponent(value)});return output}

const TV_HOLD_LEASE_MS=720
let tvHoldAction=null,tvHoldToken=0,tvHoldLeaseUntil=0,tvHoldPromise=Promise.resolve()
function stopTVHold(){tvHoldAction=null;tvHoldLeaseUntil=0;tvHoldToken++}
function renewTVHold(action){if(tvHoldAction===action)tvHoldLeaseUntil=Date.now()+TV_HOLD_LEASE_MS}
function startTVHold(action){
  if(!TV_SEEK_ACTIONS.has(action))return
  stopTVHold();tvHoldAction=action;tvHoldLeaseUntil=Date.now()+TV_HOLD_LEASE_MS;const token=tvHoldToken
  tvHoldPromise=(async()=>{try{
    while(tvHoldAction===action&&token===tvHoldToken&&Date.now()<tvHoldLeaseUntil){
      await sonyAction(action,false)
      if(tvHoldAction!==action||token!==tvHoldToken)break
      // SOAP requests are serialized, and each response already paces the loop.
      // No artificial 150-ms gap: stop/release is checked before each new request.
    }
  }catch(error){if(token===tvHoldToken)stopTVHold();try{await web.evaluateJavaScript("nativeResult("+JSON.stringify({ok:false,message:String(error&&error.message||error)})+")")}catch(_){}}finally{if(token===tvHoldToken)stopTVHold()}})()
}
const LIGHT_HOLD_LEASE_MS=600
const LIGHT_HOLD_BURST=2
const LIGHT_HOLD_KEYS={bright:["BRIGHTNESS+","明るくする","明るい"],dark:["BRIGHTNESS-","暗くする","暗い"]}
let lightHoldAction=null,lightHoldToken=0,lightHoldLeaseUntil=0,lightHoldPromise=Promise.resolve(),lightHoldTransport=null
async function getLightHoldTransport(){
  if(lightHoldTransport)return lightHoldTransport
  const tapo=importModule("YOS Tapo H110 Core")
  const remote=tapo.findRemote(r=>/ライト|light/i.test(String(r.nickname||""))||String(r.model||"").toLowerCase()==="light")
  if(!remote)throw new Error("ライト リモコンが見つかりません。YOS Tapo H110 Setup を再実行してください。")
  const keys={}
  for(const [action,candidates] of Object.entries(LIGHT_HOLD_KEYS)){const key=tapo.findKey(remote,candidates);if(!key)throw new Error(action+" のIRキーが見つかりません。");keys[action]=key}
  const client=await tapo.client()
  lightHoldTransport={remote,keys,client}
  return lightHoldTransport
}
function stopLightHold(){lightHoldAction=null;lightHoldLeaseUntil=0;lightHoldToken+=1}
function renewLightHold(action){if(lightHoldAction===action)lightHoldLeaseUntil=Date.now()+LIGHT_HOLD_LEASE_MS}
function startLightHold(action){
  if(!LIGHT_HOLD_KEYS[action])return
  stopLightHold();lightHoldAction=action;lightHoldLeaseUntil=Date.now()+LIGHT_HOLD_LEASE_MS;const token=lightHoldToken
  lightHoldPromise=(async()=>{let first=true;try{const transport=await getLightHoldTransport();while(lightHoldAction===action&&token===lightHoldToken&&Date.now()<lightHoldLeaseUntil){const key=transport.keys[action];await transport.client.fireBurst(transport.remote.device_id,key.name,first?1:LIGHT_HOLD_BURST);first=false;if(lightHoldAction!==action||token!==lightHoldToken)break}}catch(error){lightHoldTransport=null;if(token===lightHoldToken)stopLightHold();try{await web.evaluateJavaScript("nativeResult("+JSON.stringify({ok:false,message:error&&error.message?error.message:String(error)})+")")}catch(_){}}finally{if(token===lightHoldToken)stopLightHold()}})()
}

const FLOOR_HOST_KEY=CONFIG.floor.key
let floorClient=null,floorConnectedHost=""
function floorHost(){return Keychain.contains(FLOOR_HOST_KEY)?Keychain.get(FLOOR_HOST_KEY).trim():""}
function validateFloorHost(host){
  if(!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host))throw new Error("電球のIPv4アドレスを入力してください")
  const n=host.split(".").map(Number)
  if(n.some(x=>x>255)||!(n[0]===10||(n[0]===172&&n[1]>=16&&n[1]<=31)||(n[0]===192&&n[1]===168)))throw new Error("自宅LANのIPアドレスのみ使えます")
  return host
}
async function floorTransport(){
  const host=validateFloorHost(floorHost())
  if(floorClient&&floorConnectedHost===host)return floorClient
  const tapo=importModule("YOS Tapo H110 Core")
  const client=await tapo.clientForHost(host)
  floorClient=client;floorConnectedHost=host
  return client
}
function floorData(raw){
  const r=raw&&raw.result||raw
  if(!r||typeof r!=="object"||!Object.prototype.hasOwnProperty.call(r,"device_on"))throw new Error("電球の状態を取得できません。接続方式やIPを確認してください")
  return {ready:true,on:!!r.device_on,brightness:Number(r.brightness)||1,hue:Number(r.hue)||0,colorTemp:Number(r.color_temp)||0,model:String(r.model||"")}
}
async function readFloor(){
  if(!floorHost())return{ready:false}
  const client=await floorTransport()
  return floorData(await client.query({method:"get_device_info",params:null}))
}
async function configureFloor(){
  const alert=new Alert();alert.title="フロアランプ接続";alert.message="Tapoアプリのフロアランプ → 設定 → デバイス情報で確認できる自宅LANのIPアドレスを入力。既存のTapo認証情報を使います。";alert.addTextField("例: 192.168.1.20",floorHost());alert.addAction("接続テストして保存");alert.addCancelAction("キャンセル")
  if(await alert.presentAlert()<0)return{ok:true,floor:floorHost()?await readFloor():{ready:false}}
  const newHost=validateFloorHost(alert.textFieldValue(0).trim())
  const oldHost=floorHost();Keychain.set(FLOOR_HOST_KEY,newHost);floorClient=null;floorConnectedHost=""
  try{return{ok:true,floor:await readFloor()}}catch(error){
    if(oldHost)Keychain.set(FLOOR_HOST_KEY,oldHost);else Keychain.remove(FLOOR_HOST_KEY)
    floorClient=null;floorConnectedHost=""
    throw error
  }
}
async function controlFloor(action,value){
  if(action==="configure")return configureFloor()
  if(action==="refresh")return{ok:true,floor:await readFloor()}
  const client=await floorTransport()
  const numeric=Number(value)
  let params
  if(action==="on")params={device_on:true}
  else if(action==="off")params={device_on:false}
  else if(action==="brightness")params={device_on:true,brightness:Math.max(1,Math.min(100,Math.round(numeric)||1))}
  else if(action==="temp")params={device_on:true,color_temp:Math.max(2500,Math.min(6500,Math.round(numeric)||2700))}
  else if(action==="color")params={device_on:true,hue:Math.max(0,Math.min(359,Math.round(numeric)||0)),saturation:100,color_temp:0}
  else throw new Error("未対応のランプ操作："+action)
  await client.query({method:"set_device_info",params})
  return{ok:true,floor:await readFloor()}
}
const queue=[];let running=false,web=null
async function processQueue(){if(running)return;running=true;while(queue.length){const item=queue.shift();let result;try{if(item.device==="system"&&item.action==="refreshMode")result={ok:true,mode:await inferMode()};else if(item.device==="system"&&item.action==="refreshAC")result={ok:true,ac:await readACSummary()};else if(item.device==="picture"){result={ok:true,picture:await pictureAction(item.action,item.slot)}}else if(item.device==="quick"){result={ok:true,quick:await quickAction(item.action,item.slot)}}else if(item.device==="tvCursor"){await sonyAction(item.action,false);result={ok:true,label:item.label,action:item.action,mode:await inferMode()}}else if(item.device==="tvAdaptive"){const currentMode=await inferMode();let action=item.action;if(currentMode==="navigation"&&CROSS_NAV[item.slot])action=CROSS_NAV[item.slot];else if(currentMode==="hybrid"&&HYBRID_CURSOR_ROLES.has(item.slot))action=CROSS_NAV[item.slot];await sonyAction(action);result={ok:true,label:item.label,action,mode:await inferMode()}}else if(item.device==="tvOriginal"){await sonyAction(item.action,false);result={ok:true,label:item.label,action:item.action,mode:await inferMode()}}else if(item.device==="tv"){await sonyAction(item.action);result={ok:true,label:item.label,action:item.action,mode:await inferMode()}}else if(item.device==="light"){await runExisting(CONFIG.light.actionScript,item.action);result={ok:true,label:item.label}}else if(item.device==="ac"){await runExisting(CONFIG.ac.actionScript,item.action);result={ok:true,label:item.label,ac:await readACSummary()}}else if(item.device==="floor")result=await controlFloor(item.action,item.label);else throw new Error("不明なデバイスです")}catch(error){result={ok:false,message:error&&error.message?error.message:String(error)}}try{await web.evaluateJavaScript("nativeResult("+JSON.stringify(result)+")")}catch(_){}}running=false}
web=new WebView();web.shouldAllowRequest=request=>{const url=String(request.url||"");if(!url.startsWith("https://yos-remote.local/__action?"))return true;const query=parseQuery(url);if(query.device==="tvHoldStart"){startTVHold(query.action);return false}if(query.device==="tvHoldHeartbeat"){renewTVHold(query.action);return false}if(query.device==="tvHoldStop"){stopTVHold();return false}if(query.device==="lightHoldStart"){startLightHold(query.action);return false}if(query.device==="lightHoldHeartbeat"){renewLightHold(query.action);return false}if(query.device==="lightHoldStop"){stopLightHold();return false}queue.push({device:query.device,action:query.action,label:query.label,slot:query.slot});processQueue();return false}
await web.loadHTML(html,"https://yos-remote.local/");try{await web.evaluateJavaScript("setTimeout(()=>probePictureScene(),250)") }catch(_){}try{await web.evaluateJavaScript("setMode("+JSON.stringify(await inferMode())+")")}catch(_){}try{await web.evaluateJavaScript("setACState("+JSON.stringify(await readACSummary())+")")}catch(_){}await web.present(true);stopTVHold();stopLightHold();await Promise.allSettled([tvHoldPromise,lightHoldPromise]);Script.complete()