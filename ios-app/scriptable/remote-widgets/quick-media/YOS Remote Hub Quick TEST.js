// Variables used by Scriptable.
// icon-color: blue; icon-glyph: tv;
// YOS_SCRIPT_NAME: YOS Remote Hub Quick TEST
// YOS Remote Hub — integrated isolated TEST; v6.6 four-device core retained
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

/* Additive BRAVIA quick studio: no changes to the 12 TV buttons. */
.tv-card{max-height:calc(100dvh - 133px);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none}
.tv-card::-webkit-scrollbar{display:none}
.tv-studio{margin-top:10px;border-top:1px solid #2a3441;padding-top:8px}
.tv-studio h3{margin:0 0 7px;color:#b3c5da;font-size:11px;font-weight:600;letter-spacing:.12em}
.tv-studio .scene-picks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-bottom:10px}
.tv-studio button{border:1px solid #2d4054;border-radius:10px;background:#17212b;color:#e7f1fc;min-height:35px;font:500 12px -apple-system,BlinkMacSystemFont,sans-serif}
.tv-studio button:disabled{opacity:.35}
.tv-studio .compact-adjust{display:grid;grid-template-columns:78px minmax(0,1fr) 35px;align-items:center;gap:7px;margin:4px 0}
.tv-studio .compact-adjust label{font-size:11px;color:#b0bfd1}
.tv-studio .compact-adjust input{min-width:0;width:100%;accent-color:#70a9eb}
.tv-studio .compact-adjust output{color:#b0c9e5;font-variant-numeric:tabular-nums;text-align:right;font-size:11px}
.tv-studio .tv-app-scroll{display:grid;grid-auto-flow:column;grid-auto-columns:calc((100% - 15px)/4);gap:5px;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;padding:1px 0 7px;scrollbar-width:none}
.tv-studio .tv-app-scroll button{scroll-snap-align:start;white-space:normal;overflow:hidden;text-overflow:ellipsis;min-height:44px;font-size:10px}
.tv-studio .tv-text-entry{display:flex;gap:6px;margin-top:7px}
.tv-studio .tv-text-entry input{min-width:0;flex:1;background:#121923;border:1px solid #3a4c60;border-radius:10px;color:#eef6ff;padding:8px;font-size:14px}
.tv-studio .tv-text-entry button{flex:0 0 64px}
.tv-studio .tv-studio-note{font-size:10px;color:#879bb2;line-height:1.4;margin:5px 0 0}
.tv-studio .tv-extra-line{display:flex;gap:8px;align-items:center;margin-top:8px}
.tv-studio .tv-extra-line button{padding:0 10px}
.tv-studio .tv-extra-status{min-width:0;flex:1;font-size:10px;color:#879bb2;line-height:1.4;overflow-wrap:anywhere}
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
.pic-preset{display:grid;grid-template-columns:minmax(0,1fr) auto auto auto;align-items:center;gap:7px;padding:10px 0;border-top:1px solid #2e3138}
.pic-preset button{border:1px solid #464d58;color:#fff;background:#151c26;border-radius:10px;padding:10px 11px}
.pic-preset button:disabled{opacity:.35}
#presetEditor{border-top:1px solid #394451;padding:12px 0}
#presetEditor input[type=text],#presetEditor input[type=number],#presetEditor select,#remoteAppearance select{width:100%;min-width:0;padding:9px;color:#eaf1fa;background:#202832;border:1px solid #404b5a;border-radius:9px;font-size:14px}
.preset-edit-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px;align-items:center;padding:9px 0;border-bottom:1px solid #30353c}
.preset-edit-row label{display:flex;align-items:center;gap:8px;font-size:13px}
#presetHome{display:grid;grid-auto-flow:column;grid-template-columns:none;grid-auto-columns:calc((100% - 10px)/3);gap:5px;overflow-x:auto;scroll-snap-type:x proximity}
#presetHome button{min-height:44px;scroll-snap-align:start;white-space:normal;color:#e7f1fc;background:#17212b;border:1px solid #2d4054;border-radius:10px}
#presetHome button:disabled{opacity:.35}
#tvGrid[data-size=compact] .key{height:48px}
#tvGrid[data-size=large] .key{height:76px}
#remoteAppearance{display:grid;gap:8px;margin:12px 0}
.tv-studio .compact-adjust input,.pic-slider-wrap input[type=range],.pic-big-bar{min-height:44px;appearance:none;-webkit-appearance:none;background:transparent}
.tv-studio .compact-adjust input::-webkit-slider-runnable-track,.pic-slider-wrap input[type=range]::-webkit-slider-runnable-track,.pic-big-bar::-webkit-slider-runnable-track{height:10px;border-radius:10px;background:#53677f}
.tv-studio .compact-adjust input::-webkit-slider-thumb,.pic-slider-wrap input[type=range]::-webkit-slider-thumb,.pic-big-bar::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;margin-top:-8px;background:#dbe9fa;border-radius:50%;border:1px solid #9ab7d9}
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
#yosHome{box-sizing:border-box;background:#101522;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans",sans-serif;height:100dvh;max-width:530px;margin:auto;padding:max(72px,env(safe-area-inset-top)) 14px max(10px,env(safe-area-inset-bottom));display:grid;grid-template-rows:32px 22px minmax(132px,3fr) 22px minmax(88px,1.8fr) minmax(0,auto) 58px;gap:10px;overflow:hidden}#yosHome *{box-sizing:border-box}#yosHome header{display:flex;align-items:center;justify-content:space-between}#yosHome h1{font-size:22px;margin:0;letter-spacing:-.03em}#yosHome h2{font-size:14px;color:#aab5ce;font-weight:500;margin:0;align-self:end}#yosHome button{font:inherit;color:#fff;border:0;min-width:0;cursor:pointer;-webkit-tap-highlight-color:transparent}#yosHome svg{width:24px;height:24px;stroke:#c4c7ff;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex-shrink:0}#yosHome .homeGear{background:none;min-height:44px;min-width:44px}#yosHome .homeScenes,#yosHome .homeDevices{display:grid;gap:9px;min-height:0}#yosHome .homeScenes{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr))}#yosHome .homeDevices{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}#yosHome .homeTile,#yosHome .homeDevice{background:#222b42;border-radius:18px;min-height:44px;display:flex;align-items:center;justify-content:center;gap:6px;padding:6px;font-size:clamp(12px,3.8vw,17px)}#yosHome .homeTile{flex-direction:column}#yosHome .homeDevice{justify-content:flex-start;padding-inline:10px;gap:7px;text-align:left}#yosHome .homeDevice span{flex:1;line-height:1.2}#yosHome .homeDevice svg:last-child{width:16px}#yosHome nav{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid #30394c;padding-top:6px}#yosHome .homeNav{display:grid;place-items:center;align-content:center;gap:3px;background:none;color:#aab5ce;font-size:12px}#yosHome .homeNav.active{color:#c4c7ff}#yosHome button:focus-visible{outline:2px solid #c4c7ff;outline-offset:-2px}#yosHome button:disabled{opacity:.5}#homeFeedback{font-size:12px;color:#aab5ce;max-height:36px;overflow:auto}#homeFeedback:empty{display:none}@media(max-height:650px){#yosHome{gap:6px;padding-left:10px;padding-right:10px;grid-template-rows:28px 18px minmax(132px,3fr) 18px minmax(88px,1.8fr) minmax(0,auto) 48px}#yosHome .homeTile,#yosHome .homeDevice{border-radius:14px}#yosHome svg{width:21px;height:21px}}
#yosHome[hidden],#homeSettings[hidden],#homeDetailNav[hidden],.page[hidden]{display:none!important}
#yosHome nav{grid-row:7}#homeFeedback{grid-row:6}
#homeDetailNav{position:fixed;bottom:0;left:0;right:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:6px 12px max(8px,env(safe-area-inset-bottom));background:#101522;z-index:3}
#homeDetailNav button,#homeSettings button{min-height:44px;background:#222b42;color:white;border:1px solid #30394c;border-radius:12px}
#homeDetailNav button[aria-current="page"],#homeSettings button[aria-pressed="true"]{border-color:#c4c7ff;color:#c4c7ff}
body:has(#homeDetailNav:not([hidden])) .page{height:calc(100dvh - 66px - env(safe-area-inset-bottom))}
#homeSettings{background:#101522;color:#fff;height:calc(100dvh - 66px - env(safe-area-inset-bottom));max-width:530px;margin:auto;padding:max(72px,env(safe-area-inset-top)) 12px 10px;overflow:auto}
#homeSettings h1{font-size:22px;margin:0 0 6px}#homeSettings p{font-size:12px;color:#aab5ce;margin:6px 0}
#homeModeTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}#homeSettingRows>div{display:grid;grid-template-columns:1.2fr repeat(3,1fr);gap:5px;align-items:center;margin:8px 0;font-size:13px}
#homeSave,#homeReload{width:100%;margin-top:6px}
#homeFlickPad{touch-action:none;display:grid;place-items:center;min-height:58px;margin:4px 0;background:#222b42;color:#c4c7ff;border:1px solid #414c67;border-radius:16px;font-size:13px;user-select:none}
@media(max-height:650px){#yosHome{padding-top:max(58px,env(safe-area-inset-top));gap:5px}#homeSettings{padding-top:max(58px,env(safe-area-inset-top))}}
#homePageSwitch{display:grid;grid-template-columns:44px 1fr 44px;align-items:center;text-align:center;touch-action:none;min-height:44px;color:#c4c7ff}#homePageSwitch button{min-height:44px;border:0;background:transparent;color:inherit;font-size:24px}#homePageSwitch button:disabled{opacity:.25}#homePageSwitch output{pointer-events:none}.remote-panel{background:#171c26!important;box-shadow:none!important}#homeFlickPad{min-height:100px}#homeLauncherHandle{width:100%;min-height:44px;touch-action:none;background:#222936;color:#e4e8f1;border:1px solid #414957;border-radius:12px}#tvAppScroll{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));grid-auto-flow:row!important;grid-auto-columns:auto!important;grid-auto-rows:minmax(44px,auto);overflow:hidden!important;scroll-snap-type:none;gap:5px}#tvAppScroll>*:nth-child(n+9){display:none!important}#tvAppScroll.home-expanded{grid-template-columns:repeat(3,minmax(0,1fr));max-height:240px;overflow-y:auto!important;overflow-x:hidden!important}#tvAppScroll.home-expanded>*:nth-child(n+9){display:block!important}#tvAppScroll>*{min-width:0!important;max-width:100%;overflow:hidden} .home-fixed-keys{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px;margin:4px 0}.home-fixed-keys button{min-height:44px;background:#252c38;color:#edf0f6;border:1px solid #414957;border-radius:10px;font-size:12px}.tv-card .top-shortcuts{display:none!important}.tv-card:before{display:none!important}#homeCustomKeys summary{min-height:44px;display:flex;align-items:center;color:#c4c7ff;font-size:13px}#homeFlickPad{min-height:120px} #homeTVExtras>summary{display:flex;align-items:center;justify-content:center;min-height:44px;color:#c4c7ff;font-size:13px;cursor:pointer}#homeTVExtras[open]{border-top:1px solid #30394c}#homeTVExtras .compact-adjust{display:grid;grid-template-columns:78px minmax(0,1fr) 35px;align-items:center;gap:7px;margin:4px 0}#homeTVExtras .compact-adjust input{width:100%;min-width:0;min-height:44px;accent-color:#70a9eb}#homeLayoutEditor label{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;color:#e4e8f1;font-size:13px}#homeLayoutEditor select{min-height:44px;max-width:58%;background:#222b42;color:white;border:1px solid #414957;border-radius:8px}#homeLayoutEditor button{min-height:44px} .tv-card .homePower{min-width:44px;min-height:44px}.tv-card .head{height:auto;min-height:44px;gap:4px}.tv-card .head .tools{flex-wrap:wrap;justify-content:flex-end}.tv-card .head .tool{min-height:44px}.tv-card .tv-studio{margin-top:5px;padding-top:5px}.tv-card .tv-studio .scene-picks{margin-bottom:2px}.tv-card #presetHome button{min-height:44px}.home-launcher-bar{display:grid;grid-template-columns:minmax(0,1fr) 60px;gap:5px;align-items:center}.home-launcher-bar .tool{min-height:44px}#homeFlickPad{min-height:clamp(84px,14dvh,136px)}#tvAppScroll{padding-bottom:2px}.tv-card:has(#homeTVExtras:not([open])){scrollbar-width:none} .home-layout-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;margin:4px 0}.home-layout-bar button,#homeUnifiedEditor button,#homeUnifiedEditor select,#homeUnifiedEditor input{min-height:44px;color:#fff;background:#252c38;border:1px solid #414957;border-radius:8px;padding:5px}#homeUnifiedEditor[hidden]{display:none!important}#homeUnifiedEditor{display:grid;gap:5px;padding:8px;border:1px solid #626d9b;border-radius:12px;margin:5px 0}#homeUnifiedEditor label{display:flex;align-items:center;justify-content:space-between;gap:5px}#homeUnifiedEditor select,#homeUnifiedEditor input{max-width:100%;min-width:0}#homeUnifiedEditor [hidden]{display:none!important}.home-selected{outline:2px solid #aab9ff!important}body:has(#homeUnifiedEditor:not([hidden])) [data-home-slot]{touch-action:none} [data-home-slot]{user-select:none;overflow-wrap:anywhere} #homeAllApps summary{min-height:44px;display:flex;align-items:center}#homeAllApps>div{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;max-height:240px;overflow-y:auto}#homeAllApps button{min-height:44px;overflow-wrap:anywhere;background:#252c38;color:white;border:1px solid #414957;border-radius:8px}
/* YOS HOME Glass M — approved compact layout, no background image */
:root{color-scheme:dark;--glass-bg:#101522;--glass-ink:#f4f5fc;--glass-muted:#aebbd1;--glass-edge:#667798;--glass-accent:#b4c8ff;--glass-button:linear-gradient(155deg,#34415a,#222a3d 65%,#29354c);--glass-shadow:inset 0 1px 1px #dce5ff22,0 3px 8px #05091344}
html,body{background:var(--glass-bg);color:var(--glass-ink)}
body{padding:0 10px}
.page{position:relative;gap:5px;padding-top:max(58px,env(safe-area-inset-top));padding-bottom:8px}
#homePageSwitch{min-height:44px;color:#cbd6ef;font-size:14px;letter-spacing:.025em}
#homePageSwitch button{color:#b9caff}
.remote-panel{--glass-accent:#b4c8ff;background:transparent!important;border:0!important;border-radius:20px;padding:7px 8px;overflow-y:auto;scrollbar-width:none;overscroll-behavior:contain}
.remote-panel.active{flex:1 1 0;min-height:0;max-height:none}
.remote-panel::-webkit-scrollbar{display:none}
.remote-panel .head{min-height:44px;height:auto;margin-bottom:8px;gap:5px}
.remote-panel .title{font-size:24px;font-weight:750;letter-spacing:-.035em}
.remote-panel .title:after{color:var(--glass-accent)}
.remote-panel .brand,.floor-state,.floor-footnote{color:var(--glass-muted)}
.remote-panel .key,.remote-panel .tool,.home-fixed-keys button,#homeLauncherHandle,#tvAppScroll button,.floor-power button,.floor-temp button{background:var(--glass-button);border:1px solid #6d80a36b;border-radius:17px;box-shadow:var(--glass-shadow);color:var(--glass-ink);transition:transform .14s ease,filter .14s ease;min-height:44px}
.remote-panel button:active{transform:scale(.96);filter:brightness(1.2)}
.remote-panel button:focus-visible,#homeDetailNav button:focus-visible{outline:2px solid var(--glass-accent);outline-offset:-3px}
.remote-panel button:disabled{opacity:.45}
.remote-panel .tool{color:var(--glass-accent);font-size:13px}
.tv-card .head{flex-wrap:wrap;justify-content:center;gap:6px;margin-bottom:7px}
.tv-card .head .title{flex:1 1 100%;justify-content:center;font-size:26px;min-height:32px}
.tv-card .head .tools{width:100%;justify-content:flex-end;gap:5px}
.tv-card .head .tools .tool{border:0;box-shadow:none;background:transparent;color:#c6d2ef;min-height:44px;min-width:44px;padding:0 7px}
.tv-card .head .tools .homePower{margin-right:auto;background:linear-gradient(145deg,#594653,#342a3b);border:1px solid #a37c94;color:#ffd4df;border-radius:15px}
.tv-card .mode-badge{color:#aebbd1}
.home-fixed-keys{gap:8px;margin:8px 0}
.home-fixed-keys button{min-height:clamp(54px,8dvh,74px);padding:5px 3px;font-size:12px;line-height:1.2;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px}
.home-fixed-keys button[data-glass-icon]:not([data-glass-icon=""])::before{content:attr(data-glass-icon);font-size:23px;line-height:1.05;color:#d6e4ff;font-weight:500}
#homeFlickPad{position:relative;min-height:clamp(116px,23dvh,204px);border-radius:24px;background:radial-gradient(ellipse at 90% 100%,#778cff66,transparent 64%),linear-gradient(150deg,#344467,#1e2b4b 63%,#354c80);border:1px solid #819de0;box-shadow:inset 0 0 20px #91a8ff20,0 3px 12px #10162d55;color:#dbe5ff;font-size:13px;gap:8px;align-content:center}
#homeFlickPad .glass-pad-icon{width:92px;height:82px;pointer-events:none;stroke:#d3deff;fill:none;stroke-linecap:round;stroke-linejoin:round;stroke-width:2}
#homeFlickPad span{pointer-events:none}
.tv-card .tv-studio{border:0;margin-top:10px;padding:0}
#presetHome{gap:8px}
.tv-card #presetHome button{min-height:46px;background:var(--glass-button);border:1px solid #6d80a36b;box-shadow:var(--glass-shadow);border-radius:999px;color:#f2f5ff;font-size:14px}
#presetHome button::before{display:inline-block;margin-right:7px;color:#c7d8ff;font-size:19px;vertical-align:middle}
#tvPresetDay::before{content:"☀"}#tvPresetNight::before{content:"☾"}#tvPresetMovie::before{content:"▤"}
.tv-studio .compact-adjust{margin:8px 0;min-height:44px;color:var(--glass-muted)}
.tv-studio .compact-adjust input::-webkit-slider-runnable-track{background:linear-gradient(90deg,#8ea8f3,#46536d)}
.tv-studio .compact-adjust input::-webkit-slider-thumb{background:#f1f4ff;border:1px solid #dbe5ff}
.home-launcher-bar{margin-top:10px;grid-template-columns:minmax(0,1fr);border-top:1px solid #66779866;padding-top:8px}
#homeLauncherHandle{background:transparent;border:0;box-shadow:none;min-height:58px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;font-size:14px;color:#e1e9ff}
#homeLauncherHandle::before{content:"";height:4px;width:34px;background:#9cabc6;border-radius:999px;pointer-events:none}
.tv-card:not(:has(#tvAppScroll.home-expanded)) .home-launcher-bar .tool,.tv-card:not(:has(#tvAppScroll.home-expanded)) #homeTVExtras{display:none!important}
#tvAppScroll:not(.home-expanded){display:none!important}
#tvAppScroll.home-expanded{grid-template-columns:repeat(3,minmax(0,1fr));max-height:220px;padding:4px 0;gap:8px}
#tvAppScroll.home-expanded button{min-height:48px;font-size:12px}
.tv-card #tvAppScroll.home-expanded > button[data-glass-empty="true"]{display:none!important}
.tv-card:has(#homeUnifiedEditor:not([hidden])) #tvAppScroll.home-expanded > button[data-glass-empty="true"]{display:block!important}
#homeTVExtras{margin-top:8px}
#homeTVExtras>summary{color:#d2dfff}
#homeTVExtras .home-layout-bar{padding:6px 0;color:var(--glass-muted)}
#homeUnifiedEditor{background:#273247;border-color:#7182a2}
[data-panel="light"]{--glass-accent:#ffd398}
[data-panel="ac"]{--glass-accent:#a7e5ff}
[data-panel="floor"]{--glass-accent:#e5bbff}
[data-panel="light"].active,[data-panel="ac"].active{display:flex;flex-direction:column}
[data-panel="light"]>.grid,[data-panel="ac"]>.grid{margin-top:auto;margin-bottom:clamp(8px,7dvh,60px);gap:10px}
[data-panel="light"]>.grid .key,[data-panel="ac"]>.grid .key{height:clamp(76px,13dvh,116px);align-items:center;justify-content:center;text-align:center;gap:8px}
.remote-panel .icon{color:var(--glass-accent);font-size:28px}
.remote-panel .label{font-size:13px;white-space:normal}
[data-panel="ac"] .ac-temp{font-size:31px;color:var(--glass-accent)}
.floor-power button{min-height:54px}.floor-heading{color:#dce3f5}
.floor-swatch{border-color:#c8d2f380}.floor-slider{min-height:44px;accent-color:#e5bbff}.floor-temp button{min-height:48px}
#yosHome,#homeSettings{background:var(--glass-bg)}
#yosHome h1{font-size:26px;letter-spacing:-.04em}
#yosHome .homeTile,#yosHome .homeDevice{background:var(--glass-button);border:1px solid #6d80a35c;box-shadow:var(--glass-shadow);border-radius:20px}
#yosHome .homeTile svg,#yosHome .homeDevice svg{stroke:var(--scene,#c8d8ff)}
#yosHome [data-home-id="arrival"],#yosHome [data-home-id="wake"],#yosHome [data-home-id="light"]{--scene:#ffd398}
#yosHome [data-home-id="sleep"],#yosHome [data-home-id="night"],#yosHome [data-home-id="movie"],#yosHome [data-home-id="floor"]{--scene:#e5bbff}
#yosHome [data-home-id="relax"],#yosHome [data-home-id="clean"]{--scene:#a4e8c9}
#yosHome [data-home-id="ac"]{--scene:#a7e5ff}
#homeDetailNav{background:#151c2c;border-top:1px solid #6d80a355;gap:4px}
#homeDetailNav button{background:transparent;border:0;box-shadow:none;color:#aebbd1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:12px;min-height:54px}
#homeDetailNav button::before{font-size:22px;line-height:1.1;color:inherit}
#homeDetailNav button[data-detail="home"]::before{content:"⌂"}#homeDetailNav button[data-detail="remote"]::before{content:"☷"}#homeDetailNav button[data-detail="settings"]::before{content:"⚙"}
#homeDetailNav button[aria-current="page"]{border:0;color:#c9d9ff;background:radial-gradient(ellipse at bottom,#536ec566,transparent 75%)}
@media(max-width:360px){.remote-panel{padding-inline:4px}.home-fixed-keys{gap:5px}.home-fixed-keys button{font-size:11px}#homeFlickPad{min-height:112px}}
@media(max-height:700px){.tv-card .head .title{font-size:22px;min-height:26px}.home-fixed-keys button{min-height:50px}.home-fixed-keys{margin:5px 0}#homeFlickPad{min-height:110px}.remote-panel{padding-block:3px}.home-launcher-bar{padding-top:4px;margin-top:4px}#homeLauncherHandle{min-height:48px}.tv-card .tv-studio{margin-top:5px}}
@media(prefers-reduced-motion:reduce){.remote-panel button{transition:none}}

/* Glass M presentation fidelity and meaningful status */
#homePageSwitch.glass-tv-page{grid-template-rows:32px 44px;min-height:76px}
#homePageSwitch.glass-tv-page #homeTVBrand{grid-row:1;grid-column:2;background:transparent;border:0;color:#f4f5fc;font-weight:750;font-size:26px;line-height:1.1;min-height:32px;justify-content:center;padding:0;letter-spacing:.025em}
#homeTVBrand::after{display:none}
#homePageSwitch.glass-tv-page [data-prev]{grid-row:2;grid-column:1}
#homePageSwitch.glass-tv-page output{grid-row:2;grid-column:2}
#homePageSwitch.glass-tv-page [data-next]{grid-row:2;grid-column:3}
#homeTVBrand:focus-visible{outline:2px solid #b4c8ff;outline-offset:-3px}
.tv-card .head .tools{justify-content:flex-end}
.glass-layout-status{display:block;color:#c5d2ed;font-size:11px;line-height:1.4;overflow-wrap:anywhere;padding:4px 6px;min-height:18px}
.glass-layout-status[data-glass-show="false"]{display:none}
.home-fixed-keys button[data-glass-icon]:not([data-glass-icon=""])::before{content:"";width:24px;height:24px;display:block;flex-shrink:0;background:#d6e4ff;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;-webkit-mask-position:center;mask-position:center;-webkit-mask-size:contain;mask-size:contain}
.home-fixed-keys button[data-glass-icon="back"]::before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M9%2010H4l5-5M4%2010h11a5%205%200%201%201%200%2010h-3%22%2F%3E%3C%2Fsvg%3E");mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M9%2010H4l5-5M4%2010h11a5%205%200%201%201%200%2010h-3%22%2F%3E%3C%2Fsvg%3E")}
.home-fixed-keys button[data-glass-icon="home"]::before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m3%2010%209-7%209%207v10a1%201%200%200%201-1%201h-5v-7H9v7H4a1%201%200%200%201-1-1Z%22%2F%3E%3C%2Fsvg%3E");mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m3%2010%209-7%209%207v10a1%201%200%200%201-1%201h-5v-7H9v7H4a1%201%200%200%201-1-1Z%22%2F%3E%3C%2Fsvg%3E")}
.home-fixed-keys button[data-glass-icon="quick"]::before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m13%202-9%2012h7l-1%208%2010-13h-7z%22%2F%3E%3C%2Fsvg%3E");mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22m13%202-9%2012h7l-1%208%2010-13h-7z%22%2F%3E%3C%2Fsvg%3E")}
.home-fixed-keys button[data-glass-icon="input"]::before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M13%204h5a2%202%200%200%201%202%202v12a2%202%200%200%201-2%202h-5M3%2012h12m-5-5%205%205-5%205%22%2F%3E%3C%2Fsvg%3E");mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M13%204h5a2%202%200%200%201%202%202v12a2%202%200%200%201-2%202h-5M3%2012h12m-5-5%205%205-5%205%22%2F%3E%3C%2Fsvg%3E")}
.home-fixed-keys button[data-glass-icon="volumeDown"]::before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4%209h4l5-4v14l-5-4H4zM17%2012h5%22%2F%3E%3C%2Fsvg%3E");mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4%209h4l5-4v14l-5-4H4zM17%2012h5%22%2F%3E%3C%2Fsvg%3E")}
.home-fixed-keys button[data-glass-icon="mute"]::before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4%209h4l5-4v14l-5-4H4zM17%209l5%206m0-6-5%206%22%2F%3E%3C%2Fsvg%3E");mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M4%209h4l5-4v14l-5-4H4zM17%209l5%206m0-6-5%206%22%2F%3E%3C%2Fsvg%3E")}
.home-fixed-keys button[data-glass-icon="volumeUp"]::before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%209h4l5-4v14l-5-4H3zM16%208a6%206%200%200%201%200%208m3-11a10%2010%200%200%201%200%2014%22%2F%3E%3C%2Fsvg%3E");mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M3%209h4l5-4v14l-5-4H3zM16%208a6%206%200%200%201%200%208m3-11a10%2010%200%200%201%200%2014%22%2F%3E%3C%2Fsvg%3E")}
.home-fixed-keys button[data-glass-icon="stop"]::before{-webkit-mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%225%22%20y%3D%225%22%20width%3D%2214%22%20height%3D%2214%22%20rx%3D%223%22%2F%3E%3C%2Fsvg%3E");mask-image:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22black%22%20stroke-width%3D%221.9%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Crect%20x%3D%225%22%20y%3D%225%22%20width%3D%2214%22%20height%3D%2214%22%20rx%3D%223%22%2F%3E%3C%2Fsvg%3E")}
@media(max-height:700px){#homePageSwitch.glass-tv-page{grid-template-rows:26px 44px;min-height:70px}#homePageSwitch.glass-tv-page #homeTVBrand{font-size:22px;min-height:26px}}
</style></head><body><section id="yosHome" aria-label="YOS HOME"><header><h1>YOS HOME</h1><button type="button" class="homeGear" data-home-kind="nav" data-home-id="settings" aria-label="設定"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-gear"></use></svg></button></header><h2>生活モード</h2><div class="homeScenes"><button type="button" class="homeTile" data-home-kind="scene" data-home-id="departure" aria-label="外出"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-departure"></use></svg><span>外出</span></button><button type="button" class="homeTile" data-home-kind="scene" data-home-id="arrival" aria-label="帰宅"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-arrival"></use></svg><span>帰宅</span></button><button type="button" class="homeTile" data-home-kind="scene" data-home-id="sleep" aria-label="就寝"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-sleep"></use></svg><span>就寝</span></button><button type="button" class="homeTile" data-home-kind="scene" data-home-id="wake" aria-label="起床"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-wake"></use></svg><span>起床</span></button><button type="button" class="homeTile" data-home-kind="scene" data-home-id="night" aria-label="夜"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-night"></use></svg><span>夜</span></button><button type="button" class="homeTile" data-home-kind="scene" data-home-id="movie" aria-label="映画"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-movie"></use></svg><span>映画</span></button><button type="button" class="homeTile" data-home-kind="scene" data-home-id="relax" aria-label="リラックス"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-relax"></use></svg><span>リラックス</span></button><button type="button" class="homeTile" data-home-kind="scene" data-home-id="clean" aria-label="掃除"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-clean"></use></svg><span>掃除</span></button><button type="button" class="homeTile" data-home-kind="scene" data-home-id="focus" aria-label="集中"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-focus"></use></svg><span>集中</span></button></div><h2>家電リモコン</h2><div class="homeDevices"><button type="button" class="homeDevice" data-home-kind="device" data-home-id="tv" aria-label="テレビ"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-tv"></use></svg><span>テレビ</span><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-chevron"></use></svg></button><button type="button" class="homeDevice" data-home-kind="device" data-home-id="light" aria-label="天井照明"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-light"></use></svg><span>天井照明</span><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-chevron"></use></svg></button><button type="button" class="homeDevice" data-home-kind="device" data-home-id="ac" aria-label="エアコン"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-ac"></use></svg><span>エアコン</span><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-chevron"></use></svg></button><button type="button" class="homeDevice" data-home-kind="device" data-home-id="floor" aria-label="フロアランプ"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-floor"></use></svg><span>フロアランプ</span><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-chevron"></use></svg></button></div><output id="homeFeedback" role="status" aria-live="polite"></output><nav aria-label="画面切替"><button type="button" class="homeNav active" data-home-kind="nav" data-home-id="home" aria-label="ホーム"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-arrival"></use></svg><span>ホーム</span></button><button type="button" class="homeNav" data-home-kind="nav" data-home-id="remote" aria-label="リモコン"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-controls"></use></svg><span>リモコン</span></button><button type="button" class="homeNav" data-home-kind="nav" data-home-id="settings" aria-label="設定"><svg aria-hidden="true" viewBox="0 0 24 24"><use href="#icon-gear"></use></svg><span>設定</span></button></nav></section><svg aria-hidden="true" style="position:absolute;width:0;height:0"><symbol id="icon-tv" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/></symbol><symbol id="icon-light" viewBox="0 0 24 24"><path d="M9 18h6m-6-3h6m-6-3a7 7 0 1 1 6 0l-1 3h-4l-1-3Z"/><path d="M10 21h4"/></symbol><symbol id="icon-ac" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="10" rx="2"/><path d="M6 11h12m-12 8v-2m6 4v-4m6 2v-2"/></symbol><symbol id="icon-floor" viewBox="0 0 24 24"><path d="M8 4h8l3 8H5zM12 12v9m-5 0h10"/></symbol><symbol id="icon-departure" viewBox="0 0 24 24"><path d="M10 4H5v16h5m3-12 4 4-4 4m-5-4h13"/></symbol><symbol id="icon-arrival" viewBox="0 0 24 24"><path d="m3 11 9-8 9 8v9H3zM9 20v-7h6v7"/></symbol><symbol id="icon-sleep" viewBox="0 0 24 24"><path d="M20 16a8 8 0 0 1-12-12 8 8 0 1 0 12 12Z"/></symbol><symbol id="icon-wake" viewBox="0 0 24 24"><path d="M2 19h20M4 15h3m2-6 1 3m9-3-2 3m0 3h3M8 16a4 4 0 0 1 8 0M12 3v4"/></symbol><symbol id="icon-night" viewBox="0 0 24 24"><path d="M20 16a8 8 0 0 1-12-12 8 8 0 1 0 12 12Zm-3-12v6m-3-3h6"/></symbol><symbol id="icon-movie" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4m10 0h4M3 15h4m10 0h4m-11-9 0 0m6 4-4 3V10l4 3Z"/></symbol><symbol id="icon-relax" viewBox="0 0 24 24"><path d="M4 10h15v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM19 11h2v4l-3 2M8 3c-3 2 2 3 0 5M13 3c-3 2 2 3 0 5"/></symbol><symbol id="icon-clean" viewBox="0 0 24 24"><path d="m12 2 2.1 5.9L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-2.1L12 2ZM20 16l1 2-1 2-1-2-2-2 3 0Z"/></symbol><symbol id="icon-focus" viewBox="0 0 24 24"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/></symbol><symbol id="icon-gear" viewBox="0 0 24 24"><path d="m10 2-.4 2-2 1-2-.8-2 3 1.5 1.7v2.2L3.5 13l2 3 2-.8 2 1 .5 2h4l.4-2 2-1 2 .8 2-3-1.5-1.7V9l1.5-1.8-2-3-2 .8-2-1L14 2h-4Z"/><circle cx="12" cy="10" r="2"/></symbol><symbol id="icon-stack" viewBox="0 0 24 24"><path d="m12 2 9 6-9 6-9-6 9-6Zm-9 11 9 6 9-6m-18 4 9 5 9-5"/></symbol><symbol id="icon-controls" viewBox="0 0 24 24"><path d="M3 5h18M3 12h18M3 19h18"/><path d="M8 3v4m8 3v4m-6 3v4"/></symbol><symbol id="icon-chevron" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol></svg><nav id="homeDetailNav" hidden aria-label="画面切替"><button data-detail="home">ホーム</button><button data-detail="remote">リモコン</button><button data-detail="settings">設定</button></nav><section id="homeSettings" hidden><h1>生活モード設定</h1><p>家電ごとに ON／OFF／維持を選択。保存のみでは操作しません。</p><div id="homeModeTabs"></div><div id="homeSettingRows"></div><p id="homeSettingStatus" role="status" aria-live="polite"></p><button id="homeSave" disabled>設定を保存</button><button id="homeReload">設定を読み直す（未保存変更は破棄）</button></section><div class="page" hidden><nav id="homePageSwitch" aria-label="左右スライドで家電切替"><button data-prev aria-label="前の家電">‹</button><output aria-live="polite">テレビ 1/4</output><button data-next aria-label="次の家電">›</button></nav>
<section class="card tv-card remote-panel active" data-panel="tv"><div class="top-shortcuts"><button class="top-shortcut" onclick="sendTVShortcut(event,'input','入力')">↪︎ 入力</button><button class="top-shortcut" onclick="sendTVShortcut(event,'home','ホーム')">⌂ ホーム</button></div><div class="head" id="homeTVHead"><button type="button" class="title" id="homeTVBrand" aria-label="BRAVIA 詳細リモコン" onclick="openRemote('tv')">BRAVIA</button><div class="tools"><button type="button" class="tool homePower" aria-label="テレビ電源" onclick="sendTVShortcut(event,'power','電源')">⏻</button><span id="modeBadge" class="mode-badge">判定中</span><button class="tool" onclick="openPictureEditor(event)">画質</button><button class="tool" id="homeLayoutOpen" aria-label="配置編集">⚙</button><button class="tool" onclick="sendMenu(event)">MENU</button></div></div><div class="home-fixed-keys"><button onclick="sendTVShortcut(event,'back','戻る')">戻る</button><button onclick="sendTVShortcut(event,'home','ホーム')">ホーム</button><button onclick="sendTVShortcut(event,'quick','クイック')">クイック</button><button onclick="sendTVShortcut(event,'input','入力')">入力</button></div><div id="homeFlickPad" role="button" tabindex="0" aria-label="フリック操作・タップで決定または再生"><svg class="glass-pad-icon" aria-hidden="true" viewBox="0 0 92 82"><path d="m40 9 6-6 6 6M40 73l6 6 6-6M9 35l-6 6 6 6M83 35l6 6-6 6"/><path d="M29 39a17 17 0 0 1 34 0M34 49v-9a12 12 0 0 1 24 0v9M40 57c2-4 2-10 2-16a4 4 0 0 1 8 0v14M28 47v5m26 2-2 6m-15-1-2 4"/></svg><span>フリック・タップ操作</span></div><div class="home-fixed-keys"><button onclick="sendTVShortcut(event,'volumeDown','音量−')">音量−</button><button onclick="sendTVShortcut(event,'mute','消音')">消音</button><button onclick="sendTVShortcut(event,'volumeUp','音量＋')">音量＋</button><button onclick="sendTVShortcut(event,'stop','停止')">停止</button></div>


<div class="tv-studio" aria-label="BRAVIA クイックスタジオ">
 
 <span id="homePresetAnchor" hidden></span><div class="scene-picks" id="presetHome"><button onclick="loadPicturePreset(event,'day')" id="tvPresetDay" disabled>昼</button><button onclick="loadPicturePreset(event,'night')" id="tvPresetNight" disabled>夜</button><button onclick="loadPicturePreset(event,'movie')" id="tvPresetMovie" disabled>映画</button></div>
 <div class="compact-adjust"><label for="tvBrightness">明るさ</label><input id="tvBrightness" type="range" min="0" max="100" value="0" disabled oninput="previewTVCompact(event,'brightness')" onchange="commitTVCompact(event,'brightness')"><output id="tvBrightnessVal">--</output></div>
 
 <div class="home-launcher-bar"><button id="homeLauncherHandle" type="button" aria-expanded="false" aria-controls="tvAppScroll">アプリ一覧　⌃</button>
 <button class="tool" onclick="nativeAction('tvApps','list','アプリ一覧')">更新</button></div>
 <div id="tvAppScroll" class="tv-app-scroll" aria-label="BRAVIAアプリ一覧"><button onclick="nativeAction('tvApps','list','アプリ一覧')">アプリ取得</button></div>
 
 
</div><details id="homeTVExtras"><summary>詳細操作・配置編集</summary><button class="tool" onclick="openLayoutEditor(event)">旧12枠・配置設定</button><div class="tv-studio home-extra-content"><details id="homeCustomKeys"><summary>カスタム操作・長押し</summary><div id="tvGrid" class="grid grid-3"></div></details><div class="picture-quick">
  <button onclick="openQuickEditor(event)">⚡ メディア</button>
  <button onclick="sendTVShortcut(event,'pictureOff','消画')">▣ 消画</button>
  <button onclick="openShortcuts(event)">☆ 保存画質</button>
</div><div id="quickPictureModes" class="quick-modes" aria-label="画質モード切替"><span class="pic-manual">画質モードを確認中…</span></div><div class="compact-adjust"><label for="tvContrast">コントラスト</label><input id="tvContrast" type="range" min="0" max="100" value="0" disabled oninput="previewTVCompact(event,'contrast')" onchange="commitTVCompact(event,'contrast')"><output id="tvContrastVal">--</output></div><div class="tv-text-entry"><input id="tvTextInput" type="text" maxlength="140" placeholder="テレビで入力欄を開いて文字入力" aria-label="BRAVIAへ送るテキスト"><button onclick="sendTVText(event)">送信</button></div>
 <p class="tv-studio-note">文字はテレビの検索欄が開いているときのみ。パスワード等の機密情報は入力しないでください。</p><div class="tv-extra-line"><button onclick="openTVVPN(event)">VPNアプリ</button><span class="tv-extra-status" id="tvExtraStatus">VPNのON/OFFは接続アプリの対応確認後</span></div></div></details></section>
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
<div id="configLayer" class="config-layer"><div class="config-card"><div class="config-head"><div class="config-title">BRAVIA 配置</div><div class="config-actions"><button class="tool" onclick="resetLayout(event)">初期化</button><button class="tool" onclick="closeLayoutEditor(event)">完了</button></div></div><p class="config-help">12枠内は「移動元 → 移動先」で入れ替え。再生位置が自動カーソルの中心。中央キーはタップ最優先で決定、24px以上動かした時だけスワイプとして上下左右へ移動します。切替中の長押しは元機能です。</p><div id="remoteAppearance"><label>操作ボタンの大きさ<select id="remoteSize" onchange="changeRemoteAppearance()"><option value="standard">標準</option><option value="compact">コンパクト</option><option value="large">大きめ</option></select></label><label>画質プリセットの位置<select id="presetPosition" onchange="changeRemoteAppearance()"><option value="below">12キーの下</option><option value="above">12キーの上</option></select></label></div><div class="section-label">表示中の12枠</div><div id="configGrid" class="config-grid"></div><div class="section-label">使えるBRAVIAボタン</div><div id="palette" class="palette"></div></div></div>
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
  <button class="tool" onclick="probePictureScene(event)">現在の設定を再取得</button><button class="tool" id="discoverPictureButton" onclick="startPictureDiscovery(event)">追加画質項目を調査</button><p id="discoverPictureStatus" class="pic-status" role="status" aria-live="polite" hidden></p>
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
  <p class="config-help">昼・夜・映画は自由登録です。「編集」で名前、モード、適用項目を指定。「現在を保存」で今の画質を登録。保存だけではテレビを変更しません。</p>
  <div id="picturePresets"></div><div id="presetEditor" hidden></div>
  <p id="shortcutsStatus" class="pic-status" aria-live="polite">設定を確認中</p>
  <button class="tool" onclick="probePictureScene(event)">登録状況を再取得</button>
</div></div>
<script>
const REMOTES=${JSON.stringify(REMOTES)},ACTIONS=${JSON.stringify(TV_ACTIONS)},DEFAULT=${JSON.stringify(TV_DEFAULT)},CROSS_NAV=${JSON.stringify(CROSS_NAV)},SWIPE_THRESHOLD=${SWIPE_THRESHOLD},TV_SEEK_ACTIONS=new Set(["rewind","fastForward"])
const LAYOUT_KEY="yos.remote.tv.buttons.v52"
let mode="navigation",nonce=0,pollTimer=null,acTimer=null,selectedSlot=null,gestureSuppressUntil=0
const PANEL_KEY="yos.remote.selected-panel.v1"
let activePanel="tv"
function setPanel(name){if(!["tv","light","ac","floor"].includes(name))return;stopActiveHolds();activePanel=name;document.querySelectorAll(".remote-panel").forEach(el=>el.classList.toggle("active",el.dataset.panel===name));document.querySelectorAll(".device-tab").forEach(el=>{const active=el.dataset.tab===name;el.classList.toggle("active",active);el.setAttribute("aria-selected",active?"true":"false")});try{localStorage.setItem(PANEL_KEY,name)}catch(_){}scheduleHomeRemoteRead(name)}
function sendFloor(action,value=""){nativeAction("floor",action,String(value))}
function stopActiveHolds(){nativeAction("homeStopHolds","","")}
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
let homeLayoutEditing=false,homeLauncherShow=null;
function nativeAction(device,action,label,slot=""){if(homeLayoutEditing&&!(device==="home"&&action==="layoutSave")&&!["homeStopHolds","tvHoldStop","lightHoldStop"].includes(device))return;nonce++;window.location.href="/__action?device="+encodeURIComponent(device)+"&action="+encodeURIComponent(action||"")+"&label="+encodeURIComponent(label||"")+"&slot="+encodeURIComponent(slot||"")+"&n="+nonce}
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
const REMOTE_APPEARANCE_KEY="yos.remote.tv.appearance.v1"
function applyRemoteAppearance(){
 let pref={};try{pref=JSON.parse(localStorage.getItem(REMOTE_APPEARANCE_KEY))||{}}catch(_){}
 const size=["standard","compact","large"].includes(pref.size)?pref.size:"standard",position=pref.position==="above"?"above":"below";
 const grid=document.getElementById("tvGrid"),home=document.getElementById("presetHome"),sizeInput=document.getElementById("remoteSize"),posInput=document.getElementById("presetPosition");
 if(sizeInput)sizeInput.value=size;if(posInput)posInput.value=position;
 if(!grid||!home||!home.parentNode||!grid.parentNode)return;
 grid.dataset.size=size;
 const first=document.querySelector(".home-fixed-keys"),anchor=document.getElementById("homePresetAnchor");
 if(position==="above"&&first)first.before(home);else if(anchor)anchor.after(home);
}
function changeRemoteAppearance(){const size=document.getElementById("remoteSize").value,position=document.getElementById("presetPosition").value;try{localStorage.setItem(REMOTE_APPEARANCE_KEY,JSON.stringify({size,position}))}catch(_){}applyRemoteAppearance()}
function openLayoutEditor(e){if(e){e.preventDefault();e.stopPropagation()}selectedSlot=null;document.getElementById("configLayer").classList.add("open");applyRemoteAppearance();renderConfig()}
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
const PIC_PRESET_IDS=["day","night","movie","extra1","extra2","extra3","extra4","extra5"],PIC_PRESET_NAMES={day:"昼",night:"夜",movie:"映画",extra1:"追加1",extra2:"追加2",extra3:"追加3",extra4:"追加4",extra5:"追加5"}
let pictureMap={},savedPresets={day:false,night:false,movie:false},pictureConnected=false,presetDetails={},editingPreset=null
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
   if(Object.prototype.hasOwnProperty.call(result.quick,"sound"))quickSound=result.quick.sound||{}
   if(Object.prototype.hasOwnProperty.call(result.quick,"apps"))quickAppsAvailable=result.quick.apps||{}
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
let discoveryPending=false,discoveryTimer=null;
function finishPictureDiscovery(message){
 discoveryPending=false;if(discoveryTimer!==null)clearTimeout(discoveryTimer);discoveryTimer=null;
 const button=document.getElementById("discoverPictureButton"),status=document.getElementById("discoverPictureStatus");
 if(button){button.disabled=false;button.textContent="追加画質項目を調査"}
 if(status){status.hidden=false;status.textContent=message}
}
function startPictureDiscovery(e){
 if(e){e.preventDefault();e.stopPropagation()}if(discoveryPending)return;
 discoveryPending=true;
 const button=document.getElementById("discoverPictureButton"),status=document.getElementById("discoverPictureStatus");
 if(button){button.disabled=true;button.textContent="調査中…"}
 if(status){status.hidden=false;status.textContent="テレビへ問い合わせ中。設定は変更しません。"}
 discoveryTimer=setTimeout(()=>finishPictureDiscovery("応答未確認。テレビとの通信状況を確認してください。"),25000);
 nativeAction("picture","discover","追加項目の調査");
}
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
function presetName(key){return presetDetails[key]?.name||PIC_PRESET_NAMES[key]}
function renderPresetEditor(key){
 editingPreset=key;
 const editor=document.getElementById("presetEditor");if(!editor)return;
 editor.hidden=false;
 const prior=presetDetails[key],values=Object.fromEntries((prior?.settings||[]).map(x=>[x.target,x.value]));
 let markup='<h3>画質ショートカット編集</h3><label>名前<input type="text" maxlength="24" id="presetName" value="'+pictureEscape(presetName(key))+'"></label><p class="pic-manual">適用したい項目だけにチェック。画質モードだけでも登録できます。</p>';
 const labels=Object.fromEntries(PICTURE_MENU.flatMap(g=>g[1].filter(x=>x[1]).map(x=>[x[1],x[0]])));
 for(const [target,info] of Object.entries(pictureMap)){
  if(!info.available)continue;
  const chosen=Object.prototype.hasOwnProperty.call(values,target),value=chosen?values[target]:info.value,enabled=prior?chosen:target==="pictureMode";
  markup+='<div class="preset-edit-row"><label><input type="checkbox" data-preset-check="'+target+'" '+(enabled?'checked':'')+'>'+pictureEscape(labels[target]||target)+'</label>';
  if(info.min!==null&&info.max!==null&&info.step>0)markup+='<input type="number" data-preset-value="'+target+'" min="'+info.min+'" max="'+info.max+'" step="'+info.step+'" value="'+pictureEscape(value)+'">';
  else {markup+='<select data-preset-value="'+target+'">';for(const option of info.options||[])markup+='<option value="'+pictureEscape(option)+'"'+(String(option)===String(value)?' selected':'')+'>'+pictureEscape(pictureOptionLabel(target,option))+'</option>';markup+='</select>'}
  markup+='</div>';
 }
 if(prior&&prior.settings.some(x=>!pictureMap[x.target]?.available))markup+='<p class="pic-manual">未取得の既存設定を保護します。再取得してください。</p>';
 markup+='<div class="quick-buttons"><button class="tool" onclick="commitPresetEditor(event)">'+(prior?'上書き保存':'登録')+'</button><button class="tool" onclick="cancelPresetEditor()">閉じる</button></div>';
 editor.innerHTML=markup;
}
function cancelPresetEditor(){editingPreset=null;const editor=document.getElementById("presetEditor");if(editor){editor.hidden=true;editor.innerHTML=""}}
function commitPresetEditor(e){
 e.preventDefault();if(!editingPreset||!pictureConnected)return;
 const key=editingPreset,prior=presetDetails[key],status=document.getElementById("shortcutsStatus");
 if(prior&&prior.settings.some(x=>!pictureMap[x.target]?.available)){status.textContent="既存設定を保護しました。未取得項目があります。";return}
 const name=document.getElementById("presetName").value.trim(),settings=[];
 document.querySelectorAll("[data-preset-check]").forEach(el=>{if(el.checked){const target=el.dataset.presetCheck,input=document.querySelector('[data-preset-value="'+target+'"]');if(input)settings.push({target,value:String(input.value)})}});
 if(!name||!settings.length){status.textContent="名前と適用項目を指定してください";return}
 status.textContent="登録内容を検証中…";
 nativeAction("picture","edit","画質プリセット登録",JSON.stringify({key,name,settings}));
}
function renderPicturePresets(){
 const root=document.getElementById("picturePresets");if(!root)return;
 root.innerHTML=PIC_PRESET_IDS.map(key=>{
  const isSaved=Boolean(savedPresets[key]),prior=presetDetails[key],mode=prior?.settings?.find(x=>x.target==="pictureMode")?.value;
  const detail=isSaved?(mode?pictureOptionLabel("pictureMode",mode)+" / ":"")+(prior?prior.settings.length+"項目":"登録済み"):"未登録";
  return '<div class="pic-preset"><div><strong>'+pictureEscape(presetName(key))+'</strong><div class="pic-manual">'+pictureEscape(detail)+'</div></div><button '+(!pictureConnected?'disabled':'')+' onclick="renderPresetEditor(&quot;'+key+'&quot;)">編集</button><button '+(!pictureConnected?'disabled':'')+' onclick="savePicturePreset(event,&quot;'+key+'&quot;)">現在を保存</button><button '+(!pictureConnected||!isSaved?'disabled':'')+' onclick="loadPicturePreset(event,&quot;'+key+'&quot;)">呼出</button></div>'
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
 if(result?.picture?.discovery===true){finishPictureDiscovery(result.picture.message);return}
 if(result?.discoveryError){finishPictureDiscovery("調査失敗："+result.message);return}
 const status=document.getElementById("pictureStatus"),shortStatus=document.getElementById("shortcutsStatus")
 if(result&&result.picture){
  pictureConnected=true
  const picture=result.picture
  pictureMap={};for(const item of picture.entries||[])pictureMap[item.target]=item
  savedPresets=picture.saved||savedPresets;presetDetails=picture.presets||presetDetails;if(picture.edited===editingPreset)cancelPresetEditor()
  if(status)status.textContent=picture.message||"現在値を取得しました"
  if(shortStatus)shortStatus.textContent=picture.message||"ショートカットを確認しました"
  renderPictureMenu();renderBrightness();renderPicturePresets();quickModeButtons('quickPictureModes');quickModeButtons('quickPictureModesPanel');renderTVStudio()
 }else if(result&&result.ok===false){
  const msg="実行できませんでした："+String(result.message||"通信に失敗しました")
  if(status)status.textContent=msg
  if(shortStatus)shortStatus.textContent=msg
  const txt=document.getElementById("brightnessValue");if(txt)txt.textContent=msg
  if(!pictureConnected){renderPictureMenu();renderBrightness();renderPicturePresets();renderTVStudio()}
 }
}

function renderTVStudio(){
 for(const [target,id,out] of [['brightness','tvBrightness','tvBrightnessVal'],['contrast','tvContrast','tvContrastVal']]){
  const range=document.getElementById(id),value=document.getElementById(out),entry=pictureEntry(target);
  if(!range||!value)continue;
  const ok=!!(entry&&entry.available&&Number.isFinite(+entry.min)&&Number.isFinite(+entry.max)&&+entry.max>+entry.min&&+entry.step>0);
  range.disabled=!ok;
  if(ok){range.min=entry.min;range.max=entry.max;range.step=entry.step;range.value=entry.value;value.textContent=entry.value}
  else value.textContent='--';
 }
 const home=document.getElementById("presetHome");
 if(home)home.innerHTML=PIC_PRESET_IDS.filter((key,i)=>i<3||savedPresets[key]).map(key=>'<button '+(!pictureConnected||!savedPresets[key]?'disabled':'')+' onclick="loadPicturePreset(event,&quot;'+key+'&quot;)">'+pictureEscape(presetName(key))+'</button>').join("");
}
function previewTVCompact(e,target){const id=target==='brightness'?'tvBrightnessVal':'tvContrastVal';document.getElementById(id).textContent=e.target.value}
function commitTVCompact(e,target){
 if(!['brightness','contrast'].includes(target))return;
 const entry=pictureEntry(target);if(!entry||!entry.available)return;
 nativeAction('picture','set',target,JSON.stringify({target,value:String(e.target.value)}));
}
function showTVExtra(message){
 const status=document.getElementById('tvExtraStatus');
 if(status)status.textContent=String(message||'').slice(0,100);
}
function displayTVApps(apps){
 const root=document.getElementById('tvAppScroll');if(!root)return;
 root.replaceChildren();
 if(!Array.isArray(apps)||apps.length===0){
  const b=document.createElement('button');b.disabled=true;b.textContent='対応アプリ未取得';root.append(b);return;
 }
 const ranking=['youtube','netflix','prime video','amazon','disney','spotify'];
 const order=[...apps].sort((a,b)=>{
  const score=x=>{const n=String(x.title||'').toLowerCase();const i=ranking.findIndex(k=>n.includes(k));return i<0?100:i};
  return score(a)-score(b)||String(a.title||'').localeCompare(String(b.title||''),'ja');
 });
 for(const app of order.slice(0,80)){
  const b=document.createElement('button');b.textContent=app.title;b.title=app.title;
  b.addEventListener('click',()=>{showTVExtra('「'+app.title+'」の起動要求を送信中…');nativeAction('tvApps','launch','アプリ起動',String(app.index))});
  root.append(b);
 }
}
function sendTVText(e){
 if(e){e.preventDefault();e.stopPropagation()}
 const el=document.getElementById('tvTextInput'),value=String(el?.value||'');
 if(!value.trim()||value.length>140||/[\\u0000-\\u001f\\u007f]/.test(value)){showTVExtra('空欄・制御文字は送れません');return}
 showTVExtra('テレビの入力欄へ送信中…');
 nativeAction('tvApps','text','キーボード入力',value);
}
function openTVVPN(e){if(e){e.preventDefault();e.stopPropagation()}showTVExtra('VPNアプリの起動を確認中…');nativeAction('tvApps','vpnOpen','VPNアプリ起動')}

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
  if(result&&result.home){homeResult(result);return}
  showPictureStatus(result)
  showQuickStatus(result)
  if(result&&Array.isArray(result.apps))displayTVApps(result.apps)
  if(result&&result.tvExtra)showTVExtra(result.tvExtra)
  if(result&&result.ok===false)showTVExtra('操作失敗：'+String(result.message||'未対応'))
  const badge=document.getElementById("modeBadge")
  if(result&&result.ok===false){if(badge)badge.textContent="エラー";if(activePanel==="floor")document.getElementById("floorStatus").textContent="操作失敗："+(result.message||"接続を確認してください");return}
  if(result&&result.mode)setMode(result.mode)
  if(result&&Object.prototype.hasOwnProperty.call(result,"ac"))setACState(result.ac)
  if(result&&Object.prototype.hasOwnProperty.call(result,"floor"))setFloorState(result.floor)
}
function requestMode(){if(!discoveryPending)nativeAction("system","refreshMode","")}function requestAC(){if(!discoveryPending)nativeAction("system","refreshAC","")}
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
const yosHomeRoute=function(kind,id,busy=false){if(kind==="scene"&&["departure","arrival","sleep","wake","night","movie","relax","clean","focus"].includes(id)){if(busy)return null;return id==="sleep"?{type:"shortcut",name:"おやすみマン"}:{type:"scene",mode:id}}if(kind==="device"&&["tv","light","ac","floor"].includes(id))return{type:"panel",device:id};if(kind==="nav"&&["home","remote","settings"].includes(id))return{type:"view",view:id};return null};
// 実際のnative通信はOne Enterの既存キューに接続。自動実行しない。
let homeBusy=false,homeTimer=null,homeView="home",homePrefs=null,homeBase=null,homeDirty=false,homeEditMode="departure",homeRemoteReadTimer=null;
const homeLabels={departure:"外出",arrival:"帰宅",sleep:"就寝",wake:"起床",night:"夜",movie:"映画",relax:"リラックス",clean:"掃除",focus:"集中"};
const homeDevices={tv:"テレビ",light:"天井照明",ac:"エアコン",floor:"フロアランプ"};
function homeStatus(message){document.getElementById(homeView==="settings"?"homeSettingStatus":"homeFeedback").textContent=message}
function homeButtons(){
 document.querySelectorAll("#yosHome button,#homeDetailNav button,#homeSettings button").forEach(b=>b.disabled=homeBusy);
 document.getElementById("homeSave").disabled=homeBusy||!homeDirty||!homePrefs;
}
function homeSend(action,slot=""){
 if(homeBusy)return;
 homeBusy=true;homeButtons();homeStatus("処理中…");
 homeTimer=setTimeout(()=>homeStatus("応答未確認。自動再送しません。画面を閉じて確認してください。"),30000);
 nativeAction("home",action,"",slot);
}
let homeLayoutReply=()=>{};
function homeResult(r){
 if(homeTimer!==null)clearTimeout(homeTimer);homeTimer=null;homeBusy=false;
 if(r.kind==="layoutLoad"||r.kind==="layoutSave"||r.kind==="layoutRun"){homeLayoutReply(r);homeButtons();return}
 if(r.ok&&r.prefs){homePrefs=JSON.parse(JSON.stringify(r.prefs));homeBase=JSON.parse(JSON.stringify(r.prefs));homeDirty=false;drawHomeSettings()}
 homeStatus(r.message||"結果未確認");homeButtons();
}
function drawHomeSettings(){
 const tabs=document.getElementById("homeModeTabs"),rows=document.getElementById("homeSettingRows");
 tabs.replaceChildren();rows.replaceChildren();if(!homePrefs)return;
 for(const [id,label] of Object.entries(homeLabels)){
  const b=document.createElement("button");b.textContent=label;b.setAttribute("aria-pressed",String(id===homeEditMode));b.onclick=()=>{if(!homeBusy){homeEditMode=id;drawHomeSettings();homeButtons()}};tabs.appendChild(b);
 }
 for(const [id,label] of Object.entries(homeDevices)){
  const row=document.createElement("div"),name=document.createElement("span");name.textContent=label;row.appendChild(name);
  for(const [value,label] of [["on","ON"],["off","OFF"],["keep","維持"]]){
   const b=document.createElement("button");b.textContent=label;b.setAttribute("aria-pressed",String(homePrefs[homeEditMode][id]===value));b.onclick=()=>{if(!homeBusy){homePrefs[homeEditMode][id]=value;homeDirty=true;drawHomeSettings();homeButtons()}};row.appendChild(b);
  }rows.appendChild(row);
 }
 homeButtons();
}
function homeShow(view,device){
 if(homeBusy||homeLayoutEditing||!["home","remote","settings"].includes(view))return;
 if(homeRemoteReadTimer!==null)clearTimeout(homeRemoteReadTimer);
 if(homeView==="remote"&&view!=="remote")stopActiveHolds();
 homeView=view;
 document.getElementById("yosHome").hidden=view!=="home";document.querySelector(".page").hidden=view!=="remote";
 document.getElementById("homeSettings").hidden=view!=="settings";document.getElementById("homeDetailNav").hidden=view==="home";
 document.querySelectorAll("#homeDetailNav button").forEach(b=>b.setAttribute("aria-current",b.dataset.detail===view?"page":"false"));
 if(view==="remote"){setPanel(device||activePanel);if(activePanel==="tv")document.dispatchEvent(new Event("home-layout-read"))}
 else if(view==="settings"&&!homePrefs)homeSend("load");
}
function scheduleHomeRemoteRead(device){
 if(homeRemoteReadTimer!==null)clearTimeout(homeRemoteReadTimer);
 homeRemoteReadTimer=setTimeout(()=>{if(homeView==="remote"&&activePanel===device&&!homeBusy&&!homeLayoutEditing)nativeAction("homeRead",device,"")},250);
}
document.querySelectorAll("#yosHome [data-home-kind]").forEach(b=>b.addEventListener("click",()=>{
 if(homeBusy)return;const r=yosHomeRoute(b.dataset.homeKind,b.dataset.homeId,homeBusy);if(!r)return;
 if(r.type==="scene"){if(homeDirty){homeStatus("未保存の設定があります。保存してから実行してください");return}homeSend("run",r.mode)}
 else if(r.type==="shortcut")homeSend("sleep",r.name);else if(r.type==="panel")homeShow("remote",r.device);else if(r.type==="view")homeShow(r.view);
}));
document.querySelectorAll("#homeDetailNav button").forEach(b=>b.onclick=()=>homeShow(b.dataset.detail));
document.getElementById("homeSave").onclick=()=>{if(homeDirty&&homePrefs)homeSend("save",JSON.stringify({base:homeBase,next:homePrefs}))};
document.getElementById("homeReload").onclick=()=>homeSend("load");
const yosRemoteGesture = function(s){
 if(!s||!["tv","light","ac","floor"].includes(s.panel)||s.cancelled||s.multitouch||s.busy||s.dialog||s.stale||![s.dx,s.dy,s.ms].every(Number.isFinite)||s.ms<0)return null;
 const x=Math.abs(s.dx),y=Math.abs(s.dy),h=x>=1.35*y&&x>0,v=y>=1.35*x&&y>0,dir=h?(s.dx>0?"right":"left"):v?(s.dy>0?"down":"up"):null;
 if(s.region==="pad"){
  if(s.panel!=="tv")return null;
  if(Math.max(x,y)<=8&&s.ms<=500)return {kind:"tvRole",role:"center"};
  if(Math.max(x,y)>=24&&dir)return {kind:"tvRole",role:dir};
  return null;
 }
 if(s.region==="surface"&&h&&x>=64&&s.ms<=900){
  const pages=["tv","light","ac","floor"],n=pages.indexOf(s.panel)+(s.dx<0?1:-1);
  return pages[n]?{kind:"panel",panel:pages[n]}:null;
 }
 if(s.region==="launcherHandle"&&s.panel==="tv"&&v&&y>=64&&s.ms<=900){
  if(s.dy<0&&!s.expanded)return {kind:"launcher",expanded:true};
  if(s.dy>0&&s.expanded)return {kind:"launcher",expanded:false};
 }
 return null;
};
let homeCustomFlick=(role,m)=>nativeAction("homeFlick",role,"",m);
function installHomeFlick(){
 const pad=document.getElementById("homeFlickPad"),surface=document.getElementById("homePageSwitch");let p=null;
 const pages=["tv","light","ac","floor"];
 function sync(){const brand=document.getElementById("homeTVBrand"),head=document.getElementById("homeTVHead");surface.classList.toggle("glass-tv-page",activePanel==="tv");if(brand&&head&&brand.parentNode){if(activePanel==="tv"&&brand.parentNode!==surface)surface.append(brand);else if(activePanel!=="tv"&&brand.parentNode!==head)head.insertBefore(brand,head.firstChild)}surface.querySelector("output").textContent=homeDevices[activePanel]+" "+(pages.indexOf(activePanel)+1)+"/4";surface.querySelector("[data-prev]").disabled=activePanel==="tv";surface.querySelector("[data-next]").disabled=activePanel==="floor"}
 function change(panel){if(pages.includes(panel)&&!homeBusy&&homeView==="remote")setPanel(panel)}
 function bind(el,region){
 el.addEventListener("pointerdown",e=>{if(p){p.multitouch=true;return}if(!e.isPrimary||homeBusy||homeView!=="remote"||e.target.closest("button,input,select,textarea,a"))return;p={id:e.pointerId,x:e.clientX,y:e.clientY,t:Date.now(),panel:activePanel,mode,region};try{el.setPointerCapture(e.pointerId)}catch(_){}});
 el.addEventListener("pointercancel",()=>{p=null});el.addEventListener("lostpointercapture",()=>{p=null});
 el.addEventListener("pointerup",e=>{if(!p||p.id!==e.pointerId)return;const q=p;p=null;const r=yosRemoteGesture({region:q.region,panel:q.panel,dx:e.clientX-q.x,dy:e.clientY-q.y,ms:Date.now()-q.t,multitouch:q.multitouch,busy:homeBusy,stale:homeView!=="remote"||activePanel!==q.panel||mode!==q.mode});if(!r)return;if(r.kind==="panel")change(r.panel);if(r.kind==="tvRole")homeCustomFlick(r.role==="center"?"tap":r.role,q.mode)});
 }
 bind(pad,"pad");bind(surface,"surface");
 surface.querySelector("[data-prev]").onclick=()=>change(pages[pages.indexOf(activePanel)-1]);
 surface.querySelector("[data-next]").onclick=()=>change(pages[pages.indexOf(activePanel)+1]);
 pad.addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&!homeBusy&&homeView==="remote"&&activePanel==="tv"){e.preventDefault();homeCustomFlick("tap",mode)}});
 const original=setPanel;setPanel=function(name){original(name);sync()};sync();
}
installHomeFlick();

function installHomeLauncher(){
 const handle=document.getElementById("homeLauncherHandle"),apps=document.getElementById("tvAppScroll");let expanded=false,p=null,suppress=0;
 function show(value){expanded=value;if(!value)apps.scrollTop=0;apps.classList.toggle("home-expanded",value);handle.setAttribute("aria-expanded",String(value));handle.textContent=value?"⌄　アプリ・追加操作":"⌃　アプリ・追加操作"}
 function allowed(){return homeView==="remote"&&activePanel==="tv"&&!homeBusy&&!homeLayoutEditing}
 handle.addEventListener("pointerdown",e=>{if(p){p.multitouch=true;return}if(!allowed()||!e.isPrimary)return;p={id:e.pointerId,x:e.clientX,y:e.clientY,t:Date.now()};try{handle.setPointerCapture(e.pointerId)}catch(_){}});
 handle.addEventListener("pointercancel",()=>{p=null;suppress=Date.now()+700});
 handle.addEventListener("lostpointercapture",()=>{if(p){p=null;suppress=Date.now()+700}});
 handle.addEventListener("pointerup",e=>{if(!p||p.id!==e.pointerId)return;const q=p;p=null;const dx=e.clientX-q.x,dy=e.clientY-q.y;if(q.multitouch||Math.max(Math.abs(dx),Math.abs(dy))>8)suppress=Date.now()+700;const r=yosRemoteGesture({panel:"tv",region:"launcherHandle",expanded,dx,dy,ms:Date.now()-q.t,multitouch:q.multitouch,stale:!allowed()});if(r&&r.kind==="launcher")show(r.expanded)});
 handle.addEventListener("click",()=>{if(allowed()&&Date.now()>=suppress)show(!expanded)});
 const original=setPanel;setPanel=function(name){if(name!=="tv")show(false);original(name)};
 homeLauncherShow=show;show(false);
}
installHomeLauncher();

function unifiedSlots(allow,presets){
 const defaults=["back","home","quick","input","volumeDown","mute","volumeUp","stop"];
 const scenes=["departure","arrival","sleep","wake","night","movie","relax","clean","focus"];
 const icons=["default","power","home","tv","sun","moon","lamp","snow","play","stop","volume","star","film","bolt","shortcut"];
 const safeText=(v,n)=>typeof v==="string"&&v.length>0&&v.length<=n&&v.trim()===v&&!/[\\x00-\\x1f\\x7f]/.test(v);
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 function clean(x){
  if(x===null)return null;if(!x||typeof x!=="object"||Array.isArray(x))throw Error("invalid slot");
  const o={kind:x.kind};
  if(x.kind==="remote"){if(!own(allow,x.device)||!allow[x.device].includes(x.action))throw Error("invalid command");o.device=x.device;o.action=x.action}
  else if(x.kind==="app"){if(!safeText(x.title,60))throw Error("invalid app");o.title=x.title}
  else if(x.kind==="shortcut"){if(!safeText(x.name,100))throw Error("invalid shortcut");o.name=x.name}
  else if(x.kind==="scene"){if(!scenes.includes(x.mode))throw Error("invalid scene");o.mode=x.mode}
  else if(x.kind==="preset"){if(!presets.includes(x.id))throw Error("invalid preset");o.id=x.id}
  else throw Error("invalid kind");
  if(x.label!==undefined){if(!safeText(x.label,24))throw Error("invalid label");o.label=x.label}
  if(x.icon!==undefined){if(!icons.includes(x.icon))throw Error("invalid icon");o.icon=x.icon}
  return o;
 }
 function validate(x){
  if(!x||x.schema!==1||!Array.isArray(x.upper)||x.upper.length!==8||!Array.isArray(x.lower)||x.lower.length<8||x.lower.length>48||typeof x.seeded!=="boolean")throw Error("invalid layout");
  return {schema:1,upper:x.upper.map(clean),lower:x.lower.map(clean),seeded:x.seeded};
 }
 function initial(old){return validate({schema:1,upper:defaults.map((a,i)=>({kind:"remote",device:"tv",action:allow.tv.includes(old?.slots?.[i])?old.slots[i]:a})),lower:Array(8).fill(null),seeded:false})}
 function load(raw,old){return raw===null?initial(old):validate(JSON.parse(raw))}
 function seed(state,apps){let o=validate(state);if(o.seeded)return o;let names=apps.filter(a=>safeText(a?.title,60)).map(a=>a.title);let uniq=names.filter((n,i)=>names.indexOf(n)===i&&names.lastIndexOf(n)===i);if(!uniq.length)return o;o.lower=Array.from({length:Math.max(8,Math.min(48,uniq.length))},(_,i)=>uniq[i]?{kind:"app",title:uniq[i]}:null);o.seeded=true;return validate(o)}
 function at(o,r){if(!r||!["upper","lower"].includes(r.area)||!Number.isInteger(r.index)||r.index<0||r.index>=o[r.area].length)throw Error("invalid position");return o[r.area]}
 function replace(state,r,x){let o=validate(state);at(o,r)[r.index]=clean(x);o.seeded=true;return o}
 function swap(state,a,b){let o=validate(state),aa=at(o,a),bb=at(o,b);[aa[a.index],bb[b.index]]=[bb[b.index],aa[a.index]];o.seeded=true;return o}
 function append(state){let o=validate(state);if(o.lower.length>=48)throw Error("full");o.lower.push(null);o.seeded=true;return o}
 function dispatch(x,ctx){if(ctx.editing||ctx.busy||ctx.closed||!ctx.explicit)return null;let o=clean(x);if(o===null)return null;
  if(o.kind==="remote")return {device:o.device,action:o.action};
  if(o.kind==="app"){let found=ctx.apps.filter(a=>a.title===o.title);if(found.length!==1||!Number.isSafeInteger(found[0].index)||found[0].index<0)return null;return {device:"tvApps",action:"launchByTitle",title:o.title}}
  if(o.kind==="shortcut")return {device:"home",action:"launchShortcut",name:o.name};
  if(o.kind==="scene")return {device:"home",action:o.mode==="sleep"?"sleep":"run",slot:o.mode==="sleep"?"おやすみマン":o.mode};
  if(o.kind==="preset")return ctx.savedPresets.includes(o.id)?{device:"picture",action:"load",slot:o.id}:null;
  return null;
 }
 return {clean,validate,initial,load,seed,replace,swap,append,dispatch,icons};
}
const yosSlotAllow={"tv":["power","input","home","quick","menu","back","up","down","left","right","confirm","volumeDown","mute","volumeUp","channelDown","channelUp","rewind","play","fastForward","pause","stop","prev","next","pictureOff"],"light":["on","off","all","bright","dark","night"],"ac":["cool","dry","heat","stop","tempDown","tempUp","fan","wind"],"floor":["on","off"]};
const yosSlotPresets=["day","night","movie","extra1","extra2","extra3","extra4","extra5"];
function unifiedHomeUI(){
 const root=document.querySelector('[data-panel="tv"]'),pad=document.getElementById("homeFlickPad"),rows=Array.from(root.querySelectorAll(".home-fixed-keys")),upper=rows.flatMap(r=>Array.from(r.querySelectorAll("button"))),lower=document.getElementById("tvAppScroll");
 const core=unifiedSlots(yosSlotAllow,yosSlotPresets),roles=["tap","up","down","left","right"],defaults=["back","home","quick","input","volumeDown","mute","volumeUp","stop"];
 const old={slots:defaults,flick:Object.fromEntries(roles.map(r=>[r,"auto"])),pad:"middle"};
 try{const x=JSON.parse(localStorage.getItem("yos.remote.home.custom.v1"));if(x){old.slots=defaults.map((a,i)=>yosSlotAllow.tv.includes(x.slots?.[i])?x.slots[i]:a);old.pad=["top","middle","bottom"].includes(x.pad)?x.pad:"middle";old.flick=Object.fromEntries(roles.map(r=>[r,yosSlotAllow.tv.includes(x.flick?.[r])?x.flick[r]:"auto"]))}}catch(_){}
 let saved={schema:2,layout:core.initial(old),flick:{pad:old.pad,flick:old.flick}},draft=null,base=null,loaded=false,pending=false,apps=[],selected=null;
 const node=(tag,text,parent)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(parent)parent.append(e);return e};
 const bar=node("div",undefined);bar.className="home-layout-bar";document.getElementById("homeTVExtras").append(bar);
 const edit=node("button","配置編集",bar),status=node("output","設定未読込");status.className="glass-layout-status";status.dataset.glassShow="true";status.setAttribute("role","status");rows[0].before(status);
 function setLayoutStatus(value){status.textContent=value;status.dataset.glassShow=String(!["読込済み","保存済み","変更取消"].includes(value))}
 const panel=node("section",undefined);panel.id="homeUnifiedEditor";panel.hidden=true;rows[1].after(panel);
 const title=node("h3","上下の配置・フリック",panel),hint=node("p","枠を選択して登録。編集中はドラッグで交換できます。",panel);
 const slotType=node("select",undefined,panel),choice=node("select",undefined,panel),name=node("input",undefined,panel),label=node("input",undefined,panel),ico=node("select",undefined,panel);
 name.placeholder="ショートカットの正確な名前";name.maxLength=100;label.placeholder="表示名（任意）";label.maxLength=24;
 function options(el,arr){el.replaceChildren();for(const [v,l] of arr){const o=node("option",l,el);o.value=v}}
 options(slotType,[["remote","リモコン操作"],["app","テレビアプリ"],["shortcut","iPhoneショートカット"],["scene","生活モード"],["preset","保存画質"],["empty","空き枠"]]);
 const glyph={default:"",power:"⏻",home:"⌂",tv:"▣",sun:"☀",moon:"☾",lamp:"◉",snow:"❄",play:"▷",stop:"□",volume:"♪",star:"☆",film:"▤",bolt:"ϟ",shortcut:"↗"};
 options(ico,core.icons.map(x=>[x,(glyph[x]||"自動")+" "+x]));
 const labels={light:{on:"点灯",off:"消灯",all:"全灯",bright:"明るい",dark:"暗い",night:"常夜灯"},ac:{cool:"冷房",dry:"除湿",heat:"暖房",stop:"停止",tempDown:"温度−",tempUp:"温度＋",fan:"風量",wind:"風向"},floor:{on:"点灯",off:"消灯"}};
 const opLabel=(d,a)=>d==="tv"?(meta(a)?.label||({"pictureOff":"消画"}[a])||a):(labels[d]?.[a]||a);
 const presetLabel={day:"昼",night:"夜",movie:"映画",extra1:"追加1",extra2:"追加2",extra3:"追加3",extra4:"追加4",extra5:"追加5"};
 function caption(x){if(x&&x.kind==="remote"&&x.device==="tv"&&!x.label&&(!x.icon||x.icon==="default"))return opLabel("tv",x.action);if(!x)return "＋ 空き";return (glyph[x.icon]||"")+" "+(x.label||(x.kind==="remote"?homeDevices[x.device]+" "+opLabel(x.device,x.action):x.kind==="app"?x.title:x.kind==="shortcut"?x.name:x.kind==="scene"?homeLabels[x.mode]:presetLabel[x.id]))}
 function refreshChoices(){let entries=[];switch(slotType.value){case"remote":entries=Object.entries(yosSlotAllow).flatMap(([d,as])=>as.map(a=>[d+":"+a,homeDevices[d]+" "+opLabel(d,a)]));break;case"app":entries=apps.filter((a,i)=>apps.findIndex(x=>x.title===a.title)===i&&apps.filter(x=>x.title===a.title).length===1).map(a=>[a.title,a.title]);break;case"scene":entries=Object.entries(homeLabels);break;case"preset":entries=yosSlotPresets.map(id=>[id,presetLabel[id]]);break}
 options(choice,entries);choice.hidden=["empty","shortcut"].includes(slotType.value);name.hidden=slotType.value!=="shortcut";label.hidden=ico.hidden=slotType.value==="empty";
 }
 slotType.onchange=refreshChoices;
 const assign=node("button","選択枠へ登録",panel),add=node("button","下段に空き枠追加",panel);
 const fcontrols=roles.map(r=>{const l=node("label","フリック "+({tap:"中央",up:"上",down:"下",left:"左",right:"右"}[r]),panel),e=node("select",undefined,l);options(e,[["auto","自動"],...yosSlotAllow.tv.map(a=>[a,opLabel("tv",a)])]);return e});
 const pl=node("label","パッド位置",panel),position=node("select",undefined,pl);options(position,[["top","上"],["middle","中央"],["bottom","下"]]);
 const save=node("button","変更を保存",panel),cancel=node("button","取消",panel),reset=node("button","初期配置に戻す",panel),reload=node("button","保存済み配置を再読込",bar);
 function setSelected(pos){if(pending)return;selected=pos;const x=draft?.layout[pos.area][pos.index];title.textContent=(pos.area==="upper"?"上段":"下段")+" "+(pos.index+1)+" の設定";slotType.value=x?.kind||"empty";refreshChoices();if(x){choice.value=x.kind==="remote"?x.device+":"+x.action:x.kind==="app"?x.title:x.kind==="scene"?x.mode:x.id||"";name.value=x.name||"";label.value=x.label||"";ico.value=x.icon||"default"}else{name.value=label.value="";ico.value="default"}render()}
 function start(pos){if(!loaded||homeBusy||pending)return;if(!draft){stopActiveHolds();draft=JSON.parse(JSON.stringify(saved));homeLayoutEditing=true;panel.hidden=false;fcontrols.forEach((e,i)=>e.value=draft.flick.flick[roles[i]]);position.value=draft.flick.pad;if(homeLauncherShow)homeLauncherShow(true);setLayoutStatus("編集中・家電操作停止")}setSelected(pos||{area:"upper",index:0})}
 function finish(){draft=null;selected=null;homeLayoutEditing=false;panel.hidden=true;if(homeLauncherShow)homeLauncherShow(false);render()}
 function updateFlick(){draft.flick={pad:position.value,flick:Object.fromEntries(roles.map((r,i)=>[r,fcontrols[i].value]))}}
 function place(){const pos=(draft||saved).flick.pad;if(pos==="top")root.insertBefore(pad,rows[0]);else if(pos==="bottom")rows[1].after(pad);else root.insertBefore(pad,rows[1])}
 function act(pos){if(!loaded||pending||homeBusy||draft||homeView!=="remote"||activePanel!=="tv")return;const x=saved.layout[pos.area][pos.index];if(!x){start(pos);return}homeSend("layoutRun",JSON.stringify({pos,slot:x,base}));setLayoutStatus("処理中…")}
 function bind(b,pos){b.dataset.homeSlot=pos.area+":"+pos.index;b.removeAttribute("onclick");b.onclick=null;let p=null,t=null,suppress=0;
 const clear=()=>{if(t!==null)clearTimeout(t);t=null};
 b.onpointerdown=e=>{if(!e.isPrimary||p||pending||homeBusy)return;p={id:e.pointerId,x:e.clientX,y:e.clientY};try{b.setPointerCapture(e.pointerId)}catch(_){}if(!draft)t=setTimeout(()=>{t=null;suppress=Date.now()+900;start(pos)},500)};
 b.onpointermove=e=>{if(p&&Math.hypot(e.clientX-p.x,e.clientY-p.y)>10)clear()};
 b.onpointercancel=b.onlostpointercapture=()=>{clear();p=null};
 b.onpointerup=e=>{if(!p||p.id!==e.pointerId)return;const q=p;p=null;clear();if(Math.hypot(e.clientX-q.x,e.clientY-q.y)>10){suppress=Date.now()+900;if(draft){const target=document.elementFromPoint(e.clientX,e.clientY)?.closest("[data-home-slot]");if(target){const [area,i]=target.dataset.homeSlot.split(":");try{draft.layout=core.swap(draft.layout,pos,{area,index:Number(i)});setSelected({area,index:Number(i)})}catch(_){}}}}};
 b.onclick=e=>{e.preventDefault();e.stopPropagation();if(Date.now()<suppress)return;if(draft)setSelected(pos);else act(pos)};
 }
 function render(){const x=(draft||saved).layout;upper.forEach((b,i)=>{const p={area:"upper",index:i};b.textContent=caption(x.upper[i]);b.dataset.glassIcon=x.upper[i]?.kind==="remote"&&x.upper[i]?.device==="tv"&&(!x.upper[i].icon||x.upper[i].icon==="default")?(["back","home","quick","input","volumeDown","mute","volumeUp","stop"].includes(x.upper[i].action)?x.upper[i].action:""):"";b.disabled=!loaded||pending;b.classList.toggle("home-selected",selected?.area==="upper"&&selected.index===i);bind(b,p)});lower.replaceChildren();x.lower.forEach((slot,i)=>{const b=node("button",caption(slot),lower);b.dataset.glassEmpty=String(!slot);b.disabled=!loaded||pending;b.classList.toggle("home-selected",selected?.area==="lower"&&selected.index===i);bind(b,{area:"lower",index:i})});edit.disabled=!loaded||pending;document.getElementById("homeLayoutOpen").disabled=!loaded||pending||!!draft;reload.disabled=pending||!!draft;cancel.disabled=pending;save.disabled=pending||!loaded;assign.disabled=pending||!loaded;add.disabled=pending||!loaded;reset.disabled=pending||!loaded;place()}
 function load(){if(homeBusy||pending||draft)return;pending=true;setLayoutStatus("読込中…");render();homeSend("layoutLoad")}
 edit.onclick=()=>start();document.getElementById("homeLayoutOpen").onclick=()=>start();reload.onclick=load;cancel.onclick=()=>{if(pending||homeBusy)return;finish();setLayoutStatus(loaded?"変更取消":"再読込してください")};
 assign.onclick=()=>{if(!draft||!selected||pending)return;try{let x=null,k=slotType.value;if(k!=="empty"){x={kind:k};if(k==="remote"){[x.device,x.action]=choice.value.split(":")}else if(k==="app")x.title=choice.value;else if(k==="shortcut")x.name=name.value.trim();else if(k==="scene")x.mode=choice.value;else x.id=choice.value;if(label.value.trim())x.label=label.value.trim();if(ico.value!=="default")x.icon=ico.value}draft.layout=core.replace(draft.layout,selected,x);render();setLayoutStatus("未保存")}catch(_){setLayoutStatus("登録内容を確認してください")}};
 add.onclick=()=>{if(!draft||pending)return;try{draft.layout=core.append(draft.layout);setSelected({area:"lower",index:draft.layout.lower.length-1})}catch(_){setLayoutStatus("追加上限です")}};
 reset.onclick=()=>{if(!draft||pending)return;draft={schema:2,layout:core.seed(core.initial(null),apps),flick:{pad:"middle",flick:Object.fromEntries(roles.map(r=>[r,"auto"]))}};fcontrols.forEach((e,i)=>e.value=draft.flick.flick[roles[i]]);position.value="middle";setSelected({area:"upper",index:0});setLayoutStatus("初期配置・未保存")};
 position.onchange=()=>{if(draft&&!pending){updateFlick();place()}};
 save.onclick=()=>{if(!draft||pending||homeBusy||!loaded)return;updateFlick();const packet=JSON.stringify({base,next:draft});if(encodeURIComponent(packet).length>65000){setLayoutStatus("設定が大きすぎます");return}pending=true;setLayoutStatus("保存中…");render();homeSend("layoutSave",packet)};
 const allApps=document.createElement("details");allApps.id="homeAllApps";const allSummary=document.createElement("summary");allSummary.textContent="全アプリ一覧";const allList=document.createElement("div");allApps.append(allSummary,allList);document.getElementById("homeTVExtras").append(allApps);displayTVApps=function(data){const rank=["youtube","netflix","prime video","amazon","disney","spotify"];const score=x=>{const i=rank.findIndex(k=>String(x.title).toLowerCase().includes(k));return i<0?100:i};apps=Array.isArray(data)?[...data].sort((a,b)=>score(a)-score(b)||String(a.title).localeCompare(String(b.title),"ja")):[];if(loaded&&!draft&&!saved.layout.seeded)saved.layout=core.seed(saved.layout,apps);allList.replaceChildren();for(const app of apps.slice(0,80)){const b=node("button",app.title,allList);b.onclick=()=>{if(!draft&&loaded&&!pending&&!homeBusy)nativeAction("tvApps","launchByTitle","アプリ起動",app.title)}}if(draft&&slotType.value==="app")refreshChoices();render()};
 homeLayoutReply=r=>{pending=false;
  if(r.kind==="layoutRun"){setLayoutStatus(r.message||r.tvExtra||(r.ok?"指示送信・物理状態未確認":"操作失敗"));if(r.ok)nativeResult({...r,home:false});render();return}
  if(!r.ok){loaded=false;setLayoutStatus((r.message||"保存失敗")+(draft?"・取消後に再読込してください":""));render();return}
  const rec=r.record;try{if(!rec||!(rec.raw===null||typeof rec.raw==="string"))throw Error();base=rec.raw;if(rec.value){saved={schema:2,layout:core.seed(core.validate(rec.value.layout),apps),flick:rec.value.flick}}else{saved={schema:2,layout:core.seed(core.initial(old),apps),flick:{pad:old.pad,flick:old.flick}}}loaded=true;if(draft)finish();render();setLayoutStatus(r.kind==="layoutSave"?"保存済み":"読込済み");if(homeView==="remote"&&activePanel==="tv")scheduleHomeRemoteRead("tv")}catch(_){loaded=false;setLayoutStatus("配置応答不正");render()}
 };
 homeCustomFlick=(role,m)=>{if(!loaded||draft||pending||homeBusy)return;const a=saved.flick.flick[role];if(a&&a!=="auto")nativeAction("tv",a,opLabel("tv",a));else nativeAction("homeFlick",role,"",m)};
 const originalPanel=setPanel;setPanel=function(p){if(draft)return;originalPanel(p);if(p==="tv"&&homeView==="remote"&&!loaded&&!pending)load()};
 document.addEventListener("home-layout-read",()=>{if(!loaded&&!pending)load()});
 document.addEventListener("click",e=>{if(draft&&!e.target.closest("#homeUnifiedEditor,.home-layout-bar,[data-home-slot]")){e.preventDefault();e.stopImmediatePropagation()}},true);
 render();
}
unifiedHomeUI();



bindLightHoldButtons();renderTV();renderTVStudio();try{applyRemoteAppearance()}catch(_){}
pollTimer=setInterval(()=>{if(homeView==="remote"&&activePanel==="tv"&&!homeBusy)requestMode()},1600);
acTimer=setInterval(()=>{if(homeView==="remote"&&activePanel==="ac"&&!homeBusy)requestAC()},30000);
window.addEventListener("beforeunload",()=>{if(pollTimer)clearInterval(pollTimer);if(acTimer)clearInterval(acTimer)});

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
const PICTURE_PRESET_KEYS=["day","night","movie","extra1","extra2","extra3","extra4","extra5"]
const PICTURE_PRESET_PREFIX="yos.bravia.scriptable.picture-user-preset.v2."
async function sonyVideoJSON(method,params,version="1.0",timeout=8){
 const r=new Request("http://"+sonyHost()+"/sony/video");r.method="POST";r.timeoutInterval=timeout
 r.headers={"Content-Type":"application/json","X-Auth-PSK":sonyPSK()}
 r.body=JSON.stringify({method,params,id:1,version})
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
 for(const target of ["pictureMode","brightness","contrast"]){
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
function readPicturePreset(key){
 if(!PICTURE_PRESET_KEYS.includes(key)||!Keychain.contains(PICTURE_PRESET_PREFIX+key))return null;
 try{const p=JSON.parse(Keychain.get(PICTURE_PRESET_PREFIX+key));if(p?.schema!==2||!Array.isArray(p.settings)||!p.settings.length||p.settings.length>PICTURE_TARGETS.length||p.settings.some(x=>!x||!PICTURE_TARGETS.includes(x.target)||typeof x.value!=="string")||new Set(p.settings.map(x=>x.target)).size!==p.settings.length)return null;return {name:typeof p.name==="string"?p.name.slice(0,24):"",settings:p.settings}}catch(_){return null}
}
function picturePresetDetails(){return Object.fromEntries(PICTURE_PRESET_KEYS.map(k=>[k,readPicturePreset(k)]))}
function pictureSavedFlags(){return Object.fromEntries(PICTURE_PRESET_KEYS.map(k=>[k,Keychain.contains(PICTURE_PRESET_PREFIX+k)]))}
async function pictureProbe(message,existing){
 const map=existing||await pictureAll()
 const entries=PICTURE_TARGETS.filter(t=>map.has(t)).map(t=>picturePublic(map.get(t)))
 return{entries,saved:pictureSavedFlags(),presets:picturePresetDetails(),message:message||("BRAVIAから"+entries.length+"項目を取得。調整できない項目はテレビのクイック設定を使用してください。")}
}
async function writePicture(target,value){
 if(!PICTURE_TARGETS.includes(target))throw Error("この画質項目は安全な直接操作に非対応です")
 const settings=await pictureAll(),entry=settings.get(target)
 if(!validPictureValue(entry,value))throw Error("テレビが許可していない設定値です："+target)
 if(String(entry.currentValue)===String(value))return false
 await sonyVideoJSON("setPictureQualitySettings",[{settings:[{target,value:String(value)}]}])
 const checked=(await pictureAll()).get(target)
 if(!checked||(String(checked.currentValue)!==String(value)&&!(Number.isFinite(Number(value))&&Number(checked.currentValue)===Number(value))))throw Error("テレビ側で反映確認できませんでした："+target)
 return true
}
async function editPicturePreset(payload){
 if(!payload||!PICTURE_PRESET_KEYS.includes(payload.key)||typeof payload.name!=="string"||!payload.name.trim()||payload.name.trim().length>24||!Array.isArray(payload.settings)||!payload.settings.length||payload.settings.length>PICTURE_TARGETS.length)throw Error("登録内容が不正です");
 const prior=readPicturePreset(payload.key),supported=await pictureAll(),seen=new Set(),settings=[];
 if(Keychain.contains(PICTURE_PRESET_PREFIX+payload.key)&&!prior)throw Error("既存設定の形式が不明なため保護しました");
 if(prior&&prior.settings.some(x=>!validPictureValue(supported.get(x.target),x.value)))throw Error("既存の保存項目が現在利用できないため保護しました");
 for(const item of payload.settings){
  if(!item||typeof item.value!=="string"||seen.has(item.target)||!validPictureValue(supported.get(item.target),item.value))throw Error("テレビが許可していない登録値です");
  seen.add(item.target);settings.push({target:item.target,value:item.value});
 }
 const record=JSON.stringify({schema:2,name:payload.name.trim(),created:new Date().toISOString(),settings});
 const storage=PICTURE_PRESET_PREFIX+payload.key;
 if(Keychain.contains(storage))Keychain.set(storage+".previous",Keychain.get(storage));
 Keychain.set(storage,record);
 if(Keychain.get(storage)!==record)throw Error("登録の読戻しに失敗しました");
 return {...await pictureProbe("画質ショートカットを登録しました。テレビは変更していません。",supported),edited:payload.key};
}
async function pictureSave(key){
 if(!PICTURE_PRESET_KEYS.includes(key))throw Error("保存先が不明です")
 const settings=await pictureAll(),saved=[]
 for(const target of PICTURE_TARGETS){
  const e=settings.get(target)
  if(e&&validPictureValue(e,e.currentValue))saved.push({target,value:String(e.currentValue)})
 }
 if(!saved.length)throw Error("保存可能な画質項目を取得できません。保存を行いません")
 const storage=PICTURE_PRESET_PREFIX+key,prior=readPicturePreset(key);if(Keychain.contains(storage)){if(!prior)throw Error("既存設定を保護しました");if(prior.settings.some(x=>!saved.some(y=>x.target===y.target)))throw Error("既存設定の一部が未取得のため上書きしません");Keychain.set(storage+".previous",Keychain.get(storage))}
 Keychain.set(storage,JSON.stringify({schema:2,name:prior?.name||"",created:new Date().toISOString(),settings:saved}))
 return pictureProbe("現在の画質"+saved.length+"項目を「"+(readPicturePreset(key)?.name||({day:"昼",night:"夜",movie:"映画"}[key])||key)+"」に保存しました。設定変更はしていません。")
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
 try{for(const item of list){if(await writePicture(item.target,item.value))changed++}}
 catch(e){throw Error("画質の一部だけ変更された可能性があります（"+changed+"件確認済み）。"+String(e.message||e))}
 return pictureProbe("保存済み「"+(readPicturePreset(key)?.name||({day:"昼",night:"夜",movie:"映画"}[key])||key)+"」を呼び出しました。"+changed+"項目を変更・読戻し確認しました。")
}
// Explicit user-initiated discovery only: never send settings or change startup.
async function discoverExtraPictureTargets(){
 const output=[];
 for(const version of ["1.0","1.1"]){
  try{
   const data=await sonyVideoJSON("getPictureQualitySettings",version==="1.1"?[{}]:[{target:""}],version,5);
   const raw=flattenPicture(data.result),known=new Set(raw.filter(e=>PICTURE_TARGETS.includes(e.target)).map(e=>e.target));
   const extras=[...new Set(raw.filter(e=>e.isAvailable!==false&&typeof e.target==="string"&&!PICTURE_TARGETS.includes(e.target)).map(e=>e.target))].slice(0,30);
   output.push("v"+version+"：応答あり・既存"+known.size+"項目 / "+(extras.length?"追加候補 "+extras.join("、"):"追加対象なし"));
  }catch(error){const code=String(error?.message||"").match(/API拒否：(\d+)/);output.push("v"+version+"："+(code?"API拒否（"+code[1]+"）":"通信失敗または応答形式不明"))}
 }
 return{discovery:true,message:"読み取り専用調査｜"+output.join(" / ")+"。追加対象の変更可否は未検証。"};
}
async function pictureAction(action,slot){
 if(action==="probe")return pictureProbe()
 if(action==="discover")return discoverExtraPictureTargets()
 if(action==="set"){
  let payload
  try{payload=JSON.parse(String(slot||""))}catch(_){throw Error("設定内容が不正です")}
  if(!payload||typeof payload.target!=="string"||typeof payload.value!=="string")throw Error("設定内容が不正です")
  await writePicture(payload.target,payload.value)
  return pictureProbe("「"+payload.target+"」を変更し、テレビの値を確認しました")
 }
 if(action==="edit"){let payload;try{payload=JSON.parse(String(slot))}catch(_){throw Error("登録内容が不正です")}return editPicturePreset(payload)}
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
function quickFlattenUri(value,out=[]){
 if(Array.isArray(value)){for(const x of value)quickFlattenUri(x,out)}
 else if(value&&typeof value==="object"){
   if(typeof value.uri==="string")out.push(value.uri)
   for(const x of Object.values(value))if(x&&typeof x==="object")quickFlattenUri(x,out)
 }
 return out
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
 const sound={},found=new Set()
 const ingest=data=>{
   for(const r of quickSoundFlatten(data.result)){
     if(!["soundMode","outputTerminal"].includes(r.target))continue
     const options=Array.isArray(r.candidate)?r.candidate.filter(c=>c&&typeof c.value==="string").map(c=>c.value):[]
     const current=String(r.currentValue??r.value??"")
     if(!options.includes(current))continue
     sound[r.target]={target:r.target,value:current,options,available:true}
     found.add(r.target)
   }
 }
 try{ingest(await sonyQuickJSON("audio","getSoundSettings",[{target:""}],"1.1"))}catch(_){}
 // Some BRAVIA firmware rejects aggregate target="", but supports individual targets.
 const targets=["soundMode","outputTerminal"].filter(target=>!found.has(target))
 if(targets.length){
   const replies=await Promise.allSettled(targets.map(target=>sonyQuickJSON("audio","getSoundSettings",[{target}],"1.1")))
   for(const response of replies)if(response.status==="fulfilled")ingest(response.value)
 }
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
 let observed=false
 // Switching HDMI sources is asynchronous. Read back up to three times.
 for(let attempt=0;attempt<3;attempt++){
   if(attempt)await new Promise(resolve=>Timer.schedule(450,false,resolve))
   const active=(await sonyQuickJSON("avContent","getPlayingContentInfo",[],"1.0")).result
   observed=quickFlattenUri(active).some(x=>x===uri)
   if(observed)break
 }
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

const yosTVApps=[];
async function yosTVAppJSON(method,params=[]){
 const r=new Request('http://'+sonyHost()+'/sony/appControl');r.method='POST';r.timeoutInterval=8;
 r.headers={'Content-Type':'application/json','X-Auth-PSK':sonyPSK()};
 r.body=JSON.stringify({method,params,id:1,version:'1.0'});
 const data=JSON.parse(await r.loadString());
 if(r.response?.statusCode!==200||data?.error||!Array.isArray(data?.result))throw Error('BRAVIAアプリ/入力APIが応答しません');
 return data.result;
}
async function yosTVGetApps(){
 const result=await yosTVAppJSON('getApplicationList');
 const entries=Array.isArray(result[0])?result[0]:[];
 if(entries.length>250)throw Error('BRAVIAアプリ件数が多いため取得できません');
 yosTVApps.length=0;
 for(const e of entries){
  const name=String(e?.title||'').trim().slice(0,60),uri=String(e?.uri||'');
  if(name&&uri&&uri.length<=380&&/^[a-z0-9.+:/?=_&%-]+$/i.test(uri))yosTVApps.push({title:name,uri});
 }
 return yosTVApps.map((v,index)=>({index,title:v.title}));
}
async function yosTVMediaAction(action,slot){
 if(action==='list')return {ok:true,apps:await yosTVGetApps(),tvExtra:'テレビからアプリ一覧を取得しました'};
 if(action==='launchByTitle'){
  if(typeof slot!=='string'||slot.length>60||!slot)throw Error('アプリ名が不正です');
  const fresh=await yosTVGetApps(),match=fresh.filter(x=>x.title===slot);if(match.length!==1||homeClosed)throw Error('アプリを一意に特定できません');
  return yosTVMediaAction('launch',String(match[0].index));
 }
 if(action==='launch'){
  const index=Number(slot);
  if(!Number.isSafeInteger(index)||index<0||index>=yosTVApps.length)throw Error('アプリ選択が不正です');
  await yosTVAppJSON('setActiveApp',[{uri:yosTVApps[index].uri}]);
  return {ok:true,tvExtra:'「'+yosTVApps[index].title+'」の起動要求を送信しました（起動結果は未確認）'};
 }
 if(action==='vpnOpen'){
  if(!yosTVApps.length)await yosTVGetApps();
  const matches=yosTVApps.filter(x=>/\b(vpn|nord|surfshark|proton|expressvpn|mullvad|windscribe|cyberghost|pia|private internet access)\b/i.test(x.title));
  if(matches.length===0)throw Error('VPNアプリが見つかりません。テレビで使用中のVPN名を確認してください');
  if(matches.length>1)throw Error('VPNアプリが複数あります。アプリ一覧から選択してください');
  await yosTVAppJSON('setActiveApp',[{uri:matches[0].uri}]);
  return {ok:true,tvExtra:'VPNアプリを開く要求を送信しました。接続/切断はアプリ内で行ってください'};
 }
 if(action==='text'){
  const text=String(slot||'');
  if(!text.trim()||text.length>140||/[\u0000-\u001f\u007f]/.test(text))throw Error('入力文字を確認してください');
  const statuses=await yosTVAppJSON('getApplicationStatusList');
  const entries=Array.isArray(statuses[0])?statuses[0]:[];
  const active=entries.some(x=>x?.name==='textInput'&&x?.status==='on');
  if(!active)throw Error('テレビで検索欄を開いてから文字を入力してください');
  // v1.0 transmits over private LAN HTTP, never type secrets or passwords.
  await yosTVAppJSON('setTextForm',[text]);
  return {ok:true,tvExtra:'文字入力要求を送信しました（テレビの入力結果は未確認）'};
 }
 throw Error('未対応のTV補助操作です');
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

const homeScenes=(()=>{const PREF_KEY='yos.home-scenes.presets.v1';
const MODES=['departure','arrival','sleep','wake','night','movie','relax','clean','focus'];
const LEGACY_MODES=['departure','arrival'];
const DEVICES=['tv','light','ac','floor'];
const CHOICES=['on','off','keep'];

function blank(){
  const row=()=>({tv:'keep',light:'keep',ac:'keep',floor:'keep'});
  return {schema:1,departure:row(),arrival:row(),sleep:row(),wake:row(),night:row(),movie:row(),relax:row(),clean:row(),focus:row()};
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
  if(raw==='映画'||raw==='movie')return 'movie';
  if(raw==='リラックス'||raw==='relax')return 'relax';
  if(raw==='掃除'||raw==='clean'||raw==='cleaning')return 'clean';
  if(raw==='集中'||raw==='focus')return 'focus';
  if(raw===''||raw==='remote'||raw==='リモコン')return 'remote';
  if(raw==='edit'||raw==='設定'||raw==='settings')return null;
  throw Error('指定できないモードです（外出・帰宅・就寝・起床・夜・映画・リラックス・掃除・集中・リモコン・設定）');
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
async function execute(mode,prefs,canContinue=()=>true){
  const coreNeeded=DEVICES.some(device=>device!=='tv'&&prefs[mode][device]!=='keep');
  let core=null,coreError=null;
  if(coreNeeded){try{core=tapoCore()}catch(e){coreError=e}}
  const results=[];
  for(const device of DEVICES){
    if(!canContinue()){results.push({device,choice:prefs[mode][device],status:'中止'});continue;}
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

return {MODES,readPrefs,savePrefs,validated,execute};})();
let homeQueued=false,homeClosed=false,homeSeen=0;
function unifiedSlots(allow,presets){
 const defaults=["back","home","quick","input","volumeDown","mute","volumeUp","stop"];
 const scenes=["departure","arrival","sleep","wake","night","movie","relax","clean","focus"];
 const icons=["default","power","home","tv","sun","moon","lamp","snow","play","stop","volume","star","film","bolt","shortcut"];
 const safeText=(v,n)=>typeof v==="string"&&v.length>0&&v.length<=n&&v.trim()===v&&!/[\x00-\x1f\x7f]/.test(v);
 const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 function clean(x){
  if(x===null)return null;if(!x||typeof x!=="object"||Array.isArray(x))throw Error("invalid slot");
  const o={kind:x.kind};
  if(x.kind==="remote"){if(!own(allow,x.device)||!allow[x.device].includes(x.action))throw Error("invalid command");o.device=x.device;o.action=x.action}
  else if(x.kind==="app"){if(!safeText(x.title,60))throw Error("invalid app");o.title=x.title}
  else if(x.kind==="shortcut"){if(!safeText(x.name,100))throw Error("invalid shortcut");o.name=x.name}
  else if(x.kind==="scene"){if(!scenes.includes(x.mode))throw Error("invalid scene");o.mode=x.mode}
  else if(x.kind==="preset"){if(!presets.includes(x.id))throw Error("invalid preset");o.id=x.id}
  else throw Error("invalid kind");
  if(x.label!==undefined){if(!safeText(x.label,24))throw Error("invalid label");o.label=x.label}
  if(x.icon!==undefined){if(!icons.includes(x.icon))throw Error("invalid icon");o.icon=x.icon}
  return o;
 }
 function validate(x){
  if(!x||x.schema!==1||!Array.isArray(x.upper)||x.upper.length!==8||!Array.isArray(x.lower)||x.lower.length<8||x.lower.length>48||typeof x.seeded!=="boolean")throw Error("invalid layout");
  return {schema:1,upper:x.upper.map(clean),lower:x.lower.map(clean),seeded:x.seeded};
 }
 function initial(old){return validate({schema:1,upper:defaults.map((a,i)=>({kind:"remote",device:"tv",action:allow.tv.includes(old?.slots?.[i])?old.slots[i]:a})),lower:Array(8).fill(null),seeded:false})}
 function load(raw,old){return raw===null?initial(old):validate(JSON.parse(raw))}
 function seed(state,apps){let o=validate(state);if(o.seeded)return o;let names=apps.filter(a=>safeText(a?.title,60)).map(a=>a.title);let uniq=names.filter((n,i)=>names.indexOf(n)===i&&names.lastIndexOf(n)===i);if(!uniq.length)return o;o.lower=Array.from({length:Math.max(8,Math.min(48,uniq.length))},(_,i)=>uniq[i]?{kind:"app",title:uniq[i]}:null);o.seeded=true;return validate(o)}
 function at(o,r){if(!r||!["upper","lower"].includes(r.area)||!Number.isInteger(r.index)||r.index<0||r.index>=o[r.area].length)throw Error("invalid position");return o[r.area]}
 function replace(state,r,x){let o=validate(state);at(o,r)[r.index]=clean(x);o.seeded=true;return o}
 function swap(state,a,b){let o=validate(state),aa=at(o,a),bb=at(o,b);[aa[a.index],bb[b.index]]=[bb[b.index],aa[a.index]];o.seeded=true;return o}
 function append(state){let o=validate(state);if(o.lower.length>=48)throw Error("full");o.lower.push(null);o.seeded=true;return o}
 function dispatch(x,ctx){if(ctx.editing||ctx.busy||ctx.closed||!ctx.explicit)return null;let o=clean(x);if(o===null)return null;
  if(o.kind==="remote")return {device:o.device,action:o.action};
  if(o.kind==="app"){let found=ctx.apps.filter(a=>a.title===o.title);if(found.length!==1||!Number.isSafeInteger(found[0].index)||found[0].index<0)return null;return {device:"tvApps",action:"launchByTitle",title:o.title}}
  if(o.kind==="shortcut")return {device:"home",action:"launchShortcut",name:o.name};
  if(o.kind==="scene")return {device:"home",action:o.mode==="sleep"?"sleep":"run",slot:o.mode==="sleep"?"おやすみマン":o.mode};
  if(o.kind==="preset")return ctx.savedPresets.includes(o.id)?{device:"picture",action:"load",slot:o.id}:null;
  return null;
 }
 return {clean,validate,initial,load,seed,replace,swap,append,dispatch,icons};
}
const yosSlotAllow={"tv":["power","input","home","quick","menu","back","up","down","left","right","confirm","volumeDown","mute","volumeUp","channelDown","channelUp","rewind","play","fastForward","pause","stop","prev","next","pictureOff"],"light":["on","off","all","bright","dark","night"],"ac":["cool","dry","heat","stop","tempDown","tempUp","fan","wind"],"floor":["on","off"]};
const yosSlotPresets=["day","night","movie","extra1","extra2","extra3","extra4","extra5"];
function homeLayoutStore(core,kc){
 const key="yos.remote.home.layout.v2", roles=["tap","up","down","left","right"];
 function flick(x){if(!x||!["top","middle","bottom"].includes(x.pad)||!x.flick||!roles.every(r=>x.flick[r]==="auto"||yosSlotAllow.tv.includes(x.flick[r])))throw Error("不正なフリック設定");return {pad:x.pad,flick:Object.fromEntries(roles.map(r=>[r,x.flick[r]]))}}
 function validate(x){if(x?.schema!==2)throw Error("不正な設定形式");return {schema:2,layout:core.validate(x.layout),flick:flick(x.flick)}}
 function read(){if(!kc.contains(key))return {raw:null,value:null};const raw=kc.get(key);if(typeof raw!=="string"||raw.length>32000)throw Error("設定破損・変更しません");return {raw,value:validate(JSON.parse(raw))}}
 function save(base,next){const old=read();if(old.raw!==base)throw Error("設定が変更されています。読み直してください");const value=validate(next),raw=JSON.stringify(value);if(raw.length>32000)throw Error("設定が大きすぎます");
  try{kc.set(key,raw);if(kc.get(key)!==raw)throw Error("保存読戻し失敗")}catch(e){try{if(old.raw===null){if(kc.contains(key))kc.remove(key);if(kc.contains(key))throw Error("restore")}else{kc.set(key,old.raw);if(kc.get(key)!==old.raw)throw Error("restore")}}catch(_){throw Error("保存失敗・復旧未確認。再読込してください")}throw Error("保存失敗・旧設定を保持")}
  return {raw,value}
 }
 return {read,save,validate};
}
const homeLayoutNative=homeLayoutStore(unifiedSlots(yosSlotAllow,yosSlotPresets),Keychain);
async function executeHomeSlot(request,record,core,deps){
 const pos=request?.pos;if(!pos||!["upper","lower"].includes(pos.area)||!Number.isInteger(pos.index)||pos.index<0||pos.index>=(pos.area==="upper"?8:48))throw Error("不正な位置");
 const slot=core.clean(request.slot);if(slot===null||deps.closed())throw Error("未登録または画面終了");
 if(record.raw!==request.base)throw Error("配置変更・再読込してください");
 const saved=record.value?.layout;
 if(saved){const initialApp=!saved.seeded&&pos.area==="lower"&&slot.kind==="app"&&saved.lower[pos.index]==null;if(!initialApp&&JSON.stringify(saved[pos.area][pos.index])!==JSON.stringify(slot))throw Error("登録内容が一致しません")}
 else if(!((pos.area==="upper"&&slot.kind==="remote"&&slot.device==="tv"&&slot.action!=="pictureOff")||(pos.area==="lower"&&slot.kind==="app")))throw Error("先に配置を保存してください");
 let apps=[];if(slot.kind==="app")apps=await deps.apps();
 if(deps.closed())throw Error("画面終了");
 const r=core.dispatch(slot,{explicit:true,editing:false,busy:false,closed:false,apps,savedPresets:deps.presets()});
 if(!r)throw Error("現在使用できない操作です");
 return await deps.execute(r);
}
async function homeNative(item){
 const kind=item.action;
 if(homeClosed)throw Error("画面終了");
 stopTVHold();stopLightHold();await Promise.allSettled([tvHoldPromise,lightHoldPromise]);
 if(homeClosed)throw Error("画面終了");
 if(kind==="layoutRun"){
  if(typeof item.slot!=="string"||item.slot.length>66000)throw Error("不正な配置操作");
  const request=JSON.parse(item.slot),record=homeLayoutNative.read();
  const result=await executeHomeSlot(request,record,unifiedSlots(yosSlotAllow,yosSlotPresets),{
    closed:()=>homeClosed,apps:yosTVGetApps,presets:()=>PICTURE_PRESET_KEYS.filter(k=>Keychain.contains(PICTURE_PRESET_PREFIX+k)),
    execute:async r=>{
     if(homeClosed)throw Error("画面終了");
     if(r.device==="tv"){await sonyAction(r.action);return {ok:true,mode:await inferMode()}}
     if(r.device==="light"){await runExisting(CONFIG.light.actionScript,r.action);return {ok:true}}
     if(r.device==="ac"){await runExisting(CONFIG.ac.actionScript,r.action);return {ok:true,ac:await readACSummary()}}
     if(r.device==="floor")return controlFloor(r.action,"");
     if(r.device==="tvApps"){const matches=yosTVApps.map((a,index)=>({...a,index})).filter(a=>a.title===r.title);if(matches.length!==1)throw Error("アプリを一意に特定できません");return yosTVMediaAction("launch",String(matches[0].index))}
     if(r.device==="picture")return {ok:true,picture:await pictureLoad(r.slot)};
     if(r.device==="home"&&r.action==="launchShortcut"){if(typeof Safari==="undefined"||typeof Safari.open!=="function")throw Error("ショートカット起動不可");Safari.open("shortcuts://run-shortcut?name="+encodeURIComponent(r.name));return {ok:true,message:"登録済みショートカットの起動を依頼しました"}}
     if(r.device==="home"&&["run","sleep"].includes(r.action))return homeNative({action:r.action,slot:r.slot});
     throw Error("未対応の操作");
    }
  });
  return {...result,home:true,kind};
 }
 if(kind==="layoutLoad")return {ok:true,home:true,kind,record:homeLayoutNative.read(),message:"配置を読み込みました"};
 if(kind==="layoutSave"){
  if(typeof item.slot!=="string"||item.slot.length>66000)throw Error("設定サイズ不正");
  const x=JSON.parse(item.slot);if(!x||!(x.base===null||typeof x.base==="string"))throw Error("設定不正");
  return {ok:true,home:true,kind,record:homeLayoutNative.save(x.base,x.next),message:"配置を保存しました"};
 }
 if(kind==="load")return {ok:true,home:true,kind,prefs:homeScenes.readPrefs(),message:"設定を読み込みました"};
 if(kind==="save"){
  const x=JSON.parse(item.slot);
  if(!x||typeof x!=="object"||JSON.stringify(homeScenes.readPrefs())!==JSON.stringify(homeScenes.validated(x.base)))throw Error("保存済み設定が変更されています。読み直してください");
  const key="yos.home-scenes.presets.v1",old=Keychain.contains(key)?Keychain.get(key):null;
  try{homeScenes.savePrefs(x.next)}catch(e){if(old===null&&Keychain.contains(key))Keychain.remove(key);throw e}
  return {ok:true,home:true,kind,prefs:homeScenes.readPrefs(),message:"設定を保存しました。家電は操作していません"};
 }
 if(kind==="sleep"){
  if(item.slot!=="おやすみマン")throw Error("未登録ショートカット");
  if(typeof Safari==="undefined"||typeof Safari.open!=="function")throw Error("ショートカット起動不可");
  Safari.open("shortcuts://run-shortcut?name="+encodeURIComponent("おやすみマン"));
  return {ok:true,home:true,kind,message:"おやすみマンの起動を依頼しました"};
 }
 if(kind!=="run"||!homeScenes.MODES.includes(item.slot)||item.slot==="sleep")throw Error("不正な生活モード");
 const rows=await homeScenes.execute(item.slot,homeScenes.readPrefs(),()=>!homeClosed);
 const sent=rows.filter(x=>x.status==="送信").length,failed=rows.filter(x=>x.status==="エラー").length,stopped=rows.filter(x=>x.status==="中止").length;
 return {ok:!failed&&!stopped,home:true,kind,message:sent+"件 指示送信 / "+failed+"件 エラー / "+stopped+"件 中止"+(!sent&&!failed&&!stopped?"（全て維持）":"。物理状態は未確認")};
}
function homeFlickAction(mode,dir){
 if(!["navigation","hybrid","media"].includes(mode)||!["up","down","left","right","tap"].includes(dir))return null;
 if(mode==="navigation")return dir==="tap"?"confirm":dir;
 if(dir==="left")return "rewind";if(dir==="right")return "fastForward";if(dir==="tap")return "play";
 return mode==="hybrid"?dir:null;
}
async function homeFlickNative(item){
 const observed=await inferMode();
 if(homeClosed||observed!==item.slot)return {ok:false,message:"モードが変化しました。もう一度操作してください"};
 const action=homeFlickAction(observed,item.action);
 if(!action)return {ok:true,mode:observed};
 await sonyAction(action);
 return {ok:true,mode:await inferMode()};
}
async function homeRemoteRead(device){
 if(device==="ac")return {ok:true,ac:await readACSummary()};
 if(device==="floor")return {ok:true,floor:await readFloor()};
 if(device!=="tv")return {ok:true};
 const result={ok:true};
 try{result.mode=await inferMode()}catch(_){}
 if(!homeClosed)try{result.apps=await yosTVGetApps()}catch(_){}
 if(!homeClosed)try{result.picture=await pictureProbe()}catch(_){}
 return result;
}

const queue=[];let running=false,web=null
async function processQueue(){if(running)return;running=true;while(queue.length){const item=queue.shift();let result;try{if(homeClosed)break;if(item.device==="home"){result=await homeNative(item)}else if(item.device==="homeFlick"){result=await homeFlickNative(item)}else if(item.device==="homeRead"){result=await homeRemoteRead(item.action)}else if(item.device==="system"&&item.action==="refreshMode")result={ok:true,mode:await inferMode()};else if(item.device==="system"&&item.action==="refreshAC")result={ok:true,ac:await readACSummary()};else if(item.device==="picture"){result={ok:true,picture:await pictureAction(item.action,item.slot)}}else if(item.device==="quick"){result={ok:true,quick:await quickAction(item.action,item.slot)}}else if(item.device==="tvApps"){result=await yosTVMediaAction(item.action,item.slot)}else if(item.device==="tvCursor"){await sonyAction(item.action,false);result={ok:true,label:item.label,action:item.action,mode:await inferMode()}}else if(item.device==="tvAdaptive"){const currentMode=await inferMode();let action=item.action;if(currentMode==="navigation"&&CROSS_NAV[item.slot])action=CROSS_NAV[item.slot];else if(currentMode==="hybrid"&&HYBRID_CURSOR_ROLES.has(item.slot))action=CROSS_NAV[item.slot];await sonyAction(action);result={ok:true,label:item.label,action,mode:await inferMode()}}else if(item.device==="tvOriginal"){await sonyAction(item.action,false);result={ok:true,label:item.label,action:item.action,mode:await inferMode()}}else if(item.device==="tv"){await sonyAction(item.action);result={ok:true,label:item.label,action:item.action,mode:await inferMode()}}else if(item.device==="light"){await runExisting(CONFIG.light.actionScript,item.action);result={ok:true,label:item.label}}else if(item.device==="ac"){await runExisting(CONFIG.ac.actionScript,item.action);result={ok:true,label:item.label,ac:await readACSummary()}}else if(item.device==="floor")result=await controlFloor(item.action,item.label);else throw new Error("不明なデバイスです")}catch(error){result={ok:false,message:error&&error.message?error.message:String(error),discoveryError:item.device==="picture"&&item.action==="discover",home:item.device==="home",kind:item.device==="home"?item.action:null}}if(item.device==="home")homeQueued=false;try{if(!homeClosed)await web.evaluateJavaScript("nativeResult("+JSON.stringify(result)+")")}catch(_){}}running=false}
web=new WebView();web.shouldAllowRequest=request=>{const url=String(request.url||"");if(!url.startsWith("https://yos-remote.local/__action?"))return true;let query;try{query=parseQuery(url)}catch(_){return false}if(homeClosed)return false;if(query.device==="homeStopHolds"){stopTVHold();stopLightHold();return false}if(homeQueued){if(query.device==="tvHoldStop")stopTVHold();if(query.device==="lightHoldStop")stopLightHold();return false}if(query.device==="home"){const n=Number(query.n);if(!Number.isSafeInteger(n)||n<=homeSeen)return false;homeSeen=n;homeQueued=true;stopTVHold();stopLightHold()}if(query.device==="tvHoldStart"){startTVHold(query.action);return false}if(query.device==="tvHoldHeartbeat"){renewTVHold(query.action);return false}if(query.device==="tvHoldStop"){stopTVHold();return false}if(query.device==="lightHoldStart"){startLightHold(query.action);return false}if(query.device==="lightHoldHeartbeat"){renewLightHold(query.action);return false}if(query.device==="lightHoldStop"){stopLightHold();return false}queue.push({device:query.device,action:query.action,label:query.label,slot:query.slot});processQueue();return false}
await web.loadHTML(html,"https://yos-remote.local/");await web.present(true);homeClosed=true;queue.length=0;stopTVHold();stopLightHold();await Promise.allSettled([tvHoldPromise,lightHoldPromise]);Script.complete()