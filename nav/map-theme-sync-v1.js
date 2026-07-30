'use strict';
(()=>{
  if(window.__yosMapThemeSyncV1)return;
  window.__yosMapThemeSyncV1=true;
  const KEY='yos-nav-map-theme-v1';
  const valid=value=>['dark','neon','light'].includes(value)?value:'dark';
  const read=()=>{try{return valid(localStorage.getItem(KEY))}catch{return'dark'}};
  const apply=value=>{
    const theme=valid(value);
    document.querySelectorAll('.yos-okinawa-map').forEach(section=>{section.dataset.theme=theme});
  };
  document.addEventListener('change',event=>{
    const select=event.target.closest?.('.yos-map-theme-select');
    if(select)apply(select.value);
  });
  const observer=new MutationObserver(()=>apply(read()));
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('pageshow',()=>apply(read()));
  window.addEventListener('yos-nav-recommendation',()=>apply(read()));
  apply(read());
})();
