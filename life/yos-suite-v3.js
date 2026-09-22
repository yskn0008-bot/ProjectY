'use strict';
(()=>{
  const app=document.querySelector('main.app');
  const initialNav=document.querySelector('.bottom-nav');
  if(app)app.style.visibility='hidden';
  if(initialNav)initialNav.style.visibility='hidden';
  let revealed=false;
  const finalReady=()=>Boolean(
    document.getElementById('lifePageHostV1') &&
    !document.querySelector('main.app .layout') &&
    document.getElementById('lifeBottomNavV1') &&
    document.querySelector('#lifePageHostV1 [data-page="home"]')
  );
  const reveal=()=>{
    if(revealed||!finalReady())return;
    revealed=true;
    document.getElementById('life-preinstall-guard')?.remove();
    if(app)app.style.visibility='visible';
    const nav=document.getElementById('lifeBottomNavV1');
    if(nav)nav.style.visibility='visible';
  };
  const waitForFinal=setInterval(()=>{
    if(finalReady()){
      clearInterval(waitForFinal);
      requestAnimationFrame(()=>requestAnimationFrame(reveal));
    }
  },16);
  // Never reveal the legacy Life UI while the final UI is still loading.
  // If final rendering fails, fail visibly instead of flashing the retired screen.
  setTimeout(()=>{
    clearInterval(waitForFinal);
    if(!revealed){
      const message=document.createElement('div');
      message.setAttribute('role','status');
      message.textContent='Lifeを読み込めませんでした。再読み込みしてください。';
      message.style.cssText='margin:calc(env(safe-area-inset-top) + 80px) 18px;padding:18px;border-radius:18px;background:#fff;color:#243142;text-align:center;font-weight:800';
      document.body.appendChild(message);
    }
  },8000);

  if(!document.getElementById('yosSuiteHomeV3')){
    const a=document.createElement('a');
    a.id='yosSuiteHomeV3';
    a.href='../yos/?menu=1';
    a.setAttribute('aria-label','共通メニューを開く');
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
    script.src='./home-v1.js?v=8';
    document.body.appendChild(script);
  }
  if(!document.getElementById('lifeDailyFlowOrchestratorV1Script')){
    const script=document.createElement('script');
    script.id='lifeDailyFlowOrchestratorV1Script';
    script.src='./daily-flow-orchestrator-v1.js?v=1';
    document.body.appendChild(script);
  }
  if(!document.getElementById('lifeNightCheckinBridgeV1Script')){
    const script=document.createElement('script');
    script.id='lifeNightCheckinBridgeV1Script';
    script.src='./night-checkin-life-bridge-v1.js?v=1';
    document.body.appendChild(script);
  }
  if(!document.getElementById('lifeTaskQuickAddV1Script')){
    const script=document.createElement('script');
    script.id='lifeTaskQuickAddV1Script';
    script.src='./task-quick-add-v1.js?v=1';
    document.body.appendChild(script);
  }
})();
