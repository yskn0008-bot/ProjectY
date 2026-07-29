'use strict';
(()=>{
  if(window.__yosManageFillV75)return;
  window.__yosManageFillV75=true;

  let raf=0;

  const isManage=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='manage'||document.body?.dataset.calendarPage==='manage';
  };

  function fit(){
    raf=0;
    if(!isManage())return;

    const main=document.querySelector('main.app');
    const toolbar=main?.querySelector('.toolbar');
    const manage=document.getElementById('manageViewV21');
    if(!main||!toolbar||!manage)return;

    const mainRect=main.getBoundingClientRect();
    const toolbarRect=toolbar.getBoundingClientRect();
    const top=Math.max(0,Math.ceil(toolbarRect.bottom-mainRect.top+6));

    main.style.setProperty('--manage-top-v75',`${top}px`);
    manage.style.removeProperty('height');
    manage.style.removeProperty('max-height');
    manage.style.removeProperty('--manage-view-v73-height');
    manage.style.removeProperty('--manage-view-v74-height');
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
    attributes:true,
    attributeFilter:['class','data-calendar-page']
  });

  schedule();
  setTimeout(schedule,200);
  setTimeout(schedule,700);
})();