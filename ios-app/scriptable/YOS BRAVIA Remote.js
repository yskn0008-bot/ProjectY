// YOS BRAVIA Remote — Scriptable fallback for Issue #292.
// One-screen WebView UI with inline touchpad. Sony commands are discovered at runtime.

const STORAGE = Object.freeze({
  host: 'yos.bravia.scriptable.host',
  psk: 'yos.bravia.scriptable.psk',
  quick: 'yos.bravia.scriptable.quick-command'
});

const UPDATE_URL = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/codex/issue-292-bravia-scriptable/ios-app/scriptable/YOS%20BRAVIA%20Remote.js';

const ACTION_ALIASES = Object.freeze({
  power: ['poweroff', 'power'],
  input: ['input'],
  home: ['home'],
  back: ['return', 'back'],
  up: ['up'],
  left: ['left'],
  confirm: ['confirm', 'enter'],
  right: ['right'],
  down: ['down'],
  volumeDown: ['volumedown'],
  mute: ['mute'],
  volumeUp: ['volumeup'],
  channelDown: ['channeldown'],
  channelUp: ['channelup'],
  play: ['play'],
  pause: ['pause'],
  stop: ['stop'],
  rewind: ['rewind'],
  forward: ['forward'],
  flashMinus: ['flashminus'],
  flashPlus: ['flashplus'],
  prev: ['prev'],
  next: ['next']
});

const LABELS = Object.freeze({
  power:'電源',poweroff:'電源OFF',input:'入力',home:'ホーム',return:'戻る',back:'戻る',
  up:'上',down:'下',left:'左',right:'右',confirm:'OK',enter:'OK',volumedown:'音量−',
  volumeup:'音量＋',mute:'ミュート',channeldown:'CH−',channelup:'CH＋',play:'再生',
  pause:'一時停止',stop:'停止',rewind:'巻き戻し',forward:'早送り',flashminus:'10秒戻し',
  flashplus:'15秒送り',prev:'前',next:'次',options:'オプション',actionmenu:'アクションメニュー',
  quick:'クイック設定',settings:'設定',syncmenu:'BRAVIA Sync',display:'画面表示',
  androidmenu:'Androidメニュー',jump:'直前へ戻る',caption:'字幕',epg:'番組表',red:'赤',blue:'青',
  yellow:'黄',green:'緑',hdmi1:'HDMI1',hdmi2:'HDMI2',hdmi3:'HDMI3',hdmi4:'HDMI4',
  tendigital:'10キー',tenkey:'10キー',geodigital:'地デジ',pap:'2画面',ddata:'dデータ',help:'ヘルプ',
  bscs:'BS/CS',advancedbscs:'BS/CS 4K',cs:'CS',bs:'BS'
});

let host = readSecure(STORAGE.host);
let psk = readSecure(STORAGE.psk);
let remoteMap = new Map();
let remoteIndex = new Map();
let quickCandidates = [];
let bridgeQueue = Promise.resolve();

function readSecure(key) {
  return Keychain.contains(key) ? Keychain.get(key) : '';
}

function normalizeHost(value) {
  const v = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/:\d+$/, '');
  if (!v || /[\s/?#]/.test(v)) throw new Error('テレビのIPアドレスまたはホスト名を確認してください。');
  return v;
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]);
}

function irccEnvelope(code) {
  if (!code) throw new Error('未対応のコマンドです。');
  return '<?xml version="1.0"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
    '<s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1">' +
    '<IRCCCode>' + escapeXml(code) + '</IRCCCode>' +
    '</u:X_SendIRCC></s:Body></s:Envelope>';
}

async function requestText(url, options) {
  const r = new Request(url);
  r.method = options.method || 'GET';
  r.headers = options.headers || {};
  if (typeof options.body === 'string') r.body = options.body;
  const text = await r.loadString();
  const status = r.response ? r.response.statusCode : 0;
  if (status === 403) throw new Error('PSK認証に失敗しました。BRAVIA側と設定を確認してください。');
  if (status < 200 || status >= 300) throw new Error('BRAVIA通信に失敗しました（HTTP ' + status + '）。');
  return text;
}

