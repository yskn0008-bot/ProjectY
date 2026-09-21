'use strict';
(()=>{
const KEYS={home:'yos-home-settings-v2',legacy:'yos-home-settings-v1',taxi:'yos-taxi-settings-v2'};
const $=id=>document.getElementById(id);
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
const clean=(value,max=4000)=>typeof value==='string'?value.trim().slice(0,max):'';
const settings=read(KEYS.home,{});
const sharedUrl=()=>clean(settings.yosUrl||read(KEYS.legacy,{}).yosUrl||read(KEYS.taxi,{}).yosUrl,500);
const nativeShell=location.protocol==='capacitor:'||location.protocol==='ionic:';

const HELPERS={
  organize:'今の状況を整理したい。分かっている事実と未確認を分けて、何が起きていて次に何をすればいいか判断して。',
  build:'作る・直す・自動化したい。既存資産を先に確認し、必要な開発経路へRoutingして完成条件まで進めて。',
  'second-view':'別の角度から確認したい。見落としや前提の弱点を確認し、必要なら独立した別視点で反証して。'
};
const SCOUT_RE=/(別視点|別の視点|反証|前提|見落とし|別案|別の角度|疑って|セカンドオピニオン|SCOUT)/i;
const PROJECTY_RE=/(作る|作って|直す|直して|修理|自動化|統合|不具合|開発|shortcut|ショートカット|アプリ|remote|リモコン|実装|壊れ|バグ|修正|完成させ|動かない|開かない|変わらない|反応しない|失敗|エラー|故障|おかしい)/i;

function suggestRoute(text,assist){
  if(assist==='second-view')return'scout';
  if(assist==='build')return'projecty';
  if(assist==='organize')return'yos';
  const value=clean(text);
  if(SCOUT_RE.test(value))return'scout';
  if(PROJECTY_RE.test(value))return'projecty';
  return'yos';
}
function buildEnvelope(text,assist){
  const original=clean(text)||HELPERS[assist]||'今の状況を整理したい。';
  const hint=suggestRoute(original,assist);
  const label={yos:'YOS',projecty:'ProjectY',scout:'SCOUT'}[hint];
  return [
    '【YOS相談・対処ページ】',
    'original_input: '+original,
    'pre_route_hint: '+label,
    '',
    'Routing原則:',
    '・ユーザーにProject名、チャット、機能を選ばせない。',
    '・日常相談／判断／予定／Money／Life／MY WAY／記録／通知などはYOSで扱う。',
    '・作る／直す／自動化／統合／不具合／開発／Shortcut／アプリ／Remote等は、必要ならProjectYへRoutingし、内部でOne Enter／プロト君／Astra／System Healthを使う。',
    '・別視点／前提確認／見落とし／反証／別案比較は、必要ならSCOUTへRoutingする。',
    '・pre_route_hintは画面側の補助推定であり、最終RoutingはYOSが入力内容と現在状態から決める。',
    '・実行していないこと、確認していないことを成功扱いしない。'
  ].join('\n');
}
async function copyText(text){
  try{await navigator.clipboard.writeText(text);return true}catch{}
  try{
    const area=document.createElement('textarea');
    area.value=text;area.style.position='fixed';area.style.opacity='0';
    document.body.appendChild(area);area.select();
    const ok=document.execCommand('copy');area.remove();return ok;
  }catch{return false}
}
function setStatus(text){$('consultStatus').textContent=text}
async function handoff(assist){
  const input=clean($('consultInput').value);
  const original=input||HELPERS[assist]||'';
  if(!original){setStatus('そのまま相談内容を入力してください。');$('consultInput').focus();return}
  const envelope=buildEnvelope(original,assist);
  const copied=await copyText(envelope);
  if(!copied){setStatus('相談内容をコピーできませんでした。入力欄の内容をそのままYOSへ送ってください。');return}
  const url=sharedUrl();
  if(url.startsWith('https://chatgpt.com/')){
    setStatus('YOSへ渡します。行き先はYOSが決めます。');
    location.href=url;
    return;
  }
  $('handoffFallback').hidden=false;
  setStatus('相談内容をコピーしました。YOSチャットURLの登録が必要です。');
  $('handoffFallback').scrollIntoView({behavior:'smooth',block:'nearest'});
}
document.querySelectorAll('[data-native-only]').forEach(node=>{node.hidden=!nativeShell;node.style.display=nativeShell?'':'none'});
document.querySelectorAll('[data-web-only]').forEach(node=>{node.hidden=nativeShell;node.style.display=nativeShell?'none':''});
$('sendConsult').addEventListener('click',()=>handoff(''));
document.querySelectorAll('[data-assist]').forEach(button=>button.addEventListener('click',()=>handoff(button.dataset.assist)));
$('consultInput').addEventListener('keydown',event=>{
  if((event.metaKey||event.ctrlKey)&&event.key==='Enter'){event.preventDefault();handoff('')}
});
window.YOSConsultV1={suggestRoute,buildEnvelope};
if('serviceWorker'in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('../../service-worker.js',{scope:'../../',updateViaCache:'none'}).catch(()=>{}));
})();
