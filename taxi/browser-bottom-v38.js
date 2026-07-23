'use strict';
(()=>{
  if(window.__yosBrowserBottomV38)return;
  window.__yosBrowserBottomV38=true;
  const root=document.documentElement;
  const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const apply=()=>{
    if(isStandalone()){
      root.style.setProperty('--yos-browser-bottom','0px');
      return;
    }
    const vv=window.visualViewport;
    const measured=vv?Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop)):0;
    const fallback=44;
    const extra=Math.min(140,Math.max(fallback,measured));
    root.style.setProperty('--yos-browser-bottom',`${extra}px`);
  };
  apply();
  window.addEventListener('resize',apply,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(apply,250),{passive:true});
  window.visualViewport?.addEventListener('resize',apply,{passive:true});
  window.visualViewport?.addEventListener('scroll',apply,{passive:true});
})();
