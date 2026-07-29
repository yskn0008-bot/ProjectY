'use strict';
(()=>{
  if(window.__yosManageNavFitV78)return;
  window.__yosManageNavFitV78=true;

  let raf=0;
  let lastHeight=-1;

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

    manage.style.removeProperty('height');
    manage.style.removeProperty('min-height');
    manage.style.removeProperty('max-height');

    const manageTop=Math.round(manage.getBoundingClientRect().top);
    const navTop=Math.round(nav.getBoundingClientRect().top);
    const height=Math.floor(navTop-manageTop-1);
    if(height<300)return;

    if(height!==lastHeight){
      lastHeight=height;
      main.style.setProperty('--manage-view-v78-height',`${height}px`);
      manage.style.setProperty('height',`${height}px`,'important');
      manage.style.setProperty('min-height',`${height}px`,'important');
      manage.style.setProperty('max-height',`${height}px`,'important');
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
    attributes:true,
    attributeFilter:['class','data-calendar-page']
  });

  const wait=setInterval(schedule,100);
  setTimeout(()=>clearInterval(wait),5000);
  schedule();
  setTimeout(schedule,250);
  setTimeout(schedule,800);
})();