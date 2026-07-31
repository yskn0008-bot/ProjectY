'use strict';
(()=>{
  if(window.__yosTaxiDriveScrollV120)return;
  window.__yosTaxiDriveScrollV120=true;

  const root=document.documentElement;
  let raf=0;
  let lastHeight=0;
  let first=true;

  function fit(){
    raf=0;
    const page=document.querySelector('#yosReferencePerfectV111 .rp-page-drive');
    const nav=document.getElementById('taxiGlobalNavV24');
    if(!page||!nav)return;

    root.classList.add('yos-drive-scroll-v120');

    if(first){
      first=false;
      try{window.scrollTo(0,0)}catch{}
    }

    const pageTop=Math.round(page.getBoundingClientRect().top);
    const navTop=Math.round(nav.getBoundingClientRect().top);
    const available=Math.max(320,navTop-pageTop-8);

    if(Math.abs(available-lastHeight)>1){
      lastHeight=available;
      page.style.setProperty('--yd-scroll-height',`${available}px`);
    }
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(fit));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

  new MutationObserver(schedule).observe(document.body||document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule,{passive:true});
  addEventListener('orientationchange',()=>setTimeout(schedule,220),{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  setInterval(schedule,900);
})();
