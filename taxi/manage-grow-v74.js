'use strict';
(()=>{
  if(window.__yosManageGrowV74)return;
  window.__yosManageGrowV74=true;

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
    main.style.removeProperty('--manage-app-v74-height');
    manage.style.removeProperty('--manage-view-v73-height');
    manage.style.removeProperty('--manage-view-v74-height');

    const mainTop=main.getBoundingClientRect().top;
    const manageTop=manage.getBoundingClientRect().top;
    const navTop=nav.getBoundingClientRect().top;
    const appHeight=Math.max(320,Math.floor(navTop-mainTop-1));
    const viewHeight=Math.max(260,Math.floor(navTop-manageTop-1));

    lastApp=Math.abs(appHeight-lastApp)>1?appHeight:lastApp||appHeight;
    lastView=Math.abs(viewHeight-lastView)>1?viewHeight:lastView||viewHeight;
    main.style.setProperty('--manage-app-v73-height',`${lastApp}px`);
    main.style.setProperty('--manage-app-v74-height',`${lastApp}px`);
    manage.style.setProperty('--manage-view-v73-height',`${lastView}px`);
    manage.style.setProperty('--manage-view-v74-height',`${lastView}px`);

    const summary=manage.querySelector('.summary');
    const actions=manage.querySelector('.manage-actions-v21,.actions,.manage-actions');
    if(summary&&actions){
      const overlap=summary.getBoundingClientRect().bottom-actions.getBoundingClientRect().top;
      if(overlap>0){
        const safe=Math.max(240,lastView-Math.ceil(overlap)-1);
        lastView=safe;
        manage.style.setProperty('--manage-view-v73-height',`${safe}px`);
        manage.style.setProperty('--manage-view-v74-height',`${safe}px`);
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
