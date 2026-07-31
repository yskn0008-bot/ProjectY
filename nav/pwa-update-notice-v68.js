'use strict';
(()=>{
  if(window.__yosNavPwaUpdateNoticeV68)return;
  window.__yosNavPwaUpdateNoticeV68=true;

  let notice=null;
  const showNotice=()=>{
    if(notice)return;
    notice=document.createElement('aside');
    notice.id='yos-nav-pwa-update-v68';
    notice.setAttribute('role','status');
    notice.setAttribute('aria-live','polite');
    notice.style.cssText='position:fixed;z-index:99998;left:10px;right:10px;bottom:calc(env(safe-area-inset-bottom) + 10px);padding:12px;border:1px solid #31516b;border-radius:14px;background:#030a10;color:#eaf7ff;font:12px/1.45 -apple-system,BlinkMacSystemFont,sans-serif';
    const text=document.createElement('strong');
    text.textContent='YOSナビの更新が反映されました。次回の画面表示から最新版になります。';
    notice.appendChild(text);
    const button=document.createElement('button');
    button.type='button';
    button.textContent='閉じる';
    button.style.cssText='display:block;min-height:44px;margin-top:10px;padding:0 14px;border:1px solid #4cbcff;border-radius:10px;background:#0d2131;color:#fff;font-weight:800';
    button.addEventListener('click',()=>{notice?.remove();notice=null;});
    notice.appendChild(button);
    document.body.appendChild(notice);
  };

  navigator.serviceWorker?.addEventListener('controllerchange',showNotice);
})();
