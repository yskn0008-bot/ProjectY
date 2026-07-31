'use strict';
(()=>{
  if(window.__yosMapLoadSafetyV60)return;
  window.__yosMapLoadSafetyV60=true;

  const TIMEOUT_MS=12000;
  const RETRY_DELAY_MS=800;
  let timer=0;

  const style=document.createElement('style');
  style.id='yos-map-load-safety-v60-style';
  style.textContent=`
    .yos-map-load-safety-v58{display:grid;place-items:center;gap:10px;padding:24px;text-align:center}
    .yos-map-load-safety-v58 strong{font-size:16px;color:#f5fbff}
    .yos-map-load-safety-v58 p{max-width:280px;margin:0;color:#a9c2d1;font-size:11px;line-height:1.55}
    .yos-map-load-safety-v58 button{min-height:44px;padding:0 16px;border:1px solid #2e9fff;border-radius:12px;background:#0b3a61;color:#fff;font-weight:900}
    .yos-map-load-safety-v58 small{color:#7f94a3;font-size:9px}
  `;
  document.head.appendChild(style);

  const loadingElement=()=>document.querySelector('.yos-real-map-v7__loading');
  const tileReady=()=>Boolean(document.getElementById('yos-real-map-v7')?.querySelector('.leaflet-tile-loaded'));
  const stopTimer=()=>{
    if(timer)clearTimeout(timer);
    timer=0;
  };

  const showRecovery=reason=>{
    stopTimer();
    const loading=loadingElement();
    if(!loading||tileReady())return;
    const offline=!navigator.onLine;
    loading.classList.remove('is-hidden');
    loading.innerHTML=`<div class="yos-map-load-safety-v58"><strong>${offline?'現在オフラインです':'実地図を読み込めませんでした'}</strong><p>${offline?'通信が戻ると地図を再取得できます。YOSの営業判断と推奨情報はそのまま確認できます。':'地図サービスへの接続が一時的に失敗した可能性があります。YOSの営業判断は停止していません。'}</p><button type="button">地図を再読み込み</button><small>${reason}</small></div>`;
    const button=loading.querySelector('button');
    button?.addEventListener('click',()=>{
      button.disabled=true;
      button.textContent='再読み込み中…';
      setTimeout(()=>location.reload(),RETRY_DELAY_MS);
    },{once:true});
  };

  const arm=(restart=false)=>{
    const loading=loadingElement();
    if(tileReady()){
      stopTimer();
      loading?.classList.add('is-hidden');
      return;
    }
    if(!loading)return;
    if(restart)stopTimer();
    if(timer)return;
    timer=setTimeout(()=>showRecovery('12秒以内に地図タイルの読み込みが完了しませんでした'),TIMEOUT_MS);
  };

  const observer=new MutationObserver(()=>{
    if(tileReady()){
      stopTimer();
      loadingElement()?.classList.add('is-hidden');
      return;
    }
    arm();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','src']});

  window.addEventListener('offline',()=>showRecovery('通信状態：オフライン'));
  window.addEventListener('online',()=>arm(true));
  window.addEventListener('pageshow',()=>arm(false));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)arm(false)});
  arm();
})();
