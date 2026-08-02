'use strict';
(()=>{
  if(window.__yosTaxiSyncDiagnosticsV142)return;
  window.__yosTaxiSyncDiagnosticsV142=true;
  const API_KEY='yos-taxi-sync-api-v1';
  const TOKEN_KEY='yos-taxi-sync-token-v1';
  const QUEUE_KEY='yos-taxi-sync-queue-v1';
  const SHARED_KEY='yos-shared-taxi-state-v1';
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||'null')||fallback}catch{return fallback}};
  const safeHost=value=>{try{return new URL(value).host}catch{return''}};
  function snapshot(){
    const api=String(localStorage.getItem(API_KEY)||'').trim();
    const token=String(localStorage.getItem(TOKEN_KEY)||'').trim();
    const queue=read(QUEUE_KEY,[]);
    const shared=read(SHARED_KEY,{});
    const first=Array.isArray(queue)?queue[0]:null;
    return{
      online:navigator.onLine,
      apiConfigured:Boolean(api),
      apiHost:safeHost(api),
      tokenConfigured:Boolean(token),
      pending:Array.isArray(queue)?queue.length:0,
      lastError:String(first?.lastError||''),
      attempts:Number(first?.attempts)||0,
      updatedAt:String(shared.updatedAt||''),
      syncState:String(shared.syncState||'未確認')
    };
  }
  function label(data){
    if(!data.online)return['オフライン','通信復旧後に自動送信'];
    if(!data.apiConfigured)return['API未設定','ProjectY接続からHTTPS URLを保存'];
    if(!data.tokenConfigured)return['トークン未設定','端末連携トークンを保存'];
    if(data.lastError)return['送信エラー',`${data.lastError}（試行${data.attempts}回）`];
    if(data.pending)return['送信待ち',`${data.pending}件を自動再送中`];
    return['接続準備OK','次の降車記録から自動送信'];
  }
  function mount(){
    const card=document.getElementById('yos-projecty-live-sync-v1');
    if(!card)return;
    let panel=document.getElementById('yos-sync-diagnostics-v142');
    if(!panel){
      panel=document.createElement('div');
      panel.id='yos-sync-diagnostics-v142';
      panel.className='yos-sync-diagnostics-v142';
      card.appendChild(panel);
    }
    const data=snapshot();
    const [title,detail]=label(data);
    panel.innerHTML=`<button type="button" data-sync-diagnose><span><b>${title}</b><small>${detail}</small></span><strong>診断</strong></button><div class="yos-sync-diagnostics-v142__details" hidden><dl><div><dt>通信</dt><dd>${data.online?'オンライン':'オフライン'}</dd></div><div><dt>API</dt><dd>${data.apiConfigured?data.apiHost:'未設定'}</dd></div><div><dt>トークン</dt><dd>${data.tokenConfigured?'設定済み':'未設定'}</dd></div><div><dt>未送信</dt><dd>${data.pending}件</dd></div></dl><button type="button" data-sync-retry>今すぐ再送</button></div>`;
    const details=panel.querySelector('.yos-sync-diagnostics-v142__details');
    panel.querySelector('[data-sync-diagnose]').onclick=()=>{details.hidden=!details.hidden};
    panel.querySelector('[data-sync-retry]').onclick=()=>{
      window.dispatchEvent(new Event('online'));
      panel.querySelector('[data-sync-retry]').textContent='再送を開始しました';
      setTimeout(mount,800);
    };
  }
  const observer=new MutationObserver(mount);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  window.addEventListener('online',mount);
  window.addEventListener('offline',mount);
  window.addEventListener('storage',mount);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
  setInterval(mount,15000);
})();
