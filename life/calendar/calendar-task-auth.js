/* YOS Calendar private-Notion device pairing. Never send a Notion secret to the browser.
 * Auth contract: POST /api/yos/tasks?pair=1. Backend must validate an owner edit
 * of an unshared Notion verification page before issuing a Notion-only session.
 * Until then this deliberately fails closed. Existing DAYSTREAM is untouched. */
(function(root){
'use strict';
const API='https://project-y-yos-ai.vercel.app',SITE='https://yskn0008-bot.github.io';
const PAIR=API+'/api/yos/tasks?pair=1';
let context=null,initialized=false,token='',expires=0,lastRead=0,inflight=null,saving=false,pair=null,connecting=null;
const msg=(text)=>{if(context?.status)context.status.textContent=text};
const valid=()=>/^yos_dev_[a-f0-9]{64}$/.test(token)&&expires>Date.now()+15000;
const clear=()=>{token='';expires=0};
const fail=(err)=>err?.name==='AbortError'?'通信がタイムアウトしました。再接続してください':
 root.navigator?.onLine===false||err instanceof TypeError?'通信できません。以前の記録を最新として扱いません':
 err instanceof Error?err.message:'通信結果を確認できません';
function ttl(v){
 if(!/^yos_dev_[a-f0-9]{64}$/.test(v?.token||'')||
   !Number.isFinite(v?.expiresAt)||v.expiresAt<=Date.now()||v.expiresAt>Date.now()+3660000)
  throw Error('安全なセッションを確認できません');
 token=v.token;expires=v.expiresAt;
}
function dbOpen(){
 return new Promise((resolve,reject)=>{
  if(!root.indexedDB||!root.crypto?.subtle)return reject(Error('端末内に認証情報を安全に保存できません'));
  const req=root.indexedDB.open('yos-calendar-notion-device-v1',1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('keys'))req.result.createObjectStore('keys')};
  req.onerror=()=>reject(Error('端末の保存領域に接続できません'));
  req.onsuccess=()=>resolve(req.result);
 });
}
async function savedDevice(operation,value){
 const db=await dbOpen();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction('keys',operation==='get'?'readonly':'readwrite');
  const store=tx.objectStore('keys');
  const request=operation==='get'?store.get('primary'):store.put(value,'primary');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(Error('端末内の保存結果を確認できません'));
  tx.oncomplete=()=>db.close();
  tx.onerror=()=>{db.close();reject(Error('端末の認証情報を書き込めません'))};
 });
}
const b64=buf=>{
 let text='',bytes=new Uint8Array(buf);
 for(let i=0;i<bytes.length;i+=4096)text+=String.fromCharCode(...bytes.slice(i,i+4096));
 return btoa(text).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
};
async function signed(privateKey,options){
 if(!/^[a-f0-9]{64}$/.test(options?.requestId||'')||
    typeof options.challenge!=='string'||options.challenge.length<8||options.challenge.length>256)
  throw Error('端末認証の確認情報が不完全です');
 const data=new TextEncoder().encode(['YOS-CALENDAR-DEVICE-V1',SITE,options.requestId,options.challenge].join('\n'));
 return b64(await root.crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,data));
}
async function request(url,method='GET',body=null,auth=''){
 const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),14000);
 try{
  const headers={Accept:'application/json'};
  if(body!==null)headers['Content-Type']='application/json';
  if(auth)headers.Authorization='Bearer '+auth;
  const res=await fetch(url,{method,headers,body:body===null?undefined:JSON.stringify(body),cache:'no-store',credentials:'omit',signal:abort.signal});
  const data=await res.json().catch(()=>({}));
  if(!res.ok){
   const error=Error(res.status===405||res.status===404||res.status===501?'端末接続APIはまだサーバーに反映されていません':
    res.status===403?'このサイトからのアクセスは拒否されています':
    res.status===409?'接続コードが未確認または期限切れです。Notionの記録を確認してください':
    res.status===429?'安全のため接続試行を一時停止しています':
    res.status===401?'端末の接続期限が切れました':
    'Notionとの接続に失敗しました ('+res.status+')');
   error.status=res.status;throw error;
  }
  return data;
 }finally{clearTimeout(timer)}
}
const post=(action,input={})=>request(PAIR,'POST',{action,...input});
async function connect(){
 if(valid())return true;
 if(connecting)return connecting;
 clear();
 connecting=(async()=>{
  try{
   const device=await savedDevice('get');
   if(!device||device.pending||!/^[a-f0-9]{64}$/.test(device.deviceId||'')||!device.privateKey)return false;
   const options=await post('auth-options',{deviceId:device.deviceId});
   const signature=await signed(device.privateKey,options);
   ttl(await post('auth-verify',{deviceId:device.deviceId,requestId:options.requestId,signature}));
   msg('端末の自動接続を確認しました。Notionの正本を読込中です');
   return true;
  }catch(e){msg(fail(e));return false}
 })().finally(()=>{connecting=null});
 return connecting;
}
async function refresh(force=true){
 if(!context||saving)return false;
 if(!force&&valid()&&Date.now()-lastRead<300000)return true;
 if(inflight)return inflight;
 inflight=(async()=>{
  if(!await connect())return false;
  msg('Notionから予定・タスク・習慣を取得中');
  try{
   const url=API+'/api/yos/tasks?source=notion'+(context.includeCalendarMoney?'&calendarMoney=1':'');
   const data=await request(url,'GET',null,token);
   if(data.source!=='notion'||data.complete!==true||!Array.isArray(data.tasks)||data.tasks.length>400)throw Error('Notionの取得結果が不完全です');
   const snap=root.YOS_DAYSTREAM_SOURCES?.fromYosTaskDashboardCache({savedAt:Date.now(),data});
   if(!snap||context.save(snap)!==true)throw Error('安全な保存と読戻しに失敗しました');
   lastRead=Date.now();msg('Notion正本を取得済み。次回から自動接続します');return true;
  }catch(e){if(e.status===401)clear();msg(fail(e)+'。前回取得分は最新として扱いません');return false}
 })().finally(()=>{inflight=null});
 return inflight;
}
async function write(item,day){
 if(!await connect())return {ok:false,reason:'Notionの端末接続を確認してください'};
 if(saving)return {ok:false,reason:'保存中のため、結果確認後に操作してください'};
 if(!item||!/^notion-[a-f0-9]{32}$/.test(item.id)||!item.lastEditedAt)
  return {ok:false,reason:'元のNotion記録が確認できません'};
 const habit=typeof day==='string';
 if(habit){
  if(!item.habitCycle||!/^\d{4}-\d{2}-\d{2}$/.test(day))return {ok:false,reason:'習慣の実施日を確認できません'};
 }else if(item.habitCycle||item.timing==='fixed'){
  return {ok:false,reason:'原本の完了対象ではありません'};
 }
 saving=true;
 try{
  if(inflight)await inflight;
  if(!await connect())throw Error('端末の認証期限が切れました');
  const input=habit?
   {action:'complete-habit',pageId:item.id.slice(7),occurrenceDay:day,expectedEditedAt:item.lastEditedAt}:
   {action:'complete',pageId:item.id.slice(7),expectedEditedAt:item.lastEditedAt,expectedState:item.status};
  const result=await request(API+'/api/yos/tasks?source=notion','PATCH',input,token);
  if(habit){
   const e=result.occurrence;
   if(result.source!=='notion'||!e||!/^[a-f0-9]{32}$/.test(e.id)||e.taskId!==item.id.slice(7)||e.date!==day||e.done!==true)
    throw Error('習慣の実施記録を読み戻せません');
   return {ok:true,occurrence:e};
  }
  const snap=root.YOS_DAYSTREAM_SOURCES?.fromYosTaskDashboardCache({savedAt:Date.now(),data:{source:result.source,complete:true,tasks:[result.task]}});
  const updated=snap?.items?.[0];
  if(!updated||updated.id!==item.id||updated.status!=='完了')throw Error('Notionの完了を読み戻せません');
  return {ok:true,item:updated};
 }catch(e){if(e.status===401)clear();return {ok:false,reason:fail(e)+'。重複送信せずNotionを再取得して確認してください'}}
 finally{saving=false}
}
async function begin(status,els){
 els.start.disabled=true;
 try{
  const r=await post('pair-options');
  if(!/^[a-f0-9]{64}$/.test(r?.requestId||'')||!/^[A-Z0-9-]{8,96}$/.test(r?.challenge||'')||
   !Number.isFinite(r.expiresAt)||r.expiresAt<=Date.now()||r.expiresAt>Date.now()+660000)throw Error('接続情報が正しくありません');
  const url=new URL(r.notionUrl);
  if(url.protocol!=='https:'||!['notion.so','www.notion.so','app.notion.com'].includes(url.hostname))throw Error('Notionへのリンクを確認できません');
  const keys=await root.crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},false,['sign','verify']);
  const publicKey=await root.crypto.subtle.exportKey('jwk',keys.publicKey);
  await savedDevice('put',{pending:true,requestId:r.requestId,privateKey:keys.privateKey});
  const probe=await savedDevice('get');
  if(probe?.requestId!==r.requestId||!probe.privateKey)throw Error('端末の保存を確認できません');
  pair={...r,privateKey:keys.privateKey,publicKey};
  els.code.textContent=r.challenge;els.copy.hidden=false;els.link.href=url.href;els.link.hidden=false;els.verify.hidden=false;
  msg('コードをNotionの非公開確認ページへ貼り付け、戻って「接続を確認」を押してください');
 }catch(e){msg(fail(e))}finally{els.start.disabled=false}
}
async function verify(els){
 els.verify.disabled=true;
 try{
  if(!pair||pair.expiresAt<=Date.now())throw Error('コードの期限切れです。再発行してください');
  const signature=await signed(pair.privateKey,{requestId:pair.requestId,challenge:pair.challenge});
  const r=await post('pair-verify',{requestId:pair.requestId,publicKey:pair.publicKey,signature});
  if(!/^[a-f0-9]{64}$/.test(r?.deviceId||''))throw Error('端末の登録結果が不完全です');
  ttl(r);
  await savedDevice('put',{deviceId:r.deviceId,privateKey:pair.privateKey,pending:false});
  if((await savedDevice('get'))?.deviceId!==r.deviceId)throw Error('端末の登録結果を保存できません');
  pair=null;els.copy.hidden=true;els.link.hidden=true;els.verify.hidden=true;els.start.hidden=true;
  await refresh(true);
 }catch(e){msg(fail(e)+'。Notionの記録を確認し、二重登録しないでください')}finally{els.verify.disabled=false}
}
function setup({host,status,save,includeCalendarMoney=false}){
 if(initialized){if(valid())return refresh(true);return connect().then(ok=>ok?refresh(true):false)}
 if(location.origin!==SITE){if(status)status.textContent='YOS正規サイト以外では接続できません';return Promise.resolve(false)}
 if(!host||typeof save!=='function'){if(status)status.textContent='接続画面の準備ができません';return Promise.resolve(false)}
 initialized=true;context={status,save,includeCalendarMoney};
 const make=(tag,cls,label)=>{const el=document.createElement(tag);el.className=cls||'';el.textContent=label||'';return el};
 const start=make('button','cal-passkey-primary','Notionと接続する');start.type='button';
 const guide=make('p','','初回だけ非公開Notionで端末を確認。以降は認証操作なしで自動接続します。');
 const code=make('strong','cal-device-code','');
 const copy=make('button','cal-passkey-secondary','コードをコピー');copy.type='button';copy.hidden=true;
 const link=make('a','cal-passkey-secondary','Notion確認ページを開く');link.hidden=true;link.target='_blank';link.rel='noopener noreferrer';
 const verifyButton=make('button','cal-passkey-primary','接続を確認');verifyButton.type='button';verifyButton.hidden=true;
 host.replaceChildren(start,guide,code,copy,link,verifyButton);
 const els={start,guide,code,copy,link,verify:verifyButton};
 start.addEventListener('click',()=>void begin(status,els));
 copy.addEventListener('click',async()=>{
  try{if(!pair||pair.expiresAt<=Date.now())throw Error('コードの期限切れです');await root.navigator.clipboard.writeText(pair.challenge);msg('コピーしました。非公開Notionページへ貼り付けてください')}
  catch(e){msg(fail(e)+'。コードを長押ししてコピーしてください')}
 });
 verifyButton.addEventListener('click',()=>void verify(els));
 msg('接続状態を確認中');
 void connect().then(async ok=>{
  if(ok){start.hidden=true;guide.hidden=true;await refresh(true)}
  else msg(root.navigator?.onLine===false?'オフラインです。接続時に通信が必要です':'初回のみ「Notionと接続する」で端末を確認してください');
 });
 return Promise.resolve(true);
}
root.addEventListener?.('online',()=>{if(context)void refresh(false)});
root.document?.addEventListener?.('visibilitychange',()=>{if(root.document.visibilityState==='visible'&&context)void refresh(false)});
root.setInterval?.(()=>{if(root.document?.visibilityState==='visible'&&context)void refresh(false)},300000);
root.YOS_DAYSTREAM_TASK_AUTH={setup,refresh,complete:item=>write(item),completeHabit:(item,day)=>write(item,day)};
})(typeof window!=='undefined'?window:globalThis);
