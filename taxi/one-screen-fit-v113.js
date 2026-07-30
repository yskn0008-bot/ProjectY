'use strict';
(()=>{
  if(window.__yosTaxiOneScreenV113)return;
  window.__yosTaxiOneScreenV113=true;

  const root=document.documentElement;
  let raf=0;
  let observer=null;
  let lastVisible=0;
  let lastAvailable=0;

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
    raf=0;
    const shell=document.getElementById('yosReferencePerfectV111');
    const page=shell?.querySelector('.rp-page');
    const nav=document.getElementById('taxiGlobalNavV24');
    if(!shell||!page||!nav)return;

    const visible=visibleHeight();
    if(visible!==lastVisible){
      lastVisible=visible;
      root.style.setProperty('--rp-visible-height',`${visible}px`);
    }

    const pageType=(page.className.match(/rp-page-(drive|today|week|month|manage)/)||[])[1]||'';
    ensureWeekAdd(pageType);

    /*
      Large readable type plus the approved information density needs about
      620 CSS px of visible height. Short Safari viewports must scroll instead
      of crushing or overlapping cards.
    */
    const oneScreen=visible>=620;
    root.classList.toggle('rp-one-screen-v113',oneScreen);
    root.classList.toggle('rp-adaptive-scroll-v116',!oneScreen);

    if(!oneScreen){
      lastAvailable=0;
      root.style.removeProperty('--rp-page-fit-height');
      return;
    }

    requestAnimationFrame(()=>{
      const pageTop=Math.round(page.getBoundingClientRect().top);
      const navTop=Math.round(nav.getBoundingClientRect().top);
      const available=Math.max(300,navTop-pageTop-6);
      if(available!==lastAvailable){
        lastAvailable=available;
        root.style.setProperty('--rp-page-fit-height',`${available}px`);
      }
    });
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(fit));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

  observer=new MutationObserver(schedule);
  observer.observe(document.body||document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule,{passive:true});
  addEventListener('orientationchange',()=>setTimeout(schedule,220),{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  setInterval(schedule,1200);
})();