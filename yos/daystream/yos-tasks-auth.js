/* DAYSTREAM: user-initiated reuse of existing YOS Tasks authentication.
 * No automatic login, no Notion/Google API secret in browser files, completion only after an explicit task action.
 * Uses the existing YOS Tasks endpoint and Google client ID with explicit Notion source selection.
 */
(function(root){
 'use strict';
 const API='https://project-y-yos-ai.vercel.app';
 const SITE='https://yskn0008-bot.github.io';
 const GSI='https://accounts.google.com/gsi/client';
 let initialized=false,initializing=null,currentToken='',context=null,inflight=null,lastRead=0,completing=false;
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
    if(!res.ok){if(res.status===401)currentToken='';throw new Error(res.status===401?'本人確認の期限が切れています':'YOS Tasksを取得できません ('+res.status+')')}
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
   if(!res.ok){if(res.status===401)currentToken='';throw Error('Notionの完了を確認できません。更新して状態を確認してください')}
   const data=await res.json();
   const snapshot=root.YOS_DAYSTREAM_SOURCES?.fromYosTaskDashboardCache({savedAt:Date.now(),data:{source:data.source,complete:true,tasks:[data.task]}});
   const updated=snapshot?.items?.[0];
   if(!updated||updated.id!==item.id||updated.status!=='完了')throw Error('Notionの完了読戻しを確認できません');
   return {ok:true,item:updated};
  }catch(e){return {ok:false,reason:e instanceof Error?e.message:'結果不明です。Notionを再取得して確認してください'}}finally{completing=false}
 }
 function setup({host,status,save,includeCalendarMoney=false}){
  if(initialized){if(currentToken)return refresh();return Promise.resolve(true)}
  if(initializing)return initializing;
  if(location.origin!==SITE){set(status,'YOS正規サイト以外では本人確認を開始しません');return Promise.resolve(false)}
  if(!host||typeof save!=='function'){set(status,'認証画面の準備ができません');return Promise.resolve(false)}
  context={status,save,includeCalendarMoney};
  set(status,'Google本人確認を準備しています');
  initializing=Promise.all([
   timedFetch(API+'/api/yos/public-config',{headers:{Accept:'application/json'}}).then(async response=>{
    if(!response.ok)throw new Error('既存YOS認証設定を取得できません');
    const data=await response.json();
    if(typeof data.googleClientId!=='string'||!/^[a-zA-Z0-9_.-]+\.apps\.googleusercontent\.com$/.test(data.googleClientId))throw new Error('認証設定が無効です');
    return data.googleClientId;
   }),
   getScript()
  ]).then(([clientId,googleId])=>{
   googleId.initialize({client_id:clientId,auto_select:false,itp_support:true,use_fedcm_for_prompt:true,callback:async({credential})=>{
    const token=typeof credential==='string'?credential.trim():'';
    if(!token||token.length>8192){set(status,'本人確認を完了できませんでした');return}
    currentToken=token;return refresh();
   }});
   host.replaceChildren();
   googleId.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',width:Math.min(300,Math.max(220,Math.floor(host.getBoundingClientRect().width||260)))});
   initialized=true;set(status,'Google本人確認を選ぶと、既存YOS Tasksの読取専用データを更新します');return true
  }).catch(e=>{set(status,e instanceof Error?e.message:'認証を利用できません');return false}).finally(()=>{initializing=null});
  return initializing
 }
 root.addEventListener?.('online',()=>{if(currentToken)refresh(false)});
 root.document?.addEventListener?.('visibilitychange',()=>{if(root.document.visibilityState==='visible'&&currentToken)refresh(false)});
 root.setInterval?.(()=>{if(currentToken&&root.document?.visibilityState==='visible')refresh(false)},60000);
 root.YOS_DAYSTREAM_TASK_AUTH={setup,refresh,complete};
})(typeof window!=='undefined'?window:globalThis);
