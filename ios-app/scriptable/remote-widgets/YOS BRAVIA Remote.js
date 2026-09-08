// YOS BRAVIA Remote — one-screen configurable large-touch UI for MY REMOTE.
// Sony commands are discovered at runtime. Host/PSK stay in Scriptable Keychain.

const STORAGE=Object.freeze({
  host:'yos.bravia.scriptable.host',
  psk:'yos.bravia.scriptable.psk',
  quick:'yos.bravia.scriptable.quick-command',
  layout:'yos.bravia.scriptable.layout-v1'
});

const ACTIONS=Object.freeze({
  power:['poweroff','power'],input:['input'],home:['home'],back:['return','back'],
  up:['up'],left:['left'],confirm:['confirm','enter'],right:['right'],down:['down'],
  volumeDown:['volumedown'],mute:['mute'],volumeUp:['volumeup'],channelDown:['channeldown'],channelUp:['channelup'],
  rewind:['rewind'],play:['play'],forward:['forward'],flashMinus:['flashminus'],pause:['pause'],flashPlus:['flashplus'],
  prev:['prev'],stop:['stop'],next:['next']
});

const LABELS=Object.freeze({
  power:'電源',poweroff:'電源OFF',input:'入力',home:'ホーム',return:'戻る',back:'戻る',up:'上',down:'下',left:'左',right:'右',
  confirm:'OK',enter:'OK',volumedown:'音量−',volumeup:'音量＋',mute:'ミュート',channeldown:'CH−',channelup:'CH＋',
  play:'再生',pause:'一時停止',stop:'停止',rewind:'巻戻し',forward:'早送り',flashminus:'10秒戻し',flashplus:'15秒送り',prev:'前',next:'次',
  options:'オプション',actionmenu:'アクションメニュー',quick:'クイック設定',settings:'設定',syncmenu:'BRAVIA Sync',display:'画面表示',
  caption:'字幕',epg:'番組表',red:'赤',blue:'青',yellow:'黄',green:'緑',hdmi1:'HDMI1',hdmi2:'HDMI2',hdmi3:'HDMI3',hdmi4:'HDMI4'
});

const DEFAULT_LAYOUT=Object.freeze([
  'power','input','quick','back','home',
  'volumeDown','mute','volumeUp','channelDown',
  'channelUp','rewind','play','forward',
  'flashMinus','pause','flashPlus','prev',
  'stop','next','other','settings'
]);

const UI_ITEMS=Object.freeze({
  power:{label:'⏻ 電源',kind:'action',action:'power',cls:'power'},
  input:{label:'入力',kind:'action',action:'input'},
  quick:{label:'クイック',kind:'quick'},
  back:{label:'戻る',kind:'action',action:'back'},
  home:{label:'ホーム',kind:'action',action:'home'},
  volumeDown:{label:'音量−',kind:'action',action:'volumeDown'},
  mute:{label:'ミュート',kind:'action',action:'mute'},
  volumeUp:{label:'音量＋',kind:'action',action:'volumeUp'},
  channelDown:{label:'CH−',kind:'action',action:'channelDown'},
  channelUp:{label:'CH＋',kind:'action',action:'channelUp'},
  rewind:{label:'◀◀',kind:'action',action:'rewind'},
  play:{label:'▶',kind:'action',action:'play'},
  forward:{label:'▶▶',kind:'action',action:'forward'},
  flashMinus:{label:'↶10',kind:'action',action:'flashMinus'},
  pause:{label:'Ⅱ',kind:'action',action:'pause'},
  flashPlus:{label:'15↷',kind:'action',action:'flashPlus'},
  prev:{label:'|◀',kind:'action',action:'prev'},
  stop:{label:'■',kind:'action',action:'stop'},
  next:{label:'▶|',kind:'action',action:'next'},
  other:{label:'その他',kind:'other'},
  settings:{label:'設定',kind:'settings'}
});

function secure(key){return Keychain.contains(key)?Keychain.get(key):''}
let host=secure(STORAGE.host),psk=secure(STORAGE.psk),remoteMap=new Map(),remoteIndex=new Map(),quickCandidates=[];

