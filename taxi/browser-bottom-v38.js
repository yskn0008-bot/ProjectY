'use strict';
(()=>{
  if(window.__yosBrowserBottomV38)return;
  window.__yosBrowserBottomV38=true;
  const root=document.documentElement;
  const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const apply=()=>{
    if(isStandalone()){
      root.style.setProperty('--yos-browser-bottom','0px');
      root.classList.add('yos-standalone-mode');
      root.classList.remove('yos-browser-mode');
      return;
    }
    root.classList.add('yos-browser-mode');
    root.classList.remove('yos-standalone-mode');
    const vv=window.visualViewport;
    const measured=vv?Math.max(0,Math.round(window.innerHeight-vv.height-vv.offsetTop)):0;
    const extra=Math.min(150,Math.max(96,measured));
    root.style.setProperty('--yos-browser-bottom',`${extra}px`);
  };
  apply();
  window.addEventListener('resize',apply,{passive:true});
  window.addEventListener('orientationchange',()=>setTimeout(apply,250),{passive:true});
  window.visualViewport?.addEventListener('resize',apply,{passive:true});
  window.visualViewport?.addEventListener('scroll',apply,{passive:true});
})();