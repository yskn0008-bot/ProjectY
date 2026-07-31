'use strict';
(()=>{
  if(window.__yosTaxiDriveFinalV124)return;
  window.__yosTaxiDriveFinalV124=true;

  const root=document.documentElement;
  let raf=0;
  let first=true;

  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;

  function rowValue(status,label){
    const row=[...(status?.querySelectorAll('dl>div')||[])].find(item=>item.querySelector('dt')?.textContent?.trim()===label);
    return row?.querySelector('dd')?.textContent?.trim()||'未確認';
  }

  function apply(){
    raf=0;
    const page=document.querySelector('#yosReferencePerfectV111 .rp-page-drive');
    const nav=document.getElementById('taxiGlobalNavV24');
    const sales=page?.querySelector('.rp-sales-card');
    const status=page?.querySelector('.rp-status-card');
    const primary=sales?.querySelector('.rp-primary-action');
    if(!page||!nav||!sales||!status||!primary)return;

    root.classList.add('yos-drive-final-v124');

    const values={
      state:rowValue(status,'状態'),
      area:rowValue(status,'エリア'),
      idle:rowValue(status,'空車時間')
    };

    let strip=sales.querySelector('.yf-state-strip-v124');
    if(!strip){
      strip=document.createElement('div');
      strip.className='yf-state-strip-v124';
      primary.insertAdjacentElement('beforebegin',strip);
    }
    const markup=`<span><small>状態</small><b>${values.state}</b></span><span><small>エリア</small><b>${values.area}</b></span><span><small>空車時間</small><b>${values.idle}</b></span>`;
    if(strip.innerHTML!==markup)strip.innerHTML=markup;

    const wanted=standalone()?'calc(env(safe-area-inset-bottom) + 4px)':'4px';
    if(nav.style.getPropertyValue('bottom')!==wanted){
      nav.style.setProperty('bottom',wanted,'important');
    }

    requestAnimationFrame(()=>{
      const pageTop=Math.round(page.getBoundingClientRect().top);
      const navTop=Math.round(nav.getBoundingClientRect().top);
      const available=Math.max(320,navTop-pageTop-6);
      page.style.setProperty('--yd-scroll-height',`${available}px`);
      if(first){first=false;page.scrollTop=0}
    });
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(apply));
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();

  const observer=new MutationObserver(schedule);
  observer.observe(document.body||document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule,{passive:true});
  addEventListener('orientationchange',()=>setTimeout(schedule,180),{passive:true});
  window.visualViewport?.addEventListener('resize',schedule,{passive:true});
  window.visualViewport?.addEventListener('scroll',schedule,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  setInterval(schedule,900);
})();
