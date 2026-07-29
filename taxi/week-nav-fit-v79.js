'use strict';
(()=>{
  if(window.__yosWeekNavFitV79)return;
  window.__yosWeekNavFitV79=true;

  let raf=0;
  let lastHeight=-1;

  const isWeek=()=>{
    const query=new URLSearchParams(location.search).get('page');
    return query==='week'||document.body?.dataset.calendarPage==='week';
  };

  function fit(){
    raf=0;
    if(!isWeek())return;

    const main=document.querySelector('main.app');
    const view=document.getElementById('weekView');
    const nav=document.getElementById('taxiGlobalNavV24');
    if(!main||!view||!nav)return;

    view.style.removeProperty('height');
    view.style.removeProperty('min-height');
    view.style.removeProperty('max-height');

    const viewTop=Math.round(view.getBoundingClientRect().top);
    const navTop=Math.round(nav.getBoundingClientRect().top);
    const height=Math.floor(navTop-viewTop-1);
    if(height<320)return;

    if(height!==lastHeight){
      lastHeight=height;
      main.style.setProperty('--week-view-v79-height',`${height}px`);
      view.style.setProperty('height',`${height}px`,'important');
      view.style.setProperty('min-height',`${height}px`,'important');
      view.style.setProperty('max-height',`${height}px`,'important');
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