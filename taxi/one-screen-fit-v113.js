'use strict';
(()=>{
  if(window.__yosTaxiOneScreenV113)return;
  window.__yosTaxiOneScreenV113=true;

  const root=document.documentElement;
  let raf=0;
  let observer=null;

  function visibleHeight(){
    const vv=window.visualViewport;
    return Math.max(420,Math.round(vv?.height||window.innerHeight||document.documentElement.clientHeight));
  }

  function ensureWeekAdd(page){
    if(page!=='week')return;
    const strip=document.querySelector('.rp-week-strip');
    if(!strip||strip.querySelector('.rp-week-add-v113'))return;
    const add=document.createElement('button');
    add.type='button';
    add.className='rp-week-add-v113';
    add.innerHTML='<b>＋</b><span>予定追加</span>';
    add.onclick=()=>document.querySelector('[data-edit-day="1"]')?.click();
    strip.appendChild(add);
  }

  function fit(){
    cancelAnimationFrame(raf);
    raf=0;
    const shell=document.getElementById('yosReferencePerfectV111');
    const page=shell?.querySelector('.rp-page');
    const nav=document.getElementById('taxiGlobalNavV24');
    if(!shell||!page||!nav)return;

    root.classList.add('rp-one-screen-v113');
    root.style.setProperty('--rp-visible-height',`${visibleHeight()}px`);

    const pageType=(page.className.match(/rp-page-(drive|today|week|month|manage)/)||[])[1]||'';
    ensureWeekAdd(pageType);

    requestAnimationFrame(()=>{
      const pageTop=Math.round(page.getBoundingClientRect().top);
      const navTop=Math.round(nav.getBoundingClientRect().top);
      const available=Math.max(300,navTop-pageTop-6);
      root.style.setProperty('--rp-page-fit-height',`${available}px`);
    });
  }

  function schedule(){
    cancelAnimationFrame(raf);
    raf=requestAnimationFrame(()=>requestAnimationFrame(fit));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

  observer=new MutationObserver(schedule);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule,{passive:true});
  addEventListener('orientationchange',()=>setTimeout(schedule,220),{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  setInterval(schedule,1200);
})();
