/* Calendar-specific derivative of the existing Tasks auth (DAYSTREAM is unchanged). user-initiated reuse of existing YOS Tasks authentication.
 * No automatic login, no Notion/Google API secret in browser files, completion only after an explicit task action.
 * Uses the existing YOS Tasks endpoint and Google client ID with explicit Notion source selection.
 */
(function(root){
 'use strict';
 const API='https://project-y-yos-ai.vercel.app';
 const SITE='https://yskn0008-bot.github.io';
 const GSI='https://accounts.google.com/gsi/client';
 let initialized=false,initializing=null,currentToken='',googleToken='',context=null,inflight=null,lastRead=0,completing=false;
 const set=(status,message)=>{if(status)status.textContent=message};
 const getScript=()=>{
  if(root.google?.accounts?.id)return Promise.resolve(root.google.accounts.id);
  return new Promise((resolve,reject)=>{
   const existing=document.querySelector('script[data-yos-tasks-google]')||document.querySelector('script[src="'+GSI+'"]');
   const script=existing||document.createElement('script');
   const timeout=setTimeout(()=>reject(new Error('Google本人確認の読み込みがタイムアウトしました')),15000);
   const finish=()=>{clearTimeout(timeout);if(root.google?.accounts?.id)resolve(root.google.accounts.id);else reject(new Error('Google本人確認を利用できません'))};
   script.addEventListener('load',finish,{once:true});
   script.addEventListener('error',()=>{clearTimeout(timeout);reject(new Error('Google本人確認の読み込みに失敗しました'))},{once:true});
   if(root.google?.accounts?.id)finish();
   else if(!existing){script.src=GSI;script.async=true;script.referrerPolicy='strict-origin-when-cross-origin';script.dataset.yosTasksGoogle='1';document.head.append(script)}
  })
 };
 const timedFetch=(url,opts={})=>{
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),14000);
  return fetch(url,{...opts,signal:controller.signal,cache:'no-store',credentials:'omit'}).finally(()=>clearTimeout(timeout))
 };
 async function refresh(force=true){
  if(!currentToken||!context||completing)return false;
  if(inflight)return inflight;
  if(!force&&Date.now()-lastRead<300000)return true;
  const {status,save}=context;
  inflight=(async()=>{
   set(status,'Notion正本の予定・タスクを取得中');
   try{
    const url=API+'/api/yos/tasks?source=notion'+(context.includeCalendarMoney===true?'&calendarMoney=1':'');
    const res=await timedFetch(url,{method:'GET',headers:{Authorization:'Bearer '+currentToken,Accept:'application/json'}});
    if(!res.ok){if(res.status===401){currentToken='';root.sessionStorage?.removeItem('yos_calendar_passkey_session_v1')}throw new Error(res.status===401?'本人確認の期限が切れています':'YOS Tasksを取得できません ('+res.status+')')}
    const result=await res.json();
    if(result.source!=='notion'||result.complete!==true||!Array.isArray(result.tasks)||result.tasks.length>400)throw new Error('タスク取得内容が不完全です');
    const snapshot=root.YOS_DAYSTREAM_SOURCES?.fromYosTaskDashboardCache({savedAt:Date.now(),data:result});
    if(!snapshot)throw new Error('Tasksの内容を安全に検証できません');
    if(!save(snapshot)){set(status,'端末に保存できません。前回の写しを保持します');return false}
    lastRead=Date.now();set(status,'Notion正本を更新しました。画面復帰時と利用中5分ごとに再取得します');return true;
   }catch(e){set(status,(e instanceof Error?e.message:'Tasksを更新できませんでした')+'。前回取得分は最新と扱いません');return false}
  })().finally(()=>{inflight=null});
  return inflight;
 }
 async function complete(item){
  if(!currentToken)return {ok:false,reason:'タスクタブの「YOS Tasksを更新」から本人確認してください'};
  if(!item||!/^notion-[a-f0-9]{32}$/.test(item.id)||!item.lastEditedAt||item.habitCycle||item.timing==='fixed')return {ok:false,reason:'原本または習慣の実施回を確認できないため、Notionでは完了にしません'};
  if(completing)return {ok:false,reason:'別のタスクを保存中です。完了の確認後にもう一度押してください'};
  completing=true;
  try{
   if(inflight)await inflight;
   if(!currentToken)throw Error('本人確認が必要です');
   const res=await timedFetch(API+'/api/yos/tasks?source=notion',{method:'PATCH',headers:{Authorization:'Bearer '+currentToken,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action:'complete',pageId:item.id.slice(7),expectedEditedAt:item.lastEditedAt,expectedState:item.status})});
   if(!res.ok){if(res.status===401){currentToken='';root.sessionStorage?.removeItem('yos_calendar_passkey_session_v1')}throw Error('Notionの完了を確認できません。更新して状態を確認してください')}
   const data=await res.json();
   const snapshot=root.YOS_DAYSTREAM_SOURCES?.fromYosTaskDashboardCache({savedAt:Date.now(),data:{source:data.source,complete:true,tasks:[data.task]}});
   const updated=snapshot?.items?.[0];
   if(!updated||updated.id!==item.id||updated.status!=='完了')throw Error('Notionの完了読戻しを確認できません');
   return {ok:true,item:updated};
  }catch(e){return {ok:false,reason:e instanceof Error?e.message:'結果不明です。Notionを再取得して確認してください'}}finally{completing=false}
 }
 async function completeHabit(item,occurrenceDay){
  if(!currentToken)return {ok:false,reason:'「接続と設定」からNotion Tasksを更新してください'};
  if(completing)return {ok:false,reason:'保存中です。結果を確認してから操作してください'};
  if(!item||!/^notion-[a-f0-9]{32}$/.test(item.id)||!item.habitCycle||!item.lastEditedAt||!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDay))return {ok:false,reason:'習慣の原本と実施日を確認できません'};
  completing=true;
  try{
   if(inflight)await inflight;
   const res=await timedFetch(API+'/api/yos/tasks?source=notion',{method:'PATCH',headers:{Authorization:'Bearer '+currentToken,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action:'complete-habit',pageId:item.id.slice(7),occurrenceDay,expectedEditedAt:item.lastEditedAt})});
   if(!res.ok)throw Error(res.status===503?'実施記録の保存先を利用できません':'習慣の保存結果を確認できません。再取得して確認してください');
   const data=await res.json(),e=data.occurrence;
   if(data.source!=='notion'||!e||!/^[a-f0-9]{32}$/.test(e.id)||e.taskId!==item.id.slice(7)||e.date!==occurrenceDay||e.done!==true)throw Error('実施記録の読戻しを確認できません');
   return {ok:true,occurrence:e};
  }catch(e){return {ok:false,reason:e instanceof Error?e.message:'習慣を保存できませんでした'}}finally{completing=false}
 }
 const PASSKEY_API=API+'/api/yos/tasks?passkey=1';
 const STORAGE='yos_calendar_passkey_session_v1';
 async function passkeyPost(action,data={},token=''){
  const headers={'Content-Type':'application/json',Accept:'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  const res=await timedFetch(PASSKEY_API,{method:'POST',headers,body:JSON.stringify({action,...data})});
  const result=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(res.status===409?'パスキー未登録です。初回だけGoogle本人確認から登録してください':'本人確認を完了できませんでした');
  return result;
 }
 async function faceSignIn(status){
  if(!root.YOS_CALENDAR_PASSKEY)throw Error('パスキーのプログラムを読み込めません');
  set(status,'Face IDで本人確認中');
  const first=await passkeyPost('auth-options');
  const proof=await root.YOS_CALENDAR_PASSKEY.authenticate(first.options);
  const result=await passkeyPost('auth-verify',{requestId:first.requestId,credential:proof});
  if(!/^yos_pk_[a-f0-9]{64}$/.test(result.token||'')||!Number.isFinite(result.expiresAt)||result.expiresAt<=Date.now())throw Error('安全なセッションを取得できません');
  currentToken=result.token;googleToken='';
  root.sessionStorage?.setItem(STORAGE,JSON.stringify({token:result.token,expiresAt:result.expiresAt}));
  set(status,'Face ID確認済み。Notionの最新データを取得します');
  return refresh(true);
 }
 async function enrollPasskey(status){
  if(!googleToken)throw Error('初回はGoogle本人確認を行ってください');
  const first=await passkeyPost('register-options',{},googleToken);
  const credential=await root.YOS_CALENDAR_PASSKEY.create(first.options);
  const checked=await passkeyPost('register-verify',{requestId:first.requestId,credential},googleToken);
  if(checked.registered!==true)throw Error('パスキーの保存を確認できません');
  set(status,'Face IDの登録完了。ログインを確認します');
  return faceSignIn(status);
 }
 function setup({host,status,save,includeCalendarMoney=false}){
  if(initialized){if(currentToken)return refresh();return Promise.resolve(true)}
  if(initializing)return initializing;
  if(location.origin!==SITE){set(status,'YOS正規サイト以外では本人確認を開始しません');return Promise.resolve(false)}
  if(!host||typeof save!=='function'){set(status,'認証画面の準備ができません');return Promise.resolve(false)}
  context={status,save,includeCalendarMoney};
  const face=document.createElement('button');face.type='button';face.textContent='Face IDでNotionを接続';face.className='cal-passkey-primary';
  const enroll=document.createElement('button');enroll.type='button';enroll.textContent='このiPhoneにFace IDを登録';enroll.hidden=true;enroll.className='cal-passkey-secondary';
  const fallback=document.createElement('details');fallback.className='cal-passkey-fallback';
  const title=document.createElement('summary');title.textContent='初回登録・復旧（Google本人確認）';fallback.append(title);
  const googleHost=document.createElement('div');fallback.append(googleHost);
  host.replaceChildren(face,enroll,fallback);
  face.addEventListener('click',async()=>{face.disabled=true;try{await faceSignIn(status)}catch(e){set(status,e instanceof Error?e.message:'Face IDの確認に失敗しました');fallback.open=true}finally{face.disabled=false}});
  enroll.addEventListener('click',async()=>{enroll.disabled=true;try{await enrollPasskey(status);enroll.hidden=true}catch(e){set(status,e instanceof Error?e.message:'登録できませんでした')}finally{enroll.disabled=false}});
  initialized=true;
  try{
   const stored=JSON.parse(root.sessionStorage?.getItem(STORAGE)||'null');
   if(stored&&/^yos_pk_[a-f0-9]{64}$/.test(stored.token)&&Number.isFinite(stored.expiresAt)&&stored.expiresAt>Date.now()){currentToken=stored.token;refresh(true)}
  }catch{root.sessionStorage?.removeItem(STORAGE)}
  set(status,currentToken?'保存済みセッションを検証しています':'Face IDで接続できます。未登録なら初回だけGoogle本人確認が必要です');
  // The Google bridge is fallback-only: Face ID remains usable if GSI fails.
  initializing=Promise.all([
   timedFetch(API+'/api/yos/public-config',{headers:{Accept:'application/json'}}).then(async response=>{
    if(!response.ok)throw Error('Google認証設定を取得できません');
    const data=await response.json();
    if(typeof data.googleClientId!=='string'||!data.googleClientId.endsWith('.apps.googleusercontent.com')||!/^[a-zA-Z0-9_.-]+$/.test(data.googleClientId))throw Error('Google認証設定が無効です');
    return data.googleClientId;
   }),
   getScript()
  ]).then(([clientId,googleId])=>{
   googleId.initialize({client_id:clientId,auto_select:false,itp_support:true,use_fedcm_for_prompt:true,callback:async({credential})=>{
    const token=typeof credential==='string'?credential.trim():'';
    if(!token||token.length>8192){set(status,'Google本人確認を完了できませんでした');return}
    googleToken=token;currentToken=token;enroll.hidden=false;
    const ok=await refresh(true);
    set(status,ok?'Notion取得済み。Face IDを登録すると次回からGoogle不要です':'Google認証済み。Face ID登録は可能です');
   }});
   googleId.renderButton(googleHost,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',
    width:Math.min(300,Math.max(220,Math.floor(host.getBoundingClientRect().width||260)))});
   return true;
  }).catch(()=>{set(status,'Face IDは利用できます。Googleの初回登録画面だけ読み込めませんでした');return false})
    .finally(()=>{initializing=null});
  return initializing;
 }
 root.addEventListener?.('online',()=>{if(currentToken)refresh(false)});
 root.document?.addEventListener?.('visibilitychange',()=>{if(root.document.visibilityState==='visible'&&currentToken)refresh(false)});
 root.setInterval?.(()=>{if(currentToken&&root.document?.visibilityState==='visible')refresh(false)},60000);
 root.YOS_DAYSTREAM_TASK_AUTH={setup,refresh,complete,completeHabit};
})(typeof window!=='undefined'?window:globalThis);
