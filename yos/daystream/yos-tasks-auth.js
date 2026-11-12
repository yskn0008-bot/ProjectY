/* DAYSTREAM: user-initiated reuse of existing YOS Tasks authentication.
 * No automatic login, no Notion/Google API secret in browser files, no writes to source.
 * Uses the same read-only YOS Tasks endpoint and Google client ID as MY WAY.
 */
(function(root){
 'use strict';
 const API='https://project-y-yos-ai.vercel.app';
 const SITE='https://yskn0008-bot.github.io';
 const GSI='https://accounts.google.com/gsi/client';
 let initialized=false,initializing=null;
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
 function setup({host,status,save}){
  if(initialized)return Promise.resolve(true);
  if(initializing)return initializing;
  if(location.origin!==SITE){set(status,'YOS正規サイト以外では本人確認を開始しません');return Promise.resolve(false)}
  if(!host||typeof save!=='function'){set(status,'認証画面の準備ができません');return Promise.resolve(false)}
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
    set(status,'YOS Tasksの読取専用データを取得中');
    try{
     const res=await timedFetch(API+'/api/yos/tasks',{method:'GET',headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
     if(!res.ok)throw new Error(res.status===401?'本人確認の期限が切れています':'YOS Tasksを取得できません ('+res.status+')');
     const result=await res.json();
     if(!Array.isArray(result.tasks)||result.tasks.length>400)throw new Error('タスク取得件数が想定外です');
     const adapters=root.YOS_DAYSTREAM_SOURCES;
     const snapshot=adapters?.fromYosTaskDashboardCache({savedAt:Date.now(),data:result});
     if(!snapshot)throw new Error('Tasksの内容を安全に検証できません');
     const ok=save(snapshot);
     if(!ok){set(status,'端末に保存できません。元データは変更されていません');return}
     set(status,'取得したTasksの写しを保存しました。Notion/Googleの元データは変更していません');
   }catch(e){set(status,e instanceof Error?e.message:'Tasksを更新できませんでした')}
   }});
   host.replaceChildren();
   googleId.renderButton(host,{type:'standard',theme:'outline',size:'large',text:'continue_with',shape:'rectangular',width:Math.min(300,Math.max(220,Math.floor(host.getBoundingClientRect().width||260)))});
   initialized=true;set(status,'Google本人確認を選ぶと、既存YOS Tasksの読取専用データを更新します');return true
  }).catch(e=>{set(status,e instanceof Error?e.message:'認証を利用できません');return false}).finally(()=>{initializing=null});
  return initializing
 }
 root.YOS_DAYSTREAM_TASK_AUTH={setup};
})(typeof window!=='undefined'?window:globalThis);