async function discoverRemote() {
  host = normalizeHost(host);
  const text = await requestText('http://' + host + '/sony/system', {
    method: 'POST',
    headers: {'Content-Type':'application/json','X-Auth-PSK':psk},
    body: JSON.stringify({method:'getRemoteControllerInfo',params:[],id:1,version:'1.0'})
  });
  let payload;
  try { payload = JSON.parse(text); } catch (_) { throw new Error('テレビの対応コマンド一覧を読み取れませんでした。'); }
  const list = payload && payload.result && payload.result[1];
  if (!Array.isArray(list)) throw new Error('テレビの対応コマンド一覧を読み取れませんでした。');
  remoteMap = new Map(list.filter(x => x && typeof x.name === 'string' && typeof x.value === 'string').map(x => [x.name, x.value]));
  remoteIndex = new Map([...remoteMap].map(([name, code]) => [name.toLowerCase(), {name, code}]));
  quickCandidates = [...remoteMap].filter(([name]) => /option|actionmenu|quick|setting/i.test(name)).map(([name, code]) => ({name, code}));
}

function resolveAction(action) {
  for (const alias of ACTION_ALIASES[action] || []) {
    const c = remoteIndex.get(alias.toLowerCase());
    if (c) return c;
  }
  return null;
}

function commandByName(name) {
  return remoteIndex.get(String(name || '').toLowerCase()) || null;
}

async function sendCommand(command) {
  if (!command || !command.code) throw new Error('このテレビでは未対応です。');
  await requestText('http://' + host + '/sony/ircc', {
    method: 'POST',
    headers: {
      'Content-Type':'text/xml; charset=UTF-8',
      'X-Auth-PSK':psk,
      SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'
    },
    body: irccEnvelope(command.code)
  });
}

async function sendAction(action, silent = false) {
  try {
    await sendCommand(resolveAction(action));
    return true;
  } catch (e) {
    if (!silent) await showError(e);
    return false;
  }
}

async function sendRepeated(action, repeats) {
  const n = Math.min(6, Math.max(1, Number(repeats) || 1));
  for (let i = 0; i < n; i += 1) {
    if (!await sendAction(action, i > 0)) break;
  }
}

async function showError(error) {
  const a = new Alert();
  a.title = 'BRAVIA';
  a.message = error && error.message ? error.message : String(error);
  a.addAction('OK');
  await a.presentAlert();
}

async function message(title, text) {
  const a = new Alert();
  a.title = title;
  a.message = text;
  a.addAction('OK');
  await a.presentAlert();
}

async function configureConnection() {
  const a = new Alert();
  a.title = 'BRAVIA設定';
  a.message = 'テレビのIP/ホスト名とPSKを保存します。PSKはScriptableのKeychainへ保存されます。';
  a.addTextField('テレビのIPまたはホスト名', host || '');
  a.addSecureTextField(psk ? 'PSK（変更しないなら空欄）' : 'PSK', '');
  a.addAction('保存して接続');
  a.addCancelAction('キャンセル');
  if (await a.presentAlert() < 0) return false;
  const nextHost = normalizeHost(a.textFieldValue(0));
  const entered = a.textFieldValue(1).trim();
  const nextPsk = entered || psk;
  if (!nextPsk) throw new Error('PSKを入力してください。');
  host = nextHost;
  psk = nextPsk;
  Keychain.set(STORAGE.host, host);
  Keychain.set(STORAGE.psk, psk);
  return true;
}

async function ensureSettings() {
  if (host && psk) return true;
  try { return await configureConnection(); } catch (e) { await showError(e); return false; }
}

function japaneseLabel(name) {
  return LABELS[String(name || '').toLowerCase()] || name;
}

function storedQuick() {
  return Keychain.contains(STORAGE.quick) ? commandByName(Keychain.get(STORAGE.quick)) : null;
}

async function chooseQuick(sendAfter) {
  if (!quickCandidates.length) throw new Error('このテレビからクイック設定候補が返りませんでした。');
  const a = new Alert();
  a.title = 'クイック設定候補';
  a.message = '物理リモコンのクイック設定と同じ画面を開く候補を選んでください。';
  for (const c of quickCandidates) {
    const l = japaneseLabel(c.name);
    a.addAction(l === c.name ? c.name : l + '｜' + c.name);
  }
  a.addCancelAction('キャンセル');
  const i = await a.presentSheet();
  if (i < 0) return null;
  const c = quickCandidates[i];
  Keychain.set(STORAGE.quick, c.name);
  if (sendAfter) await sendCommand(c);
  return c;
}

async function sendQuick() {
  const c = storedQuick();
  if (c) return sendCommand(c);
  return chooseQuick(true);
}

function support() {
  const o = {};
  for (const a of Object.keys(ACTION_ALIASES)) o[a] = Boolean(resolveAction(a));
  o.quick = quickCandidates.length > 0;
  return o;
}

