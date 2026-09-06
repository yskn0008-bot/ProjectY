// YOS BRAVIA Remote — Scriptable fallback for Issue #292.
// One-screen WebView UI with inline touchpad. Sony commands are discovered at runtime.

const STORAGE = Object.freeze({
  host: 'yos.bravia.scriptable.host',
  psk: 'yos.bravia.scriptable.psk',
  quick: 'yos.bravia.scriptable.quick-command'
});

const UPDATE_URL = 'https://raw.githubusercontent.com/yskn0008-bot/ProjectY/codex/issue-292-bravia-scriptable/ios-app/scriptable/YOS%20BRAVIA%20Remote.js';

const ACTION_ALIASES = Object.freeze({
  power: ['poweroff', 'power'], input: ['input'], home: ['home'], back: ['return', 'back'],
  up: ['up'], left: ['left'], confirm: ['confirm', 'enter'], right: ['right'], down: ['down'],
  volumeDown: ['volumedown'], mute: ['mute'], volumeUp: ['volumeup'],
  channelDown: ['channeldown'], channelUp: ['channelup'], play: ['play'], pause: ['pause'],
  stop: ['stop'], rewind: ['rewind'], forward: ['forward'], flashMinus: ['flashminus'],
  flashPlus: ['flashplus'], prev: ['prev'], next: ['next']
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

function readSecure(key){ return Keychain.contains(key) ? Keychain.get(key) : ''; }
function normalizeHost(value){
  const v=String(value||'').trim().replace(/^https?:\/\//i,'').replace(/:\d+$/,'');
  if(!v||/[\s/?#]/.test(v)) throw new Error('テレビのIPアドレスまたはホスト名を確認してください。');
  return v;
}
function escapeXml(value){ return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'})[c]); }
function irccEnvelope(code){
  if(!code) throw new Error('未対応のコマンドです。');
  return '<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><u:X_SendIRCC xmlns:u="urn:schemas-sony-com:service:IRCC:1"><IRCCCode>'+escapeXml(code)+'</IRCCCode></u:X_SendIRCC></s:Body></s:Envelope>';
}
async function requestText(url,options){
  const r=new Request(url); r.method=options.method||'GET'; r.headers=options.headers||{}; if(typeof options.body==='string') r.body=options.body;
  const text=await r.loadString(); const status=r.response?r.response.statusCode:0;
  if(status===403) throw new Error('PSK認証に失敗しました。BRAVIA側と設定を確認してください。');
  if(status<200||status>=300) throw new Error('BRAVIA通信に失敗しました（HTTP '+status+'）。');
  return text;
}
async function discoverRemote(){
  host=normalizeHost(host);
  const text=await requestText('http://'+host+'/sony/system',{method:'POST',headers:{'Content-Type':'application/json','X-Auth-PSK':psk},body:JSON.stringify({method:'getRemoteControllerInfo',params:[],id:1,version:'1.0'})});
  let payload; try{payload=JSON.parse(text)}catch(_){throw new Error('テレビの対応コマンド一覧を読み取れませんでした。')}
  const list=payload&&payload.result&&payload.result[1]; if(!Array.isArray(list)) throw new Error('テレビの対応コマンド一覧を読み取れませんでした。');
  remoteMap=new Map(list.filter(x=>x&&typeof x.name==='string'&&typeof x.value==='string').map(x=>[x.name,x.value]));
  remoteIndex=new Map([...remoteMap].map(([name,code])=>[name.toLowerCase(),{name,code}]));
  quickCandidates=[...remoteMap].filter(([name])=>/option|actionmenu|quick|setting/i.test(name)).map(([name,code])=>({name,code}));
}
function resolveAction(action){ for(const alias of ACTION_ALIASES[action]||[]){const c=remoteIndex.get(alias.toLowerCase()); if(c)return c} return null; }
function commandByName(name){ return remoteIndex.get(String(name||'').toLowerCase())||null; }
async function sendCommand(command){
  if(!command||!command.code) throw new Error('このテレビでは未対応です。');
  await requestText('http://'+host+'/sony/ircc',{method:'POST',headers:{'Content-Type':'text/xml; charset=UTF-8','X-Auth-PSK':psk,SOAPACTION:'"urn:schemas-sony-com:service:IRCC:1#X_SendIRCC"'},body:irccEnvelope(command.code)});
}
async function sendAction(action,silent=false){ try{await sendCommand(resolveAction(action)); return true}catch(e){if(!silent)await showError(e); return false} }
async function sendRepeated(action,repeats){ const n=Math.min(6,Math.max(1,Number(repeats)||1)); for(let i=0;i<n;i++){if(!await sendAction(action,i>0))break} }
async function showError(error){ const a=new Alert(); a.title='BRAVIA'; a.message=error&&error.message?error.message:String(error); a.addAction('OK'); await a.presentAlert(); }
async function message(title,text){ const a=new Alert(); a.title=title; a.message=text; a.addAction('OK'); await a.presentAlert(); }
async function configureConnection(){
  const a=new Alert(); a.title='BRAVIA設定'; a.message='テレビのIP/ホスト名とPSKを保存します。PSKはScriptableのKeychainへ保存されます。';
  a.addTextField('テレビのIPまたはホスト名',host||''); a.addSecureTextField(psk?'PSK（変更しないなら空欄）':'PSK',''); a.addAction('保存して接続'); a.addCancelAction('キャンセル');
  if(await a.presentAlert()<0)return false; const nextHost=normalizeHost(a.textFieldValue(0)); const entered=a.textFieldValue(1).trim(); const nextPsk=entered||psk; if(!nextPsk)throw new Error('PSKを入力してください。');
  host=nextHost; psk=nextPsk; Keychain.set(STORAGE.host,host); Keychain.set(STORAGE.psk,psk); return true;
}
async function ensureSettings(){ if(host&&psk)return true; try{return await configureConnection()}catch(e){await showError(e);return false} }
function japaneseLabel(name){ return LABELS[String(name||'').toLowerCase()]||name; }
function storedQuick(){ return Keychain.contains(STORAGE.quick)?commandByName(Keychain.get(STORAGE.quick)):null; }
async function chooseQuick(sendAfter){
  if(!quickCandidates.length)throw new Error('このテレビからクイック設定候補が返りませんでした。');
  const a=new Alert(); a.title='クイック設定候補'; a.message='物理リモコンのクイック設定と同じ画面を開く候補を選んでください。';
  for(const c of quickCandidates){const l=japaneseLabel(c.name);a.addAction(l===c.name?c.name:l+'｜'+c.name)} a.addCancelAction('キャンセル'); const i=await a.presentSheet(); if(i<0)return null;
  const c=quickCandidates[i]; Keychain.set(STORAGE.quick,c.name); if(sendAfter)await sendCommand(c); return c;
}
async function sendQuick(){ const c=storedQuick(); if(c)return sendCommand(c); return chooseQuick(true); }
function support(){ const o={}; for(const a of Object.keys(ACTION_ALIASES))o[a]=Boolean(resolveAction(a)); o.quick=quickCandidates.length>0; return o; }
function commands(){ return [...remoteMap].map(([name])=>({name,label:japaneseLabel(name)})).sort((a,b)=>a.label.localeCompare(b.label,'ja')); }
function htmlEscape(v){ return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

function buildHTML(){
  const state={host,count:remoteMap.size,support:support(),commands:commands()}; const json=JSON.stringify(state).replace(/</g,'\\u003c');
  const btn=(label,action,cls='')=>'<button class="'+cls+'" data-action="'+action+'">'+label+'</button>';
  return `<!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no"><style>
  :root{color-scheme:dark}*{box-sizing:border-box;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}body{margin:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",sans-serif}main{padding:18px 18px 38px;max-width:760px;margin:0 auto}h1{font-size:28px;margin:2px 0 3px}.meta{font-size:13px;color:#aaa;margin-bottom:14px}.section{font-size:14px;font-weight:700;margin:18px 0 8px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.grid.two{grid-template-columns:repeat(2,1fr)}button{border:0;border-radius:14px;background:#171717;color:#0a84ff;font-size:17px;min-height:48px;padding:10px 8px}button:active{background:#282828;transform:scale(.98)}button[disabled]{color:#555;background:#0d0d0d}.icon{font-size:24px;font-weight:600}.pad{height:245px;border-radius:28px;border:1px solid #333;background:linear-gradient(145deg,#171717,#080808);touch-action:none;position:relative;overflow:hidden}.hint{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;color:#5f5f65;font-size:15px;line-height:1.7;pointer-events:none}.nub{width:62px;height:62px;border-radius:50%;border:1px solid #333;background:#111;position:absolute;left:50%;top:50%;margin:-31px;z-index:2;pointer-events:none}.status{height:20px;text-align:center;color:#8e8e93;font-size:12px;margin-top:7px}.footer{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:18px}.overlay{position:fixed;inset:0;background:rgba(0,0,0,.72);display:none;align-items:flex-end;z-index:10}.sheet{background:#151515;border-radius:22px 22px 0 0;max-height:78vh;width:100%;padding:14px 14px 26px;overflow:auto}.sheetHead{display:flex;justify-content:space-between;align-items:center;position:sticky;top:-14px;background:#151515;padding:10px 0;z-index:2}.sheetHead h2{margin:0;font-size:20px}.close{background:#2b2b2b;color:#fff;min-height:38px;font-size:14px;padding:6px 14px}.commandList{display:grid;grid-template-columns:1fr 1fr;gap:8px}.commandList button{font-size:14px;min-height:44px}
  </style></head><body><main><h1>BRAVIA</h1><div class="meta">接続済み · ${state.count}コマンド · ${htmlEscape(host)}</div>
  <div class="grid">${btn('⏻ 電源','power')}${btn('入力','input')}${btn('クイック','quick')}</div><div class="grid two" style="margin-top:8px">${btn('戻る','back')}${btn('ホーム','home')}</div>
  <div class="section">タッチパッド</div><div id="pad" class="pad"><div id="nub" class="nub"></div><div class="hint">スワイプで移動<br>タップでOK</div></div><div id="status" class="status">スワイプ＝移動 · タップ＝OK</div>
  <div class="section">音量・チャンネル</div><div class="grid">${btn('音量−','volumeDown')}${btn('ミュート','mute')}${btn('音量＋','volumeUp')}</div><div class="grid two" style="margin-top:8px">${btn('CH−','channelDown')}${btn('CH＋','channelUp')}</div>
  <div class="section">再生</div><div class="grid">${btn('◀◀','rewind','icon')}${btn('▶','play','icon')}${btn('▶▶','forward','icon')}</div><div class="grid" style="margin-top:8px">${btn('↶10','flashMinus','icon')}${btn('Ⅱ','pause','icon')}${btn('15↷','flashPlus','icon')}</div><div class="grid" style="margin-top:8px">${btn('|◀','prev','icon')}${btn('■','stop','icon')}${btn('▶|','next','icon')}</div>
  <div class="footer"><button onclick="openCommands()">その他</button><button onclick="emit({type:'settings'})">設定</button></div></main>
  <div id="overlay" class="overlay" onclick="if(event.target===this)closeCommands()"><div class="sheet"><div class="sheetHead"><h2>その他のボタン</h2><button class="close" onclick="closeCommands()">閉じる</button></div><div id="commandList" class="commandList"></div></div></div>
  <script>const STATE=${json};window.__yosQueue=[];window.__yosResolve=null;function emit(e){if(window.__yosResolve){const r=window.__yosResolve;window.__yosResolve=null;r(e)}else window.__yosQueue.push(e)}function setStatus(t){document.getElementById('status').textContent=t||''}
  document.querySelectorAll('[data-action]').forEach(b=>{const a=b.dataset.action;if(!STATE.support[a])b.disabled=true;b.addEventListener('click',()=>emit({type:'action',action:a}))});
  const pad=document.getElementById('pad'),nub=document.getElementById('nub');let start=null,last=null;function reset(){nub.style.transform='translate(0px,0px)'}pad.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};last=start;pad.setPointerCapture(e.pointerId)});pad.addEventListener('pointermove',e=>{if(!start)return;last={x:e.clientX,y:e.clientY};const dx=Math.max(-70,Math.min(70,last.x-start.x)),dy=Math.max(-70,Math.min(70,last.y-start.y));nub.style.transform='translate('+dx+'px,'+dy+'px)'});pad.addEventListener('pointerup',e=>{if(!start)return;const end=last||{x:e.clientX,y:e.clientY},dx=end.x-start.x,dy=end.y-start.y,d=Math.hypot(dx,dy);start=null;last=null;reset();if(d<14){setStatus('OK');emit({type:'gesture',action:'confirm',repeats:1});return}let a;if(Math.abs(dx)>Math.abs(dy))a=dx>0?'right':'left';else a=dy>0?'down':'up';const n=Math.min(6,Math.max(1,Math.round(d/52)));setStatus((a==='left'?'←':a==='right'?'→':a==='up'?'↑':'↓')+' × '+n);emit({type:'gesture',action:a,repeats:n})});pad.addEventListener('pointercancel',()=>{start=null;last=null;reset()});
  function openCommands(){const list=document.getElementById('commandList');if(!list.childElementCount){for(const c of STATE.commands){const b=document.createElement('button');b.textContent=c.label;b.onclick=()=>{emit({type:'command',name:c.name});closeCommands()};list.appendChild(b)}}document.getElementById('overlay').style.display='flex'}function closeCommands(){document.getElementById('overlay').style.display='none'}<\/script></body></html>`;
}

async function setWebStatus(web,text){ try{await web.evaluateJavaScript('setStatus('+JSON.stringify(text)+');',false)}catch(_){} }
async function updateSelf(){ const r=new Request(UPDATE_URL); const code=await r.loadString(); if(!code||!code.includes('getRemoteControllerInfo'))throw new Error('更新ファイルを取得できませんでした。'); const fm=FileManager.iCloud(); fm.writeString(fm.joinPath(fm.documentsDirectory(),Script.name()+'.js'),code); await message('更新完了','最新版へ更新しました。いったん閉じて開き直してください。'); }
async function clearSaved(){ const a=new Alert();a.title='保存設定を削除';a.message='TV host・PSK・クイック候補をこのiPhoneから削除します。';a.addDestructiveAction('削除');a.addCancelAction('キャンセル');if(await a.presentAlert()!==0)return false;for(const k of Object.values(STORAGE))if(Keychain.contains(k))Keychain.remove(k);host='';psk='';return true; }
async function settings(){ const a=new Alert();a.title='BRAVIA設定';a.addAction('接続し直す');a.addAction('TV / PSKを変更');a.addAction('クイック候補を選び直す');a.addAction('最新版へ更新');a.addDestructiveAction('保存設定を削除');a.addCancelAction('キャンセル');const i=await a.presentSheet();if(i<0)return false;if(i===0){await discoverRemote();return true}if(i===1){if(await configureConnection()){await discoverRemote();return true}}if(i===2){if(Keychain.contains(STORAGE.quick))Keychain.remove(STORAGE.quick);await chooseQuick(false)}if(i===3)await updateSelf();if(i===4&&await clearSaved()){if(await ensureSettings()){await discoverRemote();return true}}return false; }
async function handle(event,web){ if(!event||!event.type)return false;if(event.type==='action'){try{if(event.action==='quick')await sendQuick();else await sendAction(event.action);await setWebStatus(web,'操作しました')}catch(e){await showError(e)}}else if(event.type==='gesture')await sendRepeated(event.action,event.repeats);else if(event.type==='command'){try{await sendCommand(commandByName(event.name))}catch(e){await showError(e)}}else if(event.type==='settings'){try{return await settings()}catch(e){await showError(e)}}return false; }
async function presentRemote(){ const web=new WebView();await web.loadHTML(buildHTML());let closed=false;const presentation=web.present(true).then(()=>{closed=true}).catch(()=>{closed=true});while(!closed){try{const raw=await web.evaluateJavaScript(`(()=>{if(window.__yosQueue&&window.__yosQueue.length){completion(JSON.stringify(window.__yosQueue.shift()));return}window.__yosResolve=e=>{window.__yosResolve=null;completion(JSON.stringify(e))}})();`,true);if(!raw)continue;const reload=await handle(JSON.parse(raw),web);if(reload)await web.loadHTML(buildHTML())}catch(e){if(!closed)console.log('BRAVIA bridge ended: '+String(e));break}}await presentation; }
async function start(){ if(!await ensureSettings())return;try{await discoverRemote()}catch(e){const a=new Alert();a.title='BRAVIAへ接続できません';a.message=e&&e.message?e.message:String(e);a.addAction('設定を変更');a.addAction('再試行');a.addCancelAction('終了');const i=await a.presentAlert();if(i<0)return;if(i===0&&!await configureConnection())return;try{await discoverRemote()}catch(e2){await showError(e2);return}}await presentRemote(); }
await start();Script.complete();
