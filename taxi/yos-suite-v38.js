'use strict';
(()=>{
  const root=document.documentElement;
  const isStandalone=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const syncViewportBottom=()=>{
    let inset=0;
    if(!isStandalone){
      const vv=window.visualViewport;
      const measured=vv?Math.max(0,window.innerHeight-vv.height-vv.offsetTop):0;
      inset=Math.min(180,Math.max(96,measured));
    }
    root.style.setProperty('--yos-browser-bottom',`${Math.round(inset)}px`);
  };
  syncViewportBottom();
  window.addEventListener('resize',syncViewportBottom,{passive:true});
  window.addEventListener('orientationchange',syncViewportBottom,{passive:true});
  window.visualViewport?.addEventListener('resize',syncViewportBottom,{passive:true});
  window.visualViewport?.addEventListener('scroll',syncViewportBottom,{passive:true});

  if(document.getElementById('yosSuiteHomeV38'))return;
  const a=document.createElement('a');
  a.id='yosSuiteHomeV38';
  a.href='../yos/';
  a.setAttribute('aria-label','YOSへ戻る');
  a.textContent='YOS';
  a.style.cssText='position:fixed;z-index:9996;right:12px;bottom:calc(env(safe-area-inset-bottom) + var(--yos-browser-bottom,0px) + 82px);display:flex;align-items:center;justify-content:center;min-width:54px;height:40px;padding:0 12px;border:1px solid rgba(255,179,35,.32);border-radius:999px;background:rgba(10,10,13,.86);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 10px 30px rgba(0,0,0,.28);color:#ffd17a;text-decoration:none;font-size:11px;font-weight:1000;letter-spacing:.04em';
  document.body.appendChild(a);
  const sync=()=>{
    const dialogOpen=!!document.querySelector('dialog[open]');
    a.style.opacity=dialogOpen?'.18':'1';
    a.style.pointerEvents=dialogOpen?'none':'auto';
  };
  new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
  sync();
})();