'use strict';
(()=>{
  if(window.__yosConnectivityStatusV1)return;
  window.__yosConnectivityStatusV1=true;

  const style=document.createElement('style');
  style.textContent=`
    .yos-connectivity-status{display:none;margin:0 0 12px;padding:10px 12px;border:1px solid rgba(255,109,120,.45);border-radius:14px;background:rgba(255,109,120,.10);color:#ffd3d7;font-size:11px;font-weight:900;line-height:1.5}
    .yos-connectivity-status.is-offline{display:block}
    .yos-map-disabled{opacity:.45!important}
  `;
  document.head.appendChild(style);

  const appLinks=document.querySelector('.app-links');
  const hero=document.querySelector('.hero');
  if(!hero)return;

  const status=document.createElement('section');
  status.className='yos-connectivity-status';
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  status.textContent='オフラインです。Googleマップの案内は開始できません。通信が戻るまで停車してお待ちください。';
  (appLinks||hero).insertAdjacentElement('afterend',status);

  const mapButtons=()=>Array.from(document.querySelectorAll('#primaryGo,[data-target="next"],[data-target="pass"],#manualGo'));
  const paint=()=>{
    const offline=!navigator.onLine;
    status.classList.toggle('is-offline',offline);
    mapButtons().forEach(button=>{
      button.classList.toggle('yos-map-disabled',offline);
      button.setAttribute('aria-disabled',offline?'true':'false');
      if('disabled' in button)button.disabled=offline;
    });
  };

  document.addEventListener('click',event=>{
    if(navigator.onLine)return;
    const target=event.target.closest?.('#primaryGo,[data-target="next"],[data-target="pass"],#manualGo');
    if(!target)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    status.classList.add('is-offline');
    status.scrollIntoView({block:'nearest',behavior:'smooth'});
  },true);

  document.addEventListener('keydown',event=>{
    if(navigator.onLine||event.key!=='Enter')return;
    if(event.target?.id!=='destination')return;
    event.preventDefault();
    event.stopImmediatePropagation();
    status.classList.add('is-offline');
    status.scrollIntoView({block:'nearest',behavior:'smooth'});
  },true);

  window.addEventListener('online',paint);
  window.addEventListener('offline',paint);
  window.addEventListener('pageshow',paint);
  paint();
})();