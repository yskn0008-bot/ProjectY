'use strict';
(()=>{
  if(window.__yosNavPwaUpdateNoticeV69)return;
  window.__yosNavPwaUpdateNoticeV69=true;

  let notice=null;
  const removeNotice=()=>{notice?.remove();notice=null;};
  const showNotice=()=>{
    if(notice)return;
    notice=document.createElement('aside');
    notice.id='yos-nav-pwa-update-v69';
    notice.setAttribute('role','status');
    notice.setAttribute('aria-live','polite');
    notice.style.cssText='position:fixed;z-index:99998;left:10px;right:10px;bottom:calc(env(safe-area-inset-bottom) + 10px);padding:12px;border:1px solid #31516b;border-radius:14px;background:#030a10;color:#eaf7ff;font:12px/1.45 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 12px 30px rgba(0,0,0,.45)';

    const text=document.createElement('strong');
    text.textContent='YOSナビの更新準備ができました。停車中なら今すぐ最新版へ更新できます。';
    notice.appendChild(text);

    const actions=document.createElement('div');
    actions.style.cssText='display:grid;grid-template-columns:1fr 1.3fr;gap:8px;margin-top:10px';

    const laterButton=document.createElement('button');
    laterButton.type='button';
    laterButton.textContent='あとで';
    laterButton.style.cssText='min-height:44px;padding:0 12px;border:1px solid #31516b;border-radius:10px;background:#07121e;color:#d9ebf6;font-weight:800';
    laterButton.addEventListener('click',removeNotice);

    const refreshButton=document.createElement('button');
    refreshButton.type='button';
    refreshButton.textContent='停車中に更新';
    refreshButton.style.cssText='min-height:44px;padding:0 12px;border:1px solid #4cbcff;border-radius:10px;background:#0d2131;color:#fff;font-weight:900';
    refreshButton.addEventListener('click',()=>location.reload());

    actions.append(laterButton,refreshButton);
    notice.appendChild(actions);
    document.body.appendChild(notice);
  };

  navigator.serviceWorker?.addEventListener('controllerchange',showNotice);
})();