function commands() {
  return [...remoteMap].map(([name]) => ({name, label:japaneseLabel(name)})).sort((a,b) => a.label.localeCompare(b.label, 'ja'));
}

function htmlEscape(v) {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

function buildHTML() {
  const state = {host, count:remoteMap.size, support:support(), commands:commands()};
  const json = JSON.stringify(state).replace(/</g, '\\u003c');
  const btn = (label, action, cls = '') => '<button class="' + cls + '" data-action="' + action + '">' + label + '</button>';

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
:root{color-scheme:dark}
*{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}
body{overscroll-behavior:none}
main{height:100vh;max-width:760px;margin:0 auto;padding:7px 10px 8px;display:flex;flex-direction:column;gap:5px;overflow:hidden}
.head{height:40px;display:flex;align-items:end;justify-content:space-between}
h1{font-size:23px;line-height:1;margin:0}.meta{font-size:10.5px;color:#8e8e93;white-space:nowrap}
.section{font-size:12px;font-weight:700;margin:2px 0 0;line-height:16px}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.grid.two{grid-template-columns:repeat(2,1fr)}
button{border:0;border-radius:11px;background:#171717;color:#0a84ff;font-size:15px;height:39px;padding:4px 5px}
button:active{background:#282828;transform:scale(.98)}
button[disabled]{color:#555;background:#0d0d0d}
.icon{font-size:21px;font-weight:650}
.pad{height:clamp(128px,20vh,155px);min-height:128px;border-radius:22px;border:1px solid #343434;background:#111;touch-action:none;position:relative;overflow:hidden}
.hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#606064;font-size:12px;line-height:1.55;pointer-events:none}
.nub{width:48px;height:48px;border-radius:50%;border:1px solid #3a3a3a;background:#1c1c1e;position:absolute;left:50%;top:50%;margin:-24px;z-index:2;pointer-events:none;transition:transform .06s linear}
.status{height:14px;text-align:center;color:#8e8e93;font-size:10.5px;line-height:14px}
.footer{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:1px}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:flex-end;z-index:10}
.sheet{background:#151515;border-radius:20px 20px 0 0;max-height:78vh;width:100%;padding:12px 12px 24px;overflow:auto}
.sheetHead{display:flex;justify-content:space-between;align-items:center;position:sticky;top:-12px;background:#151515;padding:8px 0;z-index:2}
.sheetHead h2{margin:0;font-size:19px}.close{background:#2b2b2b;color:#fff;height:36px;font-size:13px;padding:5px 12px}
.commandList{display:grid;grid-template-columns:1fr 1fr;gap:6px}.commandList button{font-size:13px;height:40px}
@media (max-height:680px){
  main{padding-top:5px;gap:4px}.head{height:34px}h1{font-size:21px}.meta{font-size:9.5px}
  button{height:35px;font-size:14px}.icon{font-size:19px}.pad{height:118px;min-height:118px}
  .section{font-size:11px;line-height:14px}.status{height:12px;line-height:12px;font-size:9.5px}
}
</style>
</head>
<body>
<main>
<div class="head"><h1>BRAVIA</h1><div class="meta">接続済み · ${state.count} · ${htmlEscape(host)}</div></div>
<div class="grid">${btn('⏻ 電源','power')}${btn('入力','input')}${btn('クイック','quick')}</div>
<div class="grid two">${btn('戻る','back')}${btn('ホーム','home')}</div>

<div class="section">タッチパッド</div>
<div id="pad" class="pad">
  <div id="nub" class="nub"></div>
  <div class="hint">スワイプ＝移動　タップ＝OK<br>右へ引いて保持＝早送り　左へ引いて保持＝巻き戻し</div>
</div>
<div id="status" class="status">右/左に引いたまま0.4秒で早送り/巻き戻し</div>

<div class="section">音量・チャンネル</div>
<div class="grid">${btn('音量−','volumeDown')}${btn('ミュート','mute')}${btn('音量＋','volumeUp')}</div>
<div class="grid two">${btn('CH−','channelDown')}${btn('CH＋','channelUp')}</div>

<div class="section">再生</div>
<div class="grid">${btn('◀◀','rewind','icon')}${btn('▶','play','icon')}${btn('▶▶','forward','icon')}</div>
<div class="grid">${btn('↶10','flashMinus','icon')}${btn('Ⅱ','pause','icon')}${btn('15↷','flashPlus','icon')}</div>
<div class="grid">${btn('|◀','prev','icon')}${btn('■','stop','icon')}${btn('▶|','next','icon')}</div>

<div class="footer"><button id="other">その他</button><button id="settings">設定</button></div>
</main>

<div id="overlay" class="overlay">
  <div class="sheet">
    <div class="sheetHead"><h2>その他のボタン</h2><button id="closeSheet" class="close">閉じる</button></div>
    <div id="commandList" class="commandList"></div>
  </div>
</div>

<script>
const STATE=${json};

function bridge(path, params={}){
  const q=Object.entries(params).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');
  location.href='yosbravia://'+path+(q?'?'+q:'')+(q?'&':'?')+'_='+Date.now();
}
function setStatus(t){document.getElementById('status').textContent=t||''}

document.querySelectorAll('[data-action]').forEach(b=>{
  const a=b.dataset.action;
  if(!STATE.support[a]) b.disabled=true;
  b.addEventListener('click',()=>bridge('action',{name:a}));
});

const pad=document.getElementById('pad');
const nub=document.getElementById('nub');
let start=null;
let last=null;
let holdTimer=null;
let holdDir=null;
let seekActive=null;

function resetNub(){nub.style.transform='translate(0px,0px)'}
function clearHoldTimer(){
  if(holdTimer){clearTimeout(holdTimer);holdTimer=null}
  holdDir=null;
}
function horizontalSeekCandidate(dx,dy){
  if(Math.abs(dx)<58 || Math.abs(dx)<=Math.abs(dy)*1.2) return null;
  return dx>0?'forward':'rewind';
}
function armSeek(dir){
  if(seekActive===dir || holdDir===dir) return;
  clearHoldTimer();
  holdDir=dir;
  holdTimer=setTimeout(()=>{
    holdTimer=null;
    if(!start || holdDir!==dir) return;
    seekActive=dir;
    setStatus(dir==='forward'?'▶▶ 早送り中（離すと再生）':'◀◀ 巻き戻し中（離すと再生）');
    bridge('seek-start',{name:dir});
  },420);
}
function stopSeek(sendPlay){
  clearHoldTimer();
  if(seekActive){
    seekActive=null;
    if(sendPlay) bridge('seek-stop',{name:'play'});
  }
}

pad.addEventListener('pointerdown',e=>{
  start={x:e.clientX,y:e.clientY};
  last=start;
  try{pad.setPointerCapture(e.pointerId)}catch(_){}
});

pad.addEventListener('pointermove',e=>{
  if(!start)return;
  last={x:e.clientX,y:e.clientY};
  const rawDx=last.x-start.x, rawDy=last.y-start.y;
  const dx=Math.max(-82,Math.min(82,rawDx));
  const dy=Math.max(-62,Math.min(62,rawDy));
  nub.style.transform='translate('+dx+'px,'+dy+'px)';
  const candidate=horizontalSeekCandidate(rawDx,rawDy);

  if(seekActive && candidate!==seekActive){
    stopSeek(true);
    setStatus('スワイプ＝移動 · タップ＝OK');
  }
  if(!seekActive){
    if(candidate) armSeek(candidate);
    else clearHoldTimer();
  }
});

pad.addEventListener('pointerup',e=>{
  if(!start)return;
  const end=last||{x:e.clientX,y:e.clientY};
  const dx=end.x-start.x,dy=end.y-start.y,d=Math.hypot(dx,dy);
  const wasSeeking=Boolean(seekActive);
  start=null;last=null;
  clearHoldTimer();
  resetNub();

  if(wasSeeking){
    stopSeek(true);
    setStatus('再生');
    return;
  }
  if(d<13){
    setStatus('OK');
    bridge('gesture',{name:'confirm',repeats:1});
    return;
  }

  let a;
  if(Math.abs(dx)>Math.abs(dy)) a=dx>0?'right':'left';
  else a=dy>0?'down':'up';
  const n=Math.min(6,Math.max(1,Math.round(d/48)));
  setStatus((a==='left'?'←':a==='right'?'→':a==='up'?'↑':'↓')+' × '+n);
  bridge('gesture',{name:a,repeats:n});
});

pad.addEventListener('pointercancel',()=>{
  const wasSeeking=Boolean(seekActive);
  start=null;last=null;
  clearHoldTimer();
  resetNub();
  if(wasSeeking) stopSeek(true);
});

const overlay=document.getElementById('overlay');
document.getElementById('other').onclick=()=>{
  const list=document.getElementById('commandList');
  if(!list.childElementCount){
    for(const c of STATE.commands){
      const b=document.createElement('button');
      b.textContent=c.label;
      b.onclick=()=>{bridge('command',{name:c.name});overlay.style.display='none'};
      list.appendChild(b);
    }
  }
  overlay.style.display='flex';
};
document.getElementById('closeSheet').onclick=()=>overlay.style.display='none';
overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.style.display='none'});
document.getElementById('settings').onclick=()=>bridge('settings');
</script>
</body>
</html>`;
}

function parseBridge(url) {
  const m = String(url || '').match(/^yosbravia:\/\/([^?]+)(?:\?(.*))?$/i);
  if (!m) return null;
  const params = {};
  for (const part of String(m[2] || '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const key = decodeURIComponent(i >= 0 ? part.slice(0, i) : part);
    const value = decodeURIComponent(i >= 0 ? part.slice(i + 1) : '');
    params[key] = value;
  }
  return {path:m[1], params};
}

async function updateSelf() {
  const r = new Request(UPDATE_URL);
  const code = await r.loadString();
  if (!code || !code.includes('getRemoteControllerInfo')) throw new Error('更新ファイルを取得できませんでした。');
  for (const fm of [FileManager.local(), FileManager.iCloud()]) {
    const path = fm.joinPath(fm.documentsDirectory(), 'YOS BRAVIA Remote.js');
    fm.writeString(path, code);
  }
  await message('更新完了', '最新版へ更新しました。いったん閉じて開き直してください。');
}

async function clearSaved() {
  const a = new Alert();
  a.title = '保存設定を削除';
  a.message = 'TV host・PSK・クイック候補をこのiPhoneから削除します。';
  a.addDestructiveAction('削除');
  a.addCancelAction('キャンセル');
  if (await a.presentAlert() !== 0) return false;
  for (const k of Object.values(STORAGE)) if (Keychain.contains(k)) Keychain.remove(k);
  host=''; psk='';
  return true;
}

async function settings(web) {
  const a = new Alert();
  a.title = 'BRAVIA設定';
  a.addAction('接続し直す');
  a.addAction('TV / PSKを変更');
  a.addAction('クイック候補を選び直す');
  a.addAction('最新版へ更新');
  a.addDestructiveAction('保存設定を削除');
  a.addCancelAction('キャンセル');
  const i = await a.presentSheet();
  if (i < 0) return;
  if (i === 0) await discoverRemote();
  if (i === 1 && await configureConnection()) await discoverRemote();
  if (i === 2) { if (Keychain.contains(STORAGE.quick)) Keychain.remove(STORAGE.quick); await chooseQuick(false); }
  if (i === 3) { await updateSelf(); return; }
  if (i === 4 && await clearSaved()) { if (await ensureSettings()) await discoverRemote(); }
  await web.loadHTML(buildHTML());
}

async function handleBridge(url, web) {
  const e = parseBridge(url);
  if (!e) return;
  if (e.path === 'action') {
    if (e.params.name === 'quick') await sendQuick();
    else await sendAction(e.params.name);
  } else if (e.path === 'gesture') {
    await sendRepeated(e.params.name, e.params.repeats);
  } else if (e.path === 'seek-start') {
    await sendAction(e.params.name);
  } else if (e.path === 'seek-stop') {
    if (resolveAction('play')) await sendAction('play', true);
  } else if (e.path === 'command') {
    await sendCommand(commandByName(e.params.name));
  } else if (e.path === 'settings') {
    await settings(web);
  }
}

async function presentRemote() {
  const web = new WebView();
  web.shouldAllowRequest = request => {
    const url = request && request.url ? request.url : '';
    if (String(url).startsWith('yosbravia://')) {
      bridgeQueue = bridgeQueue
        .then(() => handleBridge(url, web))
        .catch(async err => { await showError(err); });
      return false;
    }
    return true;
  };
  await web.loadHTML(buildHTML());
  await web.present(true);
}

async function start() {
  if (!await ensureSettings()) return;
  try {
    await discoverRemote();
  } catch (e) {
    const a = new Alert();
    a.title = 'BRAVIAへ接続できません';
    a.message = e && e.message ? e.message : String(e);
    a.addAction('設定を変更');
    a.addAction('再試行');
    a.addCancelAction('終了');
    const i = await a.presentAlert();
    if (i < 0) return;
    if (i === 0 && !await configureConnection()) return;
    try { await discoverRemote(); } catch (e2) { await showError(e2); return; }
  }
  await presentRemote();
}

await start();
Script.complete();