function normalizeHost(v){const x=String(v||'').trim().replace(/^https?:\/\//i,'').replace(/:\d+$/,'');if(!x||/[\s/?#]/.test(x))throw new Error('テレビのIPアドレスまたはホスト名を確認してください。');return x}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c])}
function env(code){return '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+esc(code)+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>'}
async function request(url,opt){const r=new Request(url);r.method=opt.method||'GET';r.headers=opt.headers||{};if(opt.body)r.body=opt.body;const text=await r.loadString();const s=r.response?r.response.statusCode:0;if(s===403)throw new Error('PSK認証に失敗しました。');if(s<200||s>=300)throw new Error('BRAVIA HTTP '+s);return text}
async function discover(){host=normalizeHost(host);const text=await request('http://'+host+'/sony/system',{method:'POST',headers:{'Content-Type':'application/json','X-Auth-PSK':psk},body:JSON.stringify({method:'getRemoteControllerInfo',params:[],id:1,version:'1.0'})});const p=JSON.parse(text),list=p&&p.result&&p.result[1];if(!Array.isArray(list))throw new Error('BRAVIAコマンド取得失敗');remoteMap=new Map(list.filter(x=>x&&x.name&&x.value).map(x=>[String(x.name),String(x.value)]));remoteIndex=new Map([...remoteMap].map(([n,c])=>[n.toLowerCase(),{name:n,code:c}]));quickCandidates=[...remoteMap].filter(([n])=>/option|actionmenu|quick|setting/i.test(n)).map(([name,code])=>({name,code}))}
function resolve(action){for(const a of ACTIONS[action]||[]){const c=remoteIndex.get(a.toLowerCase());if(c)return c}return null}
async function sendCommand(c){if(!c||!c.code)throw new Error('このテレビでは未対応です。');await request('http://'+host+'/sony/ircc',{method:'POST',headers:{'Content-Type':'text/xml; charset=UTF-8','X-Auth-PSK':psk,SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'},body:env(c.code)})}
async function sendAction(action){return sendCommand(resolve(action))}
function label(name){return LABELS[String(name||'').toLowerCase()]||name}

async function configure(){const a=new Alert();a.title='BRAVIA接続設定';a.addTextField('テレビのIPまたはホスト名',host||'');a.addSecureTextField(psk?'PSK（変更しないなら空欄）':'PSK','');a.addAction('保存');a.addCancelAction('キャンセル');if(await a.presentAlert()<0)return false;const h=normalizeHost(a.textFieldValue(0));const entered=a.textFieldValue(1).trim();const nextPsk=entered||psk;if(!nextPsk)throw new Error('PSKを入力してください。');host=h;psk=nextPsk;Keychain.set(STORAGE.host,host);Keychain.set(STORAGE.psk,psk);return true}
async function ensure(){if(host&&psk)return true;return configure()}
async function chooseQuick(){if(!quickCandidates.length)throw new Error('クイック設定候補がありません。');const a=new Alert();a.title='クイック設定';for(const c of quickCandidates)a.addAction(label(c.name)+'｜'+c.name);a.addCancelAction('キャンセル');const i=await a.presentSheet();if(i<0)return;const c=quickCandidates[i];Keychain.set(STORAGE.quick,c.name);await sendCommand(c)}
async function sendQuick(){if(Keychain.contains(STORAGE.quick)){const n=Keychain.get(STORAGE.quick);const c=remoteIndex.get(String(n).toLowerCase());if(c)return sendCommand(c)}return chooseQuick()}
async function error(e){const a=new Alert();a.title='BRAVIA';a.message=e&&e.message?e.message:String(e);a.addAction('OK');await a.presentAlert()}

function validLayout(value){if(!Array.isArray(value)||value.length!==DEFAULT_LAYOUT.length)return false;const ids=[...value];return new Set(ids).size===DEFAULT_LAYOUT.length&&DEFAULT_LAYOUT.every(id=>ids.includes(id))&&ids.every(id=>UI_ITEMS[id])}
function loadLayout(){try{if(Keychain.contains(STORAGE.layout)){const v=JSON.parse(Keychain.get(STORAGE.layout));if(validLayout(v))return v}}catch(_){}return [...DEFAULT_LAYOUT]}
function saveLayout(value){if(!validLayout(value))throw new Error('ボタン配置データが不正です。');Keychain.set(STORAGE.layout,JSON.stringify(value))}

if(!await ensure()){Script.complete();return}
try{await discover()}catch(e){await error(e);Script.complete();return}

function support(a){return Boolean(resolve(a))}
const state={host,count:remoteMap.size,support:Object.fromEntries(Object.keys(ACTIONS).map(a=>[a,support(a)])),commands:[...remoteMap.keys()].map(n=>({name:n,label:label(n)})).sort((a,b)=>a.label.localeCompare(b.label,'ja')),layout:loadLayout(),defaultLayout:[...DEFAULT_LAYOUT],items:UI_ITEMS};
const json=JSON.stringify(state).replace(/</g,'\\u003c');

const html=`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><style>
:root{color-scheme:dark}*{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}body{overscroll-behavior:none}
main{height:100dvh;max-height:100dvh;padding:5px 8px 6px;display:flex;flex-direction:column;gap:4px;overflow:hidden}.head{height:25px;flex:0 0 25px;display:flex;align-items:flex-end;justify-content:space-between}h1{margin:0;font-size:21px;line-height:1}.meta{font-size:9px;color:#8e8e93;white-space:nowrap}.top{height:44px;flex:0 0 44px;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:4px}.pad{height:clamp(72px,13dvh,104px);flex:0 0 clamp(72px,13dvh,104px);border-radius:18px;border:1px solid #343434;background:#111;position:relative;touch-action:none;overflow:hidden}.nub{width:42px;height:42px;border-radius:50%;border:1px solid #74b9ff;background:#38577d;position:absolute;left:50%;top:50%;margin:-21px;pointer-events:none;transition:transform .05s linear}.hint{position:absolute;left:0;right:0;bottom:5px;text-align:center;color:#5d5d62;font-size:8.5px;pointer-events:none}.seekStatus{position:absolute;left:0;right:0;top:5px;text-align:center;color:#ffcc66;font-size:10.5px;font-weight:800;pointer-events:none;min-height:13px}.grid{flex:1;min-height:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));grid-template-rows:repeat(4,minmax(0,1fr));gap:4px}button{min-width:0;min-height:0;border:0;border-radius:12px;background:#171717;color:#0a84ff;font-size:13px;font-weight:750;padding:2px;touch-action:manipulation}button:active{background:#2a2a2a;transform:scale(.985)}button.power{color:#ff453a}button:disabled{opacity:.25}.overlay{position:fixed;inset:0;background:rgba(0,0,0,.76);display:none;align-items:flex-end;z-index:20}.sheet{width:100%;max-height:84dvh;background:#151515;border-radius:22px 22px 0 0;padding:12px 12px 22px;overflow:auto}.sheetHead{display:flex;align-items:center;justify-content:space-between;position:sticky;top:-12px;background:#151515;padding:8px 0;z-index:2}.sheetHead h2{margin:0;font-size:19px}.close{height:38px;padding:0 14px;color:#fff;background:#2b2b2b}.commandList{display:grid;grid-template-columns:1fr 1fr;gap:7px}.commandList button{height:44px;font-size:13px}.settingsText{color:#8e8e93;font-size:11px;line-height:1.45;margin:2px 0 10px}.settingsTitle{font-size:12px;font-weight:800;margin:10px 0 6px;color:#d1d1d6}.editTop{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:5px}.editGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:5px}.editTop button,.editGrid button{height:42px;font-size:11px}.editTop button.selected,.editGrid button.selected{outline:2px solid #0a84ff;background:#26374a}.settingsActions{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.settingsActions button{height:44px;font-size:13px}.primary{background:#0a84ff!important;color:#fff!important}.danger{color:#ff9f0a!important}@media(max-height:720px){main{padding:4px 7px 5px;gap:3px}.head{height:22px;flex-basis:22px}h1{font-size:19px}.meta{font-size:8px}.top{height:39px;flex-basis:39px;gap:3px}.pad{height:64px;flex-basis:64px;border-radius:15px}.nub{width:36px;height:36px;margin:-18px}.grid{gap:3px}button{font-size:11.5px;border-radius:10px}.hint{font-size:7.5px;bottom:3px}.seekStatus{top:3px;font-size:9px}}
</style></head><body><main><div class="head"><h1>BRAVIA</h1><div class="meta">接続済み · ${state.count}</div></div><div id="top" class="top"></div><div id="pad" class="pad"><div id="seekStatus" class="seekStatus"></div><div id="nub" class="nub"></div><div class="hint">スワイプ＝移動　横へ長押し＝早送り / 巻戻し</div></div><div id="grid" class="grid"></div></main>
<div id="otherOverlay" class="overlay"><div class="sheet"><div class="sheetHead"><h2>その他のボタン</h2><button id="closeOther" class="close">閉じる</button></div><div id="commands" class="commandList"></div></div></div>
<div id="settingsOverlay" class="overlay"><div class="sheet"><div class="sheetHead"><h2>設定</h2><button id="closeSettings" class="close">閉じる</button></div><div class="settingsText">ボタン配置：入れ替えたい2つを順番にタップ。先頭5個が上段、残り16個が4×4のメイン領域です。</div><div class="settingsTitle">上段 5ボタン</div><div id="editTop" class="editTop"></div><div class="settingsTitle">メイン 16ボタン</div><div id="editGrid" class="editGrid"></div><div class="settingsActions"><button id="resetLayout" class="danger">標準に戻す</button><button id="saveLayout" class="primary">配置を保存</button><button id="connectionSettings">接続設定</button><button id="cancelLayout">変更を破棄</button></div></div></div>
<script>
const STATE=${json};let layout=[...STATE.layout],workingLayout=[...layout],selectedIndex=null;
function bridge(path,params={}){const q=Object.entries(params).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');location.href='yosbravia://'+path+(q?'?'+q:'?')+(q?'&':'')+'_='+Date.now()}
function itemButton(id,editorIndex=null){const spec=STATE.items[id],b=document.createElement('button');b.textContent=spec.label;if(spec.cls)b.classList.add(spec.cls);if(editorIndex!==null){if(selectedIndex===editorIndex)b.classList.add('selected');b.addEventListener('click',()=>selectEditor(editorIndex));return b}if(spec.kind==='action'){if(!STATE.support[spec.action])b.disabled=true;b.addEventListener('click',()=>bridge('action',{name:spec.action}))}else if(spec.kind==='quick')b.addEventListener('click',()=>bridge('quick'));else if(spec.kind==='other')b.addEventListener('click',()=>document.getElementById('otherOverlay').style.display='flex');else if(spec.kind==='settings')b.addEventListener('click',openSettings);return b}
function renderMain(){const top=document.getElementById('top'),grid=document.getElementById('grid');top.innerHTML='';grid.innerHTML='';layout.slice(0,5).forEach(id=>top.appendChild(itemButton(id)));layout.slice(5).forEach(id=>grid.appendChild(itemButton(id)))}
function openSettings(){workingLayout=[...layout];selectedIndex=null;renderEditor();document.getElementById('settingsOverlay').style.display='flex'}
function renderEditor(){const top=document.getElementById('editTop'),grid=document.getElementById('editGrid');top.innerHTML='';grid.innerHTML='';workingLayout.slice(0,5).forEach((id,i)=>top.appendChild(itemButton(id,i)));workingLayout.slice(5).forEach((id,i)=>grid.appendChild(itemButton(id,i+5)))}
function selectEditor(index){if(selectedIndex===null){selectedIndex=index;renderEditor();return}if(selectedIndex===index){selectedIndex=null;renderEditor();return}const tmp=workingLayout[selectedIndex];workingLayout[selectedIndex]=workingLayout[index];workingLayout[index]=tmp;selectedIndex=null;renderEditor()}
document.getElementById('saveLayout').addEventListener('click',()=>{layout=[...workingLayout];renderMain();bridge('save-layout',{value:JSON.stringify(layout)});document.getElementById('settingsOverlay').style.display='none'});document.getElementById('resetLayout').addEventListener('click',()=>{workingLayout=[...STATE.defaultLayout];selectedIndex=null;renderEditor()});document.getElementById('cancelLayout').addEventListener('click',()=>document.getElementById('settingsOverlay').style.display='none');document.getElementById('closeSettings').addEventListener('click',()=>document.getElementById('settingsOverlay').style.display='none');document.getElementById('connectionSettings').addEventListener('click',()=>bridge('connection-settings'));
const otherOverlay=document.getElementById('otherOverlay'),commands=document.getElementById('commands');document.getElementById('closeOther').addEventListener('click',()=>otherOverlay.style.display='none');STATE.commands.forEach(c=>{const b=document.createElement('button');b.textContent=c.label;b.addEventListener('click',()=>{otherOverlay.style.display='none';bridge('command',{name:c.name})});commands.appendChild(b)});renderMain();
const pad=document.getElementById('pad'),nub=document.getElementById('nub'),seekStatus=document.getElementById('seekStatus');let start=null,last=null,pid=null,seekDir=null,seekStage=0,seekTimers=[];
function clearSeekTimers(){seekTimers.forEach(t=>clearTimeout(t));seekTimers=[]}function resetNub(){nub.style.transform='translate(0px,0px)'}function resetGesture(){clearSeekTimers();start=null;last=null;pid=null;seekDir=null;seekStage=0;resetNub();seekStatus.textContent=''}function cancelSeekArm(){clearSeekTimers();seekDir=null;if(seekStage===0)seekStatus.textContent=''}function seekLabel(dir,stage){return (dir==='forward'?'▶▶ 早送り':'◀◀ 巻戻し')+' ×'+stage}
function armSeek(dir){if(!start||!STATE.support[dir])return;if(seekDir===dir&&seekTimers.length)return;clearSeekTimers();seekDir=dir;const elapsed=Date.now()-start.t;[{ms:450,stage:2},{ms:1450,stage:3},{ms:2650,stage:4}].forEach(step=>{const delay=Math.max(0,step.ms-elapsed);const timer=setTimeout(()=>{if(!start||seekDir!==dir)return;seekStage=step.stage;seekStatus.textContent=seekLabel(dir,step.stage);bridge('seek-step',{name:dir,stage:step.stage})},delay);seekTimers.push(timer)})}
function updateGesture(x,y){if(!start)return;last={x,y};const dx=Math.max(-55,Math.min(55,x-start.x)),dy=Math.max(-34,Math.min(34,y-start.y));nub.style.transform='translate('+dx+'px,'+dy+'px)';const rawDx=x-start.x,rawDy=y-start.y,ax=Math.abs(rawDx),ay=Math.abs(rawDy);if(ax>58&&ax>ay*1.15)armSeek(rawDx>0?'forward':'rewind');else if(ay>ax||ax<45){if(seekStage===0)cancelSeekArm()}}
pad.addEventListener('pointerdown',e=>{e.preventDefault();start={x:e.clientX,y:e.clientY,t:Date.now()};last={x:e.clientX,y:e.clientY};pid=e.pointerId;seekDir=null;seekStage=0;clearSeekTimers();seekStatus.textContent='';try{pad.setPointerCapture(pid)}catch(_){}});pad.addEventListener('pointermove',e=>{if(!start)return;e.preventDefault();updateGesture(e.clientX,e.clientY)});
function endGesture(e){if(!start)return;e.preventDefault();const p=last||{x:e.clientX,y:e.clientY},dx=p.x-start.x,dy=p.y-start.y,ax=Math.abs(dx),ay=Math.abs(dy);clearSeekTimers();if(seekStage>0){if(STATE.support.play)bridge('action',{name:'play'});resetGesture();return}if(ax<22&&ay<22)bridge('action',{name:'confirm'});else if(ax>ay)bridge('action',{name:dx>0?'right':'left'});else bridge('action',{name:dy>0?'down':'up'});resetGesture()}
pad.addEventListener('pointerup',endGesture);pad.addEventListener('pointercancel',()=>{if(seekStage>0&&STATE.support.play)bridge('action',{name:'play'});resetGesture()});window.addEventListener('blur',()=>{if(start&&seekStage>0&&STATE.support.play)bridge('action',{name:'play'});resetGesture()});
</script></body></html>`;

function parse(url){const m=String(url||'').match(/^yosbravia:\/\/([^?]+)(?:\?(.*))?$/i);if(!m)return null;const params={};for(const p of String(m[2]||'').split('&')){if(!p)continue;const i=p.indexOf('=');params[decodeURIComponent(i>=0?p.slice(0,i):p)]=decodeURIComponent(i>=0?p.slice(i+1):'')}return{path:m[1],params}}
let queue=Promise.resolve();function enqueue(fn){queue=queue.then(fn).catch(error)}
const web=new WebView();web.shouldAllowRequest=req=>{const url=req&&req.url?req.url:'';if(String(url).startsWith('yosbravia://')){const e=parse(url);if(e){if(e.path==='action')enqueue(()=>sendAction(e.params.name));else if(e.path==='seek-step')enqueue(()=>sendAction(e.params.name));else if(e.path==='quick')enqueue(()=>sendQuick());else if(e.path==='command')enqueue(()=>sendCommand(remoteIndex.get(String(e.params.name||'').toLowerCase())));else if(e.path==='save-layout')enqueue(async()=>{const value=JSON.parse(String(e.params.value||'[]'));saveLayout(value)});else if(e.path==='connection-settings')enqueue(async()=>{if(await configure()){await discover();const a=new Alert();a.title='BRAVIA';a.message='接続設定を保存しました。次回起動から反映します。';a.addAction('OK');await a.presentAlert()}})}return false}return true};await web.loadHTML(html);await web.present(true);await queue;Script.complete();