'use strict';
(()=>{
  if(window.__yosMapLoadingVisibilityV63)return;
  window.__yosMapLoadingVisibilityV63=true;

  const loadingElement=()=>document.querySelector('.yos-real-map-v7__loading');
  const tileReady=()=>Boolean(document.getElementById('yos-real-map-v7')?.querySelector('.leaflet-tile-loaded'));

  let scheduled=false;
  const sync=()=>{
    const loading=loadingElement();
    if(!loading)return;
    const ready=tileReady();
    loading.classList.toggle('is-hidden',ready);
    loading.setAttribute('aria-hidden',ready?'true':'false');
  };
  const schedule=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(()=>{
      scheduled=false;
      sync();
    });
  };

  const observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{
    childList:true,
    subtree:true,
    attributes:true,
    attributeFilter:['class','src']
  });
  window.addEventListener('pageshow',schedule);
  window.addEventListener('online',schedule);
  window.addEventListener('offline',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  schedule();
})();
