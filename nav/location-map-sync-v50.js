'use strict';
(()=>{
  if(window.__yosLocationMapSyncV50)return;
  window.__yosLocationMapSyncV50=true;
  let observer=null;
  let bodyObserver=null;
  let section=null;
  let signature='';
  let scheduled=false;
  const readSignature=node=>[
    node?.dataset.latitude||'',
    node?.dataset.longitude||'',
    node?.dataset.accuracy||'',
    node?.dataset.acquiredAt||''
  ].join('|');
  const refresh=()=>{
    scheduled=false;
    window.dispatchEvent(new CustomEvent('yos-nav-recommendation',{detail:{source:'location-map-sync-v51'}}));
  };
  const scheduleRefresh=()=>{
    if(scheduled)return;
    scheduled=true;
    requestAnimationFrame(refresh);
  };
  const disconnect=()=>{
    observer?.disconnect();
    bodyObserver?.disconnect();
    observer=null;
    bodyObserver=null;
    section=null;
  };
  const mount=()=>{
    const next=document.querySelector('.yos-location-status');
    if(!next)return false;
    if(section===next&&observer)return true;
    observer?.disconnect();
    section=next;
    signature=readSignature(section);
    observer=new MutationObserver(()=>{
      const current=readSignature(section);
      if(current===signature)return;
      signature=current;
      scheduleRefresh();
    });
    observer.observe(section,{attributes:true,attributeFilter:['data-latitude','data-longitude','data-accuracy','data-acquired-at']});
    return true;
  };
  const ensureMounted=()=>{
    if(mount()){
      bodyObserver?.disconnect();
      bodyObserver=null;
      return;
    }
    if(bodyObserver)return;
    bodyObserver=new MutationObserver(()=>ensureMounted());
    bodyObserver.observe(document.body,{childList:true,subtree:true});
  };
  ensureMounted();
  window.addEventListener('pagehide',disconnect);
  window.addEventListener('pageshow',()=>{
    ensureMounted();
    scheduleRefresh();
  });
})();
