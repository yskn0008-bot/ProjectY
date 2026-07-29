'use strict';
(()=>{
  if(window.__yosDriveNoOverlapV69)return;
  window.__yosDriveNoOverlapV69=true;

  let raf=0;
  let observer=null;

  function isDrive(){
    const path=location.pathname;
    return path.endsWith('/taxi/')||path.endsWith('/taxi/index.html');
  }

  function fit(){
    raf=0;
    if(!isDrive())return;

    const main=document.querySelector('main.app');
    const nav=document.getElementById('taxiGlobalNavV24');
    if(!main||!nav)return;

    main.style.removeProperty('height');
    main.style.removeProperty('max-height');
    main.style.setProperty('min-height','0','important');
    main.style.setProperty('overflow','hidden','important');

    const mainRect=main.getBoundingClientRect();
    const navRect=nav.getBoundingClientRect();
    const available=Math.floor(navRect.top-mainRect.top);
    if(available<320)return;

    main.style.setProperty('height',`${available}px`,'important');
    main.style.setProperty('max-height',`${available}px`,'important');

    const afterMain=main.getBoundingClientRect();
    const afterNav=nav.getBoundingClientRect();
    if(afterMain.bottom>afterNav.top){
      const safe=Math.max(320,available-Math.ceil(afterMain.bottom-afterNav.top)-1);
      main.style.setProperty('height',`${safe}px`,'important');
      main.style.setProperty('max-height',`${safe}px`,'important');
    }
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(fit));
  }

  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule);
  addEventListener('orientationchange',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  window.visualViewport?.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('scroll',schedule);

  observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});

  schedule();
  setTimeout(schedule,200);
  setTimeout(schedule,700);
  setInterval(schedule,2000);
})();
