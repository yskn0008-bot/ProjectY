'use strict';
(()=>{
  if(window.__yosLocationMapSyncV50)return;
  window.__yosLocationMapSyncV50=true;
  let observer=null;
  let signature='';
  let scheduled=false;
  const readSignature=section=>[
    section.dataset.latitude||'',
    section.dataset.longitude||'',
    section.dataset.accuracy||'',
    section.dataset.acquiredAt||''
  ].join('|');
  const refresh=()=>{
    scheduled=false;
    window.dispatchEvent(new CustomEvent('yos-nav-recommendation',{detail:{source:'location-map-sync-v50'}}));
  };
  const scheduleRefresh=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(refresh);
  };
  const mount=()=>{
    const section=document.querySelector('.yos-location-status');
    if(!section)return false;
    const next=readSignature(section);
    signature=next;
    observer=new MutationObserver(()=>{
      const current=readSignature(section);
      if(current===signature)return;
      signature=current;
      scheduleRefresh();
    });
    observer.observe(section,{attributes:true,attributeFilter:['data-latitude','data-longitude','data-accuracy','data-acquired-at']});
    return true;
  };
  if(!mount()){
    const bodyObserver=new MutationObserver(()=>{
      if(!mount())return;
      bodyObserver.disconnect();
    });
    bodyObserver.observe(document.body,{childList:true,subtree:true});
  }
  window.addEventListener('pagehide',()=>observer?.disconnect(),{once:true});
})();
