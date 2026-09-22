import {selectAlerts} from './alerts/alert-engine.mjs';

const clean=(value,max=240)=>String(value??'').trim().slice(0,max);
const safeAmount=value=>value===null||value===undefined||value===''?null:(Number.isFinite(Number(value))?Number(value):null);

function decodeBase64Url(value){
  const normalized=String(value||'').replace(/-/g,'+').replace(/_/g,'/');
  const padded=normalized+'==='.slice((normalized.length+3)%4);
  const binary=atob(padded);
  const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function encodeBase64Url(value){
  const bytes=new TextEncoder().encode(typeof value==='string'?value:JSON.stringify(value));
  let binary=''; for(const byte of bytes)binary+=String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function normalizeEvent(event={}){
  return {
    ...event,
    id:clean(event.id||event.sourceId,160),
    sourceId:clean(event.sourceId||event.id,160),
    kind:clean(event.kind,40),
    title:clean(event.title,160),
    body:clean(event.body||event.message,600),
    dueAt:clean(event.dueAt||event.date,40),
    amount:safeAmount(event.amount),
    requiresImmediateAwareness:event.requiresImmediateAwareness===true,
    requiresImmediateAction:event.requiresImmediateAction===true,
    delayCausesMaterialHarm:event.delayCausesMaterialHarm===true
  };
}
export function buildEmergencyPayload(events,{notifiedKeys=[]}={}){
  const normalized=(Array.isArray(events)?events:[events]).filter(Boolean).map(normalizeEvent);
  const selected=selectAlerts(normalized,{notifiedKeys}).filter(item=>item.channel==='emergency');
  return {
    schema:'yos-emergency-alert-bridge-v1',
    source:'yos-alert-engine',
    generated_at:new Date().toISOString(),
    alerts:selected.map(item=>({
      id:clean(item.sourceId||item.id,160),
      title:clean(item.title||'緊急確認',160),
      body:clean(item.body,600),
      due_at:clean(item.dueAt,40),
      amount:safeAmount(item.amount)
    }))
  };
}
function parseJsonParam(params,name,fallback){
  const raw=params.get(name);
  if(!raw)return fallback;
  try{return JSON.parse(decodeBase64Url(raw))}catch{return fallback}
}
function testEvents(){
  return [{
    id:'emergency-e2e-test',
    kind:'test',
    title:'Emergency Alert 実機テスト',
    body:'これは接続確認用です。実際の緊急事態ではありません。',
    requiresImmediateAwareness:true,
    requiresImmediateAction:true,
    delayCausesMaterialHarm:true
  }];
}
function returnToShortcut(payload,params){
  if(!payload.alerts.length)return false;
  const name=clean(params.get('shortcut'),120)||'Emergency Alert';
  const text='YOS_EMERGENCY_ALERT_V1:'+encodeBase64Url(payload);
  location.replace('shortcuts://run-shortcut?name='+encodeURIComponent(name)+'&input=text&text='+encodeURIComponent(text));
  return true;
}
if(typeof window!=='undefined'&&typeof location!=='undefined'){
  const params=new URLSearchParams(location.search);
  const events=params.get('test')==='1'?testEvents():parseJsonParam(params,'events',[]);
  const notifiedKeys=parseJsonParam(params,'notified',[]);
  const payload=buildEmergencyPayload(events,{notifiedKeys:Array.isArray(notifiedKeys)?notifiedKeys:[]});
  window.__yosEmergencyAlertBridgeV1=Object.freeze({buildEmergencyPayload,encodeBase64Url,decodeBase64Url});
  if(params.get('return')==='shortcut'){
    const sent=returnToShortcut(payload,params);
    const status=document.getElementById('emergencyAlertBridgeStatus');
    if(status&&!sent)status.textContent='緊急通知なし';
  }
}
