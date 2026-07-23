'use strict';
(()=>{
  if(window.__yosBrowserBottomV39)return;
  window.__yosBrowserBottomV39=true;

  const root=document.documentElement;
  const navId='taxiGlobalNavV24';
  const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;

  function browserBottomInset(){
    if(isStandalone())return 0;
    const vv=window.visualViewport;
    if(!vv)return 96;
    const measured=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop));
    return Math.min(160,Math.max(96,measured));
  }

  function apply(){
    const standalone=isStandalone();
    const nav=document.getElementById(navId);
    const navHeight=Math.max(58,Math.ceil(nav?.getBoundingClientRect().height||68));
    root.style.setProperty('--yos-browser-bottom',`${standalone?0:browserBottomInset()}px`);
    root.style.setProperty('--yos-nav-height',`${navHeight}px`);
    root.classList.toggle('yos-standalone-mode',standalone);
    root.classList.toggle('yos-browser-mode',!standalone);
  }

  let frame=0;
  const schedule=()=>{
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>requestAnimationFrame(apply));
  };

  apply();
  addEventListener('DOMContentLoaded',schedule,{once:true});
  addEventListener('load',schedule,{once:true});
  addEventListener('resize',schedule,{passive:true});
  addEventListener('orientationchange',()=>setTimeout(schedule,250),{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('scroll',schedule,{passive:true});

  const observer=new MutationObserver(()=>{
    const nav=document.getElementById(navId);
    if(!nav)return;
    observer.disconnect();
    new ResizeObserver(schedule).observe(nav);
    schedule();
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});
})();
