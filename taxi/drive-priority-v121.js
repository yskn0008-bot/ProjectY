'use strict';
(()=>{
  if(window.__yosTaxiDrivePriorityV121)return;
  window.__yosTaxiDrivePriorityV121=true;

  const root=document.documentElement;
  let raf=0;

  const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;

  function apply(){
    raf=0;
    const page=document.querySelector('#yosReferencePerfectV111 .rp-page-drive');
    const nav=document.getElementById('taxiGlobalNavV24');
    if(!page||!nav)return;

    root.classList.add('yos-drive-priority-v121');

    /* iOSの固定要素は表示領域基準。ブラウザ下部補正を二重に足さない。 */
    nav.style.setProperty('bottom',standalone()?'calc(env(safe-area-inset-bottom) + 4px)':'4px','important');

    const metrics=page.querySelector('.rp-three-metrics');
    const action=page.querySelector('.rp-action-card');
    const status=page.querySelector('.rp-status-card');

    /* 売上 → YOS判断 → KPI → 主操作 → 現在状況 の順。 */
    if(metrics&&action&&metrics.nextElementSibling!==action){
      metrics.insertAdjacentElement('afterend',action);
    }

    /* 平均単価はKPI側に表示済みなので重複を削除する。 */
    status?.querySelectorAll('dl>div').forEach(row=>{
      if(row.querySelector('dt')?.textContent?.trim()==='平均単価')row.remove();
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
  setInterval(schedule,900);
})();
