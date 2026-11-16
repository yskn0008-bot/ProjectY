/* YOS Calendar: an owner-provisioned 256-bit device key, no login prompts.
 * The secret is never distributed in public JavaScript or sent in a URL.
 * The existing DAYSTREAM authentication is intentionally unchanged.
 */
(function(root){
 'use strict';
 const API='https://project-y-yos-ai.vercel.app';
 const SITE='https://yskn0008-bot.github.io';
 const STORAGE='yos_calendar_device_key_v1';
 const DEVICE=/^yos_cd_[a-f0-9]{64}$/;
 let initialized=false,currentToken='',context=null,inflight=null,lastRead=0,completing=false;
 const set=(status,message)=>{if(status)status.textContent=message};
 const readToken=()=>{
  try{const t=root.localStorage?.getItem(STORAGE)||'';return DEVICE.test(t)?t:''}catch{return ''}
 };
 const clearToken=()=>{currentToken='';try{root.localStorage?.removeItem(STORAGE)}catch{}};
 function importSetupLink(){
  const match=/^#yos-device=(yos_cd_[a-f0-9]{64})$/.exec(root.location?.hash||'');
  if(!match)return false;
  // Remove the fragment before any operation that could leak a secret.
  try{
   root.history.replaceState(null,'',root.location.pathname+root.location.search);
   root.localStorage.setItem(STORAGE,match[1]);
   if(root.localStorage.getItem(STORAGE)!==match[1])throw Error('readback');
   return true;
  }catch{return false}
 }
 const installed=importSetupLink();
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
    if(!res.ok){if(res.status===401)clearToken();throw new Error(res.status===401?'本人確認の期限が切れています':'YOS Tasksを取得できません ('+res.status+')')}
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
  if(!currentToken)return {ok:false,reason:'専用の接続リンクから設定してください'};
  if(!item||!/^notion-[a-f0-9]{32}$/.test(item.id)||!item.lastEditedAt||item.habitCycle||item.timing==='fixed')return {ok:false,reason:'原本または習慣の実施回を確認できないため、Notionでは完了にしません'};
  if(completing)return {ok:false,reason:'別のタスクを保存中です。完了の確認後にもう一度押してください'};
  completing=true;
  try{
   if(inflight)await inflight;
   if(!currentToken)throw Error('本人確認が必要です');
   const res=await timedFetch(API+'/api/yos/tasks?source=notion',{method:'PATCH',headers:{Authorization:'Bearer '+currentToken,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action:'complete',pageId:item.id.slice(7),expectedEditedAt:item.lastEditedAt,expectedState:item.status})});
   if(!res.ok){if(res.status===401)clearToken();throw Error('Notionの完了を確認できません。更新して状態を確認してください')}
   const data=await res.json();
   const snapshot=root.YOS_DAYSTREAM_SOURCES?.fromYosTaskDashboardCache({savedAt:Date.now(),data:{source:data.source,complete:true,tasks:[data.task]}});
   const updated=snapshot?.items?.[0];
   if(!updated||updated.id!==item.id||updated.status!=='完了')throw Error('Notionの完了読戻しを確認できません');
   return {ok:true,item:updated};
  }catch(e){return {ok:false,reason:e instanceof Error?e.message:'結果不明です。Notionを再取得して確認してください'}}finally{completing=false}
 }
 async function completeHabit(item,occurrenceDay){
  if(!currentToken)return {ok:false,reason:'専用の接続リンクから設定してください'};
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
 function setup({host,status,save,includeCalendarMoney=false}){
  if(root.location.origin!==SITE){set(status,'正規のYOSサイトから開いてください');return Promise.resolve(false)}
  if(!host||typeof save!=='function'){set(status,'接続画面の準備に失敗しました');return Promise.resolve(false)}
  context={status,save,includeCalendarMoney};
  host.replaceChildren();
  const info=root.document.createElement('p');
  info.style.cssText='margin:0;line-height:1.6;font-size:12px;color:inherit';
  const token=readToken();
  info.textContent=token?'このiPhoneは接続設定済み。Google・Face ID操作は不要です。':
   '初回だけYOSから受け取った専用リンクでこの画面を開いてください。';
  host.appendChild(info);
  initialized=true;
  if(!token){set(status,'未接続。端末に保存済みの予定はそのまま使えます');return Promise.resolve(false)}
  currentToken=token;
  set(status,installed?'接続設定を保存しました。Notionデータを読み込みます':'Notion正本から読み込みます');
  return refresh(true);
 }
 root.addEventListener?.('online',()=>{if(currentToken)refresh(false)});
 root.document?.addEventListener?.('visibilitychange',()=>{if(root.document.visibilityState==='visible'&&currentToken)refresh(false)});
 root.setInterval?.(()=>{if(currentToken&&root.document?.visibilityState==='visible')refresh(false)},60000);
 root.YOS_DAYSTREAM_TASK_AUTH={setup,refresh,complete,completeHabit,hasDeviceKey:()=>Boolean(readToken())};
})(typeof window!=='undefined'?window:globalThis);
