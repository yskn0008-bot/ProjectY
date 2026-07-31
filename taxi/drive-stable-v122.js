'use strict';
(()=>{
  if(window.__yosTaxiDriveStableV122)return;
  window.__yosTaxiDriveStableV122=true;

  const root=document.documentElement;
  let raf=0;
  let navObserver=null;

  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const desiredBottom=()=>standalone()?'calc(env(safe-area-inset-bottom) + 4px)':'4px';

  function fixNav(nav){
    if(!nav)return;
    const wanted=desiredBottom();
    if(nav.style.getPropertyValue('bottom')!==wanted||nav.style.getPropertyPriority('bottom')!=='important'){
      nav.style.setProperty('bottom',wanted,'important');
    }
    if(!navObserver){
      navObserver=new MutationObserver(()=>fixNav(document.getElementById('taxiGlobalNavV24')));
      navObserver.observe(nav,{attributes:true,attributeFilter:['style']});
    }
  }

  function apply(){
    raf=0;
    const page=document.querySelector('#yosReferencePerfectV111 .rp-page-drive');
    const nav=document.getElementById('taxiGlobalNavV24');
    if(!page||!nav)return;

    root.classList.add('yos-drive-stable-v122');
    fixNav(nav);

    /* DOMを動かさず、CSS orderで順番を固定する。重複は念のためDOM側でも除去。 */
    page.querySelectorAll('.rp-status-card dl>div').forEach(row=>{
      if(row.querySelector('dt')?.textContent?.trim()==='平均単価')row.hidden=true;
    });

    requestAnimationFrame(()=>{
      const pageTop=Math.round(page.getBoundingClientRect().top);
      const navTop=Math.round(nav.getBoundingClientRect().top);
      const available=Math.max(320,navTop-pageTop-8);
      page.style.setProperty('--yd-scroll-height',`${available}px`);
    });
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(apply));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

  new MutationObserver(schedule).observe(document.body||document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule,{passive:true});
  addEventListener('orientationchange',()=>setTimeout(schedule,180),{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  setInterval(schedule,700);
})();
