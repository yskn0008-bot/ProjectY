'use strict';
(()=>{
  if(window.__yosNavPwaUpdateNoticeV71)return;
  window.__yosNavPwaUpdateNoticeV71=true;

  let notice=null;
  let refreshButton=null;
  let text=null;
  let reloading=false;
  let hadController=Boolean(navigator.serviceWorker?.controller);

  const removeNotice=()=>{
    notice?.remove();
    notice=null;
    refreshButton=null;
    text=null;
  };

  const syncConnectivity=()=>{
    if(!notice||!refreshButton||!text)return;
    const online=navigator.onLine;
    refreshButton.disabled=!online||reloading;
    refreshButton.setAttribute('aria-disabled',refreshButton.disabled?'true':'false');
    refreshButton.style.opacity=refreshButton.disabled?'.52':'1';
    refreshButton.style.cursor=refreshButton.disabled?'not-allowed':'pointer';
    text.textContent=online
      ?'YOSナビの更新準備ができました。停車中なら今すぐ最新版へ更新できます。'
      :'YOSナビの更新準備ができています。通信復旧後、停車中に更新してください。';
  };

  const refresh=()=>{
    if(reloading||!navigator.onLine)return;
    reloading=true;
    syncConnectivity();
    location.reload();
  };

  const showNotice=()=>{
    if(notice){syncConnectivity();return;}
    notice=document.createElement('aside');
    notice.id='yos-nav-pwa-update-v71';
    notice.setAttribute('role','status');
    notice.setAttribute('aria-live','polite');
    notice.style.cssText='position:fixed;z-index:99998;left:10px;right:10px;bottom:calc(env(safe-area-inset-bottom) + 10px);padding:12px;border:1px solid #31516b;border-radius:14px;background:#030a10;color:#eaf7ff;font:12px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.45)';

    text=document.createElement('strong');
    notice.appendChild(text);

    const actions=document.createElement('div');
    actions.style.cssText='display:grid;grid-template-columns:1fr 1.3fr;gap:8px;margin-top:10px';

    const laterButton=document.createElement('button');
    laterButton.type='button';
    laterButton.textContent='あとで';
    laterButton.style.cssText='min-height:44px;padding:0 12px;border:1px solid #31516b;border-radius:10px;background:#07121e;color:#d9ebf6;font-weight:800';
    laterButton.addEventListener('click',removeNotice);

    refreshButton=document.createElement('button');
    refreshButton.type='button';
    refreshButton.textContent='停車中に更新';
    refreshButton.style.cssText='min-height:44px;padding:0 12px;border:1px solid #4cbcff;border-radius:10px;background:#0d2131;color:#fff;font-weight:900';
    refreshButton.addEventListener('click',refresh);

    actions.append(laterButton,refreshButton);
    notice.appendChild(actions);
    document.body.appendChild(notice);
    syncConnectivity();
  };

  const handleControllerChange=()=>{
    const hasController=Boolean(navigator.serviceWorker?.controller);
    if(!hasController)return;
    if(!hadController){
      hadController=true;
      return;
    }
    showNotice();
  };

  navigator.serviceWorker?.addEventListener('controllerchange',handleControllerChange);
  window.addEventListener('online',syncConnectivity);
  window.addEventListener('offline',syncConnectivity);
})();
