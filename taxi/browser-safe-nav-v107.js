'use strict';
(()=>{
  if(window.__yosTaxiBrowserSafeNavV107)return;
  window.__yosTaxiBrowserSafeNavV107=true;

  const root=document.documentElement;
  let queued=false;

  const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
  const nav=()=>document.getElementById('taxiGlobalNavV24');

  function browserInset(){
    if(isStandalone())return 0;
    const vv=window.visualViewport;
    if(!vv)return 96;
    const measured=Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop));
    return Math.min(180,Math.max(96,measured));
  }

  function apply(){
    queued=false;
    root.dataset.taxiNavFixed='107';
    const inset=browserInset();
    root.style.setProperty('--yos-browser-bottom',`${inset}px`,'important');
    root.classList.toggle('yos-standalone-mode',isStandalone());
    root.classList.toggle('yos-browser-mode',!isStandalone());

    const element=nav();
    if(!element)return;
    if(element.parentElement!==document.body)document.body.appendChild(element);
    element.style.setProperty('position','fixed','important');
    element.style.setProperty('left','50%','important');
    element.style.setProperty('right','auto','important');
    element.style.setProperty('top','auto','important');
    element.style.setProperty('bottom','calc(var(--yos-browser-bottom, 0px) + env(safe-area-inset-bottom) + var(--yos-unified-nav-browser-gap, 6px))','important');
    element.style.setProperty('transform','translateX(-50%)','important');
    element.style.setProperty('width','min(calc(100% - 14px), 760px)','important');
    element.style.setProperty('max-width','760px','important');
    element.style.setProperty('margin','0','important');
    element.style.setProperty('z-index','2147483000','important');

    const height=Math.max(58,Math.ceil(element.getBoundingClientRect().height||68));
    root.style.setProperty('--yos-unified-nav-height',`${height}px`,'important');
  }

  function queue(){
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>requestAnimationFrame(apply));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queue,{once:true});
  else queue();

  const observer=new MutationObserver(queue);
  observer.observe(document.documentElement,{childList:true,subtree:true});
  addEventListener('pageshow',queue);
  addEventListener('resize',queue,{passive:true});
  addEventListener('orientationchange',()=>setTimeout(queue,220),{passive:true});
  window.visualViewport?.addEventListener('resize',queue,{passive:true});
  window.visualViewport?.addEventListener('scroll',queue,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queue()});
  setInterval(queue,1200);
})();
