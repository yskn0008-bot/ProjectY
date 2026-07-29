'use strict';
(()=>{
  if(window.__yosManageGrowV73)return;
  window.__yosManageGrowV73=true;

  let raf=0;
  let lastApp=0;
  let lastView=0;

  const isManage=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='manage'||document.body?.dataset.calendarPage==='manage';
  };

  function fit(){
    raf=0;
    if(!isManage())return;

    const main=document.querySelector('main.app');
    const manage=document.getElementById('manageViewV21');
    const nav=document.getElementById('taxiGlobalNavV24');
    if(!main||!manage||!nav)return;

    main.style.removeProperty('--manage-app-v73-height');
    manage.style.removeProperty('--manage-view-v73-height');

    const mainTop=main.getBoundingClientRect().top;
    const manageTop=manage.getBoundingClientRect().top;
    const navTop=nav.getBoundingClientRect().top;
    const appHeight=Math.max(320,Math.floor(navTop-mainTop-1));
    const viewHeight=Math.max(240,Math.floor(navTop-manageTop-1));

    if(Math.abs(appHeight-lastApp)>1){
      main.style.setProperty('--manage-app-v73-height',`${appHeight}px`);
      lastApp=appHeight;
    }else{
      main.style.setProperty('--manage-app-v73-height',`${lastApp}px`);
    }

    if(Math.abs(viewHeight-lastView)>1){
      manage.style.setProperty('--manage-view-v73-height',`${viewHeight}px`);
      lastView=viewHeight;
    }else{
      manage.style.setProperty('--manage-view-v73-height',`${lastView}px`);
    }

    const summary=manage.querySelector('.summary');
    const actions=manage.querySelector('.manage-actions-v21');
    if(summary&&actions){
      const overlap=summary.getBoundingClientRect().bottom-actions.getBoundingClientRect().top;
      if(overlap>0){
        const safe=Math.max(220,viewHeight-Math.ceil(overlap)-1);
        manage.style.setProperty('--manage-view-v73-height',`${safe}px`);
        lastView=safe;
      }
    }
  }

  function schedule(){
    if(raf)return;
    raf=requestAnimationFrame(()=>requestAnimationFrame(fit));
  }

  addEventListener('pageshow',schedule);
  addEventListener('resize',schedule);
  addEventListener('orientationchange',schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
  window.visualViewport?.addEventListener('resize',schedule);
  window.visualViewport?.addEventListener('scroll',schedule);

  new MutationObserver(schedule).observe(document.documentElement,{
    childList:true,
    subtree:true,
    characterData:true,
    attributes:true,
    attributeFilter:['class','data-calendar-page']
  });

  schedule();
  setTimeout(schedule,200);
  setTimeout(schedule,700);
  setInterval(schedule,2000);
})();
