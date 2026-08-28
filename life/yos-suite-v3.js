'use strict';
(()=>{
  if(!document.getElementById('yosSuiteHomeV3')){
    const a=document.createElement('a');
    a.id='yosSuiteHomeV3';
    a.href='../yos/';
    a.setAttribute('aria-label','YOSへ戻る');
    a.textContent='≡';
    a.style.cssText='position:fixed;z-index:9996;right:16px;top:calc(env(safe-area-inset-top) + 10px);display:flex;align-items:center;justify-content:center;width:38px;height:38px;border:1px solid #e6e0d5;border-radius:13px;background:#fffefa;color:#2f3431;text-decoration:none;font-size:22px;font-weight:800';
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
    script.src='./home-v1.js?v=6';
    document.body.appendChild(script);
  }
})();
