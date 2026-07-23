'use strict';
(()=>{
  if(!document.getElementById('yosSuiteHomeV3')){
    const a=document.createElement('a');
    a.id='yosSuiteHomeV3';
    a.href='../yos/';
    a.setAttribute('aria-label','YOSへ戻る');
    a.textContent='YOS';
    a.style.cssText='position:fixed;z-index:9996;right:12px;bottom:calc(env(safe-area-inset-bottom) + 78px);display:flex;align-items:center;justify-content:center;min-width:54px;height:40px;padding:0 12px;border:1px solid rgba(255,120,104,.26);border-radius:999px;background:rgba(255,255,255,.88);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);box-shadow:0 10px 30px rgba(70,58,40,.16);color:#d95f50;text-decoration:none;font-size:11px;font-weight:1000;letter-spacing:.04em';
    document.body.appendChild(a);
    const sync=()=>{
      const dialogOpen=!!document.querySelector('dialog[open]');
      a.style.opacity=dialogOpen?'.18':'1';
      a.style.pointerEvents=dialogOpen?'none':'auto';
    };
    new MutationObserver(sync).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open']});
    sync();
  }
  if(!document.getElementById('lifeHomeV1Script')){
    const script=document.createElement('script');
    script.id='lifeHomeV1Script';
    script.src='./home-v1.js?v=1';
    document.body.appendChild(script);
  }
})();
